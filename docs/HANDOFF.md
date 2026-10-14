# Handoff — state of the V1 work (14.10.2026)

Read this first, then `docs/SETUP-PROMPT.md` (the full task) and `docs/V1-BRIEF.md` (definition of done).

## Decisions made with Richard (they override the original prompt)

- **Repo:** fork `Richard-Vesely/louka` (upstream `aimartinmarek-afk/louka`). Issues and Actions are enabled. `gh repo set-default Richard-Vesely/louka`. Always pass `--repo Richard-Vesely/louka` so PRs never go to the upstream author.
- **Hosting:** a **separate cheap VPS** (Hetzner CX23 / CAX11, ~€6/month) runs the game server for all club multiplayer projects. This replaces "lektor's laptop + Cloudflare Tunnel" as the primary path. Richard has **not bought it yet**, so build and document everything up to the deploy step. `docs/HOSTING.md` should be VPS-first (systemd service + Caddy reverse proxy for `wss://`, hostname e.g. `hry.ardoremy.cz` or a free sslip.io name), with laptop + Cloudflare Tunnel as the fallback section. Do NOT use Richard's personal Hostinger VPS (it holds his private agents and tokens).
- **Kids are 10–14.** Under-13s can't have GitHub accounts, so CONTRIBUTING.md should mention working in pairs or through Richard's account. No free text chat in the game (brief rule).
- **Workflow:** one stacked branch + PR per phase. Phase 0 = PR #1 (`v1-setup` → `main`). Phase 1 = branch `v1-modules` (based on `v1-setup`), PR into `v1-setup`. Continue: `v1-state` → `v1-modules`, `v1-multiplayer` → `v1-state`, `v1-ci` → `v1-multiplayer`. Put each phase's CHECKPOINT report (tree, line counts, test results) in its PR description instead of stopping. Still ask Richard before anything the setup prompt lists under "Ask me before" (deleting original content, balance changes, new dependencies beyond Three.js, Vite, ws, Playwright).
- **Commits:** small, clear messages, doc-only changes in separate commits, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Multi-line messages: write to a file + `git commit -F`.

## Done

