// Tvorové v prohlížeči: 3D modely, animace, zvuky a jiskry. Chování a rození je v shared/sim/mobs.js.
import '../player/interaction.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { on } from '../../../shared/events.js';
import { NET } from '../../../shared/net/net.js';
import { DEATH_TIME, hurtMob, mobs } from '../../../shared/sim/mobs.js';
import { MOB_INVULN } from '../../../shared/tools.js';
import { nearLight } from '../../../shared/world/collision.js';
import { shrineDist } from '../../../shared/world/terrain.js';
import { Sound } from '../audio/sound.js';
import { toolSound } from '../audio/tool-sounds.js';
import { addItem } from '../player/inventory.js';
import { player } from '../player/player.js';
import { damagePlayer } from '../player/survival.js';
import { lumpy } from '../render/forest.js';
import { TIER_MAT, goldMat } from '../render/held-item.js';
import { emitChips, emitStars } from '../render/chips.js';
import { debris, sparks } from '../render/particles.js';
import { scene } from '../render/renderer.js';
import { rockTex } from '../render/textures.js';
import { invOpen, renderInventory, ui } from '../ui/inventory-ui.js';

// ============================================================ tvorové: ovce, kanci, stínožrouti
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
  g.traverse((o) => { if (o.isMesh && o.material.userData.shared) o.material = o.material.clone(); }); // zčervenání při zásahu nesmí obarvit meč v ruce
  g.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial && !mats.includes(o.material)) mats.push(o.material); });
  return { group: g, body, legs, mats, arms, bodyY: body.position.y };
}

