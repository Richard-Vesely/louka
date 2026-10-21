// Lodě: motorový člun a plachetnice. Modely, plutí po hladině (houpání na vlnách, mělčina u břehu), brázda a spršky.
// Plachetnici pohání vítr (shared/sim/weather.js windAt): stejný pro všechny hráče, takže plachty míří všem stejně.
// Proti větru plout nejde (plachta třepetá), nejrychleji to jede s větrem z boku. Jen funkce a konstanty (nic se nespouští při načtení).
import * as THREE from 'three';
import { dayCount, dayTime } from '../../../shared/sim/day.js';
import { windAt } from '../../../shared/sim/weather.js';
import { clamp } from '../../../shared/util.js';
import { solidAny } from '../../../shared/world/collision.js';
import { waterAt } from '../../../shared/world/nature.js';
import { terrainH } from '../../../shared/world/terrain.js';
import { Sound } from '../audio/sound.js';
import { input, keys, player } from '../player/player.js';
import { debris } from '../render/particles.js';
import { camera, scene } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { carCam, carLocal, carWarn, nitroOn } from './car.js';
import { powerMul } from './kinds.js';

// draft = ponor (jak hluboko je dno lodi pod hladinou); počátek lodi je na hladině
export const BOATS = {
  motorboat: { len: 5.2, wid: 2.0, maxFwd: 15, accel: 4.5, rev: 3.5, turn: 0.8, draft: 0.32 },
  sailboat: { len: 5.6, wid: 2.1, turn: 0.6, draft: 0.45 },
};
/** Výška hladiny v bodě, nebo null (souš). */
export const levelAt = (x, z) => waterAt(x, -1e9, z);
const depthAt = (x, z) => { const lv = levelAt(x, z); return lv === null ? -1 : lv - terrainH(x, z); };
const hullPts = (B) => [[0, -B.len / 2 + 0.2], [0, B.len / 2 - 0.15], [-B.wid / 2, 0.3], [B.wid / 2, 0.3], [-B.wid * 0.35, -B.len / 4], [B.wid * 0.35, -B.len / 4]];
/** Vejde se loď na vodu v bodě (hloubka pod celým trupem, žádný blok)? Vrátí '' nebo důvod. */
export function boatBlocker(type, x, z, yaw, lv) {
  const B = BOATS[type];
  for (const [lx, lz] of hullPts(B)) {
    const [px, pz] = carLocal({ x, z, yaw }, lx, lz);
    if (depthAt(px, pz) < B.draft + 0.08) return 'moc mělko nebo břeh';
    if (solidAny(Math.floor(px), Math.floor(lv), Math.floor(pz)) || solidAny(Math.floor(px), Math.floor(lv + 0.6), Math.floor(pz))) return 'překáží blok';
  }
  return '';
}
/** Místo pro spuštění lodi na vodu ve směru pohledu (do 14 m): { ok, x, y, z } nebo { ok: false, why }. */
export function boatSpot(type) {
  const o = camera.position, d = new THREE.Vector3();
  camera.getWorldDirection(d);
  let why = 'tady není voda – loď spusť na rybník nebo jezero';
  for (let t = 1.5; t < 14; t += 0.25) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t, lv = waterAt(x, y, z);
    if (lv === null) { if (y < terrainH(x, z) - 0.05) break; continue; }
    // loď sjede po vodě dál od břehu, až je pod ní dost hluboko (a není na hráči)
    for (let k = 0; k <= 24; k += 1.5) {
      const bx = x + d.x * k / Math.hypot(d.x, d.z || 1e-6), bz = z + d.z * k / Math.hypot(d.x, d.z || 1e-6), blv = levelAt(bx, bz);
      if (blv === null) continue;
      why = boatBlocker(type, bx, bz, player.yaw, blv);
      if (!why && Math.hypot(bx - player.pos.x, bz - player.pos.z) > 2) return { ok: true, x: bx, y: blv, z: bz };
    }
    break;
  }
  return { ok: false, why };
}

