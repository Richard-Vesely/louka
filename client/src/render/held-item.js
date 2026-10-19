// Předmět v ruce a máchnutí.
import '../player/player.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { ITEMS } from '../../../shared/data/index.js';
import { clamp, lerp, smoothstep, wrapAngle } from '../../../shared/util.js';
import { WALK } from '../../../shared/world/constants.js';
import { iconVoxels } from '../dining/food-models.js';
import { heldStack } from '../player/inventory.js';
import { player } from '../player/player.js';
import { blockMat } from './blocks.js';
import { ICONS } from './icons.js';
import { camera } from './renderer.js';
import { glowTex } from './sky.js';
import { SWING_TIME, buildFPArm, disposeCharacter, swingKindOf } from './character.js';
import { loadCostume } from '../menu/costume.js';
import { NET } from '../../../shared/net/net.js';

// ============================================================ předmět v ruce
export const holder = new THREE.Group();
camera.add(holder);
export const TIER_MAT = {
  1: new THREE.MeshStandardMaterial({ color: 0x9a7448, roughness: 0.8 }),
  2: new THREE.MeshStandardMaterial({ color: 0x8e8e8e, roughness: 0.75, metalness: 0.1 }),
  3: new THREE.MeshStandardMaterial({ color: 0xdfe5ec, roughness: 0.22, metalness: 1 }),
  4: new THREE.MeshStandardMaterial({ color: 0xbff8ff, roughness: 0.15, metalness: 0.3, emissive: 0x2fd0ff, emissiveIntensity: 0.9 }),
  5: new THREE.MeshStandardMaterial({ color: 0xe9a0ff, roughness: 0.2, metalness: 0.6, emissive: 0xb020e0, emissiveIntensity: 0.9 }),
};
const handleMat = new THREE.MeshStandardMaterial({ color: 0x5a3e26, roughness: 0.9 });
export const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a03a, metalness: 1, roughness: 0.35 });
// Pixelová ikona jako textura pro předmět v ruce (ostré pixely jako v Minecraftu).
function iconTexture(id) {
  const t = new THREE.CanvasTexture(ICONS[id].canvas);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const heldCache = {};
export function buildHeld(id) {
  const d = ITEMS[id], g = new THREE.Group();
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  if (d.tool === 'sword') {
    const shape = new THREE.Shape([new THREE.Vector2(-0.032, 0), new THREE.Vector2(0.032, 0), new THREE.Vector2(0.027, 0.74), new THREE.Vector2(0, 0.86), new THREE.Vector2(-0.027, 0.74)]);
    mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.006, bevelSegments: 1 }).translate(0, 0.02, -0.004), TIER_MAT[d.tier]);
    mesh(new THREE.BoxGeometry(0.24, 0.035, 0.05), d.tier >= 3 ? goldMat : handleMat);
    mesh(new THREE.CylinderGeometry(0.021, 0.024, 0.17, 10), handleMat, 0, -0.1);
    mesh(new THREE.SphereGeometry(0.034, 12, 8), d.tier >= 3 ? goldMat : handleMat, 0, -0.2);
  } else if (d.tool === 'axe' || d.tool === 'pick') {
    mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.62, 8), handleMat, 0, 0.12);
    if (d.tool === 'axe') {
      mesh(new THREE.BoxGeometry(0.17, 0.13, 0.03), TIER_MAT[d.tier], 0.08, 0.36);
    } else {
      const head = mesh(new THREE.BoxGeometry(0.46, 0.05, 0.04), TIER_MAT[d.tier], 0, 0.4);
      head.scale.set(1, 1, 1);
      mesh(new THREE.ConeGeometry(0.03, 0.08, 6), TIER_MAT[d.tier], 0.25, 0.39).rotation.z = -Math.PI / 2;
      mesh(new THREE.ConeGeometry(0.03, 0.08, 6), TIER_MAT[d.tier], -0.25, 0.39).rotation.z = Math.PI / 2;
    }
  } else if (d.block && blockMat(d.block)) {
    mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), blockMat(d.block), 0, 0.15).rotation.set(0.3, 0.6, 0);
  } else if (id === 'torch') {
    mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.4, 6), handleMat, 0, 0.1);
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    f.scale.setScalar(0.25);
    f.position.y = 0.33;
    g.add(f);
  } else {
    const s = iconVoxels(id, 0.016);
    s.position.y = 0.12;
    s.rotation.y = -0.4;
    g.add(s);
  }
  g.scale.setScalar(0.7);
  return g;
}
// ---------- ruka v obleku (pohled z první osoby): předloktí a rukavice v barvách obleku drží předmět
const itemSlot = new THREE.Group();
// směr předloktí od rukavice (dolů, doprava a ke kameře)
const UP = new THREE.Vector3(0, 1, 0);
const ARM_HOLD = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(0.3, -0.72, 0.62).normalize());
const ARM_EMPTY = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(0.22, -0.5, 0.84).normalize());
holder.add(itemSlot);
let arm = null;
function rebuildArm() {
  if (arm) { holder.remove(arm); disposeCharacter(arm); }
  arm = buildFPArm(loadCostume(NET.name));
  arm.scale.setScalar(0.72);
  holder.add(arm);
}
rebuildArm();
addEventListener('rise-costume', rebuildArm);

