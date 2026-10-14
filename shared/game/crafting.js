// ============================================================ okno inventáře: výroba a táborák
// Co se stane, když hráč klikne na políčko, vezme výsledek výroby nebo použije knihu receptů.
// Stejný kód běží na serveru (rozhoduje) i v prohlížeči (hned ukáže výsledek).
import { ITEMS } from '../items.js';
import { findRecipe, recipeNeeds } from '../recipes.js';
import { COOKING } from '../cooking.js';
import { OFFHAND } from '../constants.js';
import { fireOf } from './world.js';
import { countItem, insertInto, addItem, removeItem } from './inventory.js';

/** Recept, který teď leží v mřížce výroby (nebo null). */
export const currentResult = (p) => (p.ui.mode === 'fire' ? null : findRecipe(p.ui.craft, p.ui.size));

/** Políčka podle jména: 'inv' batoh, 'craft' mřížka výroby, 'fire' otevřený táborák. */
export const container = (p, w, c) => (c === 'inv' ? p.inv.slots : c === 'craft' ? p.ui.craft : fireOf(w, p.ui.fireKey).slots);

/**
 * Klik na políčko: vzít / položit / prohodit / sloučit, pravé = půlka nebo po jednom, Shift = rychlý přesun.
 * @param {'inv'|'craft'|'fire'} c které políčka
 * @param {number} i číslo políčka
 * @param {number} button 0 levé, 2 pravé tlačítko
 * @param {boolean} shift držíš Shift
 */
export function slotClick(p, w, c, i, button, shift) {
  const inv = p.inv, ui = p.ui;
  const arr = container(p, w, c);
  const s = arr[i];
  p.invDirty = true;
  if (c === 'fire' && i === 1) { // výstup táboráku se jen vybírá
    if (!s) return;
    if (shift) { arr[1] = null; const left = insertInto(p, s, 0, OFFHAND); if (left) arr[1] = { id: s.id, n: left }; }
    else if (!inv.cursor) { inv.cursor = s; arr[1] = null; }
    else if (inv.cursor.id === s.id) { const k = Math.min(ITEMS[s.id].stack - inv.cursor.n, s.n); inv.cursor.n += k; if (!(s.n -= k)) arr[1] = null; }
    return;
  }
  if (shift && s && !inv.cursor) {
    arr[i] = null;
    let left = s.n;
    if (c !== 'inv') left = insertInto(p, s, 0, OFFHAND);
    else if (ui.mode === 'fire' && COOKING[s.id]) {
      const f = fireOf(w, ui.fireKey);
      if (!f.slots[0]) { f.slots[0] = s; left = 0; }
      else if (f.slots[0].id === s.id) { const k = Math.min(ITEMS[s.id].stack - f.slots[0].n, s.n); f.slots[0].n += k; left = s.n - k; }
    } else left = i === OFFHAND ? insertInto(p, s, 0, OFFHAND) : i < 9 ? insertInto(p, s, 9, OFFHAND) : insertInto(p, s, 0, 9);
    if (left) arr[i] = { id: s.id, n: left };
  } else if (button === 2) {
    if (inv.cursor) {
      if (!s) arr[i] = { id: inv.cursor.id, n: 1 };
      else if (s.id === inv.cursor.id && s.n < ITEMS[s.id].stack) s.n++;
      else return;
      if (--inv.cursor.n <= 0) inv.cursor = null;
    } else if (s) {
      const half = Math.ceil(s.n / 2);
      inv.cursor = { id: s.id, n: half };
      if (!(s.n -= half)) arr[i] = null;
    }
  } else if (!inv.cursor) {
    if (s) { inv.cursor = s; arr[i] = null; }
  } else if (!s) {
    arr[i] = inv.cursor; inv.cursor = null;
  } else if (s.id === inv.cursor.id) {
    const k = Math.min(ITEMS[s.id].stack - s.n, inv.cursor.n);
    s.n += k;
    if ((inv.cursor.n -= k) <= 0) inv.cursor = null;
  } else {
    arr[i] = inv.cursor; inv.cursor = s;
  }
  if (c === 'craft') ui.ghost = null;
}