// ---------- modely: dopředu je -z, počátek na hladině
// Trup z půdorysu (špičatá příď): vytažený dolů, s dutinou nahoře (paluba s bočnicemi)
function hullGeo(len, wid, y0, y1, inset = 0) {
  const L = len / 2, W = wid / 2 - inset, s = new THREE.Shape();
  s.moveTo(-W, L - inset); s.lineTo(W, L - inset); s.lineTo(W, -L * 0.25);
  s.quadraticCurveTo(W * 0.95, -L * 0.8, 0, -L + inset * 1.5); s.quadraticCurveTo(-W * 0.95, -L * 0.8, -W, -L * 0.25); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10 });
  return g.rotateX(Math.PI / 2).translate(0, y1, 0); // tvar x–y → x–z, vytažení dolů od y1 k y0
}
function hullWalls(len, wid, y0, y1, t) {
  const L = len / 2, W = wid / 2, s = new THREE.Shape(), h = new THREE.Path();
  const outline = (p, w, l) => { p.moveTo(-w, l); p.lineTo(w, l); p.lineTo(w, -L * 0.25); p.quadraticCurveTo(w * 0.95, -L * 0.8, 0, -l); p.quadraticCurveTo(-w * 0.95, -L * 0.8, -w, -L * 0.25); p.closePath(); };
  outline(s, W, L); outline(h, W - t, L - t * 1.6);
  s.holes.push(h);
  return new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 10 }).rotateX(Math.PI / 2).translate(0, y1, 0);
}
const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, ...o });
const box = (g, w, h, d, m, x, y, z) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); g.add(me); return me; };
function buildMotorboat(color) {
  const B = BOATS.motorboat, g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.2, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  const white = M({ color: 0xf2f2ee, roughness: 0.35 }), dark = M({ color: 0x1e1e22, roughness: 0.8 }), deck = M({ color: 0xb08a5a, roughness: 0.7 }), chrome = M({ color: 0xd8dce2, metalness: 1, roughness: 0.18 });
  g.add(new THREE.Mesh(hullGeo(B.len, B.wid, -B.draft, 0.12), white));
  g.add(new THREE.Mesh(hullWalls(B.len, B.wid, 0.12, 0.6, 0.1), paint));
  g.add(new THREE.Mesh(hullGeo(B.len - 0.25, B.wid - 0.25, 0.1, 0.14), deck));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 0.05), M({ color: 0x1a2632, transparent: true, opacity: 0.5, depthWrite: false }));
  glass.position.set(0, 0.85, 0.25); glass.rotation.x = -0.5; g.add(glass);
  box(g, 0.7, 0.45, 0.4, white, -0.42, 0.37, 0.4); // pult s volantem
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 6, 16), dark);
  wheel.position.set(-0.42, 0.72, 0.62); wheel.rotation.x = -0.9; g.add(wheel);
  for (const [x, z] of [[-0.42, 0.9], [0.45, 0.9], [-0.42, -0.35], [0.45, -0.35]]) { box(g, 0.55, 0.14, 0.5, dark, x, 0.24, z); box(g, 0.55, 0.45, 0.1, dark, x, 0.45, z + 0.27); }
  // přívěsný motor (natáčí se kormidlem) s vrtulí
  const pivot = new THREE.Group(); pivot.position.set(0, 0.4, B.len / 2 + 0.05); g.add(pivot);
  box(pivot, 0.36, 0.55, 0.4, M({ color: 0x2a2e36, metalness: 0.4, roughness: 0.35 }), 0, 0.15, 0.12);
  box(pivot, 0.1, 0.9, 0.14, dark, 0, -0.45, 0.12);
  const prop = new THREE.Group(); prop.position.set(0, -0.8, 0.22); pivot.add(prop);
  for (let i = 0; i < 3; i++) { const b = box(prop, 0.06, 0.28, 0.02, chrome, 0, 0, 0); b.rotation.z = (i / 3) * Math.PI * 2; b.geometry.translate(0, 0.12, 0); }
  const head = M({ color: 0xfff8e0, emissive: 0xfff2c0, emissiveIntensity: 0 }), tail = M({ color: 0x6a1010, emissive: 0xff2010, emissiveIntensity: 0.25 });
  box(g, 0.25, 0.1, 0.05, head, 0, 0.5, -B.len / 2 + 0.25);
  box(g, 0.08, 0.08, 0.04, tail, -0.8, 0.55, B.len / 2 - 0.05); box(g, 0.08, 0.08, 0.04, tail, 0.8, 0.55, B.len / 2 - 0.05);
  // tyrkysové podsvícení pod čarou ponoru (jako u auta)
  const under = M({ color: 0x0b0d12, emissive: 0x38e8ff, emissiveIntensity: 0 });
  for (const x of [-0.98, 0.98]) box(g, 0.03, 0.04, 3.6, under, x, 0.02, 0.4);
  return { group: g, wheels: [], pivots: [pivot], head, tail, under, prop, boat: B };
}
// Plachta: trojúhelník z mřížky bodů, vydutý do strany podle větru; při třepetání se vlní
function sailGeo(nu = 8, nv = 10) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array((nu + 1) * (nv + 1) * 3), idx = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.userData = { nu, nv };
  return g;
}
// vrcholy: hlava (h), přední spodní roh (t), zadní spodní roh (c); vydutí b do strany x
function shapeSail(geo, h, t, c, b, flutter, time) {
  const { nu, nv } = geo.userData, p = geo.attributes.position.array;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const v = j / nv, u = i / nu, k = (j * (nu + 1) + i) * 3;
    // body podél spodku od t do c, nahoru se zužuje k hlavě
    const bx = t[0] + (c[0] - t[0]) * u, by = t[1] + (c[1] - t[1]) * u, bz = t[2] + (c[2] - t[2]) * u;
    const x = bx + (h[0] - bx) * v, y = by + (h[1] - by) * v, z = bz + (h[2] - bz) * v;
    const belly = Math.sin(Math.PI * u) * (1 - v * 0.85);
    const wave = flutter * Math.sin(time * 22 + u * 9 + v * 4) * belly;
    p[k] = x + b * belly + wave; p[k + 1] = y; p[k + 2] = z;
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}
function buildSailboat(color) {
  const B = BOATS.sailboat, g = new THREE.Group();
  const paint = M({ color, roughness: 0.35, metalness: 0.1 }), white = M({ color: 0xf2f2ee, roughness: 0.4 }), wood = M({ color: 0xa8784a, roughness: 0.65 }), dark = M({ color: 0x24242a, roughness: 0.7 });
  const cloth = M({ color: 0xf6f2e8, roughness: 0.85, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(hullGeo(B.len, B.wid, -B.draft, 0.18), paint));
  g.add(new THREE.Mesh(hullWalls(B.len, B.wid, 0.18, 0.5, 0.09), white));
  g.add(new THREE.Mesh(hullGeo(B.len - 0.22, B.wid - 0.22, 0.16, 0.2), wood));
  box(g, 0.08, 0.8, 1.1, dark, 0, -B.draft - 0.4, 0); // kýl
  for (const [x, z] of [[-0.62, 0.7], [0.62, 0.7], [0, 2.0]]) box(g, x ? 0.4 : 1.2, 0.12, x ? 1.4 : 0.4, wood, x, 0.32, z); // lavice
  const mz = -0.7;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 6.3, 10), wood);
  mast.position.set(0, 3.3, mz); g.add(mast);
  // ráhno s hlavní plachtou: otáčí se kolem stěžně (natočení podle větru)
  const boom = new THREE.Group(); boom.position.set(0, 1.15, mz); g.add(boom);
  const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.7, 8).rotateX(Math.PI / 2), wood);
  bm.position.z = 1.35; boom.add(bm);
  const main = new THREE.Mesh(sailGeo(), cloth); boom.add(main);
  const jib = new THREE.Mesh(sailGeo(6, 8), cloth); g.add(jib);
  // vlaječka na vrcholu stěžně ukazuje, kam fouká vítr
  const flagG = new THREE.Group(); flagG.position.set(0, 6.4, mz); g.add(flagG);
  const fg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(0, -0.12, 0), new THREE.Vector3(0, 0, 0.6)]);
  fg.computeVertexNormals();
  flagG.add(new THREE.Mesh(fg, M({ color: 0x38e8ff, emissive: 0x38e8ff, emissiveIntensity: 0.6, side: THREE.DoubleSide })));
  const pivot = new THREE.Group(); pivot.position.set(0, 0.3, B.len / 2 - 0.05); g.add(pivot); // kormidlo s pákou
  box(pivot, 0.06, 1.0, 0.4, wood, 0, -0.45, 0.15); box(pivot, 0.05, 0.05, 0.9, wood, 0, 0.25, -0.4);
  const m = { group: g, wheels: [], pivots: [pivot], head: null, tail: null, boat: B, boom, main, jib, flagG };
  m.update = (src, dt, v) => {
    const t = performance.now() / 1000, up = clamp(src.thr ?? 0, 0, 1), luff = src.lf ? 1 : 0;
    boom.rotation.y += ((src.bm ?? src.boom ?? 0) - boom.rotation.y) * Math.min(1, dt * 3); // bm = z pozice řidiče, boom = vlastní stav
    const side = Math.sign(boom.rotation.y || 1), b = (0.35 + 0.15 * up) * side * (1 - luff * 0.8);
    shapeSail(main.geometry, [0, 0.15 + 4.9 * up, 0.05], [0, 0.1, 0.05], [0, 0.1, 2.55], up > 0.02 ? b : 0, luff * 0.12 * up, t);
    main.visible = up > 0.02;
    jib.visible = up > 0.02;
    const cl = [side * 0.55 * Math.abs(Math.sin(boom.rotation.y)) + 0.0, 0.55, mz - 0.25];
    shapeSail(jib.geometry, [0, 1.2 + 3.8 * up, mz - 0.05], [0, 0.55, -B.len / 2 + 0.3], cl, b * 0.6, luff * 0.1 * up, t + 1);
    const w = windAt(dayCount, dayTime), yaw = v.yaw;
    flagG.rotation.y = Math.atan2(w.x * Math.cos(yaw) - w.z * Math.sin(yaw), w.x * Math.sin(yaw) + w.z * Math.cos(yaw)) + Math.sin(t * 9) * 0.08;
  };
  return m;
}
export function buildBoatModel(type, color) {
  const m = type === 'sailboat' ? buildSailboat(color) : buildMotorboat(color);
  const inner = m.update;
  // houpání zaparkované lodi, brázda a spršky (i u lodí, které řídí ostatní hráči)
  m.update = (src, dt, v, driven) => {
    inner?.(src, dt, v, driven);
    if (m.prop) m.prop.rotation.z += (src.thr || 0) * 40 * dt;
    if (!driven) { const t = performance.now() / 1000; m.group.position.y += Math.sin(t * 1.6 + v.x * 0.3) * 0.04; m.group.rotateZ(Math.sin(t * 1.1 + v.z) * 0.02); }
    const sp = Math.abs(src.spd || 0);
    if (sp > 0.8 && (m.wakeT = (m.wakeT || 0) - dt * (0.6 + sp * 0.35)) <= 0) {
      m.wakeT = 0.18;
      const lv = levelAt(m.group.position.x, m.group.position.z);
      if (lv !== null) {
        const st = m.group.localToWorld(tmp.set(0, 0, m.boat.len / 2)), s = Math.min(1.6, 0.5 + sp * 0.08);
        wake(st.x, lv, st.z, s, 1.6 + sp * 0.12);
        if (sp > 4) { const bow = m.group.localToWorld(tmp.set(0, 0.2, -m.boat.len / 2 + 0.4)); debris.emit(bow.x, lv + 0.15, bow.z, [0.85, 0.92, 1], Math.round(sp / 3), 1.2 + sp * 0.12, 1.4); } // spršky od přídě
      }
    }
  };
  return m;
}

