# Hosting guide

Two parts:
- **The game page** (HTML/JS) is static. GitHub Pages hosts it for free and redeploys on every merge to `main`.
- **The game server** (Node.js, `server/`) holds the shared world. It runs on a **small VPS** (primary)
  or, as a fallback, on the lektor's laptop with a free Cloudflare Tunnel.

The server can also serve the game page itself, so a VPS alone is enough: players open `https://hry.example.cz`.

The only value that ties the two together is the **server URL** (`wss://…`). Changing hosts means changing
that one value (see "Point the Pages game at the server").

---

## A. VPS (primary)

**Status:** scripted and documented, **not yet run on a real VPS** (it hasn't been bought). The server
itself, serving the built game, `/health`, saving and restarting are tested locally and in CI.

### What to buy
- Hetzner **CX23** (x86) or **CAX11** (ARM), Ubuntu 24.04, ~€5–6/month. 2 vCPU / 4 GB is far more than needed:
  6 players measured **~4–5 KB/s per player** and **~0.3 ms per server tick** (budget 50 ms).
- Use a **separate VPS for the club**, not the personal one with private agents and tokens.
- Optional: Hetzner backups (+20 %) for an off-site copy of the world.
- The same VPS can host other club multiplayer projects later: each gets its own port, systemd service
  and Caddy block (see the end of this section).

### 1. DNS
Point a hostname at the VPS IPv4 (and IPv6 if you like), e.g. an `A` record `hry.ardoremy.cz → 203.0.113.10`.
No domain at hand? `203-0-113-10.sslip.io` resolves to that IP automatically and works with Let's Encrypt
(shared rate limits, so prefer a real subdomain).

### 2. One command
SSH in as root and run:
```bash
curl -fsSLO https://raw.githubusercontent.com/Richard-Vesely/louka/main/deploy/setup-vps.sh
bash setup-vps.sh hry.ardoremy.cz 'heslo-pro-kroužek'
```
It installs Node.js 22 and Caddy, opens the firewall for SSH/80/443, creates a system user `louka`,
clones the repo to `/opt/louka`, builds the client, writes `/etc/louka.env` (mode 600) and starts the
`louka` systemd service. Caddy gets a Let's Encrypt certificate and forwards HTTPS **and WebSockets**
to `127.0.0.1:8787`.

Check:
```bash
curl https://hry.ardoremy.cz/health        # {"ok":true,"players":0,...}
systemctl status louka
journalctl -u louka -f                      # live log: who joins/leaves, saves, errors
```
Open `https://hry.ardoremy.cz`, enter a name and the password, *Hrát spolu*.

### 3. Settings (`/etc/louka.env`)
| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 8787 | server port (Caddy forwards to it) |
| `ROOM_PASSWORD` | – | the club password players type on the join screen |
| `DATA_DIR` | `server/data` | world file and backups |
| `STATIC_DIR` | `client/dist` | the built game the server also serves (`""` = don't) |
| `MAX_PLAYERS` | 8 | players at once |

After editing: `systemctl restart louka`.

### 4. Updating
```bash
sudo bash /opt/louka/deploy/update.sh       # git pull, npm ci, build, restart
```
A restart saves the world first (SIGTERM). Players see *"Spojení ztraceno — připojuji znovu…"* and are
back within seconds.

### 5. Data and backups
- `/opt/louka/server/data/world.json`: the world and every player (saved every 30 s and on shutdown).
- `/opt/louka/server/data/backups/world-YYYY-MM-DD.json`: one per day, last 7 kept.
- Restore: `systemctl stop louka`, copy a backup over `world.json`, `systemctl start louka`.
- Off-site: Hetzner backups, or `scp root@vps:/opt/louka/server/data/world.json .` now and then.

### 6. More club projects on the same VPS
Give each one its own port (`PORT=8788`), a copy of `louka.service` with a new name and paths, and a Caddy block:
```
hra2.ardoremy.cz {
	reverse_proxy 127.0.0.1:8788
}
```

---

## B. Laptop + Cloudflare Tunnel (fallback)

For a club session when there is no VPS. Free, no router setup. The laptop must stay awake.
**Status:** written, **not tested end to end** (installing `cloudflared` and opening a public tunnel on the
PC needs your OK first).

1. Install Node.js 22 (`winget install OpenJS.NodeJS.LTS`) and Git.
2. Get the game and build it:
   ```powershell
   git clone https://github.com/Richard-Vesely/louka
   cd louka
   npm install
   npm run build
   ```
3. Start the server (it also serves the game on the same port):
   ```powershell
   $env:ROOM_PASSWORD = 'heslo-pro-kroužek'; npm start
   ```
   Check http://localhost:8787 in the browser.
4. Install the tunnel: `winget install --id Cloudflare.cloudflared`
5. In a second terminal:
   ```powershell
   cloudflared tunnel --url http://localhost:8787
   ```
   It prints an address like `https://quiet-river-1234.trycloudflare.com`. That is the game: send it to the
   kids. WebSockets go through the tunnel automatically (`wss://`).
6. Windows: set **Power & sleep → Never** while the club is on. Stop with Ctrl+C in both terminals
   (the server saves the world on Ctrl+C).

The quick-tunnel address changes every time. For a stable address use a named tunnel on a domain managed by
Cloudflare (`cloudflared tunnel login`, `cloudflared tunnel create louka`, route a hostname), or move to the VPS.

The world lives in `server/data/` on the laptop; copy `world.json` to the VPS later to keep it.

---

## Point the Pages game at the server

The Pages build (`.github/workflows/pages.yml`) reads the repository variable **`SERVER_URL`**:
GitHub → Settings → Secrets and variables → Actions → **Variables** → New: `SERVER_URL = wss://hry.ardoremy.cz`.
Then re-run the *Pages* workflow (Actions → Pages → Run workflow). Pages is HTTPS, so the server must be `wss://`.

Without rebuilding, any link can choose a server: `https://richard-vesely.github.io/louka/?server=wss://quiet-river-1234.trycloudflare.com`.
On the join screen, *Adresa serveru* can also be edited by hand.

## Local development
`npm run dev` starts the game (http://localhost:5173) and the server (8787); Vite forwards `/ws` to the server,
so it also works in GitHub Codespaces through one forwarded port.
