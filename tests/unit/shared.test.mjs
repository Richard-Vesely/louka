// Unit tests for shared/ (data tables, recipe matching, terrain, world generation).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '@louka/shared/items.js';
import { BLOCKS } from '@louka/shared/blocks.js';
import { RECIPES, findRecipe, recipeNeeds } from '@louka/shared/recipes.js';
import { COOKING } from '@louka/shared/cooking.js';
import { MOBS } from '@louka/shared/mobs.js';
import { groundHeight, terrainH } from '@louka/shared/terrain.js';
import { treeAt, rockAt, shardAt } from '@louka/shared/worldgen.js';

const grid = (size, cells) => { const g = Array(size * size).fill(null); for (const [i, id] of cells) g[i] = { id, n: 1 }; return g; };

test('every recipe, block drop, cooking result and mob drop is a known item', () => {
  for (const r of RECIPES) {
    assert.ok(ITEMS[r.out], `recipe output ${r.out}`);
    for (const id of Object.keys(recipeNeeds(r))) assert.ok(ITEMS[id], `ingredient ${id} of ${r.out}`);
  }
  for (const [id, b] of Object.entries(BLOCKS)) assert.ok(ITEMS[b.drop], `drop of block ${id}`);
  for (const [from, to] of Object.entries(COOKING)) assert.ok(ITEMS[from] && ITEMS[to], `cooking ${from} -> ${to}`);
  for (const m of Object.values(MOBS)) for (const [id] of m.drops) assert.ok(ITEMS[id], `mob drop ${id}`);
  for (const [id, it] of Object.entries(ITEMS)) if (it.block) assert.ok(BLOCKS[it.block], `item ${id} places unknown block ${it.block}`);
});

test('the 16 original recipes in order', () => {
  assert.equal(RECIPES.map((r) => r.out).join(','), 'planks,stick,workbench,torch,bricks,campfire,wood_pick,wood_axe,wood_sword,stone_pick,stone_axe,stone_sword,iron_pick,iron_axe,iron_sword,crystal_sword');
});

test('findRecipe ignores position in the grid', () => {
  assert.equal(findRecipe(grid(2, [[1, 'planks'], [3, 'planks']]), 2)?.out, 'stick');
  assert.equal(findRecipe(grid(3, [[4, 'planks'], [7, 'planks']]), 3)?.out, 'stick');
  assert.equal(findRecipe(grid(2, [[3, 'log']]), 2)?.out, 'planks');
});

test('findRecipe accepts mirrored shapes', () => {
  // wood_axe: MM / MS / _S  and its mirror MM / SM / S_
  assert.equal(findRecipe(grid(3, [[0, 'planks'], [1, 'planks'], [3, 'planks'], [4, 'stick'], [7, 'stick']]), 3)?.out, 'wood_axe');
  assert.equal(findRecipe(grid(3, [[1, 'planks'], [2, 'planks'], [4, 'stick'], [5, 'planks'], [7, 'stick']]), 3)?.out, 'wood_axe');
});

test('findRecipe returns null for empty or unknown grids', () => {
  assert.equal(findRecipe(grid(2, []), 2), null);
  assert.equal(findRecipe(grid(2, [[0, 'log'], [3, 'stone']]), 2), null);
});

test('recipeNeeds counts ingredients', () => {
  assert.deepEqual(recipeNeeds(RECIPES.find((r) => r.out === 'campfire')), { stick: 3, log: 1, stone: 3 });
});

test('item stacks default to 64, tools to 1', () => {
  assert.equal(ITEMS.log.stack, 64);
  assert.equal(ITEMS.campfire.stack, 8);
  assert.equal(ITEMS.iron_pick.stack, 1);
});

test('terrain: shrine floor is flat, terrain is deterministic', () => {
  assert.equal(groundHeight(0, 0), 0.45);
  assert.equal(groundHeight(7, 0), 0.2);
  assert.equal(terrainH(123.4, -56.7), terrainH(123.4, -56.7));
});

test('world generation is deterministic and respects removed', () => {
  let tree = null, cx = 0;
  for (; !tree && cx < 200; cx++) tree = treeAt(cx, 10);
  assert.ok(tree, 'some tree exists');
  assert.deepEqual(treeAt(cx - 1, 10), tree);
  assert.equal(treeAt(cx - 1, 10, new Set([tree.key])), null);
  let rock = null;
  for (let x = 0; !rock && x < 200; x++) rock = rockAt(x, 7);
  assert.ok(rock && rock.key.startsWith('r'));
  assert.equal(rockAt(...rock.key.slice(1).split(',').map(Number), new Set([rock.key])), null);
  let shard = null;
  for (let x = 1; !shard && x < 50; x++) shard = shardAt(x, 1);
  assert.ok(shard && shard.key.startsWith('s'));
});
