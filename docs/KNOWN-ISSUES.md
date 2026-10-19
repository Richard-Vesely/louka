# Known issues

Things that are not right yet. v2 kept Marek's behaviour on purpose ("parity first"); only what blocked the server was
changed. Pick one, open an issue, fix it in a small PR (ask Richard for anything in the core files, see AGENTS.md).

## Multiplayer (all hosts)
- **Players are trusted.** The host accepts every world edit (`ops`), every small-map value (`kv`: chests, machines, cars…),
  and each player's own position, health and backpack. A modified browser could cheat or wipe chests.
  Creative edits from players without permission are refused, nothing else is checked.
- **Small maps: last change wins.** Two players changing the same chest or machine within about half a second can lose
  one change. (v2 fixed the common case where a player's own fresh change hid another player's change.)
- **Shards and printed papers can be picked up twice** when two players grab them at the same moment
  (pick-up is decided by each player, not the host; dropped items already go through the host).
- **Two players can get into one car** at the same moment (the driver check is done by each player).
- **Machine credit:** when any machine finishes (campfire, furnace, stove…), the *host's* tips progress counts it.
- **Trap loot:** a mob killed on spikes with no chest nearby gives its loot to the host if the host is within 24 m,
  otherwise the loot is lost (always lost on the Node server).
- **Animal sounds** play only for the host (joined players don't hear mobs).
- **Chat is free text** (kept from Marek's version; Richard decides whether it stays).

## Node server
- No admin tools yet: no kick/ban, no way to give creative to one player (only `ALLOW_CREATIVE=1` for everyone).
- No rate limiting of messages; the password is the only protection. Use a password on a public server.
- Each player's backpack lives in their browser (keyed by the server address): another device or cleared browser data
  means an empty backpack. The world itself is on the server.
- A new player gets the whole world in one message (fine for club-sized worlds).
- When nobody is online, mobs are removed; machines, crops and the day keep running.

## Single player and drawing
- **Items can disappear when the backpack is full:** closing the inventory with items in the crafting grid or on the cursor,
  or refilling the campfire from the recipe book (`returnGrid`, `closeInventory`, `fillCooking`).
- **Grass cut mask repeats every 128 m** and the **dug-hole mask every 512 m** (shader textures wrap): cut grass or a hole can
  also show up 128/512 m away.
- Terrain height exists twice (JavaScript `shared/world/terrain.js`, GLSL `client/src/render/glsl.js`); they must be changed together.
- `ITEMS[x].icon` (emoji) and `TIER_COLOR` are unused leftovers.

## Project
- The VPS setup (`deploy/`) is written but not yet run on a real VPS; the Cloudflare tunnel for a laptop is not tested.
- GitHub Pages deploy needs v2 merged into `main` and Settings → Pages → Source = GitHub Actions.
- `playwright` 1.55.0 (dev only) has an advisory about browser downloads; update it when convenient (`npx playwright install` after).
- The PeerJS mode depends on the public broker `0.peerjs.com`; its CI test is allowed to fail.

## Changed in v2 (on purpose)
- Structure guards (Markomen at ruins and fortresses) are spawned only by whoever holds the world; before, joined players
  also created local "ghost" Markomen that never moved.
- A joined player no longer loses another player's chest or machine change that arrives right after its own change.
- Mobs collide with trees and rocks around themselves (before: only those near the host's own player; same result in practice).
- The touch-button size setting applies at once (before: one change late), because settings now load first.
