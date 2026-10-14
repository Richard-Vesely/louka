// ============================================================ místnost: jeden sdílený svět
// Drží hru (shared/game/game.js), připojené hráče a jejich zprávy. Každý tick (20× za sekundu)
// posune hru a každému hráči pošle, co se změnilo. Zprávy jsou popsané v shared/protocol.js.
import { Game } from '@louka/shared/game/game.js';
import { createWorld, worldToSave } from '@louka/shared/game/world.js';
import { createPlayer, playerToSave } from '@louka/shared/game/player.js';
import { PROTOCOL_VERSION, MOB_TYPES, ACTION_TYPES, validClientMessage, r2 } from '@louka/shared/protocol.js';

const STATE_EVERY = 2;   // pozice posíláme každý 2. tick = 10× za sekundu
const MOB_RANGE = 140;   // tvory dál než 140 m od hráče mu neposíláme
const TAKEOVER_MS = 4000; // stejné jméno smí převzít spojení, které 4 s mlčí (výpadek sítě)

/** Klíč hráče podle jména (velikost písmen nehraje roli). */
const keyOf = (name) => name.toLowerCase();

export class Room {
  /**
   * @param {object} o
   * @param {string} [o.password] heslo místnosti (prázdné = bez hesla)
   * @param {number} [o.maxPlayers] kolik hráčů najednou
   * @param {{world:object, players:object}|null} [o.data] uložený svět ze souboru
   * @param {(...a:any[]) => void} [o.log] kam psát, co se děje
   */
  constructor({ password = '', maxPlayers = 8, data = null, log = console.log } = {}) {
    this.password = password;
    this.maxPlayers = maxPlayers;
    this.log = log;
    this.game = new Game({ world: createWorld(data?.world || {}), validate: true });
    /** Uložení hráči, kteří zrovna nehrají: klíč jména -> data (playerToSave + name). */
    this.saved = new Map(Object.entries(data?.players || {}));
    this.clients = new Set();
    this.byId = new Map();
    this.tickN = 0;
    this.game.onEvent = (id, ev) => this.route(id, ev);
  }

  /** Kolik hráčů je ve hře. */
  online() { return this.byId.size; }

  /** Nové spojení (WebSocket). Hráčem se stane až po zprávě 'hello'. */
  connect(ws) {
    const c = { ws, p: null, key: null, out: [], meDirty: false, ack: 0, rtt: 0, lastMsg: Date.now(), tokens: 120, lastSt: null, sentPl: new Map(), sentMobs: new Map() };
    this.clients.add(c);
    ws.on('message', (data) => this.onRaw(c, data));
    ws.on('close', () => this.disconnect(c));
    ws.on('error', () => {});
    return c;
  }

  // Zpráva z prohlížeče: pole zpráv v JSON. Co neprojde kontrolou, zahodíme.
  onRaw(c, data) {
    const now = Date.now();
    c.tokens = Math.min(120, c.tokens + ((now - c.lastMsg) / 1000) * 60); // nejvýš ~60 zpráv za sekundu
    c.lastMsg = now;
    let msgs;
    try { msgs = JSON.parse(data); } catch { return; }
    if (!Array.isArray(msgs)) msgs = [msgs];
    for (const m of msgs.slice(0, 50)) {
      if (c.tokens < 1) return;
      c.tokens--;
      if (validClientMessage(m)) this.onMessage(c, m);
      else if (m?.t === 'hello' && !c.p) return this.refuse(c, 'name', 'Jméno musí mít 2–16 znaků: písmena, číslice, mezera, _ nebo -.');
    }
  }

  onMessage(c, m) {
    if (m.t === 'hello') return this.hello(c, m);
    if (!c.p) return;
    if (m.t === 'ping') { if (m.rtt !== undefined) c.rtt = Math.round(m.rtt); c.out.push({ t: 'pong', c: m.c }); return; }
    if (!ACTION_TYPES.has(m.t)) return;
    this.game.act(c.p.id, m);
    if (m.n !== undefined) c.ack = Math.max(c.ack, m.n);
    if (m.t !== 'move') c.meDirty = true; // pošli inventář (s potvrzením akce)
  }

  // Přihlášení: verze, heslo, jméno, místo ve hře. Pak dostane celý svět.
  hello(c, m) {
    if (c.p) return;
    const fail = (code, text) => this.refuse(c, code, text);
    if (m.v !== PROTOCOL_VERSION) return fail('version', 'Hra se mezitím změnila – obnov stránku (F5).');
    if (this.password && m.password !== this.password) return fail('password', 'Špatné heslo.');
    const name = m.name.trim().replace(/\s+/g, ' '), key = keyOf(name);
    const old = [...this.clients].find((o) => o.p && o.key === key);
    if (old) {
      if (Date.now() - old.lastMsg < TAKEOVER_MS) return fail('taken', 'Tohle jméno už ve hře někdo má. Vyber si jiné.');
      old.ws.close(4001, 'replaced');
      this.disconnect(old);
    }
    if (this.online() >= this.maxPlayers) return fail('full', `Hra je plná (${this.maxPlayers} hráčů). Zkus to za chvíli.`);
    const saved = this.saved.get(key);
    const p = this.game.addPlayer(createPlayer(saved?.name || name, saved || {}));
    p.lastMoveT = this.game.gameTime;
    c.p = p; c.key = key;
    this.byId.set(p.id, c);
    const others = [...this.byId.values()].filter((o) => o !== c);
    c.out.push({
      t: 'welcome', id: p.id,
      you: { name: p.name, pos: [p.pos.x, p.pos.y, p.pos.z], yaw: p.yaw, ...this.stats(p), ...this.privateState(p) },
      world: worldToSave(this.game.world),
      players: others.map((o) => ({ id: o.p.id, name: o.p.name, p: [r2(o.p.pos.x), r2(o.p.pos.y), r2(o.p.pos.z)], yaw: r2(o.p.yaw) })),
    });
    for (const o of others) o.out.push({ t: 'join', id: p.id, name: p.name });
    this.flush(c);
    this.log(`+ ${p.name} (${this.online()} ve hře)`);
  }

