// Zvuky syntetizované v prohlížeči (WebAudio): mix, hlasitost, prostorový zvuk, ozvěna v jeskyních, tlumení pod vodou.
// Žádné nahrávky: každý zvuk se skládá z šumu a tónů. Recepty zvuků jsou v sfx.js (materiály, hra) a voices.js (zvířata),
// zvuky okolí v ambience.js, stroje a ohně v hums.js, hudba v music.js. Kdo co kdy hraje řídí soundscape.js.
import '../render/particles.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { SFX } from './sfx.js';
import { VOICES } from './voices.js';
import { readVolumes } from './volume.js';

export { VOL_DEFAULT, readVolumes } from './volume.js';
export const rnd = (a, b) => a + Math.random() * (b - a);

// Šumové smyčky (2 s, stereo = každý kanál jiný šum: vítr a déšť pak zní "široce").
function noiseBuf(c, kind, sec = 2, ch = 2) {
  const len = Math.floor(c.sampleRate * sec), b = c.createBuffer(ch, len, c.sampleRate);
  for (let k = 0; k < ch; k++) {
    const d = b.getChannelData(k);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else { b0 = 0.997 * b0 + 0.029591 * w; b1 = 0.985 * b1 + 0.032534 * w; b2 = 0.95 * b2 + 0.048056 * w; d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6; } // růžový
    }
  }
  return b;
}
// Zrnka: krátké praskající impulsy (písek, sníh, drobící se kamínky, praskání ohně, kapky deště).
function grainBuf(c, sec, count, len0, len1, decay = 1) {
  const n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let g = 0; g < count; g++) {
    const at = Math.floor(Math.random() ** decay * (n - 1)), L = Math.floor(c.sampleRate * rnd(len0, len1)), a = rnd(0.3, 1) * (Math.random() < 0.5 ? -1 : 1);
    for (let i = 0; i < L && at + i < n; i++) d[at + i] += a * (Math.random() * 2 - 1) * Math.exp((-5 * i) / L);
  }
  return b;
}
// Dozvuk: šum, který stereo doznívá (jeskyně, místnost, hudba).
function impulse(c, sec, decay) {
  const n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
  for (let k = 0; k < 2; k++) {
    const d = b.getChannelData(k);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay * (i < 200 ? i / 200 : 1);
  }
  return b;
}
function setPos(p, x, y, z) {
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
}

