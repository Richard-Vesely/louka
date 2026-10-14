// ============================================================ protokol: zprávy mezi hrou a serverem
// Hra (prohlížeč) a server si posílají malé JSON zprávy přes WebSocket. Každý rámec je POLE zpráv,
// např. [{"t":"move","p":[1,2,3],"yaw":0.5,"pitch":0,"sp":false}]. Každá zpráva má typ `t`.
//
// !!! Když tu něco změníš, změň obě strany (client/src/net/ a server/src/) a zvyš PROTOCOL_VERSION.
//
// ---------------------------------------------------------------- prohlížeč -> server
//   hello  { name, password, v }        první zpráva: jméno, heslo místnosti, verze protokolu
//   ping   { c, rtt? }                  každé 2 s: c = čas prohlížeče, rtt = poslední naměřený ping v ms
//   move   { p:[x,y,z], yaw, pitch, sp, sn? } kde hráč je (10× za sekundu); sp = běží (rychleji hladoví), sn = plíží se
//   akce (shared/game/actions.js), každá s pořadovým číslem `n`:
//   select { i }                        vybrat políčko hotbaru 0–8
//   open   { mode, k }                  otevřít okno: 'inv' | 'bench' (k = klíč stolu) | 'fire' (k = klíč táboráku)
//   close  {}                           zavřít okno
//   slot   { c, i, button, shift }      klik na políčko: c = 'inv' (0–36, 36 = druhá ruka) | 'craft' | 'fire', button 0 | 2
//   take   { shift }                    vzít výsledek výroby
//   fill   { r, shift }                 kniha receptů: recept číslo r (index v RECIPES)
//   cook   { id }                       vložit surovinu do táboráku
//   eat    { off? }                     sníst, co držím (off = z druhé ruky)
//   place  { cell:[x,y,z], off? }       položit blok z ruky (off = z druhé ruky)
//   break  { kind, key | cell | point } vytěžit: 'tree'/'rock' (key), 'block' (cell), 'ground' (point)
//   hit    { id, crit? }                udeřit tvora (crit = při pádu po výskoku)
//   drop   { c?, i?, all }              vyhodit na zem: z ruky (bez c), z políčka okna (c, i), z kurzoru (c = 'cur'); all = celou hromádku
//   pick   { id }                       prostřední tlačítko: vzít předmět id do ruky
//   swap   { c?, i?, h? }               klávesa 1–9 / F nad políčkem: prohodit s hotbarem h (36 = druhá ruka); bez c = F prohodí ruce
//   collect {}                          dvojklik: posbírat stejné věci do kurzoru
//   spread { cells:[[c,i]…], button }   tažení s věcí v kurzoru: rozdělit (0) / po jednom (2)
//   moveall { c, i, id }                Shift + dvojklik: přesunout všechny hromádky předmětu id
//
// ---------------------------------------------------------------- server -> prohlížeč
//   welcome { id, you, world, players }  po přihlášení: tvůj stav, celý svět, kdo je ve hře
//   error   { code, text }               'version' | 'password' | 'name' | 'full' | 'taken' (text je česky)
//   pong    { c }                        odpověď na ping
//   join    { id, name } / leave { id, name }   někdo přišel / odešel
//   list    { pl:[[id, name, rtt]] }     seznam hráčů (každé 2 s, pro Tab)
//   state   { ts, pl, mobs, mg, time? }  10× za sekundu: jen co se pohnulo
//           pl   = [[id, x, y, z, yaw, plíží]]      ostatní hráči (plíží 0 | 1)
//           mobs = [[id, typ, x, y, z, ry, mrtvý]]   typ = index v MOB_TYPES, mrtvý 0 | 1
//           mg   = [id]                               tvorové, kteří zmizeli (nebo jsou moc daleko)
//           time = [dayTime, dayCount]               hodiny světa (jednou za sekundu)
//   me      { ack, inv, cur, ui, crafted, placedAny }  tvůj inventář a okno (po změně); ack = číslo poslední zpracované akce
//   st      { hp, hu, al }                tvoje zdraví, hlad, jestli žiješ
//   correct { p:[x,y,z] }                 server tě vrátil na místo (moc rychlý pohyb)
//   drop    { a:'add', d:[k, id, n, x, y, z, vx, vy, vz] } | { a:'n', k, n } | { a:'del', k, by? }  věci na zemi (shared/game/drops.js)
//   události hry (shared/game/game.js): feed, toast, sound, fx, block, removed, fire, grass, hurt, died, respawn
import { RECIPES } from './recipes.js';
import { ITEMS } from './items.js';
import { COOKING } from './cooking.js';
import { MOBS } from './mobs.js';

/** Verze protokolu – zvyš ji, když změníš zprávy. Starší hra pak dostane "obnov stránku". */
export const PROTOCOL_VERSION = 2;

