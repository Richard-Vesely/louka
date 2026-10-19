// Políčka s předměty (batoh, truhla, pec…): pravidla bez obrazovky.
// Všechno tady pracuje jen s poli políček ({ id, n } nebo null), takže to jde testovat v Node.js
// a stejná pravidla platí ve hře pro jednoho, u hostitele i na serveru. Políčko může mít i další údaje
// (např. opotřebení nástroje); ty se při přesouvání zachovají a takové hromádky se neslučují.
export const plain = (s) => !!s && Object.keys(s).length === 2; // jen { id, n }
const copy = (s, n) => ({ ...s, n });
import { ITEMS, RECIPE_CATS } from './data/index.js';

export const maxOf = (id) => ITEMS[id]?.stack || 64;

// Vloží stack do libovolného pole políček (truhla); vrací, kolik se nevešlo.
export function insertStack(arr, stack) {
  const max = ITEMS[stack.id].stack;
  let n = stack.n;
  for (const s of arr) if (n > 0 && s && s.id === stack.id && s.n < max) { const k = Math.min(max - s.n, n); s.n += k; n -= k; }
  for (let i = 0; i < arr.length && n > 0; i++) if (!arr[i]) { const k = Math.min(max, n); arr[i] = copy(stack, k); n -= k; }
  return n;
}

/**
 * Dvojklik (jako v Minecraftu): posbírá do kurzoru stejné předměty, nejvýš jeden plný stack.
 * Nejdřív bere z neúplných hromádek, plné až nakonec (ať zůstanou celé).
 * @param {{id:string,n:number}} cur předmět v kurzoru (mění se)
 * @param {Array<Array>} arrays pole políček, odkud se smí brát
 * @returns {number} kolik kusů přibylo
 */
export function gatherInto(cur, arrays) {
  const max = maxOf(cur.id), start = cur.n;
  for (const full of [false, true]) for (const arr of arrays) {
    for (let i = 0; i < arr.length && cur.n < max; i++) {
      const s = arr[i];
      if (!s || s.id !== cur.id || (s.n >= max) !== full) continue;
      const k = Math.min(max - cur.n, s.n);
      cur.n += k;
      if (!(s.n -= k)) arr[i] = null;
    }
  }
  return cur.n - start;
}

/**
 * Tažení s předmětem v kurzoru přes víc políček: kolik kusů dostane které políčko.
 * Levé tlačítko (0) rozdělí stack rovným dílem, pravé (2) dá do každého políčka jeden kus.
 * Počítají se jen prázdná políčka nebo políčka se stejným předmětem, kde je místo.
 * @param {{id:string,n:number}} cur předmět v kurzoru (nemění se)
 * @param {Array<{id:string,n:number}|null>} slots obsah políček, přes která hráč táhl (v pořadí)
 * @param {number} button 0 = levé, 2 = pravé
 * @returns {{add:number[], left:number}} add[k] = kolik kusů přibude do slots[k]; left = co zbude v kurzoru
 */
export function spreadPlan(cur, slots, button) {
  const max = maxOf(cur.id);
  const ok = slots.map((s) => !s || (s.id === cur.id && s.n < max));
  const count = ok.filter(Boolean).length;
  const add = slots.map(() => 0);
  if (!count || !cur.n) return { add, left: cur.n };
  let left = cur.n;
  const each = button === 2 ? 1 : Math.max(1, Math.floor(cur.n / count));
  for (let k = 0; k < slots.length && left > 0; k++) {
    if (!ok[k]) continue;
    const room = max - (slots[k]?.n || 0);
    add[k] = Math.min(each, room, left);
    left -= add[k];
  }
  return { add, left };
}
/** Provede spreadPlan: cells = [[pole, index]…]. Vrací, co zbylo v kurzoru (null = nic). */
export function applySpread(cur, cells, button) {
  const plan = spreadPlan(cur, cells.map(([arr, i]) => arr[i]), button);
  cells.forEach(([arr, i], k) => {
    const a = plan.add[k];
    if (!a) return;
    if (arr[i]) arr[i].n += a; else arr[i] = copy(cur, a);
  });
  return plan.left > 0 ? copy(cur, plan.left) : null;
}

/**
 * Vloží stack do políček from..to-1: nejdřív doplní stejné hromádky, pak prázdná políčka.
 * reverse = od konce (Minecraft tak plní hotbar, když bereš z truhly). Vrací, kolik se nevešlo.
 */
export function insertRange(arr, stack, from, to, reverse = false) {
  const max = maxOf(stack.id);
  const idx = [];
  for (let i = from; i < to; i++) idx.push(i);
  if (reverse) idx.reverse();
  let n = stack.n;
  for (const i of idx) { const s = arr[i]; if (n > 0 && s && s.id === stack.id && s.n < max) { const k = Math.min(max - s.n, n); s.n += k; n -= k; } }
  for (const i of idx) if (n > 0 && !arr[i]) { const k = Math.min(max, n); arr[i] = copy(stack, k); n -= k; }
  return n;
}