// ---------- 3D modely tvorů (pravidla a chování jsou v shared/sim/mobs.js): tvor -> { group, body, legs, arms, mats, bodyY, shadow }
const views = new Map();
export function viewOf(m) {
  let V = views.get(m);
  if (!V) {
    V = buildMob(m.type);
    V.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    V.group.position.set(m.pos.x, m.pos.y, m.pos.z);
    V.group.rotation.y = m.ry;
    scene.add(V.group, V.shadow);
    views.set(m, V);
  }
  return V;
}
// Každý snímek: model pro nového tvora, pryč s modelem tvora, který zmizel.
export function syncMobViews() {
  for (const m of mobs) viewOf(m);
  if (views.size > mobs.length) {
    const alive = new Set(mobs);
    for (const [m, V] of views) if (!alive.has(m)) { scene.remove(V.group, V.shadow); views.delete(m); }
  }
}
// Animace tvorů, které simuluje tato hra (hra pro jednoho, hostitel): volá se hned po updateMobs se stejným dt.
export function animateMobs(dt) {
  for (const m of mobs) {
    const V = viewOf(m);
    if (m.dead) { animateDeath(V, m); continue; }
    const sp = Math.hypot(m.vel.x, m.vel.z);
    m.phase += dt * (sp * 2.2 + (m.type === 'crawler' ? 2 : 0));
    let hop = 0;
    if (m.type === 'crawler') {
      hop = Math.abs(Math.sin(m.phase)) * (sp > 2 ? 0.5 : 0.18);
      const squash = 1 + Math.cos(m.phase * 2) * 0.12;
      V.body.scale.set(1 / Math.sqrt(squash), 0.8 * squash, 1.15 / Math.sqrt(squash));
    } else if (V.arms.length) {
      const swing = Math.sin(m.phase * (m.type === 'golem' ? 1.1 : 1.6)) * Math.min(sp / 2, 1) * 0.8;
      V.legs[0].rotation.x = swing;
      V.legs[1].rotation.x = -swing;
      V.arms[0].rotation.x = -swing * 0.8;
      m.atkT = Math.max(0, (m.atkT || 0) - dt);
      V.arms[1].rotation.x = m.atkT > 0 ? -2.4 * Math.sin((1 - m.atkT / 0.35) * Math.PI) : swing * 0.6 - (m.tdist < 6 && m.type === 'markoman' ? 0.6 : 0);
      if (m.type === 'golem' && m.atkT > 0) V.arms[0].rotation.x = V.arms[1].rotation.x;
    } else {
      const swing = Math.sin(m.phase * 2.2) * Math.min(sp / 2, 1) * 0.7;
      V.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? 1 : -1) * swing));
      V.body.position.y = V.bodyY + Math.abs(swing) * 0.03;
    }
    V.group.position.set(m.pos.x, m.pos.y + hop + hitHop(m, dt), m.pos.z);
    V.shadow.position.set(m.pos.x, m.pos.y + 0.03, m.pos.z);
    V.group.rotation.y = m.ry;
    paintFlash(V, m.flash);
  }
}
// Zásah: tvor zčervená (jako v Minecraftu). Svítící části (oči, krystaly) zůstanou.
const FLASH_RED = new THREE.Color(0.9, 0.06, 0.04);
export function paintFlash(V, f) {
  if (V.lastFlash === f) return;
  V.lastFlash = f;
  for (const mat of V.mats) {
    if (mat.userData.glow) continue;
    const base = (mat.userData.baseColor ??= mat.color.clone()); // bílá ovce musí zčervenat, ne jen zesvětlat
    mat.color.copy(base).lerp(FLASH_RED, f * 0.7);
    mat.emissive.setRGB(f * 0.45, f * 0.02, 0);
  }
}
// Po zásahu tvor krátce poskočí (odhození vypadá jako rána, ne jako posun)
export function hitHop(m, dt) {
  if (!(m.hitHop > 0)) return 0;
  m.hitHop = Math.max(0, m.hitHop - dt);
  return Math.sin((1 - m.hitHop / 0.28) * Math.PI) * 0.28;
}
// Smrt: tvor se převrátí na bok, zčervená a rozplyne se v obláčku kouře
export function animateDeath(V, m) {
  const k = Math.min(1, m.deathT / 0.35);
  V.baseScale ??= V.group.scale.x;
  V.group.rotation.z = (m.nid % 2 ? 1 : -1) * k * k * (Math.PI / 2);
  const fade = Math.max(0, Math.min(1, (DEATH_TIME - m.deathT) / 0.2));
  V.group.scale.setScalar(Math.max(0.01, fade) * V.baseScale);
  V.shadow.visible = fade > 0.5;
  paintFlash(V, 0.55);
  if (!m.puffed && m.deathT > DEATH_TIME - 0.22) {
    m.puffed = true;
    const at = [m.pos.x, m.pos.y + m.def.cy * 0.6, m.pos.z];
    debris.emit(...at, [0.8, 0.8, 0.82], 26, 1.4, 1.4);
    if (m.type === 'crawler' || m.type === 'markoman' || m.type === 'golem') sparks.emit(...at, m.type === 'golem' ? [0.4, 0.9, 1] : [0.6, 0.25, 1], 20, 2, 1.5);
    toolSound('poof');
  }
}

