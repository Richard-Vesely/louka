// ============================================================ spuštění serveru
// HTTP server (hra z client/dist + /health) a na stejném portu WebSocket pro hráče.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { loadData, saveData } from './persist.js';
import { staticHandler } from './static.js';

/**
 * Spustí herní server.
 * @param {object} [o]
 * @param {number} [o.port] port (0 = libovolný volný, pro testy)
 * @param {string} [o.password] heslo místnosti
 * @param {string|null} [o.dataDir] kam ukládat svět (null = neukládat)
 * @param {string|null} [o.staticDir] složka se sestavenou hrou (client/dist)
 * @param {number} [o.maxPlayers] kolik hráčů najednou
 * @param {number} [o.saveEveryMs] jak často ukládat (výchozí 30 s)
 */
export async function startServer({ port = 8787, password = '', dataDir = null, staticDir = null, maxPlayers = 8, tickHz = 20, saveEveryMs = 30_000, log = console.log } = {}) {
  const room = new Room({ password, maxPlayers, data: dataDir ? loadData(dataDir) : null, log });
  const started = Date.now();
  const server = http.createServer(staticHandler(staticDir, () => ({ ok: true, players: room.online(), uptime: Math.round((Date.now() - started) / 1000) })));
  const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    room.connect(ws);
  });

  let last = performance.now();
  const ticker = setInterval(() => {
    const now = performance.now();
    room.tick(Math.min((now - last) / 1000, 0.25));
    last = now;
  }, 1000 / tickHz);
  // Spojení, které neodpovídá (spadlá wifi), se po 10 s zavře.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { log('Spojení neodpovídá 10 s, zavírám ho.'); ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 5000);
  const save = () => { if (dataDir) saveData(dataDir, room.toSave()); };
  const saver = setInterval(() => { try { save(); } catch (e) { log('Uložení selhalo:', e.message); } }, saveEveryMs);

  await new Promise((ok) => server.listen(port, ok));
  return {
    room,
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
