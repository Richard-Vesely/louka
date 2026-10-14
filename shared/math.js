// Malé matematické pomocníky. Používá je hra v prohlížeči i server.

/** Omezí číslo `v` do rozsahu a..b. */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Plynulý přechod mezi a a b (t = 0 → a, t = 1 → b). */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Hladký schod: 0 pod `a`, 1 nad `b`, mezi tím měkký přechod. */
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Úhel převedený do rozsahu -π..π. */
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Náhodné celé číslo od a do b (včetně). */
export const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/**
 * "Náhodné" číslo 0..1, které je pro stejné (x, z) vždy stejné.
 * Díky tomu má každý hráč stromy a balvany na stejných místech.
 */
export function hash2(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Generátor náhodných čísel se semínkem (stejné semínko = stejná čísla). */
export const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