// Pořadí skupin při řazení batohu: nástroje, zbraně, brnění, jídlo, bloky, suroviny, technika.
const KIND_ORDER = ['tool', 'weapon', 'armor', 'food', 'block', 'basic', ...Object.keys(RECIPE_CATS).filter((c) => c !== 'all' && c !== 'basic')];
const TOOL_ORDER = ['pick', 'axe', 'shovel', 'hoe'];
const ITEM_ORDER = new Map(Object.keys(ITEMS).map((id, i) => [id, i]));
/** Skupina předmětu pro řazení a pro tooltip: tool, weapon, armor, food, block nebo kategorie receptů. */
export function itemKind(id) {
  const d = ITEMS[id];
  if (!d) return 'basic';
  if (d.tool === 'sword') return 'weapon';
  if (d.tool || d.utensil === 'hoe' || id === 'hoe') return 'tool';
  if (d.armor) return 'armor';
  if (d.food) return 'food';
  if (d.cat && d.cat !== 'basic' && d.cat !== 'build') return d.cat;
  if (d.block) return 'block';
  return 'basic';
}
function sortKey(s) {
  const d = ITEMS[s.id], kind = KIND_ORDER.indexOf(itemKind(s.id));
  const tool = d.tool ? TOOL_ORDER.indexOf(d.tool) : 0;
  const tier = typeof d.tier === 'number' ? -d.tier : 0; // lepší nástroj dřív
  const slot = d.armor ? d.armor.slot : 0;
  return [kind < 0 ? 99 : kind, tool, tier, slot, ITEM_ORDER.get(s.id) ?? 9999, -s.n];
}
const cmp = (a, b) => { const x = sortKey(a), y = sortKey(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
/**
 * Tlačítko „Seřadit": sloučí neúplné hromádky a seřadí políčka from..to-1 podle druhu
 * (nástroje, zbraně, brnění, jídlo, bloky, suroviny, technika). Prázdná políčka jdou na konec.
 * @returns {boolean} jestli se něco změnilo
 */
export function sortSlots(arr, from = 0, to = arr.length) {
  const before = JSON.stringify(arr.slice(from, to));
  const totals = new Map(), stacks = [];
  for (let i = from; i < to; i++) {
    const s = arr[i];
    if (!s) continue;
    if (plain(s)) totals.set(s.id, (totals.get(s.id) || 0) + s.n); else stacks.push(s); // opotřebený nástroj zůstane, jak je
  }
  for (const [id, total] of totals) { let n = total; const max = maxOf(id); while (n > 0) { const k = Math.min(max, n); stacks.push({ id, n: k }); n -= k; } }
  stacks.sort(cmp);
  for (let i = from; i < to; i++) arr[i] = stacks[i - from] || null;
  return JSON.stringify(arr.slice(from, to)) !== before;
}

/**
 * Prostřední tlačítko (pick block): jak dostat předmět `id` do ruky.
 * Je v hotbaru → vybere ho. Je v batohu → přesune ho na vybrané (nebo první volné) políčko hotbaru.
 * @returns {{sel:number, from:number}|null} sel = nové vybrané políčko, from = odkud z batohu (-1 = nic se nepřesouvá)
 */
export function pickPlan(slots, sel, id) {
  for (let i = 0; i < 9; i++) if (slots[i]?.id === id) return { sel: i, from: -1 };
  let from = -1;
  for (let i = 9; i < 36 && from < 0; i++) if (slots[i]?.id === id) from = i;
  if (from < 0) return null;
  if (slots[sel]) { const free = slots.findIndex((x, i) => i < 9 && !x); if (free >= 0) sel = free; }
  return { sel, from };
}
/** Provede pickPlan. Vrací plán, nebo null, když předmět v batohu není. */
export function pickItem(inv, id) {
  const plan = pickPlan(inv.slots, inv.sel, id);
  if (!plan) return null;
  const s = inv.slots;
  inv.sel = plan.sel;
  if (plan.from >= 0) [s[plan.sel], s[plan.from]] = [s[plan.from], s[plan.sel]];
  return plan;
}

/** Kolik 3D kousků ukázat u předmětu ležícího na zemi (jako v Minecraftu): 1, 2–16, 17–32, 33–48, 49+. */
export const stackModels = (n) => (n <= 1 ? 1 : n <= 16 ? 2 : n <= 32 ? 3 : n <= 48 ? 4 : 5);

// Vzácnost: barva jména v tooltipu. 0 běžné (bílá), 1 neobvyklé (žlutá), 2 vzácné (tyrkysová), 3 epické (fialová).
const RARE = new Set(['shard', 'essence']);
export function rarityOf(id) {
  const d = ITEMS[id];
  if (!d) return 0;
  if (d.tier === 5 || d.tier === 'sky' || /mark(orite|apple)/.test(id)) return 3;
  if (d.tier === 4 || d.tier === 'shadow' || RARE.has(id) || d.fly) return 2;
  if (d.tier === 3 || ['engines', 'vehicles', 'aircraft', 'computers'].includes(d.cat)) return 1;
  return 0;
}
export const RARITY_NAMES = ['Běžné', 'Neobvyklé', 'Vzácné', 'Epické'];
