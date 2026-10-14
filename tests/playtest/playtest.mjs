// Automated play-test of Louka/Říše through the window.game debug API.
// Usage: node playtest.mjs <url-or-dir> [out.json]
// A directory is served on a random local port; a URL is opened as-is.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
const outFile = process.argv[3];
const CHROME = process.env.CHROME_PATH || undefined; // default: Playwright's own Chromium

function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, p);
    fs.readFile(f, (err, buf) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((r) => srv.listen(0, () => r({ srv, url: `http://127.0.0.1:${srv.address().port}/` })));
}

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? '  — ' + detail : ''}`); };

let server = null, url = target;
if (!/^https?:/.test(target)) { server = await serve(path.resolve(target)); url = server.url; }

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
// Software WebGL is slow; skip GPU draw calls during the test (game logic still runs every tick).
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
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (res) => { if (res.status() >= 400 && !/favicon/.test(res.url())) errors.push(`HTTP ${res.status()} ${res.url()}`); });

await page.goto(url, { waitUntil: 'commit' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'commit' });
await page.waitForFunction(() => window.gameStarted === true, null, { timeout: 120000 });
check('game loads (window.gameStarted)', true);

// helpers living in the page
await page.evaluate(() => {
  const g = window.game;
  g.testMode = true;
  window.T = {
    step(n = 1, dt = 0.05) { for (let i = 0; i < n; i++) g.tick(dt); },
    aim(x, y, z) {
      const p = g.player.pos, ex = p.x, ey = p.y + 1.62, ez = p.z;
      const dx = x - ex, dy = y - ey, dz = z - ez;
      g.player.yaw = Math.atan2(-dx, -dz);
      g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      this.step(2, 0.0001);
    },
    tp(x, z, y) { g.player.pos.set(x, y ?? 0.45, z); g.player.vel.set(0, 0, 0); this.step(2, 0.0001); g.player.pos.set(x, y ?? g.player.pos.y, z); },
    give(id, n) { g.addItem(id, n, true); },
    hold(id) { const i = g.inv.slots.findIndex((s) => s && s.id === id); if (i < 0) return false; const tmp = g.inv.slots[0]; g.inv.slots[0] = g.inv.slots[i]; g.inv.slots[i] = tmp; g.inv.sel = 0; return true; },
    holdNothing() { const i = g.inv.slots.findIndex((s, k) => !s && k < 9); g.inv.sel = i < 0 ? 8 : i; },
    count: (id) => g.countItem(id),
    clearInv() { g.inv.slots.fill(null); g.inv.cursor = null; },
    mineUntil(fn, max = 400) { g.input.lmb = true; let n = 0; while (!fn() && n < max) { this.step(1); n++; } g.input.lmb = false; return n; },
    text: (id) => document.getElementById(id)?.textContent ?? '',
  };
});
const ev = (fn, arg) => page.evaluate(fn, arg);

// ---------------------------------------------------------------- HUD
check('HUD: clock shows day and time', /^Den 1 · \d\d:\d\d$/.test(await ev(() => T.text('clock'))), await ev(() => T.text('clock')));
check('HUD: tip text shown', (await ev(() => T.text('tipText'))).startsWith('Pokácej strom'), await ev(() => T.text('tipText')));
check('HUD: hotbar has 9 slots', (await ev(() => document.querySelectorAll('#hotbar .slot').length)) === 9);
check('HUD: compass has markers', (await ev(() => document.querySelectorAll('#compass .m').length)) >= 28);
check('HUD: health + hunger bars full', await ev(() => document.getElementById('hpfill').style.width === '100%' && parseFloat(document.getElementById('foodfill').style.width) >= 99));
check('intro shown on first visit', await ev(() => document.getElementById('intro').style.display === 'grid'));
check('Czech hint text present', (await ev(() => T.text('hint'))).includes('WASD'));

// ---------------------------------------------------------------- movement
let r = await ev(() => { const g = window.game; T.tp(0, 14); const z0 = g.player.pos.z; g.keys.add('KeyW'); T.step(20); g.keys.delete('KeyW'); T.step(10); return { z0, z1: g.player.pos.z }; });
check('walk forward (W) moves player', r.z1 < r.z0 - 2, `${r.z0.toFixed(2)} -> ${r.z1.toFixed(2)}`);
r = await ev(() => { const g = window.game; T.tp(0, 14); g.keys.add('KeyW'); T.step(20); const walk = Math.hypot(g.player.vel.x, g.player.vel.z); g.keys.add('ShiftLeft'); T.step(20); const run = Math.hypot(g.player.vel.x, g.player.vel.z); g.keys.clear(); T.step(10); return { walk, run }; });
check('sprint (Shift) is faster than walk', r.run > r.walk * 1.5, `walk ${r.walk.toFixed(2)} run ${r.run.toFixed(2)}`);
r = await ev(() => { const g = window.game; T.tp(0, 14); T.step(5); const y0 = g.player.pos.y; g.keys.add('Space'); T.step(4); g.keys.delete('Space'); const y1 = g.player.pos.y; T.step(30); return { y0, y1, y2: g.player.pos.y }; });
check('jump (Space) goes up and lands', r.y1 > r.y0 + 0.3 && Math.abs(r.y2 - r.y0) < 0.05, JSON.stringify(r));
r = await ev(() => { const g = window.game; const before = g.inv.sel; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3' })); const after = g.inv.sel; window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit3' })); return { before, after, active: [...document.querySelectorAll('#hotbar .slot')].findIndex((s) => s.classList.contains('active')) }; });
check('number keys select hotbar slot', r.after === 2 && r.active === 2, JSON.stringify(r));
r = await ev(() => { const g = window.game; T.tp(0, 14); g.player.pos.set(7.4 * Math.cos(Math.PI / 8) + 0.3, 0.45, 7.4 * Math.sin(Math.PI / 8)); T.step(3); const p = g.player.pos; return Math.hypot(p.x - 7.4 * Math.cos(Math.PI / 8), p.z - 7.4 * Math.sin(Math.PI / 8)); });
check('shrine pillars collide (player pushed out)', r > 1.0, r.toFixed(2));

// ---------------------------------------------------------------- trees
r = await ev(() => {
  const g = window.game; T.clearInv(); T.holdNothing();
  T.tp(0, 40); T.step(2);
  const t = [...g.forestTrees].sort((a, b) => Math.hypot(a.x, a.z - 40) - Math.hypot(b.x, b.z - 40))[0];
  T.tp(t.x + 1.6, t.z, t.y); T.step(10);
  T.aim(t.x, t.y + 1.2, t.z);
  const label = T.text('targetLabel');
  const n = T.mineUntil(() => T.count('log') > 0);
  const gone = !g.forestTrees.some((x) => x.key === t.key);
  return { label, n, logs: T.count('log'), gone, key: t.key, s: t.s };
});
check('chop tree by hand (hold LMB) gives logs', r.logs >= 3, `${r.logs} logs after ${r.n} ticks; target label "${r.label}"`);
check('felled tree disappears', r.gone);
await ev(() => T.step(12));
check('tip advances after first log', (await ev(() => T.text('tipText'))).startsWith('Otevři inventář'), await ev(() => T.text('tipText')));
const handTicks = r.n, handS = r.s;
r = await ev(() => {
  const g = window.game; T.clearInv(); T.give('stone_axe', 1); T.hold('stone_axe');
  const p = g.player.pos;
  const t = [...g.forestTrees].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  T.tp(t.x + 1.6, t.z, t.y); T.step(10); T.aim(t.x, t.y + 1.2, t.z);
  const n = T.mineUntil(() => T.count('log') > 0);
  return { n, s: t.s };
});
check('stone axe chops faster than hand (tool tiers)', r.n / r.s < (handTicks / handS) / 2, `hand ${handTicks} ticks (size ${handS.toFixed(2)}), axe ${r.n} ticks (size ${r.s.toFixed(2)})`);

// ---------------------------------------------------------------- crafting
r = await ev(() => {
  const g = window.game; T.clearInv(); T.give('log', 2);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  const open = document.getElementById('inventory').style.display === 'grid';
  const recipes = document.querySelectorAll('#recipes .slot').length;
  const planks = g.RECIPES.find((x) => x.out === 'planks');
  g.fillRecipe(planks, false); g.takeResult(false);
  const cursor = g.inv.cursor && { ...g.inv.cursor };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  return { open, recipes, cursor, planks: T.count('planks'), logs: T.count('log'), closed: document.getElementById('inventory').style.display === 'none' };
});
check('E opens inventory with recipe book', r.open && r.recipes >= 15, `recipes shown: ${r.recipes}`);
check('craft planks from log (recipe book + take result)', r.cursor?.id === 'planks' && r.cursor.n === 4, JSON.stringify(r.cursor));
check('closing inventory returns cursor item to bag', r.closed && r.planks === 4 && r.logs === 1, JSON.stringify(r));
r = await ev(() => {
  const g = window.game; T.clearInv(); T.give('planks', 4);
  g.openInventory('inv');
  // manual placement with clicks: pick up stack, right-click one per grid cell
  const i = g.inv.slots.findIndex((s) => s);
  g.slotClick('inv', i, 0, false);
  for (const k of [0, 1, 2, 3]) g.slotClick('craft', k, 2, false);
  const res = g.findRecipe(g.ui.craft, 2);
  g.takeResult(true);
  g.closeInventory();
  return { res: res?.out, bench: T.count('workbench') };
});
check('manual 2×2 grid clicks craft a workbench', r.res === 'workbench' && r.bench === 1, JSON.stringify(r));
r = await ev(() => {
  const g = window.game; T.clearInv(); T.give('planks', 3); T.give('stick', 2);
  g.openInventory('inv'); const pick = g.RECIPES.find((x) => x.out === 'wood_pick'); g.fillRecipe(pick, false);
  const toastInv = T.text('toast'); g.closeInventory();
  g.openInventory('bench'); g.fillRecipe(pick, false); g.takeResult(true); g.closeInventory();
  return { toastInv, pick: T.count('wood_pick') };
});
check('3×3 recipe refused in 2×2 grid', r.toastInv === 'Tento recept potřebuje pracovní stůl', r.toastInv);
check('3×3 recipe works at workbench', r.pick === 1);
r = await ev(() => { const g = window.game; T.clearInv(); g.openInventory('bench'); const pick = g.RECIPES.find((x) => x.out === 'stone_pick'); g.fillRecipe(pick, false); const t = T.text('toast'); const ghost = !!g.ui.ghost; g.closeInventory(); return { t, ghost }; });
check('missing ingredients show ghost + toast', r.ghost && r.t === 'Chybí ti suroviny', JSON.stringify(r));
r = await ev(() => { const g = window.game; T.clearInv(); T.give('planks', 2); g.openInventory('inv'); g.slotClick('inv', 0, 2, false); const cur = g.inv.cursor && g.inv.cursor.n; const left = g.inv.slots[0]?.n; g.closeInventory(); return { cur, left }; });
check('right-click takes half a stack', r.cur === 1 && r.left === 1, JSON.stringify(r));
r = await ev(() => { const g = window.game; T.clearInv(); T.give('stick', 4); g.inv.slots[9] = g.inv.slots[0]; g.inv.slots[0] = null; g.openInventory('inv'); g.slotClick('inv', 9, 0, true); const hot = g.inv.slots.slice(0, 9).some((s) => s?.id === 'stick'); g.closeInventory(); return hot; });
check('shift-click moves stack bag → hotbar', r);
r = await ev(() => { const g = window.game; return g.RECIPES.map((x) => x.out).join(','); });
check('all original recipes present', r === 'planks,stick,workbench,torch,bricks,campfire,wood_pick,wood_axe,wood_sword,stone_pick,stone_axe,stone_sword,iron_pick,iron_axe,iron_sword,crystal_sword', r);
r = await ev(() => { const g = window.game; const grid = Array(4).fill(null); grid[1] = { id: 'planks', n: 1 }; grid[3] = { id: 'planks', n: 1 }; return g.findRecipe(grid, 2)?.out; });
check('recipe matching ignores position in grid', r === 'stick', r);
r = await ev(() => { const g = window.game; const grid = Array(9).fill(null); grid[1] = { id: 'planks', n: 1 }; grid[2] = { id: 'planks', n: 1 }; grid[4] = { id: 'stick', n: 1 }; grid[5] = { id: 'planks', n: 1 }; grid[7] = { id: 'stick', n: 1 }; return g.findRecipe(grid, 3)?.out; });
check('mirrored recipe shape works (axe)', r === 'wood_axe', r);

// ---------------------------------------------------------------- blocks
r = await ev(() => {
  const g = window.game; T.clearInv(); T.give('planks', 5); T.hold('planks');
  T.tp(25, 25); T.step(10);
  const p = g.player.pos;
  T.aim(p.x, p.y, p.z - 2.2);
  const before = g.blocks.size;
  g.input.rmb = true; T.step(1); g.input.rmb = false; T.step(1);
  const after = g.blocks.size;
  const placed = [...g.blocks.entries()].pop();
  return { before, after, placed, planks: T.count('planks') };
});
check('place block with right click', r.after === r.before + 1 && r.planks === 4, JSON.stringify(r));
const placedKey = r.placed?.[0];
r = await ev((k) => {
  const g = window.game; T.holdNothing();
  const [x, y, z] = k.split(',').map(Number);
  T.aim(x + 0.5, y + 0.5, z + 0.5);
  const label = T.text('targetLabel');
  const n = T.mineUntil(() => !g.blocks.has(k));
  return { label, n, has: g.blocks.has(k), planks: T.count('planks') };
}, placedKey);
check('break placed block returns it', !r.has && r.planks === 5, JSON.stringify(r));
r = await ev(() => {
  const g = window.game; T.clearInv(); T.give('stone', 3); T.hold('stone');
  const p = g.player.pos;
  T.aim(p.x, p.y, p.z - 2.2);
  g.input.rmb = true; T.step(1); g.input.rmb = false; T.step(6);
  const k1 = [...g.blocks.keys()].pop();
  const [x, y, z] = k1.split(',').map(Number);
  T.aim(x + 0.5, y + 1.0, z + 0.5);
  g.input.rmb = true; T.step(1); g.input.rmb = false; T.step(6);
  const k2 = [...g.blocks.keys()].pop();
  return { k1, k2, size: g.blocks.size };
});
check('stack block on top of block', r.k2 && r.k2 !== r.k1 && Number(r.k2.split(',')[1]) === Number(r.k1.split(',')[1]) + 1, JSON.stringify(r));
r = await ev(() => {
  const g = window.game; T.holdNothing();
  const k = [...g.blocks.keys()].pop(); const [x, y, z] = k.split(',').map(Number);
  T.aim(x + 0.5, y + 0.5, z + 0.5); g.input.lmb = true; T.step(20); g.input.lmb = false;
  return { warn: document.querySelector('#targetLabel .warn')?.textContent, still: g.blocks.has(k) };
});
check('cobble needs a pickaxe (warning shown)', r.warn === 'Potřebuješ krumpáč' && r.still, JSON.stringify(r));
r = await ev(() => {
  const g = window.game; T.clearInv(); T.give('planks', 1); T.hold('planks');
  const p = g.player.pos; const k = `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
  T.aim(p.x, p.y - 0.5, p.z + 0.05);
  g.input.rmb = true; T.step(1); g.input.rmb = false;
  return { insidePlayer: g.blocks.has(k), planks: T.count('planks') };
});
check('cannot place a solid block inside yourself', !r.insidePlayer, JSON.stringify(r));
r = await ev(() => {
  const g = window.game; T.tp(30, -30); T.step(5);
  const x = 30, z = -33;
  for (let y = 0; y < 3; y++) g.blocks.set(`${x},${Math.floor(g.player.pos.y) + y},${z}`, 'planks');
  g.rebuildBlocks();
  g.player.yaw = 0; g.player.pitch = 0;
  g.keys.add('KeyW'); T.step(40); g.keys.delete('KeyW'); T.step(5);
  return g.player.pos.z;
});
check('walls of blocks stop the player', r > -32.4, `z=${r.toFixed(2)} (wall at z=-33..-32)`);

