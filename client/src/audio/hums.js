// Zvuky věcí ve světě, které znějí stále: oheň praská, pec hučí, generátor bzučí, počítač šumí větrákem,
// spawner hrozivě hučí, probuzený portál zvoní. Hrají jen 4 nejbližší zdroje (každý z místa, kde stojí).
const R = (a, b) => a + Math.random() * (b - a);
export const HUM_SLOTS = 4;
// Dosah (m) a hlasitost jednotlivých druhů
export const HUM_KINDS = {
  fire: { r: 12, v: 0.09 }, furnace: { r: 10, v: 0.07 }, stove: { r: 8, v: 0.05 }, torch: { r: 4, v: 0.02 },
  generator: { r: 14, v: 0.05 }, motor: { r: 12, v: 0.035 }, efurnace: { r: 10, v: 0.03 }, computer: { r: 7, v: 0.02 },
  lamp: { r: 4, v: 0.008 }, cable: { r: 3.5, v: 0.012 }, spawner: { r: 12, v: 0.05 }, portal: { r: 16, v: 0.04 }, shard: { r: 9, v: 0.02 },
};

function build(S, kind) {
  const c = S.ctx, g = c.createGain(), nodes = [], osc = (type, f) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.start(); nodes.push(o); return o; };
  const f = (type, freq, q = 0.7) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = freq; n.Q.value = q; return n; };
  const noise = (buf) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(c.currentTime, Math.random() * buf.duration); nodes.push(s); return s; };
  const lfo = (rate, depth, param) => { const l = osc('sine', rate), lg = c.createGain(); lg.gain.value = depth; l.connect(lg).connect(param); };
  g.gain.value = 0;
  switch (kind) {
    case 'fire': case 'furnace': case 'torch': { // hukot plamene + praskání (smyčka zrnek)
      noise(S.brown).connect(f('lowpass', kind === 'furnace' ? 220 : 380)).connect(g);
      const cr = noise(S.crackle[Math.floor(Math.random() * 2)]), cg = c.createGain();
      cg.gain.value = kind === 'furnace' ? 1.2 : 2.4; cr.playbackRate.value = R(0.8, 1.2);
      cr.connect(f('bandpass', 2200, 0.6)).connect(cg).connect(g);
      break;
    }
    case 'stove': { const s = noise(S.white), a = c.createGain(); a.gain.value = 0.6; lfo(3.1, 0.35, a.gain); s.connect(f('bandpass', 4200, 0.8)).connect(a).connect(g); break; } // syčení
    case 'generator': { // 50 Hz s alikvotami a tepot motoru
      const a = c.createGain(); a.gain.value = 0.7; lfo(8, 0.3, a.gain);
      const lp = f('lowpass', 650, 1.5); [50, 100, 150.5].forEach((fr, i) => { const o = osc(i ? 'sine' : 'sawtooth', fr); o.connect(lp); });
      lp.connect(a).connect(g);
      break;
    }
    case 'motor': { const o = osc('sawtooth', 180); lfo(5, 3, o.frequency); o.connect(f('bandpass', 900, 2)).connect(g); break; }
    case 'efurnace': case 'lamp': case 'cable': { // elektrické bzučení 100 Hz + jemné praskání výšek
      const o = osc('sawtooth', 100), lp = f('lowpass', kind === 'efurnace' ? 900 : 500, 2); o.connect(lp).connect(g);
      const s = noise(S.crackle[0]), sg = c.createGain(); sg.gain.value = 0.6; s.connect(f('highpass', 3000)).connect(sg).connect(g);
      break;
    }
    case 'computer': { noise(S.pink).connect(f('bandpass', 900, 1.1)).connect(g); const o = osc('sine', 120); const og = c.createGain(); og.gain.value = 0.15; o.connect(og).connect(g); break; } // větrák
    case 'spawner': { // dvě rozladěné basy a dýchající šum
      const lp = f('lowpass', 300, 3); [110, 113.5].forEach((fr) => osc('triangle', fr).connect(lp)); lp.connect(g);
      const s = noise(S.pink), bp = f('bandpass', 700, 4); lfo(0.15, 400, bp.frequency); s.connect(bp).connect(g);
      break;
    }
    case 'portal': case 'shard': { // zvonivé třpytivé tóny s chvěním (hologram)
      const base = kind === 'portal' ? 220 : 880, a = c.createGain(); a.gain.value = 0.6; lfo(kind === 'portal' ? 0.5 : 3, 0.35, a.gain);
      [1, 1.5, 2, 3.01].forEach((r, i) => { const o = osc('sine', base * r); lfo(R(0.2, 0.6), base * r * 0.004, o.frequency); const og = c.createGain(); og.gain.value = 1 / (1 + i); o.connect(og).connect(a); });
      a.connect(g);
      break;
    }
  }
  return { g, nodes };
}

export class Hums {
  constructor(S) { this.S = S; this.slots = Array.from({ length: HUM_SLOTS }, () => null); }
  // list: [{ id, kind, x, y, z }] zdrojů v okolí; zahrají nejbližší (podle dosahu).
  update(list) {
    const S = this.S, c = S.ctx, t = c.currentTime, L = S.lis;
    const scored = list.map((s) => ({ ...s, d: Math.hypot(s.x - L.x, s.y - L.y, s.z - L.z) })).filter((s) => HUM_KINDS[s.kind] && s.d < HUM_KINDS[s.kind].r)
      .sort((a, b) => a.d / HUM_KINDS[a.kind].r - b.d / HUM_KINDS[b.kind].r).slice(0, HUM_SLOTS);
    const want = new Map(scored.map((s) => [s.id, s]));
    // uvolni sloty, které už nejsou potřeba (ztiší se a zastaví)
    for (let i = 0; i < this.slots.length; i++) {
      const sl = this.slots[i];
      if (sl && !want.has(sl.id)) { sl.g.gain.setTargetAtTime(0, t, 0.15); const old = sl; setTimeout(() => { for (const n of old.nodes) { try { n.stop(); } catch {} } old.pn.disconnect(); }, 900); this.slots[i] = null; }
    }
    for (const s of scored) {
      let sl = this.slots.find((x) => x?.id === s.id);
      if (!sl) {
        const i = this.slots.indexOf(null);
        if (i < 0) continue;
        const { g, nodes } = build(S, s.kind), pn = c.createPanner();
        pn.panningModel = 'equalpower'; pn.distanceModel = 'inverse'; pn.refDistance = 1.5; pn.rolloffFactor = 1;
        g.connect(pn).connect(S.ambBus);
        sl = this.slots[i] = { id: s.id, kind: s.kind, g, nodes, pn };
      }
      const K = HUM_KINDS[s.kind], fade = Math.min(1, (K.r - s.d) / (K.r * 0.35)); // na okraji dosahu plynule zeslábne
      if (sl.pn.positionX) { sl.pn.positionX.value = s.x; sl.pn.positionY.value = s.y; sl.pn.positionZ.value = s.z; } else sl.pn.setPosition(s.x, s.y, s.z);
      sl.g.gain.setTargetAtTime(K.v * fade * (s.gain ?? 1), t, 0.25);
    }
  }
  playing() { return this.slots.filter(Boolean).map((s) => s.kind); }
}
