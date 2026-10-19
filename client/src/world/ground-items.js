// Předměty na zemi v prohlížeči: 3D modely, vyhazování (Q / G) a sbírání (pravidla: shared/sim/ground-items.js).
import '../render/dimension.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { ITEMS } from '../../../shared/data/index.js';
import { stackModels } from '../../../shared/inventory.js';
import { NET } from '../../../shared/net/net.js';
import { groundItems, spawnGroundItem, updateGroundItems } from '../../../shared/sim/ground-items.js';
import { PH } from '../../../shared/world/constants.js';
import { uiSound } from '../audio/ui-sound.js';
import { iconVoxels } from '../dining/food-models.js';
import { addItem, heldStack, inv } from '../player/inventory.js';
import { player } from '../player/player.js';
import { blockMat } from '../render/blocks.js';
import { camera, scene } from '../render/renderer.js';
import { feed } from '../ui/hud.js';
import { renderHotbar } from '../ui/inventory-ui.js';

// ============================================================ předměty ležící na zemi (vyhazování klávesou Q / G)
// Vyhozený předmět letí ve směru pohledu, dopadne, pohupuje se a točí. Když jdeš blízko, přitáhne se k tobě (magnet),
// při sebrání vletí do hráče, zmenší se a ozve se „plip". Víc kusů = víc 3D kousků (1, 2–16, 17–32, 33–48, 49+).
const SHADOW_GEO = new THREE.CircleGeometry(0.17, 18).rotateX(-Math.PI / 2);
const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
const OFFS = [[0, 0, 0], [0.07, 0.04, -0.05], [-0.06, 0.08, 0.05], [0.05, 0.12, 0.07], [-0.05, 0.16, -0.07]];
function itemMesh(id, k) {
  const d = ITEMS[id], g = new THREE.Group();
  const block = d.block && blockMat(d.block);
  const one = block ? new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), blockMat(d.block)) : iconVoxels(id, 0.024); // 3D předmět z ikony
  one.userData.own = !block; // vlastní materiál (ikona) se po zmizení uvolní
  for (let i = 0; i < k; i++) {
    const m = i ? one.clone() : one;
    const [x, y, z] = OFFS[i];
    m.position.set(x * (block ? 1.6 : 1), (block ? 0.13 : 0.21) + y * (block ? 1.4 : 1), z * (block ? 1.6 : 1));
    if (i) m.rotation.y = i * 0.7;
    g.add(m);
  }
  return g;
}
function disposeView(v) {
  scene.remove(v.g);
  scene.remove(v.sh);
  const m = v.g.children[0];
  if (m?.userData.own) { m.geometry.dispose(); m.material.dispose(); }
}
// 3D modely předmětů na zemi (pravidla jsou v shared/sim/ground-items.js): předmět -> { g, sh, k }
const itemViews = new Map();
const flying = []; // sebrané předměty, které právě letí do hráče
let lastT = performance.now();
export function syncGroundItemViews() {
  const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  for (const it of groundItems) {
    let v = itemViews.get(it);
    const k = stackModels(it.n);
    if (v && v.k !== k && it.n > 0) { disposeView(v); v = null; }
    if (!v) {
      v = { g: itemMesh(it.id, k), sh: new THREE.Mesh(SHADOW_GEO, SHADOW_MAT), k, phase: Math.random() * 6 };
      scene.add(v.g, v.sh);
      itemViews.set(it, v);
    }
    v.g.position.set(it.pos.x, it.pos.y + 0.1 + Math.sin(it.age * 2 + v.phase) * 0.07, it.pos.z);
    v.g.rotation.y = it.spin;
    v.sh.position.set(it.pos.x, it.pos.y + 0.015, it.pos.z);
  }
  if (itemViews.size > groundItems.length) { // některý předmět zmizel: sebraný hráčem u této obrazovky letí do něj
    const alive = new Set(groundItems);
    for (const [it, v] of itemViews) {
      if (alive.has(it)) continue;
      itemViews.delete(it);
      scene.remove(v.sh);
      if (it.mine) flying.push({ v, t: 0, from: v.g.position.clone() }); else disposeView(v);
    }
  }
  for (let i = flying.length - 1; i >= 0; i--) { // vlétnutí do hráče (asi 0,15 s, jako v Minecraftu)
    const f = flying[i];
    f.t += dt / 0.15;
    const to = TMP.set(player.pos.x, player.pos.y + 0.7, player.pos.z);
    f.v.g.position.lerpVectors(f.from, to, Math.min(1, f.t * f.t));
    f.v.g.scale.setScalar(Math.max(0.05, 1 - f.t * 0.85));
    if (f.t >= 1) { disposeView(f.v); flying.splice(i, 1); }
  }
}
const TMP = new THREE.Vector3();
// Vyhodí předmět z ruky: jeden kus, se Shiftem (Ctrl) celý stack.
export function dropHeld(all) {
  const s = heldStack();
  if (!s) return;
  const n = all ? s.n : 1;
  if ((s.n -= n) <= 0) inv.slots[inv.sel] = null;
  renderHotbar();
  throwItem(s.id, n);
}
export function throwItem(id, n) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const pos = camera.position.clone().addScaledVector(dir, 0.5).add(new THREE.Vector3(0, -0.3, 0));
  spawnGroundItem(id, n, pos, dir.multiplyScalar(5.5).add(new THREE.Vector3(0, 2, 0)), 1.2);
  uiSound.toss();
  feed(id, `−${n} ${ITEMS[id].name}`);
}
// Sebrání předmětu hráčem u této obrazovky (volá shared/sim/ground-items.js pro každý předmět)
const MAGNET = 2.4; // m: odsud se předmět začne přitahovat
let tickDt = 0;
function pickupLocal(it) {
  const p = player.pos;
  if (!player.alive || it.n <= 0 || it.age <= it.delay || it.pos.y < p.y - 0.8 || it.pos.y > p.y + PH) return;
  const dx = p.x - it.pos.x, dz = p.z - it.pos.z, d = Math.hypot(dx, dz);
  if (d >= MAGNET || !roomFor(it.id)) return;
  if (d > 0.05) { // magnet: čím blíž, tím rychleji (jen na této obrazovce, o sebrání rozhoduje dál ten, kdo drží svět)
    const step = Math.min(d, (1.5 + (1 - d / MAGNET) * 7) * tickDt);
    it.pos.x += (dx / d) * step;
    it.pos.z += (dz / d) * step;
  }
  if (d >= 1.4) return;
  if (NET.client) { // o sebrání rozhodne hostitel (ať předmět nesebere víc hráčů naráz)
    if (it.req <= 0) { it.req = 2; it.mine = true; NET.req(['pk', it.gid]); }
  } else {
    const left = addItem(it.id, it.n, true);
    if (left < it.n) { uiSound.pickup(); feed(it.id, `+${it.n - left} ${ITEMS[it.id].name}`); NET.op(['gx', it.gid, left]); it.mine = !left; }
    it.n = left;
  }
}
export const tickGroundItems = (dt) => { tickDt = dt; updateGroundItems(dt, pickupLocal); };
const roomFor = (id) => inv.slots.some((s) => !s || (s.id === id && s.n < ITEMS[id].stack));
