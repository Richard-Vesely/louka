// Play-test of single player ("Hrát sám") in a real browser, through the window.game debug API.
// Usage: node tests/playtest/playtest.mjs [dir-or-url] [out-prefix]
//   dir-or-url  default dist (run `npm run build` first); legacy/ tests Marek's original file
//   out-prefix  where to write <prefix>.json and <prefix>.png (default playtest-sp)
import path from 'node:path';
import fs from 'node:fs';
import { launch, serveDir, checker, openPage, waitGame, shot } from './lib.mjs';

const target = process.argv[2] || 'dist';
const out = process.argv[3] || 'playtest-sp';
const { check, results, failed } = checker();

let server = null, url = target;
if (!/^https?:/.test(target)) { server = await serveDir(path.resolve(target)); url = server.url; }
const browser = await launch();
const page = await openPage(browser, url);
const ev = (fn, arg) => page.evaluate(fn, arg);

try {
  // ------------------------------------------------------------ menu
  check('menu: title and buttons in Czech', (await page.textContent('#mSolo b')) === 'Hrát sám' && (await page.textContent('#mSolo small')) === 'Jen ty, svět se uloží v tomhle prohlížeči' && (await page.textContent('#mMore')) === 'Další možnosti' && (await page.textContent('#mSettings')) === 'Nastavení');
  const mainText = await page.innerText('#pgMain');
  check('menu: no technical words on the main page', !/server|kód|adres|websocket|peerjs/i.test(mainText), mainText);
  check('menu: no club server known -> no world buttons', await ev(() => document.getElementById('mWorlds').hidden));
  await page.click('#mMore');
  check('menu: Další možnosti offers host and join by code', (await page.isVisible('#pgMore')) && (await page.textContent('#mHost b')) === 'Vytvořit hru na svém počítači' && (await page.textContent('#mHost small')) === 'Kamarádi se připojí kódem, který uvidíš. Nech hru otevřenou.' && (await page.textContent('#mJoin b')) === 'Připojit se ke kamarádovi kódem');
  await page.click('#mJoin');
  await page.fill('#mCode', 'xx');
  await page.press('#mCode', 'Enter');
  check('menu: a bad code gives a Czech message', /LOUKA-7K2F/.test(await page.textContent('#menuMsg')) && await page.isVisible('#pgJoin'), await page.textContent('#menuMsg'));
  await page.click('#pgJoin [data-back]');
  await page.click('#pgMore [data-back]');
  check('menu: Zpět leads back to the main page', await page.isVisible('#pgMain') && !(await page.isVisible('#menuMsg')));
  // server kroužku nejde zastihnout: jeden neaktivní řádek, hra pro jednoho a Další možnosti fungují dál
  const off = await openPage(browser, url + '?server=127.0.0.1:9', { label: 'offline: ', ignore: [/Failed to load resource|ERR_CONNECTION|ERR_ADDRESS/] });
  const offOk = await off.waitForSelector('#mWorlds .world-off', { timeout: 15000 }).then(() => true, () => false);
  const offState = await off.evaluate(() => ({ n: document.querySelectorAll('#mWorlds button').length, text: document.querySelector('#mWorlds button')?.textContent, disabled: document.querySelector('#mWorlds button')?.disabled }));
  check('menu: unreachable club server shows one disabled line', offOk && offState.n === 1 && offState.text === 'Svět teď není dostupný, zkus to za chvíli nebo hraj sám.' && offState.disabled, JSON.stringify(offState));
  const soloOk = await off.isEnabled('#mSolo');
  await off.click('#mMore');
  check('menu: …and single player + Další možnosti still work', soloOk && await off.isVisible('#pgMore #mHost') && off.errors.length === 0, off.errors.join(' | '));
  await off.context().close();
  await page.fill('#mName', 'Tester');
  await page.click('#mSolo');
  await waitGame(page);
  check('single player starts (window.gameStarted)', true);
  await ev(() => {
    const g = window.game;
    T.tpg = (x, z) => { const y = g.groundHeight(x, z); T.tp(x, z, y); };
  });

  // ------------------------------------------------------------ HUD
  const clock = await ev(() => T.text('clock'));
  check('HUD: clock shows day, time and biome', /^Den 1 · \d\d:\d\d · Louka a les$/.test(clock), clock);
  check('HUD: first tip', (await ev(() => T.text('tipText'))).startsWith('Pokácej strom'), await ev(() => T.text('tipText')));
  check('HUD: hotbar has 9 slots', (await ev(() => document.querySelectorAll('#hotbar .slot').length)) === 9);
  check('HUD: compass markers', (await ev(() => document.querySelectorAll('#compass .m').length)) >= 31);
  check('intro shown on first start', await ev(() => document.getElementById('intro').style.display === 'grid'));
  check('name remembered', (await ev(() => localStorage.getItem('rise-jmeno'))) === 'Tester');

  // ------------------------------------------------------------ movement
  let r = await ev(() => { const g = window.game; T.tp(0, 14); const z0 = g.player.pos.z; g.keys.add('KeyW'); T.step(20); g.keys.delete('KeyW'); T.step(10); return { z0, z1: g.player.pos.z }; });
  check('walk forward (W)', r.z1 < r.z0 - 2, `${r.z0.toFixed(2)} -> ${r.z1.toFixed(2)}`);
  r = await ev(() => { const g = window.game; T.tp(0, 14); T.step(5); const y0 = g.player.pos.y; g.keys.add('Space'); T.step(4); g.keys.delete('Space'); const y1 = g.player.pos.y; T.step(40); return { y0, y1, y2: g.player.pos.y }; });
  check('jump and land', r.y1 > r.y0 + 0.3 && Math.abs(r.y2 - r.y0) < 0.05, JSON.stringify(r));
  r = await ev(() => { const g = window.game; T.press('Digit3'); return g.inv.sel; });
  check('number key selects hotbar slot', r === 2);

  // ------------------------------------------------------------ trees
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.holdNothing();
    T.tpg(0, 40); T.step(2);
    g.rebuildForest?.(g.player.pos.x, g.player.pos.z, true);
    const t = [...g.forestTrees].sort((a, b) => Math.hypot(a.x, a.z - 40) - Math.hypot(b.x, b.z - 40))[0];
    T.tpg(t.x + 1.6, t.z); T.step(10);
    T.aim(t.x, t.y + 1.2, t.z);
    const label = T.text('targetLabel');
    const n = T.mineUntil(() => T.count('log') > 0 || T.count('cherry_log') > 0);
    return { label, n, logs: T.count('log'), gone: !g.forestTrees.some((x) => x.key === t.key), removed: g.removed?.has?.(t.key) };
  });
  check('chop a tree by hand gives logs', r.logs >= 3, `${r.logs} logs in ${r.n} ticks, label "${r.label}"`);
  check('felled tree disappears', r.gone);

  // ------------------------------------------------------------ crafting
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.give('log', 2);
    T.press('KeyE');
    const open = document.getElementById('inventory').style.display === 'grid';
    const recipes = document.querySelectorAll('#recipes .slot').length;
    g.fillRecipe(g.RECIPES.find((x) => x.out === 'planks'), false); g.takeResult(false);
    const cursor = g.inv.cursor && { ...g.inv.cursor };
    T.press('KeyE');
    return { open, recipes, cursor, planks: T.count('planks'), closed: document.getElementById('inventory').style.display === 'none' };
  });
  check('E opens inventory with recipe book', r.open && r.recipes >= 15, `recipes: ${r.recipes}`);
  check('craft planks from a log', r.cursor?.id === 'planks' && r.cursor.n === 4 && r.planks === 4 && r.closed, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.give('planks', 4);
    T.press('KeyE');
    g.fillRecipe(g.RECIPES.find((x) => x.out === 'workbench'), false); g.takeResult(true);
    T.press('KeyE');
    return { bench: T.count('workbench'), planks: T.count('planks'), crafted: !!g.worldState && true };
  });
  check('craft a workbench (2x2)', r.bench === 1 && r.planks === 0, JSON.stringify(r));

  // ------------------------------------------------------------ building
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.give('planks', 10); T.hold('planks');
    T.tpg(6, 30); T.step(5);
    const x = 6.5, z = 27.5, y = g.groundHeight(x, z);
    T.aim(x, y, z);
    const before = g.blocks.size, old = new Set(g.blocks.keys());
    g.input.rmb = true; T.step(1); g.input.rmb = false; T.step(1, 0.0001);
    const k = [...g.blocks.keys()].find((k) => !old.has(k) && g.blocks.get(k) === 'planks');
    return { before, after: g.blocks.size, k, planks: T.count('planks') };
  });
  check('place a block (right click)', r.after === r.before + 1 && !!r.k && r.planks === 9, JSON.stringify(r));
  const placed = r.k;
  r = await ev((k) => {
    const g = window.game; T.holdNothing();
    const [x, y, z] = k.split(',').map(Number);
    T.aim(x + 0.5, y + 0.5, z + 0.5);
    const n = T.mineUntil(() => !g.blocks.has(k));
    return { n, gone: !g.blocks.has(k), planks: T.count('planks') };
  }, placed);
  check('break the placed block and get it back', r.gone && r.planks === 10, JSON.stringify(r));

  // ------------------------------------------------------------ digging
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.give('stone_shovel', 1); T.hold('stone_shovel');
    T.tpg(-8, 30); T.step(5);
    const cx = -8, cz = 27, top = g.topY(cx, cz);
    T.aim(cx + 0.5, g.groundHeight(cx + 0.5, cz + 0.5), cz + 0.5);
    const n = T.mineUntil(() => g.getVox(cx, top, cz) === 0, 900);
    return { n, air: g.getVox(cx, top, cz) === 0, dirt: T.count('dirt'), fiber: T.count('fiber'), dug: g.columnDug(cx, cz) };
  });
  check('dig grass then dirt (voxel underground)', r.air && r.dirt >= 1 && r.fiber >= 1 && r.dug, JSON.stringify(r));

  // ------------------------------------------------------------ mobs
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.give('iron_sword', 1); T.hold('iron_sword');
    T.tpg(20, 60); T.step(3);
    g.spawnMob('sheep', 22.5, 60);
    const m = g.mobs[g.mobs.length - 1];
    m.idleT = 99; m.moving = false;
    let n = 0;
    while (!m.dead && n < 200) { T.aim(m.pos.x, m.pos.y + m.def.cy, m.pos.z); g.input.lmb = true; T.step(1); n++; }
    g.input.lmb = false; T.step(15);
    return { dead: m.dead, n, mutton: T.count('raw_mutton'), wool: T.count('wool'), gone: !g.mobs.includes(m) };
  });
  check('kill a sheep with a sword, get mutton', r.dead && r.mutton >= 1 && r.gone, JSON.stringify(r));
  r = await ev(() => { const g = window.game; T.tpg(30, 120); T.step(200); return { n: g.mobs.length, types: [...new Set(g.mobs.map((m) => m.type))] }; });
  check('animals spawn around the player', r.n > 0, JSON.stringify(r));

  // ------------------------------------------------------------ day and night
  r = await ev(() => { const g = window.game; g.setTime(0.0); T.step(2); const a = T.text('clock'); g.setTime(0.5); T.step(2); return [a, T.text('clock')]; });
  check('day/night clock follows time', r[0].includes('· 00:') && r[1].includes('· 12:'), r.join(' / '));

  // ------------------------------------------------------------ machines
  r = await ev(() => {
    const g = window.game, k = '40,5,40', k2 = '42,5,40';
    g.blocks.set(k, 'campfire'); g.fires.set(k, { slots: [{ id: 'raw_meat', n: 2 }, null], t: 0 });
    g.blocks.set(k2, 'furnace'); g.furnaces.set(k2, { slots: [{ id: 'iron_ore', n: 2 }, { id: 'coal', n: 1 }, null], t: 0, burn: 0, burnMax: 0 });
    g.rebuildBlocks();
    T.step(100);
    return { fire: g.fires.get(k).slots[1], furnace: g.furnaces.get(k2).slots[2] };
  });
  check('campfire roasts meat', r.fire?.id === 'meat', JSON.stringify(r.fire));
  check('furnace smelts iron ore with coal', r.furnace?.id === 'iron', JSON.stringify(r.furnace));
  r = await ev(() => {
    const g = window.game, gen = '50,5,50', cab = '51,5,50', lamp = '52,5,50';
    g.blocks.set(gen, 'coal_generator'); g.blocks.set(cab, 'cable_copper'); g.blocks.set(lamp, 'electric_lamp');
    g.power.set(gen, { slots: [{ id: 'coal', n: 4 }], burn: 0, burnMax: 0, pw: 0 });
    g.rebuildBlocks(); T.step(30);
    return { lamp: g.power.get(lamp)?.pw, gen: g.power.get(gen)?.pw };
  });
  check('power: coal generator lights an electric lamp through a cable', r.lamp === 1 && r.gen === 1, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game, f = '60,5,60', c = '60,6,60';
    g.blocks.set(f, 'farmland'); g.blocks.set(c, 'wheat_crop'); g.crops.set(c, { stage: 0, t: 0, next: 1 });
    g.rebuildBlocks(); g.updateCrops(2); g.updateCrops(2);
    return g.crops.get(c);
  });
  check('crops grow on farmland', r?.stage >= 1, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game, k = '64,5,64', i = g.KITCHEN.findIndex((x) => x.out === 'fried_egg');
    g.blocks.set(k, 'stove'); g.stoves.set(k, { slots: [null], recipe: i, t: 0 }); g.rebuildBlocks();
    T.step(130);
    return g.stoves.get(k);
  });
  check('stove cooks a fried egg', r?.slots?.[0]?.id === 'fried_egg' && r.recipe === null, JSON.stringify(r));

  // ------------------------------------------------------------ structures, portal, creative, vehicles, eating
  r = await ev(() => {
    const g = window.game;
    const s = g.structuresNear(0, 0, 900).filter((x) => x.type === 'camp' || x.type === 'tower').sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    if (!s) return { none: true };
    if (!g.ruinsBuilt.has(s.key)) g.buildStructure(s);
    const chest = [...g.chests.keys()].find((k) => { const [x, , z] = k.split(',').map(Number); return Math.hypot(x - s.x, z - s.z) < 8; });
    return { type: s.type, built: g.ruinsBuilt.has(s.key), chest: !!chest };
  });
  check('a structure builds with a loot chest', r.built && r.chest, JSON.stringify(r));
  r = await ev(() => { const g = window.game; T.give('shard', 3); g.usePortal(g.SHRINES[0]); return { active: g.portalActive, shards: T.count('shard') }; });
  check('3 light shards wake the shrine portal', r.active && r.shards === 0, JSON.stringify(r));
  r = await ev(() => { const g = window.game; T.press('KeyC'); const on = g.creative; T.press('KeyC'); return { on, off: !g.creative }; });
  check('C toggles creative mode', r.on && r.off, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game; T.tpg(0, 60); T.step(3);
    const id = g.spawnVehicle('car', 5, 60, 0); const n = g.vehicles.size;
    g.enterVehicle(id); T.step(3); const inside = g.player.vehicle === id;
    g.exitVehicle(); T.step(3);
    return { n, inside, out: !g.player.vehicle };
  });
  check('car: place, get in, get out', r.n >= 1 && r.inside && r.out, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.give('bread', 2); T.hold('bread'); g.player.hunger = 40;
    g.input.rmb = true; g.startEating('bread', 'hand'); T.step(80); g.input.rmb = false; T.step(1);
    return { hunger: g.player.hunger, bread: T.count('bread') };
  });
  check('eating bread fills hunger', r.hunger > 60 && r.bread === 1, JSON.stringify(r));

  // ------------------------------------------------------------ save and load
  const before = await ev(() => {
    const g = window.game; T.clearInv(); T.give('stone', 7); T.give('apple', 3);
    g.blocks.set('3,1,40', 'bricks'); g.rebuildBlocks(); g.setTime(0.3);
    g.saveGame();
    return { blocks: g.blocks.size, stone: T.count('stone'), apple: T.count('apple'), portal: g.portalActive, built: g.ruinsBuilt.size, vox: g.worldState().vox.length };
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.click('#mSolo');
  await waitGame(page);
  const after = await ev(() => { const g = window.game; return { blocks: g.blocks.size, stone: T.count('stone'), apple: T.count('apple'), portal: g.portalActive, built: g.ruinsBuilt.size, vox: g.worldState().vox.length, brick: g.blocks.get('3,1,40') }; });
  check('save + reload keeps world and backpack', after.blocks === before.blocks && after.stone === 7 && after.apple === 3 && after.portal && after.built === before.built && after.vox === before.vox && after.brick === 'bricks', JSON.stringify({ before, after }));
  check('intro not shown after reload', await ev(() => document.getElementById('intro').style.display !== 'grid'));

  // ------------------------------------------------------------ graphics pipeline (render/look.js, post.js, shadows.js)
  r = await ev(() => { const g = window.game; return { look: g.LK?.name, post: g.FX.post, low: g.QUALITY === 'low', composer: !!g.post.composer, shadows: g.renderer.shadowMap.enabled, tone: g.renderer.toneMapping }; });
  check('graphics: low = no post-processing and no shadows, medium/high = composer + shadows', !!r.look && (r.low ? !r.post && !r.composer && !r.shadows : r.post && r.composer && r.shadows), JSON.stringify(r));
  // Grafika Automaticky: softwarové WebGL (CI) = nízká; počasí z pravidel a game.setWeather; soumrak a hvězdy
  r = await ev(() => {
    const g = window.game, out = { quality: g.QUALITY, gpu: g.FX.gpu };
    g.setTime(0.5); g.setWeather({ rain: 1, storm: 1 }); T.step(240, 0.05);
    const rain = g.scene.children.find((o) => o.renderOrder === 5);
    Object.assign(out, { rain: +g.weather.rain.toFixed(2), wet: +g.weather.wet.toFixed(2), rainVisible: !!rain?.visible, overcast: +g.weather.overcast.toFixed(2) });
    g.setWeather(null); g.weather.rain = g.weather.storm = g.weather.wet = 0;
    g.setTime(0.762); T.step(2, 0.01); out.twilight = +g.vis.twilight.toFixed(2); out.starsDusk = +g.vis.starK.toFixed(2);
    g.setTime(0.0); T.step(2, 0.01); out.starsNight = +g.vis.starK.toFixed(2); out.moon = +g.vis.moonK.toFixed(2);
    g.setTime(0.32); T.step(2, 0.01);
    return out;
  });
  check('graphics: weather (rain, wet ground) and dusk/night sky', r.rain > 0.9 && r.rainVisible && r.wet > 0.05 && r.overcast > 0.8 && r.twilight > 0.3 && r.starsNight > 0.9 && r.moon > 0.9, JSON.stringify(r));
  if (!process.env.PLAYTEST_QUALITY) check('graphics: Automaticky picks nízká on software WebGL', r.gpu !== 'software' || r.quality === 'low', JSON.stringify(r));

  // ------------------------------------------------------------ picture
  await ev(() => { const g = window.game; g.setTime(0.32); T.tp(0, 16, 0.45); g.player.yaw = 0; g.player.pitch = 0.05; T.step(30); });
  if (await shot(page, `${out}.png`)) check('screenshot written', fs.existsSync(`${out}.png`));
} catch (e) {
  check('play-test ran without exception', false, e.stack || e);
}

check('no console errors', page.errors.length === 0, page.errors.slice(0, 5).join(' | '));
fs.writeFileSync(`${out}.json`, JSON.stringify(results, null, 2));
await browser.close();
await server?.close();
const bad = failed();
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
