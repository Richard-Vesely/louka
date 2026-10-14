// Unit tests for shared/game: the state layer that runs offline in the browser and on the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '@louka/shared/game/game.js';
import { createWorld, worldToSave, nearLight } from '@louka/shared/game/world.js';
import { createPlayer, playerToSave } from '@louka/shared/game/player.js';
import { addItem, countItem } from '@louka/shared/game/inventory.js';
import { RECIPES } from '@louka/shared/recipes.js';
import { treeAt } from '@louka/shared/worldgen.js';
import { TREE_CELL } from '@louka/shared/constants.js';

/** A game with one player at (x, z) and a log of every event that player received. */
function setup({ validate = true, x = 40, z = 40, items = [] } = {}) {
  const game = new Game({ validate });
  const p = game.addPlayer(createPlayer('Ája', { pos: [x, 0, z] }));
  const events = [];
  game.onEvent = (id, ev) => { if (id === p.id) events.push(ev); };
  for (const [id, n] of items) addItem(p, id, n);
  const hold = (id) => { p.inv.sel = p.inv.slots.findIndex((s) => s?.id === id); };
  const toasts = () => events.filter((e) => e.t === 'toast').map((e) => e.text);
  return { game, p, events, hold, toasts, act: (msg) => game.act(p.id, msg) };
}

test('place a block: consumes the item, broadcasts it, marks placedAny', () => {
  const { game, p, events, hold, act } = setup({ items: [['planks', 3]] });
  hold('planks');
  act({ t: 'place', cell: [40, 0, 37] });
  assert.equal(game.world.blocks.get('40,0,37'), 'planks');
  assert.equal(countItem(p, 'planks'), 2);
  assert.ok(p.placedAny.planks);
  assert.ok(events.some((e) => e.t === 'block' && e.k === '40,0,37' && e.b === 'planks'));
});

test('place is refused: no item, occupied cell, inside a player, out of reach', () => {
  const { game, p, hold, act } = setup({ items: [['stone', 5]] });
  p.inv.sel = 8;
  act({ t: 'place', cell: [40, 0, 37] }); // nothing in hand
  assert.equal(game.world.blocks.size, 0);
  hold('stone');
  act({ t: 'place', cell: [40, 0, 40] }); // inside the player
  act({ t: 'place', cell: [40, 0, 60] }); // too far
  assert.equal(game.world.blocks.size, 0);
  act({ t: 'place', cell: [40, 0, 37] });
  act({ t: 'place', cell: [40, 0, 37] }); // already taken
  assert.equal(game.world.blocks.size, 1);
  assert.equal(countItem(p, 'stone'), 4);
});

test('break a block: drop comes back; cobble needs a pickaxe; rate is limited', () => {
  const { game, p, hold, act } = setup({ items: [['wood_pick', 1]] });
  game.world.blocks.set('40,0,37', 'cobble');
  game.world.blocks.set('41,0,37', 'cobble');
  p.inv.sel = 8;
  act({ t: 'break', kind: 'block', cell: [40, 0, 37] }); // bare hand
  assert.ok(game.world.blocks.has('40,0,37'));
  hold('wood_pick');
  act({ t: 'break', kind: 'block', cell: [40, 0, 37] });
  assert.ok(!game.world.blocks.has('40,0,37'));
  assert.equal(countItem(p, 'stone'), 1);
  act({ t: 'break', kind: 'block', cell: [41, 0, 37] }); // too soon after the first one
  assert.ok(game.world.blocks.has('41,0,37'));
  game.tick(1);
  act({ t: 'break', kind: 'block', cell: [41, 0, 37] });
  assert.ok(!game.world.blocks.has('41,0,37'));
});

