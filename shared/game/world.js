// ============================================================ WorldState – stav světa
// Svět se generuje sám ze semínka (stromy, balvany, úlomky – viz worldgen.js).
// Tady je jen to, co hráči změnili: položené bloky, pokácené stromy, táboráky a čas.
import { BLOCKS, bkey } from '../blocks.js';

/**
 * @typedef {object} WorldState
 * @property {number} seed semínko světa (zatím jedno pro všechny)
 * @property {Set<string>} removed pokácené stromy "t…", vytěžené balvany "r…", sebrané úlomky "s…"
 * @property {Map<string,string>} blocks položené bloky: "x,y,z" -> typ bloku
 * @property {Map<string,{slots:Array, t:number, by?:string}>} fires táboráky: klíč bloku -> obsah
 * @property {{dayTime:number, dayCount:number}} time denní doba 0..1 a kolikátý je den
 * @property {number} rev zvýší se při každé změně bloků
 */

/**
 * Vytvoří stav světa (prázdný, nebo z uložené hry).
 * @param {object} [data] uložená data ve formátu worldToSave()
 * @returns {WorldState}
 */
export function createWorld(data = {}) {
  return {
    seed: data.seed ?? 1,
    removed: new Set(data.removed || []),
    blocks: new Map(data.blocks || []),
    fires: new Map(Object.entries(data.fires || {})),
    time: { dayTime: data.dayTime ?? 0.3, dayCount: data.day ?? 1 },
    rev: 0,
  };
}

/** Stav světa jako obyčejný objekt pro JSON (stejný formát jako původní uložená hra). */
export function worldToSave(w) {
  return { seed: w.seed, blocks: [...w.blocks], removed: [...w.removed], fires: Object.fromEntries(w.fires), dayTime: w.time.dayTime, day: w.time.dayCount };
}

/** Položí blok (nebo ho smaže, když `type` je null). */
export function setBlock(w, k, type) {
  if (type) w.blocks.set(k, type); else w.blocks.delete(k);
  w.rev++;
}

/** Je na políčku (x, y, z) pevný blok? */
export const solidAt = (w, x, y, z) => { const t = w.blocks.get(bkey(x, y, z)); return !!t && BLOCKS[t].solid; };

/** Seznam svítících bloků { x, y, z, type } (pochodně, táboráky). Počítá se znovu jen po změně. */
export function lights(w) {
  const key = w.rev + ':' + w.blocks.size;
  if (w._lightsKey !== key) {
    w._lightsKey = key;
    w._lights = [];
    for (const [k, type] of w.blocks) {
      if (!BLOCKS[type]?.light) continue;
      const [x, y, z] = k.split(',').map(Number);
      w._lights.push({ x, y, z, type });
    }
  }
  return w._lights;
}

/** Svítí nějaká pochodeň nebo táborák do `r` metrů od (x, z)? */
export function nearLight(w, x, z, r) {
  for (const s of lights(w)) if ((s.x + 0.5 - x) ** 2 + (s.z + 0.5 - z) ** 2 < r * r) return true;
  return false;
}

/** Táborák podle klíče bloku (založí ho, pokud ještě není). */
export function fireOf(w, k) {
  if (!w.fires.has(k)) w.fires.set(k, { slots: [null, null], t: 0 });
  return w.fires.get(k);
}
