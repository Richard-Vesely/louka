// ============================================================ ovládání (klávesnice a myš) – jako v Minecraftu
// WASD chůze · Ctrl nebo 2× W běh · Shift plížení · mezerník skok · 1–9 a kolečko výběr
// Q vyhodit (Ctrl+Q celou hromádku) · F prohodit ruce · prostřední tlačítko = vzít blok do ruky (pick block)
// E inventář. Klávesy v otevřeném inventáři řeší inventory-ui.js, F1–F11 ui/fkeys.js.
import { clamp } from '@louka/shared/math.js';
import { pickPlan } from '@louka/shared/game/inventory.js';
import { $ } from '../core/dom.js';
import { debug } from '../core/runtime.js';
import { canvas } from '../render/renderer.js';
import { startSwing } from '../render/held-item.js';
import { Sound } from '../audio/sound.js';
import { net } from '../net/net.js';
import { inv } from '../inventory/inventory.js';
import { ui } from '../inventory/crafting.js';
import { renderHotbar, openInventory, closeInventory, inventoryKey } from '../inventory/inventory-ui.js';
import { player } from './state.js';
import { act, pickId } from './interaction.js';

/** Klávesy, které jsou právě stisknuté (např. 'KeyW', 'Space'). */
export const keys = new Set();
/** Tlačítka myši: lmb levé (těžba/útok), rmb pravé (položit/jíst). */
export const input = { lmb: false, rmb: false };
/** sprint – běh je zapnutý (Ctrl nebo dvakrát W). Vypne ho player.js, když pustíš W. */
export const move = { sprint: false };

/** Je myš zamčená ve hře? */
export const isLocked = () => document.pointerLockElement === canvas;
// Hraje se (myš ve hře, nebo automatický test) a není otevřené okno.
const playing = () => (isLocked() || debug.testMode) && !ui.open && player.alive;

/** Vybere políčko hotbaru 0–8. */
function selectSlot(i) {
  inv.sel = i;
  renderHotbar();
  net.act({ t: 'select', i });
}

/** Q: vyhodí jeden kus z ruky, Ctrl+Q celou hromádku. */
export function dropHeld(all) {
  if (!inv.slots[inv.sel]) return;
  startSwing();
  net.act({ t: 'drop', all: !!all });
}

/** F: prohodí hlavní a druhou ruku. */
export function swapHands() {
  net.act({ t: 'swap' });
  renderHotbar();
}

/** Prostřední tlačítko (pick block): vezme do ruky to, na co míříš (když to máš v inventáři). */
export function pickBlock() {
  const id = pickId(act.target), plan = id && pickPlan(player, id);
  if (!plan) return;
  inv.sel = plan.sel;
  net.act({ t: 'pick', id });
  renderHotbar();
}

let lastW = -1;
addEventListener('keydown', (e) => {
  if (e.target.matches?.('input:not([type=checkbox])')) return; // psaní jména a hesla
  if (e.code === 'KeyE' && !e.repeat) { ui.open ? closeInventory() : (isLocked() || debug.testMode) && openInventory(); return; }
  if (e.code === 'Escape' && ui.open) { closeInventory(); return; }
  if (ui.open && inventoryKey(e)) return;
  const m = e.code.match(/^Digit([1-9])$/);
  if (m) selectSlot(Number(m[1]) - 1);
  if (playing()) {
    if (e.code === 'KeyQ') { e.preventDefault(); dropHeld(e.ctrlKey || e.metaKey); }
    if (e.code === 'KeyF' && !e.repeat) swapHands();
    // Dvakrát rychle W = běh.
    if (e.code === 'KeyW' && !e.repeat) { const now = performance.now(); if (now - lastW < 300) move.sprint = true; lastW = now; }
  }
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); input.lmb = input.rmb = false; move.sprint = false; });
addEventListener('wheel', (e) => { if (!isLocked()) return; selectSlot((inv.sel + Math.sign(e.deltaY) + 9) % 9); }, { passive: true });
canvas.addEventListener('mousedown', (e) => {
  Sound.init();
  if (!isLocked() && !debug.testMode) { if (!ui.open) canvas.requestPointerLock?.()?.catch?.(() => {}); return; }
  if (e.button === 0) input.lmb = true;
  if (e.button === 1) { e.preventDefault(); pickBlock(); }
  if (e.button === 2) { input.rmb = true; act.useCd = 0; }
});
addEventListener('mouseup', (e) => { if (e.button === 0) input.lmb = false; if (e.button === 2) input.rmb = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  $('hint').classList.toggle('hidden', isLocked() || ui.open);
  if (!isLocked()) input.lmb = input.rmb = false;
});
addEventListener('mousemove', (e) => {
  if (!isLocked()) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = clamp(player.pitch - e.movementY * 0.0022, -1.5, 1.5);
});
