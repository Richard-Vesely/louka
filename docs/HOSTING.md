# Hosting guide

There are three ways to host a shared world. All use the same game code and the same rules (`shared/`).

| | Who runs it | Always on? | Saved where | Players join with |
|---|---|---|---|---|
| **A. Browser host** ("Vytvořit server") | any player's browser tab | only while the tab is open | that browser (`localStorage`) | the code `LOUKA-XXXX` |
| **B. Laptop server** (`npm start`) | a laptop (Windows/Mac/Linux) | while the laptop runs | `server/data/<world>/world.json` | the laptop's address (same Wi-Fi) or a tunnel |
| **C. VPS server** (`npm start` as a service) | a small rented Linux server | yes | `/opt/louka/server/data/<world>/` + daily backups | `hry.example.cz` |

The game page itself is static. GitHub Pages (`.github/workflows/pages.yml`) can host it for single player and the
browser host; the Node server (B, C) also serves the page itself, so for B and C nothing else is needed.

The Node server (B, C) can hold **several worlds** at once, e.g. a survival world and a creative world (`WORLDS`, see
[Several worlds](#6-several-worlds-worlds)). Without `WORLDS` it has one world, *Hlavní svět* (id `svet`).

---

## A. Browser host (no setup)

1. Open the game (Pages, a server, or `npm run dev`), type a name, **Vytvořit server** → **Spustit**.
2. Send the code (e.g. `LOUKA-7K2F`) to the others. They choose **Připojit se** and type the 4 characters.
3. Keep the tab open. The world is saved in this browser and the same code is used next time.

How it works: PeerJS uses the public broker `0.peerjs.com` only to introduce the browsers, then the game data flows
directly between them (WebRTC). Strict school or company Wi-Fi can block that; then use B or C.
Max. 6 players. The host can allow creative mode and kick players in the Esc menu.

---

## B. Laptop server

Needs Node.js 20+ ([nodejs.org](https://nodejs.org) or `winget install OpenJS.NodeJS.LTS`) and Git.

```bash
git clone https://github.com/Richard-Vesely/louka
cd louka
npm install
npm run build
npm start                       # http://localhost:8787
```
With a password (PowerShell): `$env:ROOM_PASSWORD = 'heslo'; npm start` (bash: `ROOM_PASSWORD=heslo npm start`).

- Players on the **same Wi-Fi** open `http://<laptop IP>:8787` (e.g. `http://192.168.1.20:8787`; the IP is in
  `ipconfig` / `ip addr`). The menu then shows **Hrát na serveru**. Windows asks once whether Node may use the network: allow
  *private networks*.
- Players elsewhere need a tunnel. Example with Cloudflare (free, no router setup; install it yourself first:
  `winget install --id Cloudflare.cloudflared`): `cloudflared tunnel --url http://localhost:8787` prints
  `https://something.trycloudflare.com` – that is the game address. The quick-tunnel address changes every time.
- Ctrl+C stops the server and saves the world. The world is in `server/data/svet/world.json` (copy the `svet` folder to
  the VPS later to keep it). Several worlds: `$env:WORLDS = 'svet:Hlavní svět,kreativ:Kreativní svět:creative'` before `npm start`.
- Keep the laptop awake (Windows: Power & sleep → Never).

**Status:** `npm start` with saving, restart, password and two browsers is tested (`npm run test:server`). The tunnel was not
tested (installing `cloudflared` and opening a public tunnel needs Richard's OK).

---

## C. VPS server (always on)

**Status:** live since 19.10.2026 on the club VPS (Hetzner CPX02, 1 vCPU / 1 GB, Ubuntu 26.04) at
`https://91-99-88-84.sslip.io`, installed with `deploy/setup-vps.sh` and checked with two browsers over the internet.
An off-site copy of `/opt/louka/server/data` is pulled daily by Richard's other VPS (30 days kept).

### What to buy
A small Linux VPS with Ubuntu 24.04. **1 vCPU and 1 GB RAM are enough** (measured below). Use a separate VPS for the club,
not one with private data or tokens.

### Designed for 1 GB RAM
- **Nothing is built on the VPS.** GitHub Actions (`ci.yml`, job *publish dist*) builds the game after the tests pass and
  pushes `dist/` to the branch `dist-<branch>` (e.g. `dist-v2`, later `dist-main`). The VPS only clones/pulls that branch.
- The VPS installs only the runtime dependency `ws` (`npm ci --omit=dev`): no Vite, no Three.js build, no headless browser.
- `setup-vps.sh` adds a **2 GB swap file**.
- The service runs `node --max-old-space-size=384 server/index.js` with `MemoryHigh=450M`, `MemoryMax=600M` (systemd restarts
  it if it ever grows; the world is saved every 30 s).
- Without GitHub Actions (or to test a local change): build on the PC and copy it over:
  `npm run build` then `scp -r dist/* root@hry.example.cz:/opt/louka/dist/` (the server serves the new files at once).

### Measured load (`node tests/load/bots.mjs 8 60`, with 2 worlds `npm run test:load:worlds`)
Simulated players over WebSocket walk around 60 m apart (so mobs spawn around each), send positions 12×/s, build,
change chests and hit mobs. Server started like the service (`--max-old-space-size=384`), measured on 19.10.2026 on a
desktop PC (Ryzen 7 5700X); a 1 vCPU VPS is maybe 2–4× slower, still far below the 50 ms budget per step.

| Players | RSS memory | JS heap | CPU (one core) | World step (20×/s) avg / max | Data to each player |
|---|---|---|---|---|---|
| 6, one world | 86–88 MB | 20 MB | 3.1 % | 0.29 / 1.19 ms | 17 KB/s |
| 8, one world | 87 MB | 19 MB | 1.6 % | 0.30 / 1.27 ms | 21 KB/s |
| 8, **2 worlds × 4** | 103 MB | 30 MB | 3.2 % | 0.54 / 1.44 ms (both worlds together) | 12 KB/s |

Since multiple worlds, every world runs in its own thread (`server/world-worker.js`): one world costs ~12 MB more than
before (75 → 87 MB), each further world ~16 MB (87 → 103 MB). With `MemoryMax=600M` and 1 GB RAM, 2–4 worlds are easy.
Earlier single-thread numbers (before worlds): 6 players 74–75 MB / 0.57 ms, 8 players 75–76 MB / 0.60 ms.

`/health` shows the live numbers: `rssMB`, `heapMB` (all threads), `cpuSec`, `tickMs` (avg/max over the last 10 s; the
average is the sum over all worlds), and `worlds[]` with `players`, `max`, `heapMB`, `tickMs` per world. `players` and
`max` at the top are all worlds together.

### 1. DNS
Point a hostname at the VPS IP, e.g. an `A` record `hry.example.cz → 203.0.113.10`.
(No domain? `203-0-113-10.sslip.io` resolves to that IP and works with Let's Encrypt.)

### 2. One command
SSH in as root and run (v2 is not merged into `main` yet, so use the `v2` branch):
```bash
curl -fsSLO https://raw.githubusercontent.com/Richard-Vesely/louka/v2/deploy/setup-vps.sh
BRANCH=v2 bash setup-vps.sh hry.example.cz 'heslo-pro-kroužek'
```
It adds 2 GB swap, installs Node.js 22 and Caddy, opens the firewall for SSH/80/443, creates the system user `louka`,
clones the code to `/opt/louka` and the built game (branch `dist-v2`) to `/opt/louka/dist`, installs `ws`, writes
`/etc/louka.env` (mode 600) and starts the `louka` systemd service. Caddy gets a Let's Encrypt certificate and forwards
HTTPS **and WebSockets** to `127.0.0.1:8787`. The branch `dist-v2` must exist: it appears after the first green CI run on `v2`.

Check:
```bash
curl https://hry.example.cz/health          # {"ok":true,"louka":2,"players":0,...}
systemctl status louka
journalctl -u louka -f                      # live log: who joins/leaves, errors
```
Players open `https://hry.example.cz`, type a name, **Hrát na serveru**, then the password (and the world, when there are several).

### 3. Settings (`/etc/louka.env`, then `systemctl restart louka`)
| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 8787 | server port (Caddy forwards to it) |
| `ROOM_PASSWORD` | – | password players type when joining (empty = anyone with the address); one password for all worlds |
| `DATA_DIR` | `server/data` | worlds and backups: one folder per world, `DATA_DIR/<id>/` |
| `STATIC_DIR` | `dist` | the built game the server also serves (`""` = don't) |
| `WORLDS` | one world `svet` "Hlavní svět" | the worlds on this server, see [Several worlds](#6-several-worlds-worlds) |
| `MAX_PLAYERS` | 8 | players at once **in each world** |
| `ALLOW_CREATIVE` | 0 | `1` = everyone may use creative mode (only without `WORLDS`; with `WORLDS` use `:creative`) |
| `SAVE_SECONDS` | 30 | how often each world is saved |

### 4. Updating
```bash
sudo bash /opt/louka/deploy/update.sh       # git pull (code + dist branch), npm ci --omit=dev, restart (world saved on stop)
```
Connected players see *"Spojení se serverem se přerušilo."* and join again.

### 5. Data and backups
Every world has its own folder `/opt/louka/server/data/<id>/` (e.g. `svet/`, `kreativ/`):
- `<id>/world.json`: the whole world (saved every 30 s and on shutdown, written atomically).
- `<id>/backups/world-YYYY-MM-DD.json`: one per day, last 7 kept.
- Restore one world: `systemctl stop louka`, copy a backup over `<id>/world.json`, `systemctl start louka`. The other worlds are not touched.
- Each player's backpack and position are stored in their own browser, keyed by the server address and the world
  (`rise-klient-<address>#<id>`), so a backpack from the creative world does not come into the survival world.
- **From one world to several:** a server from before `WORLDS` kept its world in `data/world.json` + `data/backups/`.
  On the first start of this version, these are moved into the folder of the **first** world in `WORLDS` (default `svet`)
  and the log says so (`journalctl -u louka`). Players' backpacks from then also stay with the first world.
- An old `world.json` from the v1 game is moved aside (`world-v1-….json`) and a new world starts.

### 6. Several worlds (`WORLDS`)
One server (one address, one password, one process) can run several worlds. Each world has its own buildings, animals,
day, players and chat, its own folder with backups, and creative mode on or off for everyone in it. After
**Hrát na serveru** (and the password) the menu shows the worlds as buttons with the player count; the last choice is
remembered, and a link `https://hry.example.cz/?world=kreativ` preselects a world.

Add or change worlds in `/etc/louka.env`, then restart:
```bash
sudo nano /etc/louka.env
#   WORLDS="svet:Hlavní svět,kreativ:Kreativní svět:creative"
sudo systemctl restart louka
curl -s http://127.0.0.1:8787/worlds        # [{"id":"svet","name":"Hlavní svět",...},{"id":"kreativ",...}]
```
- Format: `id:Name[:creative]`, worlds separated by commas. The **id** is the folder name and the `?world=` link
  (small letters, digits, `-`, `_`); the **name** is what the kids see (Czech is fine); `:creative` = creative mode for everyone.
- **Keep the main world first.** Old game pages (before this version) always join the first world, and it is the
  world that took over the old data.
- **Rename** a world: change only the name (`svet:Velká říše`), the id stays and so do its files and the players' backpacks.
  Changing the id means a new, empty world; to keep the buildings, stop the server and rename the folder
  (`mv /opt/louka/server/data/stare /opt/louka/server/data/nove`) before starting it again.
- **Remove** a world: delete it from `WORLDS`. Its folder stays on disk (nothing is deleted); add it back to bring it back.
- Memory: each world is one extra thread with its own copy of the rules, about 16 MB (see the measured load above);
  a 1 GB VPS is fine for 2–4 worlds. `/health` shows `worlds[]` with players, step time and heap per world.

---

## Point the Pages game at the server

The Pages build reads the repository variable **`SERVER_URL`** (GitHub → Settings → Secrets and variables → Actions →
Variables), e.g. `hry.example.cz`. The menu then shows **Hrát na serveru** for that address.
Any link can also choose a server: `https://richard-vesely.github.io/louka/?server=hry.example.cz`.
Pages is HTTPS, so the server must have HTTPS too (Caddy does that on the VPS).
In Settings → Pages, the source must be **GitHub Actions**.

## Local development
`npm run dev` starts the game at http://localhost:5173. For multiplayer tests run `npm start` in a second terminal and
join **localhost:5173** (Vite forwards `/ws` to the server on 8787; this also works in GitHub Codespaces).
