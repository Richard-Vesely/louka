// Start hry: počká na volbu v hlavním menu a nastaví síťovou vrstvu NET (shared/net/net.js).
import { NET } from '../../../shared/net/net.js';
import { playerSafe } from '../mobs/mobs.js';
import { creative, player } from '../player/player.js';
import { fullSet } from '../ui/inventory-ui.js';

// ============================================================ spuštění: hra pro jednoho / hostitel / klient
window.gameModuleLoaded = true;
export const BOOT = await window.bootPromise; // čeká na volbu v hlavním menu
export const MP = BOOT.mode !== 'sp';
// Síťová vrstva (shared/net/net.js) podle volby v menu; spojení samotné je v client/src/net/.
Object.assign(NET, {
  mode: BOOT.mode, host: BOOT.mode === 'host', client: BOOT.mode === 'client', name: BOOT.welcome?.name || BOOT.name || 'Hráč',
  perm: BOOT.mode !== 'client' || !!BOOT.welcome?.perm, // smí hráč používat kreativní režim?
  uidPrefix: BOOT.mode === 'client' ? BOOT.peer?.id || BOOT.welcome?.pid || 'c' : 'h',
  // Cíle tvorů: hráči (ve hře pro jednoho jen ty). Síťová vrstva přidá vzdálené hráče.
  targets() { return [{ pos: player.pos, alive: player.alive, creative, set: fullSet(), safe: playerSafe(), pid: null }]; },
  spawnCenter() { return player.pos; },
  nearestDist(x, y, z) { return Math.hypot(x - player.pos.x, y - player.pos.y, z - player.pos.z); },
});
