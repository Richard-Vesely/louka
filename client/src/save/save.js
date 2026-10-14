// ============================================================ ukládání (hra pro jednoho hráče)
// Každých 10 s a při zavření stránky uloží hru do prohlížeče (localStorage).
// Formát je stejný jako v původní hře, takže staré uložené hry fungují.
import { worldToSave } from '@louka/shared/game/world.js';
import { playerToSave } from '@louka/shared/game/player.js';
import { SAVE_KEY, saveState } from './load.js';
import { world } from '../world/state.js';
import { player } from '../player/state.js';
import { net } from '../net/net.js';

/** Uloží hru (offline; pokud se zrovna nemaže svět tlačítkem "Nový svět"). */
export function saveGame() {
  if (saveState.resetting || net.mode !== 'offline') return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...playerToSave(player), ...worldToSave(world) }));
  } catch {}
}
setInterval(saveGame, 10000);
addEventListener('beforeunload', saveGame);
