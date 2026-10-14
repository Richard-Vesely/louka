// ============================================================ věci ležící na zemi
// Vyhozené klávesou Q, puštěné z okna inventáře, nebo co se nevešlo do plného batohu.
// Padají, kloužou, slučují se se stejnými věcmi vedle sebe a sebere je kdokoli, kdo k nim dojde.
// Po 5 minutách zmizí (jako v Minecraftu).
//
// Jedna věc na zemi: { k (číslo), id (předmět), n (kolik), x, y, z, vx, vy, vz, age, pickAt }.
// Server posílá zprávu 'drop': a = 'add' (d = [k, id, n, x, y, z, vx, vy, vz]), 'n' (nový počet), 'del' (by = kdo ji sebral).
import { ITEMS } from '../items.js';
import { PW, PH, EYE, OFFHAND } from '../constants.js';
import { groundHeight } from '../terrain.js';
import { r2 } from '../protocol.js';
import { solidAt } from './world.js';
import { insertInto } from './inventory.js';
import { lookDir } from './player.js';

/** Za kolik sekund věc na zemi zmizí. */
export const DROP_LIFE = 300;
const FALL = 16;          // gravitace pro věci
const THROWN_DELAY = 2;   // vyhozenou věc jde sebrat až po 2 s (aby ji hráč hned nesebral zpátky)
const SPILL_DELAY = 0.5;  // co se nevešlo do batohu

/** Založí věc na zemi a řekne o ní všem. */
export function spawnDrop(game, id, n, x, y, z, vx = 0, vy = 0, vz = 0, delay = SPILL_DELAY) {
  const w = game.world;
  const d = { k: w.nextDrop++, id, n, x, y, z, vx, vy, vz, age: 0, pickAt: delay };
  w.drops.set(d.k, d);
  game.broadcast({ t: 'drop', a: 'add', d: [d.k, id, n, r2(x), r2(y), r2(z), r2(vx), r2(vy), r2(vz)] });
  return d;
}

/** Hráč `p` hodí `n` kusů předmětu `id` před sebe (kam se dívá). */
export function throwDrop(game, p, id, n) {
  const dir = lookDir(p), a = Math.random() * Math.PI * 2, j = Math.random() * 0.4;
  return spawnDrop(game, id, n, p.pos.x + dir.x * 0.3, p.pos.y + EYE - 0.3, p.pos.z + dir.z * 0.3,
    dir.x * 5 + Math.cos(a) * j, dir.y * 5 + 1.5, dir.z * 5 + Math.sin(a) * j, THROWN_DELAY);
}

/** Věc vyskočí z hráče (plný batoh). */
export const spillAt = (game, p, id, n) =>
  spawnDrop(game, id, n, p.pos.x, p.pos.y + 0.6, p.pos.z, (Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2);

/** Jak vysoko je pod věcí "podlaha": terén, nebo vršek pevného bloku. */
function floorUnder(w, x, y, z) {
  let g = groundHeight(x, z);
  const bx = Math.floor(x), bz = Math.floor(z);
  for (let by = Math.floor(y); by >= Math.floor(g); by--) if (solidAt(w, bx, by, bz)) return Math.max(g, by + 1);
  return g;
}

/**
 * Fyzika jedné věci: pád, náraz do bloku, tření. Stejný kód běží na serveru i v prohlížeči
 * (online prohlížeč věci jen posouvá; sbírání a mazání řeší server).
 */
export function stepDrop(w, d, dt) {
  d.age += dt;
  d.vy = Math.max(-30, d.vy - FALL * dt);
  const nx = d.x + d.vx * dt, nz = d.z + d.vz * dt;
  if (solidAt(w, Math.floor(nx), Math.floor(d.y), Math.floor(nz))) { d.vx = 0; d.vz = 0; }
  else { d.x = nx; d.z = nz; }
  d.y += d.vy * dt;
  const floor = floorUnder(w, d.x, d.y + 0.5, d.z);
  if (d.y <= floor) {
    d.y = floor; d.vy = 0;
    const f = Math.max(0, 1 - dt * 8);
    d.vx *= f; d.vz *= f;
  }
}

/**
 * Každý krok hry: fyzika, sbírání hráči, slučování stejných věcí a mizení starých.
 * @param {import('./game.js').Game} game
 */
export function updateDrops(game, dt) {
  const w = game.world;
  if (!w.drops.size) return;
  for (const d of w.drops.values()) {
    stepDrop(w, d, dt);
    if (d.age > DROP_LIFE) { removeDrop(game, d); continue; }
    if (d.age < d.pickAt) continue;
    for (const p of game.players.values()) {
      if (!p.alive || Math.hypot(p.pos.x - d.x, p.pos.z - d.z) > PW + 1 || d.y < p.pos.y - 0.5 || d.y > p.pos.y + PH + 0.5) continue;
      const left = insertInto(p, { id: d.id, n: d.n }, 0, OFFHAND);
      if (left === d.n) continue;
      game.send(p, { t: 'feed', id: d.id, n: d.n - left });
      game.send(p, { t: 'sound', name: 'pop' });
      if (left) { d.n = left; game.broadcast({ t: 'drop', a: 'n', k: d.k, n: left }); }
      else { removeDrop(game, d, p.id); break; }
    }
  }
  // Stejné věci ležící u sebe se slijí do jedné hromádky (méně věcí = méně kreslení).
  if ((w.mergeT = (w.mergeT || 0) - dt) > 0) return;
  w.mergeT = 0.5;
  const list = [...w.drops.values()];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!w.drops.has(a.k)) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!w.drops.has(b.k) || a.id !== b.id || a.n + b.n > ITEMS[a.id].stack) continue;
      if (Math.abs(a.x - b.x) > 1 || Math.abs(a.z - b.z) > 1 || Math.abs(a.y - b.y) > 0.6) continue;
      a.n += b.n;
      a.pickAt = Math.min(a.pickAt, Math.max(b.pickAt, a.age));
      a.age = Math.min(a.age, b.age);
      removeDrop(game, b);
      game.broadcast({ t: 'drop', a: 'n', k: a.k, n: a.n });
    }
  }
}

/** Smaže věc ze země (`by` = číslo hráče, který ji sebral – prohlížeč ji nechá k němu přiletět). */
export function removeDrop(game, d, by) {
  game.world.drops.delete(d.k);
  game.broadcast(by ? { t: 'drop', a: 'del', k: d.k, by } : { t: 'drop', a: 'del', k: d.k });
}
