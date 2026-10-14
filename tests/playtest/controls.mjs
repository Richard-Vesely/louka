// Browser test of the Minecraft controls and tricks (single player), with real keyboard and mouse events.
// Usage: node tests/playtest/controls.mjs client/dist [out.json]   (after npm run build)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2] || 'client/dist';
const outFile = process.argv[3];

function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    fs.readFile(path.join(dir, p), (err, buf) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((r) => srv.listen(0, () => r({ srv, url: `http://127.0.0.1:${srv.address().port}/?offline` })));
}

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? '  — ' + detail : ''}`); };

const server = await serve(path.resolve(target));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
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

await page.goto(server.url, { waitUntil: 'commit' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'commit' });
await page.waitForFunction(() => window.gameStarted === true, null, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.game;
  g.testMode = true;
  window.T = {
    step(n = 1, dt = 0.05) { for (let i = 0; i < n; i++) g.tick(dt); },
    aim(x, y, z) {
      const p = g.player.pos, dx = x - p.x, dy = y - (p.y + g.player.eyeH), dz = z - p.z;
      g.player.yaw = Math.atan2(-dx, -dz);
      g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      this.step(2, 0.0001);
    },
    tp(x, z, y) { g.player.pos.set(x, y ?? 0.45, z); g.player.vel.set(0, 0, 0); this.step(2, 0.0001); g.player.pos.set(x, y ?? g.player.pos.y, z); g.player.vel.set(0, 0, 0); },
    // Volné místo bez stromů a balvanů (aby nás nic neodstrčilo).
    spot() {
      for (let r = 18; r < 90; r += 6) for (let a = 0; a < 6.28; a += 0.4) {
        const x = Math.round(Math.cos(a) * r) + 0.5, z = Math.round(Math.sin(a) * r) + 0.5;
        this.tp(x, z);
        if ([...g.forestTrees, ...g.forestRocks].every((t) => Math.hypot(t.x - x, t.z - z) > 6)) return [x, z];
      }
    },
    give(id, n) { g.addItem(id, n, true); },
    hold(id) { const i = g.inv.slots.findIndex((s) => s && s.id === id); if (i < 0) return false; const t = g.inv.slots[0]; g.inv.slots[0] = g.inv.slots[i]; g.inv.slots[i] = t; g.inv.sel = 0; return true; },
    clearInv() { g.inv.slots.fill(null); g.inv.cursor = null; for (const k of [...g.drops.keys()]) g.drops.delete(k); },
    count: (id) => g.countItem(id),
    speed: () => Math.hypot(g.player.vel.x, g.player.vel.z),
  };
});
const ev = (fn, arg) => page.evaluate(fn, arg);
const key = (k) => page.keyboard.press(k);
// Střed políčka v okně inventáře (pro skutečné kliknutí myší).
// The window redraws itself every 0.5 s, so the element can be replaced while we measure it: try again.
const slotXY = async (c, i) => {
  for (let k = 0; k < 10; k++) {
    const b = await page.locator(`#inventory .slot[data-c="${c}"][data-i="${i}"]`).first().boundingBox().catch(() => null);
    if (b) return [b.x + b.width / 2, b.y + b.height / 2];
  }
  throw new Error(`slot ${c} ${i} not found`);
};
const clickSlot = async (c, i, opts = {}) => { const [x, y] = await slotXY(c, i); await page.mouse.click(x, y, opts); };

// ---------------------------------------------------------------- pohyb
await ev(() => T.spot());
let r = await ev(async () => {
  const g = window.game;
  g.keys.add('KeyW'); T.step(30); const walk = T.speed(); g.keys.clear(); T.step(20);
  g.keys.add('ShiftLeft'); g.keys.add('KeyW'); T.step(30);
  const sneak = T.speed(), eye = g.player.eyeH, sneaking = g.player.sneaking;
  g.keys.clear(); T.step(20);
  return { walk, sneak, eye, sneaking, eyeAfter: g.player.eyeH };
});
check('Shift = sneak: slower than walking, eyes lower', r.sneaking && r.sneak < r.walk * 0.5 && r.eye < 1.4 && r.eyeAfter > 1.6, JSON.stringify(r));

