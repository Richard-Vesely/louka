// ============================================================ inventář hráče
// 36 políček: 0–8 je hotbar (dole na obrazovce), 9–35 batoh.
// Funkce dostanou hráče `p` a volitelně `fx` – kam poslat zprávy pro hráče (feed, toast).
import { ITEMS } from '../items.js';
import { recipeNeeds } from '../recipes.js';

/** Kolik kusů předmětu `id` má hráč v inventáři. */
export const countItem = (p, id) => p.inv.slots.reduce((n, s) => n + (s && s.id === id ? s.n : 0), 0);

/**
 * Vloží hromádku do políček from..to-1 (nejdřív doplní stejné, pak prázdná).
 * @returns {number} kolik kusů se nevešlo
 */
export function insertInto(p, stack, from, to) {
  const slots = p.inv.slots, max = ITEMS[stack.id].stack;
  for (let i = from; i < to && stack.n > 0; i++) {
    const s = slots[i];
    if (s && s.id === stack.id && s.n < max) { const k = Math.min(max - s.n, stack.n); s.n += k; stack.n -= k; }
  }
  for (let i = from; i < to && stack.n > 0; i++) {
    if (!slots[i]) { const k = Math.min(max, stack.n); slots[i] = { id: stack.id, n: k }; stack.n -= k; }
  }
  p.invDirty = true;
  return stack.n;
}

/**
 * Přidá předměty do inventáře.
 * @param {function} [fx] zprávy pro hráče: { t: 'feed', id, n } a { t: 'toast', text }
 * @param {boolean} [silent] bez zprávy "+N předmět"
 * @returns {number} kolik se nevešlo
 */
export function addItem(p, id, n, fx = null, silent = false) {
  const left = insertInto(p, { id, n }, 0, 36);
  if (!silent && n - left > 0) fx?.({ t: 'feed', id, n: n - left });
  if (left > 0) fx?.({ t: 'toast', text: 'Batoh je plný' });
  return left;
}

/** Odebere `n` kusů předmětu (od konce batohu). */
export function removeItem(p, id, n) {
  const slots = p.inv.slots;
  for (let i = 35; i >= 0 && n > 0; i--) {
    const s = slots[i];
    if (s && s.id === id) { const k = Math.min(s.n, n); s.n -= k; n -= k; if (!s.n) slots[i] = null; }
  }
  p.invDirty = true;
}

/** Spotřebuje jeden kus z vybraného políčka hotbaru (jídlo, položený blok). */
export function consumeSelected(p) {
  const s = p.inv.slots[p.inv.sel];
  if (!s) return;
  if (--s.n <= 0) p.inv.slots[p.inv.sel] = null;
  p.invDirty = true;
}

/** Má hráč všechny suroviny na recept? */
export const hasFor = (p, r) => Object.entries(recipeNeeds(r)).every(([id, n]) => countItem(p, id) >= n);
