// Zvuky okna inventáře a sbírání předmětů (krátké syntetizované cvaknutí, pípnutí a „plip").
// Modul nic nespouští při načtení, jen používá Sound z audio/sound.js.
import { Sound } from './sound.js';

const rnd = (a, b) => a + Math.random() * (b - a);
// Každý zvuk trochu jinak vysoko a nahlas, ať to při rychlém klikání nezní jako kulomet.
const vary = (v) => v * rnd(0.85, 1.15);
let lastHover = 0;

export const uiSound = {
  /** Vzít / položit předmět: krátké cvaknutí. */
  click() { Sound.tone(1800 * rnd(0.92, 1.08), 0.03, vary(0.05), 'sine'); },
  /** Položit předmět do políčka: hlubší „ťuk". */
  put() { Sound.tone(520 * rnd(0.9, 1.1), 0.05, vary(0.06), 'triangle', 0, 380); },
  /** Najetí myší na políčko: skoro neslyšné (nejvýš 12× za sekundu). */
  hover() { const t = performance.now(); if (t - lastHover < 80) return; lastHover = t; Sound.tone(2600 * rnd(0.95, 1.05), 0.015, 0.008, 'sine'); },
  /** Otevření inventáře: dva tóny nahoru; zavření: dolů. */
  open() { Sound.tone(660, 0.07, 0.05, 'sine'); Sound.tone(990, 0.09, 0.05, 'sine', 0.06); },
  close() { Sound.tone(880, 0.07, 0.045, 'sine'); Sound.tone(590, 0.09, 0.045, 'sine', 0.06); },
  /** Rozdělení tažením: tón podle počtu políček. */
  spread(k) { Sound.tone(700 + Math.min(k, 9) * 90, 0.05, 0.05, 'triangle'); },
  /** Dvojklik: posbírání do kurzoru (rychlé „vrrr" nahoru). */
  gather() { for (let i = 0; i < 3; i++) Sound.tone(900 + i * 260, 0.04, 0.045, 'sine', i * 0.035); },
  /** Seřazení batohu: kaskáda. */
  sort() { [520, 660, 780, 1040].forEach((f, i) => Sound.tone(f, 0.08, 0.045, 'triangle', i * 0.04)); },
  /** Nejde to (plno, špatné políčko). */
  deny() { Sound.tone(220, 0.09, 0.07, 'square', 0, 160); },
  /** Sebrání předmětu ze země: krátké vysoké „plip" (jako v Minecraftu: výška 1,6–3,4×). */
  pickup() { const f = 520 * rnd(1.6, 3.4); Sound.tone(f, 0.07, vary(0.07), 'sine', 0, f * 1.5); },
  /** Vyhození předmětu: „fuk". */
  toss() { Sound.burst({ dur: 0.14, f0: 600, f1: 2200, q: 1.2, vol: vary(0.12) }); },
  /** Změna políčka v hotbaru. */
  select() { Sound.tone(1250 * rnd(0.97, 1.03), 0.025, 0.03, 'sine'); },
};
