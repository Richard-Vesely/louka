// Unit tests for the Minecraft controls and tricks in shared/game: off-hand, dropping and picking up
// items, pick block, inventory tricks (number keys, double-click, drag, Shift+double-click), critical hits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '@louka/shared/game/game.js';
import { createWorld, worldToSave } from '@louka/shared/game/world.js';
import { createPlayer, playerToSave } from '@louka/shared/game/player.js';
import { addItem, countItem, pickPlan } from '@louka/shared/game/inventory.js';
import { validClientMessage } from '@louka/shared/protocol.js';
import { DROP_LIFE } from '@louka/shared/game/drops.js';
import { OFFHAND } from '@louka/shared/constants.js';
import { groundHeight } from '@louka/shared/terrain.js';

function setup({ validate = true, x = 40, z = 40, items = [] } = {}) {
  const game = new Game({ validate });
  const p = game.addPlayer(createPlayer('Ája', { pos: [x, groundHeight(x, z), z] }));
  const events = [];
  game.onEvent = (id, ev) => { if (id === p.id) events.push(ev); };
  for (const [id, n] of items) addItem(p, id, n);
  return { game, p, events, act: (msg) => game.act(p.id, msg) };
}
const drops = (game) => [...game.world.drops.values()];
const run = (game, seconds) => { for (let t = 0; t < seconds; t += 0.05) game.tick(0.05); };

test('old saves with 36 slots get an empty off-hand slot', () => {
  const p = createPlayer('A', { inv: Array(36).fill(null).map((_, i) => (i === 3 ? { id: 'log', n: 2 } : null)) });
  assert.equal(p.inv.slots.length, 37);
  assert.equal(p.inv.slots[OFFHAND], null);
  assert.equal(playerToSave(p).inv.length, 37);
});

test('F swaps main hand and off-hand; eat and place work from the off-hand', () => {
  const { game, p, act } = setup({ items: [['torch', 3], ['berries', 2]] });
  p.inv.sel = 0; // torches
  act({ t: 'swap' });
  assert.deepEqual(p.inv.slots[OFFHAND], { id: 'torch', n: 3 });
  assert.equal(p.inv.slots[0], null);
  act({ t: 'place', cell: [40, 0, 37], off: true });
  assert.equal(game.world.blocks.get('40,0,37'), 'torch');
  assert.equal(p.inv.slots[OFFHAND].n, 2);
  p.inv.sel = 1; act({ t: 'swap' }); // berries to the off-hand, torches back to slot 1
  p.hunger = 50;
  act({ t: 'eat', off: true });
  assert.equal(p.hunger, 58);
  assert.equal(countItem(p, 'berries'), 1);
});

test('Q drops one item in front of the player; it can only be picked up after 2 s', () => {
  const { game, p, events, act } = setup({ items: [['stone', 5]] });
  p.yaw = 0; p.pitch = 0;
  act({ t: 'drop', all: false });
  assert.equal(countItem(p, 'stone'), 4);
  const [d] = drops(game);
  assert.equal(d.id, 'stone'); assert.equal(d.n, 1);
  assert.ok(events.some((e) => e.t === 'drop' && e.a === 'add' && e.d[1] === 'stone'));
  run(game, 1); // in flight / lying next to the player, too early to pick up
  assert.equal(countItem(p, 'stone'), 4);
  assert.ok(d.z < 40 - 1, 'thrown forward (towards -z)');
  p.pos.z = d.z; p.pos.x = d.x;
  run(game, 1.2);
  assert.equal(countItem(p, 'stone'), 5);
  assert.equal(game.world.drops.size, 0);
  assert.ok(events.some((e) => e.t === 'drop' && e.a === 'del' && e.by === p.id));
});

test('Ctrl+Q drops the whole stack; another player can pick it up', () => {
  const { game, p, act } = setup({ items: [['log', 7]] });
  const b = game.addPlayer(createPlayer('Bob', { pos: [40, groundHeight(40, 30), 30] }));
  p.yaw = 0; p.pitch = 0;
  act({ t: 'drop', all: true });
  assert.equal(countItem(p, 'log'), 0);
  const [d] = drops(game);
  assert.equal(d.n, 7);
  run(game, 2.5);
  b.pos.x = d.x; b.pos.y = d.y; b.pos.z = d.z;
  run(game, 0.2);
  assert.equal(countItem(b, 'log'), 7);
});

