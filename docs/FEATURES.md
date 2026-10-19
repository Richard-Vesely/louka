# Říše: what the game can do (feature list)

The full list of features in *Říše* (repo *rise*, formerly *louka*), as of Marek's version `2778d1b` (17.10.2026), plus the v2 server.
Each section ends with *Kód:* = where it lives in the code (rules in `shared/`, the browser in `client/src/`).
It is for AI helpers and kids: read it to know what already exists before adding something, and use it as the
checklist that nothing got lost when the code moves around. Czech names are what players see in the game.

When you add or change a feature, update this file in the same pull request.

---

## 1. Start and menu
- **Main menu "ŘÍŠE"**, made simple for kids, top to bottom: the login line (not logged in: *Tvoje jméno* field;
  logged in on the club server: *Hraješ jako **Ája** · Změnit hráče*), the **world buttons** of the club server, then
  **Hrát sám**, then small links **Nastavení · Další možnosti**. No technical words on the main page. Big buttons, works
  on a phone in portrait and landscape.
- **World buttons** (e.g. *Hlavní svět*, *Kreativní svět*): the list comes from the club server (`GET /worlds`), so a new
  world appears by itself. Each button: the big name, players n/max (full worlds are disabled; counts refresh every 15 s)
  and one line about the world: survival *Přežij a stav spolu s ostatními z kroužku*, creative *Stav bez omezení, všechno
  máš hned*. While loading: *Načítám světy…*; when the server can't be reached: *Svět teď není dostupný, zkus to za chvíli
  nebo hraj sám.* (everything else still works). The club server is the page's own server (game served by `npm start`),
  a `?server=<address>` link, or the build's `VITE_SERVER_URL`; without one there are no world buttons.
- **Hrát sám** (*Jen ty, svět se uloží v tomhle prohlížeči*): single player, world saved in the browser.
- **Heslo kroužku (řekne ti ho Richard)**: the first click on a world asks for the club password once (only if the
  server has one) and remembers it per server address (`rise-heslo`). A wrong password: *Špatné heslo. Zkus to znovu.*,
  the stored one is forgotten and the menu asks again. The last chosen world is highlighted; a `?world=<id>` link
  highlights and focuses one (Enter joins).
- **Player login on the club server** (*Kdo hraje?*): the first time on a device, the name (prefilled) and a **PIN
  (4 číslice)** the kid makes up: *Zapamatuj si ho, s ním se dostaneš ke svému batohu i na jiném počítači.* A new name
  creates the player, a known name needs its PIN. Then the browser remembers the login and never asks again;
  *Změnit hráče* forgets it. Messages: wrong PIN or name taken (*Špatný PIN, nebo jméno „Ája“ už má někdo jiný…*, with
  the tries left), too many tries (*Moc špatných pokusů. Počkej 1 min…*), a bad name (2–16 characters, not *Hráč*).
  The **backpack, armor, position and health are kept on the server** per player and world, so they come back on any
  computer. Logging in somewhere else closes the older game with *Přihlásil ses jinde.* An old backpack saved in this
  browser before profiles is taken over once.
- **Další možnosti**: **Vytvořit hru na svém počítači** (*Kamarádi se připojí kódem, který uvidíš. Nech hru
  otevřenou.*; the host in the browser): option *Povolit kamarádům kreativní režim*; you get a code like `LOUKA-7K2F`
  (the same code next time). Max 6 players. **Připojit se ke kamarádovi kódem**: type the friend's code (just the 4
  characters is enough).
- After leaving a multiplayer game the menu shows why (e.g. *Spojení se přerušilo. Zkus se připojit znovu.*).
- **Nastavení**: graphics quality (auto by graphics card/low/medium/high), controls (auto/touch/mouse), touch button size, mouse sensitivity.
- **Intro screen** on the very first start; **Návod** (H) is a long in-game help text that explains every system.
- **Tips** (*Rada*, 14 steps) guide a new player: chop a tree, craft, build, find shards, wake the shrine…

*Kód:* `index.html` (menu, Návod text), `client/src/menu/menu.js`, `client/src/menu/settings.js`, tips in `client/src/ui/hud.js`.

## 2. World
- **Endless terrain** with smooth hills and a **voxel underground** (1 m blocks down to bedrock at y = −48).
  The world is the same for everyone (no seed): it is computed from coordinates.
