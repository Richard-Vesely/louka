# Hosting guide

There are three ways to host a shared world. All use the same game code and the same rules (`shared/`).

| | Who runs it | Always on? | Saved where | Players join with |
|---|---|---|---|---|
| **A. Browser host** ("Vytvořit server") | any player's browser tab | only while the tab is open | that browser (`localStorage`) | the code `LOUKA-XXXX` |
| **B. Laptop server** (`npm start`) | a laptop (Windows/Mac/Linux) | while the laptop runs | `server/data/world.json` | the laptop's address (same Wi-Fi) or a tunnel |
| **C. VPS server** (`npm start` as a service) | a small rented Linux server | yes | `/opt/louka/server/data/` + daily backups | `hry.example.cz` |

The game page itself is static. GitHub Pages (`.github/workflows/pages.yml`) can host it for single player and the
browser host; the Node server (B, C) also serves the page itself, so for B and C nothing else is needed.

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
- Ctrl+C stops the server and saves the world. The world is in `server/data/world.json` (copy it to the VPS later to keep it).
- Keep the laptop awake (Windows: Power & sleep → Never).

**Status:** `npm start` with saving, restart, password and two browsers is tested (`npm run test:server`). The tunnel was not
tested (installing `cloudflared` and opening a public tunnel needs Richard's OK).

---

## C. VPS server (always on)

**Status:** scripted (`deploy/`), **not yet run on a real VPS** (none has been bought). Everything the script starts is
tested locally and in CI.

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

### Measured load (`node tests/load/bots.mjs 8 60`)
Simulated players over WebSocket walk around 60 m apart (so mobs spawn around each), send positions 12×/s, build,
change chests and hit mobs. Server started like the service (`--max-old-space-size=384`), measured on 19.10.2026 on a
desktop PC (Ryzen 7 5700X); a 1 vCPU VPS is maybe 2–4× slower, still far below the 50 ms budget per step.

| Players | RSS memory | JS heap | CPU (one core) | World step (20×/s) avg / max | Data to each player |
|---|---|---|---|---|---|
| 6 | 74–75 MB | 12 MB | 1.8 % | 0.57 / 1.74 ms | 17 KB/s |
| 8 | 75–76 MB | 13 MB | 1.6 % | 0.60 / 1.74 ms | 22 KB/s |

`/health` shows the live numbers: `rssMB`, `heapMB`, `cpuSec`, `tickMs` (avg/max over the last 10 s).

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
Players open `https://hry.example.cz`, type a name, **Hrát na serveru**, then the password.

### 3. Settings (`/etc/louka.env`, then `systemctl restart louka`)
| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 8787 | server port (Caddy forwards to it) |
| `ROOM_PASSWORD` | – | password players type when joining (empty = anyone with the address) |
| `DATA_DIR` | `server/data` | world file and backups |
| `STATIC_DIR` | `dist` | the built game the server also serves (`""` = don't) |
| `MAX_PLAYERS` | 8 | players at once |
| `ALLOW_CREATIVE` | 0 | `1` = everyone may use creative mode |
| `SAVE_SECONDS` | 30 | how often the world is saved |

### 4. Updating
```bash
sudo bash /opt/louka/deploy/update.sh       # git pull (code + dist branch), npm ci --omit=dev, restart (world saved on stop)
```
Connected players see *"Spojení se serverem se přerušilo."* and join again.

### 5. Data and backups
- `/opt/louka/server/data/world.json`: the whole world (saved every 30 s and on shutdown, written atomically).
- `/opt/louka/server/data/backups/world-YYYY-MM-DD.json`: one per day, last 7 kept.
- Restore: `systemctl stop louka`, copy a backup over `world.json`, `systemctl start louka`.
- Each player's backpack and position are stored in their own browser (keyed by the server address), like with the browser host.
- An old `world.json` from the v1 game is moved aside (`world-v1-….json`) and a new world starts.

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
