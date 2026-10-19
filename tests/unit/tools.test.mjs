// Unit tests of tools and combat rules (shared/tools.js): durability, mining speed, attack charge, repair, wear in saves and over the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../../shared/data/index.js';
import { insertStack } from '../../shared/inventory.js';
import { NET } from '../../shared/net/net.js';
import { applyOp } from '../../shared/net/ops.js';
import { claimGroundItem, groundItems, spawnGroundItem } from '../../shared/sim/ground-items.js';
import { hurtMob, mobs, spawnMob, updateMobs } from '../../shared/sim/mobs.js';
import {
  BREAK_PAUSE, INSTANT, armorWear, attackCharge, attackResult, attackSpeed, breakTime, breaksSoonVerb, brokeVerb, chargeMult, durFrac, durLeft,
  isLow, isWorn, lacksTool, maxDur, part, repairResult, useCost, wear,
} from '../../shared/tools.js';
import { Vec3 } from '../../shared/vec3.js';
import { cleanMe } from '../../server/me.js';

test('durability per material (wood 59 → markorite 2000), armor and utensils', () => {
  assert.deepEqual(['wood_pick', 'stone_axe', 'iron_sword', 'crystal_shovel', 'markorite_pick'].map(maxDur), [59, 131, 250, 900, 2000]);
  assert.deepEqual(['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots'].map(maxDur), [165, 240, 225, 195]);
  assert.ok(maxDur('markorite_chestplate') > maxDur('crystal_chestplate') && maxDur('crystal_chestplate') > maxDur('iron_chestplate'));
  assert.ok(maxDur('shadow_boots') > 0 && maxDur('sky_helmet') > 0);
  assert.equal(maxDur('hoe'), 131);
  assert.equal(maxDur('fishing_rod'), 64);
  assert.equal(maxDur('stone'), 0);
  assert.equal(maxDur('knife'), 0, 'kitchen utensils do not wear');
  for (const [id, d] of Object.entries(ITEMS)) if (d.dur) assert.equal(d.stack, 1, `${id} with durability does not stack`);
});

test('wear: counts up, breaks at max, old stacks without w are new', () => {
  const s = { id: 'wood_pick', n: 1 };
  assert.equal(durLeft(s), 59);
  assert.equal(isWorn(s), false);
  assert.equal(durFrac(s), 1);
  assert.equal(wear(s, 1), false);
  assert.equal(s.w, 1);
  assert.ok(isWorn(s));
  s.w = 53;
  assert.equal(isLow(s), false, '6 of 59 left is just over 10 %');
  s.w = 54;
  assert.equal(isLow(s), true, '≤ 10 % left');
  assert.equal(wear(s, 4), false);
  assert.equal(wear(s, 1), true, 'breaks at 59');
  assert.equal(durLeft(s), 0);
  const stone = { id: 'stone', n: 5 };
  assert.equal(wear(stone, 3), false);
  assert.equal(stone.w, undefined, 'items without durability never get w');
  assert.deepEqual(part({ id: 'iron_pick', n: 1, w: 7 }, 1), { id: 'iron_pick', n: 1, w: 7 });
  assert.deepEqual(part({ id: 'stone', n: 9 }, 4), { id: 'stone', n: 4 });
});

test('use cost: right tool 1, wrong job 2, instant blocks free, sword hits 1, other tools hit 2', () => {
  assert.equal(useCost('iron_pick', 'mine', { tool: 'pick' }), 1);
  assert.equal(useCost('iron_pick', 'mine', { tool: 'axe' }), 2);
  assert.equal(useCost('iron_sword', 'mine', { tool: 'pick' }), 2);
  assert.equal(useCost('iron_pick', 'mine', { tool: 'pick', instant: true }), 0);
  assert.equal(useCost('iron_sword', 'hit'), 1);
  assert.equal(useCost('iron_axe', 'hit'), 2);
  assert.equal(useCost('hoe', 'use'), 1);
  assert.equal(useCost('stone', 'mine', { tool: 'pick' }), 0);
  assert.equal(useCost(null, 'hit'), 0);
  assert.equal(armorWear(8), 1);
  assert.equal(armorWear(45), 2);
  assert.equal(armorWear(0), 0);
});