// ---------------------------------------------------------------- grass
r = await ev(() => {
  const g = window.game; T.clearInv(); T.holdNothing(); T.tp(-40, 30); T.step(5);
  const p = g.player.pos;
  T.aim(p.x, p.y, p.z - 1.5);
  const label = T.text('targetLabel');
  T.mineUntil(() => T.count('fiber') > 0, 200);
  T.step(2);
  const label2 = T.text('targetLabel');
  return { label, label2, fiber: T.count('fiber') };
});
check('cut grass gives fiber', r.fiber >= 1, JSON.stringify(r));
check('cut grass shows as "Posekaná tráva" (regrows)', r.label2.startsWith('Posekaná tráva'), r.label2);

// ---------------------------------------------------------------- rocks
r = await ev(() => {
  const g = window.game; T.clearInv(); T.give('wood_pick', 1); T.hold('wood_pick');
  T.tp(60, 60); T.step(3);
  const p = g.player.pos;
  const rock = [...g.forestRocks].filter((x) => !x.iron).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  T.tp(rock.x + rock.s + 1.0, rock.z); T.step(10);
  T.aim(rock.x, rock.y + 0.3 * rock.s, rock.z);
  const label = T.text('targetLabel');
  T.mineUntil(() => T.count('stone') > 0, 600);
  return { label, stone: T.count('stone') };
});
check('mine boulder with wooden pickaxe gives stone', r.stone >= 2, JSON.stringify(r));
r = await ev(() => {
  const g = window.game; T.clearInv(); T.give('wood_pick', 1); T.hold('wood_pick');
  let rock = null;
  for (const [x, z] of [[60, 60], [-80, 90], [120, -40], [-150, -150], [200, 200], [0, 300], [300, 0]]) {
    T.tp(x, z); T.step(3);
    const p = g.player.pos;
    rock = [...g.forestRocks].filter((r) => r.iron).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (rock) break;
  }
  if (!rock) return { none: true };
  T.tp(rock.x + rock.s + 1.0, rock.z); T.step(10); T.aim(rock.x, rock.y + 0.3 * rock.s, rock.z);
  g.input.lmb = true; T.step(10); g.input.lmb = false;
  const warn = document.querySelector('#targetLabel .warn')?.textContent;
  T.give('stone_pick', 1); T.hold('stone_pick'); T.step(1);
  T.mineUntil(() => T.count('iron_ore') > 0, 800);
  return { warn, ore: T.count('iron_ore') };
});
check('iron ore needs stone pickaxe', r.warn === 'Potřebuješ kamenný krumpáč', JSON.stringify(r));
check('mine iron ore with stone pickaxe', r.ore >= 2, JSON.stringify(r));

