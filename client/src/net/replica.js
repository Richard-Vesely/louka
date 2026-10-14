// ============================================================ kopie světa ze serveru (online)
// Zprávy ze serveru se tu přepíšou do stejných objektů, které čte grafika: world, player, mobs.
// Ostatní hráči jsou v `others`. Objekty se nevyměňují, jen se mění jejich obsah.
import { MOBS } from '@louka/shared/mobs.js';
import { MOB_TYPES } from '@louka/shared/protocol.js';
import { world, mobs } from '../world/state.js';
import { player } from '../player/state.js';
import { syncClock, pushSample, sampleAt, renderTime } from './interp.js';

/** Ostatní hráči: id -> { id, name, pos, yaw, sneak, samples }. */
export const others = new Map();

/** Přidá dalšího hráče (zpráva 'join' nebo seznam ve 'welcome'). */
export function addOther({ id, name, p, yaw }) {
  const o = { id, name, pos: { x: 0, y: 0, z: 0 }, yaw: 0, samples: [] };
  if (p) { pushSample(o, renderTime(), p[0], p[1], p[2], yaw || 0); sampleAt(o, renderTime()); }
  others.set(id, o);
  return o;
}

/** Celý svět a můj hráč po přihlášení (zpráva 'welcome'). */
export function applyWelcome(msg) {
  const w = msg.world;
  world.blocks.clear();
  for (const [k, t] of w.blocks) world.blocks.set(k, t);
  world.removed.clear();
  for (const k of w.removed) world.removed.add(k);
  world.fires.clear();
  for (const [k, f] of Object.entries(w.fires)) world.fires.set(k, f);
  world.drops.clear();
  for (const d of w.drops || []) world.drops.set(d.k, { ...d, vx: 0, vy: 0, vz: 0, pickAt: 0 });
  world.time.dayTime = w.dayTime;
  world.time.dayCount = w.day;
  world.rev++;
  const y = msg.you;
  player.id = msg.id;
  player.name = y.name;
  player.pos.set(...y.pos);
  player.vel.set(0, 0, 0);
  player.yaw = y.yaw;
  player.ui.open = false;
  applyStats(y);
  applyMe(y, 0);
  mobs.length = 0;
  others.clear();
  for (const o of msg.players) addOther(o);
}

/**
 * Můj inventář a okno (zpráva 'me'). Režim okna (stůl, táborák) přijmeme, až server zpracoval
 * moje poslední "otevři okno" (ack), jinak by okno na chvilku přeskočilo zpátky.
 */
export function applyMe(m, openSeq) {
  player.inv.slots = m.inv;
  player.inv.cursor = m.cur;
  if ((m.ack ?? Infinity) >= openSeq) Object.assign(player.ui, m.ui);
  else { player.ui.craft = m.ui.craft; player.ui.ghost = m.ui.ghost; }
  player.crafted = m.crafted;
  player.placedAny = m.placedAny;
}

/** Zdraví, hlad a jestli žiju (zpráva 'st' nebo 'welcome'). */
export function applyStats({ hp, hu, al }) {
  player.hp = hp;
  player.hunger = hu;
  player.alive = al;
}

/** Pozice ostatních a tvorů (zpráva 'state'). */
export function applyState(msg) {
  syncClock(msg.ts);
  if (msg.time) { world.time.dayTime = msg.time[0]; world.time.dayCount = msg.time[1]; }
  for (const [id, x, y, z, yaw, sn] of msg.pl || []) {
    const o = others.get(id);
    if (o) { pushSample(o, msg.ts, x, y, z, yaw); o.sneak = !!sn; }
  }
  for (const [id, ti, x, y, z, ry, dead] of msg.mobs || []) {
    let m = mobs.find((q) => q.id === id);
    if (!m) {
      const type = MOB_TYPES[ti];
      m = { id, type, def: MOBS[type], pos: { x, y, z }, ry, dead: false, samples: [] };
      mobs.push(m);
    }
    m.dead = !!dead;
    pushSample(m, msg.ts, x, y, z, ry);
  }
  for (const id of msg.mg || []) {
    const i = mobs.findIndex((q) => q.id === id);
    if (i >= 0) mobs.splice(i, 1);
  }
}

/** Posune ostatní hráče a tvory na jejich pozici "teď" (plynule). */
export function interpolate() {
  const t = renderTime();
  for (const o of others.values()) { const r = sampleAt(o, t); if (r !== undefined) o.yaw = r; }
  for (const m of mobs) { const r = sampleAt(m, t); if (r !== undefined) m.ry = r; }
}
