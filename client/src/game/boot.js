// Start hry: počká na volbu v hlavním menu a připraví síťovou vrstvu NET.
import { playerSafe } from '../mobs/mobs.js';
import { creative, player } from '../player/player.js';
import { fullSet } from '../ui/inventory-ui.js';

// ============================================================ spuštění: hra pro jednoho / hostitel / klient
window.gameModuleLoaded = true;
export const BOOT = await window.bootPromise; // čeká na volbu v hlavním menu
export const MP = BOOT.mode !== 'sp';
// Okna strojů a truhel otevřená hráči v multiplayeru: hostitel je mezitím nesimuluje (klíč -> do kdy), aby se změny nepřepsaly a předměty nezdvojily
export const uiBusy = new Map();
export const isBusy = (k) => (uiBusy.get(k) || 0) > performance.now();
// Síťová vrstva. Tady je jen základ, který potřebují herní systémy; spojení samotné je na konci skriptu.
export const NET = {
  mode: BOOT.mode, host: BOOT.mode === 'host', client: BOOT.mode === 'client', name: BOOT.welcome?.name || BOOT.name || 'Hráč',
  ready: false, silent: 0, ops: [], mobN: 0, uidN: 0, killer: null,
  perm: BOOT.mode !== 'client' || !!BOOT.welcome?.perm, // smí hráč používat kreativní režim?
  // Změna světa: ve hře pro více hráčů se rozešle ostatním (při přehrávání cizí změny se neposílá).
  op(o) { if (MP && this.ready && !this.silent) this.ops.push(o); },
  quiet(fn) { this.silent++; try { return fn(); } finally { this.silent--; } },
  uid() { return `${BOOT.mode === 'client' ? BOOT.peer?.id || 'c' : 'h'}-${++this.uidN}-${Math.random().toString(36).slice(2, 6)}`; },
  req() {}, give() {}, sendTo() {}, update() {},
  // Cíle tvorů: hráči (ve hře pro jednoho jen ty). Síťová vrstva přidá vzdálené hráče.
  targets() { return [{ pos: player.pos, alive: player.alive, creative, set: fullSet(), safe: playerSafe(), pid: null }]; },
  spawnCenter() { return player.pos; },
  nearestDist(x, y, z) { return Math.hypot(x - player.pos.x, y - player.pos.y, z - player.pos.z); },
};
export const r2 = (v) => Math.round(v * 100) / 100;
export const nearestTarget = (list, p) => {
  let best = list[0], bd = Infinity;
  for (const t of list) { const d = (t.pos.x - p.x) ** 2 + (t.pos.z - p.z) ** 2; if (d < bd) { bd = d; best = t; } }
  return best;
};
// Mapa / množina, která každou změnu ohlásí síťové vrstvě (bloky, pokácené stromy…).
export class SyncMap extends Map {
  constructor(name, entries) { super(entries); this.syncName = name; }
  set(k, v) { super.set(k, v); if (this.syncName) NET.op(['m', this.syncName, k, v]); return this; }
  delete(k) { const had = super.delete(k); if (had && this.syncName) NET.op(['m', this.syncName, k, null]); return had; }
}
export class SyncSet extends Set {
  constructor(name, items) { super(items); this.syncName = name; }
  add(k) { if (this.syncName && !this.has(k)) { super.add(k); NET.op(['s', this.syncName, k]); } else super.add(k); return this; }
}
