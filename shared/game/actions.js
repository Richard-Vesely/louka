// ============================================================ akce hráčů
// Každá změna světa nebo inventáře je akce: zpráva { t: 'jméno akce', ...údaje }.
// Server (nebo hra pro jednoho hráče) ji tady zkontroluje a provede.
// Kontroly "je to na dosah / není to moc rychle" běží jen když game.validate je true (na serveru).
import { ITEMS, TOOL_SPEED } from '../items.js';
import { BLOCKS, bkey } from '../blocks.js';
import { RECIPES } from '../recipes.js';
import { COOKING } from '../cooking.js';
import { REACH } from '../constants.js';
import { randInt } from '../math.js';
import { terrainH } from '../terrain.js';
import { treeAt, rockAt } from '../worldgen.js';
import { setBlock } from './world.js';
import { OFFHAND } from '../constants.js';
import { heldStack, toolOf, playerIntersects, eyeDist } from './player.js';
import { addItem, consumeSelected, pickItem } from './inventory.js';
import { slotClick, takeResult, fillRecipe, fillCooking, openWindow, closeWindow, container, swapSlot, collectToCursor, spreadCursor, quickMoveAll } from './crafting.js';
import { hitMob } from './mobs.js';
import { throwDrop } from './drops.js';

/** Kritický zásah (úder při pádu, jako v Minecraftu) dává 1,5× víc. Úder v běhu odhodí 1,7× dál. */
export const CRIT = 1.5, SPRINT_KNOCKBACK = 1.7;

// Smí hráč sáhnout do políčka c/i otevřeného okna? (táborák jen v okně táboráku, mřížka jen do její velikosti)
const windowSlotOk = (p, c, i) => p.ui.open && !(c === 'fire' && p.ui.mode !== 'fire') && !(c === 'craft' && (p.ui.mode === 'fire' || i >= p.ui.size * p.ui.size));

const SLACK = 1.5; // tolerance dosahu (pozice z internetu jsou trochu zpožděné)

// Jde cíl vytěžit? Kontroluje nástroj, dosah a jak rychle hráč těží.
function canBreak(game, p, { hard, tool: kind, req }, dist) {
  const tool = toolOf(heldStack(p));
  if (req && !(tool && tool.tool === req.tool && tool.tier >= req.tier)) return false;
  if (game.validate) {
    if (dist > REACH + SLACK) return false;
    const speed = tool && tool.tool === kind ? TOOL_SPEED[tool.tier] : 1;
    if (game.gameTime - p.lastBreak < 0.7 * hard / speed) return false;
  }
  p.lastBreak = game.gameTime;
  return true;
}

// "t12,-4" -> [12, -4]
const cellOf = (key) => key.slice(1).split(',').map(Number);

// Okno táboráku: kdo naposled přiložil, a všem pošli nový obsah.
function fireChanged(game, p) {
  if (p.ui.mode !== 'fire' || !p.ui.fireKey) return;
  const f = game.world.fires.get(p.ui.fireKey);
  if (!f) return;
  if (f.slots[0]) f.by = p.name;
  game.broadcast({ t: 'fire', k: p.ui.fireKey, f });
}

