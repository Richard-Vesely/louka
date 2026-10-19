# V2 plan: Marek's game, split up, with a real server

**Goal (finish line):** Marek's game (`2778d1b`, one 10,742-line `index.html`) plays the same, but
1. the code is small ES modules that kids and their AIs can change safely,
2. it can be played three ways with **one** set of game rules and **one** protocol:
   - **Hra pro jednoho** (single player, in the browser),
   - **Vytvořit server** (host in your own browser via PeerJS code, like today; must keep working),
   - **Server** (Node.js on a VPS or a laptop: always on, world saved to disk with backups, join by address),
3. CI, a play-test, hosting guide, `AGENTS.md`, `CONTRIBUTING.md` and the Czech message for the kids are ready.

Deadline: **Wednesday 21.10.2026** (club session). Fallback if not stable: play Marek's current version.

Branch: `v2` in `Richard-Vesely/louka` (based on Marek's history, authorship kept).
Old engine (v1, heightmap + Node server) stays in branches `v1-*`; reuse its server/persist/deploy/test code.

Feature checklist: [FEATURES.md](FEATURES.md). Technical inventory of the original file: section "Inventory" below.

---

## Architecture (target)

```
index.html            menu + HUD markup only (CSS in client/src/styles/)
shared/               game rules, no DOM, no Three.js (runs in browser AND Node)
  data/               items, recipes, blocks, kitchen, crops, cooking, furnace, mobs, loot, structures, dyes…
  world/              terrain + biomes (JS twin of TERRAIN_GLSL), voxels (naturalAt, voxEdits), trees/rocks/shards/ponds
                      as deterministic queries (treeAt, rockAt, shardAt, pondOf, structAt), placed blocks, shapes/collision
  sim/                fires, furnaces, stoves, crops, power grid + printer, spawners, mobs AI (state only), ground items,
                      structures (builders return mob spawns as data), day clock
  net/                protocol (message list + validation), room.js (the host logic: accept, onClientMsg, broadcasts,
                      kv diff, uiBusy locks, permissions, kick), transport interface
client/src/           rendering, sound, input, UI, player physics, vehicles driving, eating/dining, PC/Tanks/editor
  net/                transports: local (single player), peer (PeerJS host or join), ws (server); replica of host state
server/               Node: room.js + sim over WebSocket (ws), persist (world.json every 30 s + daily backups, from v1),
                      static serving of client/dist, /health, env config (PORT, ROOM_PASSWORD?, DATA_DIR, MAX_PLAYERS)
tests/                unit tests (node:test), play-test in a real browser, multiplayer test (server + 2 browsers,
                      and browser-host + browser-client over PeerJS)
deploy/               setup-vps.sh, update.sh, louka.service, Caddyfile (from v1, adapted)
```

### Key design decisions
- **Keep Marek's protocol and authority model** (messages `ops`, `kv`, `pose`, `pl`, `mobs`, `give`, `dmg`, …, see Inventory).
  Do not redesign it to fully server-authoritative before Wednesday. Parity first; hardening later (list in KNOWN-ISSUES.md).
- **The host role becomes a `Room` that does not need a local player.** In the browser host, the local player is just
  one more participant (`pid 'host'`). On the Node server there is no local player. Every place that assumes
  `player` on the host (`NET.targets`, `spawnCenter`, `nearestDist`, `killMob` loot, `welcome.spawn`, `crafted` credit,
  structures built around the local player, forest colliders around the local player) must take players as input.
- **Transport interface:** `{ send(msg), onMessage(fn), onClose(fn), close() }`. PeerJS `DataConnection` and a WebSocket
  both wrap to it. The client chooses: code `LOUKA-XXXX` → PeerJS, address `wss://…` / `?server=` → WebSocket.
  Messages stay JS arrays; over WebSocket use JSON.
- **Rules without rendering:** split mixed functions into a rule part (pure, in `shared/`) that emits **events**
  and a client part that listens (meshes, particles, sound, toasts). E.g. `setVox` → world change + event `vox`;
  the renderer marks chunks dirty and updates `digTex`.
- **Forest/rock/shard queries:** replace `forestTrees/forestRocks/forestColliders` (built by the renderer around the
  local player with a GFX-dependent radius) with deterministic queries by area from `treeAt`/`rockAt` (extract the
  inline rock generator from `rebuildForest`). The renderer uses the same queries.
- **Light index:** `nearLight` and crawler light-avoidance read `specials` (render objects); replace with an index of
  light blocks from `blocks` + `BLOCKS[t].light`. Same for table rest height (`specials.get(k).ry`).
- **Clock and RNG** injectable (server uses its own fixed-step loop, e.g. 20 Hz; browser keeps rAF + background interval).
- **Save:** the same `worldState()` shape in all modes. Browser: localStorage (same keys as Marek's, so existing saves load).
  Server: `DATA_DIR/world.json` + `backups/world-YYYY-MM-DD.json` (7 kept). Per-player data on the server:
  clients keep saving their own `me` part in their browser keyed by server (like `rise-klient-<code>` today).
- **Room password** (optional, server only) via env, like v1. Codes stay for PeerJS.
- **Chat:** keep as is (parity). Richard decides later whether to remove it (the old v1 rule said no free chat).
- **Data tables declared once:** today recipes are appended in 5 IIFEs with `pat` recomputed 5×, `cat` back-filled,
  `car_battery` renamed after the fact. Make them declarative and finalize in one pass, **keeping the same order**
  (stove recipes are saved as a KITCHEN index; recipe order shows in the book).
- **No behaviour change during the split.** Visual and gameplay parity with `2778d1b`, checked by the play-test.

---

## Phases (each ends with a commit on `v2`, tests green, progress noted below)

0. **Baseline.** Vite + package.json (from v1), serve Marek's `index.html` unchanged, write an automated play-test
   (Playwright, `window.game` + `game.testMode`) covering the FEATURES.md checklist that can be automated: menu → single
   player, move, mine a tree, craft, place a block, inventory, day/night, a mob spawns, save/reload; and a PeerJS
   host + join test with two browser contexts (works today against the public PeerJS broker).
1. **Split into modules, no behaviour change.** Mechanical: sections become files under `client/src/` and `shared/`
   (data first). Play-test still green, screenshots match.
2. **Rules layer.** Move rules into `shared/` without DOM/Three (world, voxels, sims, mobs state, ground items,
   structures, day clock, inventory/crafting functions). Events to the client. `node -e "import('./shared/…')"` works.
3. **Room + transports + server.** `shared/net/room.js` from Marek's host code, transport-agnostic, no local player
   needed. Browser host = Room + PeerJS. Node server = Room + sim loop + ws + persist + static. Client join by code or
   address. Multiplayer tests: server + 2 browsers; browser host + browser client.
4. **CI, deploy, docs.** GitHub Actions (tests + play-test), Pages deploy of the client, `docs/HOSTING.md`
   (VPS one-command setup, laptop: `npm start` + optional Cloudflare tunnel, browser host), `AGENTS.md`
   (architecture map, rules, recipes "how to add an item/block/recipe/mob"), `CONTRIBUTING.md` (Czech, for kids),
   `README.md`, `docs/KNOWN-ISSUES.md`, `docs/MESSAGE-KIDS.md` (Czech message draft).

---

## Inventory of the original file (from the analysis on 19.10.2026)

### Save shape (`worldState()` + player part)
World: `dayTime, day, blocks, blockMeta, removed, vox, fires, stoves, crops, furnaces, chests, ground, tableItems,
chairRot, spawners, power, vehicles, papers, pcDisks, paperSpots, ruins, ruinsOpened, portal` (+ `code` on host).
Player (`me`): `inv, pos, yaw, hp, hunger, crafted, placedAny, creative, flying, flyT, armor`.
Keys: `rise-svet-v2` (SP), `rise-server-v1` (host; its `code` is reused), `rise-klient-<code>` (client, `me` only),
`rise-nastaveni` (settings), `rise-jmeno` (name); sessionStorage `rise-menu-msg`, `rise-autostart`.
Not saved: mobs, grass cut mask, digData (rebuilt from vox), UI state.

### Protocol (PeerJS, star topology, host relays; messages are arrays)
Client → host: `['ops', cr, ops]` (every frame), `['kv', changes]` (5 Hz), `['pose', pose]` (12 Hz), `['pk', gid]`,
`['hit', nid, dmg, yaw]`, `['mu', nid]`, `['print', key, pid, n]`, `['giveTo', pid, docId]`, `['chat', text]`.
Host → client: `['full']`, `['welcome', {pid, name, perm, world, spawn}]`, `['join'|'leave', name]`, `['ops', ops]`,
`['kv', changes]` (2 Hz, immediately when a UI opens), `['pl', [[pid, name, pose, perm]…]]` (12 Hz),
`['mobs', dayTime, dayCount, [[nid,type,x,y,z,ry,hp,flash,dead,eggs,milk]…]]` (5 Hz), `['give', id, n]`,
`['swap', from, to]`, `['dmg', n, dx, dz]`, `['perm', bool]`, `['toast', text]`, `['chat', name, text]`,
`['gift', docId, from]`, `['kick']`.
Ops: `m` (blocks/blockMeta SyncMap), `s` (removed/ruinsOpened SyncSet), `r` (structure built), `v` (voxel), `c` (grass cut),
`p` (portal), `g` (ground item spawn), `gx` (ground item count, host only).
KV maps (JSON-diffed whole values, last writer wins, client echo guard 1.5 s): `fires, stoves, crops, tableItems,
chairRot, chests, spawners, furnaces, power, vehicles, papers (send once), pcDisks, paperSpots`.
Pose: `{x,y,z,yaw,pitch, held, ui, mv, sw, eat, veh:{id,x,y,z,yaw,pitch,roll,spd,steer,thr,lights}|null, hn, ar[4],
sit, fly, flyT, alive, cr, set, hp}`.
Host-authoritative: mobs, pickups, day/time, fires/furnaces/crops/spawners/power/printer simulation, permissions,
join/kick/names. Client-trusted: own position/HP/hunger/inventory, survival world edits, all KV contents, driving.
Locks: client pose `ui` → host `uiBusy[key]` (1.2 s lease) pauses that machine's simulation.

### Game loop order (tick)
player/vehicle → vehicles → held model → swing → day → forest → vox chunks → dimension → underground → ruins →
spawners (host/SP) → [playing: interaction, dining, survival, SP mobs+spawns, shards, SP ground items, fishing, eating,
portal] → [MP: client puppets | host mobs+spawns; ground items] → fires, furnaces (not client) → furnace glow →
power (sim not client) → power visuals → PC → docs → stoves → crops (not client) → portals → grass regrow → lights →
particles → sound → uniforms → env map → cull → HUD → touch → net update → render.

### Coupling hot spots to untangle
- Mob objects hold Three meshes; ground items hold `obj`; `specials` render map used by rules (nearLight, table ry, crops).
- `setVox` = op + rule + `digData` texture + dirty chunks. `digData`/`cutData` are GPU textures that rules read
  (`isDug`, `isCut`); `cutData` wraps every 128 m (aliasing bug).
- Forest colliders/targets built by the renderer around the local player within the GFX radius.
- `rebuildBlocks` (render) is the only place setting `powerDirty`; rules call it directly.
- Inventory/crafting functions call `renderHotbar`, `toast`, `Sound`, read the global `ui`.
- `updateVehicles` (render) contains the battery rule; vehicle runtime fields (`engine, vy, batId, thr, vx, vz, ground`)
  leak into the saved/synced object.
- `driveVehicle`/`flyPlane` read `keys`/`input.joy` and write camera/Sound/toast.
- Structures are built on every machine around its own player; ruin/fortress builders `spawnMob` on clients too
  (ghost markomen, nid clash). Return spawns as data and spawn only on the host.
- `ITEMS`/`ICONS` have a Proxy prototype that lazily creates `doc_<pid>` items; keep an explicit dynamic registry.
- Terrain formula duplicated in JS and GLSL (`terrainH`, `biomeWeights`, `pondDip`): add a parity test.
- `biomeWeights` writes a shared `BW` array; `naturalAt`/`makeNoise3` keep last-cell caches (not reentrant; fine single-threaded).
- Dead data: `ITEMS[x].icon` emoji, `TIER_COLOR`.

### Known issues found (keep behaviour now; list in KNOWN-ISSUES.md)
Shards and papers can be picked up twice in MP; two players can enter one vehicle; host gets `crafted` credit for
clients' machines; trap kill without chest gives loot to the host or loses it; items lost when the backpack is full
(`returnGrid`, `closeInventory`, `fillCooking`); KV is trusted from clients; client ops not validated in survival.

---

## Progress
- 19.10.2026: analysis done, FEATURES.md + this plan written, branch `v2` created from Marek's `2778d1b`.
- 19.10.2026, phase 0 done: `package.json` (single package: three 0.169.0, peerjs 1.5.4, ws; dev: vite, playwright 1.55.0),
  Marek's file moved to `legacy/index.html` (unchanged). Play-tests written and green against legacy:
  `node tests/playtest/playtest.mjs legacy` (single player, 36 checks: menu, HUD, move, chop, craft, build/break, dig, mobs,
  day/night, campfire, furnace, power, crops, stove, structures, portal, creative, car, eating, save/reload, screenshot) and
  `node tests/playtest/peer.mjs legacy` (browser host + browser client over the public PeerJS broker, 18 checks).
  Next: phase 1 (split into modules).
- 19.10.2026, phase 1 done: `legacy/index.html` split into 70 ES modules (tool-assisted, code moved verbatim):
  `index.html` (markup) + `client/src/styles/game.css`, `client/src/menu/*` (menu + settings), `client/src/**` (game, in the
  original order: each module first imports the previous one, see `client/src/main.js`), pure data and world math in `shared/`
  (`shared/data/*` items/blocks/tech with one recipe-finalize pass in `shared/data/index.js`, `shared/world/*` terrain,
  voxels, structures, nature, `shared/util.js`). Variables changed from other modules got setters (`setDay`, `markPowerDirty`…).
  Three.js and PeerJS now come from npm (bundled by Vite), no CDN for code. Data tables checked identical to legacy.
  Tests: `npm run build`, `npm test` (5 unit), `node tests/playtest/playtest.mjs` (36/36), `node tests/playtest/peer.mjs` (18/18),
  also against `npm run dev`. Screenshot matches legacy. Next: phase 2 (world state + simulations into `shared/`).
- 19.10.2026, phases 2 and 3 done (core):
  - Rules layer in `shared/` (imports in Node, no DOM/Three): world state `shared/world/state.js` + `save.js` (loadWorld/
    worldState, same save shape and localStorage keys), voxels + `setVox`, collision + light index, trees/rocks/colliders
    (`nature.js`), structures + builders, day clock, ground items, mobs AI/spawns/spawners, machines (fires, furnaces,
    stoves, crops), power + printer, ops/kv (`shared/net/ops.js`), the host logic `shared/net/room.js`. Rules report to the
    browser through `shared/events.js` (sparks, sounds, redraws). The browser keeps models, animation, UI, player.
  - Browser host ("Vytvořit server") = Room in the page + PeerJS; the host player is participant 'host'.
  - Node server `server/` (`npm start`): Room + 20 Hz world loop + WebSocket (`['hello', {name, pass}]` first) + static
    `dist/` + `/health` + saving `DATA_DIR/world.json` every 30 s / on shutdown + daily backups (7 kept). Env: PORT,
    ROOM_PASSWORD, DATA_DIR, STATIC_DIR, MAX_PLAYERS, ALLOW_CREATIVE, SAVE_SECONDS.
  - Join by address: "Připojit se" accepts a code (PeerJS) or an address (WebSocket), password field; `?server=` link,
    `VITE_SERVER_URL` at build time, and a page served by the server shows "Hrát na serveru".
  - Fixes needed for the server (listed in docs/KNOWN-ISSUES.md): structure guards spawn only on the host (no ghost
    Markomen on clients); a client no longer drops another player's chest/machine change that arrives right after its own.
  - Tests (all green): `npm test` (7: data, terrain, shared imports, server over WebSocket incl. restart),
    `npm run build`, `node tests/playtest/playtest.mjs dist` 36/36, `node tests/playtest/peer.mjs dist` 18/18,
    `node tests/playtest/server-mp.mjs` 22/22 (server + 2 browsers, password, edits, mobs, pickup, chat, restart).
  - Next: phase 4 (CI, deploy, docs, message for the kids).
- 19.10.2026, phase 4 (docs, CI, deploy) + Richard's 1 GB VPS requirements:
  - Docs: `AGENTS.md` (architecture map, module order, protocol, rules incl. core files, recipes), `CLAUDE.md`,
    `README.md` + `CONTRIBUTING.md` (Czech), `docs/HOSTING.md`, `docs/KNOWN-ISSUES.md`, `docs/MESSAGE-KIDS.md`,
    `docs/FEATURES.md` with code locations. GitHub templates and `.devcontainer` from v1.
  - CI (`.github/workflows/ci.yml`): build, `npm test`, single-player play-test, server + 2 browsers, PeerJS (allowed to fail);
    on push the job *publish dist* puts the built game into branch `dist-<branch>`. `pages.yml` deploys on `main` only.
  - VPS for 1 GB RAM: nothing is built there (`dist-<branch>` is cloned/pulled), only `ws` is installed (`npm ci --omit=dev`),
    2 GB swap, `node --max-old-space-size=384`, systemd `MemoryMax=600M`. Load test `npm run test:load`: 8 bots → ~75 MB RSS,
    0.6 ms per world step, 1.6 % CPU (numbers in docs/HOSTING.md). Runtime deps: `ws` only (three, peerjs, vite, playwright are dev).
  - Not done / not verifiable here: real VPS run, Cloudflare tunnel, GitHub Pages deploy (needs merge to main).
