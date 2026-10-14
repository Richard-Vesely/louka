// ============================================================ výroba a táborák
// Co se stane, když klikneš na políčko, vezmeš výsledek výroby nebo použiješ knihu receptů.
import { ITEMS } from '@louka/shared/items.js';
import { findRecipe, recipeNeeds } from '@louka/shared/recipes.js';
import { COOKING, COOK_TIME } from '@louka/shared/cooking.js';
import { Sound } from '../audio/sound.js';
import { sparks } from '../render/particles.js';
import { blocks, crafted, fires } from '../world/state.js';
import { specials } from '../world/blocks.js';
import { toast } from '../ui/hud.js';
import { inv, countItem, insertInto, addItem, removeItem } from './inventory.js';
import { renderHotbar, renderInventory, renderCraftArea } from './inventory-ui.js';

/**
 * Stav okna inventáře.
 * open – je otevřené, mode: 'inv' = inventář s mřížkou 2×2, 'bench' = pracovní stůl 3×3, 'fire' = táborák,
 * size – velikost mřížky, craft – políčka mřížky, fireKey – který táborák, ghost – průhledná nápověda receptu.
 */
export const ui = { open: false, mode: 'inv', size: 2, craft: Array(9).fill(null), fireKey: null, ghost: null };

/** Táborák podle klíče bloku (založí ho, pokud ještě není). */
export const fireOf = (k) => { if (!fires.has(k)) fires.set(k, { slots: [null, null], t: 0 }); return fires.get(k); };
/** Políčka podle jména: 'inv' batoh, 'craft' mřížka výroby, 'fire' otevřený táborák. */
const container = (c) => (c === 'inv' ? inv.slots : c === 'craft' ? ui.craft : fireOf(ui.fireKey).slots);

/** Máš všechny suroviny na recept? */
export const hasFor = (r) => Object.entries(recipeNeeds(r)).every(([id, n]) => countItem(id) >= n);
/** Recept, který teď leží v mřížce (nebo null). */
export const currentResult = () => (ui.mode === 'fire' ? null : findRecipe(ui.craft, ui.size));

function refreshUI() { renderInventory(); renderHotbar(); }

/**
 * Klik na políčko: vzít / položit / prohodit / sloučit, pravé = půlka nebo po jednom, Shift = rychlý přesun.
 * @param {'inv'|'craft'|'fire'} c které políčka
 * @param {number} i číslo políčka
 * @param {number} button 0 levé, 2 pravé tlačítko
 * @param {boolean} shift držíš Shift
 */
