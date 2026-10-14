// ============================================================ hra přes internet (online)
// Spojí se se serverem (WebSocket), přihlásí se a pak posílá akce a pozici a přijímá svět.
// Když spojení spadne, ukáže "Spojení ztraceno — připojuji znovu…" a samo se připojí znovu.
// Zprávy jsou popsané v shared/protocol.js.
import { PROTOCOL_VERSION } from '@louka/shared/protocol.js';
import { advanceDay } from '@louka/shared/game/day.js';
import { COOKING, COOK_TIME } from '@louka/shared/cooking.js';
import { world } from '../world/state.js';
import { player } from '../player/state.js';
import { applyWelcome, applyMe, applyStats, applyState, addOther, others, interpolate } from './replica.js';

const FATAL = new Set(['version', 'password', 'name']); // tyhle chyby opakování nespraví

/**
 * Připojí se k serveru. Vrátí slib, který se splní po přihlášení (zpráva 'welcome').
 * @param {object} o
 * @param {string} o.url adresa serveru, např. ws://localhost:8787
 * @param {string} o.name jméno hráče
 * @param {string} o.password heslo místnosti
 * @param {(ev:object)=>void} o.onEvent události hry (net/events.js)
 * @param {(what:string, data?:any)=>void} o.onNet ostatní: 'welcome', 'lost', 'back', 'fatal', 'join', 'leave', 'list', 'ping'
 */
export function connectOnline({ url, name, password, onEvent, onNet }) {
  let ws = null, joined = false, everJoined = false, closedByUs = false, retry = 0;
  let seq = 0, openSeq = 0, out = [];
  let moveT = 0, pingT = 0, rtt = 0, lastMove = '', idleMoveT = 0;

  const api = {
    mode: 'online',
    game: null,
    /** Pošle akci serveru (s pořadovým číslem, aby server mohl potvrdit, že ji zpracoval). */
    act(msg) {
      if (!joined) return;
      msg.n = ++seq;
      if (msg.t === 'open') openSeq = seq;
      out.push(msg);
    },
    /** Každý snímek: plynulý pohyb ostatních, hodiny, pozice pro server. */
    tick(dt, realDt) {
      advanceDay(world.time, realDt);
      interpolate();
      // Ukazatel pečení u táboráku běží i mezi zprávami ze serveru.
      for (const [k, f] of world.fires) if (f.slots[0] && COOKING[f.slots[0].id] && world.blocks.has(k)) f.t = Math.min(f.t + realDt, COOK_TIME);
      if (!joined) return;
      if ((moveT += realDt) >= 0.1) {
        moveT = 0;
        const p = player.pos, m = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +player.yaw.toFixed(2), +player.pitch.toFixed(2)];
        const key = m.join() + player.sprinting;
        if (key !== lastMove || (idleMoveT += 0.1) > 1) {
          lastMove = key; idleMoveT = 0;
          out.push({ t: 'move', p: m.slice(0, 3), yaw: m[3], pitch: m[4], sp: !!player.sprinting });
        }
      }
      if ((pingT += realDt) >= 2) { pingT = 0; out.push({ t: 'ping', c: performance.now(), rtt }); }
      flush();
    },
    /** Odpojí se (bez opakování). */
    close() { closedByUs = true; ws?.close(); },
  };

  function flush() {
    if (out.length && ws?.readyState === 1) ws.send(JSON.stringify(out));
    out = [];
  }

  // `first` = { resolve, reject } jen při prvním připojení; při opakování je null.
  function handle(m, first) {
    switch (m.t) {
      case 'welcome':
        applyWelcome(m);
        seq = openSeq = 0;
        joined = everJoined = true;
        retry = 0;
        onNet('welcome', m);
        if (first) first.resolve(api); else onNet('back');
        break;
      case 'error':
        // Při prvním připojení chybu ukáže přihlašovací okno. Později: špatné heslo nebo jméno
        // opakování nespraví; plná hra nebo "jméno se ještě uvolňuje" ano (zkusí se znovu).
        if (!everJoined) { closedByUs = true; first?.reject({ code: m.code, text: m.text }); }
        else if (FATAL.has(m.code)) { closedByUs = true; onNet('fatal', m.text); }
        break;
      case 'me': applyMe(m, openSeq); onEvent({ t: 'inv' }); break;
      case 'st': applyStats(m); break;
      case 'state': applyState(m); break;
      case 'join': addOther(m); onNet('join', m); break;
      case 'leave': others.delete(m.id); onNet('leave', m); break;
      case 'list': onNet('list', m.pl); break;
      case 'pong': rtt = Math.round(performance.now() - m.c); onNet('ping', rtt); break;
      case 'correct': player.pos.set(...m.p); player.vel.set(0, 0, 0); break;
      default: onEvent(m);
    }
  }

  function open(first) {
    try { ws = new WebSocket(url); } catch { first?.reject({ code: 'connect', text: `Adresa serveru nevypadá správně: ${url}` }); return; }
    ws.onopen = () => ws.send(JSON.stringify([{ t: 'hello', name, password, v: PROTOCOL_VERSION }]));
    ws.onmessage = (e) => {
      let msgs;
      try { msgs = JSON.parse(e.data); } catch { return; }
      for (const m of msgs) handle(m, first);
    };
    ws.onclose = () => {
      const wasJoined = joined;
      joined = false;
      if (closedByUs) return;
      if (!everJoined) { first?.reject({ code: 'connect', text: `Server neodpovídá (${url}). Je zapnutý?` }); return; }
      // Spojení spadlo: zkoušej to znovu (1 s, 2 s, 4 s, pak každých 5 s).
      if (wasJoined) onNet('lost');
      setTimeout(() => open(null), Math.min(5000, 1000 * 2 ** retry++));
    };
  }

  return new Promise((resolve, reject) => open({ resolve, reject }));
}
