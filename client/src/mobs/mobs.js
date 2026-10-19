// Tvorové: modely, chování, rození.
import '../player/interaction.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { Sound } from '../audio/sound.js';
import { NET, nearestTarget } from '../game/boot.js';
import { addItem, insertStack } from '../player/inventory.js';
import { player } from '../player/player.js';
import { damagePlayer } from '../player/survival.js';
import { bkey, nearLight, solidAt, specials } from '../render/blocks.js';
import { forestColliders, lumpy } from '../render/forest.js';
import { TIER_MAT, goldMat } from '../render/held-item.js';
import { debris, sparks } from '../render/particles.js';
import { scene } from '../render/renderer.js';
import { rockTex } from '../render/textures.js';
import { chests, invOpen, renderInventory, ui } from '../ui/inventory-ui.js';
import { solidAny } from '../world/structures.js';
import { blocks } from '../world/world-state.js';
import { BLOCKS } from '../../../shared/data/index.js';
import { randInt } from '../../../shared/util.js';
import { biomeAt, forest, isMark, shrineDist, shrineOf, terrainH } from '../../../shared/world/terrain.js';
import { VMIN, groundHeight } from '../../../shared/world/voxels.js';

// ============================================================ tvorové: ovce, kanci, stínožrouti
// Kořist z tvorů: [předmět, min, max, šance]
export const MOBS = {
  sheep: { name: 'Ovce', hp: 5, radius: 0.75, cy: 0.75, drops: [['raw_mutton', 1, 2], ['wool', 1, 2]] },
  boar: { name: 'Kanec', hp: 12, radius: 0.8, cy: 0.7, dmg: 10, drops: [['raw_pork', 2, 3], ['bone', 0, 1]] },
  chicken: { name: 'Slepice', hp: 4, radius: 0.45, cy: 0.45, drops: [['raw_chicken', 1, 1], ['egg', 0, 1]] },
  cow: { name: 'Kráva', hp: 10, radius: 0.95, cy: 1.0, drops: [['raw_beef', 2, 3], ['bone', 0, 1]] },
  deer: { name: 'Jelen', hp: 8, radius: 0.8, cy: 1.0, drops: [['raw_venison', 2, 3], ['bone', 0, 1]] },
  wolf: { name: 'Vlk', hp: 14, radius: 0.7, cy: 0.6, dmg: 8, drops: [['bone', 1, 3]] },
  crawler: { name: 'Stínožrout', hp: 10, radius: 0.7, cy: 0.5, dmg: 14, drops: [['essence', 1, 2]] },
  // Markomani: nepřátelští bojovníci Markovy dimenze v železné zbroji se železným mečem.
  markoman: {
    name: 'Markoman', hp: 26, radius: 0.75, cy: 1.1, dmg: 12, tall: true,
    drops: [['markapple', 1, 1, 0.3], ['iron', 1, 2, 0.4], ['markwood', 1, 2, 0.5], ['markorite_raw', 1, 1, 0.3], ['iron_sword', 1, 1, 0.08],
      ['iron_helmet', 1, 1, 0.04], ['iron_chestplate', 1, 1, 0.03], ['iron_leggings', 1, 1, 0.03], ['iron_boots', 1, 1, 0.04]],
  },
  golem: { name: 'Krystalový golem', hp: 60, radius: 1.2, cy: 1.5, dmg: 22, tall: true, drops: [['shard', 1, 3], ['markorite', 1, 1, 0.5], ['markapple', 1, 1, 0.25]] },
};
const HOSTILE_SPEED = { boar: 5.2, crawler: 4.7, markoman: 4.4, wolf: 6.2, golem: 2.4 };
export const mobs = [];
const shadowGeo = new THREE.CircleGeometry(0.75, 20).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.22, 0.04), fog: false });

