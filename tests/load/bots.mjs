// Load test of the Node server: N simulated players (WebSocket bots) walk around, build, use chests and hit mobs.
// Measures the server's memory (RSS), CPU and the time of one world step, like on a small VPS.
// Usage: node tests/load/bots.mjs [players=8] [seconds=60] [worlds=1]   (worlds > 1: players are spread over the worlds)
// The server runs with --max-old-space-size=384 (the same as deploy/louka.service).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const N = Number(process.argv[2] || 8), SECONDS = Number(process.argv[3] || 60), WORLDS = Number(process.argv[4] || 1);
const worldIds = Array.from({ length: WORLDS }, (_, i) => `w${i + 1}`);
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louka-load-'));
const child = spawn(process.execPath, ['--max-old-space-size=384', 'server/index.js'], { env: { ...process.env, PORT: '0', DATA_DIR: dataDir, STATIC_DIR: '', MAX_PLAYERS: String(Math.max(8, N)), ...(WORLDS > 1 ? { WORLDS: worldIds.map((id, i) => `${id}:Svět ${i + 1}`).join(',') } : {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
const port = await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error(log)), 20000);
  child.stdout.on('data', (d) => { log += d; const m = log.match(/http:\/\/localhost:(\d+)\//); if (m) { clearTimeout(t); ok(Number(m[1])); } });
  child.stderr.on('data', (d) => { log += d; });
});
const health = async () => (await fetch(`http://127.0.0.1:${port}/health`)).json();

const bots = [];
for (let i = 0; i < N; i++) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  // každý hráč se toulá kolem vlastního místa (60 m od sebe), aby se kolem každého rodili tvorové
  const bot = { ws, i, x: Math.cos(i) * 60 * (i > 0), z: 20 + Math.sin(i) * 60 * (i > 0), a: Math.random() * 6, bytes: 0, mobs: [] };
  ws.on('message', (raw) => {
    bot.bytes += raw.length;
    const m = JSON.parse(raw.toString());
    if (m[0] === 'mobs') bot.mobs = m[3];
  });
  ws.on('open', () => ws.send(JSON.stringify(['hello', { name: `Bot ${i + 1}`, v: 2, world: worldIds[i % WORLDS] }])));
  bots.push(bot);
  await sleep(150);
}
const send = (b, m) => { if (b.ws.readyState === 1) b.ws.send(JSON.stringify(m)); };
let t = 0;
const loop = setInterval(() => {
  t += 1 / 12;
  for (const b of bots) {
    b.a += (Math.random() - 0.5) * 0.3;
    b.x += Math.cos(b.a) * 0.35; b.z += Math.sin(b.a) * 0.35; // ~4 m/s
    send(b, ['pose', { x: b.x, y: 0.5, z: b.z, yaw: b.a, pitch: 0, held: 'stone', ui: null, mv: 4, sw: 0, eat: 0, veh: null, hn: 0, ar: [null, null, null, null], sit: 0, fly: 0, flyT: 0, alive: true, cr: 0, set: null, hp: 100 }]);
    if (Math.random() < 1 / 24) { const k = `${Math.floor(b.x)},2,${Math.floor(b.z)}`; send(b, ['ops', 0, [['m', 'blocks', k, Math.random() < 0.5 ? 'planks' : null]]]); }
    if (Math.random() < 1 / 60) send(b, ['kv', [['chests', `chest-${b.i}`, Array.from({ length: 27 }, () => (Math.random() < 0.3 ? { id: 'stone', n: 5 } : null))]]]);
    if (Math.random() < 1 / 12 && b.mobs.length) send(b, ['hit', b.mobs[Math.floor(Math.random() * b.mobs.length)][0], 1, 0]);
  }
}, 1000 / 12);

const samples = [];
await sleep(5000); // rozjezd
const h0 = await health(), t0 = Date.now(), bytes0 = bots[0].bytes;
for (let s = 0; s < SECONDS; s += 5) { await sleep(5000); samples.push(await health()); }
const h1 = samples[samples.length - 1], wall = (Date.now() - t0) / 1000;
clearInterval(loop);
for (const b of bots) b.ws.close();
await sleep(300);
child.kill();
const r = {
  players: h1.players, worlds: (h1.worlds || []).map((w) => `${w.id}: ${w.players} players, step ${w.tickMs.avg} ms avg / ${w.tickMs.max} max, heap ${w.heapMB} MB`), seconds: Math.round(wall),
  rssMB: { start: h0.rssMB, max: Math.max(...samples.map((x) => x.rssMB)), end: h1.rssMB },
  heapMB: Math.max(...samples.map((x) => x.heapMB)),
  cpuPercent: Math.round(((h1.cpuSec - h0.cpuSec) / wall) * 1000) / 10,
  tickMs: { avg: Math.round((samples.reduce((a, x) => a + x.tickMs.avg, 0) / samples.length) * 100) / 100, max: Math.max(...samples.map((x) => x.tickMs.max)), budget: h1.tickMs.budget },
  kBps_per_player_down: Math.round(((bots[0].bytes - bytes0) / wall / 1024) * 10) / 10,
  mobsSeenByBot1: bots[0].mobs.length,
};
console.log(JSON.stringify(r, null, 2));
