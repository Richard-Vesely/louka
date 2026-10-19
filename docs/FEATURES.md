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
- **Nastavení**: graphics quality (auto/low/medium/high), controls (auto/touch/mouse), touch button size, mouse sensitivity,
  and the sound sliders **Hlasitost** (80 %), **Zvuky** (100 %) and **Hudba** (60 %); they apply at once (a short click plays at the new volume).
- **Můj oblek** (link in the main menu, **O** or the *Oblek* button under the armor slots in the backpack): pick a futuristic suit
  with a live 3D preview on a holographic stand (drag to turn it; the model walks and swings to show off). Suits:
  *Průzkumník* (backpack with a blinking antenna), *Inženýr* (headlamp, glowing power cell, tool belt), *Pilot* (big
  visor, jet pack), *Strážce* (heavy shoulder plates, a cape that flutters), *Vědec* (lab coat whose flaps swing,
  a hologram next to the head), *Stínový* (dark hood, torn cape) and *Nebeský* (white and gold, halo, small jets).
  Then **Barva obleku** (12), **Světla** (only the game's glow colours: azurová, jantarová, zelená, purpurová),
  **Hledí** (5 tinted visors) and **Znak na hrudi** (8 emblems, glowing in the light colour). *Náhodně*, *Zrušit*,
  *Hotovo* (Enter / Esc work too). Every new name starts in its own colour. The suit is saved in the browser per
  player name (`rise-obleky`) and, on the club server, in the player's profile, so it comes back on any computer.
  In the game a toast says *Nový oblek je na tobě!*
- **Intro screen** on the very first start; **Návod** (H) is a long in-game help text that explains every system.
- **Tips** (*Rada*, 14 steps) guide a new player: chop a tree, craft, build, find shards, wake the shrine…

*Kód:* `index.html` (menu, Návod text), `client/src/menu/menu.js`, `client/src/menu/settings.js`, costume picker `client/src/menu/costume.js` (data and checks `shared/data/costumes.js`), tips in `client/src/ui/hud.js`.

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
- **Mark apple** (*Markojablko*) lets you fly for 10 s.
- **Your character** is a kid in a futuristic suit (see *Můj oblek*): bevelled parts that catch the light, fabric,
  painted shell, metal plates, a reflective visor with glowing eyes behind it (they blink), glowing strips in the
  light colour that stand out at night, an emblem on the chest and a soft shadow under the feet. **Armor shows on
  the model** as plates on the helmet, chest, shoulders, thighs and boots: iron is steel, crystal is icy with glowing
  cyan cracks, markorite is violet metal with a purple glow, *Stínové* is dark with magenta seams, *Nebeské* is white
  enamel with gold trim. Putting on a piece clicks.
- **Animations** (procedural, also on other players): walk and run (longer stride, leaning forward, knees bend),
  idle breathing and looking around now and then, the head follows where you look (the body turns after 75°),
  swings that depend on the tool (pick and axe chop, sword sweeps, shovel scoops, hand and blocks punch), eating
  (hand to the mouth, crumbs fly), flying (legs back, jets glow and spark), sitting, a short squash when landing,
  red flash when hurt; capes, coat flaps and the halo move on their own. Sneaking is supported by the model (pose
  `sn`) but has no key yet.
- **First-person hand**: a gloved suit sleeve (your colours, glowing cuff) holds the item. It sways with your steps,
  lags a little behind fast turns, dips and comes back up when you switch items, jolts when you get hurt, and swings
  with the same tool arcs.
- **V** (touch: *Pohled*) switches the view: *Pohled z první osoby*, *Pohled zezadu*, *Pohled zepředu* (in a vehicle V
  still switches the car camera). The camera stops in front of walls (with a wall right behind you the head hides so it
  doesn't block the view); aiming still works from the eyes.

*Kód:* movement, flying, creative `client/src/player/player.js`, health and hunger `client/src/player/survival.js`, armor data `shared/data/items.js`, armor slots `client/src/ui/inventory-ui.js`; character model, armor plates and animation `client/src/render/character.js` (one skinned mesh per material, joints are bones), first-person hand `client/src/render/held-item.js`, own body and third-person view `client/src/net/avatars.js`.

## 4. Mining, building, items
- **Mining** with hold-to-break and tool tiers: wood → stone → iron → crystal → markorite.
  Axe, pickaxe, shovel, sword (and hoe). Some ores need a better pickaxe (*Potřebuješ…*).
- **Inventory** (*Batoh*, E): 9-slot hotbar + 27 slots, drag, split (right-click), Shift-move, throw out of the window
  (left = all, right = one). Glassy futuristic look: slots glow on hover, rarity-tinted edges, the window is only as wide
  as the backpack; UI sounds for take, put, gather, spread, sort, open and close. Minecraft tricks:
  - **Drag with an item** over several slots: left splits the stack evenly, right puts one in each; swept slots glow and
    show the count they will get, the cursor shows what is left. Dragging over one slot is an ordinary click.
  - **Double-click** gathers the same items onto the cursor (partial stacks first, at most one full stack);
    **Shift + double-click** moves every stack of that item to the other side (chest ↔ backpack, hotbar ↔ backpack).
  - **Shift + drag** shift-moves every slot you sweep; **1–9 over a slot** swaps it with that hotbar slot (from a machine
    output it only takes); **Q over a slot** drops one, **Ctrl+Q** the stack; **wheel** over a stack moves one item to
    the other side (down) or pulls one back (up).
  - **Seřadit** (sort) merges and orders the backpack (hotbar stays) or a chest: tools, weapons, armor, food, blocks,
    materials, tech.
  - **Crafting**: hovering a recipe in the book previews it in the grid; a ready result glows (*Shift + klik = vyrob
    vše*); Shift-click on the result crafts everything; **Space** crafts the last recipe again into the backpack
    (Shift + Space as many as possible).
  - **Creative**: middle-click on a slot takes a full stack, middle-drag puts a full stack into every empty slot swept.
  - **Rich tooltips** (Czech): name coloured by rarity (white, yellow, cyan, purple), kind and tier, a short description,
    chips for attack, mining speed, armor, food, health and flying, durability (when an item has it), fuel time, what it
    smelts into, in how many recipes it is used; **F3 + H** adds the item id.
  - Nothing is lost with a full backpack: closing the window, refilling the campfire or returning the grid drops the rest
    on the ground (*Batoh je plný*).
- **Hotbar**: a glowing ring slides to the selected slot, slot numbers 1–9, an icon pops when its slot gains items, the
  item name fades in above the hotbar for 2 s, worn tools pulse red (≤ 10 % durability).
- **Pick block** (middle mouse button in the world): takes what you aim at into your hand from the backpack (in creative
  a full stack even if you don't have it); otherwise *V batohu nemáš: …*.
- **Drop items** (Q one, Ctrl+Q whole stack; G and Shift+G still work): they lie on the ground, anyone can pick them up;
  they vanish after 5 min. Identical items lying together merge into one stack (decided by whoever holds the world).
  Lying items bob and spin with a soft shadow and show 1–5 models by count (1, 2–16, 17–32, 33–48, 49+). Within 2.4 m an
  item slides toward you (magnet), flies into you shrinking and plays a short high *plip*.
- **Building**: ~110 block types: planks of 5 woods, stones and polished stones, bricks, tiles, glass and panes,
  sandstone, snow, obsidian, mushroom blocks, roof tiles, concrete in 8 colours (from flower dyes), copper,
  gold, steel, quartz, lanterns, torches. **Stairs and slabs** (two slabs make a full block), bars, railings,
  rotation from where you look. Pillar jumping (place under your feet).
- **Crafting**: 2×2 in the inventory, 3×3 at the **workbench** (*Pracovní stůl*), advanced recipes at the
  **workshop** (*Dílna*). ~260 recipes in 12 categories with a recipe book and "only what I can make".
- **Chest** (*Truhla*, 27 slots).
- **Farm traps**: spikes (*Bodce*) hurt mobs; loot of mobs killed on spikes goes to a chest nearby.
- **Mob spawner** blocks in dungeons and fortresses.

*Kód:* mining and placing `client/src/player/interaction.js` + `targeting.js`, backpack `client/src/player/inventory.js`, inventory window and crafting `client/src/ui/inventory-ui.js` (tricks `inv-tricks.js`, tooltips `item-tooltip.js`, slots and hotbar `slots.js`, look `client/src/styles/inventory.css`, UI sounds `client/src/audio/ui-sound.js`), inventory rules `shared/inventory.js`, data `shared/data/` (items, blocks, recipes), dropped items `shared/sim/ground-items.js` + `client/src/world/ground-items.js`, spikes and spawners `shared/sim/mobs.js`.

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

- **Models** (Hytale-like, blocky but detailed): bevelled parts with generated wool, fur, hide and feather textures
  with normal maps, eyes with a white catchlight, a soft contact shadow. Sheep have a woolly cap, cows spots, horns and
  a tail tuft, chickens a comb and wings, deer antlers and a white tail, boars tusks and a bristly back, wolves a
  light mane. Hostile mobs have glowing eyes (wolf amber, shadow-eater magenta slits, Markoman magenta, golem cyan).
  *Markoman* is a guard suit in iron armor with an iron sword; the *Krystalový golem* is stone with pulsing cyan cracks.
- **Life**: eyes blink, the head turns to look at a player within 8 m, animals graze, sniff or look around when
  standing, ears and tails twitch, chickens flap on the run, running kicks up dust, the shadow-eater trails smoke, the
  golem gives off light motes, hit = short red flash, death = tips over sideways, then a puff of smoke (and a soft
  sound). At night mobs and players get a faint blue moonlight rim so their outline reads in the dark.

*Kód:* behaviour, spawning, loot `shared/sim/mobs.js`; models `client/src/mobs/mob-models.js`; animation, life, sounds `client/src/mobs/mobs.js` (`poseMob`, also for the client's puppets).

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
- Everyone sees other players in **their own suit** (*Můj oblek*, sent in the position as `lk`), with a modern
  name tag (dark glass, cyan edge, a dot in their light colour, a health bar when hurt; it fades with distance),
  armor plates, the held item, and all the animations (walking, running with dust, swinging per tool, eating with
  crumbs, flying with jet sparks, sitting, red flash when hurt); their blocks, vehicles, animals, day/night. Only one player can have a chest or machine open at a time.

*Kód:* host logic `shared/net/room.js` (browser host and server), world changes `shared/net/ops.js`, `shared/net/net.js`; browser side `client/src/net/` (client messages, avatars, chat and Esc menu, net loop); server `server/` (worlds: `server/worlds.js`, `server/world-worker.js`; profiles: `server/profiles.js`, `server/me.js`; admin: `server/admin-http.js`, `server/admin.js`); menu `client/src/menu/menu.js` (world buttons: `renderWorlds`, login: `askProfile`).

## 11. Sound and music
All sound is made in the browser (WebAudio synthesis, no recordings). Every sound varies a little in pitch (±10 %) and
volume (±15 %) so repeats don't sound like a machine gun; at most 32 short sounds play at once (ambient ones give way first).
A gentle compressor keeps the mix from clipping.
- **Footsteps by material** in the rhythm of the walk (heel + toe on hard floors): grass, leaves and crops, dirt, sand
  (grainy), snow (crunch and squeak), wood (hollow knock), stone, metal and machines (ringing), glass, crystal (chime) and
  shallow water (splash). Running steps are louder. **Landing** after a fall thumps, louder the higher the fall.
  **Water:** jumping or running in splashes, wading deep makes swimming strokes, and with the head under water everything
  is muffled (low-pass) with bubbles.
- **Mining, breaking and placing by material**: each hit of the hold-to-break sounds like the block (quieter and lower than
  the final break, plus a pickaxe clink on stone and ores), the break crumbles (glass shatters, crystal rings), placing knocks.
  Wrong tool: a dull *tonk*. A felled tree crashes with its crown rustling. Sounds come from where the block is (left/right).
- **Items and food**: pick-up *plip* with random pitch, throwing, opening a chest (creaky lid), filling a bucket or the car,
  eating crunches (soup and drinks slurp) and a swallow at the end, tool-break snap (`Sound.toolBreak()`, ready for tool wear).
- **Windows**: soft clicks on buttons, a quiet tick when hovering slots and buttons, pick / put sounds when moving items,
  a rising blip when the backpack opens and a falling one when it closes, a tick when the hotbar slot changes.
- **Ambience** that cross-fades with the place and time: wind by gusts (stronger in tundra, desert and high up; whistling
  in the tundra), leaves rustling in forests, insects by day (a loud drone in the jungle), **birds** by day (warbler,
  tit, cuckoo, dove, woodpecker; jungle calls and parrots; a hawk over the desert) with a **dawn chorus**,
  **crickets** at night, **owls** in night forests, **frogs** at ponds, lapping water; **caves**: low rumble,
  echoing drips and the occasional rock settling, plus **reverb** that grows with depth (also a little under a roof);
  volcano lava rumble and bubbling pops; the Mark dimension: a dark detuned drone and alien sweeps.
- **Things in the world hum** from where they stand (the 4 nearest): campfire and torches crackle, a burning furnace roars,
  a cooking stove sizzles, a running generator hums at 50 Hz, motors whine, electric furnaces and chargers buzz, computers
  whir, powered lamps and live cables buzz softly when you are close, spawners drone, an awake portal and light shards shimmer.
- **Positional sound in multiplayer**: other players' footsteps (by the material under them) and their building and
  breaking are heard from where they are; animal and monster voices (sheep, cow, chicken, wolf, boar, deer, shadow-eater,
  markoman, crystal golem) come from the creature, also for joined players; the golem stomps.
- **Music**: a quiet generated piece (soft piano, pads, bass) plays for 1–3 minutes, then 3–7 minutes of silence, like in
  Minecraft. Day: D dorian; night: A minor; caves: phrygian; the Mark dimension: whole-tone (it comes sooner when you
  arrive). When a piece starts its Czech name shows for a moment under the clock (*♪ Ranní louka*, *♪ Hvězdná noc*,
  *♪ Hlubiny*, *♪ Markova hvězda*…). Turn it off with the **Hudba** slider.
- **Weather hooks** (no weather yet): `Sound.rainLevel = 0–1` plays layered rain (muffled under a roof) and
  `Sound.thunder(distance)` a crackle and rumble delayed by the distance.

*Kód:* `client/src/audio/`: `sound.js` (mix, volumes, positional sound, reverb, test renderer `Sound.offline`), `sfx.js`
(material and game sound recipes), `voices.js` (animals, birds, insects, thunder), `materials.js` (which material is
under the feet / being mined), `ambience.js` (ambience beds and one-shots), `hums.js` (machines and fires), `music.js`,
`soundscape.js` (senses the surroundings each frame, other players, remote edits), `ui-sounds.js` (window sounds),
`volume.js` (slider values). Console: `game.Sound.music.start('night')`, `game.soundEnv`, `game.Sound.level()`.

## 12. Controls (summary)
WASD move · Shift run · Space jump · mouse look · left button mine/attack · right button place/use/eat ·
E inventory · Q / G drop (Ctrl+Q / Shift+G stack) · middle button pick block · C creative · H help · T chat · 1–9 / wheel hotbar · F vehicle · L lights · B horn · V view (first person / behind / front; car camera in a vehicle) · O suit (*Můj oblek*) · Esc menu.
Phones and tablets: joystick + buttons (*Těžit, Použít, Skok, Běh, Batoh, Výroba, Pohled…*), landscape only.

*Kód:* keyboard and mouse `client/src/player/player.js`, touch `client/src/ui/touch.js`, settings `client/src/menu/settings.js`.