// ---------- brázda: pěnové kroužky na hladině, které se rozšiřují a mizí (jedna sada pro všechny lodě, vzniká až při prvním použití)
const tmp = new THREE.Vector3(), WAKE_N = 96;
let wakeMesh = null, wakeI = 0;
const wakes = [];
function wake(x, y, z, s, life) {
  if (!wakeMesh) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    wakeMesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.75, 1, 28).rotateX(-Math.PI / 2), mat, WAKE_N);
    wakeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    wakeMesh.frustumCulled = false;
    for (let i = 0; i < WAKE_N; i++) { wakes.push({ age: 9, life: 1 }); wakeMesh.setColorAt(i, new THREE.Color(0, 0, 0)); }
    scene.add(wakeMesh);
  }
  Object.assign(wakes[wakeI], { x, y: y + 0.03, z, s, age: 0, life });
  wakeI = (wakeI + 1) % WAKE_N;
}
const wm = new THREE.Matrix4(), wc = new THREE.Color();
/** Každý snímek: brázdy se rozšiřují a slábnou. */
export function updateWake(dt) {
  if (!wakeMesh) return;
  for (let i = 0; i < WAKE_N; i++) {
    const w = wakes[i];
    w.age += dt;
    const k = w.age / w.life;
    if (k >= 1) { wm.makeScale(0, 0, 0); wakeMesh.setMatrixAt(i, wm); continue; }
    const r = w.s * (0.6 + k * 2.4);
    wm.makeScale(r, 1, r).setPosition(w.x, w.y, w.z);
    wakeMesh.setMatrixAt(i, wm);
    wakeMesh.setColorAt(i, wc.setRGB(0.55, 0.6, 0.65).multiplyScalar((1 - k) ** 1.5 * 0.7));
  }
  wakeMesh.instanceMatrix.needsUpdate = true;
  wakeMesh.instanceColor.needsUpdate = true;
}

