// Předmět v ruce a máchnutí.
import '../player/player.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { ITEMS } from '../../../shared/data/index.js';
import { lerp, smoothstep, wrapAngle } from '../../../shared/util.js';
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
for (const m of Object.values(TIER_MAT)) m.userData.shared = true; // používají je i modely tvorů (client/src/mobs/mobs.js)
const handleMat = new THREE.MeshStandardMaterial({ color: 0x5a3e26, roughness: 0.9 });
export const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a03a, metalness: 1, roughness: 0.35 });
goldMat.userData.shared = true;
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
// Prázdná ruka: rukáv skafandru s rukavicí, kovovým chráničem a svítícím proužkem (jde vidět, jak máchá a těží).
export const SUIT = {
  suit: new THREE.MeshStandardMaterial({ color: 0xe4e9f0, roughness: 0.42, metalness: 0.15 }), // bílé panely
  dark: new THREE.MeshStandardMaterial({ color: 0x323844, roughness: 0.6, metalness: 0.3 }), // grafitové spoje
  glove: new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.7, metalness: 0.1 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xb8c4d2, roughness: 0.25, metalness: 0.95 }),
  neon: new THREE.MeshStandardMaterial({ color: 0x0a2530, emissive: 0x38e4ff, emissiveIntensity: 2.2 }),
};
function buildHand() {
  const g = new THREE.Group(), arm = new THREE.Group();
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); arm.add(m); return m; };
  box(0.135, 0.46, 0.135, SUIT.suit, 0, -0.26, 0); // předloktí (bílý panel)
  box(0.142, 0.045, 0.142, SUIT.dark, 0, -0.1, 0); // spoj
  box(0.012, 0.3, 0.025, SUIT.neon, 0.072, -0.28, 0.03); // svítící proužek
  box(0.15, 0.065, 0.15, SUIT.plate, 0, 0.005, 0); // kovová manžeta
  box(0.13, 0.11, 0.12, SUIT.glove, 0, 0.1, 0); // dlaň
  for (let i = 0; i < 4; i++) { // prsty sevřené v pěst
    box(0.029, 0.05, 0.1, SUIT.glove, -0.048 + i * 0.032, 0.175, -0.012);
    box(0.027, 0.02, 0.03, SUIT.plate, -0.048 + i * 0.032, 0.2, -0.045); // chránič kloubu
  }
  box(0.12, 0.008, 0.012, SUIT.neon, 0, 0.212, -0.062); // svítící linka přes klouby
  box(0.04, 0.075, 0.05, SUIT.glove, -0.08, 0.12, -0.04).rotation.z = 0.35; // palec
  arm.rotation.set(-0.85, 0.15, 0.45);
  arm.position.set(0.04, 0.06, 0.02);
  g.add(arm);
  g.scale.setScalar(0.85);
  return g;
}
let heldId = undefined, equipT = 1;
export function updateHeldModel() {
  const s = heldStack();
  const id = player.eating ? player.eating.id : s ? s.id : null;
  if (id === heldId) return;
  if (heldId !== undefined) equipT = 0; // výměna předmětu: ruka se schová dolů a vrátí
  heldId = id;
  holder.clear();
  holder.add(heldCache[id || '#hand'] ||= id ? buildHeld(id) : buildHand());
}
/** Ruka se rychle schová a vrátí (rozbitý nástroj, výměna předmětu). */
export const equipDip = () => { equipT = 0; };

