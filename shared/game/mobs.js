// ============================================================ tvorové: ovce, kanci, stínožrouti (simulace)
// Jak se tvorové hýbou, útočí a rodí. Běží na serveru, takže všichni vidí stejného tvora na stejném místě.
// Vzhled a animace jsou v client/src/mobs/. Vlastnosti (životy, kořist) v shared/mobs.js.
import { MOBS } from '../mobs.js';
import { terrainH, groundHeight, forest } from '../terrain.js';
import { randInt } from '../math.js';
import { solidAt, lights, nearLight } from './world.js';
import { collidersNear } from './colliders.js';
import { addItem } from './inventory.js';
import { damagePlayer } from './survival.js';

/**
 * Postaví tvora typu `type` na místo (x, z).
 * @param {import('./game.js').Game} game
 */
export function spawnMob(game, type, x, z) {
  const def = MOBS[type];
  const m = {
    id: game.nextMobId++, type, def, pos: { x, y: terrainH(x, z), z }, vel: { x: 0, z: 0 }, ry: 0, hp: def.hp,
    cd: 0, dead: false, deathT: 0, wander: Math.random() * 6.28, moving: false, idleT: Math.random() * 3, fleeT: 0, aggro: false,
  };
  game.mobs.push(m);
  return m;
}

/** Hráč `p` zasáhl tvora za `dmg` životů. */
export function hitMob(game, p, m, dmg) {
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  m.hp -= dmg;
  m.vel.x += fx * 8;
  m.vel.z += fz * 8;
  game.broadcast({ t: 'fx', k: 'mobhit', id: m.id, mt: m.type, x: m.pos.x, y: m.pos.y + m.def.cy, z: m.pos.z }, m.pos);
  if (m.type === 'sheep') m.fleeT = 5;
  if (m.type === 'boar') m.aggro = true;
  if (m.hp <= 0) killMob(game, m, p);
}

// Tvor umře; `killer` (hráč) dostane kořist.
function killMob(game, m, killer) {
  m.dead = true;
  game.broadcast({ t: 'fx', k: 'mobdie', mt: m.type, x: m.pos.x, y: m.pos.y + m.def.cy, z: m.pos.z }, m.pos);
  if (killer) for (const [id, a, b] of m.def.drops) addItem(killer, id, randInt(a, b), game.tell(killer));
}

// U svatyně a u světla je hráč před stínožrouty v bezpečí.
const playerSafe = (game, p) => Math.hypot(p.pos.x, p.pos.z) < 11 || nearLight(game.world, p.pos.x, p.pos.z, 5);

/**
 * Pohne všemi tvory: bloumání, útěk, lov nejbližšího hráče, útok.
 * @param {number} day jak moc je den (0..1) – stínožrouti na slunci hoří
 */
