// Příroda: úlomky světla, druhy stromů v biomech a rybníky s vodou.
import { hash2 } from '../util.js';
import { SHARD_CELL } from './constants.js';
import { isMark, pondOf, shrineDist, terrainH } from './terrain.js';

// ============================================================ úlomky světla (generují se po celém světě)
export function shardAt(cx, cz) {
  if (hash2(cx + 77, cz - 55) > 0.45) return null;
  const x = (cx + 0.2 + hash2(cx, cz + 1) * 0.6) * SHARD_CELL, z = (cz + 0.2 + hash2(cx + 1, cz) * 0.6) * SHARD_CELL;
  if (isMark(x) || shrineDist(x, z) < 55) return null; // v Markově dimenzi jsou krystaly jen pod zemí
  return { key: `s${cx},${cz}`, x, z };
}

// Stromy v biomech: hustota, druh a výška kmene
export const TREE_DENSITY = { cherry: 0.3, jungle: 0.7, tundra: 0.14, savanna: 0.045, volcanic: 0.025, mushroom: 0.14, desert: 0.05 };
export const TREE_OF_BIOME = { cherry: 'cherry', jungle: 'jungle', tundra: 'spruce', savanna: 'acacia', volcanic: 'dead', mushroom: 'mushroom' };
export const TREE_TRUNK = { oak: 3, pine: 2.2, cherry: 2.6, jungle: 6.5, spruce: 2.4, acacia: 3.4, dead: 2.4, deadbush: 1.3, cactus: 2.2, mushroom: 3 };
export const TREE_NAMES = { oak: 'Dub', pine: 'Smrk', cherry: 'Třešeň', jungle: 'Strom z džungle', spruce: 'Zasněžený smrk', acacia: 'Akácie', dead: 'Suchý strom', deadbush: 'Suchý keř', cactus: 'Kaktus', mushroom: 'Obří houba' };

// ============================================================ rybníky a rybaření
// Hladina = nejnižší bod okraje prohlubně, takže voda nikde nepřeteče.
export const pondLevel = (p) => {
  if (p.level === undefined) {
    let lo = Infinity;
    for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; lo = Math.min(lo, terrainH(p.x + Math.cos(a) * p.r, p.z + Math.sin(a) * p.r)); }
    p.level = lo - 0.12;
  }
  return p.level;
};
// Je v bodě voda? Vrací výšku hladiny, nebo null.
export function waterAt(x, y, z) {
  const p = pondOf(x, z);
  if (!p || shrineDist(p.x, p.z) < 90 || Math.hypot(x - p.x, z - p.z) > p.r) return null;
  const lv = pondLevel(p);
  return terrainH(x, z) < lv && y <= lv + 0.05 ? lv : null;
}
export const nearPond = (x, z, extra = 6) => { const p = pondOf(x, z); return !!p && Math.hypot(x - p.x, z - p.z) < p.r + extra; };
