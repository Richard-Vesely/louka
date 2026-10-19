// Elektrická síť: kabely, zdroje, baterie, spotřebiče.
import './furnace.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { Sound } from '../audio/sound.js';
import { NET, isBusy } from '../game/boot.js';
import { save } from '../game/save-load.js';
import { buildComputerModel, drawPCScreen } from '../pc/computer.js';
import { buildPrinterModel, printStep, printerDev, printerReady } from '../pc/printer.js';
import { bkey, specials } from '../render/blocks.js';
import { dummy } from '../render/forest.js';
import { scene } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { iconImg, invOpen, renderCraftArea, slotHTML, ui } from '../ui/inventory-ui.js';
import { blocks, crafted } from '../world/world-state.js';
import { BLOCKS, FUEL, ITEMS, smeltResult } from '../../../shared/data/index.js';
import { clamp } from '../../../shared/util.js';
import { topY } from '../../../shared/world/voxels.js';

// ============================================================ elektrická síť
// Síť = souvislá skupina elektrických bloků (kabely a zařízení, která se dotýkají stěnou). Vypnutý vypínač síť rozpojí.
// Tvar sítí se přepočítá jen při změně bloků (powerDirty), energie se počítá 4× za sekundu:
// výroba (generátory + slunce, omezená kapacitou kabelů) -> spotřebiče podle pořadí; přebytek nabíjí baterie, nedostatek z nich čerpá.
// Když energie nestačí, zařízení, na která nezbude, se vypnou.
export const power = new Map(Object.entries(save?.power || {})); // klíč bloku -> stav zařízení (palivo, energie baterie, vypínač, napájení…)
export const elecOf = (type) => BLOCKS[type]?.elec;
const BAT_CAP = 20000, BAT_RATE = 120, GEN_FUEL_MUL = 3, EFURNACE_TIME = 2, CHARGE_TIME = 10;
export function powerOf(k) {
  if (!power.has(k)) {
    const t = blocks.get(k), e = elecOf(t) || {};
    power.set(k, e.gen ? { slots: [null], burn: 0, burnMax: 0, pw: 0 } : e.store ? { e: 0, pw: 0 } : e.switch ? { on: true }
      : t === 'electric_furnace' || t === 'charger' ? { slots: [null, null], t: 0, pw: 0 } : t === 'printer' ? { slots: [null, null, null, null], q: [], t: 0, pw: 0 } : { pw: 0 });
  }
  return power.get(k);
}
export const isPowered = (k) => !!power.get(k)?.pw;
const DIRS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export let powerDirty = true, nets = [];
export function markPowerDirty() { powerDirty = true; }
export const netOf = new Map(); // klíč bloku -> síť
export function rebuildNets() {
  powerDirty = false;
  nets = [];
  netOf.clear();
  const nodes = new Map();
  for (const [k, t] of blocks) {
    const e = elecOf(t);
    if (e && !(e.switch && power.get(k)?.on === false)) nodes.set(k, e);
  }
  for (const k0 of nodes.keys()) {
    if (netOf.has(k0)) continue;
    const net = { keys: [], cables: 0, cap: Infinity, gens: [], solars: [], bats: [], users: [], stats: null };
    netOf.set(k0, net);
    const stack = [k0];
    while (stack.length) {
      const k = stack.pop(), e = nodes.get(k);
      net.keys.push(k);
      if (e.cable) { net.cables++; net.cap = Math.min(net.cap, e.cap); }
      if (e.gen) net.gens.push(k);
      if (e.solar) net.solars.push(k);
      if (e.store) net.bats.push(k);
      if (e.use) net.users.push(k);
      const [x, y, z] = k.split(',').map(Number);
      for (const [dx, dy, dz] of DIRS6) {
        const n = bkey(x + dx, y + dy, z + dz);
        if (nodes.has(n) && !netOf.has(n)) { netOf.set(n, net); stack.push(n); }
      }
    }
    if (!isFinite(net.cap)) net.cap = 1000; // zařízení spojená přímo, bez kabelu
    net.users.sort(); // pevné pořadí: při nedostatku se vypínají vždy stejná zařízení
    nets.push(net);
  }
}
// Kolik zařízení teď chce (pec a nabíječka jen když mají co dělat, lampy a motor pořád)
function demandOf(k, t) {
  const st = powerOf(k), use = elecOf(t).use;
  if (t === 'electric_furnace') { const [i, o] = st.slots, r = i && smeltResult(i.id); return r && (!o || (o.id === r && o.n < ITEMS[r].stack)) ? use : 0; }
  if (t === 'computer') return st.pc ? use : 0;
  if (t === 'printer') return printerReady(st) ? use : 0; // jen při tisku // počítač bere proud jen zapnutý
  if (t === 'charger') { const [i, o] = st.slots; return i?.id === 'car_battery_empty' && (!o || (o.id === 'car_battery' && o.n < ITEMS.car_battery.stack)) ? use : 0; }
  return use;
}
let powerT = 0, sunLevel = 1;
export function updatePower(dt, sun) {
  sunLevel = sun;
  if (powerDirty) rebuildNets();
  if ((powerT += dt) < 0.25) return;
  const step = powerT;
  powerT = 0;
  if (!NET.client) for (const net of nets) simulateNet(net, step, sun); // energii počítá hostitel (ve hře pro jednoho hra sama)
  if (invOpen && ui.mode === 'power') renderCraftArea();
}
function simulateNet(net, step, sun) {
  let solar = 0;
  for (const k of net.solars) { const [x, y, z] = k.split(',').map(Number); if (y >= topY(x, z)) solar += elecOf('solar_panel').solar * sun; } // pod zemí panel nevyrábí
  const demands = net.users.map((k) => [k, demandOf(k, blocks.get(k))]);
  const demand = demands.reduce((s, [, d]) => s + d, 0);
  let stored = 0, room = 0;
  for (const b of net.bats) { const st = powerOf(b); stored += st.e; room += BAT_CAP - st.e; }
  // generátor spaluje palivo jen když je energie potřeba (spotřeba nebo nenabité baterie)
  const wantGen = demand > solar || room > 1;
  let gen = 0;
  for (const g of net.gens) {
    const st = powerOf(g);
    if (st.burn > 0) st.burn = Math.max(0, st.burn - step);
    if (st.burn <= 0 && wantGen && !isBusy(g)) { const f = st.slots[0]; if (f && FUEL[f.id]) { st.burn = st.burnMax = FUEL[f.id] * GEN_FUEL_MUL; if (!--f.n) st.slots[0] = null; } }
    st.pw = st.burn > 0 ? 1 : 0;
    if (st.pw) gen += elecOf('coal_generator').gen;
  }
  const supply = Math.min(gen + solar, net.cap);
  const batOut = Math.min(BAT_RATE * net.bats.length, stored / step, net.cap);
  let rem = supply + batOut, used = 0;
  for (const [k, d] of demands) {
    const st = powerOf(k), on = d > 0 && d <= rem + 1e-6;
    st.pw = on ? 1 : 0;
    if (on) { rem -= d; used += d; }
  }
  // baterie: rozdíl výroby a spotřeby (nabíjení i vybíjení rozdělí rovnoměrně)
  const flow = used > supply ? -(used - supply) : Math.min(supply - used, BAT_RATE * net.bats.length);
  if (net.bats.length) {
    let delta = (flow * step) / net.bats.length;
    for (const b of net.bats) { const st = powerOf(b); st.e = Math.round(clamp(st.e + delta, 0, BAT_CAP)); st.pw = st.e > 0 ? 1 : 0; }
  }
  // práce spotřebičů
  for (const [k] of demands) {
    const t = blocks.get(k), st = powerOf(k);
    if (t === 'computer' && st.pc) { st.lost = st.pw ? 0 : (st.lost || 0) + step; if (st.lost > 1.5) { st.pc = false; st.lost = 0; st.cut = 1; } } // bez proudu se vypne
    if (!st.pw || !st.slots || isBusy(k)) continue; // okno zařízení má otevřené hráč
    if (t === 'printer') { printStep(st, step); continue; }
    const [i, o] = st.slots;
    st.t = (st.t || 0) + step;
    if (t === 'electric_furnace' && st.t >= EFURNACE_TIME) {
      st.t = 0;
      const r = smeltResult(i.id);
      if (!--i.n) st.slots[0] = null;
      if (o) o.n++; else st.slots[1] = { id: r, n: 1 };
      crafted[r] = true;
    } else if (t === 'charger' && st.t >= CHARGE_TIME) {
      st.t = 0;
      if (!--i.n) st.slots[0] = null;
      if (o) o.n++; else st.slots[1] = { id: 'car_battery', n: 1 };
    }
  }
  stored = net.bats.reduce((s, b) => s + powerOf(b).e, 0);
  // přehled sítě se uloží do stavu každého zařízení (klient ho pak ukazuje stejně jako hostitel)
  const stats = [Math.round(gen + solar), Math.round(used), Math.round(demand), Math.round(stored), net.cap, BAT_CAP * net.bats.length];
  net.stats = stats;
  for (const k of net.keys) if (!elecOf(blocks.get(k)).cable && !elecOf(blocks.get(k)).switch) powerOf(k).net = stats;
}
// Přehled sítě, do které patří blok (u klienta z kteréhokoli zařízení sítě)
export function netStats(k) {
  const net = netOf.get(k);
  if (!net) return null;
  if (net.stats) return net.stats;
  for (const n of net.keys) { const s = power.get(n)?.net; if (s) return s; }
  return null;
}