r = await ev(() => {
  const g = window.game, [x, z] = [Math.floor(g.player.pos.x), Math.floor(g.player.pos.z)];
  const base = Math.floor(g.player.pos.y);
  for (let y = base; y < base + 3; y++) g.blocks.set(`${x},${y},${z}`, 'cobble');
  g.rebuildBlocks();
  const top = base + 3;
  T.tp(x + 0.5, z + 0.5, top + 0.01);
  T.step(5);
  g.player.yaw = 0; g.keys.add('ShiftLeft'); g.keys.add('KeyW'); T.step(60); g.keys.clear(); T.step(5);
  const kept = { y: g.player.pos.y, z: g.player.pos.z };
  g.keys.add('KeyW'); T.step(40); g.keys.clear(); T.step(30);
  const fell = g.player.pos.y;
  for (let y = base; y < base + 3; y++) g.blocks.delete(`${x},${y},${z}`);
  g.rebuildBlocks();
  return { top, kept, fell, edge: z };
});
check('sneaking at the edge of a block does not fall off', Math.abs(r.kept.y - r.top) < 0.05 && r.kept.z > r.edge - 0.35, JSON.stringify(r.kept));
check('walking off the same edge without Shift falls', r.fell < r.top - 1, `top ${r.top} -> ${r.fell.toFixed(2)}`);

await ev(() => T.spot());
await page.keyboard.down('w'); await page.keyboard.up('w'); await page.keyboard.down('w');
r = await ev(() => { T.step(30); return { sprint: window.game.move.sprint, sp: T.speed(), fov: window.game.camera.fov }; });
await page.keyboard.up('w');
await ev(() => T.step(20));
check('double-tap W sprints (and widens the field of view)', r.sprint && r.sp > 7 && r.fov > 72, JSON.stringify(r));
await page.keyboard.down('Control'); await page.keyboard.down('w');
r = await ev(() => { T.step(30); return { sprint: window.game.move.sprint, sp: T.speed() }; });
await page.keyboard.up('w'); await page.keyboard.up('Control');
r.after = await ev(() => { T.step(10); return window.game.move.sprint; });
check('Ctrl + W sprints; releasing W stops sprinting', r.sprint && r.sp > 7 && r.after === false, JSON.stringify(r));

// ---------------------------------------------------------------- ruce a vyhazování
await ev(() => { T.spot(); T.clearInv(); T.give('stone', 10); T.hold('stone'); });
await key('q');
r = await ev(() => ({ n: T.count('stone'), drops: [...window.game.drops.values()].map((d) => [d.id, d.n]) }));
check('Q drops one item on the ground', r.n === 9 && r.drops.length === 1 && r.drops[0][1] === 1, JSON.stringify(r));
await key('Control+q');
r = await ev(() => ({ n: T.count('stone'), total: [...window.game.drops.values()].reduce((s, d) => s + d.n, 0) }));
check('Ctrl+Q drops the whole stack', r.n === 0 && r.total === 10, JSON.stringify(r));
r = await ev(() => {
  const g = window.game;
  T.step(20); // 1 s: too early
  const early = T.count('stone');
  const d = [...g.drops.values()][0];
  T.tp(d.x, d.z);
  T.step(40);
  return { early, after: T.count('stone'), left: g.drops.size, feed: document.getElementById('feed').textContent };
});
check('dropped items are picked up again after 2 s (walk over them)', r.early === 0 && r.after === 10 && r.left === 0, JSON.stringify(r));
check('items on the ground are drawn (3D views follow world.drops)', await ev(() => window.game.drops.size === 0));

