// Čtení dokumentu na obrazovce.
import './papers-world.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { papers } from '../../../shared/world/state.js';
import { Sound } from '../audio/sound.js';
import { input, keys, lockPointer, unlockPointer } from '../player/player.js';

export let docOpen = false;

// ---------- čtení dokumentu
const docEl = document.createElement('div');
docEl.id = 'docView';
docEl.innerHTML = '<div class="doc-paper"><button class="doc-x" title="Zavřít (Esc)">✕</button><h2></h2><div class="doc-text"></div><div class="doc-meta"></div></div>';
document.body.appendChild(docEl);
export function openDoc(pid) {
  const rec = papers.get(pid);
  docEl.querySelector('h2').textContent = rec?.title || 'Dokument';
  docEl.querySelector('.doc-text').textContent = rec ? rec.text || '(prázdný list)' : 'Obsah dokumentu se ještě načítá…';
  docEl.querySelector('.doc-meta').textContent = rec ? `Napsal(a) ${rec.by} · vytištěno ${rec.day}. den` : '';
  docEl.querySelector('.doc-paper').scrollTop = 0;
  docOpen = true;
  keys.clear();
  input.lmb = input.rmb = false;
  unlockPointer();
  docEl.style.display = 'flex';
  Sound.rustle();
}
export function closeDoc() {
  docOpen = false;
  docEl.style.display = 'none';
  lockPointer();
}
docEl.addEventListener('click', (e) => { if (e.target === docEl || e.target.closest('.doc-x')) closeDoc(); });
addEventListener('keydown', (e) => {
  if (!docOpen) return;
  e.stopImmediatePropagation();
  if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); closeDoc(); }
}, true);
addEventListener('keyup', (e) => { if (docOpen) e.stopImmediatePropagation(); }, true);
