// ============================================================ tvorové: ovce, kanci, stínožrouti
// Jak se tvorové hýbou, útočí a rodí. Jejich vlastnosti (životy, kořist) jsou v shared/mobs.js.
import * as THREE from 'three';
import { MOBS } from '@louka/shared/mobs.js';
import { BLOCKS } from '@louka/shared/blocks.js';
import { terrainH, groundHeight, forest } from '@louka/shared/terrain.js';
import { randInt } from '@louka/shared/math.js';
import { scene } from '../render/renderer.js';
import { sparks, debris } from '../render/particles.js';
import { Sound } from '../audio/sound.js';
import { solidAt, specials, nearLight } from '../world/blocks.js';
import { forestColliders } from '../world/forest.js';
import { addItem } from '../inventory/inventory.js';
import { player } from '../player/player.js';
import { damagePlayer } from '../player/survival.js';
import { buildMob } from './mob-models.js';

/** Všichni živí (i právě umírající) tvorové. */
export const mobs = [];
const shadowGeo = new THREE.CircleGeometry(0.75, 20).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });

/** Postaví tvora typu `type` na místo (x, z). */
export function spawnMob(type, x, z) {
  const m = buildMob(type);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  scene.add(m.group, shadow);
  const def = MOBS[type];
  mobs.push({ type, def, ...m, shadow, pos: new THREE.Vector3(x, terrainH(x, z), z), vel: new THREE.Vector3(), hp: def.hp, phase: Math.random() * 6, flash: 0, cd: 0, dead: false, deathT: 0, wander: Math.random() * 6.28, moving: false, idleT: Math.random() * 3, fleeT: 0, aggro: false, soundT: 3 + Math.random() * 8 });
}
/** Odebere tvora ze hry. */
export function removeMob(m) {
  scene.remove(m.group, m.shadow);
  mobs.splice(mobs.indexOf(m), 1);
}
/** Hráč zasáhl tvora za `dmg` životů. */
export function hitMob(m, dmg) {
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  m.hp -= dmg;
  m.flash = 1;
  m.vel.x += fx * 8;
  m.vel.z += fz * 8;
  sparks.emit(m.pos.x, m.pos.y + m.def.cy, m.pos.z, m.type === 'crawler' ? [0.7, 0.25, 1.0] : [1, 0.25, 0.2], 18, 3.5, 1.5);
  Sound.hit();
  player.shake = 0.1;
  if (m.type === 'sheep') { m.fleeT = 5; Sound.baa(); }
  if (m.type === 'boar') { m.aggro = true; Sound.grunt(); }
  if (m.hp <= 0) killMob(m, true);
}
function killMob(m, drops) {
  m.dead = true;
  sparks.emit(m.pos.x, m.pos.y + m.def.cy, m.pos.z, m.type === 'crawler' ? [0.6, 0.2, 1.0] : [0.9, 0.85, 0.75], 50, 5, 2);
  if (drops) for (const [id, a, b] of m.def.drops) addItem(id, randInt(a, b));
  if (m.type === 'crawler') Sound.kill();
}
// U svatyně a u světla jsi před stínožrouty v bezpečí.
const playerSafe = () => Math.hypot(player.pos.x, player.pos.z) < 11 || nearLight(player.pos.x, player.pos.z, 5);

/**
 * Pohne všemi tvory: bloumání, útěk, lov hráče, útok, animace nohou.
 * @param {number} day jak moc je den (0..1) – stínožrouti na slunci hoří
 */
