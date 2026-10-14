// ============================================================ Game – celá hra bez grafiky
// Svět, hráči, tvorové a hodiny. Stejná třída běží na serveru (pro všechny hráče)
// i v prohlížeči jako hra pro jednoho hráče (offline). Grafika jen čte stav a reaguje na zprávy.
//
// Zprávy pro hráče (události) jdou přes game.onEvent(idHráče, zpráva):
//   inv (změnil se inventář), feed, toast, sound, fx (efekty), block, removed, fire, grass,
//   hurt, died, respawn – viz shared/protocol.js.
import { createWorld } from './world.js';
import { daylight, advanceDay } from './day.js';
import { ACTIONS } from './actions.js';
import { spawnMob, updateMobs, updateSpawns } from './mobs.js';
import { updateSurvival, updateRespawn } from './survival.js';
import { updateFires } from './fires.js';
import { pickShards } from './shards.js';

export class Game {
  /**
   * @param {object} [opts]
   * @param {import('./world.js').WorldState} [opts.world] stav světa (jinak nový)
   * @param {Array} [opts.mobs] pole pro tvory (prohlížeč si ho drží a kreslí z něj)
   * @param {boolean} [opts.validate] kontrolovat dosah a rychlost akcí (server: true)
   */
  constructor({ world = createWorld(), mobs = [], validate = true } = {}) {
    this.world = world;
    this.mobs = mobs;
    this.validate = validate;
    /** @type {Map<number, import('./player.js').PlayerState>} */
    this.players = new Map();
    this.gameTime = 0;
    this.spawnT = 3;
    this.nextId = 1;
    this.nextMobId = 1;
    /** Sem se posílají zprávy pro hráče: (idHráče, zpráva). */
    this.onEvent = () => {};
  }

  /** Přidá hráče do hry a vrátí ho (dostane číslo `id`). */
  addPlayer(p) {
    p.id = this.nextId++;
    this.players.set(p.id, p);
    return p;
  }

  /** Hráč odešel: vrátí mu věci z otevřeného okna do batohu a odebere ho. */
  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return null;
    if (p.ui.open) ACTIONS.close(this, p);
    this.players.delete(id);
    return p;
  }

  /** Pošle zprávu jednomu hráči. */
  send(p, ev) { this.onEvent(p.id, ev); }

  /** Funkce, která posílá zprávy hráči `p` (pro inventář: feed, toast). */
  tell(p) { return (ev) => this.send(p, ev); }

  /** Pošle zprávu všem hráčům (nebo jen těm do 80 m od bodu `near`). */
  broadcast(ev, near = null) {
    for (const p of this.players.values()) {
      if (near && (p.pos.x - near.x) ** 2 + (p.pos.z - near.z) ** 2 > 80 * 80) continue;
      this.onEvent(p.id, ev);
    }
  }

  /** Nejbližší hráč k bodu (x, z): { p, dx, dz, dist }, nebo null. */
  nearestPlayer(x, z) {
    let best = null;
    for (const p of this.players.values()) {
      const dx = p.pos.x - x, dz = p.pos.z - z, dist = Math.hypot(dx, dz);
      if (!best || dist < best.dist) best = { p, dx, dz, dist };
    }
    return best;
  }

  /** Postaví tvora (pro ladění a testy). */
  spawnMob(type, x, z) { return spawnMob(this, type, x, z); }

  /** Odebere tvora ze hry. */
  removeMob(m) {
    const i = this.mobs.indexOf(m);
    if (i >= 0) this.mobs.splice(i, 1);
  }

  /**
   * Provede akci hráče. Neznámou akci nebo akci mrtvého hráče ignoruje.
   * @param {number} id číslo hráče
   * @param {{t:string}} msg akce, např. { t: 'place', cell: [1, 0, 5] }
   */
  act(id, msg) {
    const p = this.players.get(id), handler = ACTIONS[msg?.t];
    if (!p || !handler) return;
    if (!p.alive && ['eat', 'place', 'break', 'hit'].includes(msg.t)) return;
    handler(this, p, msg);
    this.flush();
  }

  /**
   * Jeden krok hry.
   * @param {number} dt herní čas (0 = pauza v single-playeru)
   * @param {number} [realDt] skutečný čas – táboráky pečou a mrtví se oživují i v pauze
   */
  tick(dt, realDt = dt) {
    this.gameTime += dt;
    if (dt > 0) {
      advanceDay(this.world.time, dt);
      const { day, night } = daylight(this.world.time.dayTime);
      for (const p of this.players.values()) updateSurvival(this, p, dt);
      updateMobs(this, dt, day);
      updateSpawns(this, dt, night);
      for (const p of this.players.values()) if (p.alive) pickShards(this, p);
    }
    for (const p of this.players.values()) updateRespawn(this, p, realDt);
    updateFires(this, realDt);
    this.flush();
  }

  // Hráčům, kterým se změnil inventář, pošle zprávu 'inv'.
  flush() {
    for (const p of this.players.values()) if (p.invDirty) { p.invDirty = false; this.send(p, { t: 'inv' }); }
  }
}
