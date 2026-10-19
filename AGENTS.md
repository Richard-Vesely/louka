# AGENTS.md: how this game is built, and the rules for AI helpers

You are helping kids (10–14) in an AI coding club change a browser game together. Talk to them in simple Czech,
explain what you change, keep changes small, and ask before big ones.

## The game in one minute

*Říše* (repository *Louka*) is Marek's survival/building game in the browser (Three.js): endless terrain with
biomes, a voxel underground, trees, animals and night monsters, crafting (~260 recipes), cooking, farming,
furnaces, electricity, cars, a biplane, a computer with games and a printer, and the Mark dimension behind a portal.
The full feature list is [docs/FEATURES.md](docs/FEATURES.md); read it before adding something.

There are **three ways to play, with one set of rules and one protocol**:

| Mode (menu button) | Who holds the world | Connection | Saved in |
|---|---|---|---|
| **Hra pro jednoho** | this browser | none | `localStorage` (`rise-svet-v2`) |
| **Vytvořit server** | the host's browser tab (host = player `'host'`) | PeerJS code `LOUKA-XXXX` | host's `localStorage` (`rise-server-v1`) |
| **Server** (`npm start`) | Node.js process, no player; one or more worlds (`WORLDS`) | WebSocket, address (+ optional password), then a world | `DATA_DIR/<world>/world.json` + daily backups |

Players who join (by code or address) keep their own backpack/position in their browser (`rise-klient-<code or address>`;
on the Node server per world: `rise-klient-<address>#<world id>`, the first world also reads the old key).

## Folder map

```
index.html            menu + HUD markup (styles in client/src/styles/game.css)
client/src/           the browser: drawing, sound, input, UI, the player, vehicles, eating, computer
shared/               game rules and data, no DOM, no Three.js: runs in the browser AND in Node.js
server/               Node.js server: the same rules + WebSocket + saving to disk
tests/                unit tests (node:test) and play-tests in a real browser (Playwright)
deploy/               VPS setup (systemd + Caddy)
docs/                 features, plan, hosting, known issues, message for the kids
legacy/index.html     Marek's original single file (reference only, do not edit)
```

