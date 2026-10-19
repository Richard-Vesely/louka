// Předmět v ruce a máchnutí.
import '../player/player.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { ITEMS } from '../../../shared/data/index.js';
import { lerp, smoothstep } from '../../../shared/util.js';
import { WALK } from '../../../shared/world/constants.js';
import { iconVoxels } from '../dining/food-models.js';
import { heldStack } from '../player/inventory.js';
import { player } from '../player/player.js';
import { blockMat } from './blocks.js';
import { ICONS } from './icons.js';
import { camera } from './renderer.js';
import { glowTex } from './sky.js';

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
function buildHeld(id) {
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
let heldId = undefined;
export function updateHeldModel() {
  const s = heldStack();
  const id = player.eating ? player.eating.id : s ? s.id : null;
  if (id === heldId) return;
  heldId = id;
  holder.clear();
  if (id) holder.add(heldCache[id] ||= buildHeld(id));
}
const SWING_KEYS = [
  { t: 0, p: [0.34, -0.36, -0.62], r: [-0.3, 0.15, -0.4] },
  { t: 0.22, p: [0.44, -0.22, -0.56], r: [0.2, 0.45, -1.05] },
  { t: 0.5, p: [-0.2, -0.42, -0.66], r: [-1.15, -0.35, 1.2] },
  { t: 1, p: [0.34, -0.36, -0.62], r: [-0.3, 0.15, -0.4] },
];
export let swingT = -1;
export const startSwing = () => { if (swingT < 0) swingT = 0; };
export function updateSwing(dt, moving) {
  let p = SWING_KEYS[0].p, r = SWING_KEYS[0].r;
  if (swingT >= 0) {
    swingT += dt / 0.32;
    const t = Math.min(swingT, 1);
    let i = 0;
    while (i < SWING_KEYS.length - 2 && t > SWING_KEYS[i + 1].t) i++;
    const a = SWING_KEYS[i], b = SWING_KEYS[i + 1], k = smoothstep(0, 1, (t - a.t) / (b.t - a.t));
    p = a.p.map((v, j) => lerp(v, b.p[j], k));
    r = a.r.map((v, j) => lerp(v, b.r[j], k));
    if (swingT >= 1) swingT = -1;
  }
  if (player.eating) { // nese jídlo k puse a "kouše"
    const e = player.eating, k = Math.min(1, e.t * 5);
    p = [lerp(p[0], 0.06, k), lerp(p[1], -0.26, k) + Math.abs(Math.sin(e.t * 9)) * 0.04 * k, lerp(p[2], -0.38, k)];
    r = [lerp(r[0], 0.5, k), lerp(r[1], 0, k), lerp(r[2], 0.15, k)];
  }
  const sway = Math.min(moving / WALK, 1.5);
  holder.position.set(p[0] + Math.cos(player.bob * 0.5) * 0.012 * sway, p[1] + Math.abs(Math.sin(player.bob * 0.5)) * 0.015 * sway, p[2]);
  holder.rotation.set(r[0], r[1], r[2]);
}
