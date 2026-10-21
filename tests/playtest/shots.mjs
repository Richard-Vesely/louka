// Fixed, reproducible screenshots of the game for comparing looks (graphics before/after).
// It builds nothing: give it a built dist folder (npm run build) and an output folder.
//
//   node tests/playtest/shots.mjs <dist> <out-dir> [--quality low|medium|high] [--soft] [--perf] [--only name,name] [--views all]
//
//   --look     (old builds only) adds ?look=<x> to the URL
//   --quality  the "Grafika" setting (default high)
//   --soft     software WebGL like CI (slow); by default the real GPU is used
//   --perf     also measures the time per frame (CPU + GPU, synchronous) in each view → <out-dir>/perf.json
//   --only     only these views
//   --tweak    JavaScript run in the page after the start (e.g. "game.LK.bloom.intensity = 1")
//   --after    JavaScript run in the page after each view is set up, just before the screenshot
// Views (1600×900): day-landscape, sunset-lights, cave, water-shore, lake, bike, boats, seaplane, garage, forest, inventory, tech-machines, vehicles;
// with --views all also golden-hour, night, rain, dawn-fog, mark (these need the new weather/dimension API).
// Everything is placed through window.game, so the same script works on old and new builds.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { ARGS, serveDir } from './lib.mjs';

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i < 0 ? def : argv[i + 1]; };
const flag = (name) => argv.includes('--' + name);
const VALUED = ['--look', '--quality', '--only', '--tweak', '--after', '--views'];
const [dist, outDir] = argv.filter((a, i) => !a.startsWith('--') && !VALUED.includes(argv[i - 1]));
if (!dist || !outDir) { console.log('usage: node tests/playtest/shots.mjs <dist> <out-dir> [--quality high] [--soft] [--perf] [--only a,b] [--views all]'); process.exit(2); }
const look = opt('look', '');
const quality = opt('quality', 'high');
const only = opt('only', '')?.split(',').filter(Boolean);
fs.mkdirSync(outDir, { recursive: true });

// bez svislé synchronizace: rAF běží, jak rychle to jde, takže --perf měří skutečný čas snímku
const GPU_ARGS = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--autoplay-policy=no-user-gesture-required'];
const server = await serveDir(path.resolve(dist));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: flag('soft') ? ARGS : GPU_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ev = (fn, arg) => page.evaluate(fn, arg);