let heldId = undefined, equipT = 0;
export function updateHeldModel() {
  const s = heldStack();
  const id = player.eating ? player.eating.id : s ? s.id : null;
  if (id === heldId) return;
  if (heldId !== undefined && !player.eating) equipT = 1; // výměna: ruka klesne a vrátí se (zvuk výběru hraje soundscape)
  heldId = id;
  itemSlot.clear();
  if (id) itemSlot.add(heldCache[id] ||= buildHeld(id));
}
// Klíčové polohy máchnutí podle nástroje: p = poloha, r = natočení ruky. Meč máchne do strany, sekera a krumpáč
// seknou shora, lopata nabírá, ruka a ostatní předměty udeří dopředu.
const REST = { p: [0.33, -0.3, -0.6], r: [-0.3, 0.15, -0.4] };
const REST_EMPTY = { p: [0.3, -0.24, -0.52], r: [0.15, 0.25, 0.05] };
const SWINGS = {
  chop: [{ t: 0, ...REST }, { t: 0.25, p: [0.4, -0.1, -0.55], r: [0.45, 0.3, -0.55] }, { t: 0.55, p: [0.06, -0.44, -0.7], r: [-1.25, -0.2, 0.6] }, { t: 1, ...REST }],
  sweep: [{ t: 0, ...REST }, { t: 0.2, p: [0.5, -0.2, -0.58], r: [-0.1, 0.55, -1.1] }, { t: 0.55, p: [-0.24, -0.34, -0.66], r: [-0.9, -0.5, 1.15] }, { t: 1, ...REST }],
  scoop: [{ t: 0, ...REST }, { t: 0.3, p: [0.26, -0.5, -0.78], r: [-0.95, 0.1, -0.2] }, { t: 0.62, p: [0.3, -0.16, -0.6], r: [0.45, 0.2, -0.3] }, { t: 1, ...REST }],
};
export let swingT = -1;
let swingKind = 'punch';
export const startSwing = () => { if (swingT < 0) { swingT = 0; swingKind = swingKindOf(heldId); } };
let lagYaw = null, lagPitch = 0, hurtSeen = -99, hurtT = 0;
const v3 = (a, b, c) => [a, b, c];
export function updateSwing(dt, moving) {
  const empty = !heldId;
  const base = empty ? REST_EMPTY : REST;
  let p = base.p, r = base.r;
  if (swingT >= 0) {
    swingT += dt / SWING_TIME;
    const t = Math.min(swingT, 1);
    const keys = SWINGS[swingKind];
    if (keys) {
      let i = 0;
      while (i < keys.length - 2 && t > keys[i + 1].t) i++;
      const a = keys[i], b = keys[i + 1], k = smoothstep(0, 1, (t - a.t) / (b.t - a.t));
      p = a.p.map((v, j) => lerp(v, b.p[j], k));
      r = a.r.map((v, j) => lerp(v, b.r[j], k));
    } else { // úder: dopředu a zpět (jako v Minecraftu: sin √t)
      const q = Math.sin(Math.sqrt(t) * Math.PI), q2 = Math.sin(Math.sqrt(t) * Math.PI * 2), q3 = Math.sin(t * Math.PI);
      p = v3(base.p[0] - 0.22 * q, base.p[1] + 0.12 * q2, base.p[2] - 0.3 * q3);
      r = v3(base.r[0] - 0.5 * q3, base.r[1] + 0.45 * q, base.r[2] + 0.35 * q);
    }
    if (swingT >= 1) swingT = -1;
  }
  if (player.eating) { // nese jídlo k puse a "kouše"
    const e = player.eating, k = Math.min(1, e.t * 5);
    p = [lerp(p[0], 0.06, k), lerp(p[1], -0.26, k) + Math.abs(Math.sin(e.t * 9)) * 0.04 * k, lerp(p[2], -0.38, k)];
    r = [lerp(r[0], 0.5, k), lerp(r[1], 0, k), lerp(r[2], 0.15, k)];
  }
  // houpání při chůzi (krok = půl otočky player.bob)
  const bk = player.onGround ? Math.min(moving / WALK, 1.5) : 0, ph = player.bob;
  // setrvačnost: ruka se za otočením kamery trochu opozdí
  if (lagYaw === null) { lagYaw = player.yaw; lagPitch = player.pitch; }
  const kk = 1 - Math.exp(-dt * 11);
  lagYaw += wrapAngle(player.yaw - lagYaw) * kk;
  lagPitch += (player.pitch - lagPitch) * kk;
  const dy = clamp(wrapAngle(player.yaw - lagYaw), -0.5, 0.5), dp = clamp(player.pitch - lagPitch, -0.5, 0.5);
  // výměna předmětu a zásah
  equipT = Math.max(0, equipT - dt / 0.2);
  if (player.lastHurt !== hurtSeen) { if (hurtSeen !== -99) hurtT = 1; hurtSeen = player.lastHurt; }
  hurtT = Math.max(0, hurtT - dt * 4);
  const dip = smoothstep(0, 1, equipT) * 0.38 + hurtT * 0.05;
  holder.position.set(
    p[0] + Math.sin(ph) * bk * 0.022 + dy * 0.1,
    p[1] - Math.abs(Math.cos(ph)) * bk * 0.026 - dp * 0.09 - dip,
    p[2],
  );
  holder.rotation.set(r[0] + Math.abs(Math.cos(ph - 0.2)) * bk * 0.05 - dp * 0.25, r[1] + dy * 0.35, r[2] + Math.sin(ph) * bk * 0.035 + hurtT * 0.15);
  // ruka bez předmětu: pěst trochu vpředu; s předmětem rukavice svírá rukojeť
  if (arm) {
    arm.quaternion.copy(empty ? ARM_EMPTY : ARM_HOLD);
    arm.position.set(0, empty ? 0 : -0.035, empty ? 0 : 0.015);
  }
}
