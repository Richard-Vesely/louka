// Multiplayer test with two worlds on one Node.js server (WORLDS): the menu shows the worlds, two browsers join
// different worlds and don't see each other's blocks, players or chat; creative only in the creative world;
// the backpack is saved per world (the first world also reads the old single-world key); the last choice is remembered.
// Usage: npm run build && node tests/playtest/server-worlds.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, checker, openPage, waitGame, sleep } from './lib.mjs';

const out = process.argv[2] || 'playtest-worlds';
const { check, results, failed } = checker('worlds: ');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louka-worlds-'));
function startServer() {
  const env = { ...process.env, PORT: '0', DATA_DIR: dataDir, ROOM_PASSWORD: 'kroužek', SAVE_SECONDS: '1', WORLDS: 'svet:Hlavní svět,kreativ:Kreativní svět:creative' };
  const child = spawn(process.execPath, ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  return new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('server did not start: ' + log)), 20000);
    child.stdout.on('data', (d) => { log += d; const m = log.match(/http:\/\/localhost:(\d+)\//); if (m) { clearTimeout(t); ok({ child, port: m[1], url: `http://127.0.0.1:${m[1]}/`, log: () => log }); } });
    child.stderr.on('data', (d) => { log += d; });
    child.on('exit', (code, sig) => { if (!child.stopping) console.log(`server exited early (code ${code}, signal ${sig}); log:\n${log.split('\n').slice(-30).join('\n')}`); });
  });
}
const stop = (s) => new Promise((ok) => { if (s.child.exitCode !== null || s.child.signalCode) return ok(); s.child.stopping = true; s.child.on('exit', ok); s.child.kill(); });
const until = async (page, fn, arg, timeout = 15000) => { try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; } catch { return false; } };
// Hlavní menu -> "Hrát na serveru" -> heslo -> Připojit -> výběr světa
async function toWorlds(page, name) {
  await page.waitForSelector('#mServer:not([hidden])', { timeout: 10000 });
  await page.fill('#mName', name);
  await page.click('#mServer');
  await page.waitForSelector('#pgJoin:not([hidden])', { timeout: 5000 });
  await page.fill('#mPass', 'kroužek');
  await page.click('#mJoinGo');
  return until(page, () => !document.getElementById('pgWorlds').hidden);
}
const worldButtons = (page) => page.$$eval('#mWorlds button', (bs) => bs.map((b) => ({ id: b.dataset.world, text: b.textContent, on: b.classList.contains('on'), focus: document.activeElement === b })));

const srv = await startServer();
const wsKey = `rise-klient-ws://127.0.0.1:${srv.port}/ws`;
const browser = await launch();
const A = await openPage(browser, srv.url, { label: 'Ája: ' });
const B = await openPage(browser, srv.url + '?world=kreativ', { label: 'Bára: ' });
// Uložení z doby jednoho světa (starý klíč): první svět ho převezme, druhý ne.
for (const p of [A, B]) await p.evaluate(([k]) => localStorage.setItem(k, JSON.stringify({ pos: [40.5, 3, 40.5] })), [wsKey]);

try {
  check('the server offers the world list', await toWorlds(A, 'Ája'));
  const list = await worldButtons(A);
  check('two world buttons with names, creative label and players', list.length === 2 && /Hlavní svět/.test(list[0].text) && /0\/8 hráčů/.test(list[0].text) && !/kreativní/.test(list[0].text) && /Kreativní svět/.test(list[1].text) && /kreativní/.test(list[1].text), JSON.stringify(list));
  await A.click('#mWorlds button[data-world="svet"]');
  await waitGame(A, 60000);
  check('Ája joins the survival world', await A.evaluate(() => window.game.NET.client && window.game.NET.worldName === 'Hlavní svět' && !window.game.NET.perm));
  check('the first world takes over the old single-world save', await A.evaluate(() => Math.abs(window.game.player.pos.x - 40.5) < 3 && Math.abs(window.game.player.pos.z - 40.5) < 3), await A.evaluate(() => window.game.player.pos.toArray().map((v) => v.toFixed(1)).join(',')));

  check('Bára gets the world list', await toWorlds(B, 'Bára'));
  const listB = await worldButtons(B);
  check('?world=kreativ preselects the creative world', listB.find((b) => b.id === 'kreativ')?.on && listB.find((b) => b.id === 'kreativ')?.focus, JSON.stringify(listB));
  check('the list shows Ája in the survival world', /1\/8 hráčů/.test(listB[0].text), listB[0].text);
  await B.keyboard.press('Enter');
  await waitGame(B, 60000);
  check('Bára joins the creative world', await B.evaluate(() => window.game.NET.worldName === 'Kreativní svět' && window.game.NET.perm === true));
  check('the second world ignores the old save', await B.evaluate(() => Math.hypot(window.game.player.pos.x - 40.5, window.game.player.pos.z - 40.5) > 5));
  check('info box shows the world name', await until(A, () => /Hlavní svět · 1\/8/.test(document.getElementById('netbox').textContent)) && await until(B, () => /Kreativní svět · 1\/8/.test(document.getElementById('netbox').textContent)), await B.textContent('#netbox'));

  await A.evaluate(() => { window.game.blocks.set('4,2,30', 'bricks'); });
  await B.evaluate(() => { window.game.blocks.set('5,2,30', 'glass'); });
  await B.evaluate(() => { const el = document.getElementById('chatInput'); el.value = 'Ahoj z kreativu'; el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
  await B.evaluate(() => window.game.setCreative(true));
  await A.evaluate(() => window.game.setCreative(true));
  check('creative is switched off again in the survival world', await until(A, () => !window.game.creative));
  await sleep(2500);
  check('creative stays on in the creative world', await B.evaluate(() => window.game.creative === true));
  check('blocks stay in their world', await A.evaluate(() => !window.game.blocks.has('5,2,30')) && await B.evaluate(() => !window.game.blocks.has('4,2,30')));
  check('players of the other world are not shown', await A.evaluate(() => window.game.others.size === 0) && await B.evaluate(() => window.game.others.size === 0));
  check('chat stays in its world', !(await A.textContent('#feed')).includes('Ahoj z kreativu'));

  await A.evaluate(() => window.game.saveGame());
  await B.evaluate(() => window.game.saveGame());
  check('the backpack is saved per world', await A.evaluate((k) => !!localStorage.getItem(k + '#svet'), wsKey) && await B.evaluate((k) => !!localStorage.getItem(k + '#kreativ'), wsKey));

  // znovu do menu: výběr si pamatuje naposledy zvolený svět
  await A.reload({ waitUntil: 'domcontentloaded' });
  check('after leaving, the menu remembers the last world', await toWorlds(A, 'Ája') && (await worldButtons(A)).find((b) => b.id === 'svet')?.on);
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