export const ACTIONS = {
  /**
   * Kde hráč je (posílá prohlížeč 10× za sekundu; pohyb počítá prohlížeč).
   * Server jen hlídá, že hráč neletí rychleji, než se dá běžet; jinak ho vrátí zprávou 'correct'.
   */
  move(game, p, { p: [x, y, z], yaw, pitch, sp, sn }) {
    if (!p.alive) return;
    const el = Math.max(game.gameTime - p.lastMoveT, 0.05);
    const ok = !game.validate || (Math.hypot(x - p.pos.x, z - p.pos.z) <= 14 * el + 1.5 && Math.abs(y - p.pos.y) <= 42 * el + 2);
    if (!ok) {
      if (game.gameTime - p.lastCorrect > 0.5) { p.lastCorrect = game.gameTime; game.send(p, { t: 'correct', p: [p.pos.x, p.pos.y, p.pos.z] }); }
      return;
    }
    p.pos.x = x; p.pos.y = y; p.pos.z = z;
    p.yaw = yaw; p.pitch = pitch; p.sprinting = sp; p.sneaking = !!sn;
    p.lastMoveT = game.gameTime;
  },

  /** Vybrat políčko hotbaru 0–8. */
  select(game, p, { i }) { p.inv.sel = i; },

  /** Otevřít inventář / pracovní stůl / táborák. */
  open(game, p, { mode, k }) {
    if (mode !== 'inv') {
      const want = mode === 'bench' ? 'workbench' : 'campfire';
      const ok = game.world.blocks.get(k) === want && (!game.validate || eyeDist(p, ...k.split(',').map((v) => +v + 0.5)) <= REACH + SLACK);
      if (game.validate && !ok) { mode = 'inv'; k = null; }
    }
    openWindow(p, mode, mode === 'fire' ? k : null);
  },

  /** Zavřít okno (věci z mřížky a kurzoru se vrátí do batohu). */
  close(game, p) { closeWindow(p, game.tell(p)); },

  /** Klik na políčko inventáře, mřížky nebo táboráku. */
  slot(game, p, { c, i, button, shift }) {
    if (!p.ui.open || (c === 'fire' && p.ui.mode !== 'fire') || (c === 'craft' && i >= p.ui.size * p.ui.size)) return;
    slotClick(p, game.world, c, i, button, shift);
    fireChanged(game, p);
  },

  /** Vzít výsledek výroby. */
  take(game, p, { shift }) { if (p.ui.open) takeResult(p, shift, game.tell(p)); },

  /** Kniha receptů: rozložit suroviny receptu číslo `r`. */
  fill(game, p, { r, shift }) { if (p.ui.open && RECIPES[r]) fillRecipe(p, RECIPES[r], shift, game.tell(p)); },

  /** Vložit surovinu `id` do otevřeného táboráku. */
  cook(game, p, { id }) {
    if (!p.ui.open || p.ui.mode !== 'fire' || !COOKING[id]) return;
    fillCooking(p, game.world, id, game.tell(p));
    fireChanged(game, p);
  },

  /** Sníst, co hráč drží (off = z druhé ruky). */
  eat(game, p, { off } = {}) {
    const s = heldStack(p, off), d = s && ITEMS[s.id];
    if (!d?.food) return;
    if (p.hunger >= 100 && !(d.heal && p.hp < 100)) { game.send(p, { t: 'toast', text: 'Nemáš hlad' }); return; }
    p.hunger = Math.min(100, p.hunger + d.food);
    if (d.heal) p.hp = Math.min(100, p.hp + d.heal);
    consumeSelected(p, off);
    game.send(p, { t: 'sound', name: 'eat' });
  },

  /** Položit blok z ruky (off = z druhé ruky) na políčko `cell` [x, y, z]. */
  place(game, p, { cell, off }) {
    const w = game.world, s = heldStack(p, off), d = s && ITEMS[s.id];
    if (!d?.block) return;
    const k = bkey(...cell);
    if (w.blocks.has(k)) return;
    if (game.validate && eyeDist(p, cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5) > REACH + SLACK + 1) return;
    if (BLOCKS[d.block].solid) for (const q of game.players.values()) if (q.alive && playerIntersects(q, ...cell)) return;
    setBlock(w, k, d.block);
    p.placedAny[d.block] = true;
    consumeSelected(p, off);
    game.broadcast({ t: 'block', k, b: d.block });
    game.broadcast({ t: 'fx', k: 'place', x: cell[0] + 0.5, y: cell[1] + 0.5, z: cell[2] + 0.5 }, { x: cell[0], z: cell[2] });
  },

  /** Vytěžit cíl: strom (key), balvan (key), blok (cell) nebo trávu (point). */
  break(game, p, msg) {
    const w = game.world, tell = game.tell(p);
    if (msg.kind === 'tree') {
      const tr = treeAt(...cellOf(msg.key), w.removed);
      if (!tr || !canBreak(game, p, { hard: 2.4 * tr.s, tool: 'axe' }, Math.hypot(p.pos.x - tr.x, p.pos.z - tr.z))) return;
      w.removed.add(tr.key);
      addItem(p, 'log', (tr.pine ? 4 : 3) + randInt(0, 2), tell);
      if (Math.random() < 0.4) addItem(p, 'stick', randInt(1, 3), tell);
      if (!tr.pine && Math.random() < 0.3) addItem(p, 'berries', randInt(1, 3), tell);
      game.broadcast({ t: 'removed', key: tr.key });
      game.broadcast({ t: 'fx', k: 'break', what: 'tree', x: tr.x, y: terrainH(tr.x, tr.z) - 0.2 + tr.trunkH, z: tr.z }, tr);
    } else if (msg.kind === 'rock') {
      const r = rockAt(...cellOf(msg.key), w.removed);
      if (!r || !canBreak(game, p, { hard: r.iron ? 4.5 : 3, tool: 'pick', req: { tool: 'pick', tier: r.iron ? 2 : 1 } }, eyeDist(p, r.x, r.y, r.z) - r.s)) return;
      w.removed.add(r.key);
      if (r.iron) { addItem(p, 'iron_ore', randInt(2, 3), tell); addItem(p, 'stone', 1, tell); }
      else addItem(p, 'stone', 2 + Math.floor(r.s * 3), tell);
      game.broadcast({ t: 'removed', key: r.key });
      game.broadcast({ t: 'fx', k: 'break', what: r.iron ? 'iron' : 'rock', x: r.x, y: r.y + 0.3, z: r.z }, r);
    } else if (msg.kind === 'block') {
      const k = bkey(...msg.cell), type = w.blocks.get(k), b = BLOCKS[type];
      if (!b) return;
      const [x, y, z] = msg.cell;
      if (!canBreak(game, p, { hard: b.hard, tool: b.tool, req: b.req ? { tool: 'pick', tier: b.req } : null }, eyeDist(p, x + 0.5, y + 0.5, z + 0.5) - 0.9)) return;
      setBlock(w, k, null);
      addItem(p, b.drop, 1, tell);
      if (w.fires.has(k)) {
        for (const s of w.fires.get(k).slots) if (s) addItem(p, s.id, s.n, tell);
        w.fires.delete(k);
        game.broadcast({ t: 'fire', k, f: null });
      }
      game.broadcast({ t: 'block', k, b: null });
      game.broadcast({ t: 'fx', k: 'break', what: type, x: x + 0.5, y: y + 0.5, z: z + 0.5 }, { x, z });
    } else if (msg.kind === 'ground') {
      const [x, y, z] = msg.point;
      if (Math.hypot(x, z) < 9.6 || !canBreak(game, p, { hard: 0.45 }, eyeDist(p, x, y, z))) return;
      addItem(p, 'fiber', randInt(1, 2), tell);
      if (Math.random() < 0.15) addItem(p, 'berries', 1, tell);
      game.broadcast({ t: 'grass', x, z });
      game.broadcast({ t: 'fx', k: 'break', what: 'ground', x, y, z }, { x, z });
    }
  },

  /** Udeřit tvora číslo `id` tím, co hráč drží. crit = hráč padal (po výskoku) a neběžel. */
  hit(game, p, { id, crit }) {
    const m = game.mobs.find((q) => q.id === id);
    if (!m || m.dead) return;
    if (game.validate) {
      if (eyeDist(p, m.pos.x, m.pos.y + m.def.cy, m.pos.z) > REACH + m.def.radius + SLACK) return;
      if (game.gameTime - p.lastHit < 0.3) return;
    }
    p.lastHit = game.gameTime;
    const tool = toolOf(heldStack(p)), dmg = tool ? tool.dmg : 1;
    crit = !!crit && !p.sprinting;
    hitMob(game, p, m, crit ? dmg * CRIT : dmg, p.sprinting ? SPRINT_KNOCKBACK : 1, crit);
  },

  /**
   * Vyhodit věci na zem (Q, Ctrl+Q = celou hromádku).
   * Bez `c`: z ruky. c = 'inv' | 'craft' | 'fire' + i: z políčka v okně. c = 'cur': z kurzoru (klik mimo okno).
   */
  drop(game, p, { c, i, all }) {
    let arr = p.inv.slots, idx = p.inv.sel;
    if (c === 'cur') { arr = p.inv; idx = 'cursor'; }
    else if (c) { if (!windowSlotOk(p, c, i)) return; arr = container(p, game.world, c); idx = i; }
    const s = arr[idx];
    if (!s) return;
    const n = all ? s.n : 1;
    if (!(s.n -= n)) arr[idx] = null;
    p.invDirty = true;
    throwDrop(game, p, s.id, n);
    if (c === 'fire') fireChanged(game, p);
    if (c === 'craft') p.ui.ghost = null;
  },

  /** Prostřední tlačítko: vzít do ruky předmět `id` (z hotbaru nebo z batohu). */
  pick(game, p, { id }) { pickItem(p, id); },

  /** Klávesa 1–9 / F nad políčkem v okně: prohodit s hotbarem `h` (36 = druhá ruka). Bez `c`: F prohodí ruce. */
  swap(game, p, { c, i, h }) {
    if (c === undefined) { swapSlot(p, game.world, 'inv', p.inv.sel, OFFHAND); return; }
    if (!windowSlotOk(p, c, i)) return;
    swapSlot(p, game.world, c, i, h);
    fireChanged(game, p);
  },

  /** Dvojklik: posbírat stejné věci do kurzoru. */
  collect(game, p) { if (p.ui.open) collectToCursor(p); },

  /** Tažení s věcí v kurzoru přes víc políček: rozdělit (button 0) nebo po jednom (button 2). */
  spread(game, p, { cells, button }) {
    if (!p.ui.open) return;
    spreadCursor(p, game.world, cells, button);
    fireChanged(game, p);
  },

  /** Shift + dvojklik: přesunout všechny hromádky předmětu `id`. */
  moveall(game, p, { c, i, id }) {
    if (windowSlotOk(p, c, i)) quickMoveAll(p, game.world, c, i, id);
  },
};
