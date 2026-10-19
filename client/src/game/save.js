// Ukládání hry do prohlížeče.
import '../ui/hud.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { NET } from './boot.js';
import { SAVE_KEY } from './prefs.js';
import { furnaces } from '../machines/furnace.js';
import { crops, stoves } from '../machines/kitchen.js';
import { power } from '../machines/power.js';
import { paperSpots, pcDisks } from '../pc/printer.js';
import { chairRot, tableItems } from '../player/eating.js';
import { inv } from '../player/inventory.js';
import { creative, player, resetting } from '../player/player.js';
import { dayCount, dayTime } from '../render/daylight.js';
import { toast } from '../ui/hud.js';
import { armor, chests, fires } from '../ui/inventory-ui.js';
import { vehicles } from '../vehicles/car.js';
import { groundItems } from '../world/ground-items.js';
import { papers } from '../world/papers.js';
import { portalActive } from '../world/shrine.js';
import { ruinsBuilt, ruinsOpened, spawners } from '../world/structures.js';
import { blockMeta, blocks, crafted, placedAny, removed } from '../world/world-state.js';
import { voxEdits } from '../../../shared/world/voxels.js';

// ============================================================ ukládání
// Stav světa (ukládá se a hostitel ho posílá novým hráčům)
export function worldState() {
  return {
    dayTime, day: dayCount, blocks: [...blocks], blockMeta: [...blockMeta], removed: [...removed], fires: Object.fromEntries(fires),
    vox: [...voxEdits.values()].flatMap((m) => [...m]),
    ground: groundItems.filter((g) => g.n > 0).map((g) => ({ gid: g.gid, id: g.id, n: g.n, x: g.pos.x, y: g.pos.y, z: g.pos.z })),
    stoves: Object.fromEntries(stoves), tableItems: Object.fromEntries(tableItems), chairRot: Object.fromEntries(chairRot), crops: Object.fromEntries(crops),
    spawners: Object.fromEntries(spawners), furnaces: Object.fromEntries(furnaces), power: Object.fromEntries(power), vehicles: Object.fromEntries(vehicles), papers: Object.fromEntries(papers), pcDisks: Object.fromEntries(pcDisks), paperSpots: Object.fromEntries(paperSpots), chests: Object.fromEntries(chests), ruins: [...ruinsBuilt], ruinsOpened: [...ruinsOpened], portal: portalActive,
  };
}
let saveWarned = false;
export function saveGame() {
  if (resetting || NET.leaving) return;
  // hráč: batoh, pozice, zdraví… (klient na cizím serveru ukládá jen tohle)
  const me = { inv: inv.slots, pos: player.pos.toArray(), yaw: player.yaw, hp: Math.max(player.hp, 1), hunger: player.hunger, crafted, placedAny, creative, flying: player.flying, flyT: player.flyT || 0, armor };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(NET.client ? me : { ...me, ...worldState(), ...(NET.host ? NET.hostSave() : {}) }));
    saveWarned = false;
  } catch {
    // plné úložiště prohlížeče (nebo zakázané): upozornit jednou, ať hráč neztratí postup potichu
    if (!saveWarned) { saveWarned = true; toast('Hru se nepodařilo uložit – v prohlížeči není místo nebo je ukládání zakázané'); }
  }
}
setInterval(saveGame, 10000);
addEventListener('beforeunload', saveGame);
