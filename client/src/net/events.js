// ============================================================ zprávy ze hry pro hráče
// Hra (offline v prohlížeči, online na serveru) posílá události; tady se z nich stane obraz a zvuk.
import { ITEMS } from '@louka/shared/items.js';
import { Sound } from '../audio/sound.js';
import { playFx } from '../render/effects.js';
import { world } from '../world/state.js';
import { rebuildBlocks } from '../world/blocks.js';
import { rebuildForest } from '../world/forest.js';
import { refreshShards } from '../world/shards.js';
import { cutGrass } from '../world/grass.js';
import { ui } from '../inventory/crafting.js';
import { renderHotbar, renderInventory } from '../inventory/inventory-ui.js';
import { player } from '../player/state.js';
import { onHurt, onDied, onRespawn } from '../player/survival.js';
import { feed, toast } from '../ui/hud.js';

// Zvuky, které smí hra přehrát zprávou { t: 'sound', name }.
const SOUNDS = new Set(['eat', 'craft', 'place', 'crack', 'pickup', 'hit', 'kill', 'hurt']);

/** Zpracuje jednu zprávu ze hry. */
export function onEvent(ev) {
  switch (ev.t) {
    case 'inv': renderHotbar(); renderInventory(); break;
    case 'feed': feed(ev.id, `+${ev.n} ${ITEMS[ev.id].name}`); break;
    case 'toast': toast(ev.text); break;
    case 'sound': if (SOUNDS.has(ev.name)) Sound[ev.name](); break;
    case 'fx': playFx(ev); break;
    case 'block':
      if (ev.b) world.blocks.set(ev.k, ev.b); else world.blocks.delete(ev.k);
      rebuildBlocks();
      break;
    case 'removed':
      world.removed.add(ev.key);
      if (ev.key[0] === 's') refreshShards(player.pos.x, player.pos.z);
      else rebuildForest(player.pos.x, player.pos.z, true);
      break;
    case 'fire':
      if (ev.f) world.fires.set(ev.k, ev.f); else world.fires.delete(ev.k);
      if (ui.open && ui.mode === 'fire' && ui.fireKey === ev.k) renderInventory();
      break;
    case 'grass': cutGrass(ev.x, ev.z); break;
    case 'hurt': onHurt(ev); break;
    case 'died': onDied(); break;
    case 'respawn': onRespawn(ev); break;
  }
}
