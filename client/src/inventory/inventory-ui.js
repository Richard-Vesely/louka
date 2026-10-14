// ============================================================ HUD – inventář, výroba, táborák (styl Minecraft)
// Kreslí hotbar, okno inventáře, mřížku výroby, knihu receptů a tooltipy.
import { ITEMS } from '@louka/shared/items.js';
import { RECIPES, recipeNeeds } from '@louka/shared/recipes.js';
import { COOKING, COOK_TIME } from '@louka/shared/cooking.js';
import { $ } from '../core/dom.js';
import { ICONS } from '../render/icons.js';
import { canvas } from '../render/renderer.js';
import { SAVE_KEY, saveState } from '../save/load.js';
import { input } from '../player/controls.js';
import { inv, countItem, addItem } from './inventory.js';
import { ui, fireOf, hasFor, currentResult, slotClick, takeResult, returnGrid, fillRecipe, fillCooking } from './crafting.js';

const invEl = $('inventory'), cursorEl = $('cursorItem');

const iconImg = (id) => `<img src="${ICONS[id].url}" alt="">`;
function slotHTML(s, i, cls = '', c = 'inv') {
  if (!s) return `<div class="slot ${cls}" data-c="${c}" data-i="${i}"></div>`;
  return `<div class="slot ${cls}" data-c="${c}" data-i="${i}" data-item="${s.id}">${iconImg(s.id)}${s.n > 1 ? `<b>${s.n}</b>` : ''}</div>`;
}

/** Překreslí hotbar dole na obrazovce. */
export function renderHotbar() {
  $('hotbar').innerHTML = inv.slots.slice(0, 9).map((s, i) => slotHTML(s, i, i === inv.sel ? 'active' : '')).join('');
}

let onlyCraftable = false;

/** Překreslí mřížku výroby (nebo okno táboráku). */
export function renderCraftArea() {
  const area = $('craftArea');
  if (ui.mode === 'fire') {
    const f = fireOf(ui.fireKey), [inp, out] = f.slots;
    const cooking = inp && COOKING[inp.id];
    const p = cooking ? (f.t / COOK_TIME) * 100 : 0;
    area.innerHTML = `<div class="mc-title">Táborák</div>
      <div class="fire-ui">
        <div class="fire-col">${slotHTML(inp, 0, '', 'fire')}<div class="flame ${cooking ? 'on' : ''}">${iconImg('campfire')}</div></div>
        <div class="parrow"><i style="width:${p}%"></i></div>
        ${slotHTML(out, 1, 'out', 'fire')}
      </div>
      <div class="mc-note">${cooking ? 'Peče se…' : 'Vlož syrové maso nebo železnou rudu.'}</div>`;
    return;
  }
  const n = ui.size;
  let cells = '';
  for (let i = 0; i < n * n; i++) {
    const s = ui.craft[i];
    const g = !s && ui.ghost ? ui.ghost[i] : null;
    cells += s ? slotHTML(s, i, '', 'craft') : `<div class="slot ${g ? 'ghost' : ''}" data-c="craft" data-i="${i}">${g ? iconImg(g) : ''}</div>`;
  }
  const r = currentResult();
  area.innerHTML = `<div class="mc-title">${ui.mode === 'bench' ? 'Pracovní stůl' : 'Výroba'}</div>
    <div class="craft-ui">
      <div class="cgrid" style="grid-template-columns: repeat(${n}, 40px)">${cells}</div>
      <span class="carrow">➜</span>
      <div class="slot out" data-out="1" ${r ? `data-item="${r.out}"` : ''}>${r ? iconImg(r.out) + (r.n > 1 ? `<b>${r.n}</b>` : '') : ''}</div>
    </div>
    <div class="mc-note">${ui.mode === 'bench' ? 'Mřížka 3×3 – všechny recepty.' : 'Větší recepty vyrobíš u pracovního stolu.'}</div>`;
}

function renderBook() {
  $('onlyCraftable').parentElement.style.display = ui.mode === 'fire' ? 'none' : '';
  if (ui.mode === 'fire') {
    $('bookTitle').textContent = 'Pečení a tavení';
    $('recipes').innerHTML = Object.entries(COOKING).map(([from, to]) =>
      `<div class="slot ${countItem(from) ? '' : 'no'}" data-cook="${from}" data-item="${to}">${iconImg(to)}</div>`).join('');
    $('bookHint').textContent = 'Klikni a suroviny se vloží do táboráku.';
    return;
  }
  $('bookTitle').textContent = 'Recepty';
  $('recipes').innerHTML = RECIPES.map((r, i) => {
    const fits = r.w <= ui.size && r.h <= ui.size;
    const ok = fits && hasFor(r);
    if (onlyCraftable && !ok) return '';
    return `<div class="slot ${ok ? '' : 'no'}" data-r="${i}" data-item="${r.out}">${iconImg(r.out)}${r.n > 1 ? `<b>${r.n}</b>` : ''}</div>`;
  }).join('');
  $('bookHint').textContent = 'Klikni na recept a suroviny se samy rozloží do mřížky (Shift = víc najednou).';
}

