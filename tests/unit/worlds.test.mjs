// Several worlds on one server (WORLDS): the list, choosing a world, isolation (blocks, chat, players), creative
// only in the creative world, players per world, saving and restart, and moving the old single-world data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrateOldLayout, parseWorlds } from '../../server/worlds.js';
import { player, pose, sleep, startServer, stop } from './server-helpers.mjs';

const WORLDS = 'svet:Hlavní svět,kreativ:Kreativní svět:creative';
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const getJSON = async (port, url) => (await fetch(`http://127.0.0.1:${port}${url}`)).json();
const has = (p, fn) => p.msgs.some(fn);
const blockOp = (k) => (m) => m[0] === 'ops' && m[1].some((o) => o[2] === k);

test('WORLDS: parsing and defaults', () => {
  assert.deepEqual(parseWorlds(undefined, false), [{ id: 'svet', name: 'Hlavní svět', creative: false }]);
  assert.deepEqual(parseWorlds('', true), [{ id: 'svet', name: 'Hlavní svět', creative: true }]);
  assert.deepEqual(parseWorlds(`"${WORLDS}"`), parseWorlds(WORLDS), 'quotes around the whole value are fine');
  assert.deepEqual(parseWorlds(WORLDS), [{ id: 'svet', name: 'Hlavní svět', creative: false }, { id: 'kreativ', name: 'Kreativní svět', creative: true }]);
  assert.deepEqual(parseWorlds(' Les : Velký les , hory'), [{ id: 'les', name: 'Velký les', creative: false }, { id: 'hory', name: 'hory', creative: false }]);
  assert.throws(() => parseWorlds('a:A,a:B'), /dvakrát/);
  assert.throws(() => parseWorlds('../x:X'), /neplatné id/);
  assert.throws(() => parseWorlds('backups:Zálohy'), /neplatné id/);
  assert.throws(() => parseWorlds('a:A:nevim'), /neznámá volba/);
});

