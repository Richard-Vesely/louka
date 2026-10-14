// ============================================================ hráč: pohyb a kolize
import { EYE, WALK, RUN, JUMP, GRAVITY, PW, PH } from '@louka/shared/constants.js';
import { groundHeight } from '@louka/shared/terrain.js';
import { SHRINE_COLLIDERS, pushOut } from '@louka/shared/game/colliders.js';
import { camera } from '../render/renderer.js';
import { Sound } from '../audio/sound.js';
import { solidAt } from '../world/blocks.js';
import { forestColliders } from '../world/forest.js';
import { keys } from './controls.js';
import { player } from './state.js';

/** Hráč u tohoto počítače (stav je v player/state.js). */
export { player };

// Kolize hráče s položenými bloky (osa po ose, jako v Minecraftu).
function collidesBlocks(p) {
  for (let y = Math.floor(p.y); y <= Math.floor(p.y + PH - 1e-3); y++)
    for (let z = Math.floor(p.z - PW); z <= Math.floor(p.z + PW); z++)
      for (let x = Math.floor(p.x - PW); x <= Math.floor(p.x + PW); x++)
        if (solidAt(x, y, z)) return true;
  return false;
}
function moveAxis(axis, amt) {
  if (!amt) return false;
  const p = player.pos;
  p[axis] += amt;
  if (!collidesBlocks(p)) return false;
  const E = 1e-3;
  if (axis === 'y') p.y = amt > 0 ? Math.floor(p.y + PH) - PH - E : Math.floor(p.y) + 1 + E;
  else p[axis] = amt > 0 ? Math.floor(p[axis] + PW) - PW - E : Math.floor(p[axis] - PW) + 1 + PW + E;
  player.vel[axis] = 0;
  return axis === 'y' && amt < 0;
}

/** Zasahuje hráč do políčka (x, y, z)? (Nejde položit blok do sebe.) */
export const playerIntersects = (x, y, z) => { const p = player.pos; return p.x - PW < x + 1 && p.x + PW > x && p.y < y + 1 && p.y + PH > y && p.z - PW < z + 1 && p.z + PW > z; };

let lastStepSign = 1;
/**
 * Pohne hráčem podle kláves, vyřeší kolize a nastaví kameru.
 * @returns {number} jak rychle se hráč pohybuje
 */
export function updatePlayer(dt) {
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  const len = Math.hypot(f, s) || 1;
  const sprint = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && player.hunger > 5;
  const speed = sprint ? RUN : WALK;
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  const tx = ((s * cos - f * sin) / len) * speed, tz = ((-s * sin - f * cos) / len) * speed;
  const v = player.vel, p = player.pos;
  const accel = Math.min(1, (player.onGround ? 10 : 2.5) * dt);
  v.x += (tx - v.x) * accel;
  v.z += (tz - v.z) * accel;
  if (player.onGround && keys.has('Space')) { v.y = JUMP; player.onGround = false; }
  v.y = Math.max(-40, v.y - GRAVITY * dt);

  const wasGround = player.onGround;
  let onBlock = false;
  const steps = Math.max(1, Math.ceil((Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt) / 0.3));
  for (let i = 0; i < steps; i++) {
    moveAxis('x', (v.x * dt) / steps);
    if (moveAxis('y', (v.y * dt) / steps)) onBlock = true;
    moveAxis('z', (v.z * dt) / steps);
  }
  pushOut(p, forestColliders, PW);
  pushOut(p, SHRINE_COLLIDERS, PW);
  const g = groundHeight(p.x, p.z);
  if (p.y <= g) { p.y = g; v.y = 0; player.onGround = true; }
  else if (onBlock) player.onGround = true;
  else if (wasGround && p.y - g < 0.45 && v.y <= 0 && !collidesBlocks({ x: p.x, y: g, z: p.z })) { p.y = g; v.y = 0; player.onGround = true; }
  else player.onGround = false;

  const moving = Math.hypot(v.x, v.z);
  if (player.onGround) player.bob += dt * moving * 1.8;
  const sign = Math.sign(Math.sin(player.bob));
  if (sign !== lastStepSign && moving > 1 && player.onGround) Sound.step();
  lastStepSign = sign;
  player.sprinting = sprint && moving > 1;
  const bobY = Math.sin(player.bob) * 0.035 * Math.min(1, moving / WALK);
  player.shake = Math.max(0, player.shake - dt);
  const sh = player.shake * 0.4;
  camera.position.set(p.x + (Math.random() - 0.5) * sh, p.y + EYE + bobY + (Math.random() - 0.5) * sh, p.z + (Math.random() - 0.5) * sh);
  camera.rotation.set(player.pitch, player.yaw, 0);
  return moving;
}