  /** Odmítne přihlášení: pošle chybu (česky) a zavře spojení. */
  refuse(c, code, text) {
    this.sendNow(c, [{ t: 'error', code, text }]);
    c.ws.close(4000, code);
  }

  /** Spojení skončilo: hráč se uloží a ostatní dostanou zprávu. */
  disconnect(c) {
    if (!this.clients.delete(c) || !c.p) return;
    const p = c.p;
    this.game.removePlayer(p.id);
    this.byId.delete(p.id);
    this.saved.set(c.key, { ...playerToSave(p), name: p.name });
    for (const o of this.byId.values()) { o.sentPl.delete(p.id); o.out.push({ t: 'leave', id: p.id, name: p.name }); }
    this.log(`- ${p.name} (${this.online()} ve hře)`);
  }

  // Události hry pro hráče `id` se sbírají a odešlou na konci ticku.
  route(id, ev) {
    const c = this.byId.get(id);
    if (!c) return;
    if (ev.t === 'inv') c.meDirty = true;
    else c.out.push(ev);
  }

  privateState(p) {
    const { mode, size, craft, fireKey, ghost } = p.ui;
    return { inv: p.inv.slots, cur: p.inv.cursor, ui: { mode, size, craft, fireKey, ghost }, crafted: p.crafted, placedAny: p.placedAny };
  }

  stats(p) { return { hp: Math.round(p.hp * 10) / 10, hu: Math.round(p.hunger * 10) / 10, al: p.alive }; }

  /** Jeden krok serveru: posune hru a každému hráči pošle novinky. */
  tick(dt) {
    this.game.tick(dt);
    this.tickN++;
    const withState = this.tickN % STATE_EVERY === 0, withTime = this.tickN % 20 === 0, withList = this.tickN % 40 === 0;
    const list = withList && { t: 'list', pl: [...this.byId.values()].map((o) => [o.p.id, o.p.name, o.rtt]) };
    const now = Date.now();
    for (const c of this.byId.values()) {
      if (withState) { const s = this.stateFor(c, withTime); if (s) c.out.push(s); }
      if (list) c.out.push(list);
      if (c.meDirty) { c.meDirty = false; c.out.push({ t: 'me', ack: c.ack, ...this.privateState(c.p) }); }
      const st = this.stats(c.p), last = c.lastSt;
      if (!last || Math.abs(st.hp - last.hp) >= 0.5 || Math.abs(st.hu - last.hu) >= 0.5 || st.al !== last.al || now - last.at > 2000) {
        c.lastSt = { ...st, at: now };
        c.out.push({ t: 'st', ...st });
      }
      this.flush(c);
    }
  }

  // Pozice ostatních hráčů a tvorů v dosahu – jen to, co se od minula změnilo.
  stateFor(c, withTime) {
    const me = c.p, pl = [], mobs = [], mg = [];
    for (const o of this.byId.values()) {
      if (o === c) continue;
      const t = [o.p.id, r2(o.p.pos.x), r2(o.p.pos.y), r2(o.p.pos.z), r2(o.p.yaw)], s = t.join();
      if (c.sentPl.get(o.p.id) !== s) { c.sentPl.set(o.p.id, s); pl.push(t); }
    }
    const seen = new Set();
    for (const m of this.game.mobs) {
      if ((m.pos.x - me.pos.x) ** 2 + (m.pos.z - me.pos.z) ** 2 > MOB_RANGE * MOB_RANGE) continue;
      seen.add(m.id);
      const t = [m.id, MOB_TYPES.indexOf(m.type), r2(m.pos.x), r2(m.pos.y), r2(m.pos.z), r2(m.ry), m.dead ? 1 : 0], s = t.join();
      if (c.sentMobs.get(m.id) !== s) { c.sentMobs.set(m.id, s); mobs.push(t); }
    }
    for (const id of c.sentMobs.keys()) if (!seen.has(id)) { c.sentMobs.delete(id); mg.push(id); }
    if (!pl.length && !mobs.length && !mg.length && !withTime) return null;
    const msg = { t: 'state', ts: Date.now() };
    if (pl.length) msg.pl = pl;
    if (mobs.length) msg.mobs = mobs;
    if (mg.length) msg.mg = mg;
    if (withTime) msg.time = [Math.round(this.game.world.time.dayTime * 1e5) / 1e5, this.game.world.time.dayCount];
    return msg;
  }

  // Odešle nasbírané zprávy jako jedno pole.
  flush(c) {
    if (!c.out.length) return;
    this.sendNow(c, c.out);
    c.out = [];
  }

  sendNow(c, msgs) {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msgs));
  }

  /** Co se uloží na disk: svět a všichni hráči (i ti, co zrovna hrají). */
  toSave() {
    const players = Object.fromEntries(this.saved);
    for (const c of this.byId.values()) players[c.key] = { ...playerToSave(c.p), name: c.p.name };
    return { world: worldToSave(this.game.world), players };
  }
}