export function updateMobs(dt, day) {
  for (const m of [...mobs]) {
    if (m.dead) {
      m.deathT += dt;
      m.group.scale.setScalar(Math.max(0.01, 1 - m.deathT * 2.5));
      m.group.rotation.z += dt * 6;
      if (m.deathT > 0.4) removeMob(m);
      continue;
    }
    const dx = player.pos.x - m.pos.x, dz = player.pos.z - m.pos.z, dist = Math.hypot(dx, dz) || 0.01;
    if (dist > 120) { removeMob(m); continue; }
    let dirX = 0, dirZ = 0, speed = 0;
    const wander = (sp) => {
      if ((m.idleT -= dt) <= 0) { m.moving = !m.moving; m.idleT = 2 + Math.random() * 4; m.wander = Math.random() * Math.PI * 2; }
      if (m.moving) { dirX = Math.cos(m.wander); dirZ = Math.sin(m.wander); speed = sp; }
    };
    const hostile = m.type === 'crawler' || (m.type === 'boar' && m.aggro);
    if (m.type === 'sheep' && m.fleeT > 0) {
      m.fleeT -= dt; dirX = -dx / dist; dirZ = -dz / dist; speed = 5.5;
    } else if (hostile && player.alive && dist < (m.type === 'boar' ? 30 : 26) && !(m.type === 'crawler' && playerSafe())) {
      dirX = dx / dist; dirZ = dz / dist; speed = m.type === 'boar' ? 5.2 : 4.7;
    } else {
      if (m.type === 'boar' && dist > 30) m.aggro = false;
      wander(m.type === 'crawler' ? 1.3 : 1.0);
    }
    if (m.type === 'crawler') {
      const sd = Math.hypot(m.pos.x, m.pos.z);
      if (sd < 13) { dirX = m.pos.x / sd; dirZ = m.pos.z / sd; speed = 3; }
      for (const s of specials.values()) {
        if (!BLOCKS[s.type].light) continue;
        const lx = m.pos.x - (s.x + 0.5), lz = m.pos.z - (s.z + 0.5), ld = Math.hypot(lx, lz);
        if (ld < 6) { dirX = lx / ld; dirZ = lz / ld; speed = 3; }
      }
      if (day > 0.75) { m.hp -= dt * 2.5; if (Math.random() < dt * 20) debris.emit(m.pos.x, m.pos.y + 0.8, m.pos.z, [0.1, 0.1, 0.1], 2, 1, 2); if (m.hp <= 0) { killMob(m, false); continue; } }
    }

    const k = Math.min(1, dt * 4);
    m.vel.x += (dirX * speed - m.vel.x) * k;
    m.vel.z += (dirZ * speed - m.vel.z) * k;
    const nx = m.pos.x + m.vel.x * dt, nz = m.pos.z + m.vel.z * dt;
    const gy = groundHeight(nx, nz);
    if (solidAt(Math.floor(nx), Math.floor(gy + 0.5), Math.floor(nz))) { m.vel.x *= -0.3; m.vel.z *= -0.3; m.wander += Math.PI; }
    else { m.pos.x = nx; m.pos.z = nz; }
    for (const c of forestColliders) {
      const ox = m.pos.x - c.x, oz = m.pos.z - c.z, d = Math.hypot(ox, oz), min = c.r + 0.55;
      if (d < min && d > 1e-4) { m.pos.x = c.x + (ox / d) * min; m.pos.z = c.z + (oz / d) * min; }
    }
    const sp = Math.hypot(m.vel.x, m.vel.z);
    m.phase += dt * (sp * 2.2 + (m.type === 'crawler' ? 2 : 0));
    m.pos.y = groundHeight(m.pos.x, m.pos.z);
    let hop = 0;
    if (m.type === 'crawler') {
      hop = Math.abs(Math.sin(m.phase)) * (sp > 2 ? 0.5 : 0.18);
      const squash = 1 + Math.cos(m.phase * 2) * 0.12;
      m.body.scale.set(1 / Math.sqrt(squash), 0.8 * squash, 1.15 / Math.sqrt(squash));
    } else {
      const swing = Math.sin(m.phase * 2.2) * Math.min(sp / 2, 1) * 0.7;
      m.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? 1 : -1) * swing));
      m.body.position.y = (m.type === 'sheep' ? 0.78 : 0.72) + Math.abs(swing) * 0.03;
    }
    m.group.position.set(m.pos.x, m.pos.y + hop, m.pos.z);
    m.shadow.position.set(m.pos.x, m.pos.y + 0.03, m.pos.z);
    if (sp > 0.15) m.group.rotation.y = Math.atan2(-m.vel.x, -m.vel.z);

    m.flash = Math.max(0, m.flash - dt * 5);
    for (const mat of m.mats) mat.emissive.setRGB(m.flash * 1.5, m.flash * 1.5, m.flash * 1.5);
    m.cd -= dt;
    if (hostile && dist < 1.4 && m.cd <= 0 && player.alive) {
      m.cd = 1.1;
      damagePlayer(m.def.dmg, dx / dist, dz / dist);
      m.vel.x -= (dx / dist) * 4;
      m.vel.z -= (dz / dist) * 4;
    }
    if ((m.soundT -= dt) <= 0) {
      m.soundT = 5 + Math.random() * 10;
      if (dist < 25) m.type === 'sheep' ? Sound.baa() : m.type === 'boar' ? Sound.grunt() : Sound.growl();
    }
  }
}

let spawnT = 3;
/** Každé 2 s doplní tvory kolem hráče (35–60 m daleko). Stínožrouti jen v noci. */
export function updateSpawns(dt, night) {
  if ((spawnT -= dt) > 0) return;
  spawnT = 2;
  const count = (t) => mobs.filter((m) => m.type === t && !m.dead).length;
  const spot = () => {
    const a = Math.random() * Math.PI * 2, r = 35 + Math.random() * 25;
    const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
    return Math.hypot(x, z) < 35 || nearLight(x, z, 12) ? null : [x, z];
  };
  if (night > 0.5 && count('crawler') < 7) { const p = spot(); if (p) spawnMob('crawler', ...p); }
  if (count('sheep') < 6) {
    const p = spot();
    if (p && forest(...p) < 0.55) for (let i = 0; i < randInt(2, 3); i++) spawnMob('sheep', p[0] + Math.random() * 4, p[1] + Math.random() * 4);
  }
  if (count('boar') < 3) { const p = spot(); if (p && forest(...p) > 0.45) spawnMob('boar', ...p); }
}