// Máchnutí: klíčové polohy podle druhu nástroje (posun a natočení vůči klidové poloze).
// Meč seká vodorovně, sekera a krumpáč shora dolů, lopata nabírá, ruka udeří pěstí, ostatní předměty krátký oblouk.
const REST = { p: [0.34, -0.36, -0.62], r: [-0.3, 0.15, -0.4] };
const ARCS = {
  sword: [[0, [0, 0, 0], [0, 0, 0]], [0.16, [0.1, 0.09, 0.05], [0.25, -0.55, -0.45]], [0.46, [-0.44, -0.06, -0.14], [-0.55, 1.15, 1.05]], [1, [0, 0, 0], [0, 0, 0]]],
  axe: [[0, [0, 0, 0], [0, 0, 0]], [0.22, [0.03, 0.15, 0.08], [0.95, 0, -0.1]], [0.46, [-0.08, -0.2, -0.16], [-1.35, 0.1, 0.3]], [1, [0, 0, 0], [0, 0, 0]]],
  pick: [[0, [0, 0, 0], [0, 0, 0]], [0.2, [0.02, 0.17, 0.1], [1.05, 0.1, -0.2]], [0.44, [-0.12, -0.17, -0.2], [-1.3, 0.25, 0.4]], [1, [0, 0, 0], [0, 0, 0]]],
  shovel: [[0, [0, 0, 0], [0, 0, 0]], [0.25, [0, -0.08, 0.06], [-0.45, 0, 0]], [0.55, [-0.07, 0.09, -0.24], [0.65, 0, 0.2]], [1, [0, 0, 0], [0, 0, 0]]],
  hand: [[0, [0, 0, 0], [0, 0, 0]], [0.3, [-0.15, 0.05, -0.3], [-0.25, 0.2, 0.1]], [1, [0, 0, 0], [0, 0, 0]]],
  item: [[0, [0, 0, 0], [0, 0, 0]], [0.36, [-0.18, 0.05, -0.16], [-0.6, 0.3, 0.6]], [1, [0, 0, 0], [0, 0, 0]]],
};
export let swingT = -1;
let swingDur = 0.3, swingPow = 1;
/** Začne máchnutí (dur = délka v s, pow = síla 0–1: slabý úder má menší oblouk). Běžící máchnutí se nepřeruší. */
export const startSwing = (dur = 0.3, pow = 1) => { if (swingT < 0) { swingT = 0; swingDur = dur; swingPow = 0.45 + 0.55 * pow; } };
const arcOf = (id) => { const d = id && ITEMS[id]; return !id ? 'hand' : id === 'hoe' ? 'axe' : d?.tool && ARCS[d.tool] ? d.tool : 'item'; };
let lastYaw = 0, lastPitch = 0, lagYaw = 0, lagPitch = 0;
export function updateSwing(dt, moving) {
  const p = [...REST.p], r = [...REST.r];
  if (swingT >= 0) {
    swingT += dt / swingDur;
    const t = Math.min(swingT, 1), keys = ARCS[arcOf(heldId)];
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1], k = smoothstep(0, 1, (t - a[0]) / (b[0] - a[0]));
    for (let j = 0; j < 3; j++) { p[j] += lerp(a[1][j], b[1][j], k) * swingPow; r[j] += lerp(a[2][j], b[2][j], k) * swingPow; }
    if (swingT >= 1) swingT = -1;
  }
  if (player.eating) { // nese jídlo k puse a "kouše"
    const e = player.eating, k = Math.min(1, e.t * 5);
    p[0] = lerp(p[0], 0.06, k); p[1] = lerp(p[1], -0.26, k) + Math.abs(Math.sin(e.t * 9)) * 0.04 * k; p[2] = lerp(p[2], -0.38, k);
    r[0] = lerp(r[0], 0.5, k); r[1] = lerp(r[1], 0, k); r[2] = lerp(r[2], 0.15, k);
  }
  // vytažení předmětu: ruka vyjede zespodu
  if (equipT < 1) {
    equipT = Math.min(1, equipT + dt / 0.2);
    const k = 1 - smoothstep(0, 1, equipT);
    p[1] -= 0.38 * k; r[0] -= 0.6 * k;
  }
  // setrvačnost: ruka se trochu opozdí za otáčením kamery
  const dy = wrapAngle(player.yaw - lastYaw), dp = player.pitch - lastPitch;
  lastYaw = player.yaw; lastPitch = player.pitch;
  if (Math.abs(dy) < 1 && Math.abs(dp) < 1) { lagYaw += dy; lagPitch += dp; }
  const decay = Math.exp(-dt * 11);
  lagYaw = Math.max(-0.35, Math.min(0.35, lagYaw * decay));
  lagPitch = Math.max(-0.3, Math.min(0.3, lagPitch * decay));
  p[0] -= lagYaw * 0.12; p[1] -= lagPitch * 0.1;
  r[1] += lagYaw * 0.35; r[0] += lagPitch * 0.3;
  // houpání při chůzi (dva kroky = jeden kmit do stran)
  const sway = Math.min(moving / WALK, 1.5), d = player.bob * 0.5;
  p[0] += Math.sin(d) * 0.018 * sway;
  p[1] += -Math.abs(Math.cos(d)) * 0.022 * sway + 0.011 * sway;
  r[2] += Math.sin(d) * 0.03 * sway;
  holder.position.set(p[0], p[1], p[2]);
  holder.rotation.set(r[0], r[1], r[2]);
}