- **Phase 0 (PR #1):** `docs/V1-BRIEF.md`, `docs/SETUP-PROMPT.md`, `docs/BASELINE.md` (regression checklist), `tests/playtest/playtest.mjs`.
- **Automated play-test:** `node tests/playtest/playtest.mjs <dir-or-url> [out.json]`. It serves a folder (or opens a URL), drives the game through `window.game` with `testMode = true`, and runs **60 checks: 60/60 pass on the original `index.html`**. Notes:
  - It skips WebGL draw calls (`window.__skipDraw`), because software WebGL with ~250k grass blades is far too slow headless. Game logic still runs every tick.
  - Needs Playwright: `npm i -D playwright@1.55.0 && npx playwright install chromium`, or set `CHROME_PATH` to an existing Chromium.
  - It depends on this `window.game` API: `testMode` (read/write), `tick(dt)`, `input`, `keys`, `player`, `inv`, `ui`, `fires`, `ICONS`, `addItem`, `countItem`, `RECIPES`, `mobs`, `spawnMob`, `blocks`, `rebuildBlocks`, `forestTrees`, `forestRocks`, `slotClick`, `takeResult`, `fillRecipe`, `fillCooking`, `findRecipe`, `cutGrass`, `setTime`, `target` (getter), `openInventory`, `closeInventory`, plus `window.gameStarted` and the DOM ids in `client/index.html`. **Keep this API working in every phase** so the play-test stays the regression gate. It also reads `localStorage['rise-svet-v2']`.

## Phase 1 — in progress on branch `v1-modules` (not yet building)

Goal: a monorepo split with **no behaviour change**, plain JS ES modules with JSDoc, no file over ~400 lines, Czech UI text untouched.

Written so far:
- Root `package.json` (npm workspaces `shared`, `client`; scripts `dev`, `build`, `test`, `playtest`). `scripts/dev.mjs` doesn't exist yet: it should spawn the client's Vite dev server now, and the server too from Phase 3 on, using `child_process` (no `concurrently`, that would be a new dependency).
- `shared/`: `math.js`, `constants.js` (+`SPAWN`), `items.js`, `recipes.js` (RECIPES + `recipeNeeds` + `findRecipe`), `cooking.js`, `blocks.js` (+`bkey`), `mobs.js` (MOBS defs), `terrain.js` (`terrainH` + `TERRAIN_GLSL` side by side, `groundHeight`, `forest`), `worldgen.js` (`shardAt`, `treeAt(cx, cz, removed)`, `rockAt(cx, cz, removed)`, which returns `{key,x,y,z,s,iron,r,shade}`). Package name `@louka/shared`, with an `exports` map `./*`, so imports look like `@louka/shared/items.js`.
- `client/`: `package.json` (three 0.169.0, vite ^7), `vite.config.js` (`base: './'`), `index.html` (original markup, now loading `src/style.css` + `src/main.js`), `src/style.css` (original CSS verbatim).
- `client/src/core/dom.js` (`$`), `core/runtime.js` (`clock = {gameTime, gameClock}`, `debug = {testMode}`), `save/load.js` (`SAVE_KEY`, `save`, `saveState.resetting`).
- `client/src/render/`: `renderer.js` (renderer, `canvas`, scene, camera, `U`, `shaderUniforms`, resize), `glsl.js` (`NOISE_GLSL`), `textures.js`, `sky.js` (sky/sun/moon/stars/env plus `updateSky(dayTime)` → `{night, day}`, the visual half of the old `updateDay`), `mesh-utils.js` (`lumpy`, `makeInstanced`, `dummy`, `tmpColor`), `pixel-art.js`, `icons.js` (`ICONS`; new: an emoji fallback icon for items without pixel art, so a new item added only in `shared/` doesn't crash), `particles.js` (`sparks`, `debris`), `fireflies.js`.
- `client/src/world/ground.js`.

Still to write. The planned module map below follows the original `index.html` section by section; line numbers refer to the original file:
- `world/grass.js` (cut mask + `cutGrass`, `isCut`, `regrowGrass`, `GRASS_LAYERS`, `grassLayers`; orig. 196–199, 741–867)
- `world/state.js` (`removed`, `blocks`, `crafted`, `placedAny`, `fires` loaded from `save`; orig. 910–914, 1403)
- `world/forest.js` (instanced trunks/blobs/cones/rocks, `rebuildForest`, `forestTrees`, `forestRocks`, `forestColliders`; uses `treeAt`/`rockAt` from shared; orig. 936–1024)
- `world/shards.js` (`shardObjs`, `refreshShards`, `updateShards`; orig. 1026–1064, 2317–2331)
- `world/shrine.js` (`shrineColliders`; orig. 1066–1103)
- `world/blocks.js` + `world/special-blocks.js` (block meshes, `solidAt`, `rebuildBlocks`, `specials`, light pool, `updateLights`, `nearLight`; `buildSpecial` goes in special-blocks.js, which `shared/blocks.js` already refers to; orig. 1105–1209)
- `world/day.js` (`time = {dayTime, dayCount}`, `updateDay(dt)` advancing time + the night/dawn toasts, then calling `updateSky`; orig. 2333–2377)
- `audio/sound.js` (orig. 1255–1333)
- `inventory/inventory.js` (inv, `countItem`, `insertInto`, `addItem`, `removeItem`, `consumeSelected`, `heldStack`; orig. 1335–1369)
- `inventory/crafting.js` (`ui` state incl. `ui.open` replacing `invOpen`, `container`, `fireOf`, `slotClick`, `takeResult`, `returnGrid`, `fillRecipe`, `fillCooking`, `updateFires`; orig. 1400–1405, 1511–1611, 1653–1671)
- `inventory/inventory-ui.js` (`slotHTML`, `renderHotbar`, `renderCraftArea`, `renderBook`, `renderInventory`, tooltip, mouse handlers, `openInventory`, `closeInventory`, "Nový svět"; orig. 1398–1510, 1613–1651)
- `player/player.js` (player object from save/SPAWN, `collidesBlocks`, `moveAxis`, `playerIntersects`, `updatePlayer`; orig. 1673–1680, 1714–1786)
- `player/controls.js` (keys, input, `isLocked`, all listeners; orig. 1681–1712)
- `render/held-item.js` (holder, `buildHeld`, `updateHeldModel`, swing; orig. 1788–1876)
- `player/targeting.js` (`raycastBlocks`, `pickTarget`; orig. 1878–1956)
- `player/interaction.js` (outline/ring/preview, state object `{target, swingCd, useCd}`, `updateInteraction`, `breakTarget`, `useItem`; orig. 1958–2098)
- `player/survival.js` (`damagePlayer`, `die`, `updateSurvival`; orig. 2282–2316)
- `mobs/mob-models.js` (`buildMob`; orig. 2107–2152) and `mobs/mobs.js` (spawn/remove/hit/kill, `updateMobs`, `updateSpawns`; orig. 2101–2106, 2153–2280)
- `ui/hud.js` (compass, `feed`, `toast`, `updateHUD`, `hud.vignette`; orig. 2379–2419, 2442–2460) and `ui/tips.js` (orig. 2421–2440)
- `save/save.js` (`saveGame`, 10 s interval, `beforeunload`; orig. 2462–2473)
- `main.js` (imports in the original scene order, `tick`, `frame`, start-up calls, `window.game` with a `testMode` getter/setter mapped to `debug.testMode`; orig. 2475–2549)

Rules for the split: shared mutable state lives in exported **objects** (ES module `let` bindings can't be reassigned from other files). Import cycles are fine only for calls inside functions, never for top-level use. Keep `SAVE_KEY 'rise-svet-v2'` so old saves still load.

Then:
1. `npm install`, `npm run build`, then `node tests/playtest/playtest.mjs client/dist` must show 60/60. Also run `vite` dev and click through by hand if possible.
2. Decide with Richard what happens to the root `index.html`. It's the current GitHub Pages game. Recommendation: keep it until the Pages deploy from `client/dist` works, then remove it in a separate commit (it counts as deleting original content, so ask).
3. Open the Phase 1 PR with the tree, line counts per file (`wc -l`), and the play-test result.

## Phases 2–4 (planned design, see SETUP-PROMPT.md for the full list)

**Phase 2: the state layer.** Recommended design: put the authoritative game logic in `shared/game/`: world state (seed, removed set, blocks, fires, day clock, cut grass events), player states (pos, inventory slots/cursor/craft grid, hp, hunger, crafted/placedAny), mobs simulation, and actions (`placeBlock`, `breakBlock`, `fellTree`, `mineRock`, `cutGrass`, `pickShard`, inventory ops `slotClick`/`takeResult`/`fillRecipe`/`fillCooking`, `eat`, `hitMob`). Single-player ("offline mode") runs that same Game in the browser through an in-memory transport. The Node server in Phase 3 runs the identical code over WebSocket. Rendering only reads state and applies deltas. The client predicts inventory ops by running the same shared function locally, and the server's snapshot wins. Mining progress (holding LMB) stays client-side; the server validates reach, tool tier and rate. Player position is client-authoritative with a server speed sanity check. Mob and tree colliders: add a shared `collidersNear(x, z)` that queries `treeAt`/`rockAt` cells plus the shrine, so the server needs no render lists. Offline mode keeps the single-player pause while the inventory is open. Save keeps working from localStorage (migrate the v2 format).

**Phase 3: multiplayer.** `server/` (Node + `ws`, port 8787, `ROOM_PASSWORD` env, ~20 Hz tick), `shared/protocol.js` (documented JSON messages: join, snapshot, deltas, actions, moves, mob updates, join/leave, hurt/respawn, errors). Also: join screen (name + password, Czech), other players as avatar + name tag with interpolation, reconnect with the same name restores state, auto-reconnect message "Spojení ztraceno — připojuji znovu…", join/leave messages in the corner, JSON persistence every 30 s and on SIGINT/SIGTERM, daily backups (keep 7), `VITE_SERVER_URL` defaulting to `ws://localhost:8787`. Optionally the server can also serve `client/dist` so one VPS hosts everything. Test with ≥3 headless Node clients and report bytes/s per player.

**Phase 4: CI, hosting, collaboration.** GitHub Actions: on PR run install, build, `npm test` (node:test unit tests for recipes, world actions, protocol validation) and a Playwright smoke test (game loads, no console errors; launch Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader`). On merge to `main`, deploy `client/dist` to Pages (enable via `gh api -X POST repos/Richard-Vesely/louka/pages -f build_type=workflow`). Also: `.devcontainer/`, `CLAUDE.md` + `AGENTS.md`, Czech `CONTRIBUTING.md`, issue templates (bug / nový nápad), 15+ issues labelled `dobrý první úkol` from brief section 6 (each with goal, files to touch, how to test), `docs/HOSTING.md` (VPS-first, see above), `README.md`. Set branch protection on `main` via API if possible (required CI; enforce_admins off); otherwise list the settings for Richard.

**Final:** prove "add an item + recipe by editing only `shared/`", walk the Definition of Done in V1-BRIEF.md with ✅/❌ and reasons, and list what's left for V1.1.

## Related outside the repo

- The club's wish log ("Kniha přání", a Claude artifact owned by Richard) is where kids record ideas: https://claude.ai/artifact/DH5tpcacHotwUqArPSUTw2. Good source for future issues, but don't depend on it.
