// Hudba: tichá generovaná skladba (měkký klavír, plochy akordů a basa) jako v Minecraftu: hraje 1–3 minuty,
// pak 3–7 minut ticho. Ve dne D dórská, v noci a moll, v jeskyni frygická, v Markově dimenzi celotónová (cizí, snová).
const R = (a, b) => a + Math.random() * (b - a);
export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

export const MODES = {
  day: { root: 62, scale: [0, 2, 3, 5, 7, 9, 10], melody: [0, 2, 3, 5, 7, 9], prog: [0, 3, 6, 4, 0, 3, 5, 4], tempo: [66, 76] },
  night: { root: 57, scale: [0, 2, 3, 5, 7, 8, 10], melody: [0, 3, 5, 7, 10], prog: [0, 5, 3, 6, 0, 5, 2, 4], tempo: [56, 66] },
  cave: { root: 52, scale: [0, 1, 3, 5, 7, 8, 10], melody: [0, 1, 5, 7, 8], prog: [0, 1, 0, 5, 0, 6, 1, 0], tempo: [50, 58] },
  mark: { root: 58, scale: [0, 2, 4, 6, 8, 10], melody: [0, 2, 4, 6, 8, 10], prog: [0, 1, 2, 0, 3, 1, 4, 2], tempo: [52, 62] },
};
// Názvy skladeb (ukážou se na chvíli pod hodinami, když skladba začne)
export const TITLES = {
  day: ['Ranní louka', 'Vítr v trávě', 'Cesta za obzor', 'Zlaté odpoledne'],
  night: ['Hvězdná noc', 'Ticho nad lesem', 'Měsíční svit'],
  cave: ['Hlubiny', 'Krystalové jeskyně', 'Kapky ve tmě'],
  mark: ['Markova hvězda', 'Fialové nebe', 'Signál z dálky'],
};
/** Který režim hudby se hodí k prostředí. */
export const pickMode = (env) => (env.mark ? 'mark' : (env.cave || 0) > 0.5 ? 'cave' : (env.day ?? 1) < 0.4 ? 'night' : 'day');
/** Akord na stupni stupnice (tercie nad sebou), jako MIDI noty. seventh = přidat septimu. */
export function chordNotes(mode, degree, seventh = false) {
  const M = MODES[mode], sc = M.scale, n = sc.length, out = [];
  for (let k = 0; k < (seventh ? 4 : 3); k++) { const i = degree + k * 2; out.push(M.root - 12 + sc[i % n] + 12 * Math.floor(i / n)); }
  return out;
}

export class Music {
  constructor(S) {
    this.S = S;
    const c = S.ctx;
    this.state = 'wait';
    this.wait = R(25, 50); // první skladba přijde po chvíli hraní
    this.mode = 'day';
    // ozvěna klavíru (0,375 s, zpětná vazba 0,35, tmavší opakování)
    this.delay = c.createDelay(2);
    this.delay.delayTime.value = 0.375;
    const fb = c.createGain(), lp = c.createBiquadFilter();
    fb.gain.value = 0.35; lp.type = 'lowpass'; lp.frequency.value = 2400;
    this.delay.connect(lp).connect(fb).connect(this.delay);
    this.delayIn = c.createGain();
    this.delayIn.gain.value = 0.45;
    this.delayIn.connect(this.delay);
    this.delay.connect(S.musicBus);
    this.pads = [];
  }
  // Spustí skladbu (také pro testy a ladění: game.Sound.music.start('night')).
  start(mode = this.mode) {
    const M = MODES[mode], c = this.S.ctx;
    this.mode = mode;
    this.state = 'play';
    this.left = R(70, 160);
    this.beat = 60 / R(...M.tempo);
    this.bar = 0;
    this.nextChord = c.currentTime + 0.3;
    this.nextNote = this.nextChord + this.beat * 2;
    this.mel = Math.floor(Math.random() * M.melody.length);
    const names = TITLES[mode];
    this.title = names[Math.floor(Math.random() * names.length)];
    this.onStart?.(this.title, mode);
  }
  stop(wait = R(180, 420)) { this.state = 'wait'; this.wait = wait; for (const p of this.pads) this.release(p, 3); this.pads = []; }
  update(dt, env) {
    const want = pickMode(env);
    if (this.state === 'wait') {
      if (want !== this.mode && (want === 'mark' || want === 'cave')) this.wait = Math.min(this.wait, R(8, 20)); // nové místo: hudba přijde dřív
      this.mode = want;
      if ((this.wait -= dt) <= 0) this.start(want);
      return;
    }
    if ((this.left -= dt) <= 0 || (want !== this.mode && (want === 'mark' || this.mode === 'mark'))) { this.stop(want !== this.mode ? R(10, 25) : undefined); return; }
    const c = this.S.ctx, M = MODES[this.mode], ahead = c.currentTime + 0.15;
    if (this.nextChord < ahead) { // nový akord každé 2 takty
      const deg = M.prog[this.bar % M.prog.length];
      for (const p of this.pads) this.release(p, 2.5);
      this.pads = chordNotes(this.mode, deg, Math.random() < 0.4).map((m, i) => this.pad(midiHz(m + 12), this.nextChord, 0.035 / (1 + i * 0.25)));
      this.pads.push(this.pad(midiHz(chordNotes(this.mode, deg)[0] - 12), this.nextChord, 0.05, 'sine')); // basa
      this.bar++;
      this.nextChord += this.beat * 8;
    }
    if (this.nextNote < ahead) { // melodie: náhodná procházka po pentatonice, fráze a pauzy
      const mel = M.melody, step = [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)];
      this.mel = Math.max(0, Math.min(mel.length * 2 - 1, this.mel + step));
      const m = M.root + mel[this.mel % mel.length] + 12 * Math.floor(this.mel / mel.length);
      this.piano(midiHz(m), this.nextNote, R(0.045, 0.07));
      if (Math.random() < 0.18) this.piano(midiHz(m - 12 + M.melody[2]), this.nextNote + this.beat / 2, 0.03); // občas dvojhlas
      this.nextNote += this.beat * (Math.random() < 0.2 ? R(4, 8) : [1, 1, 2, 2, 3][Math.floor(Math.random() * 5)]);
    }
  }
  // Měkký klavír: sinus + tichá oktáva, rychlý náběh, dlouhé doznění
  piano(f, t, v) {
    const c = this.S.ctx, g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(v * 0.35, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    g.connect(this.S.musicBus);
    g.connect(this.delayIn);
    for (const [r, k, type] of [[1, 1, 'sine'], [2, 0.18, 'triangle'], [3, 0.05, 'sine']]) {
      const o = c.createOscillator(), og = c.createGain();
      o.type = type; o.frequency.value = f * r; o.detune.value = R(-3, 3); og.gain.value = k;
      o.connect(og).connect(g); o.start(t); o.stop(t + 3.3);
    }
  }
  // Plocha (pad): dva rozladěné trojúhelníky přes dolní propust, pomalý náběh
  pad(f, t, v, type = 'triangle') {
    const c = this.S.ctx, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.5;
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 2);
    lp.connect(g).connect(this.S.musicBus);
    const oscs = [-5, 5].map((d) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); return o; });
    return { g, oscs };
  }
  release(p, sec) {
    const t = Math.max(this.S.ctx.currentTime, 0);
    p.g.gain.cancelScheduledValues(t);
    p.g.gain.setTargetAtTime(0.0001, t, sec / 4);
    for (const o of p.oscs) o.stop(t + sec + 0.5);
  }
}
