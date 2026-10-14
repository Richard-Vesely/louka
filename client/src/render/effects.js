// ============================================================ efekty: třísky, jiskry a zvuky
// Hra pošle { t: 'fx', k: druh efektu, x, y, z, ... } a tady se z toho stanou částice a zvuk.
import { terrainH } from '@louka/shared/terrain.js';
import { Sound } from '../audio/sound.js';
import { sparks, debris } from './particles.js';
import { specials } from '../world/blocks.js';
import { flashMob } from '../mobs/mobs.js';

/** Barva třísek podle toho, co se těží. */
export const CHIP = { tree: [0.42, 0.3, 0.17], rock: [0.5, 0.5, 0.48], iron: [0.65, 0.35, 0.15], ground: [0.25, 0.5, 0.12], planks: [0.6, 0.45, 0.28], cobble: [0.5, 0.5, 0.48], bricks: [0.55, 0.52, 0.48] };

/** Přehraje efekt ze zprávy hry. */
export function playFx(ev) {
  const { x, y, z } = ev;
  switch (ev.k) {
    case 'break':
      if (ev.what === 'tree') debris.emit(x, y, z, [0.2, 0.45, 0.12], 60, 5, 2);
      else if (ev.what === 'rock' || ev.what === 'iron') debris.emit(x, y, z, CHIP[ev.what], 40, 4, 2);
      else if (ev.what === 'ground') { debris.emit(x, y, z, CHIP.ground, 18, 2, 2.5); return; }
      else debris.emit(x, y, z, CHIP[ev.what] || CHIP.planks, 25, 3, 1.5);
      Sound.crack();
      break;
    case 'place': Sound.place(); break;
    case 'mobhit':
      sparks.emit(x, y, z, ev.mt === 'crawler' ? [0.7, 0.25, 1.0] : [1, 0.25, 0.2], 18, 3.5, 1.5);
      // Kritický zásah: hvězdičky navíc (jako v Minecraftu).
      if (ev.crit) { sparks.emit(x, y + 0.2, z, [1, 0.95, 0.55], 30, 4.5, 1.2); Sound.crit(); }
      Sound.hit();
      if (ev.mt === 'sheep') Sound.baa();
      if (ev.mt === 'boar') Sound.grunt();
      flashMob(ev.id);
      break;
    case 'mobdie':
      sparks.emit(x, y, z, ev.mt === 'crawler' ? [0.6, 0.2, 1.0] : [0.9, 0.85, 0.75], 50, 5, 2);
      if (ev.mt === 'crawler') Sound.kill();
      break;
    case 'shard':
      sparks.emit(x, terrainH(x, z) + 1.3, z, [0.4, 0.95, 1.0], 80, 5, 3);
      Sound.pickup();
      break;
    case 'cook': {
      const s = specials.get(ev.key);
      if (s) sparks.emit(s.x + 0.5, s.ry + 0.6, s.z + 0.5, [1, 0.6, 0.2], 12, 1.5, 2);
      break;
    }
  }
}