await ev(() => { T.clearInv(); T.give('torch', 4); T.give('wood_pick', 1); T.hold('torch'); });
await key('f');
r = await ev(() => ({ off: window.game.inv.slots[36], main: window.game.inv.slots[0], hud: getComputedStyle(document.getElementById('offhand')).display }));
check('F moves the torch to the off-hand (shown next to the hotbar)', r.off?.id === 'torch' && !r.main && r.hud !== 'none', JSON.stringify(r));
r = await ev(() => {
  const g = window.game;
  T.hold('wood_pick');
  const p = g.player.pos, cell = [Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z) - 2];
  T.aim(cell[0] + 0.5, p.y + 0.02, cell[2] + 0.5);
  g.input.rmb = true; T.step(2); g.input.rmb = false; T.step(1);
  const placed = [...g.blocks].find(([, t]) => t === 'torch');
  if (placed) { g.blocks.delete(placed[0]); g.rebuildBlocks(); }
  return { placed: !!placed, off: g.inv.slots[36]?.n, main: g.inv.slots[0]?.id };
});
check('right click with a pickaxe uses the off-hand torch', r.placed && r.off === 3 && r.main === 'wood_pick', JSON.stringify(r));

r = await ev(() => {
  const g = window.game;
  T.clearInv(); T.give('log', 1); g.inv.slots[20] = { id: 'bricks', n: 9 };
  const p = g.player.pos, c = [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z) - 3];
  g.blocks.set(c.join(), 'bricks'); g.rebuildBlocks();
  T.aim(c[0] + 0.5, c[1] + 0.5, c[2] + 0.5);
  return { c, target: g.target?.type };
});
await page.mouse.click(640, 360, { button: 'middle' });
r = await ev((c) => { const g = window.game, s = { sel: g.inv.sel, held: g.inv.slots[g.inv.sel], bag: g.inv.slots[20] }; g.blocks.delete(c.join()); g.rebuildBlocks(); return s; }, r.c);
check('middle click (pick block) brings bricks from the backpack into the hand', r.held?.id === 'bricks' && r.sel === 1 && !r.bag, JSON.stringify(r));

// ---------------------------------------------------------------- souboj
r = await ev(() => {
  const g = window.game;
  T.clearInv(); T.give('stone_sword', 1); T.hold('stone_sword');
  const p = g.player.pos, m = g.spawnMob('boar', p.x, p.z - 2.2);
  const hits = [];
  for (const air of [false, true]) {
    const hp = m.hp;
    T.aim(m.pos.x, m.pos.y + m.def.cy, m.pos.z);
    if (air) { g.player.pos.y += 0.8; g.player.vel.y = -2; g.player.onGround = false; T.aim(m.pos.x, m.pos.y + m.def.cy, m.pos.z); g.player.vel.y = -2; }
    g.input.lmb = true; g.tick(0.0001); g.input.lmb = false;
    hits.push(+(hp - m.hp).toFixed(2));
    T.step(10);
  }
  g.mobs.splice(g.mobs.indexOf(m), 1);
  return hits;
});
check('critical hit while falling does 1.5× damage', r[0] === 4 && r[1] === 6, JSON.stringify(r));

// ---------------------------------------------------------------- inventář
await ev(() => { T.clearInv(); T.give('planks', 20); T.give('stick', 5); window.game.openInventory('inv'); });
const [px, py] = await slotXY('inv', 1);
await page.mouse.move(px, py);
await key('5');
r = await ev(() => ({ s4: window.game.inv.slots[4], s1: window.game.inv.slots[1] }));
check('number key over a slot swaps it with that hotbar slot', r.s4?.id === 'stick' && !r.s1, JSON.stringify(r));
const [ox, oy] = await slotXY('inv', 4);
await page.mouse.move(ox, oy);
await key('f');
check('F over a slot moves it to the off-hand', await ev(() => window.game.inv.slots[36]?.id === 'stick' && !window.game.inv.slots[4]));
await page.mouse.move(...(await slotXY('inv', 36)));
await key('q');
check('Q over a slot drops one item from it', await ev(() => window.game.inv.slots[36]?.n === 4 && window.game.drops.size === 1));

await ev(() => { const g = window.game; g.inv.slots[0] = { id: 'planks', n: 7 }; g.inv.slots[9] = { id: 'planks', n: 30 }; g.inv.slots[10] = { id: 'planks', n: 5 }; });
await ev(() => window.game.closeInventory());
await ev(() => window.game.openInventory('inv'));
await clickSlot('inv', 0, { clickCount: 2 }); // a real double-click: down, up, down, up
r = await ev(() => ({ cur: window.game.inv.cursor, s9: window.game.inv.slots[9], s10: window.game.inv.slots[10] }));
check('double-click collects matching items onto the cursor', r.cur?.id === 'planks' && r.cur.n === 42 && !r.s9 && !r.s10, JSON.stringify(r));

