// Elektrická síť v prohlížeči: modely kabelů a zařízení, jejich svícení a okno se stavem sítě.
import './furnace.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { BLOCKS } from '../../../shared/data/index.js';
import { BAT_CAP, BAT_RATE, CHARGE_TIME, DIRS6, EFURNACE_TIME, demandOf, elecOf, flipSwitch, netOf, netStats, powerOf, sunLevel } from '../../../shared/sim/power.js';
import { clamp } from '../../../shared/util.js';
import { bkey, blocks, power } from '../../../shared/world/state.js';
import { topY } from '../../../shared/world/voxels.js';
import { Sound } from '../audio/sound.js';
import { buildComputerModel, drawPCScreen } from '../pc/computer.js';
import { buildPrinterModel, printerDev } from '../pc/printer.js';
import { specials } from '../render/blocks.js';
import { dummy } from '../render/forest.js';
import { LK } from '../render/look.js';
import { U as UNI, scene } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { iconImg, slotHTML, ui } from '../ui/inventory-ui.js';

// ============================================================ elektrická síť
// Pravidla sítě (výroba, spotřeba, baterie, vypínač, tiskárna) jsou v shared/sim/power.js; tady jsou modely a okno zařízení.

// ---------- vykreslení kabelů: středový uzel + ramena k sousedním elektrickým blokům (InstancedMesh)
const cableMats = {
  copper: new THREE.MeshStandardMaterial({ color: 0xc8743a, metalness: 0.6, roughness: 0.4 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xf2c440, metalness: 0.8, roughness: 0.3 }),
};
// Futuristické kabely (vzhled s LK.neon): kudy teče proud, běží po kabelu svítící pulzy (rychlost podle odběru sítě).
// aPow = 0 bez proudu, jinak 0,3–1 podle toho, kolik síť právě odebírá.
const NEON = { copper: 0x2ae8ff, gold: 0xff4ad8 };
if (LK.neon) for (const [name, m] of Object.entries(cableMats)) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = UNI.time;
    sh.uniforms.uNeon = { value: new THREE.Color(NEON[name]).multiplyScalar(LK.neon) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aPow;
varying float vPow;
varying vec3 vCW;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vPow = aPow;
vCW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform vec3 uNeon;
varying float vPow;
varying vec3 vCW;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (vPow > 0.0) {
          float run = fract((vCW.x + vCW.y + vCW.z) * 1.5 - uTime * (0.8 + 2.4 * vPow));
          totalEmissiveRadiance += uNeon * vPow * (0.25 + 2.2 * smoothstep(0.75, 1.0, run));
        }`);
  };
}
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
    push(`${B.cable}|c`, [dummy.matrix.clone(), k]);
    DIRS6.forEach(([dx, dy, dz], i) => {
      if (!elecOf(blocks.get(bkey(x + dx, y + dy, z + dz)))) return;
      dummy.rotation.set(...ARM_ROT[i]);
      dummy.updateMatrix();
      push(`${B.cable}|a`, [dummy.matrix.clone(), k]);
    });
  }
  for (const [key, list] of lists) {
    let m = cablePool.get(key);
    if (!m || m.instanceMatrix.count < list.length) {
      if (m) { scene.remove(m); m.dispose(); }
      const [mat, part] = key.split('|');
      const n = Math.max(64, Math.ceil(list.length * 1.5));
      m = new THREE.InstancedMesh(cableGeos[part].clone(), cableMats[mat], n);
      m.geometry.setAttribute('aPow', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      m.frustumCulled = false;
      scene.add(m);
      cablePool.set(key, m);
    }
    list.forEach(([mt], i) => m.setMatrixAt(i, mt));
    m.userData.keys = list.map(([, k]) => k);
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
let neonT = 0;
export function updatePowerVisuals(dt, time) {
  if (LK.neon && (neonT -= dt) <= 0) { // proud v kabelech (4× za sekundu stačí)
    neonT = 0.25;
    for (const m of cablePool.values()) {
      const a = m.geometry.getAttribute('aPow'), keys = m.userData.keys || [];
      for (let i = 0; i < keys.length; i++) { const st = netStats(keys[i]); a.array[i] = st && st[1] > 0 ? 0.3 + 0.7 * Math.min(1, st[1] / Math.max(1, st[4] * 0.5)) : 0; }
      a.needsUpdate = true;
    }
  }
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
  const on = flipSwitch(k);
  Sound.place();
  toast(on ? 'Vypínač zapnut' : 'Vypínač vypnut – síť rozpojena');
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
