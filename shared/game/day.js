// ============================================================ den a noc
import { DAY_LENGTH } from '../constants.js';
import { smoothstep } from '../math.js';

/**
 * Jak vysoko je slunce a jak moc je den / noc.
 * @param {number} dayTime 0..1 (0,25 = východ slunce, 0,5 = poledne, 0,75 = západ)
 * @returns {{elev:number, day:number, night:number}} elev -1..1, day a night 0..1
 */
export function daylight(dayTime) {
  const elev = Math.sin((dayTime - 0.25) * Math.PI * 2);
  const day = smoothstep(-0.12, 0.12, elev);
  return { elev, day, night: 1 - day };
}

/** Posune hodiny světa o `dt` sekund. Noc běží dvakrát rychleji. */
export function advanceDay(time, dt) {
  const elev0 = Math.sin((time.dayTime - 0.25) * Math.PI * 2);
  time.dayTime += (dt / DAY_LENGTH) * (elev0 < 0 ? 2 : 1);
  if (time.dayTime >= 1) { time.dayTime -= 1; time.dayCount++; }
}
