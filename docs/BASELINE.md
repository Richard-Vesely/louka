# Baseline — what the original game does today

This is the regression checklist for the V1 work. It describes the single-player prototype
(`index.html`, commit `4be82cf`) **before any changes**. After every phase, everything below
must still work.

How it was checked (14.10.2026):
- An automated play-test (`tests/playtest/playtest.mjs`) drives the real game in headless
  Chromium through the `window.game` debug API. **60/60 checks passed** on the original.
- The checks cover gameplay logic and UI state. They do not judge looks (graphics, sound),
  so those items are marked "manual" below and need a human eye.

## Controls

> **Changed on purpose (Minecraft controls, branch `v1-controls`):** sprint moved from Shift to
> **Ctrl or double-tap W**, and Shift is now **sneak**, as in Minecraft. The play-test checks sprint with
> Ctrl. Everything else below still holds. The new controls have their own test: `tests/playtest/controls.mjs`.

| Key / button | What it does | Checked |
|---|---|---|
| Click into the game | Locks the mouse (pointer lock), starts sound | manual |
| Mouse | Look around | manual |
| W A S D / arrows | Walk | ✅ auto |
| Shift | Run (only when hunger > 5) | ✅ auto |
| Space | Jump | ✅ auto |
| Left button (hold) | Mine / chop / cut grass / attack | ✅ auto |
| Right button | Place block, eat, open workbench / campfire | ✅ auto |
| E | Open / close inventory | ✅ auto |
| Esc | Close inventory | manual |
| 1–9, mouse wheel | Choose hotbar slot | ✅ auto (keys) |
| Inventory: click | Take / put / swap / merge stack | ✅ auto |
| Inventory: right click | Take half / put one | ✅ auto |
| Inventory: Shift+click | Quick move (bag ↔ hotbar, into campfire) | ✅ auto |
| Recipe book: click (Shift = many) | Lays ingredients into the grid | ✅ auto |
| "Nový svět" button | Deletes the save and reloads (with confirm) | manual |

## World

- [x] Heightmap terrain from `terrainH` (same formula in JS and GLSL); flat shrine floor in the middle.
- [x] Shrine with pillars (they collide), portal ring, safe zone (radius ~11 m).
- [x] Forests (oaks, spruces) from hashed cells (`treeAt`), rebuilt around the player every 24 m.
- [x] Boulders and rusty iron-ore boulders (`r` cells).
- [x] Light shards (`shardAt`) with beams; the compass shows the nearest one with distance.
- [x] Grass (2 layers, ~250k blades) with flowers and wind; cut grass regrows over a few minutes.
- [x] Fireflies at night (manual).
- [x] Day/night: `DAY_LENGTH` 480 s, night runs twice as fast. Sky, sun, moon, stars, fog colours (manual).
- [x] Toasts: "Padá noc… stínožrouti se probouzejí", "Svítá – den N".

## Player and survival

- [x] Health and hunger bars (start at 100).
- [x] Hunger drops over time (faster when running); at 0 you lose health.
- [x] Health regenerates when hunger > 30 and not hurt for 4 s.
- [x] Eating: berries +8, raw meat +6, cooked meat +35 food and +10 health. "Nemáš hlad" when full.
- [x] Death: "Padl jsi…" fade, respawn at the shrine with full health after ~2.6 s: "Svatyně tě přivedla zpět".
- [x] Red vignette when hurt (manual).

## Gathering and tools

- [x] Chop trees (hand works, axe is faster): logs, sometimes sticks and berries. Tree disappears.
- [x] Mine boulders with a pickaxe ("Potřebuješ krumpáč" without one): stone.
- [x] Iron ore needs a stone pickaxe ("Potřebuješ kamenný krumpáč"): iron ore + stone.
- [x] Cut grass: fiber, sometimes berries.
- [x] Tool tiers: wood 2×, stone 3.5×, iron 6×, crystal 7× speed (`TOOL_SPEED`).
- [x] Pick up light shards by walking into them: "Úlomek světla!".

## Crafting and cooking

- [x] Inventory: 27 bag slots + 9 hotbar, stacks of 64 (tools 1, campfire/workbench 8).
- [x] 2×2 crafting grid in the inventory; 3×3 at a workbench.
- [x] All 16 recipes: planks, stick, workbench, torch, bricks, campfire, wood/stone/iron pick, axe, sword, crystal sword.
- [x] Recipe matching ignores position in the grid and accepts mirrored shapes.
- [x] Recipe book: greyed when missing ingredients, "Jen co můžu vyrobit" filter, ghost items + "Chybí ti suroviny".
- [x] "Tento recept potřebuje pracovní stůl" for 3×3 recipes in the 2×2 grid.
- [x] Tooltips with name, tier, damage, food values.
- [x] Campfire: cooks raw meat → meat, smelts iron ore → iron, 4 s each, also while the window is closed.

## Building

- [x] Place blocks (planks, stone/cobble, bricks, torch, campfire, workbench) with right click; preview outline.
- [x] Stack blocks on blocks; cannot place a solid block inside yourself.
- [x] Blocks collide; walls stop the player.
- [x] Break blocks (cobble/bricks need a pickaxe); the block drops back. Breaking a campfire returns its contents.
- [x] Torches (light 8) and campfires (light 20) light the night and keep stínožrouti away.

## Creatures

- [x] Sheep (flee when hit, meat + wool), boars (fight back when hit, meat), stínožrouti (night only, hunt you, essence).
- [x] Stínožrouti avoid the shrine and lights, burn in daylight.
- [x] Mobs spawn 35–60 m away, despawn beyond 120 m.

## HUD

- [x] Clock "Den N · HH:MM", tip panel with 9 progression tips ("✔ Splněno" when done).
- [x] Compass with S/V/J/Z, shrine ◆ and nearest shard ✦ with distance.
- [x] Item feed in the corner (+N item), toasts, target label under the crosshair with hints.
- [x] Mining progress ring.
- [x] Intro screen "ŘÍŠE" on first visit only.

## Saving

- [x] Saves to `localStorage` key `rise-svet-v2` every 10 s and on page close.
- [x] Reload restores inventory, position, health, hunger, time, placed blocks, felled trees, fires, progress.

## Known quirks of the original (kept as they are)

- Time stops while the inventory is open or the mouse isn't locked (single-player pause).
- Grass cuts are not saved (they regrow anyway).
- Mobs are not saved.
