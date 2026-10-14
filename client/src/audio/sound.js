// ============================================================ zvuk (syntetizovaný)
// Žádné zvukové soubory: každý zvuk se poskládá ze šumu a tónů (Web Audio).
// Zvuk se zapne po prvním kliknutí do hry (prohlížeče jinak zvuk nepustí).

export const Sound = {
  ctx: null,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const c = this.ctx, len = c.sampleRate * 2;
    this.master = c.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(c.destination);
    const brown = c.createBuffer(1, len, c.sampleRate), white = c.createBuffer(1, len, c.sampleRate);
    const bd = brown.getChannelData(0), wd = white.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; wd[i] = w; last = (last + 0.02 * w) / 1.02; bd[i] = last * 3.5; }
    this.white = white;
    const src = c.createBufferSource();
    src.buffer = brown;
    src.loop = true;
    this.windFilter = c.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windGain = c.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();
  },
  update(gust, night, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.08 + gust * 0.22, t, 0.6);
    this.windFilter.frequency.setTargetAtTime(280 + gust * 650, t, 0.6);
    if (night > 0.5 && Math.random() < dt * 1.2) this.chirp();
  },
  burst({ dur = 0.2, f0 = 1000, f1 = 400, q = 1, vol = 0.3, type = 'bandpass', delay = 0 }) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.white;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  },
  tone(freq, dur, vol = 0.2, type = 'sine', delay = 0, slideTo = 0) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  },
  swing() { this.burst({ dur: 0.2, f0: 500, f1: 2400, q: 1.4, vol: 0.3 }); },
  hit() { this.burst({ dur: 0.16, f0: 1400, f1: 200, q: 1, vol: 0.6, type: 'lowpass' }); this.tone(140, 0.16, 0.3, 'square', 0, 60); },
  kill() { this.tone(260, 0.5, 0.18, 'sawtooth', 0, 50); this.burst({ dur: 0.5, f0: 3000, f1: 300, q: 0.7, vol: 0.35 }); },
  hurt() { this.tone(95, 0.3, 0.4, 'sawtooth', 0, 55); this.burst({ dur: 0.2, f0: 800, f1: 150, q: 1, vol: 0.4, type: 'lowpass' }); },
  step() { this.burst({ dur: 0.09, f0: 1900, f1: 500, q: 0.8, vol: 0.06 }); },
  chop() { this.tone(170, 0.12, 0.35, 'triangle', 0, 90); this.burst({ dur: 0.08, f0: 2500, f1: 800, q: 1, vol: 0.25 }); },
  mine() { this.burst({ dur: 0.07, f0: 4200, f1: 2600, q: 3, vol: 0.35 }); this.tone(950, 0.05, 0.06, 'square'); },
  rustle() { this.burst({ dur: 0.12, f0: 3000, f1: 1500, q: 0.6, vol: 0.12 }); },
  crack() { this.burst({ dur: 0.6, f0: 1500, f1: 120, q: 0.7, vol: 0.5, type: 'lowpass' }); this.tone(80, 0.4, 0.2, 'triangle', 0.05, 40); },
  pop() { this.tone(620, 0.08, 0.12, 'sine', 0, 990); },
  craft() { this.tone(523, 0.12, 0.12, 'triangle'); this.tone(784, 0.2, 0.12, 'triangle', 0.08); },
  place() { this.tone(120, 0.1, 0.3, 'sine', 0, 70); this.burst({ dur: 0.06, f0: 1200, f1: 400, vol: 0.2, type: 'lowpass' }); },
  eat() { for (let i = 0; i < 3; i++) this.burst({ dur: 0.07, f0: 1800, f1: 900, q: 2, vol: 0.2, delay: i * 0.13 }); },
  pickup() { [880, 1109, 1319, 1760].forEach((f, i) => this.tone(f, 0.6, 0.13, 'sine', i * 0.07)); },
  growl() { this.tone(70 + Math.random() * 30, 0.5, 0.12, 'sawtooth', 0, 45); },
  baa() { this.tone(420, 0.45, 0.05, 'sawtooth', 0, 360); this.tone(424, 0.45, 0.04, 'sawtooth', 0.02, 362); },
  grunt() { this.tone(110, 0.25, 0.12, 'sawtooth', 0, 70); },
  chirp() { const f = 4200 + Math.random() * 600; for (let i = 0; i < 3; i++) this.tone(f, 0.035, 0.015, 'sine', i * 0.06); },
};
