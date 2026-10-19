// Zvuky okolí: plynule prolínané "podklady" (vítr, listí, hmyz, jeskyně, láva, Markova dimenze, voda, déšť)
// a náhodné jednorázové zvuky kolem hráče (ptáci ve dne, cvrčci, sovy a žáby v noci, kapky v jeskyni…).
// Co má jak hrát počítá čistá funkce ambienceTargets(env) (testuje se v Node), přehrávání je ve třídě Ambience.
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const R = (a, b) => a + Math.random() * (b - a);

// Ptáci podle biomu (rychlost za sekundu ve dne) a jaké druhy tam zpívají.
export const BIRD_RATE = { meadow: 0.32, cherry: 0.4, jungle: 0.75, savanna: 0.2, tundra: 0.04, desert: 0.015, volcanic: 0.01, mushroom: 0.1, mark: 0 };
export const BIRD_KINDS = {
  meadow: ['warbler', 'warbler', 'tit', 'cuckoo', 'dove', 'woodpecker'], cherry: ['warbler', 'tit', 'dove', 'cuckoo'], jungle: ['jungle', 'parrot', 'warbler', 'jungle'],
  savanna: ['dove', 'warbler', 'parrot'], tundra: ['tit'], desert: ['hawk'], volcanic: ['hawk'], mushroom: ['tit', 'dove'], mark: [],
};
export const CRICKET_RATE = { meadow: 1.4, cherry: 1.2, savanna: 1.6, jungle: 1.1, desert: 0.25, tundra: 0, volcanic: 0, mushroom: 0.7, mark: 0 };
const WIND = { tundra: 1.5, desert: 1.25, volcanic: 1.1, jungle: 0.6, mark: 0.8 };

/**
 * Hlasitosti podkladů a četnosti jednorázových zvuků podle prostředí.
 * env: { biome, day, dawn, gust, forest, cave, indoor, water, under, mark, volcano, rain, height }
 * (vše 0–1 kromě biome; dawn = ranní chorál, height = výška nad terénem v m)
 */
export function ambienceTargets(env) {
  const b = env.mark ? 'mark' : env.biome || 'meadow';
  const day = clamp01(env.day ?? 1), night = 1 - day, cave = clamp01(env.cave || 0), out = (1 - cave) * (1 - 0.65 * clamp01(env.indoor || 0));
  const gust = clamp01(env.gust ?? 0.5), forest = clamp01(env.forest || 0), rain = clamp01(env.rain || 0), under = env.under ? 1 : 0;
  const dry = 1 - under; // pod vodou je slyšet jen voda
  const beds = {
    wind: Math.min(0.22, (0.03 + 0.13 * gust) * (WIND[b] || 1) * (1 + 0.6 * clamp01((env.height || 0) / 30))) * out * dry, // ve výšce fouká víc
    whistle: b === 'tundra' ? 0.05 * gust * gust * out * dry : 0,
    leaves: forest * (0.012 + 0.06 * gust) * out * dry,
    insects: ((b === 'jungle' ? 0.045 * day + 0.03 * night : b === 'meadow' || b === 'savanna' || b === 'cherry' ? 0.01 * day : 0) * out * (1 - rain)) * dry,
    cave: cave * 0.12 * dry,
    lava: clamp01(env.volcano || 0) * 0.22 * dry,
    mark: env.mark ? 0.022 * (1 - cave * 0.5) * dry : 0,
    water: clamp01(env.water || 0) * 0.05 * out * dry,
    rain: rain * 0.2 * (1 - cave) * (env.indoor ? 0.6 : 1) * dry,
    underwater: under * 0.14,
  };
  const quiet = (1 - rain * 0.85) * dry;
  const rates = {
    bird: day * (1 - cave) * (1 - 0.75 * clamp01(env.indoor || 0)) * (BIRD_RATE[b] ?? 0.2) * (1 + 1.5 * clamp01(env.dawn || 0)) * (0.5 + forest) * quiet,
    cricket: night * (1 - cave) * (CRICKET_RATE[b] ?? 0.5) * quiet,
    owl: night * forest * 0.05 * (1 - cave) * quiet * (b === 'mark' ? 0 : 1),
    frog: clamp01(env.water || 0) * (0.15 + 0.85 * night) * 0.9 * (1 - cave) * dry,
    drip: cave * 0.35 * dry,
    rumble: cave * 0.015 * dry,
    lavaPop: clamp01(env.volcano || 0) * 1.6 * dry,
    alien: env.mark ? 0.07 * dry : 0,
    bubble: under * 2,
  };
  return { beds, rates, birds: BIRD_KINDS[b] || [] };
}

