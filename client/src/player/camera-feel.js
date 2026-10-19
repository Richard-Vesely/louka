// "Šťáva" kamery: houpání při chůzi, cuknutí při úderu, náklon při zranění a krátké zastavení času při silném zásahu.
// Bez vedlejších účinků při načtení: volá se ze smyčky (game/loop.js) hned po pohybu hráče.
import { WALK } from '../../../shared/world/constants.js';
import { camera } from '../render/renderer.js';
import { player } from './player.js';

const feel = { kick: 0, hurt: 1, hurtSide: 1, stop: 0, bobAmt: 0, roll: 0 };
const HURT_TIME = 0.5;
/** Úder do tvora: kamera lehce cukne (síla 0–1). */
export function hitKick(strength = 1) { feel.kick = Math.min(1.2, feel.kick + 0.6 * strength); }
/** Zranění: náklon kamery na stranu, odkud rána přišla (sin(f⁴π) × 14° jako v Minecraftu). */
export function hurtPulse(dx = 0, dz = 0) {
  feel.hurt = 0;
  const side = Math.cos(player.yaw) * dx - Math.sin(player.yaw) * dz; // je útočník vpravo, nebo vlevo?
  feel.hurtSide = side >= 0 ? 1 : -1;
}
/** Zastavení času na pár setin sekundy (hit-stop) po silném úderu. */
export function hitStop(sec = 0.05) { feel.stop = Math.max(feel.stop, sec); }
/** Násobek času pro tento snímek (při hit-stopu skoro 0). */
export function timeScale(realDt) {
  if (feel.stop <= 0) return 1;
  feel.stop -= realDt;
  return 0.06;
}

/**
 * Přidá k pozici a natočení kamery houpání a efekty. Volá se po updatePlayer (ta kameru nastaví), jen při chůzi po svých.
 * @param {number} dt
 * @param {number} moving rychlost hráče (m/s)
 */
export function applyCameraFeel(dt, moving) {
  // houpání chůze (view bobbing): kamera se při každém kroku lehce propadne, kývne do stran a nakloní
  const target = player.onGround && !player.flying ? Math.min(1.3, moving / WALK) : 0;
  feel.bobAmt += (target - feel.bobAmt) * Math.min(1, dt * 8);
  const b = feel.bobAmt, d = player.bob * 0.5; // player.bob roste s ušlou vzdáleností; krok = π
  const sx = Math.sin(d) * b * 0.035, sy = -Math.abs(Math.cos(d)) * b * 0.05 + b * 0.025;
  const right = [Math.cos(player.yaw), -Math.sin(player.yaw)];
  camera.position.x += right[0] * sx;
  camera.position.z += right[1] * sx;
  camera.position.y += sy;
  camera.rotation.z += Math.sin(d) * b * 0.008;
  camera.rotation.x += Math.abs(Math.cos(d - 0.2)) * b * 0.006;
  // cuknutí po úderu: nahoru a hned zpátky
  if (feel.kick > 0.001) { camera.rotation.x += feel.kick * 0.022; feel.kick *= Math.exp(-dt * 16); }
  // zranění: náklon (roll) s rychlým nástupem a pomalým návratem
  if (feel.hurt < 1) {
    feel.hurt = Math.min(1, feel.hurt + dt / HURT_TIME);
    const f = 1 - feel.hurt;
    camera.rotation.z += Math.sin(f ** 4 * Math.PI) * (14 * Math.PI / 180) * feel.hurtSide;
  }
}
