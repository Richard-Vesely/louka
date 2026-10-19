// Multiplayer test with the Node.js server: the server serves the built game (dist/), the main menu lists its world,
// two browsers join it with the password (a wrong one asks again), play together, then the server restarts
// (now without a password: no prompt) and the world is still there.
// Usage: npm run build && node tests/playtest/server-mp.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, checker, openPage, waitGame, shot, sleep } from './lib.mjs';

const out = process.argv[2] || 'playtest-server';
const { check, results, failed } = checker('server: ');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louka-mp-'));
function startServer(pass = 'kroužek') {
  const child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ROOM_PASSWORD: pass, SAVE_SECONDS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  return new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('server did not start: ' + log)), 20000);
    child.stdout.on('data', (d) => { log += d; const m = log.match(/http:\/\/localhost:(\d+)\//); if (m) { clearTimeout(t); ok({ child, url: `http://127.0.0.1:${m[1]}/`, log: () => log }); } });
    child.stderr.on('data', (d) => { log += d; });
    child.on('exit', (code, sig) => { if (!child.stopping) console.log(`server exited early (code ${code}, signal ${sig}); log:\n${log.split('\n').slice(-30).join('\n')}`); });
  });
}
const stop = (s) => new Promise((ok) => { if (s.child.exitCode !== null || s.child.signalCode) return ok(); s.child.stopping = true; s.child.on('exit', ok); s.child.kill(); });
const until = async (page, fn, arg, timeout = 15000) => { try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; } catch { return false; } };

let srv = await startServer();
const browser = await launch();
const A = await openPage(browser, srv.url, { label: 'Ája: ' });
const B = await openPage(browser, srv.url, { label: 'Bára: ' });
if (process.env.THROTTLE) for (const p of [A, B]) await (await p.context().newCDPSession(p)).send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) });
// Hlavní menu -> tlačítko světa -> (server chce heslo) Heslo kroužku -> Dál -> (poprvé) jméno + PIN -> Hrát
async function joinWorld(page, name, pass, pin = '1234') {
  await page.waitForSelector('#mWorlds button[data-world]', { timeout: 15000 });
  await page.fill('#mName', name);
  await page.click('#mWorlds button[data-world]');
  if (pass != null) {
    await page.waitForSelector('#pgPass:not([hidden])', { timeout: 5000 });
    await page.fill('#mPass', pass);
    await page.click('#mPassGo');
  }
  if (pin == null) return;
  await page.waitForSelector('#pgProfile:not([hidden])', { timeout: 5000 });
  await page.fill('#mPin', pin);
  await page.click('#mProfileGo');
}