/** Typy tvorů v pořadí, v jakém se posílají ve zprávě 'state'. */
export const MOB_TYPES = Object.keys(MOBS);

/** Jméno hráče: 2–16 znaků, písmena (i česká), číslice, mezera, _ a -. */
export const NAME_RE = /^[\p{L}\p{N} _-]{2,16}$/u;

const isInt = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
const isNum = (v, lim = 1e6) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const isBool = (v) => typeof v === 'boolean';
const isCell = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => isInt(v, -1e5, 1e5)) && c[1] >= -64 && c[1] <= 256;
const isPoint = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => isNum(v, 1e5));
const BLOCK_KEY = /^-?\d{1,6},-?\d{1,3},-?\d{1,6}$/;
const CELL_KEY = /^[tr]-?\d{1,6},-?\d{1,6}$/;
const optBool = (v) => v === undefined || isBool(v);
// Políčko v okně: 'inv' 0–36 (36 = druhá ruka), 'craft' 0–8, 'fire' 0–1.
const isSlot = (c, i) => ['inv', 'craft', 'fire'].includes(c) && isInt(i, 0, c === 'inv' ? 36 : c === 'craft' ? 8 : 1);
const isHand = (h) => isInt(h, 0, 8) || h === 36;

// Kontrola údajů každého typu zprávy (true = v pořádku).
const CHECKS = {
  hello: (m) => typeof m.name === 'string' && NAME_RE.test(m.name.trim()) && typeof m.password === 'string' && m.password.length <= 64 && Number.isInteger(m.v),
  ping: (m) => isNum(m.c, 1e15) && (m.rtt === undefined || isNum(m.rtt, 1e5)),
  move: (m) => isPoint(m.p) && isNum(m.yaw, 1e4) && isNum(m.pitch, 10) && isBool(m.sp) && optBool(m.sn),
  select: (m) => isInt(m.i, 0, 8),
  open: (m) => ['inv', 'bench', 'fire'].includes(m.mode) && (m.mode === 'inv' ? m.k == null : typeof m.k === 'string' && BLOCK_KEY.test(m.k)),
  close: () => true,
  slot: (m) => isSlot(m.c, m.i) && (m.button === 0 || m.button === 2) && isBool(m.shift),
  take: (m) => isBool(m.shift),
  fill: (m) => isInt(m.r, 0, RECIPES.length - 1) && isBool(m.shift),
  cook: (m) => typeof m.id === 'string' && Object.hasOwn(COOKING, m.id),
  eat: (m) => optBool(m.off),
  place: (m) => isCell(m.cell) && optBool(m.off),
  break: (m) => (m.kind === 'tree' || m.kind === 'rock') ? typeof m.key === 'string' && CELL_KEY.test(m.key) && m.key[0] === m.kind[0]
    : m.kind === 'block' ? isCell(m.cell) : m.kind === 'ground' ? isPoint(m.point) : false,
  hit: (m) => isInt(m.id, 0, 2 ** 31) && optBool(m.crit),
  drop: (m) => isBool(m.all) && (m.c === undefined || m.c === 'cur' || isSlot(m.c, m.i)),
  pick: (m) => typeof m.id === 'string' && Object.hasOwn(ITEMS, m.id),
  swap: (m) => m.c === undefined || (isSlot(m.c, m.i) && isHand(m.h)),
  collect: () => true,
  spread: (m) => Array.isArray(m.cells) && m.cells.length >= 1 && m.cells.length <= 46 && m.cells.every((x) => Array.isArray(x) && isSlot(x[0], x[1])) && (m.button === 0 || m.button === 2),
  moveall: (m) => isSlot(m.c, m.i) && typeof m.id === 'string' && Object.hasOwn(ITEMS, m.id),
};

/** Typy zpráv, které jsou herní akce (jdou do game.act). */
export const ACTION_TYPES = new Set(['move', 'select', 'open', 'close', 'slot', 'take', 'fill', 'cook', 'eat', 'place', 'break', 'hit', 'drop', 'pick', 'swap', 'collect', 'spread', 'moveall']);

/**
 * Zkontroluje zprávu od prohlížeče. Server zahodí všechno, co neprojde.
 * @param {any} m zpráva (už rozbalená z JSON)
 * @returns {boolean} true = zpráva je v pořádku
 */
export function validClientMessage(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string' || !Object.hasOwn(CHECKS, m.t)) return false;
  if (m.n !== undefined && !isInt(m.n, 0, 2 ** 31)) return false;
  return CHECKS[m.t](m);
}

/** Zaokrouhlí číslo na setiny (menší zprávy). */
export const r2 = (v) => Math.round(v * 100) / 100;