// ---------- vykreslení kabelů: středový uzel + ramena k sousedním elektrickým blokům (InstancedMesh)
const cableMats = {
  copper: new THREE.MeshStandardMaterial({ color: 0xc8743a, metalness: 0.6, roughness: 0.4 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xf2c440, metalness: 0.8, roughness: 0.3 }),
};
const cableGeos = { c: new THREE.BoxGeometry(0.2, 0.2, 0.2), a: new THREE.BoxGeometry(0.41, 0.12, 0.12).translate(0.295, 0, 0) };
const ARM_ROT = [[0, 0, 0], [0, Math.PI, 0], [0, 0, Math.PI / 2], [0, 0, -Math.PI / 2], [0, -Math.PI / 2, 0], [0, Math.PI / 2, 0]];
const cablePool = new Map();
export function rebuildCables() {
  const lists = new Map();
  const push = (key, m) => { if (!lists.has(key)) lists.set(key, []); lists.get(key).push(m); };
  for (const [k, t] of blocks) {
    const B = BLOCKS[t];
    if (!B.cable) continue;
    const [x, y, z] = k.split(',').map(Number);
    dummy.position.set(x + 0.5, y + 0.5, z + 0.5);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    push(`${B.cable}|c`, dummy.matrix.clone());
    DIRS6.forEach(([dx, dy, dz], i) => {
      if (!elecOf(blocks.get(bkey(x + dx, y + dy, z + dz)))) return;
      dummy.rotation.set(...ARM_ROT[i]);
      dummy.updateMatrix();
      push(`${B.cable}|a`, dummy.matrix.clone());
    });
  }
  for (const [key, list] of lists) {
    let m = cablePool.get(key);
    if (!m || m.instanceMatrix.count < list.length) {
      if (m) { scene.remove(m); m.dispose(); }
      const [mat, part] = key.split('|');
      m = new THREE.InstancedMesh(cableGeos[part], cableMats[mat], Math.max(64, Math.ceil(list.length * 1.5)));
      m.frustumCulled = false;
      scene.add(m);
      cablePool.set(key, m);
    }
    list.forEach((mt, i) => m.setMatrixAt(i, mt));
    m.count = list.length;
    m.instanceMatrix.needsUpdate = true;
  }
  for (const [key, m] of cablePool) if (!lists.has(key)) m.count = 0;
}