// ---------------------------------------------------------------- food
r = await ev(() => { const g = window.game; T.clearInv(); T.give('berries', 2); T.hold('berries'); g.player.hunger = 50; g.input.rmb = true; T.step(1); g.input.rmb = false; return { hunger: g.player.hunger, left: T.count('berries') }; });
check('eat berries (right click) restores hunger', Math.round(r.hunger) === 58 && r.left === 1, JSON.stringify(r));
r = await ev(() => { const g = window.game; T.clearInv(); T.give('berries', 2); T.hold('berries'); g.player.hp = 100; T.step(20); g.player.hunger = 100; g.input.rmb = true; T.step(1); g.input.rmb = false; return { t: T.text('toast'), left: T.count('berries') }; });
check('cannot eat when full ("Nemáš hlad")', r.t === 'Nemáš hlad' && r.left === 2, JSON.stringify(r));
r = await ev(() => { const g = window.game; T.clearInv(); T.give('meat', 1); T.hold('meat'); g.player.hunger = 100; g.player.hp = 50; g.player.lastHurt = 1e9; T.step(20); g.input.rmb = true; T.step(1); g.input.rmb = false; return { hp: g.player.hp, left: T.count('meat') }; });
check('cooked meat heals', r.hp >= 60 && r.left === 0, JSON.stringify(r));
r = await ev(() => { const g = window.game; g.player.hunger = 80; T.step(200); return g.player.hunger; });
check('hunger drops over time', r < 80 && r > 78, r.toFixed(2));

