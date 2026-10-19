// Screenshots of tools and combat feel (cracks, chips, durability bars, tooltips, repair, hand, attack meter).
// Usage: node tests/playtest/tools-shots.mjs [dist] [out-dir] [quality]
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { launch, serveDir, openPage, waitGame } from './lib.mjs';

const target = process.argv[2] || 'dist';
const outDir = process.argv[3] || 'shots';
const quality = process.argv[4] || 'medium';
fs.mkdirSync(outDir, { recursive: true });
const server = await serveDir(path.resolve(target));
// GPU=1: real graphics card (much faster than software WebGL, nicer pictures)
const browser = process.env.GPU ? await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required'] }) : await launch();
const page = await openPage(browser, server.url, { viewport: { width: 1280, height: 720 } });
await page.evaluate((q) => localStorage.setItem('rise-nastaveni', JSON.stringify({ quality: q })), quality);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.fill('#mName', 'Tester');
await page.click('#mSolo');
await waitGame(page);
const ev = (fn, arg) => page.evaluate(fn, arg);
async function snap(name, before) {
  await ev(() => { window.__skipDraw = false; });
  if (before) await ev(before);
  await ev(() => { window.game.tick(0.0001); window.game.testMode = false; }); // čas stojí, ať se během snímku nic nezmění
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, name + '.png'), timeout: 120000 });
  await ev(() => { window.__skipDraw = true; window.game.testMode = true; });
  console.log('shot', name);
}
await ev(() => {
  const g = window.game;
  document.getElementById('intro').style.display = 'none';
  g.setTime(0.35);
  T.tpg = (x, z) => { const y = g.groundHeight(x, z); T.tp(x, z, y); };
  T.tpg(6, 30); T.step(30);
});

// 1) mining a stone wall: cracks + chips + swinging pickaxe
await ev(() => {
  const g = window.game; T.clearInv(); T.give('stone_pick', 1); T.give('wood_pick', 1); T.give('iron_sword', 1); T.give('iron_axe', 1); T.give('crystal_shovel', 1); T.give('torch', 12); T.hold('stone_pick');
  g.inv.slots[1].w = 40; g.inv.slots[2].w = 230; g.inv.slots[3].w = 120; g.inv.slots[0].w = 30;
  const p = g.player.pos, y = Math.floor(p.y);
  for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy <= 2; dy++) g.blocks.set(`${Math.floor(p.x) + dx},${y + dy},${Math.floor(p.z) - 3}`, dy === 1 && dx === 0 ? 'cobble' : 'bricks');
  g.rebuildBlocks(); T.step(2);
  T.aim(Math.floor(p.x) + 0.5, y + 1.5, Math.floor(p.z) - 3 + 1);
  g.input.lmb = true; T.step(8); // ~60 % hotovo
  g.testMode = false; // mezi voláními hra sama neběží (jinak by blok dotěžila)
});
await snap('1-mining-cracks', () => { const g = window.game; g.testMode = true; g.input.lmb = true; T.step(1, 0.03); g.renderHotbar?.(); });
const st = await ev(() => ({ ...window.game.mineState(), stage: window.game.crackStage() }));
await ev(() => { window.game.setTime(0.6); window.game.input.lmb = false; T.step(1, 0.0001); window.game.input.lmb = true; window.game.testMode = false; });
await snap('1b-mining-cracks-sunlit', () => { const g = window.game; g.testMode = true; g.input.lmb = true; T.step(1, 0.03); });
await ev(() => { window.game.setTime(0.35); window.game.input.lmb = false; T.step(1, 0.0001); });
console.log('mine state', JSON.stringify(st));
await ev(() => { const g = window.game; g.input.lmb = true; T.step(30); g.input.lmb = false; T.step(1, 0.0001); });
await snap('2-break-debris', () => { T.step(1, 0.02); });