// Jak postavit každý podklad: šum (nebo tóny) -> filtry -> zesílení. mod(env, t) jemně mění filtr v čase.
const BEDS = {
  wind(S) { const { s, g } = S.loop(S.brown), f = filt(S, 'lowpass', 400, 0.7); s.connect(f).connect(g); return { g, nodes: [s], mod: (e, t) => f.frequency.setTargetAtTime(260 + (e.gust ?? 0.5) * 700, t, 0.6) }; },
  whistle(S) { const { s, g } = S.loop(S.white), f = filt(S, 'bandpass', 1000, 14); s.connect(f).connect(g); return { g, nodes: [s], mod: (e, t) => f.frequency.setTargetAtTime(800 + (e.gust ?? 0.5) * 700 + Math.sin(t * 0.7) * 120, t, 0.5) }; },
  leaves(S) { const { s, g } = S.loop(S.pink), f = filt(S, 'highpass', 2200, 0.6), f2 = filt(S, 'lowpass', 7500, 0.6); s.connect(f).connect(f2).connect(g); return { g, nodes: [s], flutter: true }; },
  insects(S) {
    const c = S.ctx, { s, g } = S.loop(S.white), f = filt(S, 'bandpass', 5200, 7), am = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 28; lg.gain.value = 0.5; am.gain.value = 0.5; lfo.connect(lg).connect(am.gain); lfo.start();
    s.connect(f).connect(am).connect(g); return { g, nodes: [s, lfo] };
  },
  cave(S) { const { s, g } = S.loop(S.brown), f = filt(S, 'lowpass', 110, 0.8); s.connect(f).connect(g); return { g, nodes: [s] }; },
  lava(S) { const { s, g } = S.loop(S.brown), f = filt(S, 'lowpass', 190, 1.2); s.connect(f).connect(g); return { g, nodes: [s] }; },
  mark(S) { // temný drone 55 Hz z rozladěných pil a pomalu dýchající filtr
    const c = S.ctx, g = c.createGain(), f = filt(S, 'lowpass', 420, 2.5), lfo = c.createOscillator(), lg = c.createGain();
    g.gain.value = 0; g.connect(S.ambBus);
    const oscs = [55, 55.4, 82.6, 110.3].map((fr) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(); return o; });
    lfo.frequency.value = 0.045; lg.gain.value = 260; lfo.connect(lg).connect(f.frequency); lfo.start();
    f.connect(g); return { g, nodes: [...oscs, lfo] };
  },
  water(S) { const { s, g } = S.loop(S.brown), f = filt(S, 'bandpass', 650, 0.9); s.connect(f).connect(g); return { g, nodes: [s], flutter: true }; },
  rain(S) {
    const c = S.ctx, { s, g } = S.loop(S.white), hp = filt(S, 'highpass', 1000, 0.5), lp = filt(S, 'lowpass', 8000, 0.5);
    s.connect(hp).connect(lp).connect(g);
    const d = c.createBufferSource(), dg = c.createGain(), bp = filt(S, 'bandpass', 2600, 0.8); // kapky
    d.buffer = S.drops; d.loop = true; dg.gain.value = 2.2; d.connect(bp).connect(dg).connect(g); d.start();
    return { g, nodes: [s, d], mod: (e, t) => lp.frequency.setTargetAtTime(e.indoor ? 900 : 8000, t, 0.3) };
  },
  underwater(S) { const { s, g } = S.loop(S.brown), f = filt(S, 'lowpass', 350, 1); s.connect(f).connect(g); return { g, nodes: [s] }; },
};
function filt(S, type, freq, q) { const f = S.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }

