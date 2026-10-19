// Zvuky těžby, stavění a nástrojů podle materiálu (syntetizované, bez nahrávek).
// Každý zvuk má trochu jinou výšku a hlasitost, ať údery nezní jako kulomet. Nejvíc 24 hlasů naráz.
import { BLOCKS } from '../../../shared/data/index.js';
import { V, VOX } from '../../../shared/world/voxels.js';
import { Sound } from './sound.js';

const rnd = (a, b) => a + Math.random() * (b - a);
let voices = 0;
const MAX_VOICES = 24;
const ok = () => Sound.ctx && Sound.white && voices < MAX_VOICES;
function track(node, stopAt) {
  voices++;
  node.onended = () => { voices--; };
  node.stop(stopAt);
}
// Šum přes filtr s obálkou (útok a doznění)
function noise({ dur = 0.08, f0 = 1000, f1 = f0, q = 1, type = 'bandpass', vol = 0.2, delay = 0, attack = 0.004 }) {
  if (!ok()) return;
  const c = Sound.ctx, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = Sound.white;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(Sound.master);
  s.start(t, Math.random() * 1.5);
  track(s, t + dur + 0.03);
}
// Tón s obálkou (klepnutí, zvonění kovu)
function tone({ f = 440, f1 = 0, dur = 0.1, vol = 0.1, type = 'sine', delay = 0, attack = 0.003 }) {
  if (!ok()) return;
  const c = Sound.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(Sound.master);
  o.start(t);
  track(o, t + dur + 0.03);
}

/** Materiál cíle (strom, balvan, blok, podzemí…) pro zvuk a úlomky. */
export function matOf(t) {
  if (!t) return 'stone';
  if (t.kind === 'tree') return t.tree?.kind === 'cactus' || t.tree?.kind === 'mushroom' ? 'leaves' : 'wood';
  if (t.kind === 'rock') return 'stone';
  if (t.kind === 'grass') return 'grass';
  if (t.kind === 'vehicle') return 'metal';
  if (t.kind === 'paper') return 'cloth';
  if (t.kind === 'vox') {
    const v = t.vox;
    if (v === V.SAND) return 'sand';
    if (v === V.SNOW) return 'snow';
    if (v === V.CRYSTAL || v === V.MARKORITE || v === V.QUARTZ) return 'crystal';
    if (VOX[v]?.tool === 'shovel') return 'dirt';
    return 'stone';
  }
  if (t.kind === 'block') return blockMatFamily(t.type);
  return 'stone';
}
export function blockMatFamily(type) {
  const b = BLOCKS[type] || {}, id = String(b.mat || type);
  if (/glass|pane/.test(id)) return 'glass';
  if (/wool|carpet|bed/.test(id)) return 'cloth';
  if (/sand(?!stone)/.test(id)) return 'sand';
  if (/snow/.test(id)) return 'snow';
  if (/crystal|quartz|shard/.test(id)) return 'crystal';
  if (b.elec || /iron|steel|copper|gold|metal|bars|lantern|anvil|generator|machine/.test(id)) return 'metal';
  if (b.tool === 'axe') return 'wood';
  if (b.tool === 'shovel') return 'dirt';
  if (/leaves|mushroom/.test(id)) return 'leaves';
  return 'stone';
}