// ============================================================ zvukový stroj
export const Sound = {
  ctx: null,
  voices: 0, maxVoices: 32, played: 0, dropped: 0, // živé hlasy jednorázových zvuků (strop proti "kulometu")
  lis: { x: 0, y: 0, z: 0 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume?.()?.catch?.(() => {}); return; }
    let c;
    try { c = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); } catch { return; }
    this.setup(c);
    addEventListener('rise-prefs', () => this.applyVolumes());
  },
  // Postaví mix: zvuky + okolí -> tlumení (pod vodou) -> kompresor -> hlasitost; ozvěna jako vedlejší cesta; hudba zvlášť.
  setup(c) {
    this.ctx = c;
    this.voices = 0;
    this.white = noiseBuf(c, 'white');
    this.brown = noiseBuf(c, 'brown');
    this.pink = noiseBuf(c, 'pink');
    this.grains = [0, 1, 2, 3].map(() => grainBuf(c, 0.25, 34, 0.002, 0.006, 1.6));
    this.crackle = [0, 1].map(() => grainBuf(c, 2, 26, 0.001, 0.004));
    this.drops = grainBuf(c, 2, 260, 0.004, 0.012);
    const g = (v, to) => { const n = c.createGain(); n.gain.value = v; if (to) n.connect(to); return n; };
    this.out = g(0, c.destination);
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 14; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.25;
    this.comp.connect(this.out);
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.5;
    this.muffle.connect(this.comp);
    this.verb = c.createConvolver();
    this.verb.buffer = impulse(c, 2.6, 2.4);
    this.verb.connect(this.comp);
    this.verbIn = c.createBiquadFilter(); // ozvěna bez basů: jinak se z kroků slije dunivé bahno
    this.verbIn.type = 'highpass'; this.verbIn.frequency.value = 320; this.verbIn.Q.value = 0.6;
    this.verbIn.connect(this.verb);
    this.room = g(0.05, this.verbIn); // kolik zvuků jde do ozvěny (v jeskyni hodně)
    this.muffle.connect(this.room);
    this.sfxBus = g(1, this.muffle);
    this.ambBus = g(1, this.muffle);
    this.musicBus = g(0, this.comp);
    this.musicSend = g(0.4, this.verbIn);
    this.musicBus.connect(this.musicSend);
    this.dest = this.master = this.sfxBus; // master: starý název (motor auta)
    this.applyVolumes();
  },
  applyVolumes(v = readVolumes()) {
    this.vols = v;
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    this.out.gain.setTargetAtTime(0.95 * v.vol, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(v.sfx * 0.9, t, 0.05);
    this.musicBus.gain.setTargetAtTime(v.music * 0.5, t, 0.05);
  },
  // Pod vodou / za zdí: všechno kromě hudby přes dolní propust. Ozvěna: 0 = venku, 1 = velká jeskyně.
  setMuffle(freq) { if (this.ctx) this.muffle.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.12); },
  setRoom(send) { if (this.ctx) this.room.gain.setTargetAtTime(send, this.ctx.currentTime, 0.4); },
  // Kde stojí ucho (kamera) a kam se dívá.
  listen(x, y, z, fx, fy, fz) {
    this.lis.x = x; this.lis.y = y; this.lis.z = z;
    const L = this.ctx?.listener;
    if (!L) return;
    if (L.positionX) {
      L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
      L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(x, y, z); L.setOrientation(fx, fy, fz, 0, 1, 0); }
  },
  // Zvuk z místa ve světě: fn() zahraje recept, který jde přes panner (směr + útlum vzdáleností, vzdálené zvuky ztratí výšky).
  at(x, y, z, fn, { ref = 2, max = 40, dest, keep = 6 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const L = this.lis, d = Math.hypot(x - L.x, y - L.y, z - L.z);
    if (d > max) return;
    const prev = this.dest;
    if (d < 0.5 && !dest) { fn.call(this); return; }
    const pn = c.createPanner();
    pn.panningModel = 'equalpower'; pn.distanceModel = 'inverse'; pn.refDistance = ref; pn.maxDistance = 10000; pn.rolloffFactor = 1;
    setPos(pn, x, y, z);
    pn.connect(dest || prev);
    let head = pn;
    if (d > 10) { // vzduch pohltí výšky
      head = c.createBiquadFilter();
      head.type = 'lowpass';
      head.frequency.value = Math.max(1500, 16000 * Math.exp(-(d - 10) / 12));
      head.connect(pn);
    }
    this.dest = head;
    try { fn.call(this); } finally { this.dest = prev; }
    setTimeout(() => { try { pn.disconnect(); } catch {} }, keep * 1000);
  },
  // Volný hlas? Méně důležité zvuky (prio 0: ptáci, kapky) dostanou jen část hlasů.
  voice(prio = 1) {
    if (!this.ctx) return false;
    if (this.voices >= (prio ? this.maxVoices : this.maxVoices * 0.6)) { this.dropped++; return false; }
    return true;
  },
  track(src) { this.voices++; this.played++; src.onended = () => { this.voices--; }; },
  // Šum přes filtr. vary: náhodná výška ±10 % a hlasitost ±15 % (proti "kulometu"); recepty materiálů losují samy (vary: 0).
  burst({ dur = 0.2, f0 = 1000, f1 = 400, q = 1, vol = 0.3, type = 'bandpass', delay = 0, attack = 0.002, buf, vary = 1, prio = 1, rate = 1 }) {
    const c = this.ctx;
    if (!c || !this.voice(prio)) return;
    const p = vary ? rnd(0.9, 1.1) : 1, v = vary ? vol * rnd(0.85, 1.15) : vol;
    const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf || this.white;
    s.playbackRate.value = rate;
    if (s.buffer.duration < dur + 1.6) s.loop = true; // delší zvuk než smyčka šumu
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(Math.min(20000, f0 * p), t);
    f.frequency.exponentialRampToValueAtTime(Math.min(20000, Math.max(20, f1 * p)), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
    s.connect(f).connect(g).connect(this.dest);
    this.track(s);
    s.start(t, buf ? 0 : Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  },
  // Tón. opts: attack, vary (náhodná výška), prio, vib [Hz, hloubka v Hz], am [Hz, hloubka 0–1], filter [typ, Hz, Q].
  tone(freq, dur, vol = 0.2, type = 'sine', delay = 0, slideTo = 0, opts = {}) {
    const c = this.ctx;
    if (!c || !this.voice(opts.prio ?? 1)) return;
    const p = opts.vary ? rnd(1 - opts.vary, 1 + opts.vary) : 1, v = vol * rnd(0.88, 1.12);
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain(), att = opts.attack ?? 0.012;
    o.type = type;
    o.frequency.setValueAtTime(freq * p, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo * p, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, att + 0.01));
    let head = o, extra = [];
    if (opts.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = opts.vib[0]; lg.gain.value = opts.vib[1]; l.connect(lg).connect(o.frequency); extra.push(l); }
    if (opts.filter) { const f = c.createBiquadFilter(); [f.type, f.frequency.value, f.Q.value] = opts.filter; head.connect(f); head = f; }
    if (opts.am) { const a = c.createGain(), l = c.createOscillator(), lg = c.createGain(); l.type = 'square'; l.frequency.value = opts.am[0]; lg.gain.value = opts.am[1] / 2; a.gain.value = 1 - opts.am[1] / 2; l.connect(lg).connect(a.gain); head.connect(a); head = a; extra.push(l); }
    head.connect(g).connect(this.dest);
    this.track(o);
    for (const n of [o, ...extra]) { n.start(t); n.stop(t + dur + 0.05); }
  },
  // Kovové zvonění: neharmonické alikvoty (1 : 2,76 : 5,4), každý doznívá jinak dlouho.
  ring(f, dur, vol, delay = 0, ratios = [1, 2.76, 5.4], prio = 1) {
    ratios.forEach((r, i) => this.tone(f * r, dur / (1 + i * 0.6), vol / (1 + i * 1.4), 'sine', delay, 0, { attack: 0.002, prio }));
  },
  // Smyčka šumu pro zvuky okolí: zdroj -> (filtry) -> zesílení. Vrací uzly, ať je jde měnit a zastavit.
  loop(buf, to) {
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain();
    s.buffer = buf; s.loop = true;
    g.gain.value = 0;
    g.connect(to || this.ambBus);
    s.start(c.currentTime, Math.random() * buf.duration);
    return { s, g };
  },
  // Měřák na výstupu (testy, ladění mixu): RMS a špička posledních ~40 ms.
  level() {
    const c = this.ctx;
    if (!c) return null;
    if (!this.meter) { this.meter = c.createAnalyser(); this.meter.fftSize = 2048; this.out.connect(this.meter); this.meterBuf = new Float32Array(2048); }
    this.meter.getFloatTimeDomainData(this.meterBuf);
    let peak = 0, sum = 0;
    for (const v of this.meterBuf) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    return { rms: Math.sqrt(sum / this.meterBuf.length), peak };
  },
  // Testy: vyrenderuje zvuky bez reproduktoru (OfflineAudioContext) a vrátí špičku a RMS (hlídá, že nic neřve ani nemlčí).
  async offline(sec, fn) {
    const rate = 44100, oc = new OfflineAudioContext(2, Math.ceil(rate * sec), rate), S = Object.create(this);
    S.setup(oc);
    S.applyVolumes({ vol: 1, sfx: 1, music: 1 });
    S.out.gain.value = 0.95;
    S.lis = { x: 0, y: 0, z: 0 };
    S.played = 0; S.dropped = 0;
    // at(čas, fn): zahrát později (pro ukázkovou nahrávku: kroky po sobě, změny prostředí…)
    const at = (time, cb) => oc.suspend(Math.round(time * rate / 128) * 128 / rate).then(() => { cb(); oc.resume(); });
    fn(S, at);
    const b = await oc.startRendering();
    let peak = 0, sum = 0;
    for (let k = 0; k < 2; k++) { const d = b.getChannelData(k); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; } }
    return { peak, rms: Math.sqrt(sum / (2 * b.length)), played: S.played, dropped: S.dropped, buffer: b };
  },
};
Object.assign(Sound, SFX, VOICES);
// První klik, dotyk nebo klávesa kdekoli = prohlížeč smí pustit zvuk (a probudit ho po návratu do okna).
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => Sound.init(), { capture: true, passive: true });