export class Ambience {
  constructor(S) {
    this.S = S;
    this.beds = new Map();
    // Kapky v jeskyni: ozvěna přes zpožďovací smyčku (0,3 s)
    const c = S.ctx;
    this.echo = c.createDelay(1);
    this.echo.delayTime.value = 0.3;
    const fb = c.createGain(), lp = filt(S, 'lowpass', 3000, 0.7);
    fb.gain.value = 0.38;
    this.echo.connect(lp).connect(fb).connect(this.echo);
    this.echoIn = c.createGain();
    this.echoIn.connect(S.ambBus);
    this.echoIn.connect(this.echo);
    this.echo.connect(S.ambBus);
  }
  update(dt, env) {
    const S = this.S, t = S.ctx.currentTime, T = ambienceTargets(env);
    for (const [name, target] of Object.entries(T.beds)) {
      let bed = this.beds.get(name);
      if (!bed && target < 0.002) continue;
      if (!bed) { bed = BEDS[name](S); bed.quiet = 0; this.beds.set(name, bed); }
      const flutter = bed.flutter ? 0.6 + 0.8 * Math.random() : 1;
      bed.g.gain.setTargetAtTime(target * flutter, t, bed.flutter ? 0.12 : 0.8);
      bed.mod?.(env, t);
      bed.quiet = target < 0.002 ? bed.quiet + dt : 0;
      if (bed.quiet > 6) { for (const n of bed.nodes) { try { n.stop(); } catch {} } bed.g.disconnect(); this.beds.delete(name); } // dlouho ticho: zastavit (šetří výkon)
    }
    // jednorázové zvuky kolem hráče
    const L = S.lis, around = (r0, r1, h0, h1) => { const a = Math.random() * Math.PI * 2, r = R(r0, r1); return [L.x + Math.cos(a) * r, L.y + R(h0, h1), L.z + Math.sin(a) * r]; };
    const fired = this.fired ||= {};
    const roll = (rate, name) => { const ok = Math.random() < rate * dt; if (ok) fired[name] = (fired[name] || 0) + 1; return ok; };
    if (roll(T.rates.bird, 'bird') && T.birds.length) { const kind = T.birds[Math.floor(Math.random() * T.birds.length)]; S.at(...around(8, 30, 3, 10), () => S.bird(kind), { ref: 6 }); }
    if (roll(T.rates.cricket, 'cricket')) S.at(...around(3, 14, -1.5, 0), () => S.cricket(), { ref: 4 });
    if (roll(T.rates.owl, 'owl')) S.at(...around(18, 34, 5, 12), () => S.owl(), { ref: 10 });
    if (roll(T.rates.frog, 'frog') && env.pond) S.at(env.pond.x + R(-env.pond.r, env.pond.r) * 0.7, L.y - 1.5, env.pond.z + R(-env.pond.r, env.pond.r) * 0.7, () => S.frog(), { ref: 5 });
    if (roll(T.rates.drip, 'drip')) S.at(...around(2, 12, 1, 4), () => S.drip(), { ref: 3, dest: this.echoIn });
    if (roll(T.rates.rumble, 'rumble')) S.at(...around(10, 25, -6, 2), () => S.rumble(), { ref: 8, dest: this.echoIn });
    if (roll(T.rates.lavaPop, 'lavaPop') && env.crater) S.at(env.crater.x + R(-12, 12), env.crater.y, env.crater.z + R(-12, 12), () => S.lavaPop(), { ref: 6, max: 60 });
    if (roll(T.rates.alien, 'alien')) S.at(...around(15, 35, 4, 15), () => S.alien(), { ref: 12 });
    if (roll(T.rates.bubble, 'bubble')) S.bubble();
  }
}
