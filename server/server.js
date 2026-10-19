// Herní server: HTTP (hra ze složky dist/ a /health) a na stejném portu WebSocket pro hráče.
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { accept, others } from '../shared/net/room.js';
import { worldState } from '../shared/world/save.js';
import { loadWorldFile, saveWorldFile } from './persist.js';
import { setupWorld, stepWorld } from './sim.js';
import { staticHandler } from './static.js';

/**
 * Spustí herní server.
 * @param {object} [o]
 * @param {number} [o.port] port (0 = libovolný volný, pro testy)
 * @param {string} [o.password] heslo (prázdné = bez hesla)
 * @param {string|null} [o.dataDir] kam ukládat svět (null = neukládat)
 * @param {string|null} [o.staticDir] složka se sestavenou hrou (dist/)
 * @param {number} [o.maxPlayers] kolik hráčů najednou
 * @param {boolean} [o.allowCreative] smí hráči kreativní režim
 * @param {number} [o.tickHz] kolikrát za sekundu běží svět
 * @param {number} [o.saveEveryMs] jak často ukládat (výchozí 30 s)
 */
export async function startServer({ port = 8787, password = '', dataDir = null, staticDir = null, maxPlayers = 8, allowCreative = false, tickHz = 20, saveEveryMs = 30_000, log = console.log } = {}) {
  const world = dataDir ? loadWorldFile(dataDir, log) : null;
  setupWorld({ world, maxPlayers, allowCreative, code: 'server', log });
  log(world ? 'Svět načten ze souboru.' : 'Nový svět.');
  const started = Date.now();
  // Zatížení: kolik ms trvá jeden krok světa (průměr a maximum za posledních ~10 s) a kolik paměti server bere.
  const ticks = [];
  const health = () => {
    const avg = ticks.length ? ticks.reduce((a, b) => a + b, 0) / ticks.length : 0;
    return {
      ok: true, louka: 2, players: others.size, max: maxPlayers, password: !!password, uptime: Math.round((Date.now() - started) / 1000),
      cpuSec: Math.round((process.cpuUsage().user + process.cpuUsage().system) / 1e4) / 100,
      rssMB: Math.round(process.memoryUsage().rss / 1048576), heapMB: Math.round(process.memoryUsage().heapUsed / 1048576),
      tickMs: { avg: Math.round(avg * 100) / 100, max: Math.round(Math.max(0, ...ticks) * 100) / 100, budget: Math.round(1000 / tickHz) },
    };
  };
  const server = http.createServer(staticHandler(staticDir, health));
  const wss = new WebSocketServer({ server, maxPayload: 2 * 1024 * 1024 });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    // První zpráva je ['hello', { name, pass }]; teprve potom hráč vstoupí do místnosti.
    const handlers = { data: [], close: [], error: [] };
    let joined = false;
    const conn = {
      peer: 'p-' + crypto.randomBytes(4).toString('hex'),
      metadata: { name: 'Hráč' },
      get open() { return ws.readyState === ws.OPEN; },
      send(msg) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); },
      on(ev, fn) { handlers[ev]?.push(fn); },
      close() { ws.close(); },
    };
    const hello = setTimeout(() => { if (!joined) ws.terminate(); }, 10_000);
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (joined) { for (const fn of handlers.data) fn(msg); return; }
      if (!Array.isArray(msg) || msg[0] !== 'hello') return;
      clearTimeout(hello);
      const h = msg[1] || {};
      if (password && String(h.pass || '') !== password) {
        conn.send(['denied', 'password']);
        log(`Špatné heslo (${req.socket.remoteAddress}).`);
        setTimeout(() => ws.close(), 200);
        return;
      }
      joined = true;
      conn.metadata.name = String(h.name || 'Hráč').slice(0, 16).trim() || 'Hráč';
      accept(conn);
    });
    ws.on('close', () => { clearTimeout(hello); if (joined) for (const fn of handlers.close) fn(); });
    ws.on('error', () => { if (joined) for (const fn of handlers.error) fn(); });
  });

  let last = performance.now();
  const ticker = setInterval(() => {
    const now = performance.now();
    try { stepWorld(Math.min((now - last) / 1000, 0.25)); } catch (e) { log('Chyba ve světě: ' + (e.stack || e)); }
    ticks.push(performance.now() - now);
    if (ticks.length > 10 * tickHz) ticks.shift();
    last = now;
  }, 1000 / tickHz);
  // Spojení, které neodpovídá (spadlá wifi), se po 10 s zavře.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 5000);
  const save = () => { if (dataDir) saveWorldFile(dataDir, worldState()); };
  const saver = setInterval(() => { try { save(); } catch (e) { log('Uložení selhalo: ' + e.message); } }, saveEveryMs);

  await new Promise((ok) => server.listen(port, ok));
  return {
    port: server.address().port,
    save,
    /** Uloží svět, odpojí hráče a vypne server. */
    async close() {
      clearInterval(ticker); clearInterval(heartbeat); clearInterval(saver);
      save();
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      await new Promise((ok) => server.close(ok));
    },
  };
}
