// ============================================================ den a noc – obloha a oznámení
// Hodiny světa posouvá hra (shared/game/day.js). Tady se podle nich nastaví obloha
// (render/sky.js) a oznámí soumrak a svítání.
import { clock } from '../core/runtime.js';
import { updateSky } from '../render/sky.js';
import { toast } from '../ui/hud.js';
import { world } from './state.js';

/** Hodiny světa: dayTime 0..1 (0,25 = východ slunce, 0,5 = poledne), dayCount = kolikátý den. */
export const time = world.time;
let wasNight = false;

/**
 * Nastaví oblohu podle času a oznámí soumrak a svítání.
 * @returns {{night:number, day:number}}
 */
export function updateDay() {
  const { night, day } = updateSky(time.dayTime);
  const isNight = night > 0.6;
  if (isNight && !wasNight && clock.gameTime > 1) toast('Padá noc… stínožrouti se probouzejí');
  if (!isNight && wasNight) toast(`Svítá – den ${time.dayCount}`);
  wasNight = isNight;
  return { night, day };
}
