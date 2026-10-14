# AGENTS.md: how this game is built, and the rules for AI helpers

You are helping kids (10–14) in an AI coding club change a multiplayer browser game together.
Explain what you do in simple Czech when you talk to them. Keep changes small.

## The game in one minute

*Říše* (repo name *Louka*) is a survival/building game in the browser: heightmap terrain, forests,
day/night, night monsters (*stínožrouti*), inventory, crafting, cooking, blocks. Up to ~8 players
share one persistent world through a small Node.js server. It is **not** a voxel world: terrain is a
height function, players only place/break blocks on top of it.

```
shared/   data + rules used by BOTH the browser and the server   ← most kid changes go here
client/   the browser game (Vite + Three.js): drawing, sound, HUD, input
server/   Node.js + ws: one shared world, validates every action, saves to disk
tests/    unit tests (node:test), play-test in a real browser, multiplayer test, load bots
docs/     V1 brief, baseline checklist, hosting guide
```

## Architecture map

| Folder / file | What lives there |
|---|---|
| `shared/items.js` | every item: name, emoji icon, food, tool tier, stack size |
| `shared/recipes.js` | crafting recipes (shape in a grid) + `findRecipe` |
| `shared/cooking.js` | campfire recipes (raw → cooked) |
| `shared/blocks.js` | placeable blocks: solid, hardness, tool, drop, light |
| `shared/mobs.js` | creatures: hp, size, damage, drops |
| `shared/constants.js` | speeds, reach, day length, spawn point |
| `shared/terrain.js`, `shared/worldgen.js` | terrain height (JS + GLSL twin), where trees/rocks/shards are |
| `shared/game/` | **the game rules without graphics**: `Game` class, actions, inventory, crafting, mobs AI, survival, fires, day clock |
| `shared/protocol.js` | every network message, documented, + validation of client messages |
| `client/src/main.js` | start-up and the frame loop (`tick`) |
| `client/src/net/` | `local.js` (single-player: the `Game` runs in the browser), `online.js` (WebSocket), `replica.js` (server state → local objects), `events.js` (game events → HUD/sound/particles), `start.js` (join screen flow) |
| `client/src/world/` | drawing the world: ground, grass, forest, shards, shrine, blocks, special block models |
| `client/src/player/` | movement + collisions (client-side), aiming, mining/attacking input |
| `client/src/inventory/` | inventory window, hotbar, recipe book (UI only; logic is in `shared/game`) |
| `client/src/mobs/` | creature 3D models and animation (AI is in `shared/game/mobs.js`) |
| `client/src/render/` | renderer, sky, textures, pixel-art icons, particles, held item, other players' avatars |
| `client/src/ui/` | HUD, tips, join screen, notices, player list |
| `server/src/` | `index.js` (env config), `server.js` (HTTP + WebSocket), `room.js` (players, sync), `persist.js` (save + backups) |

## Data flow

1. The player presses a button. The client turns it into an **action** message, e.g.
   `{ t: 'place', cell: [3, 0, 12] }`, and calls `net.act(msg)`.
2. **Single-player:** `net/local.js` runs `shared/game/game.js` in the browser.
   **Multiplayer:** `net/online.js` sends it to the server, which runs the same `Game`.
3. `Game.act()` checks the action (`shared/game/actions.js`; on the server also reach, speed, tool) and
   changes the state: `world` (blocks, felled trees, fires, time), the player (inventory, hp, hunger), mobs.
4. The game sends **events** back: `block`, `removed`, `fire`, `fx`, `toast`, `feed`, `hurt`, …
   The server also sends positions (`state`, 10×/s) and your inventory (`me`).
5. The client applies them (`net/events.js`, `net/replica.js`) and redraws. **Rendering only reads state.**

Movement is calculated in the browser and sent 10×/s; the server only checks it isn't too fast.

## Rules

