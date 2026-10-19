// Stavby: postavení ve světě, spawnery.
import '../mobs/mobs.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { NET, SyncSet } from '../game/boot.js';
import { save } from '../game/save-load.js';
import { mobs, spawnMob } from '../mobs/mobs.js';
import { player } from '../player/player.js';
import { bkey, rebuildBlocks, solidAt } from '../render/blocks.js';
import { sparks } from '../render/particles.js';
import { chests } from '../ui/inventory-ui.js';
import { setVox } from './dig.js';
import { blockMeta, blocks } from './world-state.js';
import { hash2, randInt, rng } from '../../../shared/util.js';
import { LOOT, rollLoot, structuresNear } from '../../../shared/world/structures.js';
import { isMark } from '../../../shared/world/terrain.js';
import { V, solidVox, surfY, topY } from '../../../shared/world/voxels.js';

// ============================================================ stavby: ruiny, pevnosti, věže, tábory a podzemní kobky
export const ruinsBuilt = new Set(save?.ruins || []);         // už postavené stavby (všechny druhy)
export const ruinsOpened = new SyncSet('ruinsOpened', save?.ruinsOpened || []);  // prozkoumané stavby (otevřená truhla)
export const spawners = new Map(Object.entries(save?.spawners || {})); // klíč bloku spawneru -> druh tvora
export const solidAny = (x, y, z) => solidAt(x, y, z) || solidVox(x, y, z);
const put = (x, y, z, type) => blocks.set(bkey(x, y, z), type);
function putChest(x, y, z, table, rnd) { const k = bkey(x, y, z); blocks.set(k, 'chest'); chests.set(k, rollLoot(rnd, LOOT[table])); }
function putSpawner(x, y, z, mob) { const k = bkey(x, y, z); blocks.set(k, 'spawner'); spawners.set(k, mob); }

