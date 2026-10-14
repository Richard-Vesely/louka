// ============================================================ hra pro jednoho hráče (offline)
// Celá hra (shared/game/game.js) běží přímo v prohlížeči. Stav hry a stav, který kreslí grafika,
// jsou tytéž objekty – takže se nic nemusí kopírovat. Je to i dobrý test herní logiky.
import { Game } from '@louka/shared/game/game.js';

/**
 * Spustí hru offline.
 * @param {object} o
 * @param {import('@louka/shared/game/world.js').WorldState} o.world stav světa
 * @param {Array} o.mobs pole tvorů, ze kterého kreslí grafika
 * @param {import('@louka/shared/game/player.js').PlayerState} o.player hráč u tohoto počítače
 * @param {(ev:object)=>void} o.onEvent zpracování zpráv pro hráče
 */
export function startOffline({ world, mobs, player, onEvent }) {
  // validate: false – sám sebe nepodvedeš, a ladicí příkazy (window.game) můžou všechno.
  const game = new Game({ world, mobs, validate: false });
  game.addPlayer(player);
  game.onEvent = (id, ev) => { if (id === player.id) onEvent(ev); };
  return {
    mode: 'offline',
    game,
    act: (msg) => game.act(player.id, msg),
    tick: (dt, realDt) => game.tick(dt, realDt),
  };
}
