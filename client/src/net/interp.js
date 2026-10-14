// ============================================================ plynulý pohyb ostatních (interpolace)
// Server posílá pozice 10× za sekundu. Kdybychom je jen přepisovali, ostatní by poskakovali.
// Proto kreslíme svět o kousek (150 ms) zpátky v čase a mezi dvěma pozicemi plynule přecházíme.

/** O kolik milisekund se kreslí ostatní pozadu (aby vždy byla "další" pozice). */
export const INTERP_DELAY = 150;

let offset = null; // čas serveru minus čas prohlížeče (ms)

/** Porovná hodiny serveru a prohlížeče (zpráva 'state' nese čas serveru `ts`). */
export function syncClock(ts) {
  const o = ts - performance.now();
  // Bereme nejmenší zpoždění, které jsme viděli; pomalu povolujeme, kdyby se hodiny rozjely.
  offset = offset === null ? o : Math.max(o, offset - 2);
}

/** Čas serveru, ve kterém teď kreslíme ostatní. */
export const renderTime = () => performance.now() + (offset ?? 0) - INTERP_DELAY;

/**
 * Přidá pozici do historie entity. Po dlouhé pauze (tvor stál) zopakuje starou pozici,
 * aby se pohyb rozjel plynule a ne "skluzem" přes celou pauzu.
 * @param {{samples: Array}} e hráč nebo tvor
 */
export function pushSample(e, t, x, y, z, r) {
  const s = e.samples, last = s[s.length - 1];
  if (last && t - last.t > 300) s.push({ ...last, t: t - 100 });
  s.push({ t, x, y, z, r });
  while (s.length > 2 && s[1].t < renderTime() - 1000) s.shift();
}

const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/**
 * Nastaví `e.pos` a vrátí natočení v čase `t` (mezi dvěma známými pozicemi).
 * @returns {number|undefined} natočení, nebo undefined když ještě nic nepřišlo
 */
export function sampleAt(e, t) {
  const s = e.samples;
  if (!s.length) return undefined;
  let a = s[0], b = s[0];
  for (let i = s.length - 1; i >= 0; i--) if (s[i].t <= t) { a = s[i]; b = s[i + 1] || s[i]; break; }
  const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
  e.pos.x = a.x + (b.x - a.x) * k;
  e.pos.y = a.y + (b.y - a.y) * k;
  e.pos.z = a.z + (b.z - a.z) * k;
  return lerpAngle(a.r, b.r, k);
}