// ---------------------------------------------------------------- campfire cooking
r = await ev(() => {
  const g = window.game; T.clearInv(); T.give('campfire', 1); T.give('raw_meat', 3); T.hold('campfire');
  T.tp(-25, -25); T.step(5); const p = g.player.pos;
  T.aim(p.x, p.y, p.z - 2.2); g.input.rmb = true; T.step(1); g.input.rmb = false; T.step(10);
  const k = [...g.blocks.entries()].find(([, t]) => t === 'campfire')?.[0];
  if (!k) return { placed: false };
  const [x, y, z] = k.split(',').map(Number);
  T.aim(x + 0.5, y + 0.3, z + 0.5);
  T.holdNothing(); g.input.rmb = true; T.step(1); g.input.rmb = false;
  const mode = g.ui.mode, open = document.getElementById('inventory').style.display === 'grid';
  g.fillCooking('raw_meat');
  const inFire = g.fires.get(k)?.slots[0]?.n;
  g.closeInventory();
  for (let i = 0; i < 100; i++) g.tick(0.05);
  const out = g.fires.get(k)?.slots[1];
  return { placed: true, mode, open, inFire, out };
});
check('right click campfire opens cooking window', r.mode === 'fire' && r.open, JSON.stringify(r));
check('campfire cooks meat while window closed', r.out?.id === 'meat' && r.out.n === 1, JSON.stringify(r));

