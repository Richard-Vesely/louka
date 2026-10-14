// ============================================================ uložená hra – načtení
// Uložený svět je v prohlížeči (localStorage). Načte se jednou při startu.

export const SAVE_KEY = 'rise-svet-v2';

/** Uložená hra z minula, nebo null (nová hra). */
export const save = (() => {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
})();

/** resetting = právě mažeme svět (tlačítko "Nový svět"), takže už neukládat. */
export const saveState = { resetting: false };