test('mining speed: tier speeds, hand, underwater and in the air', () => {
  const stone = { hard: 2.2, tool: 'pick' };
  assert.equal(breakTime(stone, null), 2.2);
  assert.equal(breakTime(stone, 'wood_pick'), 1.1);
  assert.ok(Math.abs(breakTime(stone, 'stone_pick') - 0.55) < 1e-9);
  assert.ok(breakTime(stone, 'markorite_pick') < breakTime(stone, 'crystal_pick'));
  assert.equal(breakTime(stone, 'iron_axe'), 2.2, 'wrong tool = hand speed');
  assert.equal(breakTime(stone, 'stone_pick', { underwater: true }), 0.55 * 3);
  assert.equal(breakTime(stone, 'stone_pick', { airborne: true }), 0.55 * 2.5);
  assert.ok(breakTime({ hard: 0.45, kind: 'grass' }, 'iron_sword') < 0.45, 'sword cuts grass faster');
  assert.ok(INSTANT < 0.1 && BREAK_PAUSE === 0.3);
  assert.equal(lacksTool({ tool: 'pick', tier: 2 }, 'wood_pick'), true);
  assert.equal(lacksTool({ tool: 'pick', tier: 2 }, 'iron_pick'), false);
  assert.equal(lacksTool(null, null), false);
});

test('attack: charge, damage multiplier, crit and sprint knockback', () => {
  assert.equal(attackSpeed(null), 4);
  assert.equal(attackSpeed('iron_sword'), 1.7);
  assert.ok(attackSpeed('iron_axe') < attackSpeed('iron_sword'));
  assert.equal(attackCharge(0, 'iron_sword') < 0.1, true);
  assert.equal(attackCharge(1, 'iron_sword'), 1);
  assert.equal(chargeMult(0), 0.2);
  assert.equal(chargeMult(1), 1);
  const full = attackResult('iron_sword', 1, { onGround: true });
  assert.deepEqual(full, { dmg: 6, crit: false, kb: 1 });
  const weak = attackResult('iron_sword', 0.2, { onGround: true });
  assert.ok(weak.dmg < 2 && weak.kb < 1);
  const crit = attackResult('iron_sword', 1, { falling: true, onGround: false });
  assert.equal(crit.crit, true);
  assert.equal(crit.dmg, 9);
  assert.equal(attackResult('iron_sword', 1, { falling: true, onGround: false, sprinting: true }).crit, false, 'no crit while sprinting');
  assert.equal(attackResult('iron_sword', 1, { sprinting: true, onGround: true }).kb, 1.6);
  assert.equal(attackResult(null, 1, {}).dmg, 1, 'fist');
});

test('repair in the crafting grid: two worn tools, or a tool and its material', () => {
  const two = repairResult([{ id: 'iron_pick', n: 1, w: 200 }, null, { id: 'iron_pick', n: 1, w: 100 }, null]);
  assert.deepEqual(two, { out: 'iron_pick', n: 1, w: 250 - (50 + 150 + 12), repair: true });
  assert.equal(repairResult([{ id: 'iron_pick', n: 1 }, { id: 'iron_pick', n: 1 }, null, null]), null, 'two new tools: nothing to repair');
  assert.equal(repairResult([{ id: 'iron_pick', n: 1, w: 5 }, { id: 'stone_pick', n: 1, w: 5 }, null, null]), null, 'different tools');
  assert.equal(repairResult([{ id: 'iron_pick', n: 1, w: 5 }, { id: 'iron_pick', n: 1, w: 5 }, { id: 'iron_pick', n: 1, w: 5 }, null]), null);
  const mat = repairResult([{ id: 'iron_pick', n: 1, w: 200 }, { id: 'iron', n: 5 }, { id: 'iron', n: 1 }, null]);
  assert.deepEqual(mat, { out: 'iron_pick', n: 1, w: 200 - 2 * 63, repair: true }, 'each material slot restores 25 %');
  assert.equal(repairResult([{ id: 'iron_pick', n: 1, w: 200 }, { id: 'stone', n: 1 }, null, null]), null, 'wrong material');
  assert.equal(repairResult([{ id: 'wood_axe', n: 1, w: 50 }, { id: 'mark_planks', n: 1 }, null, null]).w, 50 - 15, 'any planks repair wood');
  assert.equal(repairResult([{ id: 'iron_helmet', n: 1, w: 100 }, { id: 'iron', n: 1 }, null, null]).w, 100 - 42, 'armor too');
  assert.equal(repairResult([{ id: 'stone', n: 1 }, { id: 'stone', n: 1 }, null, null]), null);
});

