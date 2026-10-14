// ============================================================ generování světa
// Kde stojí stromy, balvany a úlomky světla. Svět je rozdělený na buňky a v každé
// buňce "hodíme kostkou" pomocí hash2 – takže všichni hráči vidí stejný svět.
import { hash2, smoothstep } from './math.js';
import { forest, terrainH } from './terrain.js';
import { TREE_CELL, ROCK_CELL, SHARD_CELL } from './constants.js';

/** Úlomek světla v buňce (cx, cz), nebo null. */
export function shardAt(cx, cz) {
  if (hash2(cx + 77, cz - 55) > 0.45) return null;
  const x = (cx + 0.2 + hash2(cx, cz + 1) * 0.6) * SHARD_CELL, z = (cz + 0.2 + hash2(cx + 1, cz) * 0.6) * SHARD_CELL;
  if (x * x + z * z < 55 * 55) return null;
  return { key: `s${cx},${cz}`, x, z };
}

/**
 * Strom v buňce (cx, cz), nebo null.
 * @param {Set<string>} [removed] pokácené stromy (ty se nevrací)
 */
export function treeAt(cx, cz, removed) {
  const key = `t${cx},${cz}`;
  if (removed?.has(key)) return null;
  const r = hash2(cx, cz);
  const x = (cx + 0.15 + hash2(cx + 911, cz) * 0.7) * TREE_CELL;
  const z = (cz + 0.15 + hash2(cx, cz + 577) * 0.7) * TREE_CELL;
  const f = forest(x, z);
  if (r > (f > 0.62 ? 0.6 : f > 0.5 ? 0.15 : 0.025)) return null;
  if (x * x + z * z < 30 * 30) return null;
  const sh = shardAt(Math.floor(x / SHARD_CELL), Math.floor(z / SHARD_CELL));
  if (sh && (sh.x - x) ** 2 + (sh.z - z) ** 2 < 40) return null;
  const s = 0.75 + hash2(cx + 3, cz + 5) * 0.6;
  const pine = hash2(cx + 7, cz + 11) < 0.25 + 0.5 * smoothstep(0.55, 0.8, f);
  return { key, x, z, s, rot: r * 1000, pine, trunkH: (pine ? 2.2 : 3.0) * s, v: hash2(cx + 13, cz + 17) };
}

/**
 * Balvan v buňce (cx, cz), nebo null. `iron` = rezavý balvan se železnou rudou.
 * @param {Set<string>} [removed] vytěžené balvany
 */
export function rockAt(cx, cz, removed) {
  const key = `r${cx},${cz}`;
  const r = hash2(cx + 5000, cz - 3000);
  const x = (cx + hash2(cx, cz + 99) * 0.8) * ROCK_CELL, z = (cz + hash2(cx + 99, cz) * 0.8) * ROCK_CELL;
  if (removed?.has(key) || r > (forest(x, z) < 0.45 ? 0.12 : 0.06) || x * x + z * z < 20 * 20) return null;
  const iron = hash2(cx - 7, cz + 13) < 0.16;
  const s = (iron ? 0.6 : 0.35) + hash2(cx + 1, cz + 2) ** 2 * 1.3;
  const y = terrainH(x, z) - 0.25 * s;
  return { key, x, y, z, s, iron, r, shade: hash2(cx, cz) };
}
