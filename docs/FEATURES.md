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
- **Nastavení**: graphics quality (auto/low/medium/high), controls (auto/touch/mouse), touch button size, mouse sensitivity.
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

*Kód:* terrain and biomes `shared/world/terrain.js` (+ GLSL twin `client/src/render/glsl.js`), underground `shared/world/voxels.js`, trees/rocks/shards/ponds `shared/world/nature.js`, structures and loot `shared/world/structures.js`, day clock `shared/sim/day.js`; drawing in `client/src/render/` (`ground`, `grass`, `forest`, `shards`, `vox-mesh`, `sky`, `daylight`), shrine and portal `client/src/world/shrine.js`.

## 3. Player
- **Survival**: health ❤️, hunger 🍗 (drops faster when running), armor 🛡. Starving hurts; full stomach heals.
  Death: *Padl jsi…*, you respawn at the shrine.
- **Creative mode** (C): fly (double-tap Space), instant breaking, all items. In multiplayer only if the host allows.
- **Movement**: walk, run (Shift), jump, step up blocks and stairs, sit on chairs.
- **Armor**: helmet, chestplate, leggings, boots in iron, crystal, markorite; special sets:
  *Stínové* (shadow: faster, shadow-eaters ignore you) and *Nebeské* (sky: double jump, slow fall, healing; chests only).
  Armor **wears out** too: every mob hit takes 1 point (1 per 20 damage) from each worn piece (iron 165/240/225/195,
  crystal and markorite more); a broken piece falls off with a snap and *Železná helma se rozbila!*.
- **Getting hurt**: the camera tilts away from the hit, the screen edge flashes red and the heart bar blinks.
- **View bobbing**: the camera dips and sways a little with every step (not while flying).
- **Mark apple** (*Markojablko*) lets you fly for 10 s.

*Kód:* movement, flying, creative `client/src/player/player.js`, health and hunger `client/src/player/survival.js`, armor data `shared/data/items.js`, armor slots `client/src/ui/inventory-ui.js`.

## 4. Mining, building, items
- **Mining** with hold-to-break and tool tiers: wood → stone → iron → crystal → markorite.
  Axe, pickaxe, shovel, sword (and hoe). Some ores need a better pickaxe (*Potřebuješ…*).
  - **Speed** (Minecraft formula): time = hardness ÷ tool speed (hand 1, wood 2, stone 4, iron 6, crystal 8, markorite 10,
    only with the right tool for the material); 3× slower with your head under water, 2.5× slower while jumping; a sword
    cuts grass faster. A short 0.3 s pause before the next block.
  - **Cracks**: 10 crack stages grow over the block (stairs and slabs only on their shape; on the smooth ground surface as a
    decal that follows the slope). Trees, rocks and cars show a cyan progress ring instead.
  - **Chips and sounds per material**: every 0.2 s crumbs in the block's own colours fly from the hit point with a quiet
    hit sound (stone, wood, dirt, grass, sand, snow, metal, glass, crystal); breaking throws 64 chips (40 on *střední*,
    16 on *nízká*) that fall, bounce once and fade, with a louder break sound. Placing a block plays its material sound.
- **Tool durability** (*Odolnost*): wood 59, stone 131, iron 250, crystal 900, markorite 2000 uses; hoe 131, fishing rod 64.
  A mined block costs 1, the wrong job costs 2 (sword on blocks, pickaxe on wood…), instant blocks cost nothing; a mob hit
  costs a sword 1 and other tools 2; tilling 1, a caught fish 1. A coloured bar (green → yellow → red) shows under the icon of a
  worn tool; at 10 % the hotbar slot pulses red and *Krumpáč se brzy rozbije* warns once. At 0 the tool breaks: snap
  sound, shards from the hand, the hand dips and comes back empty, *Železný krumpáč se rozbil!*. **No wear in creative.**
  Wear is kept in saves, chests, the server backpack and dropped items (old saves load as new tools).
- **Repair** (*Oprava*) in any crafting grid: two worn tools of the same kind → one with both durabilities + 5 %;
  or a worn tool + 1–4 cells of its material (any planks, stone, iron ingot, light shard, markorite; essence for the shadow
  set) → +25 % per cell. Armor too. The output glows cyan, *🔧 Oprava…* shows the result and an anvil sound plays.
- **Tooltips** of tools: material, *Při držení v ruce: 6 útok · 1,7 úderů/s*, mining speed and what a pickaxe can mine,
  *Odolnost 187 / 250* (red under 10 %), how to repair.
- **Inventory** (*Batoh*, E): 9-slot hotbar + 27 slots, drag, split (right-click), Shift-move, throw out of the window.
  Clicking a tool onto the same kind of tool swaps them (tools don't stack).
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

*Kód:* tool rules (durability, mining speed, attack charge, repair) `shared/tools.js`, wear on this screen `client/src/player/durability.js`,
cracks `client/src/render/crack.js`, chips and crit stars `client/src/render/chips.js`, material sounds `client/src/audio/tool-sounds.js`,
mining and placing `client/src/player/interaction.js` + `targeting.js`, backpack `client/src/player/inventory.js`, inventory window and crafting `client/src/ui/inventory-ui.js`, data `shared/data/` (items, blocks, recipes), dropped items `shared/sim/ground-items.js` + `client/src/world/ground-items.js`, spikes and spawners `shared/sim/mobs.js`.

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

**Combat feel**
- **Attack charge**: every weapon has a speed (fist 4, sword 1.7, pickaxe 1.3, shovel 1.2, axe 1 hits per second). A thin cyan
  meter under the crosshair fills up; a hit does 20–100 % damage depending on the charge (Minecraft formula). Holding the
  button attacks every time the meter is full; clicking early gives a weak slap.
- **Critical hit**: a full-charge hit while falling (after a jump, not running) does 1.5× damage with gold stars and a bright *šing*.
  A full-charge hit while running knocks the mob 1.6× further.
- **Hit feedback**: the mob turns red, hops back with knockback, drops blood/crystal chips; the camera kicks up and a strong
  hit freezes the game for ~50 ms (hit-stop). After a hit a mob is invulnerable for 0.5 s (clicking faster does nothing).
- **Death**: the mob tips over sideways and vanishes in a puff of smoke (0.8 s).
- **First-person hand**: an empty hand is a white sci-fi suit sleeve with a glowing cyan stripe and an armoured glove.
  Swings differ per tool (sword sweeps sideways, axe and pickaxe chop down, shovel scoops, fist jabs), mining loops the
  swing, a new item slides up from below, and the hand lags a little behind camera turns.

*Kód:* behaviour, spawning, loot, invulnerability `shared/sim/mobs.js`; attack rules `shared/tools.js`; models, animation, sounds, hit effects `client/src/mobs/mobs.js`;
attack and meter `client/src/player/interaction.js`; camera kick, hurt tilt, hit-stop, view bobbing `client/src/player/camera-feel.js`; hand and swings `client/src/render/held-item.js`.

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