export function updateMobs(game, dt, day) {
  const w = game.world;
  for (const m of [...game.mobs]) {
    if (m.dead) {
      m.deathT += dt;
      if (m.deathT > 0.4) game.removeMob(m);
      continue;
    }
    const near = game.nearestPlayer(m.pos.x, m.pos.z);
    if (!near || near.dist > 120) { game.removeMob(m); continue; }
    const { p: player, dx, dz } = near, dist = near.dist || 0.01;
    let dirX = 0, dirZ = 0, speed = 0;
    const wander = (sp) => {
      if ((m.idleT -= dt) <= 0) { m.moving = !m.moving; m.idleT = 2 + Math.random() * 4; m.wander = Math.random() * Math.PI * 2; }
      if (m.moving) { dirX = Math.cos(m.wander); dirZ = Math.sin(m.wander); speed = sp; }
    };
    const hostile = m.type === 'crawler' || (m.type === 'boar' && m.aggro);
    if (m.type === 'sheep' && m.fleeT > 0) {
      m.fleeT -= dt; dirX = -dx / dist; dirZ = -dz / dist; speed = 5.5;
    } else if (hostile && player.alive && dist < (m.type === 'boar' ? 30 : 26) && !(m.type === 'crawler' && playerSafe(game, player))) {
      dirX = dx / dist; dirZ = dz / dist; speed = m.type === 'boar' ? 5.2 : 4.7;
    } else {
      if (m.type === 'boar' && dist > 30) m.aggro = false;
      wander(m.type === 'crawler' ? 1.3 : 1.0);
    }
    if (m.type === 'crawler') {
      const sd = Math.hypot(m.pos.x, m.pos.z);
      if (sd < 13) { dirX = m.pos.x / sd; dirZ = m.pos.z / sd; speed = 3; }
      for (const s of lights(w)) {
        const lx = m.pos.x - (s.x + 0.5), lz = m.pos.z - (s.z + 0.5), ld = Math.hypot(lx, lz);
        if (ld < 6) { dirX = lx / ld; dirZ = lz / ld; speed = 3; }
      }
      if (day > 0.75) { m.hp -= dt * 2.5; if (m.hp <= 0) { killMob(game, m, null); continue; } }
    }

    const k = Math.min(1, dt * 4);
    m.vel.x += (dirX * speed - m.vel.x) * k;
    m.vel.z += (dirZ * speed - m.vel.z) * k;
    const nx = m.pos.x + m.vel.x * dt, nz = m.pos.z + m.vel.z * dt;
    const gy = groundHeight(nx, nz);
    if (solidAt(w, Math.floor(nx), Math.floor(gy + 0.5), Math.floor(nz))) { m.vel.x *= -0.3; m.vel.z *= -0.3; m.wander += Math.PI; }
    else { m.pos.x = nx; m.pos.z = nz; }
    for (const c of collidersNear(m.pos.x, m.pos.z, w.removed)) {
      const ox = m.pos.x - c.x, oz = m.pos.z - c.z, d = Math.hypot(ox, oz), min = c.r + 0.55;
      if (d < min && d > 1e-4) { m.pos.x = c.x + (ox / d) * min; m.pos.z = c.z + (oz / d) * min; }
    }
    m.pos.y = groundHeight(m.pos.x, m.pos.z);
    if (Math.hypot(m.vel.x, m.vel.z) > 0.15) m.ry = Math.atan2(-m.vel.x, -m.vel.z);

    m.cd -= dt;
    if (hostile && dist < 1.4 && m.cd <= 0 && player.alive) {
      m.cd = 1.1;
      damagePlayer(game, player, m.def.dmg, dx / dist, dz / dist);
      m.vel.x -= (dx / dist) * 4;
      m.vel.z -= (dz / dist) * 4;
    }
  }
}

/** Každé 2 s doplní tvory kolem každého hráče (35–60 m daleko). Stínožrouti jen v noci. */
export function updateSpawns(game, dt, night) {
  if ((game.spawnT -= dt) > 0) return;
  game.spawnT = 2;
  for (const p of game.players.values()) {
    const count = (t) => game.mobs.filter((m) => m.type === t && !m.dead && (m.pos.x - p.pos.x) ** 2 + (m.pos.z - p.pos.z) ** 2 < 120 * 120).length;
    const spot = () => {
      const a = Math.random() * Math.PI * 2, r = 35 + Math.random() * 25;
      const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
      return Math.hypot(x, z) < 35 || nearLight(game.world, x, z, 12) ? null : [x, z];
    };
    if (night > 0.5 && count('crawler') < 7) { const s = spot(); if (s) spawnMob(game, 'crawler', ...s); }
    if (count('sheep') < 6) {
      const s = spot();
      if (s && forest(...s) < 0.55) for (let i = 0; i < randInt(2, 3); i++) spawnMob(game, 'sheep', s[0] + Math.random() * 4, s[1] + Math.random() * 4);
    }
    if (count('boar') < 3) { const s = spot(); if (s && forest(...s) > 0.45) spawnMob(game, 'boar', ...s); }
  }
}