/**
 * Klávesa 1–9 (nebo F) nad políčkem: prohodí ho s políčkem hotbaru `h` (0–8, nebo 36 = druhá ruka).
 * Z výstupu táboráku se jen bere (do prázdného nebo stejného políčka).
 */
export function swapSlot(p, w, c, i, h) {
  const arr = container(p, w, c), slots = p.inv.slots;
  if (arr === slots && i === h) return;
  p.invDirty = true;
  if (c === 'fire' && i === 1) {
    const s = arr[1], t = slots[h];
    if (!s) return;
    if (!t) { slots[h] = s; arr[1] = null; }
    else if (t.id === s.id) { const k = Math.min(ITEMS[s.id].stack - t.n, s.n); t.n += k; if (!(s.n -= k)) arr[1] = null; }
    return;
  }
  [arr[i], slots[h]] = [slots[h], arr[i]];
  if (c === 'craft') p.ui.ghost = null;
}

/** Dvojklik: posbírá do kurzoru stejné předměty z batohu a mřížky (nejdřív neúplné hromádky). */
export function collectToCursor(p) {
  const cur = p.inv.cursor;
  if (!cur) return;
  const max = ITEMS[cur.id].stack;
  const arrs = [p.ui.craft, p.inv.slots];
  for (const full of [false, true]) {
    for (const arr of arrs) {
      for (let i = 0; i < arr.length && cur.n < max; i++) {
        const s = arr[i];
        if (!s || s.id !== cur.id || (s.n >= max) !== full) continue;
        const k = Math.min(max - cur.n, s.n);
        cur.n += k;
        if (!(s.n -= k)) arr[i] = null;
      }
    }
  }
  p.invDirty = true;
}

/**
 * Tažení myší s předmětem v kurzoru přes víc políček (cells = [[c, i], ...]).
 * Levé tlačítko rozdělí hromádku rovným dílem, pravé dá do každého políčka jeden kus.
 */
export function spreadCursor(p, w, cells, button) {
  const cur = p.inv.cursor;
  if (!cur) return;
  const max = ITEMS[cur.id].stack, seen = new Set(), targets = [];
  for (const [c, i] of cells) {
    if (seen.has(c + i) || (c === 'fire' && (i === 1 || p.ui.mode !== 'fire')) || (c === 'craft' && (p.ui.mode === 'fire' || i >= p.ui.size * p.ui.size))) continue;
    seen.add(c + i);
    const arr = container(p, w, c), s = arr[i];
    if (!s || (s.id === cur.id && s.n < max)) targets.push([arr, i]);
  }
  const use = targets.slice(0, cur.n);
  if (!use.length) return;
  const each = button === 2 ? 1 : Math.floor(cur.n / use.length);
  for (const [arr, i] of use) {
    const s = arr[i], k = Math.min(each, max - (s?.n || 0));
    if (s) s.n += k; else arr[i] = { id: cur.id, n: k };
    cur.n -= k;
  }
  if (cur.n <= 0) p.inv.cursor = null;
  if (cells.some(([c]) => c === 'craft')) p.ui.ghost = null;
  p.invDirty = true;
}

/** Shift + dvojklik: rychlý přesun všech hromádek předmětu `id` ze stejné části okna jako políčko (c, i). */
export function quickMoveAll(p, w, c, i, id) {
  if (p.inv.cursor) return;
  let range;
  if (c === 'craft') range = [...p.ui.craft.keys()];
  else if (c === 'inv') range = i === OFFHAND ? [OFFHAND] : i < 9 ? [...Array(9).keys()] : [...Array(27).keys()].map((k) => k + 9);
  else return;
  const arr = container(p, w, c);
  for (const j of range) if (arr[j]?.id === id) slotClick(p, w, c, j, 0, true);
}