test('fell a tree: logs, removed for everyone, tree is gone from worldgen', () => {
  let tree = null;
  for (let cx = 10; !tree; cx++) tree = treeAt(cx, 10);
  const { game, p, events, act } = setup({ x: tree.x + 1.6, z: tree.z });
  act({ t: 'break', kind: 'tree', key: tree.key });
  assert.ok(countItem(p, 'log') >= 3);
  assert.ok(game.world.removed.has(tree.key));
  assert.ok(events.some((e) => e.t === 'removed' && e.key === tree.key));
  assert.equal(treeAt(Math.floor(tree.x / TREE_CELL), Math.floor(tree.z / TREE_CELL), game.world.removed), null);
  const logs = countItem(p, 'log');
  game.tick(10);
  act({ t: 'break', kind: 'tree', key: tree.key }); // can't fell it twice
  assert.equal(countItem(p, 'log'), logs);
});

test('crafting through actions: recipe book, take result, 3×3 needs a workbench', () => {
  const { p, toasts, act } = setup({ items: [['log', 2], ['planks', 3], ['stick', 2]] });
  act({ t: 'open', mode: 'inv', k: null });
  act({ t: 'fill', r: RECIPES.findIndex((r) => r.out === 'planks'), shift: false });
  act({ t: 'take', shift: false });
  assert.deepEqual(p.inv.cursor, { id: 'planks', n: 4 });
  assert.ok(p.crafted.planks);
  act({ t: 'fill', r: RECIPES.findIndex((r) => r.out === 'wood_pick'), shift: false });
  assert.equal(toasts().at(-1), 'Tento recept potřebuje pracovní stůl');
  act({ t: 'close' });
  assert.equal(p.inv.cursor, null);
  assert.equal(countItem(p, 'planks'), 7);
  assert.equal(countItem(p, 'log'), 1);
});

test('server refuses a workbench window without a workbench nearby', () => {
  const { p, act } = setup();
  act({ t: 'open', mode: 'bench', k: '40,0,37' });
  assert.equal(p.ui.mode, 'inv');
  assert.equal(p.ui.size, 2);
});

test('slot clicks: right click takes half, closing returns the cursor', () => {
  const { p, act } = setup({ items: [['stick', 5]] });
  act({ t: 'open', mode: 'inv', k: null });
  act({ t: 'slot', c: 'inv', i: 0, button: 2, shift: false });
  assert.deepEqual(p.inv.cursor, { id: 'stick', n: 3 });
  assert.equal(p.inv.slots[0].n, 2);
  act({ t: 'close' });
  assert.equal(countItem(p, 'stick'), 5);
});

test('eating: restores hunger, heals with cooked meat, refuses when full', () => {
  const { p, hold, toasts, act } = setup({ items: [['berries', 2], ['meat', 1]] });
  hold('berries');
  p.hunger = 50;
  act({ t: 'eat' });
  assert.equal(p.hunger, 58);
  p.hunger = 100;
  act({ t: 'eat' });
  assert.equal(toasts().at(-1), 'Nemáš hlad');
  assert.equal(countItem(p, 'berries'), 1);
  hold('meat');
  p.hp = 50;
  act({ t: 'eat' });
  assert.equal(p.hp, 60);
});

test('survival: hunger drops, starving hurts, death and respawn after 2.6 s', () => {
  const { game, p, events } = setup();
  game.tick(10);
  assert.ok(Math.abs(p.hunger - (100 - 1.1)) < 1e-9);
  p.hunger = 0; p.hp = 4;
  for (let i = 0; i < 70; i++) game.tick(0.05);
  assert.equal(p.alive, false);
  assert.ok(events.some((e) => e.t === 'died'));
  game.act(p.id, { t: 'eat' }); // dead players can't act (no crash either)
  for (let i = 0; i < 60; i++) game.tick(0.05);
  assert.equal(p.alive, true);
  assert.equal(p.hp, 100);
  assert.deepEqual([p.pos.x, p.pos.z], [0, 14]);
  assert.ok(events.some((e) => e.t === 'respawn'));
});

test('campfire cooks while the window is closed, even while paused', () => {
  const { game, p, hold, act } = setup({ items: [['campfire', 1], ['raw_meat', 3]] });
  hold('campfire');
  act({ t: 'place', cell: [40, 0, 37] });
  act({ t: 'open', mode: 'fire', k: '40,0,37' });
  act({ t: 'cook', id: 'raw_meat' });
  act({ t: 'close' });
  assert.equal(game.world.fires.get('40,0,37').slots[0].n, 3);
  for (let i = 0; i < 90; i++) game.tick(0, 0.05); // paused game time, real time runs
  assert.deepEqual(game.world.fires.get('40,0,37').slots[1], { id: 'meat', n: 1 });
  assert.ok(p.crafted.meat);
  assert.ok(nearLight(game.world, 40, 37, 5));
});

