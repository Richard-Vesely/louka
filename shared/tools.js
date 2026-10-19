// Nástroje a boj: odolnost (opotřebení), rychlost těžby, nabíjení úderu, oprava. Pravidla bez obrazovky (prohlížeč i server).
// Políčko s nástrojem je { id, n: 1, w }: w = kolik odolnosti už je spotřebované (chybí = nový nástroj, staré uložené hry tak fungují dál).
import { ITEMS, TOOL_SPEED } from './data/index.js';

// ------------------------------------------------------------ odolnost
/** Odolnost nového kusu (0 = nic se neopotřebuje). */
export const maxDur = (id) => ITEMS[id]?.dur || 0;
/** Kolik odolnosti kusu zbývá. */
export const durLeft = (s) => (s ? Math.max(0, maxDur(s.id) - (s.w || 0)) : 0);
/** Zbývající odolnost 0–1 (1 = nový nebo se neopotřebuje). */
export const durFrac = (s) => { const m = s && maxDur(s.id); return m ? durLeft(s) / m : 1; };
/** Je kus opotřebovaný (ukázat proužek)? */
export const isWorn = (s) => !!s && maxDur(s.id) > 0 && (s.w || 0) > 0;
/** Pod 10 % odolnosti: nástroj se brzy rozbije. */
export const isLow = (s) => isWorn(s) && durFrac(s) <= 0.1;

/**
 * Opotřebuje kus o `amount`. Vrací true, když se právě rozbil (volající ho pak odebere z políčka).
 * @param {{id: string, n: number, w?: number}} s
 */
export function wear(s, amount = 1) {
  const max = s && maxDur(s.id);
  if (!max || amount <= 0) return false;
  s.w = Math.min(max, (s.w || 0) + Math.round(amount));
  return s.w >= max;
}
/** Kopie políčka s jiným počtem (opotřebení zůstane). */
export const part = (s, n) => (s.w ? { id: s.id, n, w: s.w } : { id: s.id, n });

/**
 * Kolik odolnosti stojí jedno použití (jako v Minecraftu):
 * - 'mine' = vytěžený blok: správný nástroj 1, nesprávný 2 (meč na blok, krumpáč na strom), okamžitě rozbité (tráva) 0,
 * - 'hit' = úder do tvora: meč 1, ostatní nástroje 2,
 * - 'use' = jiné použití (motyka, prut) 1.
 * @param {string} id předmět v ruce
 * @param {'mine'|'hit'|'use'} action
 * @param {{tool?: string, instant?: boolean}} [ctx] co se těží
 */
export function useCost(id, action, ctx = {}) {
  const d = ITEMS[id];
  if (!d?.dur || d.armor) return 0;
  if (action === 'use') return 1;
  if (action === 'hit') return d.tool === 'sword' ? 1 : d.tool ? 2 : 1;
  if (ctx.instant) return 0;
  if (!d.tool) return 0; // motyka nebo prut se těžbou neopotřebují
  return d.tool === 'sword' || (ctx.tool && d.tool !== ctx.tool) ? 2 : 1;
}

// ------------------------------------------------------------ těžba
/**
 * Doba vytěžení v sekundách.
 * Tvrdost bloku / rychlost nástroje (ruka 1, správný nástroj podle materiálu: dřevo 2, kámen 4, železo 6, krystal 8, markorit 10).
 * Pod vodou 3× pomaleji, ve vzduchu (skok) 2,5× pomaleji – jako v Minecraftu, jen mírněji.
 * @param {{hard?: number, tool?: string}} target
 * @param {string|null} heldId
 * @param {{underwater?: boolean, airborne?: boolean}} [ctx]
 */
export function breakTime(target, heldId, ctx = {}) {
  const d = heldId ? ITEMS[heldId] : null;
  let speed = 1;
  if (d?.tool && target.tool && d.tool === target.tool) speed = TOOL_SPEED[d.tier] || 1;
  else if (d?.tool === 'sword' && target.kind === 'grass') speed = 1.5; // meč kosí trávu
  let t = (target.hard ?? 1) / speed;
  if (ctx.underwater) t *= 3;
  if (ctx.airborne) t *= 2.5;
  return t;
}
/** Bloky, které jdou pod 0,05 s, se nepočítají jako těžba (žádné opotřebení, žádná pauza). */
export const INSTANT = 0.05;
/** Pauza mezi dvěma vytěženými bloky (6 ticků v Minecraftu). */
export const BREAK_PAUSE = 0.3;
/** Má cíl požadavek na nástroj a držený nástroj ho nesplňuje? */
export const lacksTool = (req, heldId) => {
  if (!req) return false;
  const d = heldId ? ITEMS[heldId] : null;
  return !(d && d.tool === req.tool && d.tier >= req.tier);
};

