// Vytištěné dokumenty jako předměty: každý tisk vytvoří záznam v `papers` (název, text, autor) a předmět 'doc_<id>' (stack 1).
// Text se při tisku zkopíruje, pozdější úpravy v počítači vytištěný papír nezmění.
import { ITEMS } from '../data/index.js';
import { papers } from './state.js';

// Předmět dokumentu vznikne až při prvním použití id (i když záznam ještě nedorazil od hostitele).
export function ensureDoc(id) {
  if (Object.prototype.hasOwnProperty.call(ITEMS, id)) return ITEMS[id];
  const pid = id.slice(4), it = { stack: 1, cat: 'office', doc: pid, hidden: true };
  Object.defineProperty(it, 'name', { enumerable: true, get: () => `Dokument: ${papers.get(pid)?.title || '…'}` });
  ITEMS[id] = it;
  return it;
}
// Neznámé id 'doc_…' se dohledá přes prototyp (ITEMS je obyčejný objekt, vlastní klíče zůstávají beze změny).
Object.setPrototypeOf(ITEMS, new Proxy({}, { get: (_, key) => (typeof key === 'string' && key.startsWith('doc_') ? ensureDoc(key) : undefined) }));