// ---------- útok hráče u této obrazovky; připojený hráč posílá ránu hostiteli
// kb = síla odhození, fx = { crit, charge } jen pro efekty. Vrací false, když byl tvor ještě nezranitelný.
let localFx = null;
export function hitMob(m, dmg, yaw = player.yaw, kb = 1, fx = {}) {
  if (NET.client) { // útok jde hostiteli, tady jen odezva
    const now = performance.now() / 1000;
    if (m.dead || now - (m.hitAt || -9) < MOB_INVULN) return false;
    m.hitAt = now;
    NET.req(['hit', m.nid, dmg, yaw, kb]);
    m.flash = 1;
    hitFx(m, dmg, true, fx);
    return true;
  }
  localFx = fx;
  try { return hurtMob(m, dmg, yaw, kb); } finally { localFx = null; }
}
const HIT_COL = { crawler: [[0.45, 0.15, 0.7], [0.2, 0.05, 0.3]], golem: [[0.45, 0.95, 1], [0.7, 0.75, 0.8]], markoman: [[0.55, 0.06, 0.06], [0.7, 0.72, 0.76]] };
// Odezva zásahu: jiskry, kapky (kostičky), u kritického zásahu hvězdičky, zvuk a poskočení
function hitFx(m, dmg, local, fx) {
  const at = [m.pos.x, m.pos.y + m.def.cy, m.pos.z];
  sparks.emit(...at, m.type === 'crawler' ? [0.7, 0.25, 1.0] : m.type === 'golem' ? [0.4, 0.9, 1] : [1, 0.3, 0.2], 8 + Math.min(16, Math.round(dmg * 1.5)), 3.5, 1.5);
  emitChips(at, HIT_COL[m.type] || [[0.6, 0.05, 0.05], [0.35, 0.02, 0.03]], Math.min(14, 3 + Math.round(dmg)), { speed: 1.8, up: 2, size: [0.03, 0.06], life: [0.3, 0.8], spread: m.def.radius * 0.6 });
  m.hitHop = 0.28;
  if (fx?.crit) { emitStars(at, [1, 0.92, 0.55], 16, 3.5); toolSound('crit'); }
  if (local) toolSound((fx?.charge ?? 1) < 0.5 ? 'weak' : 'hit', fx?.charge ?? 1); else mobAt(m, () => Sound.hit()); // rána jiného hráče zní od tvora
}
export const playerSafe = () => shrineDist(player.pos.x, player.pos.z) < 11 || nearLight(player.pos.x, player.pos.z, 5);

// ---------- co se děje s tvory (události z pravidel): jiskry, zvuky, kořist, zranění
// Zvuky tvorů znějí z místa, kde tvor je (směr a vzdálenost).
const mobAt = (m, fn, ref = 4) => Sound.at(m.pos.x, m.pos.y + m.def.cy, m.pos.z, fn, { ref });
on('mobHit', (m, local, dmg = 1) => {
  hitFx(m, dmg, local, local ? localFx : null);
  if (m.type === 'golem') mobAt(m, () => Sound.mat('crystal', 'hit', 1.5));
  if (m.type === 'sheep' || m.type === 'boar' || m.type === 'wolf' || m.type === 'cow' || m.type === 'chicken') mobAt(m, () => Sound.mobVoice(m.type));
});
on('mobKilled', (m) => {
  sparks.emit(m.pos.x, m.pos.y + m.def.cy, m.pos.z, m.type === 'crawler' ? [0.6, 0.2, 1.0] : [0.9, 0.85, 0.75], 30, 4, 2);
  mobAt(m, () => { if (m.type === 'crawler' || m.type === 'markoman' || m.type === 'golem') Sound.kill(); else Sound.burst({ dur: 0.35, f0: 1200, f1: 200, q: 0.8, vol: 0.18, type: 'lowpass' }); });
});
on('chestLoot', () => { if (invOpen && ui.mode === 'chest') renderInventory(); });
on('mobBurn', (m) => debris.emit(m.pos.x, m.pos.y + 0.8, m.pos.z, [0.1, 0.1, 0.1], 2, 1, 2));
on('mobAttack', (m) => mobAt(m, () => { if (m.type === 'markoman' || m.type === 'golem') Sound.swing(); else if (m.type === 'wolf' || m.type === 'boar' || m.type === 'crawler') Sound.mobVoice(m.type); }));
on('mobSound', (m) => mobAt(m, () => Sound.mobVoice(m.type), m.type === 'wolf' || m.type === 'cow' ? 8 : 4)); // vytí a bučení je slyšet dál
on('spawnerSpawn', (x, y, z) => sparks.emit(x, y, z, [0.8, 0.3, 1], 25, 2, 1));
// Kořist pro hráče u této obrazovky, když je do 24 m; zranění od tvora.
NET.localLoot = (m, id, n) => { if (Math.hypot(m.pos.x - player.pos.x, m.pos.y - player.pos.y, m.pos.z - player.pos.z) < 24) addItem(id, n); };
NET.hurtLocal = (dmg, dx, dz) => damagePlayer(dmg, dx, dz);
