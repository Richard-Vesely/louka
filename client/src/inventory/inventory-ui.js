// ============================================================ HUD – inventář, výroba, táborák (styl Minecraft)
// Kreslí hotbar, okno inventáře, mřížku výroby, knihu receptů a tooltipy.
// Triky z Minecraftu: klik = vzít/položit, pravé = půlka/po jednom, Shift+klik = přesunout,
// dvojklik = posbírat stejné, Shift+dvojklik = přesunout všechny stejné, tažení = rozdělit (levé) / po jednom (pravé),
// 1–9 nad políčkem = prohodit s hotbarem, F = s druhou rukou, Q = vyhodit (Ctrl+Q celé), klik mimo okno = vyhodit,
// mezerník = znovu poslední recept (Shift = víc najednou).
import { OFFHAND } from '@louka/shared/constants.js';
import { ITEMS } from '@louka/shared/items.js';
import { RECIPES, recipeNeeds } from '@louka/shared/recipes.js';
import { COOKING, COOK_TIME } from '@louka/shared/cooking.js';
import { $ } from '../core/dom.js';
import { ICONS } from '../render/icons.js';
import { canvas } from '../render/renderer.js';
import { SAVE_KEY, saveState } from '../save/load.js';
import { net } from '../net/net.js';
import { input } from '../player/controls.js';
import { inv, countItem } from './inventory.js';
import { ui, fireOf, hasFor, currentResult, slotClick, takeResult, fillRecipe, fillCooking } from './crafting.js';

const invEl = $('inventory'), cursorEl = $('cursorItem');

/** Přepínače vzhledu: advanced = pokročilé popisky (F3+H). */
export const invView = { advanced: false };

// Tažení s předmětem v kurzoru: { button, cells: [[c, i], …] }.
let drag = null;
const inDrag = (c, i) => drag?.cells.some(([dc, di]) => dc === c && di === i);

const iconImg = (id) => `<img src="${ICONS[id].url}" alt="">`;
function slotHTML(s, i, cls = '', c = 'inv') {
  if (inDrag(c, i)) cls += ' drag';
  if (!s) return `<div class="slot ${cls}" data-c="${c}" data-i="${i}"></div>`;
  return `<div class="slot ${cls}" data-c="${c}" data-i="${i}" data-item="${s.id}">${iconImg(s.id)}${s.n > 1 ? `<b>${s.n}</b>` : ''}</div>`;
}

/** Překreslí hotbar dole na obrazovce (a druhou ruku vedle něj). */
export function renderHotbar() {
  $('hotbar').innerHTML = inv.slots.slice(0, 9).map((s, i) => slotHTML(s, i, i === inv.sel ? 'active' : '')).join('');
  const off = inv.slots[OFFHAND];
  $('offhand').innerHTML = off ? slotHTML(off, OFFHAND) : '';
  $('offhand').style.display = off ? 'flex' : 'none';
}

// Co je v políčku (jak to vidí prohlížeč).
const slotOf = (c, i) => (c === 'inv' ? inv.slots[i] : c === 'craft' ? ui.craft[i] : fireOf(ui.fireKey).slots[i]);

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
  $('invOff').innerHTML = slotHTML(inv.slots[OFFHAND], OFFHAND);
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
  if (invView.advanced) lines.push(`<span class="adv">louka:${id} · max ${d.stack}</span>`);
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

// Políčko pod myší (pro klávesy 1–9, F a Q v otevřeném okně).
let hover = null;
const slotEl = (t) => { const sl = t.closest?.('.slot[data-c][data-i]'); return sl && sl.dataset.c !== 'cursor' ? sl : null; };
invEl.addEventListener('mouseover', (e) => { const sl = slotEl(e.target); hover = sl ? { c: sl.dataset.c, i: +sl.dataset.i } : null; if (sl && drag) dragOver(sl); });
invEl.addEventListener('mouseleave', () => { hover = null; });