const putM = (x, y, z, type, meta) => { put(x, y, z, type); blockMeta.set(bkey(x, y, z), meta); }; // blok s otočením / horní půlblok
export const BUILDERS = {
  // Pouštní pyramida: stupňovitá, dutá, vchod z jihu, uvnitř truhla a pochodně
  pyramid(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let L = 0; L < 6; L++) {
      const half = 6 - L;
      for (let dx = -half; dx <= half; dx++) for (let dz = -half; dz <= half; dz++) {
        const edge = Math.abs(dx) === half || Math.abs(dz) === half;
        if (!edge && L < 4) { if (L === 0) put(r.x + dx, b, r.z + dz, 'smooth_sandstone'); continue; }
        if (dz === half && dx === 0 && L <= 1) continue; // vchod
        put(r.x + dx, b + L, r.z + dz, L % 2 ? 'smooth_sandstone' : 'sandstone');
      }
    }
    putChest(r.x, b + 1, r.z - 2, 'pyramid', rnd);
    put(r.x - 3, b + 1, r.z, 'torch');
    put(r.x + 3, b + 1, r.z, 'torch');
  },
  // Chrám v džungli: kamenný s prkny, střecha z půlbloků
  temple(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      put(r.x + dx, b, r.z + dz, 'cobble');
      const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3;
      for (let y = 1; y <= 3; y++) if (edge && !(dz === 3 && dx === 0 && y <= 2)) put(r.x + dx, b + y, r.z + dz, (dx + dz + y) % 3 ? 'cobble' : 'jungle_planks');
      putM(r.x + dx, b + 4, r.z + dz, 'jungle_planks_slab', 0);
    }
    for (const dx of [-2, 2]) putM(r.x + dx, b + 1, r.z + 4, 'cobble_stairs', 2);
    putChest(r.x, b + 1, r.z - 2, 'temple', rnd);
    put(r.x - 2, b + 1, r.z - 2, 'torch');
  },
  // Iglú ze sněhových bloků s táborákem a truhlou
  igloo(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = 0; dy <= 4; dy++) {
      const d = Math.hypot(dx, dy * 1.15, dz);
      if (d > 3.3 && d <= 4.2 && !(dz >= 3 && Math.abs(dx) <= 0 && dy <= 1)) put(r.x + dx, b + dy, r.z + dz, 'snow_block');
    }
    put(r.x, b, r.z, 'campfire');
    putChest(r.x - 2, b, r.z - 1, 'igloo', rnd);
  },
  // Třešňový altán: podlaha, trámové sloupy, střecha z třešňových půlbloků, lucerna
  pavilion(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      put(r.x + dx, b, r.z + dz, 'cherry_planks');
      putM(r.x + dx, b + 4, r.z + dz, 'cherry_planks_slab', 0);
    }
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) for (let y = 1; y <= 3; y++) put(r.x + dx, b + y, r.z + dz, 'log_block');
    for (let d = -3; d <= 3; d++) for (const [x, z, rot] of [[d, -3, 0], [d, 3, 2], [-3, d, 1], [3, d, 3]]) putM(r.x + x, b + 4, r.z + z, 'cherry_planks_stairs', rot);
    put(r.x, b + 1, r.z, 'lantern');
    putChest(r.x + 1, b + 1, r.z - 1, 'pavilion', rnd);
  },
  // Chatrč na savaně z akáciových prken, venku ohniště
  hut(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      for (let y = 1; y <= 2; y++) if (edge && !(dz === 2 && dx === 0)) put(r.x + dx, b + y, r.z + dz, 'acacia_planks');
      putM(r.x + dx, b + 3, r.z + dz, 'acacia_planks_slab', 0);
    }
    putChest(r.x - 1, b + 1, r.z - 1, 'hut', rnd);
    put(r.x, b + 1, r.z + 5, 'campfire');
  },
  // Houbový domek: dutý třeň s dveřmi, nad ním klobouk, uvnitř svítivé houby
  mushhouse(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let y = 1; y <= 4; y++) {
      if (dx === 0 && dz === 0) continue;
      if (dz === 1 && dx === 0 && y <= 2) continue; // dveře
      put(r.x + dx, b + y, r.z + dz, 'mushroom_stem');
    }
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      const d = Math.hypot(dx, dz);
      if (d <= 4.3) put(r.x + dx, b + 5, r.z + dz, 'mushroom_block');
      if (d > 3.2 && d <= 4.3) put(r.x + dx, b + 4, r.z + dz, 'mushroom_block');
    }
    put(r.x, b + 1, r.z, 'glowshroom');
    putChest(r.x + 3, b + 1, r.z + 3, 'mushhouse', rnd);
  },
  // Obsidiánový oltář na úbočí sopky
  altar(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      put(r.x + dx, b, r.z + dz, Math.abs(dx) === 2 || Math.abs(dz) === 2 ? 'polished_basalt' : 'obsidian');
      for (let y = 1; y <= 2; y++) if (Math.abs(dx) === 2 && Math.abs(dz) === 2) put(r.x + dx, b + y, r.z + dz, 'obsidian');
    }
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) put(r.x + dx, b + 3, r.z + dz, 'lantern');
    putChest(r.x, b + 1, r.z, 'altar', rnd);
  },
  // Zbořené zdi z markwood prken a cihel, uprostřed truhla; hlídají Markomani.
  ruin(r, rnd) {
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      if ((Math.abs(dx) !== 3 && Math.abs(dz) !== 3) || (dz === 3 && Math.abs(dx) <= 1)) continue;
      const base = surfY(r.x + dx, r.z + dz), h = 1 + Math.floor(rnd() * 3);
      for (let y = 0; y < h; y++) put(r.x + dx, base + y, r.z + dz, rnd() < 0.55 ? 'mark_planks' : 'bricks');
    }
    putChest(r.x, surfY(r.x, r.z), r.z, 'ruin', rnd);
    put(r.x + 2, surfY(r.x + 2, r.z + 2), r.z + 2, 'torch');
    for (let i = 0; i < 2; i++) spawnMob('markoman', r.x + 6 + i * 2, r.z + 6);
  },
  // Markomanská pevnost: hradby 13×13 s věžemi, brána na jihu, uvnitř spawner Markomanů a bohatá truhla.
  fortress(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
      const edge = Math.abs(dx) === 6 || Math.abs(dz) === 6, corner = Math.abs(dx) >= 5 && Math.abs(dz) >= 5;
      if (!edge && !corner) { if (Math.abs(dx) <= 4 && Math.abs(dz) <= 4) put(r.x + dx, b, r.z + dz, 'bricks'); continue; }
      const h = corner ? 7 : 4 + ((dx + dz) % 2 === 0 ? 1 : 0);
      for (let y = 0; y < h; y++) {
        if (dz === 6 && Math.abs(dx) <= 1 && y <= 2) continue; // brána
        put(r.x + dx, b + y, r.z + dz, y < 2 ? 'bricks' : 'mark_planks');
      }
    }
    putSpawner(r.x, b + 1, r.z - 2, 'markoman');
    putChest(r.x, b + 1, r.z - 4, 'fortress', rnd);
    putChest(r.x + 3, b + 1, r.z - 4, 'ruin', rnd);
    for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) put(r.x + dx, b + 1, r.z + dz, 'torch');
    for (let i = 0; i < 3; i++) spawnMob('markoman', r.x - 2 + i * 2, r.z + 9);
  },
  // Strážní věž: dutá cihlová věž 5×5, uvnitř schody do kruhu, nahoře plošina s truhlou.
  tower(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) !== 2 && Math.abs(dz) !== 2) continue;
      for (let y = 0; y <= 10; y++) {
        if (dz === 2 && dx === 0 && y <= 1) continue; // dveře
        if (y >= 10 && (dx + dz) % 2 !== 0) continue; // cimbuří
        if (y === 6 && dx === 0 && rnd() < 0.7) continue; // okna
        put(r.x + dx, b + y, r.z + dz, 'bricks');
      }
    }
    const ring = [[1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]];
    for (let k = 0; k < 9; k++) { const [dx, dz] = ring[k % 8]; put(r.x + dx, b + k, r.z + dz, 'planks'); }
    for (const [dx, dz] of ring.concat([[0, 0]])) {
      if ((dx === 1 && dz === 1) || (dx === 0 && dz === 1)) continue; // průlez nad schody
      put(r.x + dx, b + 9, r.z + dz, 'planks');
    }
    putChest(r.x - 1, b + 10, r.z - 1, 'tower', rnd);
    put(r.x + 1, b + 10, r.z - 1, 'torch');
  },
  // Opuštěný tábor: stan, táborák a truhla se zásobami.
  camp(r, rnd) {
    for (let dz = -1; dz <= 1; dz++) {
      put(r.x - 4, surfY(r.x - 4, r.z + dz), r.z + dz, 'planks');
      put(r.x - 2, surfY(r.x - 2, r.z + dz), r.z + dz, 'planks');
      put(r.x - 3, surfY(r.x - 3, r.z + dz) + 1, r.z + dz, 'planks');
    }
    put(r.x, surfY(r.x, r.z), r.z, 'campfire');
    putChest(r.x + 2, surfY(r.x + 2, r.z - 2), r.z - 2, 'camp', rnd);
    put(r.x + 2, surfY(r.x + 2, r.z + 2), r.z + 2, 'torch');
  },
  // Kobka: místnost 9×9 hluboko pod zemí, schody od povrchu, spawner a dvě truhly. Vchod značí cihlový oblouk.
  dungeon(r, rnd) {
    const top = topY(r.x, r.z), fy = top - 14, mark = isMark(r.x);
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) for (let dy = -1; dy <= 4; dy++) {
      const x = r.x + dx, y = fy + dy, z = r.z + dz;
      setVox(x, y, z, V.AIR);
      const wall = Math.abs(dx) === 5 || Math.abs(dz) === 5 || dy === -1 || dy === 4;
      if (wall && !(dz === 5 && dx === 0 && dy >= 0 && dy <= 2)) put(x, y, z, dy === -1 ? 'cobble' : rnd() < 0.8 ? 'bricks' : 'cobble');
    }
    putSpawner(r.x, fy, r.z, mark ? 'markoman' : 'crawler');
    putChest(r.x - 3, fy, r.z - 3, 'dungeon', rnd);
    putChest(r.x + 3, fy, r.z - 3, 'dungeon', rnd);
    for (const [dx, dz] of [[-4, 4], [4, 4], [-4, -4], [4, -4]]) put(r.x + dx, fy, r.z + dz, 'torch');
    // Schody nahoru (každý schod o 1 blok, tunel 3 bloky vysoký)
    let i = 0;
    for (; i < 40; i++) {
      const z = r.z + 6 + i, y = fy + i;
      for (let k = 0; k < 3; k++) setVox(r.x, y + k, z, V.AIR);
      if (y > topY(r.x, z)) break;
    }
    // Oblouk nad vstupem
    const az = r.z + 6 + i, ab = topY(r.x, az);
    for (let y = 0; y < 3; y++) { put(r.x - 1, ab + 1 + y, az, 'bricks'); put(r.x + 1, ab + 1 + y, az, 'bricks'); }
    for (let dx = -1; dx <= 1; dx++) put(r.x + dx, ab + 4, az, 'bricks');
    put(r.x - 1, ab + 4, az + 1, 'torch');
  },
};
export function buildStructure(r) {
  NET.op(['r', { ...r }]);
  NET.quiet(() => {
    ruinsBuilt.add(r.key);
    const rnd = rng(1 + Math.floor(hash2(r.x, r.z) * 1e9));
    BUILDERS[r.type](r, rnd);
  });
  rebuildBlocks();
}
let ruinT = 0;
export function updateRuins(dt) {
  if ((ruinT -= dt) > 0) return;
  ruinT = 1;
  for (const r of structuresNear(player.pos.x, player.pos.z, 110)) if (!ruinsBuilt.has(r.key)) buildStructure(r);
}

