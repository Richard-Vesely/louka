// ============================================================ herní server Louky
// Spuštění:  ROOM_PASSWORD=tajne npm start   (z kořene repozitáře)
//
// Nastavení (proměnné prostředí):
//   PORT           port serveru (výchozí 8787)
//   ROOM_PASSWORD  heslo, které hráči zadají při přihlášení (prázdné = bez hesla)
//   DATA_DIR       kam ukládat svět (výchozí server/data)
//   STATIC_DIR     složka se sestavenou hrou, kterou server taky posílá (výchozí client/dist; "" = neposílat)
//   MAX_PLAYERS    kolik hráčů najednou (výchozí 8)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const time = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(time(), ...a);

const srv = await startServer({
  port: Number(env.PORT || 8787),
  password: env.ROOM_PASSWORD || '',
  dataDir: path.resolve(env.DATA_DIR || path.join(here, '..', 'data')),
  staticDir: env.STATIC_DIR === '' ? null : path.resolve(env.STATIC_DIR || path.join(here, '..', '..', 'client', 'dist')),
  maxPlayers: Number(env.MAX_PLAYERS || 8),
  log,
});
log(`Server Louky běží: ws://localhost:${srv.port}  (hra: http://localhost:${srv.port}/)`);
if (!env.ROOM_PASSWORD) log('Pozor: ROOM_PASSWORD není nastavené – připojit se může kdokoli, kdo zná adresu.');

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (stopping) return;
    stopping = true;
    log('Ukládám svět a vypínám…');
    await srv.close();
    process.exit(0);
  });
}
