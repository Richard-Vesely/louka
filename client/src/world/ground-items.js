// Předměty ležící na zemi.
import '../render/dimension.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { Sound } from '../audio/sound.js';
import { iconVoxels } from '../dining/food-models.js';
import { NET, r2 } from '../game/boot.js';
import { save } from '../game/save-load.js';
import { voxFloor } from '../mobs/mobs.js';
import { addItem, heldStack, inv } from '../player/inventory.js';
import { player } from '../player/player.js';
import { blockMat } from '../render/blocks.js';
import { camera, scene } from '../render/renderer.js';
import { feed } from '../ui/hud.js';
import { renderHotbar } from '../ui/inventory-ui.js';
import { solidAny } from './structures.js';
import { ITEMS } from '../../../shared/data/index.js';
import { PH } from '../../../shared/world/constants.js';
import { groundHeight } from '../../../shared/world/voxels.js';

// ============================================================ předměty ležící na zemi (vyhazování klávesou G)
// Vyhozený předmět letí ve směru pohledu, dopadne, točí se a sebereš ho, když přes něj přejdeš.
export const groundItems = [];
function itemMesh(id) {
  const d = ITEMS[id];
  if (d.block && blockMat(d.block)) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), blockMat(d.block));
    m.position.y = 0.13;
    return m;
  }
  const s = iconVoxels(id, 0.024); // 3D předmět z ikony
  s.position.y = 0.21;
  return s;
}
export function spawnGroundItem(id, n, pos, vel, delay = 0.6, gid = NET.uid()) {
  NET.op(['g', gid, id, n, pos.toArray().map(r2), vel.toArray().map(r2), delay]);
  const g = new THREE.Group();
  g.add(itemMesh(id));
  g.position.copy(pos);
  scene.add(g);
  groundItems.push({ gid, id, n, obj: g, pos: pos.clone(), vel: vel.clone(), age: 0, delay, spin: Math.random() * 6, req: 0 });
}
// Vyhodí předmět z ruky: jeden kus, se Shiftem celý stack.
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
  Sound.pop();
  feed(id, `−${n} ${ITEMS[id].name}`);
}
// Podlaha pod předmětem: povrch terénu nebo horní stěna bloku
function itemFloor(x, y, z) {
  const g = groundHeight(x, z);
  const vf = voxFloor(x, y, z);
  return isFinite(g) && y >= g - 0.6 ? Math.max(g, vf) : vf;
}
export function updateGroundItems(dt) {
  const p = player.pos;
  for (let i = groundItems.length - 1; i >= 0; i--) {
    const it = groundItems[i];
    it.age += dt;
    // pohyb a gravitace
    it.vel.y -= 18 * dt;
    const nx = it.pos.x + it.vel.x * dt, nz = it.pos.z + it.vel.z * dt;
    if (solidAny(Math.floor(nx), Math.floor(it.pos.y + 0.1), Math.floor(nz))) { it.vel.x *= -0.2; it.vel.z *= -0.2; }
    else { it.pos.x = nx; it.pos.z = nz; }
    it.pos.y += it.vel.y * dt;
    const fl = itemFloor(it.pos.x, it.pos.y, it.pos.z);
    if (it.pos.y <= fl) { it.pos.y = fl; it.vel.y = 0; it.vel.x *= 0.8; it.vel.z *= 0.8; }
    it.spin += dt * 1.8;
    it.obj.position.set(it.pos.x, it.pos.y + 0.08 + Math.sin(it.spin * 1.5) * 0.06, it.pos.z);
    it.obj.rotation.y = it.spin;
    // sebrání
    if (it.req > 0) it.req -= dt;
    if (player.alive && it.n > 0 && it.age > it.delay && Math.hypot(it.pos.x - p.x, it.pos.z - p.z) < 1.4 && it.pos.y > p.y - 0.8 && it.pos.y < p.y + PH) {
      if (NET.client) { // o sebrání rozhodne hostitel (ať předmět nesebere víc hráčů naráz)
        if (it.req <= 0 && roomFor(it.id)) { it.req = 2; NET.req(['pk', it.gid]); }
      } else {
        const left = addItem(it.id, it.n, true);
        if (left < it.n) { Sound.pop(); feed(it.id, `+${it.n - left} ${ITEMS[it.id].name}`); NET.op(['gx', it.gid, left]); }
        it.n = left;
      }
    }
    if (it.n <= 0 || it.age > 300) { scene.remove(it.obj); groundItems.splice(i, 1); }
  }
}
const roomFor = (id) => inv.slots.some((s) => !s || (s.id === id && s.n < ITEMS[id].stack));
// Uložené předměty na zemi z minula
for (const d of save?.ground || []) if (ITEMS[d.id]) spawnGroundItem(d.id, d.n, new THREE.Vector3(d.x, d.y, d.z), new THREE.Vector3(), 0, d.gid || NET.uid());