- **Biomes** (name shown next to the clock): meadow and forest, cherry grove, jungle, savanna, desert, tundra,
  mushroom forest, volcano (lava in the crater hurts).
- **Trees** per biome (oak, spruce, cherry, jungle, snowy spruce, acacia, dead tree/bush, cactus, giant mushroom)
  and **boulders** (16 % with iron).
- **Grass** you can cut (fiber, seeds, berries, potatoes, rice near water, flowers); it grows back in ~2 minutes.
- **Ponds** with water (fishing, slows vehicles), fireflies at night.
- **Underground**: caves (tunnels and domes), rock layers (stone, granite, marble, basalt, sandstone, obsidian),
  ores in nests: coal, iron, copper, gold, quartz, crystal, markorite (Mark dimension only).
  No digging within 10.5 m of a shrine.
- **Day and night**: a day is 8 minutes, nights run twice as fast. Sun, moon, stars, fog.
- **Light shards** (*Úlomky světla*): glowing crystals with a light beam, scattered far apart. Walk into one to collect it.
- **Shrine** (*Svatyně*) at the start. Bring **3 shards** and right-click the portal to wake it (*Svatyně se probudila!*).
  The portal leads to the **Mark dimension** (*Markova dimenze*): purple sky, markwood, markorite, markomen, golems.
- **Structures** with chests and loot: ruins, Markoman fortress, watchtower, abandoned camp, dungeon (underground,
  with a spawner), desert pyramid, jungle temple, igloo, cherry pavilion, savanna hut, mushroom house, obsidian altar.
  The compass shows the nearest unexplored one.

- **Graphics look „Jasná budoucnost“** (`client/src/render/look.js`): realistic light on clean, softly stylised shapes;
  lush nature; only technology glows in saturated colours. Fixed light colours: cyan = electricity and tech, warm
  white/amber = fire, magenta/violet = Mark dimension, green = OK status lights. Nothing in the playable area is pure
  black (nights and caves are dark but readable). All look numbers can be tuned live in the console (`game.LK`).
  - **Grafika Automaticky** picks the tier from the graphics card (`client/src/game/gpu.js`): separate card → *vysoká*,
    integrated (Intel, AMD Radeon Graphics, Apple) → *střední*, software WebGL (CI) or touch device → *nízká*.
    The Settings window shows what Automaticky chose.
  - **Day and night**: golden hour with long warm shadows, a **sunset** with an orange-to-pink horizon and violet sky
    (about 17:00–19:30), stars only after dusk, a moon that lights the land in cool blue and casts shadows, fireflies
    that pulse gently. Sky light fills shadows (about a third of the sun) so shadows are never black.
  - **Weather** (`shared/sim/weather.js` decides it from the day number and time, so every player sees the same sky;
    nothing is sent or saved): rain with streaks and splashes, wet darker ground and **puddles** that reflect the sky
    and ripple, grey overcast sky and thicker air, **thunderstorms** with lightning bolts, a flash and thunder delayed by
    distance, and **foggy mornings** in valleys. Day 1 of a new world is always clear. Messages: *Začíná pršet*,
    *Blíží se bouřka – schovej se!*, *Přestalo pršet*. Rain noise and drops are synthesised (`render/weather.js`).
    Console: `game.setWeather({ rain: 1, storm: 1 })` (this browser only), `game.setWeather(null)` back to the rules.
  - **Fire light** (torches, campfires, lanterns) is warm white (~3000 K) and flickers 2–3× a second; green grass stays
    green under it. Campfires and torches give off **embers and thin smoke** that the wind carries. Electric lamps light
    cool white. Glowing mushrooms light cyan, spawners violet.
  - **Wind**: one shared wind (`U.wind`) bends grass, sways tree crowns and reeds, slants rain and carries smoke; gusts
    roll across the land as waves and get stronger in rain and storms.
  - **Trees**: smooth crowns, **leaf clusters** around crowns near the player (střední/vysoká), light through the crown
    edge against the sun, pines and spruces in drooping branch tiers, bark relief and darker trunk feet.
    **Grass** has yellow-green patches and ~5 % small yellow, white and violet flowers.
  - **Ponds**: turquoise at the shore, deep teal in the middle, reflect more sky at grazing angles, small sun
    **sparkles** instead of one glare spot, broken foam only where ripples meet the shore, an uneven edge, **reeds,
    cattails and stones** along the real shoreline and a band of dark wet soil. Rain ripples the surface.
    **Under water** the view turns short and blue-green.
  - **Caves**: cool blue-grey cave air against warm torch light, every block edge is darkened so blocks always read,
    **crystal and markorite ore light the stone around them**, dust drifts in torchlight, and the eyes adapt
    (brighter after a moment underground).
  - **Mark dimension**: darker violet sky, violet fog, a large cyan-and-magenta **aurora**, nights tinted violet instead
    of blue, and slow floating motes of light. The tundra gets a green aurora at night.
  - **Light-shard beams** are a landmark: brighter by day so they stay visible against the sky.
  - **Powered cables** show their metal (copper, gold) and carry **cyan pulses**; faster pulses = more power used.
  - **Grafika: střední / vysoká** draw through a post-processing chain (`client/src/render/post.js`, `postprocessing`
    + `n8ao`): HDR; sun/moon **shadows** (`shadows.js`: one map that follows the player, 20–30 updates per second; near
    trees cast shadows through invisible copies); **height fog coloured by the sky** in the view direction (bluer away
    from the sun, warmer toward it) plus a distant lighter mountain ridge; **bloom** on lights, lava, crystals and neon;
    AgX tone mapping with hue protection (no orange-to-red shift), cool shadows and warm highlights, moonlit blue
    nights; **eye adaptation** (up to +0.8 EV at night, +1.2 EV in caves, over ~1.5 s); **clouds** lit by the sun with
    pink undersides at sunset; **normal maps** on blocks and cave walls.
    - *vysoká*: MSAA 2×, sun **shafts** (16 steps, only when looking toward the sun), 2048 px shadows and **ambient
      occlusion** (N8AO, half resolution) on a separate graphics card; 1024 px shadows and no AO on integrated graphics.
    - *střední* (the club laptops): 1024 px shadows, no AO or shafts, FXAA instead of MSAA.
    - **Dynamic resolution** drops to 60–70 % when a frame takes over ~18 ms and comes back when there is headroom.
      With a window open (backpack, computer, guide) the world behind it renders at half resolution without AO.
  - **Grafika: nízká** stays as cheap as before (no composer, no shadows, ACES); it still gets the warm-white fire light,
    wind, weather, dusk sky, simple water, reeds, embers, cave edges and ore light. CI renders with it.
  - Screenshots for comparing graphics: `node tests/playtest/shots.mjs dist <out> [--quality low|medium|high|auto]
    [--perf] [--views all]` (8 fixed views at 1600×900, `--views all` adds golden hour, night, rain, dawn fog and the
    Mark dimension; `--perf` writes ms per frame).

