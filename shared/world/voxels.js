// Podzemí z bloků 1×1 m: co je kde od přírody, změny od hráčů a výška povrchu (s vykopanými dírami).
import { emit } from '../events.js';
import { NET } from '../net/net.js';
import { hash3, makeNoise3 } from '../util.js';
import { biomeAt, isMark, shrineDist, terrainH, volcanoDist } from './terrain.js';

export function groundHeight(x, z) {
  const r = shrineDist(x, z);
  if (r < 4.6) return 0.45;
  if (r < 9.6) return 0.2;
  if (isDug(Math.floor(x), Math.floor(z))) return -Infinity; // vykopaná díra – povrch tu není
  return terrainH(x, z);
}
// ============================================================ podzemí – data (hlína, kámen, rudy, jeskyně)
// Pod realistickým povrchem je svět z bloků 1×1 m. Horní blok každého sloupce leží pod hladkým terénem;
// když ho vykopeš, terén v tom místě zmizí a otevře se díra do podzemí.
export const V = { AIR: 0, DIRT: 1, STONE: 2, COAL: 3, IRON: 4, CRYSTAL: 5, BEDROCK: 6, MARKDIRT: 7, MARKORITE: 8, GRANITE: 9, MARBLE: 10, BASALT: 11, SAND: 12, SANDSTONE: 13, SNOW: 14, OBSIDIAN: 15, COPPER: 16, GOLD: 17, QUARTZ: 18 };
export const VOX = {
  [V.DIRT]: { name: 'Hlína', hard: 0.9, tool: 'shovel', drop: ['dirt', 1, 1], tile: 0, chip: [0.42, 0.3, 0.2] },
  [V.STONE]: { name: 'Kámen', hard: 2.2, tool: 'pick', req: 1, drop: ['stone', 1, 1], tile: 1, chip: [0.5, 0.5, 0.48] },
  [V.COAL]: { name: 'Uhelná ruda', hard: 2.8, tool: 'pick', req: 1, drop: ['coal', 1, 2], tile: 2, chip: [0.15, 0.15, 0.16] },
  [V.IRON]: { name: 'Železná ruda', hard: 3.5, tool: 'pick', req: 2, drop: ['iron_ore', 1, 2], tile: 3, chip: [0.7, 0.5, 0.35] },
  [V.CRYSTAL]: { name: 'Krystalová žíla', hard: 4.5, tool: 'pick', req: 3, drop: ['shard', 1, 1], tile: 4, glow: true, chip: [0.4, 0.95, 1.0] },
  [V.BEDROCK]: { name: 'Podloží', unbreakable: true, tile: 5, chip: [0.2, 0.2, 0.2] },
  [V.MARKDIRT]: { name: 'Markdirt', hard: 0.9, tool: 'shovel', drop: ['markdirt', 1, 1], tile: 6, chip: [0.2, 0.3, 0.6] },
  [V.GRANITE]: { name: 'Žula', hard: 3, tool: 'pick', req: 1, drop: ['granite', 1, 1], tile: 8, chip: [0.68, 0.5, 0.44] },
  [V.MARBLE]: { name: 'Mramor', hard: 2.6, tool: 'pick', req: 1, drop: ['marble', 1, 1], tile: 9, chip: [0.92, 0.92, 0.9] },
  [V.BASALT]: { name: 'Čedič', hard: 3.2, tool: 'pick', req: 1, drop: ['basalt', 1, 1], tile: 10, chip: [0.28, 0.28, 0.3] },
  [V.SAND]: { name: 'Písek', hard: 0.8, tool: 'shovel', drop: ['sand', 1, 1], tile: 11, chip: [0.85, 0.75, 0.52] },
  [V.SANDSTONE]: { name: 'Pískovec', hard: 2, tool: 'pick', req: 1, drop: ['sandstone', 1, 1], tile: 12, chip: [0.82, 0.7, 0.48] },
  [V.SNOW]: { name: 'Sníh', hard: 0.5, tool: 'shovel', drop: ['snowball', 2, 4], tile: 13, chip: [0.95, 0.97, 1] },
  [V.OBSIDIAN]: { name: 'Obsidián', hard: 9, tool: 'pick', req: 4, drop: ['obsidian', 1, 1], tile: 14, chip: [0.15, 0.08, 0.22] },
  [V.COPPER]: { name: 'Měděná ruda', hard: 3, tool: 'pick', req: 2, drop: ['copper_ore', 1, 2], tile: 15, chip: [0.85, 0.5, 0.3] },
  [V.GOLD]: { name: 'Zlatá ruda', hard: 3.6, tool: 'pick', req: 3, drop: ['gold_ore', 1, 1], tile: 16, chip: [0.95, 0.78, 0.25] },
  [V.QUARTZ]: { name: 'Křemenná žíla', hard: 3, tool: 'pick', req: 2, drop: ['quartz', 1, 3], tile: 17, chip: [0.95, 0.94, 1] },
  [V.MARKORITE]: { name: 'Markoritová ruda', hard: 5.5, tool: 'pick', req: 4, drop: ['markorite_raw', 1, 2], tile: 7, glow: true, chip: [0.9, 0.4, 1.0] },
};
export const VMIN = -48;       // nejhlubší vrstva = nezničitelné podloží
export const NO_DIG_R = 10.5;  // pod svatyní se kopat nedá
const rockA = makeNoise3(0.045, 0.06, 101, 17, -33), rockB = makeNoise3(0.04, 0.05, -71, 5, 59); // hnízda jiných kamenů
const tunnelA = makeNoise3(0.06, 0.09, 0, 0, 0), tunnelB = makeNoise3(0.06, 0.09, 31.7, 11.3, -7.9), domeNoise = makeNoise3(0.035, 0.06, 50, 0, -20);