function buildMob(type) {
  const g = new THREE.Group(), legs = [], arms = [];
  const mat = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });
  const mesh = (geo, m, x, y, z, parent = g) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); parent.add(me); return me; };
  const leg = (m, x, y, z, len, w = 0.13) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    mesh(new THREE.BoxGeometry(w, len, w).translate(0, -len / 2, 0), m, 0, 0, 0, pivot);
    g.add(pivot);
    legs.push(pivot);
    return pivot;
  };
  const limb = (m, x, y, w, len) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    mesh(new THREE.BoxGeometry(w, len, w).translate(0, -len / 2, 0), m, 0, 0, 0, pivot);
    g.add(pivot);
    return pivot;
  };
  let body;
  if (type === 'sheep') {
    const wool = mat({ color: 0xe9e4d8, flatShading: true }), dark = mat({ color: 0x2b2522 });
    body = mesh(lumpy(new THREE.IcosahedronGeometry(1, 2), 0.12, 5), wool, 0, 0.78, 0);
    body.scale.set(0.5, 0.42, 0.72);
    mesh(new THREE.BoxGeometry(0.28, 0.32, 0.36), dark, 0, 0.92, -0.72);
    mesh(new THREE.BoxGeometry(0.34, 0.2, 0.2), wool, 0, 1.05, -0.62);
    for (const [x, z] of [[-0.2, -0.38], [0.2, -0.38], [-0.2, 0.38], [0.2, 0.38]]) leg(dark, x, 0.5, z, 0.5);
  } else if (type === 'boar') {
    const fur = mat({ color: 0x4e3424, flatShading: true }), dark = mat({ color: 0x2a1c14 }), pink = mat({ color: 0x9a6a5a }), tusk = mat({ color: 0xeee6d2, roughness: 0.5 });
    body = mesh(lumpy(new THREE.IcosahedronGeometry(1, 2), 0.1, 2), fur, 0, 0.72, 0);
    body.scale.set(0.48, 0.45, 0.85);
    mesh(new THREE.BoxGeometry(0.4, 0.38, 0.42), fur, 0, 0.74, -0.88);
    mesh(new THREE.BoxGeometry(0.22, 0.17, 0.14), pink, 0, 0.66, -1.14);
    for (const x of [-0.11, 0.11]) mesh(new THREE.ConeGeometry(0.03, 0.16, 5), tusk, x, 0.66, -1.12).rotation.x = -0.4;
    for (const x of [-0.13, 0.13]) mesh(new THREE.SphereGeometry(0.035, 6, 4), eyeMat.clone(), x, 0.84, -1.09).material.color.setRGB(0.05, 0.03, 0.02);
    for (const [x, z] of [[-0.22, -0.5], [0.22, -0.5], [-0.22, 0.5], [0.22, 0.5]]) leg(dark, x, 0.45, z, 0.45);
  } else if (type === 'chicken') {
    const white = mat({ color: 0xf2f0ea, flatShading: true }), red = mat({ color: 0xd02a20 }), yellow = mat({ color: 0xf0b030 });
    body = mesh(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.08, 3), white, 0, 0.42, 0);
    body.scale.set(0.24, 0.24, 0.32);
    const head = mesh(new THREE.BoxGeometry(0.18, 0.2, 0.18), white, 0, 0.68, -0.26);
    mesh(new THREE.BoxGeometry(0.05, 0.08, 0.12), red, 0, 0.14, 0, head); // hřebínek
    mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), yellow, 0, 0, -0.12, head); // zobák
    mesh(new THREE.BoxGeometry(0.04, 0.07, 0.03), red, 0, -0.07, -0.1, head); // lalůček
    const tail = mesh(new THREE.BoxGeometry(0.16, 0.2, 0.06), white, 0, 0.55, 0.3);
    tail.rotation.x = -0.4;
    for (const x of [-0.08, 0.08]) leg(yellow, x, 0.22, 0, 0.22, 0.04);
  } else if (type === 'cow') {
    const hide = mat({ color: 0xf0ece4, flatShading: true }), spot = mat({ color: 0x1e1a18 }), pink = mat({ color: 0xe0a0a0 }), horn = mat({ color: 0xe8e0c8 });
    body = mesh(new THREE.BoxGeometry(1, 0.78, 1.6), hide, 0, 1.05, 0);
    for (const [x, y, z, w, h, d] of [[0.51, 0.1, 0.2, 0.02, 0.4, 0.5], [-0.51, -0.05, -0.3, 0.02, 0.35, 0.45], [0.1, 0.4, -0.2, 0.5, 0.02, 0.4], [-0.2, 0.4, 0.45, 0.4, 0.02, 0.3]])
      mesh(new THREE.BoxGeometry(w, h, d), spot, x, y, z, body);
    const head = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.45), hide, 0, 1.35, -0.98);
    mesh(new THREE.BoxGeometry(0.42, 0.22, 0.1), pink, 0, -0.12, -0.25, head); // čenich
    for (const sx of [-1, 1]) {
      mesh(new THREE.BoxGeometry(0.06, 0.14, 0.06), horn, sx * 0.2, 0.3, 0, head);
      mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), spot, sx * 0.13, 0.06, -0.23, head);
    }
    mesh(new THREE.BoxGeometry(0.28, 0.12, 0.3), pink, 0, 0.6, 0.35); // vemeno
    for (const [x, z] of [[-0.32, -0.6], [0.32, -0.6], [-0.32, 0.6], [0.32, 0.6]]) leg(spot, x, 0.66, z, 0.66, 0.18);
  } else if (type === 'deer') {
    // Jelen: dlouhé nohy, krk, parohy; plachý, utíká.
    const fur = mat({ color: 0x8a5a32, flatShading: true }), dark = mat({ color: 0x3a2616 }), light = mat({ color: 0xe8dcc8 }), antler = mat({ color: 0xd8c8a0 });
    body = mesh(lumpy(new THREE.IcosahedronGeometry(1, 2), 0.08, 7), fur, 0, 1.05, 0);
    body.scale.set(0.36, 0.38, 0.78);
    const neck = mesh(new THREE.BoxGeometry(0.2, 0.55, 0.2), fur, 0, 1.4, -0.65);
    neck.rotation.x = 0.5;
    mesh(new THREE.BoxGeometry(0.24, 0.24, 0.42), fur, 0, 1.65, -0.9);
    mesh(new THREE.BoxGeometry(0.12, 0.12, 0.08), light, 0, 0.98, 0.78);
    for (const s of [-1, 1]) {
      const a = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.45, 5), antler, s * 0.1, 1.95, -0.85);
      a.rotation.z = -s * 0.5;
      const b = mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.22, 5), antler, s * 0.22, 2.08, -0.8);
      b.rotation.set(0.6, 0, -s * 0.2);
    }
    for (const [x, z] of [[-0.18, -0.48], [0.18, -0.48], [-0.18, 0.48], [0.18, 0.48]]) leg(dark, x, 0.82, z, 0.82, 0.1);
  } else if (type === 'wolf') {
    // Vlk: šedý, štíhlý, žluté oči, v noci loví.
    const fur = mat({ color: 0x6a6a72, flatShading: true }), dark = mat({ color: 0x3a3a40 });
    const yellow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2, 0.3), fog: false });
    body = mesh(lumpy(new THREE.IcosahedronGeometry(1, 2), 0.08, 9), fur, 0, 0.66, 0);
    body.scale.set(0.3, 0.3, 0.66);
    const head = mesh(new THREE.BoxGeometry(0.3, 0.28, 0.34), fur, 0, 0.8, -0.72);
    mesh(new THREE.BoxGeometry(0.16, 0.13, 0.2), dark, 0, -0.06, -0.24, head);
    for (const s of [-1, 1]) {
      mesh(new THREE.ConeGeometry(0.06, 0.14, 4), fur, s * 0.09, 0.2, 0.04, head);
      mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), yellow, s * 0.07, 0.04, -0.175, head);
    }
    const tail = mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.45, 6), fur, 0, 0.7, 0.75);
    tail.rotation.x = 1.0;
    for (const [x, z] of [[-0.14, -0.4], [0.14, -0.4], [-0.14, 0.4], [0.14, 0.4]]) leg(dark, x, 0.55, z, 0.55, 0.1);
  } else if (type === 'markoman') {
    // Humanoid v železné zbroji se železným mečem; nohy a ruce na kloubech kvůli animaci.
    const iron = mat({ color: 0xc4cad4, roughness: 0.35, metalness: 0.85 }), ironDark = mat({ color: 0x8a909a, roughness: 0.45, metalness: 0.8 });
    const skin = mat({ color: 0x6f86b8 });
    const glowEye = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.4, 3), fog: false });
    legs.push(limb(ironDark, -0.14, 0.9, 0.22, 0.9), limb(ironDark, 0.14, 0.9, 0.22, 0.9));
    body = mesh(new THREE.BoxGeometry(0.6, 0.74, 0.34), iron, 0, 1.26, 0);
    mesh(new THREE.BoxGeometry(0.64, 0.08, 0.38), ironDark, 0, -0.32, 0, body); // opasek
    const head = mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin, 0, 1.86, 0);
    for (const ex of [-0.1, 0.1]) mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), glowEye, ex, 0.03, -0.215, head);
    mesh(new THREE.BoxGeometry(0.47, 0.16, 0.47), iron, 0, 0.18, 0, head); // železná helma
    mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), iron, 0, 0.0, -0.23, head); // nosník helmy
    arms.push(limb(iron, -0.41, 1.58, 0.18, 0.72), limb(iron, 0.41, 1.58, 0.18, 0.72));
    const sword = new THREE.Group();
    sword.position.set(0, -0.68, -0.05);
    sword.rotation.x = -Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.07, 0.75, 0.02).translate(0, 0.45, 0), TIER_MAT[3], 0, 0, 0, sword);
    mesh(new THREE.BoxGeometry(0.24, 0.04, 0.06), goldMat, 0, 0.06, 0, sword);
    arms[1].add(sword);
  } else if (type === 'golem') {
    // Krystalový golem: obří kamenný strážce Markovy dimenze se svítícími krystaly na zádech.
    const stone = mat({ map: rockTex, color: 0x8a86a8, flatShading: true });
    const crystal = mat({ color: 0xbff8ff, emissive: 0x3fdcff, emissiveIntensity: 1.6, roughness: 0.2 });
    crystal.userData.glow = true;
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.6, 3), fog: false });
    legs.push(limb(stone, -0.32, 0.9, 0.42, 0.9), limb(stone, 0.32, 0.9, 0.42, 0.9));
    body = mesh(new THREE.BoxGeometry(1.25, 1.2, 0.8), stone, 0, 1.55, 0);
    const head = mesh(new THREE.BoxGeometry(0.6, 0.55, 0.55), stone, 0, 2.4, -0.05);
    for (const ex of [-0.14, 0.14]) mesh(new THREE.BoxGeometry(0.12, 0.07, 0.02), glow, ex, 0.04, -0.28, head);
    for (let i = 0; i < 5; i++) {
      const c = mesh(new THREE.OctahedronGeometry(0.18).scale(1, 1.8, 1), crystal, (i - 2) * 0.24, 0.45 + Math.abs(i - 2) * -0.08, 0.42, body);
      c.rotation.x = -0.4;
    }
    arms.push(limb(stone, -0.82, 2.05, 0.38, 1.3), limb(stone, 0.82, 2.05, 0.38, 1.3));
  } else {
    body = mesh(new THREE.SphereGeometry(0.6, 22, 16), mat({ color: 0x0e0a12, roughness: 0.35, metalness: 0.2 }), 0, 0.48, 0);
    body.scale.set(1, 0.8, 1.15);
    for (const sx of [-0.2, 0.2]) mesh(new THREE.SphereGeometry(0.075, 10, 8), eyeMat, sx, 0.12, -0.6, body);
    const spikeMat = mat({ color: 0x120c16, roughness: 0.5 });
    for (let i = 0; i < 5; i++) {
      const sp = mesh(new THREE.ConeGeometry(0.11, 0.5, 6), spikeMat, (i - 2) * 0.14, 0.5 - Math.abs(i - 2) * 0.06, 0.1 + Math.abs(i - 2) * 0.05, body);
      sp.rotation.set(-0.5, 0, (i - 2) * -0.35);
    }
  }
  if (type === 'golem') g.scale.setScalar(1.1);
  const mats = [];
  g.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial && !mats.includes(o.material)) mats.push(o.material); });
  return { group: g, body, legs, mats, arms, bodyY: body.position.y };
}
// y: výška (jen u tvorů ze spawneru v podzemí); jinak stojí na povrchu.
export function spawnMob(type, x, z, y) {
  const m = buildMob(type);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  scene.add(m.group, shadow);
  const def = MOBS[type];
  const under = y !== undefined && y < terrainH(x, z) - 2;
  mobs.push({
    nid: ++NET.mobN, type, def, ...m, shadow, under, vy: 0, pos: new THREE.Vector3(x, y ?? terrainH(x, z), z), vel: new THREE.Vector3(), hp: def.hp,
    phase: Math.random() * 6, flash: 0, cd: 0, dead: false, deathT: 0, wander: Math.random() * 6.28, moving: false, idleT: Math.random() * 3,
    fleeT: 0, aggro: false, soundT: 3 + Math.random() * 8,
  });
}
export function removeMob(m) {
  scene.remove(m.group, m.shadow);
  mobs.splice(mobs.indexOf(m), 1);
}
export function hitMob(m, dmg, yaw = player.yaw) {
  if (NET.client) { // útok jde hostiteli, tady jen odezva
    NET.req(['hit', m.nid, dmg, player.yaw]);
    m.flash = 1;
    sparks.emit(m.pos.x, m.pos.y + m.def.cy, m.pos.z, m.type === 'crawler' ? [0.7, 0.25, 1.0] : [1, 0.25, 0.2], 18, 3.5, 1.5);
    Sound.hit();
    player.shake = 0.1;
    return;
  }
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  m.hp -= dmg;
  m.flash = 1;
  const kb = m.type === 'golem' ? 2 : 8;
  m.vel.x += fx * kb;
  m.vel.z += fz * kb;
  sparks.emit(m.pos.x, m.pos.y + m.def.cy, m.pos.z, m.type === 'crawler' ? [0.7, 0.25, 1.0] : m.type === 'golem' ? [0.4, 0.9, 1] : [1, 0.25, 0.2], 18, 3.5, 1.5);
  Sound.hit();
  if (!NET.killer) player.shake = 0.1;
  if (m.type === 'sheep' || m.type === 'deer' || m.type === 'chicken' || m.type === 'cow') { m.fleeT = 5; if (m.type === 'sheep') Sound.baa(); }
  if (m.type === 'boar' || m.type === 'wolf') { m.aggro = true; Sound.grunt(); }
  if (m.hp <= 0) killMob(m, true);
}
// Kořist: ze zabití hráčem jde do batohu; z pasti (hroty) do nejbližší truhly do 5 bloků – základ farmy.
function killMob(m, drops, trap = false) {
  m.dead = true;
  sparks.emit(m.pos.x, m.pos.y + m.def.cy, m.pos.z, m.type === 'crawler' ? [0.6, 0.2, 1.0] : [0.9, 0.85, 0.75], 50, 5, 2);
  if (m.type === 'crawler' || m.type === 'markoman' || m.type === 'golem') Sound.kill();
  if (!drops) return;
  let chest = null;
  if (trap) {
    let best = 26;
    for (const [k, arr] of chests) {
      const [x, y, z] = k.split(',').map(Number);
      const d2 = (x + 0.5 - m.pos.x) ** 2 + (y - m.pos.y) ** 2 + (z + 0.5 - m.pos.z) ** 2;
      if (d2 < best && blocks.get(k) === 'chest') { best = d2; chest = arr; }
    }
  }
  const nearPlayer = Math.hypot(m.pos.x - player.pos.x, m.pos.y - player.pos.y, m.pos.z - player.pos.z) < 24;
  for (const [id, a, b, chance] of m.def.drops) {
    if (chance !== undefined && Math.random() >= chance) continue;
    const n = randInt(a, b);
    if (chest) insertStack(chest, { id, n });
    else if (NET.killer) NET.give(NET.killer, id, n); // zabil ho jiný hráč
    else if (nearPlayer) addItem(id, n);
  }
  if (chest && invOpen && ui.mode === 'chest') renderInventory();
}
export const playerSafe = () => shrineDist(player.pos.x, player.pos.z) < 11 || nearLight(player.pos.x, player.pos.z, 5);
// Podlaha pod tvorem v podzemí: nejvyšší pevný blok do 1 bloku nad jeho nohama.
export function voxFloor(x, y, z) {
  const fx = Math.floor(x), fz = Math.floor(z);
  for (let cy = Math.floor(y + 1.05) - 1; cy >= Math.floor(y) - 12; cy--) if (solidAny(fx, cy, fz)) return cy + 1;
  return VMIN;
}