// Drag with the left button over three empty slots: 42 → 14 each.
let [a1, a2] = await slotXY('inv', 20), [b1, b2] = await slotXY('inv', 21), [c1, c2] = await slotXY('inv', 22);
await page.mouse.move(a1, a2); await page.mouse.down(); await page.mouse.move(b1, b2, { steps: 3 }); await page.mouse.move(c1, c2, { steps: 3 }); await page.mouse.up();
r = await ev(() => [20, 21, 22].map((i) => window.game.inv.slots[i]?.n).concat(window.game.inv.cursor?.n ?? 0));
check('left-drag splits the stack evenly', JSON.stringify(r) === '[14,14,14,0]', JSON.stringify(r));
await clickSlot('inv', 20); // 14 in the cursor
[a1, a2] = await slotXY('inv', 30); [b1, b2] = await slotXY('inv', 31); [c1, c2] = await slotXY('inv', 32);
await page.mouse.move(a1, a2); await page.mouse.down({ button: 'right' }); await page.mouse.move(b1, b2, { steps: 3 }); await page.mouse.move(c1, c2, { steps: 3 }); await page.mouse.up({ button: 'right' });
r = await ev(() => [30, 31, 32].map((i) => window.game.inv.slots[i]?.n).concat(window.game.inv.cursor?.n ?? 0));
check('right-drag puts one item in each slot', JSON.stringify(r) === '[1,1,1,11]', JSON.stringify(r));
await page.mouse.click(40, 40); // outside the window: drop the whole cursor stack
r = await ev(() => ({ cur: window.game.inv.cursor, drops: [...window.game.drops.values()].map((d) => d.n) }));
check('clicking outside the window drops what the cursor holds', !r.cur && r.drops.includes(11), JSON.stringify(r));

await ev(() => { const g = window.game; for (let i = 9; i < 36; i++) g.inv.slots[i] = null; for (const i of [12, 17, 25]) g.inv.slots[i] = { id: 'log', n: 2 }; for (let i = 0; i < 9; i++) g.inv.slots[i] = null; });
await ev(() => { window.game.closeInventory(); window.game.openInventory('inv'); });
await page.keyboard.down('Shift'); // (page.mouse.click ignores `modifiers`)
await clickSlot('inv', 12, { clickCount: 2 });
await page.keyboard.up('Shift');
r = await ev(() => ({ bag: window.game.inv.slots.slice(9, 36).filter((s) => s?.id === 'log').length, hot: window.game.inv.slots.slice(0, 9).filter((s) => s?.id === 'log').reduce((n, s) => n + s.n, 0) }));
check('Shift + double-click moves every stack of that item', r.bag === 0 && r.hot === 6, JSON.stringify(r));

await ev(() => { const g = window.game; T.clearInv(); T.give('log', 3); g.closeInventory(); g.openInventory('inv'); });
await page.locator('#recipes [data-r="0"]').click();
await page.locator('#craftArea [data-out]').click();
await ev(() => window.game.closeInventory?.() && 0);
await ev(() => { const g = window.game; g.openInventory('inv'); });
r = await ev(() => window.game.ui.craft.filter(Boolean).length);
await page.locator('#recipes [data-r="0"]').click();
await page.locator('#craftArea [data-out]').click();
await page.mouse.click(40, 40);
await key(' ');
r = await ev(() => ({ grid: window.game.ui.craft.find(Boolean), logs: T.count('log') }));
check('Space repeats the last recipe from the recipe book', r.grid?.id === 'log' && r.logs === 0, JSON.stringify(r));

await page.locator('#controlsBtn').click();
r = await ev(() => ({ show: getComputedStyle(document.getElementById('controlsHelp')).display, text: document.getElementById('controlsHelp').textContent }));
check('"Ovládání" button shows every control in Czech', r.show !== 'none' && ['Ctrl+Q', 'Shift + dvojklik', 'F5', 'plížení', 'Prostřední'].every((t) => r.text.includes(t)));
await page.mouse.click(640, 100);
await ev(() => window.game.closeInventory());

