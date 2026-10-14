# Louka Multiplayer — V1 Brief

**Who:** AI coding club, 5 kids aged 10–14, lektor Richard.
**What:** A multiplayer survival/building game in the browser, built on the existing single-player prototype *Louka / Říše* (https://github.com/aimartinmarek-afk/louka).
**Why V1 exists:** to turn a one-file prototype into a shared project that five kids can extend in parallel, and that friends can play together by opening a link.

---

## 1. V1 in one sentence

Up to 6 players open one link, type a name and the club password, and play in the **same persistent world**: they see each other, break and place blocks, chop trees and survive the night together — and the world is still there next week.

## 2. Must have (V1 is not done without these)

### Gameplay — kept from the prototype
Everything that works today still works, and feels the same:
- Terrain, forests, rocks, grass cutting and regrowth
- Day/night cycle and the *stínožrouti* at night
- Health, hunger, eating
- Inventory, hotbar, crafting grid, recipe book, cooking on fires
- Tool tiers, mining, attacking, placing and breaking blocks
- Czech UI text

### Multiplayer
- **Join screen:** player name + room password. No accounts, no emails.
- **Shared world:** same seed for everyone; placed/broken blocks, felled trees and fires are visible to all players within ~0.2 s.
- **Other players visible:** simple avatar with name tag, smooth movement (interpolated).
- **Server decides:** the server validates block changes (in reach, has the item) — a modified client can't wreck the world.
- **Mobs are server-controlled**, so every player sees the same stínožrout in the same place.
- **Per-player state on the server:** inventory, health, hunger, position — reconnecting with the same name restores it.
- **Persistent world:** saved to disk on the server; survives a server restart.
- **Join/leave messages** in the corner. **No free chat in V1** (safety); optional preset emotes/quick messages.
- **Graceful disconnect:** "Spojení ztraceno — připojuji znovu…" and automatic reconnect.

### Code & project structure
- Code split into small ES modules; **no file over ~400 lines**.
- `shared/` folder used by both client and server: item, block, recipe and mob definitions.
- **Adding a new item, block, recipe or mob = editing data in one place**, not touching engine code.
- Plain JavaScript (ES modules) with JSDoc comments — readable for 10-year-olds and their AIs.
- Vite for the client, Node.js + `ws` for the server. `npm install && npm run dev` starts both.

### Collaboration
- `CLAUDE.md` / `AGENTS.md`: architecture map, rules, "how to add an item/mob", what not to touch.
- `CONTRIBUTING.md` in simple Czech: branch → small change → pull request → review.
- Issue templates (bug, new feature) and **15+ starter issues** labelled `dobrý první úkol`.
- `main` protected; CI on every PR: build passes, tests pass, game loads without console errors.
- Works in GitHub Codespaces with zero setup.

### Hosting
- Client auto-deploys to **GitHub Pages** on every merge to `main`.
- Server runs **free**: on the lektor's laptop during club + Cloudflare Tunnel, documented step by step.
- Server URL configurable (one env/config value) so moving to a cheap VPS later is a one-line change.
- `README.md`: how to play, how to run locally, how to host a session.

## 3. Should have (nice for V1, OK to slip to V1.1)
- Player list (Tab key) with ping
- Simple admin commands for the lektor (`/tp`, `/give`, `/time`, kick) behind an admin password
- Daily automatic world backup (keep last 7)
- Player skins: pick a colour/hat on the join screen
- Mobile/tablet-friendly join screen (gameplay stays desktop)

## 4. Explicitly NOT in V1
- Accounts, logins, email
- Public servers or server browser
- Free text chat
- Infinite voxel terrain / digging into the ground (terrain stays a heightmap)
- Realistic Hytale-level graphics overhaul
- Custom 3D models pipeline (Blender) — later

## 5. Definition of done (checklist)
- [ ] Two browsers on different computers play together via the public GitHub Pages link
- [ ] Block placed by player A appears for player B; restart server → block still there
- [ ] Player B disconnects and rejoins → same inventory and position
- [ ] All prototype features from section 2 work in multiplayer
- [ ] 6 players for 15 minutes without noticeable lag on the lektor's laptop
- [ ] A new item + recipe can be added by editing only `shared/` (proven by doing it)
- [ ] CI green, Pages deploy green, `CLAUDE.md` and Czech `CONTRIBUTING.md` written
- [ ] 15+ starter issues created
- [ ] Hosting guide tested end to end once

## 6. Suggested first issues for the kids (after V1 core)
New ore + tool tier · new animal (passive) · new night mob · new food & cooking recipe · new decorative block · torches that light the night · weather (rain) · sound effects · player emotes · sign block with text · chest block (shared storage) · door block · fishing · map/compass item · boss on full moon