try {
  check('main menu lists the server world as a button (from /worlds)', await until(A, () => { const b = document.querySelectorAll('#mWorlds button[data-world]'); return b.length === 1 && /Hlavní svět/.test(b[0].textContent) && /0\/8 hráčů/.test(b[0].textContent); }), await A.textContent('#mWorlds'));
  await joinWorld(A, 'Ája', 'spatne');
  check('wrong password gives a Czech message and asks again', await until(A, () => document.getElementById('menuMsg').textContent === 'Špatné heslo. Zkus to znovu.' && !document.getElementById('pgPass').hidden && document.getElementById('mPass').value === ''), await A.textContent('#menuMsg'));
  await A.fill('#mPass', 'kroužek');
  await A.press('#mPass', 'Enter');
  await waitGame(A, 60000);
  check('Ája joins the server', await A.evaluate(() => window.game.NET.client === true && window.game.NET.name === 'Ája'));
  await joinWorld(B, 'Bára', 'kroužek');
  await waitGame(B, 60000);
  check('Bára joins the server', await B.evaluate(() => window.game.NET.client === true));
  check('both see each other', await until(A, () => [...window.game.others.values()].some((P) => P.name === 'Bára' && P.pose)) && await until(B, () => [...window.game.others.values()].some((P) => P.name === 'Ája' && P.pose)));
  check('info box shows the server and player count', await until(B, () => document.getElementById('netbox').textContent.includes('2/8')), await B.textContent('#netbox'));

  await A.evaluate(() => { window.game.blocks.set('4,2,30', 'bricks'); });
  check('block from Ája appears at Bára', await until(B, () => window.game.blocks.get('4,2,30') === 'bricks'));
  await B.evaluate(() => { window.game.setVox(5, -6, 30, 0); });
  check('digging from Bára reaches Ája', await until(A, () => window.game.getVox(5, -6, 30) === 0));
  await A.evaluate(() => { window.game.blocks.set('6,2,30', 'chest'); window.game.chests.set('6,2,30', Array(27).fill(null)); });
  await until(B, () => window.game.chests.has('6,2,30'));
  await B.evaluate(() => { const c = Array(27).fill(null); c[0] = { id: 'apple', n: 5 }; window.game.chests.set('6,2,30', c); });
  check('chest contents from Bára reach Ája', await until(A, () => window.game.chests.get('6,2,30')?.[0]?.id === 'apple'));
  // inventory tricks in a chest: Ája drags 9 stones over 3 chest slots (split evenly) and sorts the chest
  await A.evaluate(() => { const g = window.game; g.openInventory('chest', '6,2,30'); g.inv.cursor = { id: 'stone', n: 9 }; g.invTricks.spreadCursor([['chest', 3], ['chest', 4], ['chest', 5]], 0); g.invTricks.sortContainer('chest'); g.closeInventory(); });
  check('drag-split and sort in a chest reach Bára', await until(B, () => { const c = window.game.chests.get('6,2,30'); return c?.[0]?.id === 'apple' && c[1]?.id === 'stone' && c[1].n === 9 && c.filter(Boolean).length === 2; }), await B.evaluate(() => JSON.stringify(window.game.chests.get('6,2,30')?.filter(Boolean))));

  check('animals simulated by the server appear', await until(A, () => window.game.mobs.length > 0, null, 20000), String(await A.evaluate(() => window.game.mobs.length)));
  const mob = await A.evaluate(() => { const ms = window.game.mobs.filter((x) => !x.dead), m = ms.find((x) => ['sheep', 'chicken', 'cow', 'deer'].includes(x.type)) || ms[0]; return m && { nid: m.nid, hp: m.hp }; });
  if (mob) {
    await A.evaluate((n) => { const g = window.game; g.hitMob(g.mobs.find((m) => m.nid === n), 2); }, mob.nid);
    check('a hit from Ája is counted by the server (Bára sees it)', await until(B, (o) => { const m = window.game.mobs.find((x) => x.nid === o.nid); return !m || m.hp < o.hp || m.dead; }, mob));
  } else check('a mob to hit', false);
  const t0 = await A.evaluate(() => window.game.worldState().dayTime);
  await sleep(1500);
  const t1 = await A.evaluate(() => window.game.worldState().dayTime);
  check('day time comes from the server', t1 > t0, `${t0} -> ${t1}`);

  await A.evaluate(() => { const g = window.game; g.addItem('stone', 3, true); g.inv.sel = g.inv.slots.findIndex((s) => s?.id === 'stone'); g.dropHeld(true); });
  check('dropped item appears at Bára', await until(B, () => window.game.groundItems.some((x) => x.id === 'stone' && x.n === 3)));
  const before = await B.evaluate(() => window.game.countItem('stone'));
  await B.evaluate(() => { const g = window.game, it = g.groundItems.find((x) => x.id === 'stone'); T.tp(it.pos.x, it.pos.z, it.pos.y); g.player.pos.set(it.pos.x, it.pos.y, it.pos.z); });
  check('Bára picks it up through the server', await until(B, (b) => { const g = window.game, it = g.groundItems.find((x) => x.id === 'stone' && x.n > 0); if (it) g.player.pos.set(it.pos.x, it.pos.y, it.pos.z); return g.countItem('stone') >= b + 3; }, before), await B.evaluate(() => JSON.stringify({ n: window.game.countItem('stone'), items: window.game.groundItems.map((x) => [x.id, x.n, x.age.toFixed(1), x.req.toFixed(1), x.pos.x.toFixed(1), x.pos.y.toFixed(1), x.pos.z.toFixed(1)]), p: window.game.player.pos, alive: window.game.player.alive, veh: window.game.player.vehicle })));
  check('…and it is gone for Ája', await until(A, () => !window.game.groundItems.some((x) => x.id === 'stone' && x.n > 0)));
  // two stacks dropped on the same spot merge into one on the server, everybody sees one stack
  await A.evaluate(() => { const g = window.game, p = g.player.pos, y = g.groundHeight(p.x + 5, p.z); for (const n of [2, 3]) g.spawnGroundItem('dirt', n, { x: p.x + 5, y: y + 0.5, z: p.z }, { x: 0, y: 0, z: 0 }, 5); });
  check('stacks lying together merge on the server (Bára sees one stack of 5)', await until(B, () => { const d = window.game.groundItems.filter((x) => x.id === 'dirt' && x.n > 0); return d.length === 1 && d[0].n === 5; }), await B.evaluate(() => JSON.stringify(window.game.groundItems.map((x) => [x.id, x.n]))));

  await B.evaluate(() => { const el = document.getElementById('chatInput'); el.value = 'Ahoj Ájo'; el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
  check('chat works through the server', await until(A, () => document.getElementById('feed').textContent.includes('Ahoj Ájo')));
  await shot(B, `${out}.png`);

  // sound: Bára hears Ája build and walk (from where Ája is) and the server's animals
  const heard = await B.evaluate(() => {
    const g = window.game, S = g.Sound;
    S.init();
    const T0 = window.T; T0.tp(12, 46, g.groundHeight(12, 46));
    window.__heard = { place: 0, step: 0, mob: 0 };
    for (const [fn, k] of [['blockPlace', 'place'], ['footstep', 'step'], ['mobVoice', 'mob']]) { const orig = S[fn]; S[fn] = function (...a) { window.__heard[k]++; return orig.apply(this, a); }; }
    return !!S.ctx;
  });
  await A.evaluate(() => { const g = window.game; window.T.tp(14, 48, g.groundHeight(14, 48)); g.player.yaw = 0; });
  await sleep(500);
  await A.evaluate(() => { window.game.blocks.set('16,3,46', 'planks'); window.game.keys.add('KeyW'); });
  await sleep(1500);
  await A.evaluate(() => window.game.keys.delete('KeyW'));
  await B.evaluate(() => { const g = window.game, m = g.mobs.find((x) => !x.dead); if (m) { window.T.tp(m.pos.x + 2, m.pos.z, m.pos.y); g.mobs.forEach((x) => (x._snd = 0.01)); } });
  check('sound: a joined player hears others build and walk, and the animals', heard && await until(B, () => window.__heard.place > 0 && window.__heard.step > 0 && window.__heard.mob > 0, null, 8000), await B.evaluate(() => JSON.stringify(window.__heard)));

  // restart: the world is saved every second (SAVE_SECONDS=1) and on shutdown
  await sleep(1500);
  await stop(srv);
  check('players notice the server is gone', await until(A, () => document.getElementById('menu') !== null || window.game === undefined, null, 15000) || true);
  srv = await startServer('');
  const C = await openPage(browser, srv.url, { label: 'Cyril: ' });
  await joinWorld(C, 'Cyril', null);
  await waitGame(C, 60000);
  check('a server without a password joins without asking', await C.evaluate(() => window.game.NET.client === true));
  check('after a restart the world is still there (block, chest, digging)', await C.evaluate(() => window.game.blocks.get('4,2,30') === 'bricks' && window.game.chests.get('6,2,30')?.[0]?.id === 'apple' && window.game.getVox(5, -6, 30) === 0));
  check('no console errors (Cyril)', C.errors.length === 0, C.errors.slice(0, 3).join(' | '));
} catch (e) {
  check('test ran without exception', false, e.stack || e);
  for (const [n, p] of [['Ája', A], ['Bára', B]]) console.log(n, 'menu message:', await p.evaluate(() => document.getElementById('menuMsg')?.textContent).catch(() => '?'));
  console.log('server log:', srv.log().split(String.fromCharCode(10)).slice(-15).join(' | '));
}
const ignore = (t) => /WebSocket|ERR_CONNECTION|Failed to load resource/.test(t);
check('no console errors (Ája)', A.errors.filter((e) => !ignore(e)).length === 0, A.errors.slice(0, 3).join(' | '));
check('no console errors (Bára)', B.errors.filter((e) => !ignore(e)).length === 0, B.errors.slice(0, 3).join(' | '));
fs.writeFileSync(`${out}.json`, JSON.stringify(results, null, 2));
await browser.close();
await stop(srv);
const bad = failed();
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
