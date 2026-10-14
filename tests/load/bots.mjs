// Load test: N simulated players walk around, cut grass and ping. Measures bandwidth per player.
// Usage:
//   node tests/load/bots.mjs                         in-process server, 6 bots, 60 s, at night (worst case: mobs)
//   node tests/load/bots.mjs --bots 6 --seconds 900  15-minute soak
//   node tests/load/bots.mjs --url wss://hry.example.cz --password tajne   against a real server
import { startServer } from '../../server/src/server.js';
import { groundHeight } from '@louka/shared/terrain.js';
import { TestClient } from '../helpers/ws-client.mjs';

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const BOTS = Number(arg('bots', 6)), SECONDS = Number(arg('seconds', 60)), WARMUP = 5;
const password = arg('password', 'bots');
let url = arg('url', null), srv = null;
const tickMs = [];
if (!url) {
  srv = await startServer({ port: 0, password, log: () => {} });
  url = `ws://127.0.0.1:${srv.port}`;
  if (!process.argv.includes('--day')) srv.room.game.world.time.dayTime = 0.8; // noc: stínožrouti
  const orig = srv.room.tick.bind(srv.room);
  srv.room.tick = (dt) => { const t = performance.now(); orig(dt); tickMs.push(performance.now() - t); };
}

const bots = [];
for (let i = 0; i < BOTS; i++) {
  const c = new TestClient(url);
  const w = await c.join(`Bot${i + 1}`, password);
  if (w.t !== 'welcome') { console.error('join failed:', w); process.exit(1); }
  // Bots stay in a 60 m area so they see each other and the same mobs (like a club playing together).
  c.pos = { x: 30 + (i % 3) * 8, z: 30 + Math.floor(i / 3) * 8 }; c.dir = Math.random() * 6.28; c.turnT = 0; c.cutT = 2 + i;
  bots.push(c);
}
console.log(`${BOTS} bots joined ${url}; warming up ${WARMUP} s, then measuring ${SECONDS} s…`);

let elapsed = 0, base = null;
const STEP = 0.1;
const timer = setInterval(() => {
  elapsed += STEP;
  for (const c of bots) {
    if ((c.turnT -= STEP) <= 0) { c.turnT = 2 + Math.random() * 3; c.dir = Math.random() * 6.28; }
    const nx = c.pos.x + Math.cos(c.dir) * 4.3 * STEP, nz = c.pos.z + Math.sin(c.dir) * 4.3 * STEP;
    if (Math.hypot(nx - 40, nz - 40) < 30 && Math.hypot(nx, nz) > 15) { c.pos.x = nx; c.pos.z = nz; } else c.dir += Math.PI;
    c.send({ t: 'move', p: [+c.pos.x.toFixed(2), +groundHeight(c.pos.x, c.pos.z).toFixed(2), +c.pos.z.toFixed(2)], yaw: +c.dir.toFixed(2), pitch: 0, sp: false });
    if ((c.cutT -= STEP) <= 0) { c.cutT = 4; c.send({ t: 'break', kind: 'ground', point: [c.pos.x + 1, groundHeight(c.pos.x + 1, c.pos.z), c.pos.z] }); }
    if (Math.round(elapsed * 10) % 20 === 0) c.send({ t: 'ping', c: performance.now() });
  }
  if (!base && elapsed >= WARMUP) { base = bots.map((c) => ({ in: c.bytesIn, out: c.bytesOut, msgs: c.msgs.length })); tickMs.length = 0; }
  if (elapsed >= WARMUP + SECONDS) finish();
}, STEP * 1000);

async function finish() {
  clearInterval(timer);
  const down = bots.map((c, i) => (c.bytesIn - base[i].in) / SECONDS / 1024);
  const up = bots.map((c, i) => (c.bytesOut - base[i].out) / SECONDS / 1024);
  const msgs = bots.map((c, i) => (c.msgs.length - base[i].msgs) / SECONDS);
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sorted = [...tickMs].sort((a, b) => a - b);
  const report = {
    bots: BOTS, seconds: SECONDS,
    downKBps: { avg: +avg(down).toFixed(2), max: +Math.max(...down).toFixed(2) },
    upKBps: { avg: +avg(up).toFixed(2), max: +Math.max(...up).toFixed(2) },
    serverMsgsPerSec: +avg(msgs).toFixed(1),
    mobsAtEnd: srv ? srv.room.game.mobs.length : undefined,
    serverTickMs: sorted.length ? { avg: +avg(sorted).toFixed(2), p99: +sorted[Math.floor(sorted.length * 0.99)].toFixed(2), max: +sorted.at(-1).toFixed(2) } : undefined,
  };
  console.log(JSON.stringify(report, null, 2));
  await Promise.all(bots.map((c) => c.close()));
  await srv?.close();
  process.exit(0);
}
