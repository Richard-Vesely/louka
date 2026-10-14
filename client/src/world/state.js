// ============================================================ stav světa (co hráč změnil)
// Svět se generuje sám ze semínka. Tady je jen to, co hráč změnil – to se ukládá.
import { save } from '../save/load.js';

/** Pokácené stromy, vytěžené balvany, sebrané úlomky (jejich klíče, např. "t12,-4"). */
export const removed = new Set(save?.removed || []);

/** Položené bloky: "x,y,z" -> typ bloku. */
export const blocks = new Map(save?.blocks || []);

/** Co už hráč někdy vyrobil (pro rady). */
export const crafted = save?.crafted || {};

/** Které bloky už hráč někdy položil (pro rady). */
export const placedAny = save?.placedAny || {};

/** Táboráky: klíč bloku -> { slots: [vstup, výstup], t }. */
export const fires = new Map(Object.entries(save?.fires || {}));