// 3) inventory with worn tools and a tooltip
await ev(() => { const g = window.game; g.armor[0] = { id: 'crystal_helmet', n: 1, w: 260 }; g.armor[1] = { id: 'iron_chestplate', n: 1, w: 40 }; g.openInventory('inv'); });
const box = await page.locator('#invHot .slot[data-i="2"]').boundingBox();
await page.mouse.move(box.x + 20, box.y + 20);
await snap('3-inventory-tooltip');
// 4) repair in the crafting grid
await ev(() => {
  const g = window.game;
  g.ui.craft[0] = { id: 'iron_sword', n: 1, w: 230 }; g.ui.craft[1] = { id: 'iron_sword', n: 1, w: 150 };
  g.slotClick('inv', 30, 0, false); g.slotClick('inv', 30, 0, false);
});
const out = await page.locator('[data-out]').boundingBox();
await page.mouse.move(out.x + 20, out.y + 20);
await snap('4-repair');
await ev(() => { window.game.ui.craft[0] = window.game.ui.craft[1] = null; window.game.closeInventory(); });

// 5) empty hand + attack meter at a sheep
await ev(() => {
  const g = window.game; T.holdNothing();
  const p = g.player.pos;
  g.spawnMob('sheep', p.x + 2.2, p.z + 0.3);
  const m = g.mobs[g.mobs.length - 1]; m.idleT = 99; m.moving = false; T.step(2);
  T.aim(m.pos.x, m.pos.y + m.def.cy, m.pos.z);
  g.input.lmb = true; T.step(1); g.input.lmb = false; T.step(2, 0.03);
});
await snap('5-hand-punch-meter');
// 6) crit with a sword: jumping and falling
await ev(() => {
  const g = window.game; T.hold('iron_sword'); T.step(30);
  const p = g.player.pos;
  g.spawnMob('cow', p.x + 0.4, p.z - 2.4);
  const m = g.mobs[g.mobs.length - 1]; m.idleT = 99; m.moving = false; T.step(1, 0.0001);
  g.player.vel.y = -3; g.player.onGround = false;
  T.aim(m.pos.x, m.pos.y + m.def.cy, m.pos.z);
  g.player.vel.y = -3; g.player.onGround = false;
  g.input.lmb = true; g.tick(0.016); g.input.lmb = false; T.step(3, 0.03);
});
await snap('6-crit-hit');
// 8) digging the ground: crack decal on the slope
await ev(() => {
  const g = window.game; T.give('stone_shovel', 1); T.hold('stone_shovel'); g.renderHotbar();
  T.tpg(-20, 40); T.step(5);
  const p = g.player.pos, cx = Math.floor(p.x), cz = Math.floor(p.z) - 2;
  T.aim(cx + 0.5, g.groundHeight(cx + 0.5, cz + 0.5), cz + 0.5);
  T.mineUntil(() => g.target?.kind === 'vox', 200); // nejdřív tráva
  g.input.lmb = true; T.step(6);
});
await snap('8-dig-decal', () => { const g = window.game; g.input.lmb = true; T.step(1, 0.02); });
console.log('dig', JSON.stringify(await ev(() => { const g = window.game, t = g.target; return { kind: t?.kind, surface: t?.surface, cell: t?.cell, st: g.mineState(), stage: g.crackStage(), top: g.topY(t.cell[0], t.cell[2]), dug: g.columnDug(t.cell[0], t.cell[2]) }; })));
await ev(() => { window.game.input.lmb = false; T.step(1, 0.0001); });
await snap('8b-dig-after');
// 9) chopping a tree: chips, falling leaves, progress ring
await ev(() => {
  const g = window.game; T.give('iron_axe', 1); T.hold('iron_axe'); g.renderHotbar();
  const t = [...g.forestTrees].sort((a, b) => Math.hypot(a.x - g.player.pos.x, a.z - g.player.pos.z) - Math.hypot(b.x - g.player.pos.x, b.z - g.player.pos.z))[0];
  T.tpg(t.x + 2, t.z); T.step(5); T.aim(t.x, t.y + 1.3, t.z);
  g.input.lmb = true; T.step(8);
});
await snap('9-chop-tree', () => { const g = window.game; g.input.lmb = true; T.step(1, 0.02); });
await ev(() => { window.game.input.lmb = false; T.step(1, 0.0001); });
// 10) night: mining crystal ore underground glow
// 7) tool breaks
await ev(() => { const g = window.game; T.hold('wood_pick'); g.inv.slots[0].w = 58; T.step(10); g.wearHeld(1); T.step(2, 0.04); });
await snap('7-tool-break');
console.log('errors', page.errors.join(' | '));
await browser.close();
await server.close();