1. **Small pull requests.** One idea per PR. Never push to `main`; open a PR, CI must be green.
2. **Keep all UI text in Czech.** Code comments in Czech are welcome (most are).
3. **Data goes in `shared/`.** A new item, block, recipe or mob should be a data change in `shared/`,
   not engine code. Only add engine code when the data can't express it.
4. **Never change the protocol on one side only.** If you touch `shared/protocol.js` or a message's shape,
   update the client (`client/src/net/`) and the server (`server/src/room.js`) in the same PR and bump
   `PROTOCOL_VERSION`.
5. **Ask Richard (the lektor) before touching core files:** `shared/game/game.js`, `shared/game/actions.js`,
   `shared/protocol.js`, `server/src/*`, `client/src/net/*`, `client/src/main.js`, `shared/terrain.js`
   (its GLSL twin must stay identical), and before changing gameplay balance (damage, speeds, drop rates).
6. **No free text chat**, no collecting personal data. Names are only nicknames.
7. **Keep `window.game` working** (`client/src/main.js`): the play-test drives the game through it.
8. Files stay under ~400 lines. Plain JavaScript (ES modules) with JSDoc, no TypeScript, no frameworks.
9. New dependencies only with Richard's OK.

## Check your change

```bash
npm install          # once
npm run dev          # game + server: open http://localhost:5173
npm test             # unit + server tests (fast)
npm run build && npm run playtest            # 60 checks of the single-player game in a real browser
node tests/playtest/multiplayer.mjs          # real server + two browsers
```
For a quick look without a server: open the game and click **Hrát sám**, or add `?offline` to the URL.
Debug in the browser console: `game.addItem('iron', 5)`, `game.setTime(0.9)` (night),
`game.spawnMob('boar', x, z)` (single-player only).

## Recipes

### Add an item
1. `shared/items.js`: add a line to `ITEMS`, e.g. `honey: { name: 'Med', icon: '🍯', food: 15 },`
   (`food`/`heal` = edible, `block` = can be placed, `tool`+`tier`+`dmg` = tool, `stack` = max per slot).
2. Done: it shows with its emoji icon. Optional: draw 16×16 pixel art in `client/src/render/pixel-art.js` (`ART`).
3. Make it obtainable: a recipe, a cooking result, a mob drop, or a block drop.

### Add a recipe
`shared/recipes.js`: add to `RECIPES`, e.g.
`{ out: 'honey', n: 1, shape: ['BB', 'BB'], key: { B: 'berries' } }`.
Letters in `shape` map to items in `key`, a space is an empty cell. Up to 2×2 works in the inventory,
bigger needs a workbench (3×3). Mirrored shapes match automatically.
Note: the play-test checks the original 16 recipes are present in order, so **append** new recipes at the end.

### Add a cooking recipe
`shared/cooking.js`: `COOKING.fish = 'cooked_fish'` (both must be items).

### Add a block
1. `shared/blocks.js`: `glass: { name: 'Sklo', solid: true, hard: 0.5, drop: 'glass', color: '#9fd8e8' }`.
2. `shared/items.js`: an item that places it: `glass: { name: 'Sklo', icon: '🪟', block: 'glass' }`.
3. Done: it is drawn as a cube in `color`. Optional: a texture in `blockMats` (`client/src/world/blocks.js`),
   or a special shape in `buildSpecial()` (`client/src/world/special-blocks.js`) with `special: true`.

### Add a mob
1. `shared/mobs.js`: `fox: { name: 'Liška', hp: 6, radius: 0.6, cy: 0.5, drops: [['wool', 1, 1]] }`.
2. Model: a new branch in `buildMob()` in `client/src/mobs/mob-models.js` (copy the sheep and change colours).
3. Behaviour and spawning: `shared/game/mobs.js` (`updateMobs`, `updateSpawns`). This is a core file: ask first.

## What not to do
- Don't edit `client/dist/` (built output) or `server/data/` (the live world).
- Don't put secrets in the repo (`ROOM_PASSWORD` lives in an env file on the server).
- Don't remove or rename `window.game` fields or DOM ids the play-test uses (see `tests/playtest/playtest.mjs`).