// ---------------------------------------------------------------- mobs
r = await ev(() => {
  const g = window.game; T.clearInv(); T.give('iron_sword', 1); T.hold('iron_sword');
  T.tp(80, -80); T.step(3);
  const p = g.player.pos; g.spawnMob('sheep', p.x, p.z - 2.5); T.step(1);
  const m = g.mobs[g.mobs.length - 1];
  m.idleT = 99; m.moving = false;
  T.aim(m.pos.x, m.pos.y + m.def.cy, m.pos.z);
  const label = T.text('targetLabel');
  g.input.lmb = true; let n = 0; while (!m.dead && n < 100) { T.aim(m.pos.x, m.pos.y + m.def.cy, m.pos.z); g.input.lmb = true; T.step(1); n++; } g.input.lmb = false;
  return { label, dead: m.dead, meat: T.count('raw_meat'), wool: T.count('wool') };
});
check('hit sheep with sword: dies and drops meat + wool', r.dead && r.meat >= 1 && r.wool >= 1, JSON.stringify(r));
r = await ev(() => {
  const g = window.game; g.setTime(0.5); T.step(2);
  for (const m of [...g.mobs]) m.dead = true; T.step(20);
  g.player.hp = 100;
  T.tp(150, 150); T.step(2);
  const p = g.player.pos; g.spawnMob('boar', p.x + 3, p.z);
  const m = g.mobs[g.mobs.length - 1];
  T.holdNothing();
  T.aim(m.pos.x, m.pos.y + m.def.cy, m.pos.z); g.input.lmb = true; T.step(1); g.input.lmb = false;
  const aggro = m.aggro;
  for (let i = 0; i < 60; i++) T.step(1);
  return { aggro, hp: g.player.hp };
});
check('boar fights back when hit', r.aggro && r.hp < 100, JSON.stringify(r));
r = await ev(() => {
  const g = window.game; for (const m of g.mobs) m.dead = true; T.step(20);
  g.player.hp = 100; g.player.alive = true;
  T.tp(150, 150); T.step(2);
  g.setTime(0.9); T.step(2);
  const toast = T.text('toast');
  let crawlers = 0; for (let i = 0; i < 400 && crawlers === 0; i++) { T.step(1); crawlers = g.mobs.filter((m) => m.type === 'crawler').length; }
  return { toast, crawlers };
});
check('night falls with Czech toast', r.toast === 'Padá noc… stínožrouti se probouzejí', r.toast);
check('stínožrouti spawn at night', r.crawlers > 0, `${r.crawlers} crawlers`);
r = await ev(() => {
  const g = window.game; T.tp(0, 5); T.step(2);
  g.spawnMob('crawler', 0, 9); const m = g.mobs[g.mobs.length - 1];
  for (let i = 0; i < 60; i++) T.step(1);
  return { d: Math.hypot(m.pos.x, m.pos.z), hp: g.player.hp };
});
check('shrine is a safe zone (crawler stays out)', r.d >= 12.5 && r.hp === 100, JSON.stringify(r));
r = await ev(() => {
  const g = window.game; g.player.hp = 10; g.player.alive = true; g.player.lastHurt = 0;
  T.tp(150, 150); T.step(2);
  g.spawnMob('crawler', 150.8, 150); const m = g.mobs[g.mobs.length - 1]; m.cd = 0;
  for (let i = 0; i < 40 && g.player.alive; i++) T.step(1);
  const dead = !g.player.alive, fade = document.getElementById('fade').style.opacity;
  return { dead, fade, fadeText: T.text('fade') };
});
check('player dies when health runs out ("Padl jsi…")', r.dead && r.fade === '1' && r.fadeText === 'Padl jsi…', JSON.stringify(r));
await page.waitForTimeout(3200);
r = await ev(() => { const g = window.game; return { alive: g.player.alive, hp: g.player.hp, pos: g.player.pos.toArray().map((v) => +v.toFixed(2)), toast: T.text('toast') }; });
check('respawn at the shrine with full health', r.alive && r.hp === 100 && r.pos[2] === 14 && r.toast === 'Svatyně tě přivedla zpět', JSON.stringify(r));
r = await ev(() => { const g = window.game; g.setTime(0.3); T.step(2); for (let i = 0; i < 300; i++) T.step(1); return { toast: T.text('toast'), clock: T.text('clock') }; });
check('day comes back ("Svítá")', r.clock.startsWith('Den '), JSON.stringify(r));

