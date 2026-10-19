// Unit tests of the inventory rules (shared/inventory.js) and stacking items on the ground.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applySpread, gatherInto, insertRange, insertStack, itemKind, pickItem, pickPlan, rarityOf, sortSlots, spreadPlan, stackModels } from '../../shared/inventory.js';
import { groundItems, mergeGroundItems, spawnGroundItem } from '../../shared/sim/ground-items.js';
import { NET } from '../../shared/net/net.js';

const S = (id, n) => ({ id, n });

test('insertStack fills matching stacks first, then empty slots', () => {
  const arr = [S('stone', 60), null, S('stone', 10)];
  assert.equal(insertStack(arr, S('stone', 60)), 0);
  assert.deepEqual(arr, [S('stone', 64), S('stone', 2), S('stone', 64)]);
});

test('double-click gathers non-full stacks first, up to one full stack', () => {
  const bag = [S('dirt', 64), S('dirt', 5), null, S('dirt', 30), S('log', 3)];
  const grid = [S('dirt', 2)];
  const cur = S('dirt', 10);
  const got = gatherInto(cur, [grid, bag]);
  // 10 + 2 + 5 + 30 from the partial stacks, only then 17 from the full one
  assert.equal(cur.n, 64);
  assert.equal(got, 54);
  assert.deepEqual(bag, [S('dirt', 47), null, null, null, S('log', 3)]);
  assert.deepEqual(grid, [null]);
  const cur2 = S('log', 1);
  gatherInto(cur2, [bag]);
  assert.deepEqual([cur2, bag[4]], [S('log', 4), null]);
});

test('drag spread: left splits evenly, right puts one in each slot', () => {
  const slots = [null, S('stone', 3), S('log', 1), null];
  assert.deepEqual(spreadPlan(S('stone', 10), slots, 0), { add: [3, 3, 0, 3], left: 1 });
  assert.deepEqual(spreadPlan(S('stone', 10), slots, 2), { add: [1, 1, 0, 1], left: 7 });
  // more slots than items: one each until the cursor is empty
  assert.deepEqual(spreadPlan(S('stone', 2), [null, null, null], 0), { add: [1, 1, 0], left: 0 });
  // a nearly full stack only takes what fits
  assert.deepEqual(spreadPlan(S('stone', 20), [S('stone', 62), null], 0), { add: [2, 10], left: 8 });
  // tools stack to 1: a slot with the same tool is full
  assert.deepEqual(spreadPlan(S('iron_pick', 1), [S('iron_pick', 1), null], 0).add, [0, 1]);
  const a = [null, null], b = [S('stone', 1)];
  const left = applySpread(S('stone', 7), [[a, 0], [a, 1], [b, 0]], 0);
  assert.deepEqual([a, b, left], [[S('stone', 2), S('stone', 2)], [S('stone', 3)], S('stone', 1)]);
  assert.equal(applySpread(S('stone', 2), [[a, 0], [a, 1]], 2), null);
});

test('insertRange can fill backwards (hotbar end first)', () => {
  const arr = Array(9).fill(null);
  arr[2] = S('log', 63);
  assert.equal(insertRange(arr, S('log', 70), 0, 9, true), 0);
  assert.deepEqual(arr[2], S('log', 64));
  assert.deepEqual(arr[8], S('log', 64));
  assert.deepEqual(arr[7], S('log', 5));
});

test('sort merges stacks and orders tools, weapons, armor, food, blocks, materials', () => {
  const arr = [S('dirt', 30), S('meat', 2), null, S('stone_sword', 1), S('dirt', 50), S('log', 4), S('iron_pick', 1), S('wood_pick', 1), S('iron_helmet', 1), null];
  assert.equal(sortSlots(arr), true);
  assert.deepEqual(arr.map((s) => s && s.id), ['iron_pick', 'wood_pick', 'stone_sword', 'iron_helmet', 'meat', 'dirt', 'dirt', 'log', null, null]);
  assert.deepEqual([arr[5].n, arr[6].n], [64, 16]);
  assert.equal(sortSlots(arr), false); // sorted already
  assert.equal(itemKind('stone_sword'), 'weapon');
  assert.equal(itemKind('hoe'), 'tool');
});

test('extra stack data (tool wear) survives moving, spreading and sorting', () => {
  const worn = { id: 'iron_pick', n: 1, w: 40 };
  const a = [null, null];
  assert.equal(applySpread(worn, [[a, 1]], 0), null);
  assert.deepEqual(a[1], worn);
  const arr = [{ id: 'dirt', n: 3 }, { id: 'iron_pick', n: 1, w: 7 }, { id: 'iron_pick', n: 1 }, { id: 'dirt', n: 4 }];
  sortSlots(arr);
  assert.deepEqual(arr, [{ id: 'iron_pick', n: 1, w: 7 }, { id: 'iron_pick', n: 1 }, { id: 'dirt', n: 7 }, null]);
  const b = [null];
  insertRange(b, { id: 'iron_pick', n: 1, w: 5 }, 0, 1);
  assert.deepEqual(b[0], { id: 'iron_pick', n: 1, w: 5 });
});

test('middle-click pick: select in hotbar, or swap in from the backpack', () => {
  const slots = Array(36).fill(null);
  slots[3] = S('planks', 5); slots[0] = S('log', 1); slots[20] = S('stone', 9);
  assert.deepEqual(pickPlan(slots, 0, 'planks'), { sel: 3, from: -1 });
  assert.deepEqual(pickPlan(slots, 0, 'stone'), { sel: 1, from: 20 }); // selected slot is busy -> first free one
  assert.equal(pickPlan(slots, 0, 'coal'), null);
  const inv = { slots, sel: 0 };
  pickItem(inv, 'stone');
  assert.equal(inv.sel, 1);
  assert.deepEqual(slots[1], S('stone', 9));
  assert.equal(slots[20], null);
});

test('stack models on the ground and rarity colours', () => {
  assert.deepEqual([1, 2, 16, 17, 32, 33, 48, 49, 64].map(stackModels), [1, 2, 2, 3, 3, 4, 4, 5, 5]);
  assert.equal(rarityOf('dirt'), 0);
  assert.equal(rarityOf('iron_pick'), 1);
  assert.equal(rarityOf('crystal_sword'), 2);
  assert.equal(rarityOf('markorite_sword'), 3);
  assert.equal(rarityOf('markapple'), 3);
});

test('items lying next to each other merge into one stack (world holder only)', () => {
  const ops = [];
  const oldOp = NET.op;
  NET.op = (o) => ops.push(o);
  try {
    groundItems.length = 0;
    const p = { x: 0, y: 10, z: 0 }, v = { x: 0, y: 0, z: 0 };
    spawnGroundItem('stone', 40, p, v, 0, 'a');
    spawnGroundItem('stone', 30, { x: 0.3, y: 10.1, z: 0.2 }, v, 0, 'b');
    spawnGroundItem('stone', 5, { x: 3, y: 10, z: 0 }, v, 0, 'c'); // too far
    spawnGroundItem('log', 5, p, v, 0, 'd'); // different item
    mergeGroundItems();
    assert.deepEqual(groundItems.map((g) => g.n), [64, 6, 5, 5]);
    assert.deepEqual(ops.filter((o) => o[0] === 'gx'), [['gx', 'a', 64], ['gx', 'b', 6]]);
  } finally {
    NET.op = oldOp;
    groundItems.length = 0;
  }
});
