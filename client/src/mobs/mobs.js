// Tvorové v prohlížeči: 3D modely, animace, zvuky a jiskry. Chování a rození je v shared/sim/mobs.js.
import '../player/interaction.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { daylight } from '../../../shared/sim/day.js';
import { wrapAngle } from '../../../shared/util.js';
import { RIM, animateCharacter, buildMobModel } from './mob-models.js';
import { on } from '../../../shared/events.js';
import { NET } from '../../../shared/net/net.js';
import { hurtMob, mobs } from '../../../shared/sim/mobs.js';
import { nearLight } from '../../../shared/world/collision.js';
import { shrineDist } from '../../../shared/world/terrain.js';
import { Sound } from '../audio/sound.js';
import { addItem } from '../player/inventory.js';
import { player } from '../player/player.js';
import { damagePlayer } from '../player/survival.js';
import { debris, sparks } from '../render/particles.js';
import { scene } from '../render/renderer.js';
import { invOpen, renderInventory, ui } from '../ui/inventory-ui.js';

// ============================================================ tvorové: modely (mob-models.js), animace a „život“
// Oči mrkají, hlava sleduje hráče do 8 m, uši a ocas sebou škubnou, zvířata se na místě pasou a rozhlížejí,
// při běhu se práší, stínožrout za sebou nechává kouř, golemovi pulzují praskliny. Zásah = krátce zčervená,
// smrt = převrátí se na bok a zmizí v obláčku. Stejná animace pro tvory, které simuluje tahle hra, i pro loutky klienta.
const views = new Map();
export function viewOf(m) {
  let V = views.get(m);
  if (!V) {
    V = buildMobModel(m.type);
    V.group.position.set(m.pos.x, m.pos.y, m.pos.z);
    V.group.rotation.y = m.ry;
    Object.assign(V, { yaw: m.ry, t: Math.random() * 10, blink: 1 + Math.random() * 4, idleT: 2 + Math.random() * 4, idle: null, ear: 0, earT: 2 + Math.random() * 5, step: 0 });
    scene.add(V.group, V.shadow);
    views.set(m, V);
  }
  return V;
}
// Mrtví tvorové dohrají pád na bok, i když je pravidla už odebrala.
const dying = [];
// Každý snímek: model pro nového tvora, pryč s modelem tvora, který zmizel.
export function syncMobViews() {
  for (const m of mobs) viewOf(m);
  if (views.size > mobs.length) {
    const alive = new Set(mobs);
    for (const [m, V] of views) {
      if (alive.has(m)) continue;
      views.delete(m);
      if (m.dead) dying.push({ V, t: m.deathT || 0 }); else scene.remove(V.group, V.shadow);
    }
  }
}
const lerpA = (a, b, k) => a + wrapAngle(b - a) * k;
/**
 * Jeden snímek animace tvora. sp = rychlost (m/s), podle ní se hýbou nohy.
 * @param {ReturnType<typeof viewOf>} V
 */
