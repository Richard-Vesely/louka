// ============================================================ den a noc
// Hodiny světa. Obloha a světla se nastaví v render/sky.js.
import { DAY_LENGTH } from '@louka/shared/constants.js';
import { save } from '../save/load.js';
import { clock } from '../core/runtime.js';
import { updateSky } from '../render/sky.js';
import { toast } from '../ui/hud.js';

/** dayTime 0..1 (0,25 = východ slunce, 0,5 = poledne, 0,75 = západ), dayCount = kolikátý den. */
export const time = { dayTime: save?.dayTime ?? 0.3, dayCount: save?.day ?? 1 };
let wasNight = false;

/**
 * Posune čas o `dt` sekund (noc běží dvakrát rychleji) a oznámí soumrak a svítání.
 * @returns {{night:number, day:number}}
 */
export function updateDay(dt) {
  const elev0 = Math.sin((time.dayTime - 0.25) * Math.PI * 2);
  time.dayTime += (dt / DAY_LENGTH) * (elev0 < 0 ? 2 : 1);
  if (time.dayTime >= 1) { time.dayTime -= 1; time.dayCount++; }
  const { night, day } = updateSky(time.dayTime);
  const isNight = night > 0.6;
  if (isNight && !wasNight && clock.gameTime > 1) toast('Padá noc… stínožrouti se probouzejí');
  if (!isNight && wasNight) toast(`Svítá – den ${time.dayCount}`);
  wasNight = isNight;
  return { night, day };
}
