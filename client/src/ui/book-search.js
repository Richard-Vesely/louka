// Lupa nad knihou receptů: schová políčka, jejichž název neobsahuje hledaný text (bez ohledu na háčky a čárky).
import { ITEMS } from '../../../shared/data/index.js';
import { $ } from './dom.js';

/** „Železo" → „zelezo", ať se dá hledat i bez diakritiky. */
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Projde políčka v #recipes a nechá vidět jen ta, která sedí na hledaný text. */
export function filterBook() {
  const q = plain($('bookSearch').value);
  let shown = 0;
  for (const el of $('recipes').querySelectorAll('[data-item]')) {
    const ok = !q || plain(ITEMS[el.dataset.item]?.name || el.dataset.item).includes(q);
    el.style.display = ok ? '' : 'none';
    if (ok) shown++;
  }
  $('bookEmpty').style.display = q && !shown ? '' : 'none';
}

/** Vymaže hledání (při zavření okna). */
export function clearBookSearch() { $('bookSearch').value = ''; }

/** Psaní do políčka filtruje hned; Esc nejdřív vymaže text, pak pustí políčko. */
export function installBookSearch() {
  const box = $('bookSearch');
  box.addEventListener('input', filterBook);
  box.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    e.stopPropagation();
    if (box.value) { box.value = ''; filterBook(); } else box.blur();
  });
}
