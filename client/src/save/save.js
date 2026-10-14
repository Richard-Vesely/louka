// ============================================================ ukládání
// Každých 10 s a při zavření stránky uloží hru do prohlížeče (localStorage).
import { SAVE_KEY, saveState } from './load.js';
import { blocks, removed, crafted, placedAny, fires } from '../world/state.js';
import { time } from '../world/day.js';
import { inv } from '../inventory/inventory.js';
import { player } from '../player/player.js';

/** Uloží hru (pokud se zrovna nemaže svět tlačítkem "Nový svět"). */
export function saveGame() {
  if (saveState.resetting) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      inv: inv.slots, pos: player.pos.toArray(), yaw: player.yaw, hp: Math.max(player.hp, 1), hunger: player.hunger,
      dayTime: time.dayTime, day: time.dayCount, blocks: [...blocks], removed: [...removed], crafted, placedAny, fires: Object.fromEntries(fires),
    }));
  } catch {}
}
setInterval(saveGame, 10000);
addEventListener('beforeunload', saveGame);
