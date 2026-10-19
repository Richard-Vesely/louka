// Den a noc: čas dne (0 = půlnoc, 0,25 = východ, 0,5 = poledne) a počítadlo dní. Noc ubíhá dvakrát rychleji.
import { smoothstep } from '../util.js';
import { DAY_LENGTH } from '../world/constants.js';

export let dayTime = 0.3, dayCount = 1;
export function setDay(t, count = dayCount) { dayTime = t; dayCount = count; }
// Výška slunce nad obzorem (-1 až 1).
export const sunElevation = () => Math.sin((dayTime - 0.25) * Math.PI * 2);
// Posune čas dne o dt sekund.
export function advanceDay(dt) {
  const elev0 = sunElevation();
  dayTime += (dt / DAY_LENGTH) * (elev0 < 0 ? 2 : 1);
  if (dayTime >= 1) { dayTime -= 1; dayCount++; }
}
// Jak moc je den (0–1) a noc (1 – den).
export function daylight() {
  const day = smoothstep(-0.12, 0.12, sunElevation());
  return { day, night: 1 - day };
}