*Kód:* terrain and biomes `shared/world/terrain.js` (+ GLSL twin `client/src/render/glsl.js`), underground `shared/world/voxels.js`, trees/rocks/shards/ponds `shared/world/nature.js`, structures and loot `shared/world/structures.js`, day clock `shared/sim/day.js`; drawing in `client/src/render/` (`ground`, `grass`, `forest`, `shards`, `vox-mesh`, `sky`, `daylight`; looks `look.js`, post-processing `post.js`, shadows `shadows.js`, clouds `clouds.js`, water `water.js`, light shader bits `light-glsl.js`, weather `weather.js`, embers/smoke/dust `ambient-fx.js`), shrine and portal `client/src/world/shrine.js`.

## 3. Player
- **Survival**: health ❤️, hunger 🍗 (drops faster when running), armor 🛡. Starving hurts; full stomach heals.
  Death: *Padl jsi…*, you respawn at the shrine.
- **Creative mode** (C): fly (double-tap Space), instant breaking, all items. In multiplayer only if the host allows.
- **Movement**: walk, run (Shift), jump, step up blocks and stairs, sit on chairs.
- **Armor**: helmet, chestplate, leggings, boots in iron, crystal, markorite; special sets:
  *Stínové* (shadow: faster, shadow-eaters ignore you) and *Nebeské* (sky: double jump, slow fall, healing; chests only).
- **Mark apple** (*Markojablko*) lets you fly for 10 s.

*Kód:* movement, flying, creative `client/src/player/player.js`, health and hunger `client/src/player/survival.js`, armor data `shared/data/items.js`, armor slots `client/src/ui/inventory-ui.js`.

## 4. Mining, building, items
- **Mining** with hold-to-break and tool tiers: wood → stone → iron → crystal → markorite.
  Axe, pickaxe, shovel, sword (and hoe). Some ores need a better pickaxe (*Potřebuješ…*).