export function updateMobs(dt, day) {
  const TG = NET.targets(); // hráči, na které tvorové reagují
  for (const m of [...mobs]) {
    if (m.dead) {
      m.deathT += dt;
      m.group.scale.setScalar(Math.max(0.01, 1 - m.deathT * 2.5));
      m.group.rotation.z += dt * 6;
      if (m.deathT > 0.4) removeMob(m);
      continue;
    }
    const T = nearestTarget(TG, m.pos), tp = T.pos;
    const dx = tp.x - m.pos.x, dz = tp.z - m.pos.z, dist = Math.hypot(dx, dz) || 0.01;
    const dyP = tp.y - m.pos.y;
    if (dist > 120) { removeMob(m); continue; }
    let dirX = 0, dirZ = 0, speed = 0;
    const wander = (sp) => {
      if ((m.idleT -= dt) <= 0) { m.moving = !m.moving; m.idleT = 2 + Math.random() * 4; m.wander = Math.random() * Math.PI * 2; }
      if (m.moving) { dirX = Math.cos(m.wander); dirZ = Math.sin(m.wander); speed = sp; }
    };
    const night = day < 0.4;
    let hostile = !T.creative && (m.type === 'crawler' || m.type === 'markoman' || m.type === 'golem' || ((m.type === 'boar' || m.type === 'wolf') && m.aggro) || (m.type === 'wolf' && night));
    if (m.type === 'crawler' && T.set === 'shadow') hostile = false; // stínové brnění
    if (m.type === 'deer' && dist < 7 && !T.creative) m.fleeT = Math.max(m.fleeT, 2); // plachý
    if (m.type === 'chicken' && (m.eggT = (m.eggT ?? 20 + Math.random() * 30) - dt) <= 0) { m.eggT = 35 + Math.random() * 30; m.eggs = Math.min(2, (m.eggs || 0) + 1); }
    if (m.type === 'cow' && m.milkT > 0) m.milkT -= dt;
    if ((m.type === 'sheep' || m.type === 'deer' || m.type === 'chicken' || m.type === 'cow') && m.fleeT > 0) {
      m.fleeT -= dt; dirX = -dx / dist; dirZ = -dz / dist; speed = m.type === 'deer' ? 7 : 5.5;
    } else if (hostile && T.alive && Math.abs(dyP) < 5 && dist < (m.type === 'crawler' ? 26 : 30) && !(m.type !== 'boar' && shrineDist(tp.x, tp.z) < 11) && !(m.type === 'crawler' && T.safe)) {
      dirX = dx / dist; dirZ = dz / dist; speed = HOSTILE_SPEED[m.type];
    } else {
      if ((m.type === 'boar' || m.type === 'wolf') && dist > 30) m.aggro = false;
      wander(m.type === 'crawler' ? 1.3 : m.type === 'golem' ? 0.8 : 1.0);
    }
    if (m.type === 'crawler' || m.type === 'markoman' || m.type === 'golem' || m.type === 'wolf') {
      const sh = shrineOf(m.pos.x), sd = shrineDist(m.pos.x, m.pos.z);
      if (sd < 13) { dirX = (m.pos.x - sh.x) / sd; dirZ = (m.pos.z - sh.z) / sd; speed = 3; }
    }
    if (m.type === 'crawler') {
      for (const s of specials.values()) {
        if (!BLOCKS[s.type].light || s.type === 'spawner') continue;
        const lx = m.pos.x - (s.x + 0.5), lz = m.pos.z - (s.z + 0.5), ld = Math.hypot(lx, lz);
        if (ld < 6) { dirX = lx / ld; dirZ = lz / ld; speed = 3; }
      }
      // Na denním světle shoří (v podzemí ne).
      if (day > 0.75 && !m.under) { m.hp -= dt * 2.5; if (Math.random() < dt * 20) debris.emit(m.pos.x, m.pos.y + 0.8, m.pos.z, [0.1, 0.1, 0.1], 2, 1, 2); if (m.hp <= 0) { killMob(m, false); continue; } }
    }

    const k = Math.min(1, dt * 4);
    m.vel.x += (dirX * speed - m.vel.x) * k;
    m.vel.z += (dirZ * speed - m.vel.z) * k;
    const nx = m.pos.x + m.vel.x * dt, nz = m.pos.z + m.vel.z * dt;
    const bounce = () => { m.vel.x *= -0.3; m.vel.z *= -0.3; m.wander += Math.PI; };
    const h = m.def.tall ? 2 : 1;
    if (m.under) {
      // Pod zemí (kobky, jeskyně): chůze po blocích, schod max. 1 blok, pád s gravitací.
      const fl = voxFloor(nx, m.pos.y, nz);
      let blocked = fl > m.pos.y + 1.05;
      for (let i = 0; i < h && !blocked; i++) if (solidAny(Math.floor(nx), Math.floor(Math.max(fl, m.pos.y)) + i, Math.floor(nz))) blocked = true;
      if (blocked) bounce(); else { m.pos.x = nx; m.pos.z = nz; }
      const floor = voxFloor(m.pos.x, m.pos.y, m.pos.z);
      if (floor >= m.pos.y) { m.pos.y = floor; m.vy = 0; }
      else { m.vy -= 18 * dt; m.pos.y = Math.max(floor, m.pos.y + m.vy * dt); if (m.pos.y === floor) m.vy = 0; }
    } else {
      const gy = groundHeight(nx, nz);
      // Do vykopané díry ani do zdi tvorové na povrchu nevlezou.
      let blocked = !isFinite(gy);
      for (let i = 0; i < h && !blocked; i++) if (solidAt(Math.floor(nx), Math.floor(gy + 0.5) + i, Math.floor(nz))) blocked = true;
      if (blocked) bounce(); else { m.pos.x = nx; m.pos.z = nz; }
      for (const c of forestColliders) {
        const ox = m.pos.x - c.x, oz = m.pos.z - c.z, d = Math.hypot(ox, oz), min = c.r + 0.55;
        if (d < min && d > 1e-4) { m.pos.x = c.x + (ox / d) * min; m.pos.z = c.z + (oz / d) * min; }
      }
      const my = groundHeight(m.pos.x, m.pos.z);
      if (isFinite(my)) m.pos.y = my;
      // Stojí-li na položeném bloku (podlaha pevnosti), vyleze na něj.
      const bf = Math.floor(m.pos.y + 0.05);
      if (solidAt(Math.floor(m.pos.x), bf, Math.floor(m.pos.z))) m.pos.y = bf + 1;
    }
    // Hroty: zraňují tvory, kteří na nich stojí; kořist padá do truhly.
    if (blocks.get(bkey(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.1), Math.floor(m.pos.z))) === 'spikes') {
      m.hp -= 9 * dt;
      m.flash = Math.max(m.flash, 0.4);
      if (m.hp <= 0) { killMob(m, true, true); continue; }
    }

    const sp = Math.hypot(m.vel.x, m.vel.z);
    m.phase += dt * (sp * 2.2 + (m.type === 'crawler' ? 2 : 0));
    let hop = 0;
    if (m.type === 'crawler') {
      hop = Math.abs(Math.sin(m.phase)) * (sp > 2 ? 0.5 : 0.18);
      const squash = 1 + Math.cos(m.phase * 2) * 0.12;
      m.body.scale.set(1 / Math.sqrt(squash), 0.8 * squash, 1.15 / Math.sqrt(squash));
    } else if (m.arms.length) {
      const swing = Math.sin(m.phase * (m.type === 'golem' ? 1.1 : 1.6)) * Math.min(sp / 2, 1) * 0.8;
      m.legs[0].rotation.x = swing;
      m.legs[1].rotation.x = -swing;
      m.arms[0].rotation.x = -swing * 0.8;
      m.atkT = Math.max(0, (m.atkT || 0) - dt);
      m.arms[1].rotation.x = m.atkT > 0 ? -2.4 * Math.sin((1 - m.atkT / 0.35) * Math.PI) : swing * 0.6 - (dist < 6 && m.type === 'markoman' ? 0.6 : 0);
      if (m.type === 'golem' && m.atkT > 0) m.arms[0].rotation.x = m.arms[1].rotation.x;
    } else {
      const swing = Math.sin(m.phase * 2.2) * Math.min(sp / 2, 1) * 0.7;
      m.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? 1 : -1) * swing));
      m.body.position.y = m.bodyY + Math.abs(swing) * 0.03;
    }
    m.group.position.set(m.pos.x, m.pos.y + hop, m.pos.z);
    m.shadow.position.set(m.pos.x, m.pos.y + 0.03, m.pos.z);
    if (sp > 0.15) m.group.rotation.y = Math.atan2(-m.vel.x, -m.vel.z);

    m.flash = Math.max(0, m.flash - dt * 5);
    for (const mat of m.mats) if (!mat.userData.glow) mat.emissive.setRGB(m.flash * 1.5, m.flash * 1.5, m.flash * 1.5);
    m.cd -= dt;
    const reach = { markoman: 1.7, golem: 2.4 }[m.type] || 1.4;
    if (hostile && dist < reach && Math.abs(dyP) < 2 && m.cd <= 0 && T.alive) {
      m.cd = m.type === 'golem' ? 1.6 : m.type === 'wolf' ? 0.8 : 1.1;
      m.atkT = 0.35;
      if (m.arms.length) Sound.swing();
      if (T.pid) NET.sendTo(T.pid, ['dmg', m.def.dmg, dx / dist, dz / dist]); else damagePlayer(m.def.dmg, dx / dist, dz / dist);
      m.vel.x -= (dx / dist) * 4;
      m.vel.z -= (dz / dist) * 4;
    }
    if ((m.soundT -= dt) <= 0) {
      m.soundT = 5 + Math.random() * 10;
      if (dist < 25) ({ sheep: () => Sound.baa(), crawler: () => Sound.growl(), wolf: () => Sound.howl(), deer: () => {}, chicken: () => Sound.cluck(), cow: () => Sound.moo() }[m.type] || (() => Sound.grunt()))();
    }
  }
}
let spawnT = 3;
export function updateSpawns(dt, night) {
  if ((spawnT -= dt) > 0) return;
  spawnT = 2;
  const c = NET.spawnCenter(); // tvorové se rodí kolem některého z hráčů
  // zvěř se nepase v poušti a na sopce
  const grazing = () => { const p = spot(); return p && !['desert', 'volcanic'].includes(biomeAt(p[0], p[1])) ? p : null; };
  const count = (t) => mobs.filter((m) => m.type === t && !m.dead).length;
  const spot = () => {
    const a = Math.random() * Math.PI * 2, r = 35 + Math.random() * 25;
    const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    return shrineDist(x, z) < 35 || nearLight(x, z, 12) ? null : [x, z];
  };
  if (isMark(c.x)) { // Markova dimenze: Markomani a krystaloví golemové
    if (count('markoman') < (night > 0.5 ? 8 : 5)) { const p = spot(); if (p) spawnMob('markoman', ...p); }
    if (count('golem') < 2) { const p = spot(); if (p) spawnMob('golem', ...p); }
    return;
  }
  if (night > 0.5 && count('crawler') < 7) { const p = spot(); if (p) spawnMob('crawler', ...p); }
  if (night > 0.5 && count('wolf') < 4) { const p = grazing(); if (p && forest(...p) > 0.5) for (let i = 0; i < 2; i++) spawnMob('wolf', p[0] + i * 2, p[1]); }
  if (count('sheep') < 6) {
    const p = spot();
    if (p && forest(...p) < 0.55) for (let i = 0; i < randInt(2, 3); i++) spawnMob('sheep', p[0] + Math.random() * 4, p[1] + Math.random() * 4);
  }
  if (count('boar') < 3) { const p = grazing(); if (p && forest(...p) > 0.45) spawnMob('boar', ...p); }
  if (count('chicken') < 5) { const p = grazing(); if (p && forest(...p) < 0.55) for (let i = 0; i < randInt(2, 4); i++) spawnMob('chicken', p[0] + Math.random() * 3, p[1] + Math.random() * 3); }
  if (count('cow') < 4) { const p = grazing(); if (p && forest(...p) < 0.5) for (let i = 0; i < 2; i++) spawnMob('cow', p[0] + i * 3, p[1] + i * 2); }
  if (night < 0.5 && count('deer') < 4) { const p = grazing(); if (p && forest(...p) > 0.35) for (let i = 0; i < 2; i++) spawnMob('deer', p[0] + i * 3, p[1] + i); }
}