/** Vybrání výsledku z výstupního políčka spotřebuje po jednom kusu z každého políčka mřížky. Shift = co nejvíc. */
export function takeResult(p, shift, fx = null) {
  const inv = p.inv, ui = p.ui;
  const r = currentResult(p);
  if (!r) return;
  let made = 0;
  do {
    if (shift) { if (insertInto(p, { id: r.out, n: r.n }, 0, OFFHAND)) break; }
    else if (!inv.cursor) inv.cursor = { id: r.out, n: r.n };
    else if (inv.cursor.id === r.out && inv.cursor.n + r.n <= ITEMS[r.out].stack) inv.cursor.n += r.n;
    else break;
    for (let i = 0; i < ui.craft.length; i++) if (ui.craft[i] && !--ui.craft[i].n) ui.craft[i] = null;
    p.crafted[r.out] = true;
    made++;
  } while (shift && made < 64 && currentResult(p) === r);
  if (made) fx?.({ t: 'sound', name: 'craft' });
  p.invDirty = true;
}

/** Vrátí všechno z mřížky výroby zpátky do batohu. */
export function returnGrid(p, fx = null) {
  const craft = p.ui.craft;
  for (let i = 0; i < craft.length; i++) if (craft[i]) { addItem(p, craft[i].id, craft[i].n, fx, true); craft[i] = null; }
}

/** Kniha receptů: rozloží suroviny do mřížky (jako recipe book v Minecraftu). Shift = víc najednou. */
export function fillRecipe(p, r, shift, fx = null) {
  const ui = p.ui;
  if (r.w > ui.size || r.h > ui.size) { fx?.({ t: 'toast', text: 'Tento recept potřebuje pracovní stůl' }); return; }
  returnGrid(p, fx);
  const need = recipeNeeds(r);
  let times = Infinity;
  for (const [id, n] of Object.entries(need)) times = Math.min(times, Math.floor(countItem(p, id) / n));
  times = Math.min(times, shift ? 64 : 1);
  ui.ghost = null;
  p.invDirty = true;
  if (times < 1) {
    ui.ghost = Array(9).fill(null);
    r.pat.forEach((row, y) => row.forEach((id, x) => { ui.ghost[y * ui.size + x] = id; }));
    fx?.({ t: 'toast', text: 'Chybí ti suroviny' });
    return;
  }
  r.pat.forEach((row, y) => row.forEach((id, x) => {
    if (!id) return;
    removeItem(p, id, times);
    ui.craft[y * ui.size + x] = { id, n: times };
  }));
}

/** Vloží do otevřeného táboráku co nejvíc suroviny `id` (maso nebo rudu). */
export function fillCooking(p, w, id, fx = null) {
  const f = fireOf(w, p.ui.fireKey);
  if (f.slots[0] && f.slots[0].id !== id) { addItem(p, f.slots[0].id, f.slots[0].n, fx, true); f.slots[0] = null; }
  const have = countItem(p, id);
  if (!have) { fx?.({ t: 'toast', text: 'Nemáš ' + ITEMS[id].name.toLowerCase() }); return; }
  const k = Math.min(have, ITEMS[id].stack - (f.slots[0]?.n || 0));
  removeItem(p, id, k);
  if (f.slots[0]) f.slots[0].n += k; else f.slots[0] = { id, n: k };
}

/**
 * Otevře okno inventáře.
 * @param {'inv'|'bench'|'fire'} mode inventář (2×2), pracovní stůl (3×3) nebo táborák
 * @param {string|null} fireKey klíč bloku táboráku
 */
export function openWindow(p, mode, fireKey) {
  Object.assign(p.ui, { mode, size: mode === 'bench' ? 3 : 2, fireKey, ghost: null, open: true });
  p.invDirty = true;
}

/** Zavře okno: věci z mřížky a z kurzoru se vrátí do batohu. */
export function closeWindow(p, fx = null) {
  returnGrid(p, fx);
  if (p.inv.cursor) { addItem(p, p.inv.cursor.id, p.inv.cursor.n, fx, true); p.inv.cursor = null; }
  p.ui.open = false;
  p.invDirty = true;
}
