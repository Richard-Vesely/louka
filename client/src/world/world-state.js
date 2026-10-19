// Stav světa: položené bloky, pokácené stromy; postup hráče.
import '../render/fireflies.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { SyncMap, SyncSet } from '../game/boot.js';
import { save } from '../game/save-load.js';

// ============================================================ stav světa (co hráč změnil)
export const removed = new SyncSet('removed', save?.removed || []);   // pokácené stromy, vytěžené balvany, sebrané úlomky
export const blocks = new SyncMap('blocks', save?.blocks || []);     // "x,y,z" -> typ bloku
export const blockMeta = new SyncMap('blockMeta', save?.blockMeta || []); // "x,y,z" -> otočení (bit 0–1) a horní půlblok (bit 2)
export const crafted = save?.crafted || {};
export const placedAny = save?.placedAny || {};
