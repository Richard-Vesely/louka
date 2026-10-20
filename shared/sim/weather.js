// Počasí: déšť, bouřka a ranní mlha. Neposílá se ani neukládá – určuje ho číslo dne a čas dne (shared/sim/day.js),
// které všichni hráči sdílejí, takže všichni vidí stejné počasí (hra pro jednoho, hostitel v prohlížeči i server).
import { hash2, smoothstep } from '../util.js';

export const WEATHER_SLOTS = 4;   // den se dělí na 4 úseky po 6 hodinách, každý má svoje počasí
export const RAIN_CHANCE = 0.22;  // šance na déšť v úseku
export const STORM_CHANCE = 0.3;  // z deštivých úseků je tolik bouřek
export const FOG_CHANCE = 0.35;   // šance na mlhu při svítání

// Počasí jednoho úseku (bez přechodů): rain 0–1, storm 0/1.
function slot(day, s) {
  if (day <= 1) return { rain: 0, storm: 0 }; // první den nového světa je vždycky hezky
  const h = hash2(day * 7 + s, 9173);
  if (h >= RAIN_CHANCE) return { rain: 0, storm: 0 };
  const storm = h < RAIN_CHANCE * STORM_CHANCE ? 1 : 0;
  return { rain: storm ? 1 : 0.55 + 0.45 * hash2(day, s * 31 + 5), storm };
}

/**
 * Počasí v daný den a čas: { rain, storm, fog } (všechno 0–1). Na hranici úseků se plynule prolne.
 * @param {number} day číslo dne (dayCount)
 * @param {number} t čas dne 0–1 (0 = půlnoc, 0,25 = východ slunce)
 */
export function weatherAt(day, t) {
  const x = ((t % 1) + 1) % 1 * WEATHER_SLOTS, s = Math.floor(x), f = x - s;
  const cur = slot(day, s);
  // posledních 20 % úseku se prolíná do dalšího (přes půlnoc do dalšího dne)
  const nx = s + 1 < WEATHER_SLOTS ? slot(day, s + 1) : slot(day + 1, 0);
  const k = smoothstep(0.8, 1, f);
  const rain = cur.rain + (nx.rain - cur.rain) * k;
  const storm = cur.storm + (nx.storm - cur.storm) * k;
  // mlha: některá rána se údolí zahalí do mlhy (kolem 6 h, mezi 4:30 a 8:30), za deště ne
  const dawn = smoothstep(0.19, 0.25, t) * (1 - smoothstep(0.29, 0.355, t));
  const fog = day > 1 && hash2(day, 4441) < FOG_CHANCE ? dawn * (1 - rain) : 0;
  return { rain, storm, fog };
}
