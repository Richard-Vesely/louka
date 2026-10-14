// Integration tests: the real server with real WebSocket clients.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server/src/server.js';
import { addItem } from '@louka/shared/game/inventory.js';
import { validClientMessage, PROTOCOL_VERSION } from '@louka/shared/protocol.js';
import { TestClient } from '../helpers/ws-client.mjs';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louka-test-'));
const quiet = () => {};
let srv, url;
const start = async () => { srv = await startServer({ port: 0, password: 'heslo', dataDir, log: quiet }); url = `ws://127.0.0.1:${srv.port}`; };
before(start);
after(async () => { await srv.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const serverPlayer = (name) => [...srv.room.game.players.values()].find((p) => p.name === name);

test('protocol: client messages are validated', () => {
  assert.ok(validClientMessage({ t: 'place', cell: [1, 2, 3] }));
  assert.ok(validClientMessage({ t: 'break', kind: 'tree', key: 't4,-5' }));
  assert.ok(validClientMessage({ t: 'hello', name: 'Šárka 2', password: '', v: PROTOCOL_VERSION }));
  for (const bad of [null, [], { t: 'nope' }, { t: 'place', cell: [1, 2] }, { t: 'place', cell: [1.5, 2, 3] }, { t: 'break', kind: 'tree', key: 'r1,2' },
    { t: 'slot', c: 'inv', i: 99, button: 0, shift: false }, { t: 'hello', name: '<script>', password: '', v: 1 }, { t: 'move', p: [NaN, 0, 0], yaw: 0, pitch: 0, sp: false },
    { t: 'open', mode: 'bench', k: '../etc' }, { t: 'fill', r: 999, shift: false }, { t: '__proto__' }]) {
    assert.equal(validClientMessage(bad), false, JSON.stringify(bad));
  }
});

test('wrong password and bad names are refused', async () => {
  const c = new TestClient(url);
  const m = await c.join('Ája', 'spatne');
  assert.equal(m.t, 'error');
  assert.equal(m.code, 'password');
  const d = new TestClient(url);
  assert.equal((await d.join('x', 'heslo')).code, 'name');
});

test('three players join, see each other, and a placed block reaches the others within 0.2 s', async () => {
  const [a, b, c] = [new TestClient(url), new TestClient(url), new TestClient(url)];
  const wa = await a.join('Ája', 'heslo');
  assert.equal(wa.t, 'welcome');
  await b.join('Bára', 'heslo');
  const wc = await c.join('Cyril', 'heslo');
  assert.deepEqual(wc.players.map((p) => p.name).sort((x, y) => x.localeCompare(y, 'cs')), ['Ája', 'Bára']);
  await a.wait((m) => m.t === 'join' && m.name === 'Cyril');

  // Others move: A sees B's position in a state message.
  b.send({ t: 'move', p: [2, 0.45, 13], yaw: 1, pitch: 0, sp: false });
  const st = await a.wait((m) => m.t === 'state' && m.pl?.some((q) => q[0] === wc.players.find((p) => p.name === 'Bára').id && q[1] === 2));
  assert.ok(st);

  addItem(serverPlayer('Ája'), 'planks', 5);
  const since = b.msgs.length;
  const sent = Date.now();
  a.send({ t: 'place', cell: [1, 0, 11] });
  const got = await b.wait((m) => m.t === 'block' && m.k === '1,0,11' && m.b === 'planks', 1000, since);
  const ms = got.at - sent;
  assert.ok(ms <= 200, `block reached B after ${ms} ms`);
  const me = await a.wait((m) => m.t === 'me' && m.inv.some((s) => s?.id === 'planks' && s.n === 4));
  assert.ok(me.ack >= 1);
  await Promise.all([a.close(), b.close(), c.close()]);
});

test('the server refuses a block out of reach and a block without the item', async () => {
  const a = new TestClient(url);
  await a.join('Dan', 'heslo');
  a.send({ t: 'place', cell: [1, 0, 9] }); // no item
  await a.wait((m) => m.t === 'me' && m.ack === 1);
  addItem(serverPlayer('Dan'), 'stone', 3);
  a.send({ t: 'place', cell: [40, 0, 40] }); // far away
  await a.wait((m) => m.t === 'me' && m.ack === 2);
  assert.ok(!srv.room.game.world.blocks.has('1,0,9'));
  assert.ok(!srv.room.game.world.blocks.has('40,0,40'));
  // Moving too fast gets corrected.
  a.send({ t: 'move', p: [300, 0, 300], yaw: 0, pitch: 0, sp: false });
  const corr = await a.wait((m) => m.t === 'correct');
  assert.deepEqual(corr.p.map(Math.round), [0, 0, 14]);
  // Junk does not crash the server.
  a.ws.send('not json');
  a.ws.send(JSON.stringify([{ t: 'slot', c: 'fire', i: 1, button: 0, shift: false }, { t: 'break', kind: 'block', cell: [9, 9, 9] }, 42, null]));
  a.send({ t: 'eat' });
  await a.wait((m) => m.t === 'me' && m.ack === 3);
  await a.close();
});

test('the same name while still connected is refused', async () => {
  const a = new TestClient(url), b = new TestClient(url);
  await a.join('Eva', 'heslo');
  const m = await b.join('eva', 'heslo');
  assert.equal(m.code, 'taken');
  await a.close();
});

test('reconnecting with the same name restores inventory and position', async () => {
  const a = new TestClient(url);
  await a.join('Filip', 'heslo');
  addItem(serverPlayer('Filip'), 'iron', 7);
  await new Promise((ok) => setTimeout(ok, 300)); // a real client walks there; we jump after 0.3 s
  a.send({ t: 'move', p: [3, 0.45, 12], yaw: 0.5, pitch: 0, sp: false });
  await new Promise((ok) => setTimeout(ok, 150));
  await a.close();
  await new Promise((ok) => setTimeout(ok, 50));
  const b = new TestClient(url);
  const w = await b.join('Filip', 'heslo');
  assert.equal(w.you.inv.find((s) => s?.id === 'iron')?.n, 7);
  assert.deepEqual(w.you.pos, [3, 0.45, 12]);
  await b.close();
});

test('restarting the server keeps the world and the players', async () => {
  const a = new TestClient(url);
  await a.join('Gábi', 'heslo');
  addItem(serverPlayer('Gábi'), 'bricks', 2);
  a.send({ t: 'place', cell: [-1, 0, 11] });
  await a.wait((m) => m.t === 'block' && m.k === '-1,0,11');
  await srv.close();
  assert.ok(fs.existsSync(path.join(dataDir, 'world.json')));
  assert.equal(fs.readdirSync(path.join(dataDir, 'backups')).length, 1);
  await start();
  const b = new TestClient(url);
  const w = await b.join('Gábi', 'heslo');
  assert.ok(w.world.blocks.some(([k, t]) => k === '-1,0,11' && t === 'bricks'));
  assert.ok(w.world.blocks.some(([k]) => k === '1,0,11'), 'block from the earlier test is still there');
  assert.equal(w.you.inv.find((s) => s?.id === 'bricks')?.n, 1);
  await b.close();
});
