// ============================================================ zranění, smrt, oživení – jak to vypadá
// Kdy hráč dostane zásah nebo umře, rozhoduje hra (shared/game/survival.js). Tady je obraz a zvuk.
import { $ } from '../core/dom.js';
import { Sound } from '../audio/sound.js';
import { hud, toast } from '../ui/hud.js';
import { net } from '../net/net.js';
import { player } from './state.js';

/** Zásah: odhození do strany, otřes kamery, červená obrazovka. */
export function onHurt({ dx, dz }) {
  player.shake = 0.3;
  if (dx || dz) { player.vel.x += dx * 6; player.vel.z += dz * 6; player.vel.y = 3.5; player.onGround = false; }
  hud.vignette = 1;
  Sound.hurt();
}

/** Smrt: obrazovka zčervená ("Padl jsi…"). */
export function onDied() {
  $('fade').style.opacity = 1;
  // Offline: oživení proběhne včas, i když prohlížeč zrovna nekreslí snímky (jako setTimeout v původní hře).
  if (net.mode === 'offline') setTimeout(() => net.tick(0, 0), 2650);
}

/** Oživení u svatyně. */
export function onRespawn({ pos }) {
  player.pos.set(...pos);
  player.vel.set(0, 0, 0);
  player.yaw = 0;
  $('fade').style.opacity = 0;
  toast('Svatyně tě přivedla zpět');
}
