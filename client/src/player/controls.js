// ============================================================ ovládání (klávesnice a myš)
import { clamp } from '@louka/shared/math.js';
import { $ } from '../core/dom.js';
import { debug } from '../core/runtime.js';
import { canvas } from '../render/renderer.js';
import { Sound } from '../audio/sound.js';
import { net } from '../net/net.js';
import { inv } from '../inventory/inventory.js';
import { ui } from '../inventory/crafting.js';
import { renderHotbar, openInventory, closeInventory } from '../inventory/inventory-ui.js';
import { player } from './state.js';
import { act } from './interaction.js';

/** Klávesy, které jsou právě stisknuté (např. 'KeyW', 'Space'). */
export const keys = new Set();
/** Tlačítka myši: lmb levé (těžba/útok), rmb pravé (položit/jíst). */
export const input = { lmb: false, rmb: false };

/** Je myš zamčená ve hře? */
export const isLocked = () => document.pointerLockElement === canvas;

/** Vybere políčko hotbaru 0–8. */
function selectSlot(i) {
  inv.sel = i;
  renderHotbar();
  net.act({ t: 'select', i });
}

addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && !e.repeat) { ui.open ? closeInventory() : (isLocked() || debug.testMode) && openInventory(); return; }
  if (e.code === 'Escape' && ui.open) { closeInventory(); return; }
  const m = e.code.match(/^Digit([1-9])$/);
  if (m) selectSlot(Number(m[1]) - 1);
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); input.lmb = input.rmb = false; });
addEventListener('wheel', (e) => { if (!isLocked()) return; selectSlot((inv.sel + Math.sign(e.deltaY) + 9) % 9); }, { passive: true });
canvas.addEventListener('mousedown', (e) => {
  Sound.init();
  if (!isLocked()) { if (!ui.open) canvas.requestPointerLock?.()?.catch?.(() => {}); return; }
  if (e.button === 0) input.lmb = true;
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
