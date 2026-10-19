// Stavby ve světě: kde stojí (ruiny, pevnosti, věže, tábory, kobky…) a kořist v jejich truhlách.
import { hash2 } from '../util.js';
import { VOLC_CELL, biomeAt, isMark, regionOf, shrineDist } from './terrain.js';

// Kořist: [předmět, min, max, šance]
export const LOOT = {
  ruin: [
    ['markorite', 1, 3, 0.55], ['markorite_raw', 2, 4, 0.5], ['shard', 1, 3, 0.6], ['iron', 2, 6, 0.6], ['meat', 2, 5, 0.5],
    ['torch', 4, 12, 0.5], ['essence', 1, 4, 0.4], ['coal', 3, 8, 0.4], ['crystal_pick', 1, 1, 0.14], ['crystal_sword', 1, 1, 0.12],
    ['iron_helmet', 1, 1, 0.15], ['iron_chestplate', 1, 1, 0.15], ['crystal_helmet', 1, 1, 0.08], ['markapple', 1, 1, 0.2], ['markorite_sword', 1, 1, 0.04],
  ],
  camp: [['meat', 2, 5, 0.8], ['torch', 4, 10, 0.7], ['iron', 1, 4, 0.5], ['coal', 3, 8, 0.6], ['stone_pick', 1, 1, 0.3], ['iron_sword', 1, 1, 0.12], ['berries', 3, 8, 0.6], ['wool', 2, 5, 0.4]],
  tower: [['iron', 3, 8, 0.7], ['shard', 1, 2, 0.5], ['iron_helmet', 1, 1, 0.25], ['iron_boots', 1, 1, 0.25], ['crystal_sword', 1, 1, 0.08], ['torch', 6, 12, 0.6], ['meat', 2, 4, 0.5], ['sky_boots', 1, 1, 0.07]],
  dungeon: [
    ['iron', 3, 9, 0.8], ['shard', 2, 4, 0.6], ['markapple', 1, 2, 0.3], ['essence', 2, 5, 0.5], ['crystal_pick', 1, 1, 0.15], ['coal', 4, 10, 0.5],
    ['sky_helmet', 1, 1, 0.12], ['sky_chestplate', 1, 1, 0.1], ['sky_leggings', 1, 1, 0.1], ['sky_boots', 1, 1, 0.12], ['shadow_helmet', 1, 1, 0.1], ['markorite', 1, 3, 0.3],
  ],
  pyramid: [['iron', 2, 6, 0.6], ['shard', 1, 3, 0.5], ['cactus', 2, 5, 0.5], ['glass', 4, 10, 0.5], ['crystal_sword', 1, 1, 0.1], ['markapple', 1, 1, 0.12], ['smooth_sandstone', 8, 16, 0.4], ['sky_helmet', 1, 1, 0.06]],
  temple: [['banana', 3, 8, 0.7], ['iron', 2, 5, 0.6], ['blue_flower', 2, 5, 0.5], ['crystal_pick', 1, 1, 0.1], ['shard', 1, 2, 0.4], ['jungle_planks', 8, 16, 0.4], ['essence', 1, 3, 0.3]],
  igloo: [['snowball', 4, 12, 0.7], ['meat', 2, 5, 0.7], ['iron', 1, 3, 0.5], ['torch', 4, 8, 0.6], ['iron_boots', 1, 1, 0.2], ['coal', 3, 8, 0.5]],
  pavilion: [['cherries', 3, 8, 0.8], ['red_flower', 2, 6, 0.6], ['lantern', 1, 2, 0.4], ['cherry_planks', 8, 16, 0.5], ['iron', 1, 3, 0.4], ['shard', 1, 1, 0.25]],
  hut: [['wheat_seeds', 3, 8, 0.6], ['meat', 2, 4, 0.6], ['acacia_planks', 6, 12, 0.5], ['stone_pick', 1, 1, 0.3], ['yellow_flower', 2, 5, 0.5], ['iron', 1, 3, 0.4]],
  mushhouse: [['glowshroom', 3, 6, 0.7], ['mushroom', 4, 10, 0.8], ['mushroom_block', 4, 8, 0.5], ['essence', 1, 3, 0.4], ['shard', 1, 2, 0.4], ['markapple', 1, 1, 0.1]],
  altar: [['obsidian', 2, 6, 0.6], ['crystal_chestplate', 1, 1, 0.2], ['crystal_sword', 1, 1, 0.2], ['shard', 2, 5, 0.7], ['markorite', 1, 2, 0.3], ['iron', 4, 10, 0.6], ['basalt', 8, 16, 0.4]],
  fortress: [
    ['markorite', 2, 5, 0.8], ['markapple', 1, 3, 0.6], ['iron', 4, 10, 0.7], ['markorite_helmet', 1, 1, 0.12], ['markorite_boots', 1, 1, 0.12],
    ['markorite_sword', 1, 1, 0.1], ['sky_chestplate', 1, 1, 0.1], ['shard', 2, 5, 0.6], ['crystal_chestplate', 1, 1, 0.12],
  ],
};
export function rollLoot(rnd, table) {
  const slots = Array(27).fill(null);
  for (const [id, a, b, chance] of table) {
    if (rnd() >= chance) continue;
    let i;
    do i = Math.floor(rnd() * 27); while (slots[i]);
    slots[i] = { id, n: a + Math.floor(rnd() * (b - a + 1)) };
  }
  if (!slots.some(Boolean)) slots[13] = { id: table[0][0], n: 1 };
  return slots;
}

