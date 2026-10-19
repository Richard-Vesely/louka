// Předměty na zemi v prohlížeči: 3D modely, vyhazování (G) a sbírání (pravidla: shared/sim/ground-items.js).
import '../render/dimension.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { ITEMS } from '../../../shared/data/index.js';
import { NET } from '../../../shared/net/net.js';
import { groundItems, spawnGroundItem, updateGroundItems } from '../../../shared/sim/ground-items.js';
import { PH } from '../../../shared/world/constants.js';
import { Sound } from '../audio/sound.js';
import { iconVoxels } from '../dining/food-models.js';
import { addItem, heldStack, inv } from '../player/inventory.js';
import { player } from '../player/player.js';
import { blockMat } from '../render/blocks.js';
import { camera, scene } from '../render/renderer.js';
import { feed } from '../ui/hud.js';
import { renderHotbar } from '../ui/inventory-ui.js';

// ============================================================ předměty ležící na zemi (vyhazování klávesou G)
// Vyhozený předmět letí ve směru pohledu, dopadne, točí se a sebereš ho, když přes něj přejdeš.
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
// 3D modely předmětů na zemi (pravidla jsou v shared/sim/ground-items.js): předmět -> skupina ve scéně
const itemViews = new Map();
export function syncGroundItemViews() {
  for (const it of groundItems) {
    let g = itemViews.get(it);
    if (!g) { g = new THREE.Group(); g.add(itemMesh(it.id)); scene.add(g); itemViews.set(it, g); }
    g.position.set(it.pos.x, it.pos.y + 0.08 + Math.sin(it.spin * 1.5) * 0.06, it.pos.z);
    g.rotation.y = it.spin;
  }
  if (itemViews.size > groundItems.length) { // některý předmět zmizel
    const alive = new Set(groundItems);
    for (const [it, g] of itemViews) if (!alive.has(it)) { scene.remove(g); itemViews.delete(it); }
  }
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
  Sound.toss();
  feed(id, `−${n} ${ITEMS[id].name}`);
}
// Sebrání předmětu hráčem u této obrazovky (volá shared/sim/ground-items.js pro každý předmět)
function pickupLocal(it) {
  const p = player.pos;
  if (player.alive && it.n > 0 && it.age > it.delay && Math.hypot(it.pos.x - p.x, it.pos.z - p.z) < 1.4 && it.pos.y > p.y - 0.8 && it.pos.y < p.y + PH) {
    if (NET.client) { // o sebrání rozhodne hostitel (ať předmět nesebere víc hráčů naráz)
      if (it.req <= 0 && roomFor(it.id)) { it.req = 2; NET.req(['pk', it.gid]); }
    } else {
      const left = addItem(it.id, it.n, true);
      if (left < it.n) { Sound.plip(); feed(it.id, `+${it.n - left} ${ITEMS[it.id].name}`); NET.op(['gx', it.gid, left]); }
      it.n = left;
    }
  }
}
export const tickGroundItems = (dt) => updateGroundItems(dt, pickupLocal);
const roomFor = (id) => inv.slots.some((s) => !s || (s.id === id && s.n < ITEMS[id].stack));