// Horní blok sloupce obsahuje aspoň 0,5 m skutečné země: tenká slupka pod trávou se počítá k bloku pod ní.
export const topY = (x, z) => Math.floor(terrainH(x + 0.5, z + 0.5) - 0.5);
// Buňka, ve které leží povrch terénu (stavby na povrchu stojí na ní).
export const surfY = (x, z) => Math.floor(terrainH(x + 0.5, z + 0.5));
// Co je v buňce od přírody: 3 vrstvy hlíny, pod nimi kámen s rudami, tunely a jeskynní dómy.
// Biom sloupce (při stavbě chunku se ptá stejný sloupec mnohokrát za sebou)
let colBX = NaN, colBZ = NaN, colB = 'meadow';
function columnBiome(x, z) { if (x !== colBX || z !== colBZ) { colBX = x; colBZ = z; colB = biomeAt(x + 0.5, z + 0.5); } return colB; }
export function naturalAt(x, y, z, top) {
  if (y <= VMIN) return V.BEDROCK;
  if (y > top) return V.AIR;
  const mark = isMark(x);
  // Povrch podle biomu: poušť = písek a pod ním pískovec, tundra = sníh, sopka = čedič (u kráteru obsidián)
  const bio = mark ? 'meadow' : columnBiome(x, z);
  if (bio === 'desert') { if (y >= top - 2) return V.SAND; if (y >= top - 6) return V.SANDSTONE; }
  else if (bio === 'tundra') { if (y === top) return V.SNOW; }
  else if (bio === 'volcanic' && y >= top - 3) return volcanoDist(x + 0.5, z + 0.5) < 30 ? V.OBSIDIAN : V.BASALT;
  if (y >= top - 2) return mark ? V.MARKDIRT : V.DIRT;
  if (y < top - 3 && y > VMIN + 1) {
    if (Math.abs(tunnelA(x, y, z) - 0.5) < 0.045 && Math.abs(tunnelB(x, y, z) - 0.5) < 0.045) return V.AIR;
    if (y < top - 10 && domeNoise(x, y, z) > 0.84) return V.AIR;
  }
  const px = x >> 2, py = y >> 2, pz = z >> 2; // rudy tvoří hnízda ve 4×4×4 kostkách
  if (mark && top - y > 8 && hash3(px + 4242, py, pz) < 0.035 && hash3(x, y + 9, z) < 0.45) return V.MARKORITE;
  if (y < -22 && hash3(px + 900, py, pz) < 0.02 && hash3(x, y + 7, z) < 0.45) return V.CRYSTAL;
  if (top - y > 6 && hash3(px - 500, py, pz) < 0.05 && hash3(x, y + 3, z) < 0.45) return V.IRON;
  if (top - y > 3 && hash3(px + 200, py, pz + 77) < 0.08 && hash3(x, y + 1, z) < 0.45) return V.COAL;
  // měď (častá, mělko), zlato (vzácné, hluboko), křemen (střední hloubka)
  if (top - y > 4 && hash3(px + 700, py, pz - 300) < 0.065 && hash3(x, y + 5, z) < 0.45) return V.COPPER;
  if (y < -14 && hash3(px - 900, py + 3, pz) < 0.012 && hash3(x, y + 11, z) < 0.4) return V.GOLD;
  if (y < -6 && hash3(px + 50, py - 60, pz + 90) < 0.022 && hash3(x, y + 13, z) < 0.45) return V.QUARTZ;
  if (y < -28 && rockB(x, y, z) > 0.62) return V.BASALT;
  const r = rockA(x, y, z);
  if (r > 0.74) return V.GRANITE;
  if (r < 0.24 && top - y > 5) return V.MARBLE;
  return V.STONE;
}

// Změny, které udělal hráč (vykopané / vrácené bloky), rozdělené po chuncích 16×16.
export const voxEdits = new Map();
export const vchunkKey = (x, z) => `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
export const editAt = (x, y, z) => voxEdits.get(vchunkKey(x, z))?.get(`${x},${y},${z}`);
export function getVox(x, y, z, top = topY(x, z)) {
  const e = editAt(x, y, z);
  return e !== undefined ? e : naturalAt(x, y, z, top);
}
// Horní blok sloupce nekoliduje – po povrchu se chodí po hladkém terénu.
export const solidVox = (x, y, z) => { const top = topY(x, z); return y < top && getVox(x, y, z, top) !== V.AIR; };
export const columnDug = (x, z) => { const t = topY(x, z); return getVox(x, t, z, t) === V.AIR; };

// Maska vykopaných sloupců pro shadery (terén a tráva tam nejsou vidět). 1 m na pixel, opakuje se po 512 m.
export const DIG_N = 512;
export const digData = new Uint8Array(DIG_N * DIG_N);
export const digIdx = (x, z) => (((z % DIG_N) + DIG_N) % DIG_N) * DIG_N + (((x % DIG_N) + DIG_N) % DIG_N);
const isDug = (x, z) => digData[digIdx(x, z)] > 0 && columnDug(x, z);

// Změna podzemního bloku (vykopání, vrácení hlíny). Prohlížeč na událost 'vox' překreslí chunky a masku děr.
export function setVox(x, y, z, id) {
  NET.op(['v', x, y, z, id]);
  const ck = vchunkKey(x, z), k = `${x},${y},${z}`, top = topY(x, z);
  let m = voxEdits.get(ck);
  if (id === naturalAt(x, y, z, top)) m?.delete(k);
  else { if (!m) voxEdits.set(ck, (m = new Map())); m.set(k, id); }
  if (y === top) digData[digIdx(x, z)] = id === V.AIR ? 255 : 0;
  emit('vox', x, y, z, y === top);
}
