// ============================================================ přežití: zranění, smrt, hlad
import { SPAWN } from '../constants.js';

/**
 * Zraní hráče. (dx, dz) = směr, kam ho to odhodí (0, 0 = neodhodí).
 * @param {import('./game.js').Game} game
 */
export function damagePlayer(game, p, amount, dx, dz) {
  if (!p.alive) return;
  p.hp -= amount;
  p.lastHurt = game.gameTime;
  game.send(p, { t: 'hurt', dx, dz });
  if (p.hp <= 0) {
    p.alive = false;
    p.hp = 0;
    p.respawnAt = game.now() + 2.6;
    game.send(p, { t: 'died' });
  }
}

/** Hlad pomalu klesá (při běhu rychleji), s plným žaludkem se léčíš, hladem ztrácíš zdraví. */
export function updateSurvival(game, p, dt) {
  p.hunger = Math.max(0, p.hunger - dt * (p.sprinting ? 0.3 : 0.11));
  if (p.hunger < 25 && !p.hungerWarned) { p.hungerWarned = true; game.send(p, { t: 'toast', text: 'Máš hlad – sněz něco (pravé tlačítko)' }); }
  if (p.hunger > 40) p.hungerWarned = false;
  if (p.hunger <= 0 && (p.starveT += dt) > 3) { p.starveT = 0; damagePlayer(game, p, 4, 0, 0); }
  if (p.hunger > 30 && game.gameTime - p.lastHurt > 4) p.hp = Math.min(100, p.hp + dt * 1.5);
}

/** Mrtvý hráč se 2,6 s (skutečného času, jako setTimeout) po smrti objeví u svatyně. */
export function updateRespawn(game, p) {
  if (p.alive || game.now() < p.respawnAt) return;
  p.pos.x = SPAWN[0]; p.pos.y = SPAWN[1]; p.pos.z = SPAWN[2];
  p.yaw = 0;
  p.hp = 100;
  p.hunger = Math.max(p.hunger, 60);
  p.alive = true;
  p.lastMoveT = game.gameTime;
  // Stínožrouti, kteří hráče lovili, zmizí.
  for (const m of [...game.mobs]) if (m.type === 'crawler' && game.nearestPlayer(m.pos.x, m.pos.z)?.p === p) game.removeMob(m);
  game.send(p, { t: 'respawn', pos: [...SPAWN] });
}