test('Czech messages: tool broke / will break soon (gender and plural)', () => {
  assert.equal(brokeVerb('Železný krumpáč'), 'rozbil');
  assert.equal(brokeVerb('Kamenná sekera'), 'rozbila');
  assert.equal(brokeVerb('Železné brnění'), 'rozbilo');
  assert.equal(brokeVerb('Železné boty'), 'rozbily');
  assert.equal(brokeVerb('Motyka'), 'rozbila');
  assert.equal(breaksSoonVerb('Železné kalhoty'), 'rozbijí');
  assert.equal(breaksSoonVerb('Dřevěný meč'), 'rozbije');
});

test('wear survives chests, the server save check and dropped items', () => {
  const chest = Array(3).fill(null);
  assert.equal(insertStack(chest, { id: 'iron_sword', n: 1, w: 77 }), 0);
  assert.deepEqual(chest[0], { id: 'iron_sword', n: 1, w: 77 });
  const inv = Array(36).fill(null);
  inv[0] = { id: 'iron_pick', n: 1, w: 12 };
  inv[1] = { id: 'iron_pick', n: 1, w: 9999 }; // nesmysl: nástroj bude jako nový
  inv[2] = { id: 'stone', n: 3, w: 5 }; // kámen se neopotřebuje
  const armor = [{ id: 'iron_helmet', n: 1, w: 30 }, null, null, null];
  const me = cleanMe({ inv, armor, pos: [0, 0, 0], yaw: 0, hp: 100, hunger: 100 });
  assert.deepEqual(me.inv.slice(0, 3), [{ id: 'iron_pick', n: 1, w: 12 }, { id: 'iron_pick', n: 1 }, { id: 'stone', n: 3 }]);
  assert.deepEqual(me.armor[0], { id: 'iron_helmet', n: 1, w: 30 });
  // předmět na zemi: opotřebení jde v operaci 'g' (8. prvek) a vrací se při sebrání
  groundItems.length = 0;
  NET.mode = 'host'; NET.ready = true; NET.ops = [];
  try {
    spawnGroundItem('iron_axe', 1, new Vec3(0, 5, 0), new Vec3(), 0.5, 'g-1', 40);
    spawnGroundItem('stone', 2, new Vec3(0, 5, 0), new Vec3(), 0.5, 'g-2');
    assert.equal(NET.ops[0].length, 8);
    assert.equal(NET.ops[0][7], 40);
    assert.equal(NET.ops[1].length, 7, 'items without wear keep the old 7-element op');
    const op = NET.ops[0];
    groundItems.length = 0;
    applyOp(op); // druhá strana
    assert.equal(groundItems[0].w, 40);
    assert.deepEqual(claimGroundItem('g-1'), { id: 'iron_axe', n: 1, w: 40 });
    applyOp(['g', 'g-3', 'iron_axe', 1, [0, 5, 0], [0, 0, 0], 0.5]); // starý klient bez opotřebení
    assert.equal(groundItems.find((g) => g.gid === 'g-3').w, undefined);
  } finally { NET.mode = 'sp'; NET.ready = false; NET.ops = []; groundItems.length = 0; }
});

test('mobs: 0.5 s invulnerability after a hit, knockback scales', () => {
  mobs.length = 0;
  const m = spawnMob('cow', 10, 10);
  assert.equal(hurtMob(m, 2, 0), true);
  const v1 = Math.hypot(m.vel.x, m.vel.z);
  assert.equal(hurtMob(m, 2, 0), false, 'second hit within 0.5 s does nothing');
  assert.equal(m.hp, 8);
  NET.targets = () => [{ pos: new Vec3(10, 0, 30), alive: true, creative: true }];
  try { updateMobs(0.6, 0.5); } finally { NET.targets = () => []; }
  assert.equal(hurtMob(m, 2, 0, 1.6), true, 'hit again after the invulnerability');
  assert.equal(m.hp, 6);
  const m2 = spawnMob('cow', 20, 20);
  hurtMob(m2, 1, 0, 1.6);
  assert.ok(Math.hypot(m2.vel.x, m2.vel.z) > v1 * 1.5, 'sprint hit knocks back further');
  mobs.length = 0;
});