- **Inventory** (*Batoh*, E): 9-slot hotbar + 27 slots, drag, split (right-click), Shift-move, throw out of the window.
- **Drop items** (G one, Shift+G whole stack): they lie on the ground, anyone can pick them up; they vanish after 5 min.
- **Building**: ~110 block types: planks of 5 woods, stones and polished stones, bricks, tiles, glass and panes,
  sandstone, snow, obsidian, mushroom blocks, roof tiles, concrete in 8 colours (from flower dyes), copper,
  gold, steel, quartz, lanterns, torches. **Stairs and slabs** (two slabs make a full block), bars, railings,
  rotation from where you look. Pillar jumping (place under your feet).
- **Crafting**: 2×2 in the inventory, 3×3 at the **workbench** (*Pracovní stůl*), advanced recipes at the
  **workshop** (*Dílna*). ~260 recipes in 12 categories with a recipe book and "only what I can make".
- **Chest** (*Truhla*, 27 slots).
- **Farm traps**: spikes (*Bodce*) hurt mobs; loot of mobs killed on spikes goes to a chest nearby.
- **Mob spawner** blocks in dungeons and fortresses.

*Kód:* mining and placing `client/src/player/interaction.js` + `targeting.js`, backpack `client/src/player/inventory.js`, inventory window and crafting `client/src/ui/inventory-ui.js`, data `shared/data/` (items, blocks, recipes), dropped items `shared/sim/ground-items.js` + `client/src/world/ground-items.js`, spikes and spawners `shared/sim/mobs.js`.

## 5. Food and cooking
- **Campfire** (*Táborák*): roast meat and fish, smelt iron, bake sand into glass, clay into tiles.
- **Stove kitchen** (*Sporák*, cookbook *Kuchařka*): 36 dishes (goulash, schnitzel, dumplings, pizza, pancakes,
  strudel, soups, sushi…). Needs ingredients **and utensils** (pot, pan, knife… they are not used up). Takes time.
- **Fields** (*Pole*): hoe turns grass into farmland; plant wheat, tomatoes, potatoes, rice; 4 growth stages.
- **Animals**: chickens lay eggs (right-click), cows give milk (bucket), well gives water.
- **Fishing** (*Prut*): cast into a pond, wait for *Zabírá!*, right-click fast: trout, salmon, seaweed.
- **Eating**: hold right-click. With **cutlery** (and chopsticks for sushi) you eat bite by bite with an animation
  (twirl spaghetti, cut steak, spoon soup); sitting at a **table** with cutlery gives a bigger bonus.
  Food can be put on a table. Every dish has its own 3D model.

*Kód:* campfire, stove, crops `shared/sim/machines.js` + `client/src/machines/kitchen.js`, recipes `KITCHEN`/`CROPS`/`COOKING` in `shared/data/items.js`, fishing `client/src/world/fishing.js`, eating `client/src/player/eating.js`, table manners and food models `client/src/dining/`.

## 6. Animals and monsters
| | HP | Behaviour |
|---|---|---|
| Ovce (sheep) | 5 | flees when hit; mutton, wool |
| Slepice (chicken) | 4 | flees; eggs |
| Kráva (cow) | 10 | flees; beef, milk |
| Jelen (deer) | 8 | shy, flees; venison |
| Kanec (boar) | 12 | attacks when hit |
| Vlk (wolf) | 14 | attacks at night or when hit |
| Stínožrout (shadow-eater) | 10 | night monster, burns at sunrise, avoids light and the shrine |
| Markoman | 26 | Mark dimension, always hostile, good loot |
| Krystalový golem | 60 | Mark dimension, strong, drops shards and markorite |

Monsters stay away from the shrine; light blocks keep shadow-eaters away.

*Kód:* behaviour, spawning, loot `shared/sim/mobs.js`; models, animation, sounds `client/src/mobs/mobs.js`.

## 7. Technology
- **Furnace** (*Pec*): ores → ingots (iron, copper, gold), quartz → silicon, iron → steel, resin → rubber,
  glass → lens, logs → charcoal; needs fuel.
- **Parts chain**: plates, rods, screws, gears, springs, wires, coils, magnets, LEDs, transistors, chips, CPU,
  engines, gearbox… (categories *Stroje, Elektro, Elektronika, Motory, Vozidla, Letadla, Počítače, Kancelář*).