await page.goto(server.url, { waitUntil: 'domcontentloaded' });
await ev((q) => { localStorage.clear(); localStorage.setItem('rise-nastaveni', JSON.stringify({ ...(q === 'auto' ? {} : { quality: q }), controls: 'mouse' })); localStorage.setItem('rise-jmeno', 'Fotograf'); }, quality);
await page.goto(server.url + (look ? `?look=${look}` : ''), { waitUntil: 'domcontentloaded' });
await page.click('#mSolo', { timeout: 240000, noWaitAfter: true }); // první start na pomalém stroji kompiluje shadery dlouho
await page.waitForFunction(() => window.gameStarted === true, null, { timeout: 120000 });
const gpu = await ev(() => { const gl = window.game.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
const realQ = await ev(() => window.game.QUALITY);
console.log(`GPU: ${gpu}  look=${look || '(default)'}  quality=${quality} (${realQ})`);

await ev(() => {
  const g = window.game;
  g.testMode = true;
  document.getElementById('intro').style.display = 'none';
  const H = window.SHOT = {
    g,
    // kamera = oči hráče; hráč „letí“ (flyT), takže zůstane viset ve vzduchu
    place({ x, z, y, up = 0, yaw, pitch = 0, time }) {
      if (time !== undefined) g.setTime(time);
      g.setWeather?.({ rain: 0, storm: 0, fog: 0 }); if (g.weather) { g.weather.rain = g.weather.storm = g.weather.fog = g.weather.wet = 0; }
      g.player.flyT = 1e6;
      g.player.hp = g.player.maxHp ?? 100;
      const yy = y ?? g.groundHeight(x, z) + up;
      g.player.pos.set(x, yy, z); g.player.vel.set(0, 0, 0);
      g.player.yaw = yaw; g.player.pitch = pitch;
      g.mobs.length = 0;
      g.tick(0.0001);
      g.player.pos.set(x, yy, z); g.player.vel.set(0, 0, 0);
    },
    // otočí se na bod
    lookAt(x, y, z) {
      const p = g.player.pos, dx = x - p.x, dy = y - (p.y + 1.62), dz = z - p.z;
      g.player.yaw = Math.atan2(-dx, -dz);
      g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    cell: (x, z) => Math.floor(g.groundHeight(x + 0.5, z + 0.5)),
    put(x, z, type, dy = 0) { const k = `${x},${H.cell(x, z) + dy},${z}`; g.blocks.set(k, type); return k; },
    clearInv() { g.inv.slots.fill(null); g.inv.cursor = null; },
  };
});

if (opt('tweak')) await ev(opt('tweak'));

const VIEWS = {
  // poledne nad krajinou u svatyně: kopce, les, svatyně, tráva
  'day-landscape': () => { SHOT.place({ x: 46, z: 58, up: 7, yaw: 0, time: 0.36 }); SHOT.lookAt(0, 4, 0); SHOT.g.player.pitch -= 0.06; },
  // soumrak: tábor se světly (táborák, pochodně, lucerna, elektrická lampa)
  'sunset-lights': () => {
    const S = SHOT, g = S.g, X = 30, Z = -40;
    for (let i = -3; i <= 3; i++) { S.put(X + i, Z - 3, 'cobble'); S.put(X + i, Z - 3, 'cobble', 1); S.put(X + i, Z - 3, 'planks', 2); }
    S.put(X - 3, Z - 2, 'cobble'); S.put(X + 3, Z - 2, 'cobble');
    S.put(X, Z, 'campfire');
    g.fires.set(`${X},${S.cell(X, Z)},${Z}`, { slots: [null, null], t: 0 });
    S.put(X - 2, Z - 2, 'torch'); S.put(X + 2, Z - 2, 'torch'); S.put(X - 4, Z + 1, 'lantern'); S.put(X + 4, Z + 2, 'torch');
    const gen = S.put(X + 6, Z - 2, 'coal_generator'); S.put(X + 6, Z - 1, 'cable_copper'); S.put(X + 6, Z, 'cable_copper'); S.put(X + 6, Z + 1, 'electric_lamp');
    g.power.set(gen, { slots: [{ id: 'coal', n: 64 }], burn: 0, burnMax: 0, pw: 0 });
    g.rebuildBlocks();
    S.place({ x: X + 1.5, z: Z + 9, up: 2.2, yaw: 0, time: 0.765 });
    S.lookAt(X + 0.5, S.cell(X, Z) + 0.6, Z);
  },
  // jeskyně: vykopaná sluj s pochodněmi a rudami (krystal, zlato, měď)
  cave: () => {
    const S = SHOT, g = S.g, X = 12, Z = 24, Y = -14, V = g.V;
    for (let x = -4; x <= 4; x++) for (let z = -6; z <= 6; z++) for (let y = 0; y <= 4 - (Math.abs(x) > 3 ? 1 : 0); y++) g.setVox(X + x, Y + y, Z + z, V.AIR);
    const ore = [[-5, 1, -2, V.CRYSTAL], [-5, 2, -1, V.CRYSTAL], [5, 2, 1, V.GOLD], [5, 1, 3, V.COPPER], [-2, 1, -7, V.CRYSTAL], [1, 3, -7, V.IRON], [-5, 3, 3, V.COAL], [2, 5, -3, V.CRYSTAL]];
    for (const [x, y, z, v] of ore) g.setVox(X + x, Y + y, Z + z, v);
    g.blocks.set(`${X - 4},${Y},${Z - 3}`, 'torch'); g.blocks.set(`${X + 4},${Y},${Z - 5}`, 'torch'); g.blocks.set(`${X},${Y},${Z - 5}`, 'lantern');
    g.rebuildBlocks();
    S.place({ x: X + 0.5, z: Z + 5.5, y: Y + 0.2, yaw: 0, time: 0.4 });
    S.lookAt(X + 0.5, Y + 1.2, Z - 6);
  },
  // rybník ráno: hladina, břeh, odlesky
  'water-shore': () => {
    const S = SHOT, g = S.g, p = g.pondOf(-181.5, -48);
    S.place({ x: p.x + p.r + 3, z: p.z + 4, up: 1.2, yaw: 0, time: 0.31 });
    S.lookAt(p.x - p.r * 0.6, g.pondLevel(p), p.z - 2);
  },
  // jezero (nejbližší ke svatyni): široká hladina, rovný břeh, rákosí
  lake: () => {
    const S = SHOT, g = S.g, L = g.lakeOf(-422, -521);
    S.place({ x: L.x + L.r * 1.12, z: L.z + L.r * 0.35, up: 2.2, yaw: 0, time: 0.4 });
    S.lookAt(L.x - L.r * 0.3, L.level, L.z - L.r * 0.2);
  },
  // hustý les odpoledne
  forest: () => { SHOT.place({ x: -120, z: 205, up: 0.1, yaw: 0, time: 0.6 }); SHOT.lookAt(-120, SHOT.g.groundHeight(-120, 185) + 2.5, 185); },
  // stroje a elektřina za soumraku: generátor, kabely, baterie, solár, lampy, počítač
  'tech-machines': () => {
    const S = SHOT, g = S.g, X = -28, Z = -8;
    const gen = S.put(X, Z, 'coal_generator');
    g.power.set(gen, { slots: [{ id: 'coal', n: 64 }], burn: 0, burnMax: 0, pw: 0 });
    for (let i = 1; i <= 6; i++) S.put(X + i, Z, 'cable_gold');
    S.put(X + 7, Z, 'battery_block'); S.put(X + 3, Z - 1, 'electric_lamp'); S.put(X + 5, Z + 1, 'bulb_lamp');
    S.put(X + 2, Z + 1, 'computer'); S.put(X + 1, Z - 1, 'solar_panel'); S.put(X + 6, Z - 1, 'electric_furnace'); S.put(X + 4, Z + 1, 'printer');
    for (let i = -1; i <= 8; i++) for (let j = -2; j <= 2; j++) if (!g.blocks.has(`${X + i},${S.cell(X + i, Z + j)},${Z + j}`)) S.put(X + i, Z + j, 'polished_stone', -1);
    g.rebuildBlocks();
    S.place({ x: X + 3.5, z: Z + 5.5, up: 1.6, yaw: 0, time: 0.785 });
    S.lookAt(X + 3.5, S.cell(X, Z) + 0.4, Z);
  },
  // auto a letadlo na louce
  vehicles: () => {
    const S = SHOT, g = S.g, X = -70, Z = -30;
    if (!S.veh) { S.veh = [g.spawnVehicle('car', X, Z, 0.6), g.spawnVehicle('plane', X + 9, Z - 4, -0.4)]; }
    S.place({ x: X - 4, z: Z + 9, up: 2.4, yaw: 0, time: 0.4 });
    S.lookAt(X + 3, g.groundHeight(X, Z) + 0.8, Z - 1);
  },
  // jízdní kolo na louce a cyklista zezadu (kamera vozidla, V)
  bike: () => {
    const S = SHOT, g = S.g, X = -60, Z = -20;
    S.place({ x: X, z: Z + 3, up: 0, yaw: 0, time: 0.42 });
    g.player.flyT = 0;
    if (!S.bike) { S.bike = g.spawnVehicle('bike', X, Z, 0.5); g.vehicles.get(S.bike).y = g.groundHeight(X, Z); S.bike2 = g.spawnVehicle('bike', X + 2.5, Z - 1.5, -0.4); g.vehicles.get(S.bike2).y = g.groundHeight(X + 2.5, Z - 1.5); }
    g.enterVehicle(S.bike); g.toggleCarCam(); g.player.yaw = 0.7; g.player.pitch = -0.05; g.tick(0.0001);
  },
  // motorový člun a plachetnice na jezeře (nejbližší ke svatyni)
  boats: () => {
    const S = SHOT, g = S.g, L = g.lakeOf(-422, -521);
    if (S.bike && g.player.vehicle) { g.exitVehicle(); g.toggleCarCam(); }
    const at = (a, r) => [L.x + Math.cos(a) * L.r * r, L.z + Math.sin(a) * L.r * r];
    if (!S.boats) {
      const [mx, mz] = at(0.15, 0.62), [sx, sz] = at(-0.12, 0.5);
      const m = g.spawnVehicle('motorboat', mx, mz, 2.2), s = g.spawnVehicle('sailboat', sx, sz, 1.2);
      g.vehicles.get(m).y = g.levelAt(mx, mz); g.vehicles.get(s).y = g.levelAt(sx, sz);
      Object.assign(g.vehicles.get(s), { thr: 1, boom: -0.7 });
      S.boats = [m, s];
    }
    const [cx, cz] = at(0, 1.12);
    S.place({ x: cx, z: cz, up: 2.4, yaw: 0, time: 0.4 });
    const [tx, tz] = at(0, 0.55);
    S.lookAt(tx, L.level + 1.6, tz);
  },
  // hydroplán na jezeře
  seaplane: () => {
    const S = SHOT, g = S.g, L = g.lakeOf(-422, -521), a = 1.9;
    if (!S.sea) { const x = L.x + Math.cos(a) * L.r * 0.6, z = L.z + Math.sin(a) * L.r * 0.6; S.sea = g.spawnVehicle('seaplane', x, z, 0.9); g.vehicles.get(S.sea).y = g.levelAt(x, z) - 0.18; }
    const v = g.vehicles.get(S.sea);
    S.place({ x: L.x + Math.cos(a) * L.r * 1.1, z: L.z + Math.sin(a) * L.r * 1.1, up: 3, yaw: 0, time: 0.6 });
    S.lookAt(v.x, v.y + 1.2, v.z);
  },
  // garáž: okno s lakem a vylepšeními pro auto
  garage: () => {
    const S = SHOT, g = S.g, X = -70, Z = -30;
    if (!S.veh) S.veh = [g.spawnVehicle('car', X, Z, 0.6)];
    const y = S.cell(X - 4, Z + 2), key = `${X - 4},${y + 1},${Z + 2}`;
    g.blocks.set(key, 'garage'); g.rebuildBlocks();
    g.addItem('nitro', 3, true); g.addItem('turbocharger', 1, true);
    S.place({ x: X - 4, z: Z + 9, up: 2.4, yaw: 0, time: 0.4 });
    S.lookAt(X - 2, g.groundHeight(X, Z) + 0.8, Z);
    g.openInventory('garage', key);
  },
  // otevřený batoh s věcmi
  inventory: () => {
    const S = SHOT, g = S.g;
    S.place({ x: 46, z: 58, up: 0.1, yaw: 0, time: 0.36 }); S.lookAt(0, 4, 0);
    S.clearInv();
    for (const [id, n] of [['iron_pickaxe', 1], ['stone_sword', 1], ['planks', 48], ['cobble', 64], ['torch', 20], ['bread', 6], ['apple', 9], ['iron', 12], ['crystal', 5], ['glass', 16], ['coal', 30], ['log', 14]]) if (g.ITEMS[id]) g.addItem(id, n, true);
    g.openInventory();
  },
};

const MORE = {
  // zlatá hodina a červánky: pohled ke slunci nad krajinou
  'golden-hour': () => {
    const S = SHOT, g = S.g, t = 0.742;
    S.place({ x: 46, z: 58, up: 6, yaw: 0, time: t });
    const phi = (120 + t * 360) * Math.PI / 180;
    g.player.yaw = Math.atan2(-Math.sin(phi), -Math.cos(phi)) + 0.35; g.player.pitch = 0.04;
  },
  // půlnoc na louce: měsíc, hvězdy, ovce 15 m daleko musí být vidět
  night: () => {
    const S = SHOT, g = S.g;
    S.place({ x: 46, z: 58, up: 1.7, yaw: 0, time: 0.0 });
    S.lookAt(0, 3, 0); g.player.pitch = 0.02;
    const yaw = g.player.yaw, x = 46 - Math.sin(yaw) * 15, z = 58 - Math.cos(yaw) * 15;
    g.spawnMob('sheep', x, z); g.spawnMob('deer', x + 4, z + 2);
  },
  // bouřka nad krajinou: déšť, mokrá zem, louže
  rain: () => {
    const S = SHOT, g = S.g;
    S.place({ x: 46, z: 58, up: 2.5, yaw: 0, time: 0.42 }); S.lookAt(0, 3, 0);
    g.setWeather({ rain: 1, storm: 1 }); g.weather.rain = 1; g.weather.storm = 1; g.weather.wet = 1;
  },
  // ranní mlha v údolí
  'dawn-fog': () => {
    const S = SHOT, g = S.g;
    S.place({ x: -120, z: 205, up: 4, yaw: 0, time: 0.27 }); S.lookAt(-60, g.groundHeight(-60, 150) + 2, 150);
    g.setWeather({ fog: 1 }); g.weather.fog = 1;
  },
  // pod hladinou rybníka
  underwater: () => {
    const S = SHOT, g = S.g, p = g.pondOf(-181.5, -48), lv = g.pondLevel(p);
    S.place({ x: p.x, z: p.z, y: lv - 1.62 - 0.6, yaw: 0, time: 0.45 }); g.player.pitch = -0.1;
  },
  // Markova dimenze v noci: fialová mlha, polární záře, krystaly
  mark: () => {
    const S = SHOT, g = S.g;
    S.place({ x: 40000 + 30, z: 25, up: 3, yaw: 0, time: 0.9 }); S.lookAt(40000, 4, 0);
  },
};
if (opt('views', '') === 'all') Object.assign(VIEWS, MORE);

const perf = {};
for (const [name, setup] of Object.entries(VIEWS)) {
  if (only?.length && !only.includes(name)) continue;
  try {
    await ev(`(${setup.toString()})()`);
    // ať se dostaví les, podzemí, odlesky oblohy (po ~3 s) a světla
    await page.waitForTimeout(name === 'cave' || name === 'mark' ? 4500 : 3800);
    if (name === 'inventory') await ev(() => { window.SHOT.g.player.flyT = 1e6; });
    if (opt('after')) { const r = await ev(opt('after')); if (r !== undefined) console.log('after:', JSON.stringify(r)); await page.waitForTimeout(300); }
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    if (flag('perf')) {
      // čas snímku přes skutečnou smyčku hry (requestAnimationFrame), 3 s; 25. percentil, aby jiné programy
      // na stejném počítači (krátké výkyvy) měření tolik nerozhazovaly
      perf[name] = await ev(() => new Promise((ok) => {
        const d = []; let last = performance.now(); const t0 = last;
        const f = () => { const t = performance.now(); d.push(t - last); last = t; if (t - t0 < 3000) requestAnimationFrame(f); else { d.sort((a, b) => a - b); ok(+d[Math.floor(d.length * 0.25)].toFixed(2)); } };
        requestAnimationFrame(f);
      }));
    }
    if (name === 'inventory' || name === 'garage') await ev(() => { window.game.closeInventory(); window.SHOT.clearInv(); });
    console.log(`shot  ${name}${perf[name] ? `  ${perf[name]} ms/frame` : ''}`);
  } catch (e) {
    console.log(`FAIL  ${name}: ${String(e.message || e).split('\n')[0]}`);
  }
}
if (flag('perf')) fs.writeFileSync(path.join(outDir, 'perf.json'), JSON.stringify({ gpu, look, quality, msPerFrame: perf }, null, 2));
if (errors.length) console.log('page errors:\n  ' + [...new Set(errors)].slice(0, 10).join('\n  '));
await browser.close();
await server.close();
