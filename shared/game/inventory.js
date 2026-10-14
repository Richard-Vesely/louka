// ============================================================ inventář hráče
// 37 políček: 0–8 je hotbar (dole na obrazovce), 9–35 batoh, 36 druhá ruka (F).
// Funkce dostanou hráče `p` a volitelně `fx` – kam poslat zprávy pro hráče (feed, toast).
import { ITEMS } from '../items.js';
import { recipeNeeds } from '../recipes.js';
import { OFFHAND } from '../constants.js';

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
 * Přidá předměty do inventáře (druhou ruku nechá být). Co se nevejde, hra vyhodí na zem
 * (zpráva { t: 'spill', id, n } – viz Game.tell).
 * @param {function} [fx] zprávy pro hráče: { t: 'feed', id, n }, { t: 'toast', text }, { t: 'spill', id, n }
 * @param {boolean} [silent] bez zprávy "+N předmět"
 * @returns {number} kolik se nevešlo
 */
export function addItem(p, id, n, fx = null, silent = false) {
  const left = insertInto(p, { id, n }, 0, 36);
  if (!silent && n - left > 0) fx?.({ t: 'feed', id, n: n - left });
  if (left > 0) { fx?.({ t: 'toast', text: 'Batoh je plný' }); fx?.({ t: 'spill', id, n: left }); }
  return left;
}

/** Odebere `n` kusů předmětu (od konce batohu, druhou ruku až nakonec). */
export function removeItem(p, id, n) {
  const slots = p.inv.slots;
  for (const i of [...Array(OFFHAND).keys()].reverse().concat(OFFHAND)) {
    const s = slots[i];
    if (n <= 0) break;
    if (s && s.id === id) { const k = Math.min(s.n, n); s.n -= k; n -= k; if (!s.n) slots[i] = null; }
  }
  p.invDirty = true;
}

/** Spotřebuje jeden kus z vybraného políčka hotbaru, nebo z druhé ruky (`off`). */
export function consumeSelected(p, off = false) {
  const i = off ? OFFHAND : p.inv.sel, s = p.inv.slots[i];
  if (!s) return;
  if (--s.n <= 0) p.inv.slots[i] = null;
  p.invDirty = true;
}

/**
 * Prostřední tlačítko (pick block): jak dostat předmět `id` do ruky.
 * Je v hotbaru → vybere ho. Je v batohu → přesune ho na vybrané (nebo první volné) políčko hotbaru.
 * @returns {{sel:number, from:number}|null} sel = nové vybrané políčko, from = odkud z batohu (-1 = nic se nepřesouvá)
 */
export function pickPlan(p, id) {
  const s = p.inv.slots;
  for (let i = 0; i < 9; i++) if (s[i]?.id === id) return { sel: i, from: -1 };
  let from = -1;
  for (let i = 9; i < OFFHAND && from < 0; i++) if (s[i]?.id === id) from = i;
  if (from < 0) return null;
  let sel = p.inv.sel;
  if (s[sel]) { const free = s.findIndex((x, i) => i < 9 && !x); if (free >= 0) sel = free; }
  return { sel, from };
}

/** Provede pickPlan: vybere políčko a případně prohodí hromádky. */
export function pickItem(p, id) {
  const plan = pickPlan(p, id);
  if (!plan) return null;
  const s = p.inv.slots;
  p.inv.sel = plan.sel;
  if (plan.from >= 0) [s[plan.sel], s[plan.from]] = [s[plan.from], s[plan.sel]];
  p.invDirty = true;
  return plan;
}

/** Má hráč všechny suroviny na recept? */
export const hasFor = (p, r) => Object.entries(recipeNeeds(r)).every(([id, n]) => countItem(p, id) >= n);