// Recepty zvuků podle materiálu. p = výška (1 = normální), v = hlasitost.
const MAT = {
  stone(p, v) {
    noise({ dur: rnd(0.04, 0.07), f0: rnd(1500, 3000) * p, q: 1.5, vol: 0.5 * v });
    tone({ f: 120 * p, f1: 70 * p, dur: 0.06, vol: 0.35 * v });
  },
  wood(p, v) {
    noise({ dur: 0.07, f0: rnd(300, 500) * p, q: 6, vol: 0.9 * v });
    tone({ f: 180 * p, f1: 120 * p, dur: 0.09, vol: 0.4 * v, type: 'triangle' });
  },
  dirt(p, v) { noise({ dur: 0.09, f0: rnd(600, 900) * p, f1: 300 * p, type: 'lowpass', q: 0.7, vol: 0.55 * v }); },
  grass(p, v) {
    for (let i = 0; i < 3; i++) noise({ dur: rnd(0.08, 0.12), f0: rnd(2000, 6000) * p, type: 'highpass', q: 0.5, vol: 0.22 * v, delay: i * rnd(0.015, 0.03), attack: 0.02 });
  },
  leaves(p, v) { MAT.grass(p * 0.8, v); },
  sand(p, v) { for (let i = 0; i < 7; i++) noise({ dur: 0.015, f0: rnd(3000, 6000) * p, type: 'highpass', q: 0.5, vol: rnd(0.12, 0.3) * v, delay: Math.random() * 0.12, attack: 0.002 }); },
  snow(p, v) {
    for (let i = 0; i < 6; i++) noise({ dur: 0.025, f0: rnd(1500, 3000) * p, type: 'lowpass', q: 0.8, vol: rnd(0.15, 0.3) * v, delay: Math.random() * 0.14, attack: 0.003 });
    tone({ f: 1250 * p, f1: 900 * p, dur: 0.035, vol: 0.03 * v, delay: 0.05 });
  },
  metal(p, v) {
    const f = rnd(520, 640) * p;
    [[1, 0.25, 0.6], [2.76, 0.12, 0.4], [5.4, 0.07, 0.25]].forEach(([r, vol, d]) => tone({ f: f * r, dur: d, vol: vol * v }));
    noise({ dur: 0.03, f0: 4000 * p, q: 1, vol: 0.25 * v });
  },
  glass(p, v) { tone({ f: rnd(2000, 5000) * p, dur: 0.12, vol: 0.12 * v }); noise({ dur: 0.02, f0: 6000, type: 'highpass', vol: 0.2 * v }); },
  crystal(p, v) {
    const f = rnd(1300, 1700) * p;
    tone({ f, dur: 0.35, vol: 0.12 * v }); tone({ f: f * 2.41, dur: 0.25, vol: 0.06 * v, delay: 0.01 });
    noise({ dur: 0.04, f0: 3500 * p, q: 2, vol: 0.25 * v });
  },
  cloth(p, v) { noise({ dur: 0.1, f0: 1200 * p, f1: 500 * p, type: 'lowpass', q: 0.5, vol: 0.3 * v, attack: 0.02 }); },
};
// Rozbití: delší a hlubší, rozsype se na drobky
function breakSound(fam, p, v) {
  const r = MAT[fam] || MAT.stone;
  r(p * 0.8, v);
  if (fam === 'glass') { for (let i = 0; i < 6; i++) tone({ f: rnd(2500, 6500), dur: rnd(0.1, 0.3), vol: 0.07 * v, delay: Math.random() * 0.15 }); return; }
  if (fam === 'crystal') { for (let i = 0; i < 5; i++) tone({ f: rnd(1800, 4200), dur: 0.5, vol: 0.05 * v, delay: i * 0.05 }); return; }
  const body = { stone: [1400, 140, 0.32], wood: [900, 120, 0.3], dirt: [700, 150, 0.22], grass: [3500, 900, 0.18], leaves: [3000, 800, 0.2], sand: [2400, 600, 0.22], snow: [1800, 500, 0.2], metal: [3000, 400, 0.15], cloth: [900, 300, 0.15] }[fam] || [1400, 140, 0.3];
  noise({ dur: body[2] + 0.12, f0: body[0] * p, f1: body[1] * p, type: 'lowpass', q: 0.7, vol: 0.45 * v });
  if (fam === 'stone' || fam === 'dirt' || fam === 'sand') for (let i = 0; i < 4; i++) noise({ dur: 0.03, f0: rnd(1500, 3500), q: 2, vol: 0.12 * v, delay: 0.05 + Math.random() * 0.2 }); // drobky
  if (fam === 'wood') tone({ f: 95 * p, f1: 60 * p, dur: 0.25, vol: 0.25 * v, type: 'triangle', delay: 0.02 });
}

/**
 * Zvuk materiálu: 'hit' = úder při těžbě (tišší, nižší), 'break' = rozbití, 'place' = položení.
 * @param {'hit'|'break'|'place'} kind
 * @param {string} fam materiál z matOf()
 */
