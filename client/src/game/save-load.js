// Načtení uložené hry z prohlížeče (nebo světa od hostitele).
import './prefs.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { NET } from '../../../shared/net/net.js';
import { loadWorld } from '../../../shared/world/save.js';
import { BOOT } from './boot.js';
import { OLD_SAVE_KEY, SAVE_KEY } from './prefs.js';

// ============================================================ uložená hra
export let save = null;
try { save = JSON.parse(localStorage.getItem(SAVE_KEY) ?? (OLD_SAVE_KEY && localStorage.getItem(OLD_SAVE_KEY))); } catch {}
if (NET.client) { // svět dodá hostitel, z vlastního uložení se vezme jen batoh, pozice a stav hráče
  const me = save || {}, w = BOOT.welcome;
  save = { ...w.world, inv: me.inv, pos: me.pos || w.spawn, yaw: me.yaw, hp: me.hp, hunger: me.hunger, crafted: me.crafted, placedAny: me.placedAny, armor: me.armor, flyT: me.flyT, creative: !!me.creative && !!w.perm, flying: !!me.flying && !!w.perm };
}
loadWorld(save); // svět (bloky, truhly, stroje…) do shared/world/state.js
