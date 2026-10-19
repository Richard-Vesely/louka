// Zvuky oken: klik na tlačítko, najetí na políčko, vzít / položit předmět v batohu, otevření a zavření batohu,
// náhled hlasitosti v Nastavení. Poslouchá dokument (nemění kód oken), takže funguje pro všechna okna stejně.
import { inv } from '../player/inventory.js';
import { Sound } from './sound.js';

let hoverEl = null, hoverT = 0, done = false;
export function initUISounds() {
  if (done) return;
  done = true;
  document.addEventListener('mousedown', (e) => {
    const el = e.target.closest?.('.slot[data-c], [data-out], button, .mc-btn, [data-r], [data-cook], [data-cat], [data-give]');
    if (!el) return;
    if (el.matches('.slot[data-c], [data-out], [data-give]')) {
      const had = inv.cursor ? `${inv.cursor.id}:${inv.cursor.n}` : '';
      setTimeout(() => {
        const now = inv.cursor ? `${inv.cursor.id}:${inv.cursor.n}` : '';
        if (now === had) return; // nic se nestalo (Shift-přesun a výroba mají vlastní zvuk)
        Sound.ui(!had ? 'pick' : !now ? 'put' : now.split(':')[0] !== had.split(':')[0] ? 'pick' : 'put');
      }, 0);
    } else Sound.ui('click');
  }, true);
  // najetí myší: jen při změně prvku a nejvýš 25× za sekundu
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest?.('.slot[data-item], .mc-btn, button, [data-r]');
    if (!el || el === hoverEl) return;
    hoverEl = el;
    const t = performance.now();
    if (t - hoverT > 40) { hoverT = t; Sound.ui('hover'); }
  });
  // otevření a zavření batohu (sleduje, jestli je okno vidět)
  const box = document.getElementById('inventory');
  if (box) {
    let open = box.style.display === 'grid';
    new MutationObserver(() => { const now = box.style.display === 'grid'; if (now !== open) { open = now; Sound.ui(now ? 'open' : 'close'); } }).observe(box, { attributes: true, attributeFilter: ['style'] });
  }
  // posuvníky hlasitosti: krátký zvuk novou hlasitostí
  addEventListener('rise-prefs', () => { const t = performance.now(); if (t - hoverT > 90) { hoverT = t; Sound.ui('put'); } });
}