- **Electricity** (*Elektrická síť*): copper and gold cables, coal generator, solar panel, battery block, switch;
  devices: electric lamp, bulb, motor, electric furnace, charger (charges car batteries), computer, printer.
  Cable capacity limits the power; devices switch off when there is not enough.

*Kód:* furnace `shared/sim/machines.js`, power grid and printer `shared/sim/power.js`, data `shared/data/tech.js`, models and windows `client/src/machines/furnace.js` + `power.js`.

## 8. Vehicles
- **Car** (*Auto*): place it, fill fuel (canister), put in a charged car battery, F to get in. Drive with WASD,
  Space handbrake, L lights, B horn, V camera. Trunk with 18 slots. Hits animals and monsters.
- **Biplane** (*Dvouplošník*): needs flat ground to place. Throttle Space/Shift, pitch W/S, roll A/D; stall if too slow;
  crash landing hurts.

*Kód:* `client/src/vehicles/car.js`, `client/src/vehicles/plane.js` (state in `vehicles`, `shared/world/state.js`).

## 9. Computer and documents
- **Computer** (*Počítač*, OS *ŘíšeOS*): needs power. Desktop with windows, start menu, clock.
  Apps: **Tanky 2D** (tank game vs. AI or 2 players), **Textový editor**, wallpapers, system info.
- **Documents**: write in the editor, **print** on a printer in the same network (needs paper). A printed document
  is an item: read it, put it on a table, hang it on a wall or in a picture frame, give it to another player.

*Kód:* `client/src/pc/` (computer, Tanks, editor, printer window, papers in the world, reading), printing `shared/sim/power.js`, document items `shared/world/papers.js`.

## 10. Multiplayer
- Host in the browser via code, max 6 players, the host's tab is the server, world saved in the host's browser.
- **Server** (Node.js, `npm start`, v2): always-on world on a VPS or a laptop, saved to disk every 30 s with daily backups,
  serves the game itself; its worlds are buttons in the main menu (when the game comes from the server, from a
  `?server=` link, or from the Pages build's `SERVER_URL`), optional password (asked once), max. 8 players by default.
- **Player profiles on the server**: nickname + PIN (asked once per device, then a remembered login); the backpack,
  armor, position and health are saved on the server per player and world (in that world's `world.json`).
  For Richard: the page `/admin` (password `ADMIN_PASSWORD`; players, last seen, last world, who plays now, *Resetovat
  PIN*) and `node server/admin.js players | reset-pin <name>`; the server log shows who logs in, joins and leaves.
- **Several worlds on one server** (`WORLDS`, e.g. *Hlavní svět* + *Kreativní svět*): the main menu shows a button per
  world (name, one line about the world, players n/max, full worlds disabled); the last choice is highlighted and a
  `?world=<id>` link preselects one. Each world has its own buildings, animals, day, players and chat;
  creative mode is on or off for everyone in a world. The backpack and position are saved per player and world on the server. The info box and the
  Esc menu show the world name.
- **Pause menu** (Esc): code + copy, player list, host can allow creative for one player or everyone, and kick.
- **Chat** (T), only to players in the same world.
- Everyone sees other players (name tag, armor, held item, walking, sitting, eating), their blocks, vehicles,
  animals, day/night. Only one player can have a chest or machine open at a time.

*Kód:* host logic `shared/net/room.js` (browser host and server), world changes `shared/net/ops.js`, `shared/net/net.js`; browser side `client/src/net/` (client messages, avatars, chat and Esc menu, net loop); server `server/` (worlds: `server/worlds.js`, `server/world-worker.js`; profiles: `server/profiles.js`, `server/me.js`; admin: `server/admin-http.js`, `server/admin.js`); menu `client/src/menu/menu.js` (world buttons: `renderWorlds`, login: `askProfile`).

## 11. Controls (summary)
WASD move · Shift run · Space jump · mouse look · left button mine/attack · right button place/use/eat ·
E inventory · G drop · C creative · H help · T chat · 1–9 / wheel hotbar · F vehicle · L lights · B horn · V camera · Esc menu.
Phones and tablets: joystick + buttons (*Těžit, Použít, Skok, Běh, Batoh, Výroba…*), landscape only.

*Kód:* keyboard and mouse `client/src/player/player.js`, touch `client/src/ui/touch.js`, settings `client/src/menu/settings.js`.
