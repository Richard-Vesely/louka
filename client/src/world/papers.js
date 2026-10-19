// Ikona vytištěného dokumentu (předmět doc_<id> vzniká v shared/world/papers.js).
import '../render/icons-blocks.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { ICONS } from '../render/icons.js';

// ============================================================ dokumenty: evidence vytištěných papírů
// Každý tisk vytvoří záznam v `papers` (název, text, autor) a předmět s id 'doc_<id>' (stack 1). Text se při tisku zkopíruje,
// pozdější úpravy v počítači vytištěný papír nezmění. Záznamy se ukládají se světem a v multiplayeru synchronizují (kv mapa).
const DOC_ICON = (() => { // list papíru s nadpisem a řádky textu
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(24,16,12,0.9)';
  g.fillRect(2, 0, 12, 16);
  g.fillStyle = '#fbf8ee';
  g.fillRect(3, 1, 10, 14);
  g.fillStyle = '#2a3a8a';
  g.fillRect(4, 2, 7, 2);
  g.fillStyle = '#6a6a72';
  for (let y = 6; y < 14; y += 2) g.fillRect(4, y, y === 12 ? 5 : 8, 1);
  return { canvas: c, url: c.toDataURL() };
})();
// Předmět 'doc_<id>' vzniká v shared/world/papers.js; tady jen jeho ikona (neznámé id 'doc_…' se dohledá přes prototyp).
Object.setPrototypeOf(ICONS, new Proxy({}, { get: (_, key) => (typeof key === 'string' && key.startsWith('doc_') ? DOC_ICON : undefined) }));