test('mobs: hitting a sheep kills it and drops meat + wool for the hitter', () => {
  const { game, p, hold, act } = setup({ items: [['iron_sword', 1]] });
  hold('iron_sword');
  const m = game.spawnMob('sheep', 40, 37.5);
  for (let i = 0; i < 5 && !m.dead; i++) { act({ t: 'hit', id: m.id }); game.tick(0.5); }
  assert.ok(m.dead);
  assert.ok(countItem(p, 'raw_meat') >= 1 && countItem(p, 'wool') >= 1);
  game.tick(0.5);
  assert.ok(!game.mobs.includes(m));
});

test('mobs: stínožrouti spawn at night and stay out of the shrine', () => {
  const { game } = setup({ x: 150, z: 150 });
  game.world.time.dayTime = 0.9;
  for (let i = 0; i < 400 && !game.mobs.some((m) => m.type === 'crawler'); i++) game.tick(0.05);
  assert.ok(game.mobs.some((m) => m.type === 'crawler'));
  const g2 = setup({ x: 0, z: 5 });
  const c = g2.game.spawnMob('crawler', 0, 9);
  for (let i = 0; i < 60; i++) g2.game.tick(0.05);
  assert.ok(Math.hypot(c.pos.x, c.pos.z) >= 12.5);
  assert.equal(g2.p.hp, 100);
});

test('mobs chase the nearest player and despawn far from everyone', () => {
  const game = new Game();
  const a = game.addPlayer(createPlayer('A', { pos: [100, 0, 100] }));
  game.addPlayer(createPlayer('B', { pos: [-100, 0, -100] }));
  const boar = game.spawnMob('boar', 103, 100);
  boar.aggro = true;
  for (let i = 0; i < 20; i++) game.tick(0.05);
  assert.ok(Math.hypot(boar.pos.x - a.pos.x, boar.pos.z - a.pos.z) < 3);
  const lost = game.spawnMob('sheep', 300, 300);
  game.tick(0.05);
  assert.ok(!game.mobs.includes(lost));
});

test('a player who leaves gets the crafting grid back in the bag', () => {
  const { game, p, act } = setup({ items: [['log', 1]] });
  act({ t: 'open', mode: 'inv', k: null });
  act({ t: 'fill', r: 0, shift: false });
  assert.equal(countItem(p, 'log'), 0);
  game.removePlayer(p.id);
  assert.equal(countItem(p, 'log'), 1);
  assert.equal(game.players.size, 0);
});

test('save format round-trips (same keys as the original rise-svet-v2 save)', () => {
  const { game, p, act, hold } = setup({ items: [['torch', 2]] });
  hold('torch');
  act({ t: 'place', cell: [40, 0, 37] });
  game.world.removed.add('t1,2');
  const data = JSON.parse(JSON.stringify({ ...playerToSave(p), ...worldToSave(game.world) }));
  for (const k of ['inv', 'pos', 'yaw', 'hp', 'hunger', 'dayTime', 'day', 'blocks', 'removed', 'crafted', 'placedAny', 'fires']) assert.ok(k in data, k);
  const w2 = createWorld(data), p2 = createPlayer('Ája', data);
  assert.equal(w2.blocks.get('40,0,37'), 'torch');
  assert.ok(w2.removed.has('t1,2'));
  assert.equal(countItem(p2, 'torch'), 1);
  assert.deepEqual([p2.pos.x, p2.pos.z], [40, 40]);
});

test('unknown actions and unknown players are ignored', () => {
  const { game, p } = setup();
  game.act(p.id, { t: 'nope' });
  game.act(999, { t: 'eat' });
  game.act(p.id, null);
  assert.equal(p.hp, 100);
});