export function poseMob(V, m, dt, sp) {
  V.t += dt;
  const k = (r) => 1 - Math.exp(-dt * r);
  if (m.dead) { poseDeath(V, m.deathT || 0); return; }
  m.phase += dt * (sp * 2.2 + (m.type === 'crawler' ? 2 : 0));
  const amt = Math.min(sp / 2, 1);
  let hop = 0;
  if (V.kind === 'blob') {
    hop = Math.abs(Math.sin(m.phase)) * (sp > 2 ? 0.5 : 0.18);
    const squash = 1 + Math.cos(m.phase * 2) * 0.12;
    V.body.scale.set(1 / Math.sqrt(squash), 0.8 * squash, 1.15 / Math.sqrt(squash));
    if (Math.random() < dt * (sp > 1 ? 14 : 5)) debris.emit(m.pos.x + (Math.random() - 0.5) * 0.6, m.pos.y + 0.7, m.pos.z + (Math.random() - 0.5) * 0.6, [0.12, 0.08, 0.16], 1, 0.4, 1.2); // kouř
  } else if (V.rig) { // markoman: animace postavy
    m.atkT = Math.max(0, (m.atkT || 0) - dt);
    animateCharacter(V.rig, { speed: sp, yaw: 0, pitch: 0, run: sp > 4, swing: m.atkT > 0.2, held: 'iron_sword' }, dt);
    V.rig.group.rotation.y = 0;
    V.rig.anim.bodyYaw = 0;
  } else if (V.kind === 'biped') { // golem
    const swing = Math.sin(m.phase * 1.1) * amt * 0.8;
    V.legs[0].rotation.x = swing; V.legs[1].rotation.x = -swing;
    m.atkT = Math.max(0, (m.atkT || 0) - dt);
    const atk = m.atkT > 0 ? -2.4 * Math.sin((1 - m.atkT / 0.35) * Math.PI) : 0;
    V.arms[0].rotation.x = atk || -swing * 0.8;
    V.arms[1].rotation.x = atk || swing * 0.6;
    V.body.position.y = V.bodyY + Math.abs(swing) * 0.05;
    if (Math.random() < dt * 3) sparks.emit(m.pos.x + (Math.random() - 0.5) * 1.2, m.pos.y + 2.2, m.pos.z + (Math.random() - 0.5) * 1.2, [0.35, 0.9, 1], 1, 0.3, 1.2); // světélka z krystalů
  } else { // čtyřnožci a slepice
    const fr = m.type === 'chicken' ? 3.4 : 2.2, swing = Math.sin(m.phase * fr) * amt * (m.type === 'chicken' ? 0.9 : 0.7);
    V.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? 1 : -1) * swing));
    V.body.position.y = V.bodyY + Math.abs(Math.cos(m.phase * fr)) * 0.035 * amt;
    V.body.rotation.x = Math.sin(m.phase * fr * 2) * 0.02 * amt;
    for (const w of V.wings) w.rotation.z = (w.position.x > 0 ? -1 : 1) * (sp > 3.5 ? 0.5 + Math.sin(V.t * 40) * 0.5 : 0.05); // slepice na útěku mává křídly
    const step = Math.floor((m.phase * fr) / Math.PI);
    if (step !== V.step) { V.step = step; if (sp > 3.5 && m.type !== 'chicken') debris.emit(m.pos.x, m.pos.y + 0.05, m.pos.z, [0.5, 0.45, 0.36], 2, 1, 0.6); } // prach při běhu
  }
  // hlava: sleduje hráče do 8 m, na místě se občas pase, čichá nebo rozhlédne
  if (V.head && V.kind !== 'blob') {
    const dx = player.pos.x - m.pos.x, dz = player.pos.z - m.pos.z, d = Math.hypot(dx, dz);
    const still = sp < 0.4;
    if (still && (V.idleT -= dt) < 0) { V.idleT = 3 + Math.random() * 5; V.idle = V.idle ? null : ['graze', 'look', 'graze', 'sniff'][Math.floor(Math.random() * 4)]; V.idleDir = (Math.random() - 0.5) * 1.6; }
    if (!still) V.idle = null;
    let yaw = 0, pitch = 0;
    if (d < 8 && d > 0.5 && (V.idle !== 'graze' || d < 3)) { // hráč blízko: zvedne hlavu a dívá se na něj
      yaw = Math.max(-1, Math.min(1, wrapAngle(Math.atan2(-dx, -dz) - V.yaw)));
      pitch = Math.atan2(player.pos.y + 1.4 - (m.pos.y + (m.def.cy || 0.6) * 1.5), d) * 0.6;
    } else if (V.idle === 'graze') pitch = m.type === 'chicken' ? -1 + Math.abs(Math.sin(V.t * 7)) * 0.4 : -1.05 + Math.sin(V.t * 3) * 0.06;
    else if (V.idle === 'look') yaw = V.idleDir;
    else if (V.idle === 'sniff') pitch = -0.35 + Math.sin(V.t * 14) * 0.04;
    if (V.rig) { V.rig.head.rotation.y = lerpA(V.rig.head.rotation.y, yaw, k(5)); }
    else {
      V.head.rotation.y = lerpA(V.head.rotation.y, yaw, k(5));
      V.head.rotation.x += (V.headRest + pitch - V.head.rotation.x) * k(5);
    }
  }
  // mrkání, uši, ocas
  if ((V.blink -= dt) < 0) V.blink = 3 + Math.random() * 3;
  const open = V.blink < 0.12 ? 0.12 : 1;
  for (const e of V.eyes) e.scale.y = open;
  if ((V.earT -= dt) < 0) { V.earT = 2 + Math.random() * 5; V.ear = 1; }
  V.ear = Math.max(0, V.ear - dt * 6);
  V.ears.forEach((e, i) => (e.rotation.x = Math.sin(V.ear * Math.PI) * (i ? 0.5 : -0.5)));
  if (V.tail) {
    if (m.type === 'wolf') V.tail.rotation.y = Math.sin(V.t * (sp > 3 ? 4 : 1.5)) * 0.3;
    else V.tail.rotation.z = Math.sin(V.t * (m.type === 'cow' ? 1.8 : 6)) * (m.type === 'cow' ? 0.25 : 0.15);
  }
  // golemovi pulzují praskliny, stínožroutovi žilky
  for (const mat of V.flash) if (mat.userData.pulse) mat.emissiveIntensity = (m.type === 'golem' ? 0.5 : 0.35) + Math.sin(V.t * 2.4) * 0.3;
  V.group.position.set(m.pos.x, m.pos.y + hop, m.pos.z);
  V.yaw = lerpA(V.yaw, m.ry, k(12));
  V.group.rotation.set(0, V.yaw, 0);
  V.shadow.position.set(m.pos.x, m.pos.y + 0.03, m.pos.z);
  // zásah: krátce zčervená
  const f = m.flash || 0;
  if (f > 0 || V.flashOn) { for (const mat of V.flash) if (!mat.userData.glow && !mat.userData.pulse) mat.emissive.setRGB(f * 1.1, f * 0.12, f * 0.08); V.flashOn = f > 0; }
}
// Smrt: převrátí se na bok, pak se zmenší a zmizí v obláčku.
function poseDeath(V, t) {
  const k = Math.min(1, t / 0.55), e = k * k * (3 - 2 * k);
  V.group.rotation.set(0, V.yaw, e * Math.PI / 2);
  V.group.scale.setScalar(Math.max(0.01, 1 - Math.max(0, t - 0.85) * 4) * (V.big ? 1.1 : 1));
  for (const mat of V.flash) if (!mat.userData.glow && !mat.userData.pulse) mat.emissive.setRGB(0.6 * (1 - k), 0.05, 0.03);
}
function updateDying(dt) {
  for (let i = dying.length - 1; i >= 0; i--) {
    const D = dying[i];
    D.t += dt;
    poseDeath(D.V, D.t);
    if (D.t > 1.1) {
      const p = D.V.group.position;
      debris.emit(p.x, p.y + 0.4, p.z, [0.75, 0.75, 0.78], 22, 1.6, 1.4); // obláček
      scene.remove(D.V.group, D.V.shadow);
      dying.splice(i, 1);
    }
  }
}
const MOON = new THREE.Color(0x6e8bc4);
// Animace tvorů, které simuluje tato hra (hra pro jednoho, hostitel): volá se hned po updateMobs se stejným dt.
export function animateMobs(dt) {
  for (const m of mobs) poseMob(viewOf(m), m, dt, Math.hypot(m.vel.x, m.vel.z));
  mobLife(dt);
}
/** Pro hostitele i klienta: dohrání smrti a měsíční obrys tvorů podle toho, jak je tma. */
export function mobLife(dt) {
  updateDying(dt);
  RIM.value.copy(MOON).multiplyScalar(daylight().night * 0.45);
}

