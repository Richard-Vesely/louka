// ============================================================ recepty
// Recepty jako v Minecraftu: tvar v mřížce výroby. Písmena odkazují na předměty v `key`, mezera = prázdné políčko.
// Recepty do 2×2 jdou vyrobit přímo v inventáři, větší potřebují pracovní stůl (mřížka 3×3).
// Nový recept = nový řádek v RECIPES.

export const RECIPES = [
  { out: 'planks', n: 4, shape: ['L'], key: { L: 'log' } },
  { out: 'stick', n: 4, shape: ['P', 'P'], key: { P: 'planks' } },
  { out: 'workbench', n: 1, shape: ['PP', 'PP'], key: { P: 'planks' } },
  { out: 'torch', n: 4, shape: ['F', 'S'], key: { F: 'fiber', S: 'stick' } },
  { out: 'bricks', n: 4, shape: ['CC', 'CC'], key: { C: 'stone' } },
  { out: 'campfire', n: 1, shape: [' S ', 'SLS', 'CCC'], key: { S: 'stick', L: 'log', C: 'stone' } },
];

// Nástroje: krumpáč, sekera a meč z každého materiálu.
for (const [tier, mat] of [['wood', 'planks'], ['stone', 'stone'], ['iron', 'iron']]) {
  const key = { M: mat, S: 'stick' };
  RECIPES.push(
    { out: `${tier}_pick`, n: 1, shape: ['MMM', ' S ', ' S '], key },
    { out: `${tier}_axe`, n: 1, shape: ['MM', 'MS', ' S'], key },
    { out: `${tier}_sword`, n: 1, shape: ['M', 'M', 'S'], key },
  );
}
RECIPES.push({ out: 'crystal_sword', n: 1, shape: [' H ', 'EHE', ' I '], key: { H: 'shard', E: 'essence', I: 'iron' } });

// Předpočítá mřížku receptu (pat), šířku (w) a výšku (h).
for (const r of RECIPES) {
  const w = Math.max(...r.shape.map((l) => l.length));
  r.pat = r.shape.map((l) => [...l.padEnd(w)].map((ch) => (ch === ' ' ? null : r.key[ch])));
  r.w = w;
  r.h = r.shape.length;
}

/** Kolik kusů které suroviny recept potřebuje, např. { planks: 3, stick: 2 }. */
export function recipeNeeds(r) {
  const need = {};
  for (const row of r.pat) for (const id of row) if (id) need[id] = (need[id] || 0) + 1;
  return need;
}

/**
 * Najde recept podle toho, co leží v mřížce (tvar se porovnává oříznutý a i zrcadlově).
 * @param {Array<{id:string,n:number}|null>} grid políčka mřížky po řádcích
 * @param {number} size 2 nebo 3
 */
export function findRecipe(grid, size) {
  let x0 = size, y0 = size, x1 = -1, y1 = -1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (grid[y * size + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const at = (x, y) => grid[(y0 + y) * size + x0 + x]?.id ?? null;
  for (const r of RECIPES) {
    if (r.w !== w || r.h !== h) continue;
    let same = true, mirror = true;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (r.pat[y][x] !== at(x, y)) same = false;
      if (r.pat[y][w - 1 - x] !== at(x, y)) mirror = false;
    }
    if (same || mirror) return r;
  }
  return null;
}
