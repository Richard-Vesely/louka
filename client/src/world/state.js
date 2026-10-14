// ============================================================ stav světa, jak ho vidí prohlížeč
// Offline: tohle JE stav hry (shared/game). Online: kopie, kterou plní zprávy ze serveru.
// Objekty se nikdy nevyměňují, jen se mění jejich obsah – proto je můžou ostatní soubory importovat.
import { createWorld } from '@louka/shared/game/world.js';
import { save } from '../save/load.js';

/** Stav světa (bloky, pokácené stromy, táboráky, čas) – viz shared/game/world.js. */
export const world = createWorld(save || {});

/** Pokácené stromy, vytěžené balvany, sebrané úlomky (jejich klíče, např. "t12,-4"). */
export const removed = world.removed;
/** Položené bloky: "x,y,z" -> typ bloku. */
export const blocks = world.blocks;
/** Táboráky: klíč bloku -> { slots: [vstup, výstup], t }. */
export const fires = world.fires;

/** Tvorové (offline je hýbe hra v prohlížeči, online server). */
export const mobs = [];
