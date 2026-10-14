// ============================================================ přežití: zranění, smrt, hlad
import { SPAWN } from '@louka/shared/constants.js';
import { $ } from '../core/dom.js';
import { clock } from '../core/runtime.js';
import { Sound } from '../audio/sound.js';
import { mobs, removeMob } from '../mobs/mobs.js';
import { hud, toast } from '../ui/hud.js';
import { player } from './player.js';

/**
 * Zraní hráče. (dx, dz) = směr, kam ho to odhodí.
 * @param {number} amount kolik životů ubrat
 */
export function damagePlayer(amount, dx, dz) {
  if (!player.alive) return;
  player.hp -= amount;
  player.lastHurt = clock.gameTime;
  player.shake = 0.3;
  if (dx || dz) { player.vel.x += dx * 6; player.vel.z += dz * 6; player.vel.y = 3.5; player.onGround = false; }
  hud.vignette = 1;
  Sound.hurt();
  if (player.hp <= 0) die();
}

// Smrt: obrazovka zčervená a za chvíli se hráč objeví u svatyně.
function die() {
  player.alive = false;
  player.hp = 0;
  $('fade').style.opacity = 1;
  setTimeout(() => {
    player.pos.set(...SPAWN);
    player.vel.set(0, 0, 0);
    player.yaw = 0;
    player.hp = 100;
    player.hunger = Math.max(player.hunger, 60);
    player.alive = true;
    for (const m of [...mobs]) if (m.type === 'crawler') removeMob(m);
    $('fade').style.opacity = 0;
    toast('Svatyně tě přivedla zpět');
  }, 2600);
}

let starveT = 0, hungerWarned = false;
/** Hlad pomalu klesá (při běhu rychleji), s plným žaludkem se léčíš, hladem ztrácíš zdraví. */
export function updateSurvival(dt) {
  player.hunger = Math.max(0, player.hunger - dt * (player.sprinting ? 0.3 : 0.11));
  if (player.hunger < 25 && !hungerWarned) { hungerWarned = true; toast('Máš hlad – sněz něco (pravé tlačítko)'); }
  if (player.hunger > 40) hungerWarned = false;
  if (player.hunger <= 0 && (starveT += dt) > 3) { starveT = 0; damagePlayer(4, 0, 0); }
  if (player.hunger > 30 && clock.gameTime - player.lastHurt > 4) player.hp = Math.min(100, player.hp + dt * 1.5);
}
