// Postup hráče: co už vyrobil a položil (rady na obrazovce).
import '../render/fireflies.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { on } from '../../../shared/events.js';
import { save } from '../game/save-load.js';

// ============================================================ stav světa (co hráč změnil)
// (bloky, pokácené stromy a další stav světa jsou v shared/world/state.js)
export const crafted = save?.crafted || {};
export const placedAny = save?.placedAny || {};
on('crafted', (id) => { crafted[id] = true; }); // stroj (táborák, pec, sporák…) něco dodělal
