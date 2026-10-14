// ============================================================ překážky (kmeny, balvany, sloupy svatyně)
// Kruhy { x, z, r }, do kterých se nedá vejít. Počítají se přímo ze semínka světa,
// takže je server zná, i když nic nekreslí.
import { TREE_CELL, ROCK_CELL } from '../constants.js';
import { treeAt, rockAt } from '../worldgen.js';

/** Sloupy a kameny svatyně (uprostřed světa). */
export const SHRINE_COLLIDERS = [];
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  SHRINE_COLLIDERS.push({ x: Math.cos(a) * 7.4, z: Math.sin(a) * 7.4, r: 0.85 });
}
SHRINE_COLLIDERS.push({ x: 9.8, z: 5.6, r: 1.2 }, { x: -3.2, z: 9.9, r: 1.0 }, { x: -2.5, z: 0, r: 0.6 }, { x: 2.5, z: 0, r: 0.6 });

/**
 * Kmeny a velké balvany do vzdálenosti ~3 m od bodu (x, z).
 * @param {Set<string>} removed pokácené stromy a vytěžené balvany
 */
export function collidersNear(x, z, removed) {
  const out = [];
  for (let cz = Math.floor((z - 2) / TREE_CELL); cz <= Math.floor((z + 2) / TREE_CELL); cz++) {
    for (let cx = Math.floor((x - 2) / TREE_CELL); cx <= Math.floor((x + 2) / TREE_CELL); cx++) {
      const t = treeAt(cx, cz, removed);
      if (t) out.push({ x: t.x, z: t.z, r: 0.3 * t.s });
    }
  }
  for (let cz = Math.floor((z - 3) / ROCK_CELL); cz <= Math.floor((z + 3) / ROCK_CELL); cz++) {
    for (let cx = Math.floor((x - 3) / ROCK_CELL); cx <= Math.floor((x + 3) / ROCK_CELL); cx++) {
      const r = rockAt(cx, cz, removed);
      if (r && r.s > 0.6) out.push({ x: r.x, z: r.z, r: 0.9 * r.s });
    }
  }
  return out;
}

/** Vystrčí bod `pos` z překážek (hráč má poloměr `pr`). */
export function pushOut(pos, list, pr) {
  for (const c of list) {
    const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), min = c.r + pr;
    if (d < min && d > 1e-4) { pos.x = c.x + (dx / d) * min; pos.z = c.z + (dz / d) * min; }
  }
}