// ---------------------------------------------------------------- shards
r = await ev(() => {
  const g = window.game; T.clearInv();
  const before = T.count('shard');
  // find a shard via the compass marker distance by walking the world grid
  for (const [x, z] of [[0, 0], [200, 0], [0, 200], [-200, 0], [0, -200], [300, 300], [-300, 300]]) {
    T.tp(x, z); T.step(2);
    const txt = document.querySelector('#compass .shard small')?.textContent;
    if (txt) break;
  }
  return { before, marker: document.querySelector('#compass .shard small')?.textContent };
});
check('shard marker (✦) shows distance on compass', /\d+ m/.test(r.marker || ''), r.marker);

// ---------------------------------------------------------------- torches & light
r = await ev(() => { const g = window.game; T.clearInv(); T.give('torch', 1); T.hold('torch'); T.tp(-60, -60); T.step(3); const p = g.player.pos; T.aim(p.x, p.y, p.z - 2.2); g.input.rmb = true; T.step(1); g.input.rmb = false; return [...g.blocks.values()].includes('torch'); });
check('place a torch', r);

// ---------------------------------------------------------------- save & load
r = await ev(() => { const g = window.game; g.blocks.set('5,0,40', 'bricks'); g.rebuildBlocks(); T.clearInv(); T.give('iron', 7); window.dispatchEvent(new Event('beforeunload')); return localStorage.getItem('rise-svet-v2')?.length || 0; });
check('game saves to localStorage', r > 100, `${r} bytes`);
await page.reload({ waitUntil: 'commit' });
await page.waitForFunction(() => window.gameStarted === true, null, { timeout: 120000 });
r = await ev(() => { const g = window.game; return { block: g.blocks.get('5,0,40'), iron: g.countItem('iron'), intro: document.getElementById('intro').style.display }; });
check('reload restores blocks and inventory', r.block === 'bricks' && r.iron === 7, JSON.stringify(r));
check('intro hidden for returning player', r.intro === 'none', r.intro);

const ownErrors = errors.filter((e) => !/^Failed to load resource/.test(e));
check('no console errors', ownErrors.length === 0, ownErrors.slice(0, 3).join(' | '));

await ev(() => { window.__skipDraw = false; window.game.tick(0.01); });
await page.waitForTimeout(1500);
await page.screenshot({ path: outFile ? outFile.replace(/\.json$/, '.png') : 'playtest.png', timeout: 120000 });
const passed = results.filter((x) => x.ok).length;
console.log(`\n${passed}/${results.length} passed`);
if (outFile) fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
await browser.close();
server?.srv.close();
process.exit(passed === results.length ? 0 : 1);