// Druhy staveb: velikost buňky mřížky, šance, dimenze (true = Markova, false = domov, null = obě).
export const STRUCTS = {
  ruin: { cell: 70, chance: 0.5, mark: true, salt: [333, 77], icon: '▣', name: 'Ruiny' },
  fortress: { cell: 240, chance: 0.65, mark: true, salt: [911, 19], icon: '⛫', name: 'Markomanská pevnost' },
  tower: { cell: 190, chance: 0.55, mark: false, salt: [515, 41], icon: '♜', name: 'Strážní věž' },
  camp: { cell: 150, chance: 0.5, mark: false, salt: [717, 63], icon: '⛺', name: 'Opuštěný tábor' },
  dungeon: { cell: 170, chance: 0.6, mark: null, salt: [123, 88], icon: '☠', name: 'Kobka' },
  // Zajímavá místa v biomech (stavba stojí jen tam, kde je její biom)
  pyramid: { cell: 260, chance: 0.7, mark: false, salt: [402, 51], icon: '▲', name: 'Pouštní pyramida', biome: 'desert' },
  temple: { cell: 240, chance: 0.7, mark: false, salt: [608, 13], icon: '♣', name: 'Chrám v džungli', biome: 'jungle' },
  igloo: { cell: 200, chance: 0.7, mark: false, salt: [244, 97], icon: '◓', name: 'Iglú', biome: 'tundra' },
  pavilion: { cell: 220, chance: 0.7, mark: false, salt: [831, 29], icon: '✿', name: 'Třešňový altán', biome: 'cherry' },
  hut: { cell: 220, chance: 0.7, mark: false, salt: [157, 64], icon: '⌂', name: 'Chatrč na savaně', biome: 'savanna' },
  mushhouse: { cell: 200, chance: 0.75, mark: false, salt: [933, 71], icon: '♠', name: 'Houbový domek', biome: 'mushroom' },
  altar: { cell: VOLC_CELL, chance: 1, mark: false, salt: [0, 0], icon: '◆', name: 'Obsidiánový oltář', biome: 'volcanic' },
};
function structAt(type, cx, cz) {
  const S = STRUCTS[type];
  if (type === 'altar') { // oltář stojí na úbočí sopky
    const v = regionOf((cx + 0.5) * VOLC_CELL, (cz + 0.5) * VOLC_CELL, VOLC_CELL, 71, 0.5);
    return v ? { type, key: `altar${cx},${cz}`, x: Math.floor(v.x + 38), z: Math.floor(v.z) } : null;
  }
  if (hash2(cx + S.salt[0], cz - S.salt[1]) > S.chance) return null;
  const x = Math.floor((cx + 0.3 + hash2(cx, cz + 5) * 0.4) * S.cell), z = Math.floor((cz + 0.3 + hash2(cx + 5, cz) * 0.4) * S.cell);
  if ((S.mark !== null && isMark(x) !== S.mark) || shrineDist(x, z) < 45) return null;
  if (S.biome && biomeAt(x, z) !== S.biome) return null;
  return { type, key: type === 'ruin' ? `ru${cx},${cz}` : `${type}${cx},${cz}`, x, z };
}
export function structuresNear(px, pz, R) {
  const out = [];
  for (const type of Object.keys(STRUCTS)) {
    const C = STRUCTS[type].cell;
    for (let cz = Math.floor((pz - R) / C); cz <= Math.floor((pz + R) / C); cz++)
      for (let cx = Math.floor((px - R) / C); cx <= Math.floor((px + R) / C); cx++) {
        const s = structAt(type, cx, cz);
        if (s && (s.x - px) ** 2 + (s.z - pz) ** 2 < R * R) out.push(s);
      }
  }
  return out;
}
export const ruinsNear = structuresNear;