// ------------------------------------------------------------ útok
/** Údery za sekundu: ruka 4, meč 1,7, krumpáč 1,3, lopata 1,2, sekera 1 (silnější, ale pomalá). */
export const ATTACK_SPEED = { hand: 4, sword: 1.7, pick: 1.3, shovel: 1.2, axe: 1 };
export const attackSpeed = (heldId) => ATTACK_SPEED[ITEMS[heldId]?.tool] || ATTACK_SPEED.hand;
/** Poškození předmětu v ruce (ruka a ostatní předměty 1). */
export const baseDamage = (heldId) => (ITEMS[heldId]?.tool ? ITEMS[heldId].dmg : 1);
/** Nabití úderu 0–1 podle času od posledního úderu. */
export const attackCharge = (since, heldId) => Math.max(0, Math.min(1, (since + 0.025) * attackSpeed(heldId)));
/** Násobek poškození podle nabití (Minecraft): 0,2 + nabití² × 0,8. */
export const chargeMult = (charge) => 0.2 + charge * charge * 0.8;
/** Kritický úder: padáš, neběžíš, úder je skoro nabitý → 1,5× poškození. */
export const isCrit = (charge, { falling, sprinting, onGround }) => !!(charge >= 0.848 && falling && !onGround && !sprinting);
/**
 * Výsledek úderu: poškození a síla odhození.
 * @param {string|null} heldId
 * @param {number} charge 0–1
 * @param {{falling?: boolean, sprinting?: boolean, onGround?: boolean}} st
 */
export function attackResult(heldId, charge, st = {}) {
  const crit = isCrit(charge, st);
  const dmg = baseDamage(heldId) * chargeMult(charge) * (crit ? 1.5 : 1);
  const kb = (0.5 + charge * 0.5) * (st.sprinting && charge > 0.9 ? 1.6 : 1);
  return { dmg: Math.round(dmg * 100) / 100, crit, kb: Math.round(kb * 100) / 100 };
}
/** Po zásahu je tvor 0,5 s nezranitelný (10 ticků). */
export const MOB_INVULN = 0.5;

// ------------------------------------------------------------ brnění
/** Opotřebení každého nošeného kusu za jeden zásah (1 za každých 20 zranění, nejméně 1). */
export const armorWear = (dmg) => (dmg > 0 ? Math.max(1, Math.floor(dmg / 20)) : 0);

// ------------------------------------------------------------ oprava v mřížce výroby
// Surovina na opravu podle materiálu (dřevo: jakákoli prkna).
export const REPAIR_MAT = { 1: 'planks', 2: 'stone', 3: 'iron', 4: 'shard', 5: 'markorite', shadow: 'essence', sky: 'shard' };
const matFits = (tier, id) => (tier === 1 ? /planks$/.test(id) : REPAIR_MAT[tier] === id);
/** Název suroviny na opravu (do popisku). */
export const repairMatName = (id) => { const t = ITEMS[id]?.tier; return t === 1 ? 'prkna' : ITEMS[REPAIR_MAT[t]]?.name?.toLowerCase() || ''; };
/**
 * Oprava v mřížce výroby (jen když mřížka nesedí na žádný recept):
 * - dva stejné opotřebované nástroje → jeden s odolností obou + 5 % navíc,
 * - jeden opotřebovaný nástroj + 1–4 políčka s jeho surovinou (prkna, kámen, železo, úlomek světla, markorit) → každé vrátí 25 %.
 * Vrací { out, n: 1, w, repair: true }, nebo null. Každé políčko mřížky se při vybrání zmenší o jeden kus.
 * @param {({id: string, n: number, w?: number}|null)[]} grid
 */
export function repairResult(grid) {
  const used = grid.filter(Boolean);
  const tools = used.filter((s) => maxDur(s.id) > 0);
  if (!tools.length) return null;
  const id = tools[0].id, max = maxDur(id);
  if (tools.length === 2 && used.length === 2 && tools[1].id === id) {
    if (!isWorn(tools[0]) && !isWorn(tools[1])) return null;
    const left = durLeft(tools[0]) + durLeft(tools[1]) + Math.floor(max * 0.05);
    return { out: id, n: 1, w: Math.max(0, max - left), repair: true };
  }
  if (tools.length !== 1 || !isWorn(tools[0])) return null;
  const mats = used.filter((s) => s !== tools[0]);
  if (!mats.length || mats.length > 4 || !mats.every((s) => matFits(ITEMS[id].tier, s.id))) return null;
  return { out: id, n: 1, w: Math.max(0, tools[0].w - Math.ceil(max * 0.25) * mats.length), repair: true };
}

// ------------------------------------------------------------ názvy pro hlášky
/** "rozbil / rozbila / rozbilo / rozbily" podle rodu názvu (Železný krumpáč, Kamenná sekera, Železné brnění, Železné boty). */
export function brokeVerb(name) {
  const last = name.split(' ').pop();
  if (/y$/.test(last)) return 'rozbily';
  if (/í$/.test(last)) return 'rozbilo';
  if (/a$/.test(last)) return 'rozbila';
  return 'rozbil';
}
/** "rozbije / rozbijí" (množné číslo pro kalhoty, boty). */
export const breaksSoonVerb = (name) => (/y$/.test(name.split(' ').pop()) ? 'rozbijí' : 'rozbije');