// Spawnery: když je hráč do 24 m, občas zrodí tvora vedle sebe (max. 4 v okolí).
let spawnerT = 0;
export function updateSpawners(dt) {
  if ((spawnerT -= dt) > 0) return;
  spawnerT = 1;
  for (const [k, type] of spawners) {
    if (blocks.get(k) !== 'spawner') { spawners.delete(k); continue; }
    const [x, y, z] = k.split(',').map(Number);
    if (NET.nearestDist(x + 0.5, y, z + 0.5) > 24 || Math.random() > 0.3) continue;
    if (mobs.filter((m) => !m.dead && m.type === type && Math.hypot(m.pos.x - x, m.pos.z - z) < 10).length >= 4) continue;
    for (let tries = 0; tries < 8; tries++) {
      const sx = x + randInt(-2, 2), sz = z + randInt(-2, 2);
      if ((sx === x && sz === z) || solidAny(sx, y, sz) || solidAny(sx, y + 1, sz)) continue;
      if (!solidAny(sx, y - 1, sz) && y - 1 !== topY(sx, sz)) continue;
      spawnMob(type, sx + 0.5, sz + 0.5, y);
      sparks.emit(sx + 0.5, y + 0.8, sz + 0.5, [0.8, 0.3, 1], 25, 2, 1);
      break;
    }
  }
}