test('dropping from a window slot and from the cursor (click outside the window)', () => {
  const { game, p, act } = setup({ items: [['stick', 6]] });
  act({ t: 'open', mode: 'inv', k: null });
  act({ t: 'drop', c: 'inv', i: 0, all: false });
  assert.equal(countItem(p, 'stick'), 5);
  act({ t: 'slot', c: 'inv', i: 0, button: 0, shift: false }); // pick up the 5 sticks
  act({ t: 'drop', c: 'cur', all: false });
  assert.equal(p.inv.cursor.n, 4);
  act({ t: 'drop', c: 'cur', all: true });
  assert.equal(p.inv.cursor, null);
  assert.equal(drops(game).reduce((n, d) => n + d.n, 0), 6);
});

test('a full backpack spills loot on the ground instead of losing it', () => {
  const { game, p, act } = setup();
  for (let i = 0; i < 36; i++) p.inv.slots[i] = { id: 'wood_sword', n: 1 };
  game.world.blocks.set('40,0,37', 'planks');
  act({ t: 'break', kind: 'block', cell: [40, 0, 37] });
  const [d] = drops(game);
  assert.equal(d?.id, 'planks');
  p.inv.slots[5] = null;
  run(game, 1);
  assert.equal(countItem(p, 'planks'), 1);
});

test('drops merge, fall onto blocks, survive a save and vanish after 5 minutes', () => {
  const { game, p, act } = setup({ items: [['stone', 4]] });
  game.world.blocks.set('20,0,20', 'cobble');
  p.pos.x = 20.5; p.pos.z = 20.5; p.pos.y = 1; p.pitch = -1.55;
  act({ t: 'drop', all: false });
  act({ t: 'drop', all: false });
  p.pos.x = 0; p.pos.z = 14; p.pos.y = 0.45; // walk away (to the shrine)
  run(game, 3);
  assert.equal(game.world.drops.size, 1, 'two stones next to each other merged');
  const [d] = drops(game);
  assert.equal(d.n, 2);
  assert.ok(Math.abs(d.y - 1) < 0.01, `rests on top of the block (y=${d.y})`);
  const w2 = createWorld(JSON.parse(JSON.stringify(worldToSave(game.world))));
  assert.equal([...w2.drops.values()][0].n, 2);
  assert.ok(w2.nextDrop > d.k);
  run(game, DROP_LIFE);
  assert.equal(game.world.drops.size, 0);
});

test('pick block: selects the hotbar slot, or brings the item from the backpack', () => {
  const { p, act } = setup();
  p.inv.slots[4] = { id: 'torch', n: 3 };
  p.inv.slots[20] = { id: 'bricks', n: 9 };
  p.inv.slots[0] = { id: 'log', n: 1 };
  p.inv.sel = 0;
  act({ t: 'pick', id: 'torch' });
  assert.equal(p.inv.sel, 4);
  p.inv.sel = 0;
  assert.deepEqual(pickPlan(p, 'bricks'), { sel: 1, from: 20 }); // slot 0 is taken -> first free
  act({ t: 'pick', id: 'bricks' });
  assert.equal(p.inv.sel, 1);
  assert.deepEqual(p.inv.slots[1], { id: 'bricks', n: 9 });
  assert.equal(p.inv.slots[20], null);
  act({ t: 'pick', id: 'iron' }); // not in the inventory: nothing happens
  assert.equal(p.inv.sel, 1);
});

test('number key over a slot swaps it with that hotbar slot; F over a slot swaps with the off-hand', () => {
  const { p, act } = setup();
  p.inv.slots[15] = { id: 'iron', n: 2 };
  p.inv.slots[2] = { id: 'stick', n: 1 };
  act({ t: 'swap', c: 'inv', i: 15, h: 2 }); // window closed: refused
  assert.equal(p.inv.slots[15].id, 'iron');
  act({ t: 'open', mode: 'inv', k: null });
  act({ t: 'swap', c: 'inv', i: 15, h: 2 });
  assert.equal(p.inv.slots[2].id, 'iron');
  assert.equal(p.inv.slots[15].id, 'stick');
  act({ t: 'swap', c: 'inv', i: 15, h: 36 });
  assert.equal(p.inv.slots[OFFHAND].id, 'stick');
});

test('double-click collects matching items to the cursor (partial stacks first)', () => {
  const { p, act } = setup();
  p.inv.slots[0] = { id: 'planks', n: 10 };
  p.inv.slots[9] = { id: 'planks', n: 64 };
  p.inv.slots[12] = { id: 'planks', n: 20 };
  p.inv.slots[13] = { id: 'stone', n: 5 };
  act({ t: 'open', mode: 'inv', k: null });
  act({ t: 'slot', c: 'inv', i: 0, button: 0, shift: false });
  act({ t: 'collect' });
  assert.deepEqual(p.inv.cursor, { id: 'planks', n: 64 });
  assert.equal(p.inv.slots[12], null, 'partial stack taken first');
  assert.equal(p.inv.slots[9].n, 30);
  assert.equal(p.inv.slots[13].n, 5);
});

