You are setting up a multiplayer game project for a kids' AI coding club (5 kids, ages 10–14, lektor Richard). Work carefully and in phases; stop at each CHECKPOINT and show me what you did before continuing.

## Context
- Source prototype: https://github.com/aimartinmarek-afk/louka — a single-player browser survival game "Říše" in ONE `index.html` (~2,500 lines). Three.js 0.169 from a CDN, no build step, saves to localStorage. Czech UI.
- It has: heightmap terrain from noise (`terrainH`, `groundHeight`), procedural trees/rocks/shards from hashed cells (`treeAt`, `rebuildForest`), cuttable regrowing grass, day/night (`DAY_LENGTH`), night mobs "stínožrouti", health/hunger, inventory + hotbar + crafting grid + recipe book, cooking on fires, tool tiers, placing/breaking blocks. Data tables: `ITEMS`, `RECIPES`, `BLOCKS`, `COOKING`, `TIER_COLOR`, `TOOL_SPEED`.
- It is NOT a voxel world. Keep the heightmap + placed blocks design.
- The target for this work is in `docs/V1-BRIEF.md` (I'll paste it below / it's attached). Read it first and treat it as the definition of done.

## Phase 0 — Fork and set up
1. Fork the repo into the club's GitHub org/account (ask me for the target name if `gh` isn't authenticated or you don't know it). If forking isn't possible, create a new repo and copy the history.
2. Add `docs/V1-BRIEF.md`. Create a branch `v1-setup` and work there; open a PR at the end of each phase.
3. Before changing anything, play-test the original: run it locally, note in `docs/BASELINE.md` every feature and control that works today. This is the regression checklist.
**CHECKPOINT 0.**

## Phase 1 — Split into modules (no behaviour change)
- Monorepo with npm workspaces:
  ```
  client/   Vite app (index.html, src/…)
  server/   Node.js + ws
  shared/   items, blocks, recipes, cooking, mobs, constants, terrain/noise functions, protocol message types
  docs/
  ```
- Plain JavaScript ES modules with JSDoc. No TypeScript, no frameworks, no React. Code must be readable for a 10-year-old with an AI helper.
- Client modules roughly: `world/` (terrain, forest, grass, blocks), `render/` (scene, sky, lights, particles, held item), `player/` (movement, collision, interaction, swing), `inventory/`, `ui/`, `mobs/`, `net/`, `main.js`. No file over ~400 lines.
- Move all data tables and pure functions (noise, `terrainH`, `treeAt`, recipe matching) into `shared/` so server and client use the exact same code.
- Install Three.js 0.169 from npm instead of the CDN.
- Keep ALL Czech text. Keep gameplay identical — walk through `docs/BASELINE.md` and confirm each item.
**CHECKPOINT 1:** show the new tree, line counts per file, and the baseline check results.

## Phase 2 — Separate game state from rendering
- Introduce a `WorldState` (seed + list of changes: placed blocks, broken blocks, felled trees, fires, dropped items) and a `PlayerState` (position, inventory, health, hunger).
- All gameplay changes go through actions like `placeBlock`, `breakBlock`, `fellTree`, `craft`, applied to state; rendering only reads state.
- Single-player still works locally through this layer (this is the "offline mode" and a good test).
**CHECKPOINT 2.**

## Phase 3 — Multiplayer
- `server/`: Node.js + `ws`, authoritative. Holds the seed, world changes, all player states, mobs, and the day/night clock. Tick ~20 Hz.
- Protocol: small JSON messages defined in `shared/protocol.js` (join, state snapshot, deltas, input/actions, player moves, mob updates, join/leave). Keep it simple and documented.
- Join screen: name + room password (from server env `ROOM_PASSWORD`). No accounts, no free chat.
- Server validates actions (reach, has item, recipe valid). Mobs simulated on server.
- Other players: simple avatar + name tag, interpolated movement.
- Reconnect with same name restores that player's state. Auto-reconnect on drop with Czech message.
- Persistence: world + players saved to a JSON file every 30 s and on shutdown; loaded at start. Daily backup is a bonus.
- Client reads server URL from `VITE_SERVER_URL`; default `ws://localhost:8787`.
- Test with at least 3 headless/simulated clients; measure bandwidth per player and tell me the number.
**CHECKPOINT 3.**

## Phase 4 — Hosting, CI and kid-friendly collaboration
- GitHub Actions: on PR → install, build, run tests, Playwright smoke test that the game loads with no console errors. On merge to `main` → deploy client to GitHub Pages.
- Tests: unit tests (node:test) for recipes, world-state actions, protocol validation.
- `docs/HOSTING.md`: step-by-step for Richard to run the server on his laptop during club and expose it with a free Cloudflare Tunnel (wss), plus how to move to a cheap VPS later. Test the steps you can.
- `.devcontainer/` so it runs in GitHub Codespaces with one click.
- `CLAUDE.md` (also symlink/copy as `AGENTS.md`): architecture map, data flow, the rules (small PRs, keep Czech UI, data in `shared/`, never edit the protocol without updating both sides, don't touch these core files without asking), and recipes for "how to add an item / block / recipe / mob".
- `CONTRIBUTING.md` in simple Czech for kids: branch → small change → test → PR → review.
- Issue templates (bug / nový nápad). Create 15+ starter issues labelled `dobrý první úkol` from section 6 of the brief, each with: goal, which files to touch, how to test.
- Tell me which repo settings I must set by hand (branch protection on `main`, Pages source = Actions) if you can't set them yourself.
**CHECKPOINT 4.**

## Final
- Prove the "adding content" rule: add one new item + recipe by editing only `shared/`, then revert or keep it as an example.
- Go through the Definition of Done checklist in `docs/V1-BRIEF.md` and report each item as ✅ / ❌ with a reason.
- Summarise what's left for V1.1.

## Rules for you throughout
- Ask me before: deleting anything from the original, changing gameplay balance, adding a dependency beyond Three.js, Vite, ws, Playwright.
- Commit small and often with clear messages.
- If something in the brief conflicts with the existing code, stop and ask rather than guess.