// ---------- plutí
/** Vítr vůči lodi: úhel od přídě k místu, odkud fouká (0 = přímo proti větru), strana (+1 = zprava) a síla. */
export function windRel(v) {
  const w = windAt(dayCount, dayTime), fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw), rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
  return { a: Math.acos(clamp(-(fx * w.x + fz * w.z), -1, 1)), side: Math.sign(-(rx * w.x + rz * w.z)) || 1, speed: w.speed, w };
}
/** Jak dobře plachta táhne podle úhlu k větru (0 = třepetá, 1 = bočák). */
export function sailEff(a) {
  if (a < 0.6) return 0; // do 34° od větru plachta jen třepetá
  if (a < 1.05) return 0.85 * (a - 0.6) / 0.45; // ostře proti větru
  if (a < 1.75) return 0.85 + 0.15 * (a - 1.05) / 0.7; // bočák (vítr z boku) je nejrychlejší
  return 1 - 0.4 * (a - 1.75) / (Math.PI - 1.75); // po větru
}
export const POINTS_OF_SAIL = (a) => (a < 0.6 ? 'proti větru – plachta třepetá' : a < 1.05 ? 'ostře proti větru' : a < 1.75 ? 'bočák (vítr z boku)' : a < 2.6 ? 'zadoboční vítr' : 'po větru');
let groundT = 0, slapT = 0, flapT = 0;
export function sailBoat(v, dt) {
  const B = BOATS[v.type], joy = input.joy, motor = v.type === 'motorboat';
  const fwd = clamp((keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + (joy ? -joy.y : 0), -1, 1);
  const steerIn = clamp((keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) + (joy ? -joy.x : 0), -1, 1);
  const lv = levelAt(v.x, v.z) ?? v.y;
  let wr = null;
  if (motor) {
    if (!v.engine && Math.abs(fwd) > 0.2) {
      if (v.fuel <= 0) { if ((carWarn.t -= dt) <= 0) { carWarn.t = 3; toast('Došlo palivo – natankuj z kanystru (pravé tl. s kanystrem na člun)'); } }
      else { v.engine = true; Sound.burst({ dur: 0.5, f0: 260, f1: 110, q: 1.5, vol: 0.3, type: 'lowpass' }); }
    }
    if (v.engine && v.fuel <= 0) { v.engine = false; toast('Motor zhasl – došlo palivo'); }
    const thr = v.engine ? fwd : 0, boost = nitroOn(), maxF = B.maxFwd * (v.mods?.engine ? 1.25 : 1) * (boost ? 1.35 : 1);
    v.thr = thr;
    if (thr > 0) v.spd = v.spd < 0 ? v.spd + 4 * dt : Math.min(maxF, v.spd + B.accel * powerMul(v, boost) * thr * (1 - v.spd / (maxF * 1.1)) * dt);
    else if (thr < 0) v.spd = v.spd > 0.3 ? Math.max(0, v.spd - 4 * dt) : Math.max(-B.rev, v.spd + 2.5 * thr * dt);
    if (v.engine) v.fuel = Math.max(0, v.fuel - (0.01 + Math.abs(thr) * 0.07) * dt);
  } else {
    // plachetnice: W vytáhne plachtu, S ji svine; plachta se sama natočí podle větru
    v.thr = clamp((v.thr || 0) + fwd * 0.6 * dt, 0, 1);
    wr = windRel(v);
    const eff = sailEff(wr.a);
    v.lf = v.thr > 0.05 && eff < 0.05 ? 1 : 0;
    v.boom = -wr.side * clamp((wr.a - 0.3) * 0.55, 0.06, 1.35);
    const target = wr.speed * 1.15 * eff * v.thr;
    v.spd += (target - v.spd) * Math.min(1, dt * (target > v.spd ? 0.35 : 0.2));
    const heel = 0.34 * v.thr * eff * Math.min(1.3, wr.speed / 8);
    v.heel = -wr.side * heel;
    if (v.lf && (flapT -= dt) <= 0) { flapT = 0.12 + Math.random() * 0.1; Sound.burst({ dur: 0.07, f0: 700, f1: 300, q: 0.7, vol: 0.05 * wr.speed / 6, type: 'lowpass' }); } // třepetání plachty
  }
  v.spd *= 1 - Math.min(1, (0.05 + Math.abs(v.spd) * 0.01) * dt); // odpor vody
  // kormidlo účinkuje podle rychlosti (člun s motorem zatočí i z místa)
  v.steer += (steerIn * 0.6 - v.steer) * Math.min(1, dt * 4);
  const eff = motor ? clamp(Math.abs(v.spd) / 4, v.engine && Math.abs(v.thr) > 0.1 ? 0.35 : 0, 1.2) : clamp(Math.abs(v.spd) / 3, 0.08, 1);
  const nyaw = v.yaw + v.steer * B.turn * eff * (v.spd < -0.1 ? -1 : 1) * dt;
  const nx = v.x - Math.sin(nyaw) * v.spd * dt, nz = v.z - Math.cos(nyaw) * v.spd * dt;
  const nlv = levelAt(nx, nz);
  if (nlv === null || boatBlocker(v.type, nx, nz, nyaw, nlv)) {
    if (Math.abs(v.spd) > 1.5 && (groundT -= dt) <= 0) { groundT = 2.5; toast('Mělčina! Loď narazila na břeh'); Sound.burst({ dur: 0.4, f0: 300, f1: 80, q: 0.8, vol: 0.4, type: 'lowpass' }); player.shake = 0.25; }
    v.spd *= -0.25;
    v.yaw += (nyaw - v.yaw) * 0.3; // aspoň se trochu stočí od břehu
  } else { v.x = nx; v.z = nz; v.yaw = nyaw; }
  // vlny: houpání, náklon od větru (plachetnice) a zvednutá příď v rychlosti (člun)
  const t = performance.now() / 1000, wsp = wr ? wr.speed : 5, amp = 0.035 + wsp * 0.006;
  v.y = lv + Math.sin(t * 1.7 + v.x * 0.3) * amp + Math.sin(t * 2.9 + v.z * 0.5) * amp * 0.4;
  v.pitch = Math.sin(t * 1.3 + v.z * 0.2) * amp * 0.5 + (motor ? 0.07 * clamp(Math.abs(v.spd) / 7, 0, 1) * (1 - clamp((Math.abs(v.spd) - 9) / 6, 0, 0.6)) : 0);
  const rollT = (motor ? -v.steer * clamp(v.spd / 10, -0.3, 0.6) * 0.25 : v.heel || 0) + Math.sin(t * 1.1 + v.x * 0.2) * amp * 0.8;
  v.roll = (v.roll || 0) + (rollT - (v.roll || 0)) * Math.min(1, dt * 2.5);
  // hráč na místě kormidelníka
  const seat = v.type === 'sailboat' ? [0, 2.0] : [-0.42, 0.9];
  const [sx, sz] = carLocal(v, ...seat);
  player.pos.set(sx, v.y + 0.25, sz);
  player.vel.set(0, 0, 0);
  player.onGround = true;
  placeBoatCamera(v);
  Sound.engine(motor && v.engine, motor ? Math.abs(v.spd) / B.maxFwd * 0.8 + Math.max(0, v.thr) * 0.35 + 0.1 : 0);
  if (Math.abs(v.spd) > 0.5 && (slapT -= dt * (0.5 + Math.abs(v.spd) * 0.25)) <= 0) { slapT = 0.6 + Math.random() * 0.5; Sound.burst({ dur: 0.18, f0: 900, f1: 250, q: 0.6, vol: 0.06 + Math.min(0.12, Math.abs(v.spd) * 0.01), type: 'lowpass' }); } // šplouchání o trup
  return Math.abs(v.spd);
}
export function placeBoatCamera(v) {
  if (carCam === 0) {
    const seat = v.type === 'sailboat' ? [0, 2.15] : [-0.42, 1.0], [cx, cz] = carLocal(v, ...seat);
    camera.position.set(cx, v.y + 0.25 + 0.95, cz);
    camera.rotation.set(player.pitch + (v.pitch || 0), v.yaw + clamp(player.yaw, -2.6, 2.6), -(v.roll || 0) * 0.7, 'YXZ');
  } else {
    const yaw = v.yaw + player.yaw, d = v.type === 'sailboat' ? 11 : 8;
    const cx = v.x + Math.sin(yaw) * d, cz = v.z + Math.cos(yaw) * d, cy = Math.max(v.y + 3.2 - player.pitch * 6, terrainH(cx, cz) + 0.6);
    camera.position.set(cx, cy, cz);
    camera.rotation.set(Math.atan2(v.y + 1.4 - cy, d), yaw, 0, 'YXZ');
  }
}
export const boatHorn = (type) => (type === 'sailboat' ? Sound.ring(880, 1.2, 0.1, 0, [1, 2.76]) : (Sound.tone(220, 0.9, 0.18, 'sawtooth'), Sound.tone(277, 0.9, 0.12, 'sawtooth')));
