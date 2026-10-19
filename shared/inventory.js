// Políčka s předměty (truhla, pec…): pravidla bez obrazovky.
import { ITEMS } from './data/index.js';
import { part } from './tools.js';

// Vloží stack do libovolného pole políček (truhla); vrací, kolik se nevešlo.
export function insertStack(arr, stack) {
  const max = ITEMS[stack.id].stack;
  let n = stack.n;
  for (const s of arr) if (n > 0 && s && s.id === stack.id && s.n < max) { const k = Math.min(max - s.n, n); s.n += k; n -= k; }
  for (let i = 0; i < arr.length && n > 0; i++) if (!arr[i]) { const k = Math.min(max, n); arr[i] = part(stack, k); n -= k; }
  return n;
}
