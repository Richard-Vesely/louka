// Textury a materiály: data podzemních dlaždic (barva, reliéf, drsnost, kov, svícení) a nové futuristické bloky.
// Generátory textur jsou čisté funkce (bez DOM), takže běží i v Node.js.
import assert from 'node:assert/strict';
import test from 'node:test';
import { BLOCKS, ITEMS, RECIPES } from '../../shared/data/index.js';
import { V, VOX } from '../../shared/world/voxels.js';
import { cavity, heightToNormal, noiseField, worley } from '../../client/src/render/texgen.js';
import { VOX_TILE_NAMES, buildVoxTextures } from '../../client/src/render/vox-tex.js';

const T = 32;
const vt = buildVoxTextures(T);
const P = T * T;
const tileOf = (name) => VOX_TILE_NAMES.indexOf(name);
const px = (arr, tile, i) => arr.subarray((tile * P + i) * 4, (tile * P + i) * 4 + 4);

test('every underground block type has its own texture layer', () => {
  assert.equal(vt.D, VOX_TILE_NAMES.length);
  for (const d of Object.values(VOX)) assert.ok(d.tile >= 0 && d.tile < vt.D, `tile ${d.tile}`);
  assert.equal(VOX_TILE_NAMES[VOX[V.STONE].tile], 'stone');
  assert.equal(VOX_TILE_NAMES[VOX[V.CRYSTAL].tile], 'crystal');
  assert.equal(VOX_TILE_NAMES[VOX[V.MARKORITE].tile], 'markorite');
  for (const a of [vt.alb, vt.orm, vt.nrm]) assert.equal(a.length, P * vt.D * 4);
});

test('ores sit on the same stone as plain stone (no darker stone around the ore)', () => {
  const stone = tileOf('stone');
  for (const ore of ['coal', 'iron', 'crystal', 'copper', 'gold', 'quartz', 'markorite']) {
    const t = tileOf(ore);
    let same = 0;
    for (let i = 0; i < P; i++) if (px(vt.alb, t, i).every((v, k) => v === px(vt.alb, stone, i)[k])) same++;
    assert.ok(same > P * 0.4, `${ore}: ${same}/${P} stone pixels`);
    assert.ok(same < P, `${ore} has some ore`);
  }
});

test('only crystal and markorite glow, and only in their shards', () => {
  const glowing = (name) => { let n = 0; const t = tileOf(name); for (let i = 0; i < P; i++) if (px(vt.orm, t, i)[3] > 0) n++; return n; };
  for (const name of ['stone', 'dirt', 'coal', 'iron', 'gold', 'copper', 'granite', 'obsidian']) assert.equal(glowing(name), 0, name);
  for (const name of ['crystal', 'markorite']) {
    const n = glowing(name);
    assert.ok(n > 0 && n < P * 0.6, `${name}: ${n}/${P}`);
    // svítí jen pixely, které nejsou kámen
    const t = tileOf(name), s = tileOf('stone');
    for (let i = 0; i < P; i++) if (px(vt.orm, t, i)[3] > 0) assert.notDeepEqual([...px(vt.alb, t, i)], [...px(vt.alb, s, i)]);
  }
});

test('gold nuggets are metal, stone is rough and not metal', () => {
  let metal = 0;
  for (let i = 0; i < P; i++) if (px(vt.orm, tileOf('gold'), i)[2] === 255) metal++;
  assert.ok(metal > 0);
  for (let i = 0; i < P; i++) {
    const o = px(vt.orm, tileOf('stone'), i);
    assert.equal(o[2], 0);
    assert.ok(o[1] > 0.7 * 255, `stone roughness ${o[1]}`);
  }
});

test('texture helpers: tileable noise, cells, flat height = flat normal, cavity darkens pits', () => {
  const n = noiseField(16, 3, [4, 8], 0);
  assert.ok(n.every((v) => v >= 0 && v <= 1));
  const w = worley(16, 4, 5);
  assert.ok(w.f1.every((v, i) => v <= w.f2[i]));
  const flat = heightToNormal(new Float32Array(64).fill(0.5), 8, 8);
  for (let i = 0; i < 64; i++) assert.deepEqual([...flat.subarray(i * 4, i * 4 + 3)], [127, 127, 255]);
  const h = new Float32Array(64).fill(0.8);
  h[27] = 0;
  const c = cavity(h, 8, 8, 1, 4);
  assert.ok(c[27] < 1 && c[0] === 1);
});

test('futuristic blocks: panels and neons with recipes, neons glow in the fixed colours', () => {
  const PALETTE = [0x38e8ff, 0xffb066, 0xd04bff];
  for (const id of ['tech_panel', 'white_panel', 'neon_cyan', 'neon_amber', 'neon_magenta']) {
    assert.ok(BLOCKS[id] && ITEMS[id]?.block === id, id);
    assert.ok(RECIPES.some((r) => r.out === id), `${id} recipe`);
  }
  for (const id of ['neon_cyan', 'neon_amber', 'neon_magenta']) {
    assert.ok(BLOCKS[id].light > 0);
    assert.ok(PALETTE.includes(BLOCKS[id].lightColor), id);
  }
});
