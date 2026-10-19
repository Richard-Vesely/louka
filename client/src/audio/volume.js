// Hlasitosti z Nastavení (Hlasitost, Zvuky, Hudba), 0–1. Bez vedlejších účinků: používá je menu i zvukový stroj.
export const VOL_DEFAULT = { vol: 0.8, sfx: 1, music: 0.6 };
export const VOL_LABELS = [['vol', 'Hlasitost'], ['sfx', 'Zvuky'], ['music', 'Hudba']];
/** Hlasitosti z nastavení; chybějící nebo vadná hodnota = výchozí. */
export function readVolumes(prefs) {
  let p = prefs;
  if (!p) { try { p = JSON.parse(localStorage.getItem('rise-nastaveni')) || {}; } catch { p = {}; } }
  const v = {};
  for (const k of Object.keys(VOL_DEFAULT)) v[k] = typeof p[k] === 'number' && Number.isFinite(p[k]) ? Math.min(1, Math.max(0, p[k])) : VOL_DEFAULT[k];
  return v;
}
