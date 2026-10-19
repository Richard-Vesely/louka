// The Node.js server: password, welcome with the world, edits between two players, mobs, saving and restart.
// Runs the real server (node server/index.js) in a child process, players are WebSocket clients.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
function startServer(env) {
  const child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: '0', STATIC_DIR: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  return new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('server did not start: ' + out)), 15000);
    child.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/http:\/\/localhost:(\d+)\//);
      if (m) { clearTimeout(t); ok({ child, port: Number(m[1]), out: () => out }); }
    });
    child.stderr.on('data', (d) => { out += d; });
  });
}
const stop = (s) => new Promise((ok) => { s.child.on('exit', ok); s.child.kill(); });
function player(port, name, pass) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const p = { ws, msgs: [], welcome: null };
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); p.msgs.push(m); if (m[0] === 'welcome') p.welcome = m[1]; });
  p.ready = new Promise((ok) => ws.on('open', () => { ws.send(JSON.stringify(['hello', { name, pass }])); ok(); }));
  p.send = (m) => ws.send(JSON.stringify(m));
  p.waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = p.msgs.find(fn); if (m) return m; await sleep(30); } return null; };
  return p;
}
const pose = (x, z) => ({ x, y: 0.45, z, yaw: 0, pitch: 0, held: null, ui: null, mv: 0, sw: 0, eat: 0, veh: null, hn: 0, ar: [null, null, null, null], sit: 0, fly: 0, flyT: 0, alive: true, cr: 0, set: null, hp: 100 });

test('server: password, welcome, shared edits, mobs, save and restart', { timeout: 60000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louka-srv-'));
  let srv = await startServer({ DATA_DIR: dataDir, ROOM_PASSWORD: 'tajne', SAVE_SECONDS: '1' });
  try {
    const bad = player(srv.port, 'Zloděj', 'spatne');
    await bad.ready;
    assert.ok(await bad.waitFor((m) => m[0] === 'denied'), 'wrong password is denied');

    const a = player(srv.port, 'Ája', 'tajne'), b = player(srv.port, 'Bára', 'tajne');
    await a.ready;
    assert.ok(await a.waitFor((m) => m[0] === 'welcome'), 'welcome for Ája');
    assert.equal(a.welcome.name, 'Ája');
    assert.ok(Array.isArray(a.welcome.world.blocks) && typeof a.welcome.world.dayTime === 'number', 'welcome carries the world');
    assert.deepEqual(a.welcome.spawn, [1.5, 0.95, 15.5]);
    await b.ready;
    assert.ok(await b.waitFor((m) => m[0] === 'welcome'));
    assert.ok(await a.waitFor((m) => m[0] === 'join' && m[1] === 'Bára'), 'Ája hears that Bára joined');

    a.send(['pose', pose(0, 14)]);
    b.send(['pose', pose(3, 14)]);
    assert.ok(await b.waitFor((m) => m[0] === 'pl' && m[1].some((p) => p[1] === 'Ája' && p[2]?.x === 0)), 'Bára sees Ája\'s position');

    a.send(['ops', 0, [['m', 'blocks', '2,1,20', 'bricks']]]);
    assert.ok(await b.waitFor((m) => m[0] === 'ops' && m[1].some((o) => o[2] === '2,1,20')), 'block from Ája reaches Bára');
    a.send(['kv', [['chests', '2,1,20', [{ id: 'apple', n: 3 }, ...Array(26).fill(null)]]]]);
    assert.ok(await b.waitFor((m) => m[0] === 'kv' && m[1].some(([mp, k, v]) => mp === 'chests' && v?.[0]?.id === 'apple')), 'chest contents reach Bára');
    b.send(['ops', 1, [['m', 'blocks', '3,1,20', 'planks']]]);
    assert.ok(await b.waitFor((m) => m[0] === 'perm' && m[1] === false), 'creative edits without permission are refused');

    const mobsMsg = await a.waitFor((m) => m[0] === 'mobs' && m[3].length > 0, 12000);
    assert.ok(mobsMsg, 'animals spawn around the players and are sent');
    const mob = mobsMsg[3][0];
    a.send(['hit', mob[0], 20, 0]);
    assert.ok(await a.waitFor((m) => m[0] === 'mobs' && m[3].some((x) => x[0] === mob[0] && x[8] === 1)), 'a hit from a player kills the mob on the server');
    a.send(['chat', 'Ahoj']);
    assert.ok(await b.waitFor((m) => m[0] === 'chat' && m[1] === 'Ája' && m[2] === 'Ahoj'));
    b.ws.close();
    assert.ok(await a.waitFor((m) => m[0] === 'leave' && m[1] === 'Bára'));
    await sleep(1500); // uložení každou sekundu
    a.ws.close();
  } finally {
    await stop(srv);
  }
  assert.ok(fs.existsSync(path.join(dataDir, 'world.json')), 'world.json written');
  assert.ok(fs.readdirSync(path.join(dataDir, 'backups')).length === 1, 'daily backup written');
  srv = await startServer({ DATA_DIR: dataDir, ROOM_PASSWORD: 'tajne' });
  try {
    const c = player(srv.port, 'Cyril', 'tajne');
    await c.ready;
    await c.waitFor((m) => m[0] === 'welcome');
    assert.ok(c.welcome.world.blocks.some(([k, v]) => k === '2,1,20' && v === 'bricks'), 'the block survives a server restart');
    assert.equal(c.welcome.world.chests['2,1,20']?.[0]?.id, 'apple', 'the chest survives a server restart');
    assert.ok(!c.welcome.world.blocks.some(([k]) => k === '3,1,20'), 'refused block was not saved');
    c.ws.close();
  } finally {
    await stop(srv);
  }
});
