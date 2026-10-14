// ============================================================ inventář (pohled prohlížeče)
// 36 políček: 0–8 je hotbar (dole na obrazovce), 9–35 batoh. Logika je v shared/game/inventory.js.
import * as shared from '@louka/shared/game/inventory.js';
import { onEvent } from '../net/events.js';
import { player } from '../player/state.js';

/**
 * slots – políčka ({ id, n } nebo null), sel – vybrané políčko hotbaru,
 * cursor – předmět, který držíš myší v otevřeném inventáři.
 */
export const inv = player.inv;

/** Kolik kusů předmětu `id` máš v inventáři. */
export const countItem = (id) => shared.countItem(player, id);

/** Co držíš v ruce (vybrané políčko hotbaru). */
export const heldStack = () => inv.slots[inv.sel];

/**
 * Přidá předměty do inventáře (pro ladění a testy: window.game.addItem).
 * Online to platí jen do další zprávy ze serveru.
 */
export function addItem(id, n, silent = false) {
  const left = shared.addItem(player, id, n, onEvent, silent);
  onEvent({ t: 'inv' });
  return left;
}
