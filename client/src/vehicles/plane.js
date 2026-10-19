// Dvouplošník: model a let.
import './car.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { clamp } from '../../../shared/util.js';
import { solidAny } from '../../../shared/world/collision.js';
import { waterAt } from '../../../shared/world/nature.js';
import { terrainH } from '../../../shared/world/terrain.js';
import { groundHeight } from '../../../shared/world/voxels.js';
import { Sound } from '../audio/sound.js';
import { input, keys, player } from '../player/player.js';
import { damagePlayer } from '../player/survival.js';
import { tmpV } from '../render/daylight.js';
import { forestColliders, forestTrees } from '../render/forest.js';
import { debris, sparks } from '../render/particles.js';
import { camera } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { carCam, carWarn, floorAt } from './car.js';

// ============================================================ dvouplošník: model a letová fyzika
// Zjednodušená, ale fyzikální: tah motoru, odpor vzduchu ~ v², vztlak ~ v² × součinitel podle úhlu náběhu,
// nad kritickým úhlem nebo pod pádovou rychlostí vztlak zmizí (pád rychlosti) a nos klesá. Zatáčí se náklonem.
// Na zemi jezdí po podvozku (ostruhové kolo řídí A/D, s plynem na nule kola brzdí).
// tah 9 m/s² a odpor 0,009·v² = nejvyšší rychlost ~32 m/s (115 km/h); při stoupání nad ~45° rychlost spadne pod pádovou
export const PLANE = { span: 9.2, len: 7, stall: 15, vTake: 21, maxThrust: 9, drag: 0.009, fuelMax: 60, groundPitch: 0.14 };
const planeEuler = new THREE.Euler(0, 0, 0, 'YXZ'), planeMat = new THREE.Matrix4(), planeVec = new THREE.Vector3();
// Bod v souřadnicích letadla (x vpravo, y nahoru, z dozadu) -> svět, podle polohy a náklonů
function planePoint(v, lx, ly, lz, out = planeVec) {
  planeEuler.set(v.pitch || 0, v.yaw, -(v.roll || 0), 'YXZ');
  planeMat.makeRotationFromEuler(planeEuler);
  return out.set(lx, ly, lz).applyMatrix4(planeMat).add(tmpV.set(v.x, v.y, v.z));
}
export function buildPlaneModel(color) {
  const g = new THREE.Group();
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.75, ...o });
  const fabric = M({ color }), wingM = M({ color: 0xd8c8a0 }), dark = M({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.4 }), wood = M({ color: 0x7a4a24, roughness: 0.6 });
  const box = (w, h, d, m, x, y, z, parent = g) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); parent.add(me); return me; };
  const cyl = (r, l, m, x, y, z, axis = 'z') => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 14), m); c.position.set(x, y, z); if (axis === 'z') c.rotation.x = Math.PI / 2; else if (axis === 'x') c.rotation.z = Math.PI / 2; g.add(c); return c; };
  box(0.95, 0.95, 4.6, fabric, 0, 1.35, 0.1);            // trup
  box(0.62, 0.62, 1.6, fabric, 0, 1.45, 3.1);            // zúžená zadní část
  box(0.7, 0.08, 0.95, dark, 0, 1.84, 0.55);             // otevřený kokpit
  box(0.6, 0.3, 0.04, M({ color: 0x9ab8c8, transparent: true, opacity: 0.5 }), 0, 1.98, -0.05); // štítek proti větru
  cyl(0.56, 0.75, dark, 0, 1.35, -2.45);                 // kryt motoru
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; box(0.12, 0.12, 0.3, dark, Math.cos(a) * 0.5, 1.35 + Math.sin(a) * 0.5, -2.7); } // válce rotačního motoru
  cyl(0.12, 0.3, dark, 0, 1.35, -2.95);                  // náboj vrtule
  const prop = new THREE.Group();
  prop.position.set(0, 1.35, -3.12);
  g.add(prop);
  box(0.16, 2.7, 0.06, wood, 0, 0, 0, prop);
  box(0.06, 0.3, 0.08, wood, 0, 0, 0, prop);
  // dvě patra křídel se vzpěrami, výsostné znaky
  box(9.0, 0.12, 1.5, wingM, 0, 0.95, -0.9);
  box(9.2, 0.12, 1.5, wingM, 0, 2.38, -1.1);
  for (const x of [-3.3, 3.3]) for (const z of [-1.5, -0.4]) box(0.07, 1.36, 0.07, wood, x, 1.67, z);
  for (const x of [-0.5, 0.5]) box(0.06, 0.6, 0.06, wood, x, 2.06, -1.1);
  const roundel = (x, y) => { cyl(0.42, 0.02, M({ color: 0x1a3a8a }), x, y, -1.1, 'y'); cyl(0.28, 0.03, M({ color: 0xf4f4f0 }), x, y, -1.1, 'y'); cyl(0.14, 0.04, M({ color: 0xc82a2a }), x, y, -1.1, 'y'); };
  roundel(-3.4, 2.45); roundel(3.4, 2.45);
  // ocasní plochy
  box(3.2, 0.08, 0.95, wingM, 0, 1.5, 3.55);
  box(0.08, 1.15, 1.0, fabric, 0, 2.05, 3.65);
  box(0.09, 0.5, 0.35, M({ color: 0xf4f4f0 }), 0, 2.2, 3.95);
  // podvozek: dvě kola na vzpěrách, ostruha vzadu
  const wheels = [];
  for (const x of [-0.85, 0.85]) {
    box(0.07, 0.9, 0.07, dark, x * 0.75, 0.82, -1.15).rotation.z = x > 0 ? -0.3 : 0.3;
    const w = new THREE.Group();
    w.position.set(x, 0.42, -1.3);
    g.add(w);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 16), dark);
    tire.rotation.z = Math.PI / 2;
    w.add(tire);
    box(0.2, 0.06, 0.6, M({ color: 0xc8c8c8 }), 0, 0, 0, w);
    wheels.push(w);
  }
  box(1.8, 0.06, 0.06, dark, 0, 0.42, -1.3);
  box(0.06, 0.5, 0.06, dark, 0, 0.55, 3.75).rotation.x = 0.5;
  // poziční světla: červené vlevo, zelené vpravo, bílé na ocasu
  const nav = M({ color: 0x220000, emissive: 0xff2020, emissiveIntensity: 0 }), navG = M({ color: 0x002200, emissive: 0x20ff40, emissiveIntensity: 0 }), navW = M({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 0 });
  box(0.12, 0.1, 0.12, nav, -4.6, 2.38, -1.1);
  box(0.12, 0.1, 0.12, navG, 4.6, 2.38, -1.1);
  box(0.1, 0.1, 0.1, navW, 0, 2.62, 4.1);
  return { group: g, prop, wheels, pivots: [], navs: [nav, navG, navW], head: null, tail: null };
}
// Narazí letadlo (příď, konce křídel, ocas) do bloku, stromu nebo do země?
export function planeHits(v) {
  for (const [lx, ly, lz] of [[0, 1.35, -3.3], [-4.5, 0.95, -0.9], [4.5, 0.95, -0.9], [-4.5, 2.38, -1.1], [4.5, 2.38, -1.1], [0, 2.4, 4.0], [0, 0.6, -1.3]]) {
    const p = planePoint(v, lx, ly, lz);
    if (solidAny(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) return true;
    const g = groundHeight(p.x, p.z);
    if (!v.ground && isFinite(g) && p.y < g - 0.15 && ly > 0.7) return true; // konec křídla v zemi (jen za letu, na zemi jede po podvozku)
    for (const c of forestColliders) {
      if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 > (c.r + 1.6) ** 2) continue;
      const t = forestTrees.find((tr) => tr.x === c.x && tr.z === c.z);
      if (t && p.y > t.y && p.y < t.y + t.trunkH + 3 * t.s) return true; // kmen i koruna
    }
  }
  return false;
}
// Místo pro položení letadla: střed se hledá před hráčem (letadlo je větší než dosah ruky), nos od hráče, ocas k němu.
// Vrátí { ok, x, y, z } nebo { ok: false, why } s důvodem, co překáží.
// Půdorys letadla (místní souřadnice: x do stran, z dozadu): křídla, trup, ocasní plocha
const PLANE_RECTS = [[-4.7, 4.7, -1.9, -0.1], [-0.8, 0.8, -3.7, 4.4], [-1.9, 1.9, 3.3, 4.4]];
const PLANE_FIT = [];
for (let lx = -4.5; lx <= 4.51; lx += 0.5) PLANE_FIT.push([lx, 0.95, -0.9], [lx, 2.38, -1.1]); // spodní a horní křídlo
for (let lz = -3.3; lz <= 4.01; lz += 0.5) PLANE_FIT.push([0, 0.7, lz], [0, 1.4, lz]); // trup
function planeBlocker(v) {
  if (!isFinite(v.y)) return 'chybí rovná zem';
  for (const [lx, ly, lz] of PLANE_FIT) {
    const p = planePoint(v, lx, ly, lz);
    if (solidAny(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) return 'překáží blok';
    const g = groundHeight(p.x, p.z);
    if (isFinite(g) && p.y < g - 0.4) return 'terén je moc nerovný';
  }
  // stromy a balvany: leží kmen (s rezervou) nebo koruna v půdorysu letadla?
  const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
  for (const col of forestColliders) {
    const dx = col.x - v.x, dz = col.z - v.z;
    if (dx * dx + dz * dz > 100) continue;
    const lx = c * dx - s * dz, lz = s * dx + c * dz; // do místních souřadnic letadla
    const t = forestTrees.find((tr) => tr.x === col.x && tr.z === col.z);
    if (t && t.y + t.trunkH + 3 * t.s < v.y) continue; // strom pod letadlem (ve svahu)
    const crown = t && t.y + t.trunkH * 0.8 < v.y + 2.6 ? Math.min(1.6, 0.9 * t.s) : 0; // nízká koruna zasáhne horní křídlo
    const m = col.r + 0.3 + crown;
    if (PLANE_RECTS.some(([x0, x1, z0, z1]) => lx > x0 - m && lx < x1 + m && lz > z0 - m && lz < z1 + m)) return t ? 'překáží strom' : 'překáží balvan';
  }
  return '';
}
export function planeSpot(pt) {
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const d0 = Math.max(0, (pt[0] - player.pos.x) * fx + (pt[2] - player.pos.z) * fz);
  let why = '';
  for (const d of [d0 + 5.2, d0 + 7, d0 + 9]) { // ocas musí minout hráče; když překáží, zkusí se kousek dál
    const x = player.pos.x + fx * d, z = player.pos.z + fz * d, y = floorAt(x, z, Math.max(pt[1], terrainH(x, z)) + 0.5);
    why = planeBlocker({ x, y, z, yaw: player.yaw, pitch: PLANE.groundPitch, roll: 0 });
    if (!why) return { ok: true, x, y, z };
  }
  return { ok: false, why };
}
let stallWarnT = 0;
export function flyPlane(v, dt) {
  const joy = input.joy;
  // knipl: S / joystick dolů = nos nahoru, W = nos dolů; A/D = náklon (na zemi řízení)
  const pitchIn = clamp((keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + (joy ? joy.y : 0), -1, 1);
  const rollIn = clamp((keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + (joy ? joy.x : 0), -1, 1);
  const up = keys.has('Space') || keys.has('KeyR'), down = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyX');
  v.thr = clamp((v.thr || 0) + ((up ? 1 : 0) - (down ? 1 : 0)) * 0.45 * dt, 0, 1);
  if (v.thr > 0 && v.fuel <= 0 && (carWarn.t -= dt) <= 0) { carWarn.t = 3; toast('Došlo palivo – natankuj z kanystru (na zemi)'); }
  v.engine = v.fuel > 0 && v.thr > 0;
  v.vx ||= 0; v.vy ||= 0; v.vz ||= 0;
  const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch), cr = Math.cos(v.roll || 0), sr = Math.sin(v.roll || 0);
  const fwd = [-sy * cp, sp, -cy * cp], right = [cy, 0, -sy], up0 = [-sy * -sp, cp, -cy * -sp];
  const upv = [up0[0] * cr + right[0] * sr, up0[1] * cr + right[1] * sr, up0[2] * cr + right[2] * sr];
  const speed = Math.hypot(v.vx, v.vy, v.vz);
  const air = Math.max(0, v.vx * fwd[0] + v.vy * fwd[1] + v.vz * fwd[2]);
  const fpa = speed > 1 ? Math.asin(clamp(v.vy / speed, -1, 1)) : 0;
  const aoa = v.ground ? v.pitch : v.pitch - fpa; // úhel náběhu
  const stalled = !v.ground && (air < PLANE.stall || aoa > 0.38);
  const cl = stalled ? 0.2 : clamp(0.55 + aoa * 2.2, 0, 1.45);
  const lift = 9.8 * cl * (air / PLANE.vTake) ** 2;
  const thrust = v.engine ? v.thr * PLANE.maxThrust : 0;
  const drag = PLANE.drag * speed * speed + (stalled ? 0.4 * speed : 0);
  const inv = speed > 0.01 ? 1 / speed : 0;
  v.vx += (fwd[0] * thrust + upv[0] * lift - v.vx * inv * drag) * dt;
  v.vy += (fwd[1] * thrust + upv[1] * lift - v.vy * inv * drag - 9.8) * dt;
  v.vz += (fwd[2] * thrust + upv[2] * lift - v.vz * inv * drag) * dt;
  const eff = clamp(air / 18, 0.12, 1.2); // kormidla účinkují podle rychlosti
  if (!v.ground) {
    // let: výškovka a křidélka, zatáčka z náklonu, při pádu rychlosti nos padá
    v.pitch += pitchIn * 0.9 * eff * dt;
    v.roll = (v.roll || 0) + rollIn * 1.05 * eff * dt;
    if (!rollIn) v.roll *= 1 - Math.min(1, dt * 0.7);
    v.yaw -= (Math.tan(clamp(v.roll, -1.2, 1.2)) * 9.8) / Math.max(air, 8) * dt * 0.9;
    if (stalled) {
      v.pitch -= 0.75 * dt;
      if ((stallWarnT -= dt) <= 0) { stallWarnT = 2.5; toast('⚠ Ztráta rychlosti! Potlač (W) a přidej plyn'); Sound.burst({ dur: 0.4, f0: 900, f1: 900, q: 8, vol: 0.12 }); }
    }
    // rychlost se stáčí do směru nosu (letadlo letí kam míří)
    const k = Math.min(1, dt * 1.3 * clamp(air / 15, 0.1, 1)), s = Math.hypot(v.vx, v.vy, v.vz);
    v.vx += (fwd[0] * s - v.vx) * k; v.vy += (fwd[1] * s - v.vy) * k; v.vz += (fwd[2] * s - v.vz) * k;
  }
  v.pitch = clamp(v.pitch, -1.3, 1.3);
  v.roll = clamp(v.roll || 0, -1.1, 1.1);
  const ox = v.x, oy = v.y, oz = v.z, opitch = v.pitch, oyaw = v.yaw;
  v.x += v.vx * dt; v.y += v.vy * dt; v.z += v.vz * dt;
  // země: dosednutí, rozjezd a brzdy
  const floor = floorAt(v.x, v.z, oy + 0.5);
  if (v.y <= floor + 0.02) {
    const impact = -v.vy;
    if (!v.ground) {
      if (impact > 7.5 || Math.abs(v.roll) > 0.55) planeCrash(v, Math.max(impact, speed * 0.5));
      else if (impact > 1) Sound.burst({ dur: 0.2, f0: 300, f1: 100, q: 1, vol: 0.3, type: 'lowpass' });
    }
    v.ground = true;
    v.y = floor;
    if (v.vy < 0) v.vy = 0;
    v.roll *= 1 - Math.min(1, dt * 6);
    // zvednutí ocasu a rotace při vzletu jen při dostatečné rychlosti, jinak sedí na ostruze
    if (air > PLANE.vTake * 0.75) v.pitch = clamp(v.pitch + pitchIn * 0.6 * dt, 0, 0.4);
    else v.pitch += (PLANE.groundPitch - v.pitch) * Math.min(1, dt * 3);
    v.yaw -= rollIn * 0.9 * dt * clamp(air / 6, 0.25, 1); // řízení ostruhovým kolem
    const hx = -Math.sin(v.yaw), hz = -Math.cos(v.yaw);
    let gs = v.vx * hx + v.vz * hz;
    if (v.thr < 0.05) gs -= Math.sign(gs) * Math.min(Math.abs(gs), 5 * dt); // brzdy kol
    gs *= 1 - Math.min(1, 0.15 * dt);
    v.vx = hx * gs; v.vz = hz * gs;
  } else v.ground = false;
  if (planeHits(v)) {
    // náraz: letadlo se zastaví vodorovně, ale ve vzduchu dál padá (nezůstane viset)
    if (speed > 8) planeCrash(v, speed);
    v.x = ox; v.z = oz; v.yaw = oyaw;
    if (v.ground) { v.y = Math.max(oy, floor); v.pitch = opitch; }
    v.vx = v.vz = 0;
    if (v.vy > 0) v.vy = 0;
  }
  if (waterAt(v.x, v.y + 0.3, v.z) !== null && v.ground) { v.vx *= 1 - Math.min(1, dt * 3); v.vz *= 1 - Math.min(1, dt * 3); }
  if (v.engine) v.fuel = Math.max(0, v.fuel - (0.02 + v.thr * 0.1) * dt);
  v.spd = Math.hypot(v.vx, v.vz) * (v.ground ? 1 : 1); // pro kola a síť
  // pilot v kokpitu
  const seat = planePoint(v, 0, 1.4, 0.6);
  player.pos.set(seat.x, seat.y, seat.z);
  player.vel.set(0, 0, 0);
  player.onGround = true;
  placePlaneCamera(v);
  Sound.engine(v.engine, v.thr * 0.8 + air / 60);
  if (v.engine && Math.random() < dt * 8) { const ex = planePoint(v, 0.6, 1.1, -2.2); debris.emit(ex.x, ex.y, ex.z, [0.35, 0.35, 0.35], 1, 0.5, 0.5); } // kouř z výfuku
  return speed;
}
function planeCrash(v, force) {
  player.shake = 0.6;
  Sound.burst({ dur: 0.6, f0: 400, f1: 60, q: 0.8, vol: 0.6, type: 'lowpass' });
  sparks.emit(v.x, v.y + 1, v.z, [1, 0.6, 0.2], 40, 5, 3);
  if (force > 9) { damagePlayer(Math.min(60, force * 2), 0, 0); toast('Náraz! Letadlo tvrdě dosedlo'); } else toast('Tvrdé přistání');
  v.vx *= 0.2; v.vz *= 0.2; v.vy = 0; v.thr = Math.min(v.thr, 0.2);
}
export function placePlaneCamera(v) {
  if (carCam === 0) { // z kokpitu, s náklonem letadla
    const e = planePoint(v, 0, 2.12, 1.0);
    camera.position.copy(e);
    camera.rotation.set((v.pitch || 0) + player.pitch, v.yaw + clamp(player.yaw, -2.6, 2.6), -(v.roll || 0) * 0.85, 'YXZ');
  } else { // zezadu, horizont zůstává rovný
    const yaw = v.yaw + player.yaw, d = 14;
    let cx = v.x + Math.sin(yaw) * d, cz = v.z + Math.cos(yaw) * d, cy = v.y + 4 - player.pitch * 8 + Math.sin(v.pitch || 0) * -4;
    cy = Math.max(cy, terrainH(cx, cz) + 0.8);
    camera.position.set(cx, cy, cz);
    camera.rotation.set(Math.atan2(v.y + 1.6 - cy, d), yaw, 0, 'YXZ');
  }
}