test('old single-world data moves into the first world (only when it has no data yet)', () => {
  const dir = tmp('louka-mig-'), logs = [];
  fs.writeFileSync(path.join(dir, 'world.json'), '{"old":1}');
  fs.mkdirSync(path.join(dir, 'backups'));
  fs.writeFileSync(path.join(dir, 'backups', 'world-2026-10-18.json'), '{}');
  migrateOldLayout(dir, 'svet', (m) => logs.push(m));
  assert.equal(fs.readFileSync(path.join(dir, 'svet', 'world.json'), 'utf8'), '{"old":1}');
  assert.ok(fs.existsSync(path.join(dir, 'svet', 'backups', 'world-2026-10-18.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'world.json')) && !fs.existsSync(path.join(dir, 'backups')));
  assert.match(logs[0], /přesunut/);
  fs.writeFileSync(path.join(dir, 'world.json'), '{"other":1}'); // the first world already has data: leave both alone
  migrateOldLayout(dir, 'svet', (m) => logs.push(m));
  assert.equal(fs.readFileSync(path.join(dir, 'svet', 'world.json'), 'utf8'), '{"old":1}');
  assert.ok(fs.existsSync(path.join(dir, 'world.json')));
  assert.match(logs[1], /zůstává/);
});

test('two worlds: list, choice, isolation, creative, limits, save and restart', { timeout: 90000 }, async () => {
  const dataDir = tmp('louka-worlds-');
  const env = { DATA_DIR: dataDir, ROOM_PASSWORD: 'tajne', SAVE_SECONDS: '1', MAX_PLAYERS: '2', WORLDS };
  let srv = await startServer(env);
  try {
    const list = await getJSON(srv.port, '/worlds');
    assert.deepEqual(list, [
      { id: 'svet', name: 'Hlavní svět', creative: false, players: 0, max: 2 },
      { id: 'kreativ', name: 'Kreativní svět', creative: true, players: 0, max: 2 },
    ]);

    // a new client without a world gets the list (after the password), then says hello again on the same connection
    const bad = player(srv.port, 'Zloděj', 'spatne', { v: 2, world: 'svet' });
    assert.ok(await bad.waitFor((m) => m[0] === 'denied'), 'wrong password is denied in every world');
    const a = player(srv.port, 'Ája', 'tajne', { v: 2 });
    const offer = await a.waitFor((m) => m[0] === 'worlds');
    assert.ok(offer, 'a client without a world gets the list of worlds');
    assert.deepEqual(offer[1].map((w) => w.id), ['svet', 'kreativ']);
    assert.equal(a.welcome, null, 'and does not join yet');
    a.send(['hello', { name: 'Ája', pass: 'tajne', v: 2, world: 'svet' }]);
    assert.ok(await a.waitFor((m) => m[0] === 'welcome'), 'Ája joins after choosing');
    assert.deepEqual(a.welcome.worldInfo, { id: 'svet', name: 'Hlavní svět', creative: false, first: true });
    assert.equal(a.welcome.perm, false, 'no creative in the survival world');

    const lost = player(srv.port, 'Ztracený', 'tajne', { v: 2, world: 'neexistuje' });
    assert.ok(await lost.waitFor((m) => m[0] === 'worlds'), 'an unknown world gets the list');
    const old = player(srv.port, 'Cyril', 'tajne'); // old client: no v, no world
    assert.ok(await old.waitFor((m) => m[0] === 'welcome'), 'an old client joins');
    assert.equal(old.welcome.worldInfo.id, 'svet', '…the first world');

    const b = player(srv.port, 'Bára', 'tajne', { v: 2, world: 'kreativ' }), d = player(srv.port, 'Dan', 'tajne', { v: 2, world: 'KREATIV' });
    assert.ok(await b.waitFor((m) => m[0] === 'welcome') && await d.waitFor((m) => m[0] === 'welcome'));
    assert.deepEqual(b.welcome.worldInfo, { id: 'kreativ', name: 'Kreativní svět', creative: true, first: false });
    assert.equal(b.welcome.perm, true, 'creative is allowed in the creative world');
    const full = player(srv.port, 'Eva', 'tajne', { v: 2, world: 'svet' });
    assert.ok(await full.waitFor((m) => m[0] === 'full'), 'MAX_PLAYERS counts per world');

    // players and chat stay in their world
    assert.ok(await a.waitFor((m) => m[0] === 'join' && m[1] === 'Cyril'));
    assert.ok(await b.waitFor((m) => m[0] === 'join' && m[1] === 'Dan'));
    for (const [p, x] of [[a, 0], [old, 2], [b, 4], [d, 6]]) p.send(['pose', pose(x, 14)]);
    assert.ok(await b.waitFor((m) => m[0] === 'pl' && m[1].some((q) => q[1] === 'Dan' && q[2])), 'Bára sees Dan');
    a.send(['ops', 0, [['m', 'blocks', '2,1,20', 'bricks']]]);
    b.send(['ops', 1, [['m', 'blocks', '5,1,20', 'glass']]]);
    a.send(['ops', 1, [['m', 'blocks', '3,1,20', 'planks']]]);
    a.send(['chat', 'Ahoj z přežití']);
    b.send(['chat', 'Ahoj z kreativu']);
    assert.ok(await old.waitFor(blockOp('2,1,20')), 'a block reaches the same world');
    assert.ok(await d.waitFor(blockOp('5,1,20')), 'a creative block is accepted in the creative world');
    assert.ok(await a.waitFor((m) => m[0] === 'perm' && m[1] === false), 'a creative edit in the survival world is refused');
    assert.ok(await old.waitFor((m) => m[0] === 'chat' && m[2] === 'Ahoj z přežití'));
    assert.ok(await d.waitFor((m) => m[0] === 'chat' && m[2] === 'Ahoj z kreativu'));
    await sleep(1000);
    assert.ok(!has(b, blockOp('2,1,20')) && !has(d, blockOp('2,1,20')), 'blocks do not leak into the other world');
    assert.ok(!has(a, blockOp('5,1,20')) && !has(old, blockOp('5,1,20')), '…in either direction');
    assert.ok(!has(b, (m) => m[0] === 'chat' && m[2] === 'Ahoj z přežití') && !has(a, (m) => m[0] === 'chat' && m[2] === 'Ahoj z kreativu'), 'chat stays in its world');
    assert.ok(!b.msgs.some((m) => m[0] === 'pl' && m[1].some((q) => q[1] === 'Ája' || q[1] === 'Cyril')), 'players of the other world are not sent');
    assert.ok(!has(b, (m) => m[0] === 'join' && m[1] === 'Cyril'));

    const h = await getJSON(srv.port, '/health');
    assert.equal(h.players, 4);
    assert.equal(h.max, 4);
    assert.deepEqual(h.worlds.map((w) => [w.id, w.players]), [['svet', 2], ['kreativ', 2]]);
    assert.ok(typeof h.tickMs.avg === 'number' && h.tickMs.budget === 50 && h.worlds.every((w) => typeof w.tickMs.avg === 'number'));
    assert.equal((await getJSON(srv.port, '/worlds'))[1].players, 2);
    await sleep(1500); // uložení každou sekundu
    for (const p of [a, b, d, old, lost, full, bad]) await p.close();
  } finally {
    await stop(srv);
  }
  for (const id of ['svet', 'kreativ']) {
    assert.ok(fs.existsSync(path.join(dataDir, id, 'world.json')), `${id}/world.json written`);
    assert.equal(fs.readdirSync(path.join(dataDir, id, 'backups')).length, 1, `${id}/backups written`);
  }

  srv = await startServer(env);
  try {
    const a = player(srv.port, 'Ája', 'tajne', { v: 2, world: 'svet' }), b = player(srv.port, 'Bára', 'tajne', { v: 2, world: 'kreativ' });
    await a.waitFor((m) => m[0] === 'welcome');
    await b.waitFor((m) => m[0] === 'welcome');
    const blocksOf = (p) => new Map(p.welcome.world.blocks);
    assert.equal(blocksOf(a).get('2,1,20'), 'bricks', 'survival block survives a restart');
    assert.ok(!blocksOf(a).has('5,1,20') && !blocksOf(a).has('3,1,20'));
    assert.equal(blocksOf(b).get('5,1,20'), 'glass', 'creative block survives a restart');
    assert.ok(!blocksOf(b).has('2,1,20'));
    await a.close(); await b.close();
  } finally {
    await stop(srv);
  }
});

test('a server from before WORLDS keeps its world as the first world', { timeout: 60000 }, async () => {
  const dataDir = tmp('louka-old-');
  let srv = await startServer({ DATA_DIR: dataDir, SAVE_SECONDS: '1' });
  try {
    const a = player(srv.port, 'Ája', '');
    await a.waitFor((m) => m[0] === 'welcome');
    a.send(['ops', 0, [['m', 'blocks', '7,1,20', 'bricks']]]);
    await sleep(1500);
    await a.close();
  } finally {
    await stop(srv);
  }
  // the old layout: DATA_DIR/world.json + DATA_DIR/backups/
  fs.renameSync(path.join(dataDir, 'svet', 'world.json'), path.join(dataDir, 'world.json'));
  fs.renameSync(path.join(dataDir, 'svet', 'backups'), path.join(dataDir, 'backups'));
  fs.rmSync(path.join(dataDir, 'svet'), { recursive: true });
  srv = await startServer({ DATA_DIR: dataDir, WORLDS });
  try {
    assert.match(srv.out(), /přesunut/, 'the move is logged');
    const a = player(srv.port, 'Ája', '', { v: 2, world: 'svet' }), b = player(srv.port, 'Bára', '', { v: 2, world: 'kreativ' });
    await a.waitFor((m) => m[0] === 'welcome');
    await b.waitFor((m) => m[0] === 'welcome');
    assert.ok(a.welcome.world.blocks.some(([k, v]) => k === '7,1,20' && v === 'bricks'), 'the old world is the first world');
    assert.ok(!b.welcome.world.blocks.some(([k]) => k === '7,1,20'), 'the new world starts fresh');
    await a.close(); await b.close();
  } finally {
    await stop(srv);
  }
  assert.ok(!fs.existsSync(path.join(dataDir, 'world.json')));
  assert.ok(fs.existsSync(path.join(dataDir, 'svet', 'world.json')) && fs.readdirSync(path.join(dataDir, 'svet', 'backups')).length === 1);
});
