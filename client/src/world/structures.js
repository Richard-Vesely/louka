// Stavby kolem hráče: když se přiblížíš, postaví se (a ostatním se pošle zpráva 'r').
import '../mobs/mobs.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { ruinsBuilt } from '../../../shared/world/state.js';
import { buildStructure, structuresNear } from '../../../shared/world/structures.js';
import { player } from '../player/player.js';

// ============================================================ stavby: ruiny, pevnosti, věže, tábory a podzemní kobky
// (stavby a jejich stavitelé: shared/world/structures.js; tady se stavějí ty kolem hráče u obrazovky)
let ruinT = 0;
export function updateRuins(dt) {
  if ((ruinT -= dt) > 0) return;
  ruinT = 1;
  for (const r of structuresNear(player.pos.x, player.pos.z, 110)) if (!ruinsBuilt.has(r.key)) buildStructure(r);
}

// (spawnery: updateSpawners v shared/sim/mobs.js)
