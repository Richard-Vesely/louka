// End-to-end multiplayer test: a real server (serving client/dist) and two real browsers.
// Usage: node tests/playtest/multiplayer.mjs   (after npm run build)
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server/src/server.js';
import { addItem } from '@louka/shared/game/inventory.js';

const dist = path.resolve('client/dist');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louka-mp-'));
const opts = { password: 'kroužek', dataDir, staticDir: dist, log: () => {} };
let srv = await startServer({ ...opts, port: 0 });
const port = srv.port, url = `http://127.0.0.1:${port}/`;

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? '  — ' + detail : ''}`); };
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const serverPlayer = (name) => [...srv.room.game.players.values()].find((p) => p.name === name);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function openPlayer(name) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  await ctx.addInitScript(() => {
    window.__skipDraw = true;
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!C) continue;
      for (const fn of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) {
        const orig = C.prototype[fn];
        if (orig) C.prototype[fn] = function (...a) { if (window.__skipDraw) return; return orig.apply(this, a); };
      }
    }
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket connection|ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  await page.goto(url);
  await page.waitForFunction(() => window.gameStarted === true, null, { timeout: 120000, polling: 100 });
  await page.evaluate(() => { window.__notices = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) window.__notices.push(n.textContent); }).observe(document.getElementById('notices'), { childList: true }); });
  return page;
}
const joinAs = async (page, name, password) => {
  await page.fill('#joinName', name);
  await page.fill('#joinPass', password);
  await page.click('#joinGo');
};

const a = await openPlayer('Ája'), b = await openPlayer('Bára');
check('join screen is shown in Czech', (await a.textContent('#joinGo')) === 'Hrát spolu' && await a.isVisible('#join'));
await joinAs(a, 'Ája', 'spatne');
await a.waitForFunction(() => document.getElementById('joinMsg').textContent.length > 0 && !document.getElementById('joinGo').disabled, null, { polling: 100 });
check('wrong password shows a Czech error', (await a.textContent('#joinMsg')) === 'Špatné heslo.', await a.textContent('#joinMsg'));

await joinAs(a, 'Ája', 'kroužek');
await a.waitForFunction(() => window.game.net.mode === 'online', null, { polling: 100 });
await joinAs(b, 'Bára', 'kroužek');
await b.waitForFunction(() => window.game.net.mode === 'online', null, { polling: 100 });
check('both players are online, join screen hidden', !(await a.isVisible('#join')) && !(await b.isVisible('#join')));
await a.waitForFunction(() => window.__notices.includes('👋 Bára je ve hře'), null, { timeout: 3000, polling: 100 });
check('A gets a join message for B', true);

// B walks; A sees B's avatar move there.
await b.evaluate(async () => { // walk at ~4 m/s, like a player
  const p = window.game.player.pos, from = p.clone();
  for (let i = 1; i <= 10; i++) { p.set(from.x + (3 - from.x) * i / 10, 0.45, from.z + (12 - from.z) * i / 10); await new Promise((ok) => setTimeout(ok, 110)); }
});
await a.waitForFunction(() => { const o = [...window.game.others.values()].find((q) => q.name === 'Bára'); return o && Math.abs(o.pos.x - 3) < 0.05 && Math.abs(o.pos.z - 12) < 0.05; }, null, { timeout: 3000, polling: 100 });
check('A sees B move (interpolated avatar)', true);

// A places a block; B sees it.
addItem(serverPlayer('Ája'), 'planks', 5);
await a.waitForFunction(() => window.game.countItem('planks') === 5, null, { timeout: 2000, polling: 100 });
check('server gives A planks, A sees them in the hotbar', (await a.$$eval('#hotbar .slot img', (els) => els.length)) >= 1);
const t0 = Date.now();
await a.evaluate(() => { window.game.net.act({ t: 'select', i: 0 }); window.game.net.act({ t: 'place', cell: [1, 0, 11] }); });
await b.waitForFunction(() => window.game.blocks.get('1,0,11') === 'planks', null, { timeout: 2000, polling: 100 });
const ms = Date.now() - t0;
check('block placed by A appears for B', ms < 1000, `${ms} ms incl. browser polling`);

// Mobs are server-controlled: both see the same sheep in the same place.
srv.room.game.spawnMob('sheep', 6, 20);
await a.waitForFunction(() => window.game.mobs.some((m) => m.type === 'sheep'), null, { timeout: 3000, polling: 100 });
await sleep(400);
const [pa, pb] = await Promise.all([a, b].map((p) => p.evaluate(() => { const m = window.game.mobs.find((q) => q.type === 'sheep'); return m && [m.id, m.pos.x, m.pos.z]; })));
check('both players see the same sheep at the same place', pa && pb && pa[0] === pb[0] && Math.hypot(pa[1] - pb[1], pa[2] - pb[2]) < 1, JSON.stringify({ pa, pb }));

// Screenshot from A, looking at B.
await a.evaluate(() => { const g = window.game, o = [...g.others.values()][0]; g.player.yaw = Math.atan2(-(o.pos.x - g.player.pos.x), -(o.pos.z - g.player.pos.z)); window.__skipDraw = false; });
await sleep(1500);
await a.screenshot({ path: path.join(os.tmpdir(), 'louka-mp.png') });
await a.evaluate(() => { window.__skipDraw = true; });

// Server restart: clients show the Czech message and reconnect by themselves.
await srv.close();
await a.waitForFunction(() => document.getElementById('netStatus').textContent === 'Spojení ztraceno — připojuji znovu…' && document.getElementById('netStatus').style.display === 'grid', null, { timeout: 5000, polling: 100 });
check('connection lost message shown', true);
srv = await startServer({ ...opts, port });
await a.waitForFunction(() => document.getElementById('netStatus').style.display === 'none' && window.game.net.mode === 'online', null, { timeout: 15000, polling: 100 });
await b.waitForFunction(() => document.getElementById('netStatus').style.display === 'none', null, { timeout: 15000, polling: 100 });
check('both reconnect automatically after a server restart', true);
await a.waitForFunction(() => window.game.countItem('planks') === 4, null, { timeout: 3000, polling: 100 }).catch(() => {});
const after = await a.evaluate(() => ({ block: window.game.blocks.get('1,0,11'), planks: window.game.countItem('planks') }));
check('after restart: block still there, A still has 4 planks', after.block === 'planks' && after.planks === 4, JSON.stringify(after));

// B leaves and comes back: same position.
const posB = await b.evaluate(() => window.game.player.pos.toArray().map((v) => +v.toFixed(1)));
await b.close({ runBeforeUnload: true }); // like closing the tab
await b.context().close();
// A closed tab sends a close frame; a crashed browser is noticed by the server heartbeat within 10 s.
await a.waitForFunction(() => window.__notices.includes('Bára už není ve hře'), null, { timeout: 15000, polling: 100 });
check('A gets a leave message for B', true);
const b2 = await openPlayer('Bára2');
await joinAs(b2, 'Bára', 'kroužek');
await b2.waitForFunction(() => window.game.net.mode === 'online', null, { polling: 100 });
const posB2 = await b2.evaluate(() => window.game.player.pos.toArray().map((v) => +v.toFixed(1)));
check('B rejoins in a new browser at the same position', JSON.stringify(posB2) === JSON.stringify(posB), `${posB} -> ${posB2}`);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
await srv.close();
fs.rmSync(dataDir, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