export function materialSound(kind, fam) {
  if (!Sound.ctx) return;
  const p = rnd(0.9, 1.1), v = rnd(0.85, 1.15);
  if (kind === 'break') breakSound(fam, p, v * 0.8);
  else if (kind === 'place') (MAT[fam] || MAT.stone)(p * 0.85, v * 0.7);
  else (MAT[fam] || MAT.stone)(p * 0.75, v * 0.38);
}

/** Zvuky nástrojů a boje. */
export function toolSound(name, strength = 1) {
  if (!Sound.ctx) return;
  const p = rnd(0.9, 1.1);
  switch (name) {
    case 'snap': // nástroj se rozbil: prasknutí + cinknutí úlomků
      noise({ dur: 0.09, f0: 3200 * p, f1: 700, q: 1.2, vol: 0.8 });
      tone({ f: 1900 * p, f1: 700, dur: 0.18, vol: 0.18, type: 'triangle' });
      tone({ f: 140 * p, f1: 60, dur: 0.2, vol: 0.4 });
      for (let i = 0; i < 4; i++) tone({ f: rnd(2400, 4200), dur: 0.12, vol: 0.06, delay: 0.12 + i * rnd(0.04, 0.08) });
      break;
    case 'repair': // kovadlina: dvě cinknutí a jiskry
      [0, 0.16].forEach((d, i) => { tone({ f: 1150 * p * (i ? 1.12 : 1), dur: 0.5, vol: 0.16, delay: d }); tone({ f: 3170 * p, dur: 0.3, vol: 0.05, delay: d }); noise({ dur: 0.03, f0: 5000, q: 1, vol: 0.3, delay: d }); });
      tone({ f: 523, dur: 0.25, vol: 0.06, type: 'triangle', delay: 0.34 }); tone({ f: 784, dur: 0.35, vol: 0.06, type: 'triangle', delay: 0.42 });
      break;
    case 'whoosh': // máchnutí do vzduchu (síla podle nabití)
      noise({ dur: 0.16 + 0.08 * strength, f0: 450 * p, f1: (1600 + 1400 * strength) * p, q: 1.3, vol: 0.12 + 0.18 * strength, attack: 0.03 });
      break;
    case 'hit': // zásah tvora: tupý úder (silnější podle nabití)
      noise({ dur: 0.13, f0: 1600 * p, f1: 220, type: 'lowpass', q: 1, vol: 0.35 + 0.35 * strength });
      tone({ f: 150 * p, f1: 55, dur: 0.15, vol: 0.2 + 0.25 * strength, type: 'square' });
      break;
    case 'weak': // nenabitý úder: slabé plácnutí
      noise({ dur: 0.07, f0: 1100 * p, f1: 400, type: 'lowpass', q: 0.8, vol: 0.22 });
      break;
    case 'crit': // kritický zásah: jasné "šing"
      tone({ f: 2400 * p, f1: 3600 * p, dur: 0.22, vol: 0.09, type: 'triangle' });
      tone({ f: 3300 * p, dur: 0.3, vol: 0.05, delay: 0.03 });
      noise({ dur: 0.18, f0: 7000, f1: 2500, q: 1.5, vol: 0.18 });
      break;
    case 'charged': // úder je zase nabitý (tiché cvaknutí)
      tone({ f: 1800 * p, dur: 0.03, vol: 0.025 });
      break;
    case 'low': // nástroj se brzy rozbije
      tone({ f: 880, dur: 0.12, vol: 0.07, type: 'triangle' }); tone({ f: 622, dur: 0.18, vol: 0.07, type: 'triangle', delay: 0.13 });
      break;
    case 'poof': // tvor se rozplyne v kouři
      noise({ dur: 0.35, f0: 900 * p, f1: 200, type: 'lowpass', q: 0.6, vol: 0.18, attack: 0.04 });
      break;
    case 'equip': // vytažení nástroje
      noise({ dur: 0.06, f0: 2500 * p, q: 2, vol: 0.06 });
      break;
  }
}