test('drag with left button splits evenly; with right button puts one in each', () => {
  const { p, act } = setup();
  p.inv.slots[0] = { id: 'log', n: 10 };
  act({ t: 'open', mode: 'bench', k: null }); // no bench nearby: falls back to the inventory 2×2
  act({ t: 'slot', c: 'inv', i: 0, button: 0, shift: false });
  act({ t: 'spread', cells: [['inv', 9], ['inv', 10], ['inv', 11]], button: 0 });
  assert.deepEqual([p.inv.slots[9].n, p.inv.slots[10].n, p.inv.slots[11].n, p.inv.cursor.n], [3, 3, 3, 1]);
  act({ t: 'slot', c: 'inv', i: 9, button: 0, shift: false }); // put the last one back: slot 9 has 4
  act({ t: 'slot', c: 'inv', i: 9, button: 0, shift: false }); // and pick all 4 up
  act({ t: 'spread', cells: [['craft', 0], ['craft', 1], ['craft', 2], ['craft', 3], ['craft', 4]], button: 2 });
  assert.deepEqual(p.ui.craft.slice(0, 4).map((s) => s?.n), [1, 1, 1, 1], 'craft cell 4 is outside the 2×2 grid');
  assert.equal(p.inv.cursor, null);
});

test('Shift + double-click moves every stack of that item to the other part of the inventory', () => {
  const { p, act } = setup();
  for (const i of [10, 14, 30]) p.inv.slots[i] = { id: 'stone', n: 8 };
  p.inv.slots[11] = { id: 'log', n: 1 };
  act({ t: 'open', mode: 'inv', k: null });
  act({ t: 'moveall', c: 'inv', i: 10, id: 'stone' });
  assert.equal(p.inv.slots.slice(9, 36).filter((s) => s?.id === 'stone').length, 0);
  assert.equal(p.inv.slots.slice(0, 9).filter((s) => s?.id === 'stone').reduce((n, s) => n + s.n, 0), 24);
  assert.equal(p.inv.slots[11].id, 'log');
});

test('critical hit while falling does 1.5× damage; sprinting hits knock back further but never crit', () => {
  const a = setup({ items: [['wood_sword', 1]] });
  a.p.inv.sel = 0;
  const m = a.game.spawnMob('boar', 40, 38.5);
  const hp = m.hp;
  a.act({ t: 'hit', id: m.id, crit: true });
  assert.equal(hp - m.hp, 3 * 1.5);
  assert.ok(a.events.some((e) => e.t === 'fx' && e.k === 'mobhit' && e.crit));
  const b = setup({ items: [['wood_sword', 1]] });
  b.p.inv.sel = 0; b.p.yaw = 0; b.p.sprinting = true;
  const m2 = b.game.spawnMob('boar', 40, 38.5);
  b.act({ t: 'hit', id: m2.id, crit: true });
  assert.equal(m2.def.hp - m2.hp, 3, 'no crit while sprinting');
  assert.ok(Math.abs(m2.vel.z) > 8 * 1.6, 'stronger knockback');
});

test('protocol accepts the new actions and rejects bad ones', () => {
  const ok = [
    { t: 'move', p: [1, 2, 3], yaw: 0, pitch: 0, sp: false, sn: true },
    { t: 'drop', all: false }, { t: 'drop', c: 'cur', all: true }, { t: 'drop', c: 'inv', i: 36, all: false },
    { t: 'pick', id: 'torch' }, { t: 'swap' }, { t: 'swap', c: 'craft', i: 3, h: 36 }, { t: 'collect' },
    { t: 'spread', cells: [['inv', 1], ['craft', 2]], button: 2 }, { t: 'moveall', c: 'inv', i: 4, id: 'log' },
    { t: 'eat', off: true }, { t: 'place', cell: [1, 0, 1], off: false }, { t: 'hit', id: 3, crit: true },
  ];
  for (const m of ok) assert.ok(validClientMessage(m), JSON.stringify(m));
  const bad = [
    { t: 'drop' }, { t: 'drop', c: 'inv', i: 37, all: true }, { t: 'pick', id: '__proto__' }, { t: 'swap', c: 'inv', i: 1, h: 9 },
    { t: 'spread', cells: [], button: 0 }, { t: 'spread', cells: [['inv', 1]], button: 1 }, { t: 'moveall', c: 'fire', i: 2, id: 'log' },
    { t: 'move', p: [1, 2, 3], yaw: 0, pitch: 0, sp: false, sn: 'yes' }, { t: 'hit', id: 1, crit: 1 },
  ];
  for (const m of bad) assert.ok(!validClientMessage(m), JSON.stringify(m));
});
