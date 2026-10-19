// ============================================================ herní server Říše (Louka)
// Spuštění:  npm start   (z kořene repozitáře; hru nejdřív sestav: npm run build)
//
// Nastavení (proměnné prostředí):
//   PORT            port serveru (výchozí 8787)
//   ROOM_PASSWORD   heslo, které hráči zadají při připojení (prázdné = bez hesla)
//   DATA_DIR        kam ukládat světy (výchozí server/data; každý svět ve své složce DATA_DIR/<id>/)
//   STATIC_DIR      složka se sestavenou hrou, kterou server taky posílá (výchozí dist; "" = neposílat)
//   WORLDS          světy na serveru: "svet:Hlavní svět,kreativ:Kreativní svět:creative" (id:jméno[:creative])
//                   (bez WORLDS je jeden svět "svet" = Hlavní svět)
//   MAX_PLAYERS     kolik hráčů najednou v jednom světě (výchozí 8)
//   ALLOW_CREATIVE  1 = všichni smí kreativní režim (výchozí 0; jen když WORLDS není nastavené)
//   SAVE_SECONDS    jak často ukládat svět (výchozí 30)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.js';
import { parseWorlds } from './worlds.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const time = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(time(), ...a);

let worlds;
try { worlds = parseWorlds(env.WORLDS, env.ALLOW_CREATIVE === '1'); } catch (e) { console.error('Chyba v nastavení: ' + e.message); process.exit(1); }
if (env.WORLDS && env.ALLOW_CREATIVE === '1') log('Pozor: ALLOW_CREATIVE se nepoužije, kreativní režim se nastavuje ve WORLDS (":creative").');
const srv = await startServer({
  worlds,
  port: Number(env.PORT || 8787),
  password: env.ROOM_PASSWORD || '',
  dataDir: path.resolve(env.DATA_DIR || path.join(here, 'data')),
  staticDir: env.STATIC_DIR === '' ? null : path.resolve(env.STATIC_DIR || path.join(here, '..', 'dist')),
  maxPlayers: Number(env.MAX_PLAYERS || 8),
  saveEveryMs: 1000 * Number(env.SAVE_SECONDS || 30),
  log,
});
log(`Server Říše běží: http://localhost:${srv.port}/  (hráči se připojí na ws://<adresa>:${srv.port}/ws, světy: ${srv.worlds.join(', ')})`);
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
