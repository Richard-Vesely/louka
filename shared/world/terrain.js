// Terén a biomy: výška povrchu v každém bodě světa (stejný vzorec je v GLSL v client/src/render/glsl.js).
import { hash2, smoothstep } from '../util.js';

// Markova dimenze leží daleko na východě světa (x > MARK_X), její svatyně je v bodě (MARK_CX, 0).
export const MARK_X = 20000, MARK_CX = 40000;
export const isMark = (x) => x > MARK_X;
export const SHRINES = [{ x: 0, z: 0, mark: false }, { x: MARK_CX, z: 0, mark: true }];
export const shrineOf = (x) => SHRINES[isMark(x) ? 1 : 0];
export const shrineDist = (x, z) => { const s = shrineOf(x); return Math.hypot(x - s.x, z - s.z); };

// Terén: stejný vzorec v JavaScriptu (fyzika) i v GLSL (vykreslení). Markova dimenze má divočejší kopce.
// Rybníky: v každé buňce 130×130 m je s pravděpodobností 45 % mělká prohlubeň (stejný výpočet v JS i GLSL).
export const POND_CELL = 130;
export function pondOf(x, z) {
  const cx = Math.floor(x / POND_CELL), cz = Math.floor(z / POND_CELL);
  if (hash2(cx + 31, cz + 913) >= 0.45) return null;
  return {
    key: `p${cx},${cz}`, cx, cz,
    x: (cx + 0.3 + 0.4 * hash2(cx + 2, cz + 9)) * POND_CELL, z: (cz + 0.3 + 0.4 * hash2(cx + 9, cz + 2)) * POND_CELL,
    r: 9 + 5 * hash2(cx + 4, cz + 4),
  };
}
export function pondDip(x, z) {
  const p = pondOf(x, z);
  if (!p) return 0;
  const d = Math.hypot(x - p.x, z - p.z) / p.r;
  if (d >= 1) return 0;
  return 2.6 * (1 - d * d) ** 2 * smoothstep(60, 90, shrineDist(p.x, p.z));
}
// ============================================================ biomy
// Dál než 380 m od domovské svatyně se střídají biomy podle "teploty" a "vlhkosti" (pomalé vlny, stejný výpočet v JS i GLSL),
// takže přechody jsou plynulé. Sopky a houbové lesy jsou vzácné oblasti kolem náhodných středů (mřížka jako u rybníků).
const BIOMES = ['meadow', 'cherry', 'desert', 'jungle', 'tundra', 'savanna', 'volcanic', 'mushroom'];
export const BIOME_NAMES = { meadow: 'Louka a les', cherry: 'Třešňový les', desert: 'Poušť', jungle: 'Džungle', tundra: 'Zasněžená tundra', savanna: 'Savana', volcanic: 'Sopečná oblast', mushroom: 'Houbový les' };
export const BIOME_START = 35, BIOME_SCALE = 12, BIOME_BLEND = 45, VOLC_CELL = 1100, VOLC_R = 110, MUSH_CELL = 900, MUSH_R = 170;
// Střed vzácné oblasti v buňce mřížky (nebo null)
export function regionOf(x, z, cell, salt, chance) {
  const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
  if (hash2(cx + salt, cz - salt * 3) >= chance) return null;
  return { x: (cx + 0.3 + 0.4 * hash2(cx + salt + 1, cz + 7)) * cell, z: (cz + 0.3 + 0.4 * hash2(cx + 7, cz + salt + 1)) * cell };
}
export const volcanoOf = (x, z) => (isMark(x) ? null : regionOf(x, z, VOLC_CELL, 71, 0.5));
export const volcanoDist = (x, z) => { const v = volcanoOf(x, z); return v ? Math.hypot(x - v.x, z - v.z) : 1e9; };
const mushDist = (x, z) => { const v = isMark(x) ? null : regionOf(x, z, MUSH_CELL, 43, 0.45); return v ? Math.hypot(x - v.x, z - v.z) : 1e9; };
// Váhy biomů v bodě (součet = 1), pořadí jako BIOMES
const BW = [1, 0, 0, 0, 0, 0, 0, 0];
export function biomeWeights(x, z, w = BW) {
  w.fill(0);
  w[0] = 1;
  if (isMark(x)) return w;
  const ring = smoothstep(BIOME_START, BIOME_START + BIOME_BLEND, shrineDist(x, z));
  if (ring <= 0) return w;
  // Zvlněné hranice tvoří zálivy a výběžky biomů; stejný výpočet je v GLSL.
  const bx = x * BIOME_SCALE, bz = z * BIOME_SCALE;
  const cx = bx + Math.sin(bz * 0.004) * 180, cz = bz + Math.sin(bx * 0.0035 + 0.7) * 180;
  const t = Math.sin(cx * 0.0017 + 1.1) * Math.cos(cz * 0.0021 - 0.4) * 0.6 + Math.sin((cx + cz) * 0.0009 + 2.3) * 0.4;
  const hm = Math.cos(cx * 0.0019 - 0.8) * Math.sin(cz * 0.0016 + 0.6) * 0.6 + Math.sin((cx - cz) * 0.0011 + 0.9) * 0.4;
  const tundra = smoothstep(-0.3, -0.48, t), hot = smoothstep(-0.02, 0.2, t), dry = smoothstep(0.12, -0.14, hm), wet = smoothstep(0.12, 0.3, hm);
  const cherry = smoothstep(0.2, 0.38, hm) * (1 - hot) * (1 - tundra);
  const vol = smoothstep(VOLC_R * 1.7, VOLC_R * 1.05, volcanoDist(x, z)), mus = smoothstep(MUSH_R * 1.5, MUSH_R * 0.9, mushDist(x, z)) * (1 - vol);
  const k = (1 - vol - mus) * ring; // podíl běžných biomů
  w[1] = cherry * k; w[2] = hot * dry * k; w[3] = hot * wet * k; w[4] = tundra * k; w[5] = hot * (1 - dry) * (1 - wet) * k;
  w[6] = vol * ring; w[7] = mus * ring;
  w[0] = 1 - w[1] - w[2] - w[3] - w[4] - w[5] - w[6] - w[7];
  return w;
}
export const biomeAt = (x, z) => { const w = biomeWeights(x, z); let b = 0; for (let i = 1; i < 8; i++) if (w[i] > w[b]) b = i; return BIOMES[b]; };
// Výška podle biomů: duny v poušti, rovná tundra, kopcovitá džungle, kužel sopky s kráterem…
function biomeHeight(h0, x, z, w) {
  if (w[0] >= 1) return h0;
  const dune = (0.5 + 0.5 * Math.sin(x * 0.07 + Math.sin(z * 0.023) * 2.5)) ** 2 * (3.5 + 2 * (0.5 + 0.5 * Math.sin(z * 0.009 + x * 0.006)));
  const vd = volcanoDist(x, z), cone = vd < VOLC_R ? 30 * (1 - vd / VOLC_R) ** 1.8 - 14 * Math.max(0, 1 - vd / 18) ** 1.5 : 0;
  return w[0] * h0 + w[1] * (h0 * 1.15 + 0.6) + w[2] * (h0 * 0.45 + dune) + w[3] * (h0 * 1.3 + Math.sin(x * 0.043 + 0.4) * Math.sin(z * 0.051 + 1.2) * 2.2)
    + w[4] * (h0 * 0.55 + 0.8) + w[5] * (h0 * 0.7 + 0.4) + w[6] * (h0 * 0.9 + cone) + w[7] * (h0 * 0.8 + 0.5);
}
export function terrainH(x, z) {
  let h = Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013 - 0.7) * 6.0
          + Math.sin(x * 0.027 + z * 0.018) * 2.4
          + Math.cos(z * 0.035 - x * 0.021 + 2.0) * 1.4
          + Math.sin(x * 0.071 + 0.5) * Math.sin(z * 0.064 + 1.7) * 0.5;
  if (isMark(x)) h = h * 1.6 + Math.sin(x * 0.0045 + z * 0.006) * 5.0;
  const w = biomeWeights(x, z);
  h = biomeHeight(h, x, z, w);
  return h * smoothstep(16, 70, shrineDist(x, z)) - pondDip(x, z) * (1 - w[6]); // v sopce rybníky nejsou
}
export const forest = (x, z) => 0.5 + 0.5 * (Math.sin(x * 0.0081 + 0.4) * Math.cos(z * 0.0093 + 1.1) * 0.75 + Math.sin(x * 0.023 - z * 0.017) * 0.3);
