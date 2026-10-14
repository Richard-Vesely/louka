// ============================================================ hráč: pohyb a kolize
// Jako v Minecraftu: Ctrl nebo dvakrát W = běh, Shift = plížení (pomaleji, oči níž
// a z okraje bloku nespadneš), mezerník = skok (držený = skáče pořád).
import { EYE, WALK, RUN, JUMP, GRAVITY, PW, PH, SNEAK, SNEAK_EYE } from '@louka/shared/constants.js';
import { groundHeight } from '@louka/shared/terrain.js';
import { SHRINE_COLLIDERS, pushOut } from '@louka/shared/game/colliders.js';
import { Sound } from '../audio/sound.js';
import { placeCamera } from '../render/view.js';
import { solidAt } from '../world/blocks.js';
import { forestColliders } from '../world/forest.js';
import { keys, move } from './controls.js';
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

/** Stojí hráč s nohama v (x, y, z) aspoň kouskem chodidla na zemi nebo na bloku (do 0,6 m pod sebou)? */
export function supported(x, y, z) {
  for (const [dx, dz] of [[0, 0], [-PW, -PW], [PW, -PW], [-PW, PW], [PW, PW]]) {
    const px = x + dx * 0.95, pz = z + dz * 0.95;
    if (groundHeight(px, pz) >= y - 0.6) return true;
    if (solidAt(Math.floor(px), Math.floor(y - 0.05), Math.floor(pz))) return true;
  }
  return false;
}

// Plížení: krok, po kterém by hráč spadl z okraje, se neudělá (jako v Minecraftu).
function sneakGuard(axis, amt) {
  const p = player.pos;
  if (!player.sneaking || !player.onGround || !amt || !supported(p.x, p.y, p.z)) return amt;
  const nx = axis === 'x' ? p.x + amt : p.x, nz = axis === 'z' ? p.z + amt : p.z;
  if (supported(nx, p.y, nz)) return amt;
  player.vel[axis] = 0;
  return 0;
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
  const forward = keys.has('KeyW') || keys.has('ArrowUp');
  if (forward) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  const len = Math.hypot(f, s) || 1;
  player.sneaking = keys.has('ShiftLeft') || keys.has('ShiftRight');
  // Běh: Ctrl nebo dvakrát W. Skončí, když pustíš W, začneš se plížit nebo máš hlad.
  if (keys.has('ControlLeft') || keys.has('ControlRight')) move.sprint = true;
  if (!forward || player.sneaking || player.hunger <= 5) move.sprint = false;
  const sprint = move.sprint;
  const speed = player.sneaking ? SNEAK : sprint ? RUN : WALK;
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
    moveAxis('x', sneakGuard('x', (v.x * dt) / steps));
    if (moveAxis('y', (v.y * dt) / steps)) onBlock = true;
    moveAxis('z', sneakGuard('z', (v.z * dt) / steps));
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
  // Oči: při plížení plynule níž.
  player.eyeH += ((player.sneaking ? SNEAK_EYE : EYE) - player.eyeH) * Math.min(1, dt * 12);
  const bobY = Math.sin(player.bob) * 0.035 * Math.min(1, moving / WALK);
  player.shake = Math.max(0, player.shake - dt);
  const sh = player.shake * 0.4;
  placeCamera(p.x + (Math.random() - 0.5) * sh, p.y + player.eyeH + bobY + (Math.random() - 0.5) * sh, p.z + (Math.random() - 0.5) * sh, dt);
  return moving;
}
