// ============================================================ inventář
// 36 políček: 0–8 je hotbar (dole na obrazovce), 9–35 batoh.
import { ITEMS } from '@louka/shared/items.js';
import { save } from '../save/load.js';
import { feed, toast } from '../ui/hud.js';
import { renderHotbar, renderInventory } from './inventory-ui.js';

/**
 * slots – políčka ({ id, n } nebo null), sel – vybrané políčko hotbaru,
 * cursor – předmět, který držíš myší v otevřeném inventáři.
 */
export const inv = { slots: save?.inv || Array(36).fill(null), sel: 0, cursor: null };

/** Kolik kusů předmětu `id` máš v inventáři. */
export const countItem = (id) => inv.slots.reduce((n, s) => n + (s && s.id === id ? s.n : 0), 0);

/**
 * Vloží hromádku do políček from..to-1 (nejdřív doplní stejné, pak prázdná).
 * @returns {number} kolik kusů se nevešlo
 */
export function insertInto(stack, from, to) {
  const max = ITEMS[stack.id].stack;
  for (let i = from; i < to && stack.n > 0; i++) {
    const s = inv.slots[i];
    if (s && s.id === stack.id && s.n < max) { const k = Math.min(max - s.n, stack.n); s.n += k; stack.n -= k; }
  }
  for (let i = from; i < to && stack.n > 0; i++) {
    if (!inv.slots[i]) { const k = Math.min(max, stack.n); inv.slots[i] = { id: stack.id, n: k }; stack.n -= k; }
  }
  return stack.n;
}

/** Přidá předměty do inventáře (a ukáže "+N předmět" v rohu, pokud není `silent`). */
export function addItem(id, n, silent = false) {
  const left = insertInto({ id, n }, 0, 36);
  if (!silent && n - left > 0) feed(id, `+${n - left} ${ITEMS[id].name}`);
  if (left > 0) toast('Batoh je plný');
  renderHotbar();
  renderInventory();
  return left;
}

/** Odebere `n` kusů předmětu (od konce batohu). */
export function removeItem(id, n) {
  for (let i = 35; i >= 0 && n > 0; i--) {
    const s = inv.slots[i];
    if (s && s.id === id) { const k = Math.min(s.n, n); s.n -= k; n -= k; if (!s.n) inv.slots[i] = null; }
  }
}

/** Spotřebuje jeden kus z vybraného políčka hotbaru (jídlo, položený blok). */
export function consumeSelected() {
  const s = inv.slots[inv.sel];
  if (!s) return;
  if (--s.n <= 0) inv.slots[inv.sel] = null;
  renderHotbar();
}

/** Co držíš v ruce (vybrané políčko hotbaru). */
export const heldStack = () => inv.slots[inv.sel];