| Where | What lives there |
|---|---|
| `shared/data/items.js` | items (tools, armor, food, ingredients, utensils), basic recipes, stove cookbook `KITCHEN`, crops `CROPS`, campfire `COOKING`, block list `BLOCKS` |
| `shared/data/blocks.js` | building blocks: stones, stairs/slabs, biome blocks, glass, concrete and dyes |
| `shared/data/tech.js` | ores, furnace (`FURNACE_ONLY`, `FUEL`), workshop parts, engines, vehicles, computers, electric devices |
| `shared/data/index.js` | **import data from here**; finalizes recipes (grid pattern, category) once |
| `shared/world/terrain.js` | terrain height and biomes (its GLSL twin is `client/src/render/glsl.js`, keep them identical) |
| `shared/world/voxels.js` | the underground (what is where naturally, player edits, `setVox`, `groundHeight`) |
| `shared/world/state.js` | **the world state**: blocks, chests, fires, stoves, crops, furnaces, power, vehicles, papers… (`SyncMap` sends changes) |
| `shared/world/save.js` | `loadWorld(save)` / `worldState()` – the save shape used everywhere |
| `shared/world/nature.js`, `structures.js`, `collision.js` | trees, rocks, shards, ponds; structures and their builders; what is solid |
| `shared/sim/*.js` | simulations: `day.js`, `mobs.js` (AI, spawning, spawners), `ground-items.js`, `machines.js` (campfire, furnace, stove, crops), `power.js` (grid, printer) |
| `shared/net/net.js` | the `NET` object the rules talk to (mode, `op()` for world changes, hooks) |
| `shared/net/ops.js` | applying world changes from others (`applyOp`), small maps diff (`kvDiff`, `applyKV`) |
| `shared/net/room.js` | **the host**: accepts players, handles their messages, broadcasts (browser host and Node server) |
| `shared/events.js` | events from rules to the browser (`emit('mobHit', m)` → sparks and sound) |
| `client/src/main.js` | entry point: menu, then the game modules |
| `client/src/menu/` | main menu (single player / host / join by code or address) and settings |
| `client/src/game/` | boot (`NET` setup), prefs, save/load in the browser, the frame loop `loop.js` (`tick`), `debug.js` (`window.game`) |
| `client/src/render/` | renderer, sky, textures, icons, ground, grass, forest, blocks, underground meshes, particles, held item, day/night colours |
| `client/src/player/` | player movement and collisions, aiming, mining/placing/using, backpack, survival, eating |
| `client/src/mobs/mobs.js` | creature 3D models, animation, sounds (behaviour is in `shared/sim/mobs.js`) |
| `client/src/ui/` | HUD, inventory window, touch controls |
| `client/src/machines/`, `pc/`, `vehicles/`, `dining/`, `world/` | the browser side of machines, the computer + Tanks + documents, car + plane, table manners, shrine/fishing/dropped items |
| `client/src/net/` | multiplayer in the browser: client side (`multiplayer.js`), avatars, chat + Esc menu, the net loop (`mp-start.js`) |
| `server/` | `index.js` (env config), `worlds.js` (`WORLDS` list, moving old data), `server.js` (HTTP + WebSocket, sends each player's messages to their world), `world-worker.js` (one world in its own thread: room + 20 Hz loop + saving), `sim.js` (one world step), `persist.js` (saving + backups), `static.js` |

## How it fits together

- **Rules vs. drawing.** Code in `shared/` changes the world and calls `emit('event', …)`; the browser listens with
  `on('event', …)` (`shared/events.js`) and draws sparks, plays sounds or rebuilds meshes. The server listens to nothing.
  Example: `hurtMob()` (shared) emits `mobHit`; `client/src/mobs/mobs.js` makes sparks and a sound.
- **World changes are sent automatically.** `blocks.set(k, 'planks')` on a `SyncMap` calls `NET.op(['m', 'blocks', k, v])`;
  the net loop sends collected ops. Small maps (chests, machines…) are compared as JSON and changed keys are sent.
- **Who simulates.** Whoever holds the world (single player, the host tab, the Node server) runs mobs, machines,
  power, day time. A joined player only shows what the host sends (`NET.client` is true there).
- **Browser modules run in a fixed order.** Marek's game was one big script; to keep it working exactly the same,
  every module in the chain first imports the previous one (the line with `// pořadí spouštění`), and `main.js`
  imports the last one. Order: `game/boot → game/prefs → game/save-load → render/renderer → render/sky →
  render/textures → render/icons → render/icons-blocks → world/papers → world/dig → render/icons-food → render/ground →
  render/grass → render/fireflies → world/world-state → render/forest → render/shards → world/shrine → render/blocks →
  render/vox-mesh → render/particles → audio/sound → player/inventory → ui/inventory-ui → machines/kitchen →
  machines/furnace → machines/power → pc/computer → pc/tanks → pc/printer → pc/papers-world → pc/doc-view → pc/editor →
  player/player → render/held-item → player/targeting → player/interaction → mobs/mobs → world/structures →
  render/dimension → world/ground-items → world/fishing → vehicles/car → vehicles/plane → player/eating →
  dining/dine-view → dining/food-models → dining/dining → player/survival → render/daylight → ui/hud → game/save →
  ui/touch → game/loop → net/multiplayer → net/avatars → net/mp-ui → net/mp-start → game/debug`.
  A **new browser module** either has no side effects at load time (only functions/constants; then no chain line
  is needed), or it gets a chain line and is inserted into the chain (ask Richard). Modules in `shared/` never import `client/`.
- **`window.game`** (`client/src/game/debug.js`) exposes the game for the console and the play-tests. Keep it working.

## Protocol

Messages are arrays, the same over PeerJS and WebSocket (JSON). Host = `shared/net/room.js`, client = `client/src/net/multiplayer.js`.

- Client → host: `['ops', creative, ops]`, `['kv', changes]` (5×/s), `['pose', pose]` (12×/s), `['pk', gid]` pick up,
  `['hit', nid, dmg, yaw]`, `['mu', nid]` eggs/milk, `['print', key, paperId, copies]`, `['giveTo', pid, docId]`, `['chat', text]`.
- Host → client: `['welcome', { pid, name, perm, world, spawn, max }]`, `['full']`, `['join'|'leave', name]`, `['ops', ops]`,
  `['kv', changes]` (2×/s), `['pl', [[pid, name, pose, perm]…]]` (12×/s), `['mobs', dayTime, day, [[nid, type, x, y, z, ry, hp, flash, dead, eggs, milk]…]]` (5×/s),
  `['give', id, n]`, `['swap', from, to]`, `['dmg', n, dx, dz]`, `['perm', bool]`, `['toast', text]`, `['chat', name, text]`, `['gift', docId, from]`, `['kick']`.
- Ops: `['m', 'blocks'|'blockMeta', key, value|null]`, `['s', 'removed'|'ruinsOpened', key]`, `['r', structure]`, `['v', x, y, z, id]`,
  `['c', x, z, r]` grass cut, `['p']` portal, `['g', gid, id, n, pos, vel, delay]` dropped item, `['gx', gid, n]`.
- WebSocket only (Node server, `server/server.js`): the client first sends `['hello', { name, pass, v: 2, world }]`.
  A wrong password gets `['denied', 'password']`. A known `world` id joins that world. A new client (`v: 2`) without
  a world or with an unknown one, on a server with several worlds, gets `['worlds', [{ id, name, creative, players, max }…]]`
  and sends `hello` again with the chosen `world` (the menu reconnects). An old client (no `v`) and every client on a
  one-world server join the first world. The welcome then also has `worldInfo: { id, name, creative, first }`
  (added by `server/world-worker.js`; the browser host doesn't send it). `GET /worlds` returns the same list over HTTP (no password).
- Each world of the Node server runs in its own `worker_threads` thread, because `shared/` keeps one world in module
  state. Rooms, chat and players are per world; there are no messages between worlds.
- Trust model (Marek's, kept for now): the host decides mobs, pick-ups, time and machines; players are trusted for
  their own position, backpack and world edits. See [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md).

## Rules for AI helpers

1. **Small pull requests.** One idea per PR. Never push to `main`; open a PR, CI must be green. Never force-push.
2. **All text in the game stays Czech.** Comments may be Czech (most are) or English.
3. **Data before engine.** A new item, block, recipe, cooking recipe or mob is mostly a data change in `shared/data/`
   or `shared/sim/mobs.js`. Add engine code only when data can't express it.
4. **Ask Richard (the lektor) before touching core files:** `shared/net/*`, `shared/world/state.js`, `shared/world/save.js`,
   `shared/world/voxels.js`, `shared/world/terrain.js` + `client/src/render/glsl.js` (twins), `shared/events.js`,
   `server/*`, `client/src/net/*`, `client/src/game/*`, `client/src/menu/*`, `client/src/main.js`, the module order chain,
   the save format or localStorage keys, and before changing balance (damage, speeds, drop rates, recipe costs).
5. **Never change the protocol on one side only.** Host (`shared/net/room.js`), client (`client/src/net/multiplayer.js`)
   and the docs above change in the same PR. Old saves must keep loading.
6. **Keep `shared/` free of DOM and Three.js** (`npm test` checks that every file imports in Node).
7. **Keep `window.game` working**; the play-tests use it.
8. Files stay under ~400 lines (data tables and model builders may be longer). Plain JavaScript ES modules with JSDoc,
   no TypeScript, no frameworks. New dependencies only with Richard's OK.
9. When you add or change a feature, update [docs/FEATURES.md](docs/FEATURES.md) in the same PR.
10. No secrets in the repo (the server password lives in an env file on the server). No personal data about the kids.

## Check your change

```bash
npm install                     # once
npm run dev                     # the game: open http://localhost:5173 (Hra pro jednoho)
npm test                        # unit tests + the Node server over WebSocket (fast)
npm run build                   # build into dist/
npm run playtest                # single player in a real browser (36 checks, needs the build)
npm run test:server             # Node server + 2 browsers: join, edits, mobs, pickup, chat, restart
npm run test:worlds             # Node server with 2 worlds + 2 browsers: world menu, isolation, creative, saves per world
npm run test:peer               # browser host + browser client over PeerJS (needs internet)
npm start                       # the server on http://localhost:8787 (serves dist/)
npm run test:load               # 8 simulated players: server memory, CPU, time per world step
npm run test:load:worlds        # the same with 2 worlds × 4 players
```
Console helpers (single player or host): `game.addItem('iron', 5)`, `game.setTime(0.9)` (night),
`game.spawnMob('boar', x, z)`, `game.setCreative(true)`, `game.teleport(x, z)`.

## Recipes

### Add an item
1. In `shared/data/tech.js` (or the matching section in `items.js`) add it with the `item()` helper, e.g.
   `item('honey', 'Med', 'basic', ['bottle', '#e8a020'], { food: 15 });`
   Fields: `food`/`heal` = edible, `stack` = max per slot, `fly` = seconds of flying after eating.
2. The icon: `art: [shape, colour, second colour]` draws it automatically. Shapes are the keys of `S` in
   `client/src/render/icons-blocks.js` (`ore, crystal, blob, ingot, bottle, gear, chip, book, …`). Without `art`
   (or a hand-drawn icon in `client/src/render/icons*.js`) the game breaks when the item is shown.
3. Make it obtainable: a recipe, a furnace/campfire result, a stove dish, a mob drop or loot (`LOOT` in `shared/world/structures.js`).

### Add a crafting recipe
In `shared/data/tech.js`: `R('honey', 1, ['BB', 'BB'], { B: 'berries' });` (category comes from the item) or in
`items.js`: `RECIPES.push({ out: 'honey', n: 1, shape: ['BB', 'BB'], key: { B: 'berries' } })`.
Letters map to items, a space is an empty cell. Up to 2×2 works in the backpack, 3×3 needs a workbench,
`{ adv: true }` needs the workshop. **Append** new recipes: the order is the order in the recipe book.

### Add a cooking recipe
- Campfire / furnace (raw → cooked): `COOKING.raw_fish = 'fried_fish'` in `items.js` (furnace only: `FURNACE_ONLY` in `tech.js`).
- Stove dish: add to `KITCHEN` in `items.js`:
  `{ out: 'honey_cake', n: 2, in: { flour: 2, honey: 1 }, tools: ['bowl'], heat: true, time: 8, steps: 'Česky popiš postup.' }`
  (`tools` are not used up; `returns: { bucket: 1 }` gives back an empty bucket). Append at the end: saved stoves remember the index.

### Add a block
1. In `shared/data/blocks.js`, inside the biome section, add with the `block()` helper:
   `block('honey_block', 'Medový blok', { hard: 1, tool: 'shovel', tint: 0xe8a020 });` and a recipe with `recipe(...)`.
   `tint` = coloured like concrete: the texture, the 3D block and the icon come for free.
2. A block with its own texture: add a texture in `client/src/render/textures.js`, a material in `blockMats`
   (`client/src/render/blocks.js`) and an icon in `client/src/render/icons-blocks.js`.
3. A special model (like the campfire): `special: true` in the block and a branch in `buildSpecial()` in `client/src/render/blocks.js`.
   `light: 10` makes it shine (and keeps shadow-eaters away).

### Add a mob
1. `shared/sim/mobs.js`: add to `MOBS`, e.g. `fox: { name: 'Liška', hp: 6, radius: 0.6, cy: 0.5, drops: [['raw_meat', 1, 1]] }`.
2. Where it appears: a line in `updateSpawns()` (copy the deer line and change the counts). Hostile? add it to the
   `hostile` condition and `HOSTILE_SPEED`; shy? to the flee lists. These are core rules: ask Richard first.
3. Model: a new branch in `buildMob()` in `client/src/mobs/mobs.js` (copy the sheep and change colours);
   a sound in the `on('mobSound', …)` table there.

## What not to do
- Don't edit `legacy/` (Marek's original), `dist/` (built output) or `server/data/` (the live world).
- Don't add a free-text field that collects personal data. Names are nicknames only.
- Don't remove features from [docs/FEATURES.md](docs/FEATURES.md) without Richard.
