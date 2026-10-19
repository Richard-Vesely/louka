// Tři zkušební vzhledy grafiky (?look=a|b|c) a co z nich zapne která kvalita (Grafika: nízká / střední / vysoká).
// Jen čísla a přepínače, žádné vedlejší účinky: čtou je renderer, obloha, den a noc, stíny, voda, les a post-processing.
import { LOOK, QUALITY } from '../game/prefs.js';

/**
 * Parametry jednoho vzhledu.
 * tone: tónové mapování ('agx' | 'aces' | 'neutral'), exposure: celkový jas
 * sun / amb: síla slunce a okolního světla, ambTint: barva stínů (okolní světlo), skyAmb / groundAmb: světlo shora a odraz od země
 * fog: hustota (× nastavení grafiky), falloff: řídnutí s výškou (1/m), scatter: záře slunce v mlze, skyHaze: opar na obloze u obzoru
 * bloom: záře světel, ao: zastínění koutů (jen vysoká), shafts: sluneční paprsky v mlze (jen vysoká)
 * grade: barevné ladění (power / agxSat = kontrast a sytost uvnitř AgX, sat / contrast = po tónování, lift = barva tmavých míst,
 *   gain = barva světlých, vignette = ztmavení rohů)
 * shadow: soft = měkkost okrajů (texely), strength = jak tmavý je stín
 * water: mělká / hluboká barva, pěna, drsnost hladiny; clouds: pokrytí a měkkost mraků; sky: zákal a modř oblohy
 * normals: hloubka reliéfu textur bloků, wind: kývání korun stromů, glow: síla svítících věcí (neon, lávy, krystaly)
 * sss: prosvítání trávy a listí proti slunci, neon: svítící pulzy v kabelech pod proudem (0 = vypnuto)
 * foliage: sytost trávy a listí, leaves: jas korun stromů, grain: filmové zrno (jen s post-processingem)
 */