// ---------- útok hráče u této obrazovky; připojený hráč posílá ránu hostiteli
export function hitMob(m, dmg, yaw = player.yaw) {
  if (NET.client) { // útok jde hostiteli, tady jen odezva
    NET.req(['hit', m.nid, dmg, player.yaw]);
    m.flash = 1;
    sparks.emit(m.pos.x, m.pos.y + m.def.cy, m.pos.z, m.type === 'crawler' ? [0.7, 0.25, 1.0] : [1, 0.25, 0.2], 18, 3.5, 1.5);
    Sound.hit();
    player.shake = 0.1;
    return;
  }
  hurtMob(m, dmg, yaw);
}
export const playerSafe = () => shrineDist(player.pos.x, player.pos.z) < 11 || nearLight(player.pos.x, player.pos.z, 5);

// ---------- co se děje s tvory (události z pravidel): jiskry, zvuky, kořist, zranění
on('mobHit', (m, local) => {
  sparks.emit(m.pos.x, m.pos.y + m.def.cy, m.pos.z, m.type === 'crawler' ? [0.7, 0.25, 1.0] : m.type === 'golem' ? [0.4, 0.9, 1] : [1, 0.25, 0.2], 18, 3.5, 1.5);
  Sound.hit();
  if (local) player.shake = 0.1;
  if (m.type === 'sheep') Sound.baa();
  if (m.type === 'boar' || m.type === 'wolf') Sound.grunt();
});
on('mobKilled', (m) => {
  sparks.emit(m.pos.x, m.pos.y + m.def.cy, m.pos.z, m.type === 'crawler' ? [0.6, 0.2, 1.0] : [0.9, 0.85, 0.75], 50, 5, 2);
  if (m.type === 'crawler' || m.type === 'markoman' || m.type === 'golem') Sound.kill();
});
on('chestLoot', () => { if (invOpen && ui.mode === 'chest') renderInventory(); });
on('mobBurn', (m) => debris.emit(m.pos.x, m.pos.y + 0.8, m.pos.z, [0.1, 0.1, 0.1], 2, 1, 2));
on('mobAttack', (m) => { if (m.type === 'markoman' || m.type === 'golem') Sound.swing(); });
on('mobSound', (m) => ({ sheep: () => Sound.baa(), crawler: () => Sound.growl(), wolf: () => Sound.howl(), deer: () => {}, chicken: () => Sound.cluck(), cow: () => Sound.moo() }[m.type] || (() => Sound.grunt()))());
on('spawnerSpawn', (x, y, z) => sparks.emit(x, y, z, [0.8, 0.3, 1], 25, 2, 1));
// Kořist pro hráče u této obrazovky, když je do 24 m; zranění od tvora.
NET.localLoot = (m, id, n) => { if (Math.hypot(m.pos.x - player.pos.x, m.pos.y - player.pos.y, m.pos.z - player.pos.z) < 24) addItem(id, n); };
NET.hurtLocal = (dmg, dx, dz) => damagePlayer(dmg, dx, dz);