export function slotClick(c, i, button, shift) {
  const arr = container(c);
  const s = arr[i];
  if (c === 'fire' && i === 1) { // výstup táboráku se jen vybírá
    if (!s) return;
    if (shift) { arr[1] = null; const left = insertInto(s, 0, 36); if (left) arr[1] = { id: s.id, n: left }; }
    else if (!inv.cursor) { inv.cursor = s; arr[1] = null; }
    else if (inv.cursor.id === s.id) { const k = Math.min(ITEMS[s.id].stack - inv.cursor.n, s.n); inv.cursor.n += k; if (!(s.n -= k)) arr[1] = null; }
    return refreshUI();
  }
  if (shift && s && !inv.cursor) {
    arr[i] = null;
    let left = s.n;
    if (c !== 'inv') left = insertInto(s, 0, 36);
    else if (ui.mode === 'fire' && COOKING[s.id]) {
      const f = fireOf(ui.fireKey);
      if (!f.slots[0]) { f.slots[0] = s; left = 0; }
      else if (f.slots[0].id === s.id) { const k = Math.min(ITEMS[s.id].stack - f.slots[0].n, s.n); f.slots[0].n += k; left = s.n - k; }
    } else left = i < 9 ? insertInto(s, 9, 36) : insertInto(s, 0, 9);
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
  refreshUI();
}

/** Vybrání výsledku z výstupního políčka spotřebuje po jednom kusu z každého políčka mřížky. */
export function takeResult(shift) {
  let r = currentResult();
  if (!r) return;
  let made = 0;
  do {
    if (shift) { if (insertInto({ id: r.out, n: r.n }, 0, 36)) break; }
    else if (!inv.cursor) inv.cursor = { id: r.out, n: r.n };
    else if (inv.cursor.id === r.out && inv.cursor.n + r.n <= ITEMS[r.out].stack) inv.cursor.n += r.n;
    else break;
    for (let i = 0; i < ui.craft.length; i++) if (ui.craft[i] && !--ui.craft[i].n) ui.craft[i] = null;
    crafted[r.out] = true;
    made++;
  } while (shift && made < 64 && currentResult() === r);
  if (made) Sound.craft();
  refreshUI();
}

/** Vrátí všechno z mřížky výroby zpátky do batohu. */
export function returnGrid() {
  for (let i = 0; i < ui.craft.length; i++) if (ui.craft[i]) { addItem(ui.craft[i].id, ui.craft[i].n, true); ui.craft[i] = null; }
}

/** Kniha receptů: rozloží suroviny do mřížky (jako recipe book v Minecraftu). Shift = víc najednou. */
export function fillRecipe(r, shift) {
  if (r.w > ui.size || r.h > ui.size) { toast('Tento recept potřebuje pracovní stůl'); return; }
  returnGrid();
  const need = recipeNeeds(r);
  let times = Infinity;
  for (const [id, n] of Object.entries(need)) times = Math.min(times, Math.floor(countItem(id) / n));
  times = Math.min(times, shift ? 64 : 1);
  ui.ghost = null;
  if (times < 1) {
    ui.ghost = Array(9).fill(null);
    r.pat.forEach((row, y) => row.forEach((id, x) => { ui.ghost[y * ui.size + x] = id; }));
    toast('Chybí ti suroviny');
    return refreshUI();
  }
  r.pat.forEach((row, y) => row.forEach((id, x) => {
    if (!id) return;
    removeItem(id, times);
    ui.craft[y * ui.size + x] = { id, n: times };
  }));
  refreshUI();
}

/** Vloží do otevřeného táboráku co nejvíc suroviny `id` (maso nebo rudu). */
export function fillCooking(id) {
  const f = fireOf(ui.fireKey);
  if (f.slots[0] && f.slots[0].id !== id) { addItem(f.slots[0].id, f.slots[0].n, true); f.slots[0] = null; }
  const have = countItem(id);
  if (!have) { toast('Nemáš ' + ITEMS[id].name.toLowerCase()); return; }
  const k = Math.min(have, ITEMS[id].stack - (f.slots[0]?.n || 0));
  removeItem(id, k);
  if (f.slots[0]) f.slots[0].n += k; else f.slots[0] = { id, n: k };
  refreshUI();
}

// Táboráky pečou i se zavřeným oknem.
let fireRenderT = 0;
export function updateFires(dt) {
  for (const [k, f] of fires) {
    if (!blocks.has(k)) continue;
    const [inp, out] = f.slots;
    const res = inp && COOKING[inp.id];
    if (!res || (out && (out.id !== res || out.n >= ITEMS[res].stack))) { f.t = 0; continue; }
    f.t += dt;
    if (f.t < COOK_TIME) continue;
    f.t = 0;
    if (!--inp.n) f.slots[0] = null;
    if (out) out.n++; else f.slots[1] = { id: res, n: 1 };
    crafted[res] = true;
    const s = specials.get(k);
    if (s) sparks.emit(s.x + 0.5, s.ry + 0.6, s.z + 0.5, [1, 0.6, 0.2], 12, 1.5, 2);
  }
  if (ui.open && ui.mode === 'fire' && (fireRenderT -= dt) <= 0) { fireRenderT = 0.15; renderCraftArea(); }
}