// ---------------------------------------------------------------- Shift + pravé tlačítko na stůl
r = await ev(() => {
  const g = window.game;
  T.spot(); T.clearInv(); T.give('planks', 4);
  // Stůl na podstavci z kamene, ať na něj míříme přímo (svah terénu by ho mohl zakrýt).
  const p = g.player.pos, wb = [Math.floor(p.x), Math.floor(p.y) + 1, Math.floor(p.z) - 2];
  g.blocks.set([wb[0], wb[1] - 1, wb[2]].join(), 'cobble');
  g.blocks.set(wb.join(), 'workbench'); g.rebuildBlocks();
  T.hold('planks');
  g.keys.add('ShiftLeft'); T.step(8, 0.02);
  T.aim(wb[0] + 0.5, wb[1] + 0.5, wb[2] + 0.98);
  const target = g.target?.type;
  g.input.rmb = true; T.step(1); g.input.rmb = false; g.keys.clear(); T.step(8, 0.02);
  const placed = [...g.blocks].filter(([, t]) => t === 'planks').map(([k]) => k);
  const res = { target, open: g.ui.open, placed, planks: T.count('planks') };
  for (const k of [...placed, wb.join(), [wb[0], wb[1] - 1, wb[2]].join()]) g.blocks.delete(k);
  g.rebuildBlocks();

  return res;
});
check('Shift + right click on a workbench places a block instead of opening it', r.target === 'workbench' && !r.open && r.placed.length === 1 && r.planks === 3, JSON.stringify(r));

// ---------------------------------------------------------------- F klávesy
await key('F1');
r = await ev(() => document.body.classList.contains('hud-off') && getComputedStyle(document.getElementById('hotbar')).visibility === 'hidden');
await key('F1');
check('F1 hides the HUD and shows it again', r && !(await ev(() => document.body.classList.contains('hud-off'))));
await key('F3');
await ev(() => T.step(6));
r = await ev(() => ({ show: getComputedStyle(document.getElementById('debug')).display, text: document.getElementById('debug').textContent }));
check('F3 shows the debug screen (position, facing, FPS)', r.show === 'block' && /XYZ: -?\d/.test(r.text) && r.text.includes('Směr:') && r.text.includes('FPS'), r.text.split('\n')[1]);
await page.keyboard.down('F3'); await key('b'); await page.keyboard.up('F3');
r = await ev(() => ({ boxes: window.game.fk.boxes, debug: window.game.fk.debug }));
check('F3+B toggles hitboxes and keeps the debug screen open', r.boxes && r.debug, JSON.stringify(r));
await page.keyboard.down('F3'); await key('b'); await page.keyboard.up('F3');
await key('F3');
check('F3 again hides the debug screen', await ev(() => getComputedStyle(document.getElementById('debug')).display === 'none'));
r = await ev(async () => {
  const g = window.game, eye = g.player.pos.y + g.player.eyeH;
  const out = [];
  for (let i = 0; i < 3; i++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F5', cancelable: true }));
    T.step(2);
    const c = g.camera.position, p = g.player.pos;
    out.push({ mode: g.view.mode, dist: +Math.hypot(c.x - p.x, c.y - eye, c.z - p.z).toFixed(2) });
  }
  return out;
});
check('F5 cycles first person → behind → in front → first person', r.map((x) => x.mode).join() === '1,2,0' && r[0].dist > 2 && r[1].dist > 2 && r[2].dist < 0.2, JSON.stringify(r));
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), key('F2')]);
check('F2 saves a screenshot (PNG download)', download && /^rise-\d{4}-\d\d-\d\d_\d\d\.\d\d\.\d\d\.png$/.test(download.suggestedFilename()), download?.suggestedFilename());
check('hint line mentions the new controls', (await ev(() => document.getElementById('hint').textContent)).includes('Shift plížení'));

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
server.srv.close();
const passed = results.filter((x) => x.ok).length;
console.log(`\n${passed}/${results.length} passed`);
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ passed, total: results.length, results }, null, 2));
process.exit(passed === results.length ? 0 : 1);