// ---------- modely zařízení (volá buildSpecial); přední strana je +z
export function buildElecModel(type, g) {
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, ...o });
  const box = (w, h, d, m, x, y, z, parent = g) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); parent.add(me); return me; };
  const steel = M({ color: 0x8a96a4, metalness: 0.7, roughness: 0.35 }), dark = M({ color: 0x2a2a30 });
  const glowMat = (c) => M({ color: 0x222222, emissive: c, emissiveIntensity: 0 });
  const U = g.userData;
  if (type === 'coal_generator') {
    box(0.9, 0.8, 0.9, steel, 0, 0.4, 0);
    for (let i = 0; i < 4; i++) box(0.6, 0.04, 0.02, dark, 0, 0.55 + i * 0.07, 0.46);
    U.glow = box(0.4, 0.16, 0.02, glowMat(0xff6a1a), 0, 0.22, 0.46).material;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), dark);
    pipe.position.set(-0.28, 1.05, -0.25);
    g.add(pipe);
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 14), M({ color: 0xc8743a, metalness: 0.6 }));
    coil.rotation.z = Math.PI / 2;
    coil.position.set(0.5, 0.45, 0);
    g.add(coil);
  } else if (type === 'solar_panel') {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 8), steel);
    post.position.y = 0.27;
    g.add(post);
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const x2 = c.getContext('2d');
    x2.fillStyle = '#1a2a5a'; x2.fillRect(0, 0, 32, 32);
    x2.fillStyle = '#8aa0c8'; for (let i = 0; i <= 32; i += 8) { x2.fillRect(i, 0, 1, 32); x2.fillRect(0, i, 32, 1); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const panel = box(0.96, 0.04, 0.96, M({ map: tex, metalness: 0.4, roughness: 0.2 }), 0, 0.6, 0);
    panel.rotation.x = 0.45; // nakloněný ke slunci
  } else if (type === 'battery_block') {
    box(0.8, 0.9, 0.8, M({ color: 0x2e3a2e }), 0, 0.45, 0);
    box(0.3, 0.06, 0.12, M({ color: 0xd8783a, metalness: 0.6 }), -0.2, 0.93, 0);
    box(0.3, 0.06, 0.12, M({ color: 0xc8c8c8, metalness: 0.6 }), 0.2, 0.93, 0);
    U.bars = [0, 1, 2, 3, 4].map((i) => box(0.36, 0.1, 0.02, glowMat(0x3aff5a), 0, 0.15 + i * 0.14, 0.41));
  } else if (type === 'power_switch') {
    box(0.34, 0.06, 0.34, M({ color: 0xe8e4dc }), 0, 0.03, 0);
    const pivot = new THREE.Group();
    pivot.position.y = 0.06;
    g.add(pivot);
    box(0.06, 0.26, 0.06, dark, 0, 0.13, 0, pivot);
    box(0.1, 0.08, 0.1, M({ color: 0xd82a2a }), 0, 0.27, 0, pivot);
    U.lever = pivot;
  } else if (type === 'electric_lamp') {
    box(0.36, 0.05, 0.36, dark, 0, 0.025, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 8), dark);
    pole.position.y = 0.65;
    g.add(pole);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.24, 14, 1, true), M({ color: 0x3a5a3a, side: THREE.DoubleSide }));
    shade.position.y = 1.32;
    g.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), glowMat(0xfff0b0));
    bulb.position.y = 1.2;
    g.add(bulb);
    U.glow = bulb.material;
  } else if (type === 'bulb_lamp') {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), dark);
    cord.position.y = 0.79;
    g.add(cord);
    box(0.08, 0.08, 0.08, dark, 0, 0.56, 0);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), glowMat(0xfff0b0));
    bulb.position.y = 0.44;
    g.add(bulb);
    U.glow = bulb.material;
  } else if (type === 'motor_block') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.7, 16), steel);
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.45;
    g.add(body);
    for (let i = 0; i < 6; i++) box(0.02, 0.62, 0.66, dark, -0.34 + i * 0.136 * 0, 0.45, 0).rotation.z = (i / 6) * Math.PI;
    box(0.7, 0.1, 0.6, dark, 0, 0.05, 0);
    const shaft = new THREE.Group();
    shaft.position.set(0, 0.45, 0.4);
    g.add(shaft);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), M({ color: 0xd8d8d8, metalness: 0.9 }));
    sh.rotation.x = Math.PI / 2;
    shaft.add(sh);
    box(0.3, 0.06, 0.04, M({ color: 0xd82a2a }), 0, 0, 0.09, shaft);
    U.shaft = shaft;
  } else if (type === 'electric_furnace') {
    box(1, 1, 1, steel, 0, 0.5, 0);
    U.glow = box(0.55, 0.32, 0.02, glowMat(0xff7a2a), 0, 0.45, 0.505).material;
    U.led = box(0.06, 0.06, 0.02, glowMat(0x3aff5a), 0.36, 0.85, 0.505).material;
  } else if (type === 'charger') {
    box(0.7, 0.45, 0.6, M({ color: 0xe8e4dc, roughness: 0.6 }), 0, 0.225, 0);
    box(0.4, 0.04, 0.2, dark, 0, 0.46, -0.05);
    U.led = box(0.08, 0.06, 0.02, glowMat(0xffa020), 0.22, 0.32, 0.305).material;
  } else if (type === 'computer') buildComputerModel(g);
  else if (type === 'printer') buildPrinterModel(g);
}
// Vzhled zařízení podle stavu (svítí, točí se, ukazuje nabití)
export function updatePowerVisuals(dt, time) {
  for (const [k, s] of specials) {
    const e = elecOf(s.type);
    if (!e) continue;
    const st = power.get(k), U = s.obj.userData, on = !!st?.pw;
    if (U.glow) U.glow.emissiveIntensity = on ? (s.type === 'coal_generator' || s.type === 'electric_furnace' ? 1.3 + Math.sin(time * 9 + s.x) * 0.3 : 2.4) : 0;
    if (U.shaft && on) U.shaft.rotation.z += dt * 18;
    if (U.bars) U.bars.forEach((b, i) => (b.material.emissiveIntensity = (st?.e || 0) / BAT_CAP > i / 5 + 0.01 ? 1.6 : 0));
    if (U.lever) U.lever.rotation.x = st?.on === false ? 0.6 : -0.6;
    if (U.led) { U.led.emissiveIntensity = on ? 1.6 : 0.2; }
    if (U.screen) drawPCScreen(k, U.screen, st);
    if (U.sheet) { U.sheet.visible = on; if (on) U.sheet.position.z = 0.24 + ((time * 0.33) % 1) * 0.12; } // list vyjíždí z tiskárny
  }
}
// Pravé tlačítko na vypínač: zapnout / vypnout (síť se hned přepočítá)
export function toggleSwitch(k) {
  const st = powerOf(k);
  st.on = st.on === false;
  powerDirty = true;
  Sound.place();
  toast(st.on ? 'Vypínač zapnut' : 'Vypínač vypnut – síť rozpojena');
}
// Okno zařízení: stav sítě (výroba, spotřeba, baterie, kapacita) a ovládání zařízení
export function renderPowerUI(area) {
  const k = ui.fireKey, t = blocks.get(k);
  if (!t) { area.innerHTML = ''; return; }
  const e = elecOf(t), st = e.cable ? null : powerOf(k), net = netOf.get(k), s = netStats(k);
  const kj = (j) => (j / 1000).toFixed(1);
  const devs = net ? net.keys.length - net.cables : 0;
  let dev = '';
  const bar = (p, cls = '') => `<div class="parrow ${cls}" style="width:120px"><i style="width:${clamp(p, 0, 100)}%"></i></div>`;
  if (e.gen) dev = `<div class="fire-ui"><div class="fire-col">${slotHTML(st.slots[0], 0, '', 'power')}<div class="flame ${st.pw ? 'on' : ''}">${iconImg('campfire')}</div></div>
      <div>${bar(st.burnMax ? (st.burn / st.burnMax) * 100 : 0, 'fuelbar')}<div class="mc-note">${st.pw ? `Vyrábí ${e.gen} W` : st.slots[0] ? 'Stojí – síť teď energii nepotřebuje' : 'Stojí – vlož palivo (uhlí, dřevo, líh)'}</div></div></div>`;
  else if (e.solar) { const [x, y, z] = k.split(',').map(Number), lit = y >= topY(x, z); dev = `<div class="mc-note">Výkon teď: ${lit ? Math.round(e.solar * sunLevel) : 0} W z ${e.solar} W ${lit ? `(slunce ${Math.round(sunLevel * 100)} %)` : '– pod zemí nesvítí slunce'}</div>`; }
  else if (e.store) dev = `<div>${bar((st.e / BAT_CAP) * 100)}<div class="mc-note">Nabití: ${kj(st.e)} / ${kj(BAT_CAP)} kJ · nabíjí a vybíjí max. ${BAT_RATE} W</div></div>`;
  else if (t === 'printer') dev = printerDev(st);
  else if (t === 'electric_furnace' || t === 'charger') {
    const time = t === 'charger' ? CHARGE_TIME : EFURNACE_TIME;
    dev = `<div class="fire-ui">${slotHTML(st.slots[0], 0, '', 'power')}${bar(((st.t || 0) / time) * 100)}${slotHTML(st.slots[1], 1, 'out', 'power')}</div>
      <div class="mc-note">${t === 'charger' ? 'Vlož vybitou autobaterii, za 10 s je nabitá.' : 'Taví bez paliva, dvakrát rychleji než pec.'} ${st.pw ? 'Pracuje.' : demandOf(k, t) ? '<span style="color:#ff8a7a">Málo energie – stojí.</span>' : ''}</div>`;
  } else if (e.use) dev = `<div class="mc-note">Příkon ${e.use} W · ${st.pw ? 'zapnuto (napájeno)' : '<span style="color:#ff8a7a">bez energie</span>'}</div>`;
  const stats = !net ? '<div class="mc-note">Není připojeno k žádné síti.</div>' : !s ? '<div class="mc-note">Síť se počítá…</div>'
    : `<div class="power-stats">
        <div>⚡ Výroba <b>${s[0]} W</b></div><div>💡 Spotřeba <b>${s[1]} W</b>${s[2] > s[1] ? ` <span style="color:#ff8a7a">(chce ${s[2]} W)</span>` : ''}</div>
        <div>🔋 Baterie <b>${kj(s[3])} / ${kj(s[5])} kJ</b></div><div>〰 Kabely unesou <b>${s[4]} W</b></div>
        <div>Zařízení v síti: <b>${devs}</b> · kabelů ${net.cables}</div>
      </div>`;
  area.innerHTML = `<div class="mc-title">${BLOCKS[t].name}</div>${dev}<div class="mc-title" style="margin-top:8px">Elektrická síť</div>${stats}
    <div class="mc-note">Kabely spojují zařízení, která se dotýkají. Vypínač síť rozpojí. Měděný kabel unese ${elecOf('cable_copper').cap} W, zlatý ${elecOf('cable_gold').cap} W.</div>`;
}