export const LOOKS = {
  // A: stylizovaný, jako Hytale – syté teplé barvy, fialové stíny, měkké stíny, jemná záře, čitelné tvary
  a: {
    name: 'Stylizovaný', tone: 'neutral', exposure: 0.72,
    sun: 1.0, amb: 1.15, ambTint: [0.86, 0.82, 1.18], skyAmb: [1.0, 1.0, 1.06], groundAmb: [0.62, 0.52, 0.5],
    fog: { density: 0.62, falloff: 0.022, scatter: 0.55, skyHaze: 0.45, tint: [0.9, 0.9, 1.08] },
    bloom: { intensity: 0.6, threshold: 1.4, smoothing: 0.3, radius: 0.7 },
    ao: { intensity: 2.6, radius: 1.6 }, shafts: 0,
    grade: { sat: 1.2, contrast: 1.06, lift: [0.02, 0.006, 0.04], gain: [1.03, 1.0, 0.96], vignette: 0.16 },
    shadow: { soft: 3.5, strength: 0.7 },
    water: { shallow: [0.16, 0.7, 0.72], deep: [0.03, 0.22, 0.42], foam: 1.0, rough: 0.08 },
    clouds: { cover: 0.56, soft: 0.14, bright: 1.15 }, sky: { turbidity: 2.4, rayleigh: 1.7, gain: 0.7 },
    normals: 0.6, wind: 1.0, glow: 1.0, sss: 0.55, neon: 0.6, foliage: 1.18, leaves: 0.95, grain: 0,
  },
  // B: realistické sci-fi – filmové AgX, kontrastní ostré stíny, hustý vzduch se slunečními paprsky, studené ladění, silný neon
  b: {
    name: 'Realistické sci-fi', tone: 'agx', exposure: 0.8,
    sun: 1.15, amb: 0.75, ambTint: [0.9, 0.98, 1.12], skyAmb: [1.0, 1.02, 1.08], groundAmb: [0.42, 0.4, 0.36],
    fog: { density: 0.6, falloff: 0.03, scatter: 0.8, skyHaze: 0.25, tint: [0.78, 0.88, 1.02] },
    bloom: { intensity: 0.95, threshold: 1.3, smoothing: 0.3, radius: 0.82 },
    ao: { intensity: 3.2, radius: 1.8 }, shafts: 0.6,
    grade: { power: 1.2, agxSat: 1.22, sat: 1.0, contrast: 1.12, lift: [0.0, 0.006, 0.014], gain: [0.98, 1.01, 1.05], vignette: 0.32 },
    shadow: { soft: 1.3, strength: 0.9 },
    water: { shallow: [0.1, 0.36, 0.38], deep: [0.01, 0.06, 0.1], foam: 0.45, rough: 0.035 },
    clouds: { cover: 0.62, soft: 0.3, bright: 1.0 }, sky: { turbidity: 2.2, rayleigh: 2.0, gain: 0.42 },
    normals: 1.4, wind: 1.2, glow: 1.6, sss: 0.4, neon: 1.5, foliage: 0.95, leaves: 0.6, grain: 0.02,
  },
  // C: „jasná budoucnost“ (doporučený mix) – realistické světlo na čistých tvarech, sytá příroda, teplé stíny a tyrkysová světla
  c: {
    name: 'Jasná budoucnost', tone: 'agx', exposure: 0.85,
    sun: 1.1, amb: 1.0, ambTint: [0.92, 0.92, 1.1], skyAmb: [1.0, 1.0, 1.06], groundAmb: [0.55, 0.48, 0.4],
    fog: { density: 0.62, falloff: 0.026, scatter: 0.75, skyHaze: 0.25, tint: [0.84, 0.92, 1.06] },
    bloom: { intensity: 0.75, threshold: 1.5, smoothing: 0.3, radius: 0.78 },
    ao: { intensity: 2.8, radius: 1.6 }, shafts: 0.55,
    grade: { power: 1.3, agxSat: 1.35, sat: 1.05, contrast: 1.06, lift: [0.006, 0.004, 0.012], gain: [0.99, 1.0, 1.03], vignette: 0.22 },
    shadow: { soft: 2.2, strength: 0.82 },
    water: { shallow: [0.12, 0.55, 0.6], deep: [0.02, 0.13, 0.24], foam: 0.75, rough: 0.05 },
    clouds: { cover: 0.6, soft: 0.18, bright: 1.08 }, sky: { turbidity: 3.0, rayleigh: 1.8, gain: 0.42 },
    normals: 1.0, wind: 1.1, glow: 1.3, sss: 0.65, neon: 1.0, foliage: 1.05, leaves: 0.78, grain: 0,
  },
};
export const LK = LOOKS[LOOK];

// Co která kvalita zapne. Nízká zůstává levná (CI kreslí softwarovým WebGL): žádný post-processing ani stíny.
const HIGH = QUALITY === 'high', MID = QUALITY === 'medium';
export const FX = {
  post: HIGH || MID,                 // EffectComposer: záře, mlha s výškou, tónování, barevné ladění
  shadows: HIGH || MID,              // stíny od slunce a měsíce
  shadowSize: HIGH ? 2048 : 1024,    // rozlišení mapy stínů
  shadowRange: HIGH ? 58 : 36,       // poloměr oblasti se stíny kolem hráče (m)
  shadowHz: HIGH ? 30 : 20,          // jak často se stíny překreslí
  ao: HIGH,                          // N8AO (polovina rozlišení)
  shafts: HIGH && LK.shafts > 0,     // paprsky v mlze (z mapy stínů)
  clouds: HIGH || MID,               // vrstva mraků na obloze
  msaa: HIGH ? 4 : MID ? 2 : 0,      // vyhlazování hran v composeru
};

// Násobek svítivosti (emissive, záře plamenů a krystalů), aby světla s post-processingem zářila (bloom). Bez něj 1.
export const GLOW = FX.post ? 3.2 * LK.glow : 1;