/** Překreslí celé okno inventáře (jen když je otevřené). */
export function renderInventory() {
  if (!ui.open) return;
  let html = '';
  for (let i = 9; i < 36; i++) html += slotHTML(inv.slots[i], i);
  $('invGrid').innerHTML = html;
  html = '';
  for (let i = 0; i < 9; i++) html += slotHTML(inv.slots[i], i);
  $('invHot').innerHTML = html;
  renderCraftArea();
  renderBook();
  cursorEl.innerHTML = inv.cursor ? slotHTML(inv.cursor, -1, '', 'cursor') : '';
  cursorEl.style.display = inv.cursor ? 'block' : 'none';
}

// Tooltip s názvem a popisem předmětu (jako v Minecraftu).
const tooltip = $('tooltip');
function itemInfo(id, el) {
  const d = ITEMS[id];
  const lines = [];
  if (d.tool) lines.push(`${['', 'Dřevo', 'Kámen', 'Železo', 'Krystal'][d.tier]} · poškození ${d.dmg}`);
  if (d.food) lines.push(`Jídlo +${d.food}${d.heal ? ` · zdraví +${d.heal}` : ''} (pravé tl.)`);
  if (d.block) lines.push('Lze položit (pravé tl.)');
  if (el?.dataset.r !== undefined) {
    const r = RECIPES[+el.dataset.r];
    lines.push(Object.entries(recipeNeeds(r)).map(([k, n]) => `${n}× ${ITEMS[k].name}`).join(', '));
    if (r.w > ui.size || r.h > ui.size) lines.push('<span style="color:#ff8a7a">Potřebuješ pracovní stůl</span>');
  }
  if (el?.dataset.cook) lines.push(`z: ${ITEMS[el.dataset.cook].name}`);
  return `<div class="${d.tier ? 't' + d.tier : ''}">${d.name}</div>${lines.map((l) => `<div class="sub">${l}</div>`).join('')}`;
}
addEventListener('mouseover', (e) => {
  const el = e.target.closest?.('[data-item]');
  if (!el || !ui.open || el.closest('#cursorItem')) { tooltip.style.display = 'none'; return; }
  tooltip.innerHTML = itemInfo(el.dataset.item, el);
  tooltip.style.display = 'block';
});
addEventListener('mousemove', (e) => {
  tooltip.style.left = e.clientX + 14 + 'px';
  tooltip.style.top = e.clientY - 30 + 'px';
  cursorEl.style.left = e.clientX + 'px';
  cursorEl.style.top = e.clientY + 'px';
});
$('onlyCraftable').addEventListener('change', (e) => { onlyCraftable = e.target.checked; renderInventory(); });

invEl.addEventListener('mousedown', (e) => {
  const out = e.target.closest('[data-out]');
  if (out) return takeResult(e.shiftKey);
  const sl = e.target.closest('.slot[data-c][data-i]');
  if (sl && sl.dataset.c !== 'cursor') return slotClick(sl.dataset.c, +sl.dataset.i, e.button, e.shiftKey);
  const rc = e.target.closest('[data-r]');
  if (rc) return fillRecipe(RECIPES[+rc.dataset.r], e.shiftKey);
  const ck = e.target.closest('[data-cook]');
  if (ck) fillCooking(ck.dataset.cook);
});
invEl.addEventListener('contextmenu', (e) => e.preventDefault());

/**
 * Otevře okno inventáře.
 * @param {'inv'|'bench'|'fire'} [mode] inventář, pracovní stůl nebo táborák
 * @param {string|null} [fireKey] klíč bloku táboráku
 */
export function openInventory(mode = 'inv', fireKey = null) {
  ui.mode = mode;
  ui.size = mode === 'bench' ? 3 : 2;
  ui.fireKey = fireKey;
  ui.ghost = null;
  ui.open = true;
  input.lmb = input.rmb = false;
  document.exitPointerLock?.();
  invEl.style.display = 'grid';
  renderInventory();
}

/** Zavře okno inventáře a vrátí věci z mřížky a z kurzoru do batohu. */
export function closeInventory() {
  returnGrid();
  if (inv.cursor) { addItem(inv.cursor.id, inv.cursor.n, true); inv.cursor = null; }
  ui.open = false;
  invEl.style.display = 'none';
  cursorEl.style.display = 'none';
  tooltip.style.display = 'none';
  renderHotbar();
  canvas.requestPointerLock?.()?.catch?.(() => {});
}

$('newWorld').addEventListener('click', () => {
  if (!confirm('Opravdu začít v novém světě? Současný postup bude smazán.')) return;
  saveState.resetting = true;
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  location.reload();
});