let last = { t: 0, c: '', i: -1, id: null, shift: false }, lastRecipe = -1;
invEl.addEventListener('mousedown', (e) => {
  if (e.button === 1) return;
  const out = e.target.closest('[data-out]');
  if (out) return takeResult(e.shiftKey);
  const sl = slotEl(e.target);
  if (sl) {
    const c = sl.dataset.c, i = +sl.dataset.i, now = performance.now(), s = slotOf(c, i);
    const dbl = e.button === 0 && now - last.t < 300 && last.c === c && last.i === i;
    if (e.shiftKey) {
      // Shift + dvojklik: všechny hromádky stejného předmětu.
      if (dbl && last.shift && last.id) { last.t = 0; return net.act({ t: 'moveall', c, i, id: last.id }); }
      last = { t: now, c, i, id: s?.id, shift: true };
      return slotClick(c, i, e.button, true);
    }
    // Dvojklik: posbírat stejné věci do kurzoru.
    if (dbl && !last.shift) { last.t = 0; return net.act({ t: 'collect' }); }
    last = { t: now, c, i, id: s?.id, shift: false };
    // S věcí v kurzoru může začít tažení (rozhodne se při puštění tlačítka).
    if (inv.cursor && (e.button === 0 || e.button === 2)) { drag = { button: e.button, cells: [[c, i]] }; sl.classList.add('drag'); return; }
    return slotClick(c, i, e.button, false);
  }
  const rc = e.target.closest('[data-r]');
  if (rc) { lastRecipe = +rc.dataset.r; return fillRecipe(RECIPES[lastRecipe], e.shiftKey); }
  const ck = e.target.closest('[data-cook]');
  if (ck) return fillCooking(ck.dataset.cook);
  // Klik mimo okno s věcí v kurzoru: vyhodit (levé = všechno, pravé = jeden kus).
  if (inv.cursor && !e.target.closest('.mc-window, #controlsHelp')) net.act({ t: 'drop', c: 'cur', all: e.button === 0 });
});
invEl.addEventListener('contextmenu', (e) => e.preventDefault());

// Tažení: přidá políčko, kam se dá něco z kurzoru dát (prázdné nebo stejný předmět, ne výstup táboráku).
function dragOver(sl) {
  const c = sl.dataset.c, i = +sl.dataset.i, s = slotOf(c, i), cur = inv.cursor;
  if (!cur || inDrag(c, i) || (c === 'fire' && i === 1) || drag.cells.length >= cur.n) return;
  if (s && (s.id !== cur.id || s.n >= ITEMS[s.id].stack)) return;
  drag.cells.push([c, i]);
  sl.classList.add('drag');
}
addEventListener('mouseup', (e) => {
  if (!drag || e.button !== drag.button) return;
  const { cells, button } = drag;
  drag = null;
  for (const el of invEl.querySelectorAll('.slot.drag')) el.classList.remove('drag');
  if (cells.length === 1) slotClick(cells[0][0], cells[0][1], button, false);
  else { last.t = 0; net.act({ t: 'spread', cells, button }); } // tažení není první klik dvojkliku
});

/**
 * Klávesy v otevřeném okně (volá player/controls.js). Vrátí true, když klávesu zpracovalo.
 * 1–9 / F nad políčkem = prohodit s hotbarem / druhou rukou, Q = vyhodit, mezerník = znovu poslední recept.
 */
export function inventoryKey(e) {
  const m = e.code.match(/^Digit([1-9])$/);
  if (hover && (m || (e.code === 'KeyF' && !e.repeat))) {
    net.act({ t: 'swap', c: hover.c, i: hover.i, h: m ? Number(m[1]) - 1 : OFFHAND });
    return true;
  }
  if (hover && e.code === 'KeyQ') {
    net.act({ t: 'drop', c: hover.c, i: hover.i, all: e.ctrlKey || e.metaKey });
    return true;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (lastRecipe >= 0 && ui.mode !== 'fire') fillRecipe(RECIPES[lastRecipe], e.shiftKey);
    return true;
  }
  return false;
}

// Nápověda s ovládáním (tlačítko v okně inventáře).
$('controlsBtn').addEventListener('click', () => $('controlsHelp').classList.toggle('show'));
$('controlsHelp').addEventListener('mousedown', (e) => { e.stopPropagation(); $('controlsHelp').classList.remove('show'); });

/**
 * Otevře okno inventáře.
 * @param {'inv'|'bench'|'fire'} [mode] inventář, pracovní stůl nebo táborák
 * @param {string|null} [fireKey] klíč bloku táboráku
 */
export function openInventory(mode = 'inv', fireKey = null) {
  Object.assign(ui, { mode, size: mode === 'bench' ? 3 : 2, fireKey, ghost: null, open: true });
  net.act({ t: 'open', mode, k: fireKey });
  input.lmb = input.rmb = false;
  document.exitPointerLock?.();
  invEl.style.display = 'grid';
  renderInventory();
}

/** Zavře okno inventáře a vrátí věci z mřížky a z kurzoru do batohu. */
export function closeInventory() {
  net.act({ t: 'close' });
  ui.open = false;
  invEl.style.display = 'none';
  $('controlsHelp').classList.remove('show');
  drag = null;
  hover = null;
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
