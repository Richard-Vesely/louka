// ============================================================ začátek hry: sám, nebo spolu
// Po načtení stránky se ukáže přihlášení. "Hrát sám" spustí hru v prohlížeči (net/local.js),
// "Hrát spolu" se připojí k serveru (net/online.js).
import { $ } from '../core/dom.js';
import { save } from '../save/load.js';
import { world, mobs } from '../world/state.js';
import { rebuildForest } from '../world/forest.js';
import { rebuildBlocks } from '../world/blocks.js';
import { player } from '../player/state.js';
import { ui } from '../inventory/crafting.js';
import { renderHotbar, renderInventory, closeInventory } from '../inventory/inventory-ui.js';
import { showJoin, hideJoin, netStatus, notice, setPlayerList } from '../ui/join.js';
import { net } from './net.js';
import { startOffline } from './local.js';
import { connectOnline } from './online.js';
import { onEvent } from './events.js';
import { fk } from '../ui/fkeys.js';

/** Hra pro jednoho hráče (uložená v prohlížeči). */
export function startSolo() {
  if (net.mode !== 'none') return;
  Object.assign(net, startOffline({ world, mobs, player, onEvent }));
  hideJoin();
  if (!save) $('intro').style.display = 'grid';
}

/** Hra přes server. Když se nepřipojí, vyhodí chybu s českým textem (ukáže ji přihlášení). */
export async function startTogether({ url, name, password }) {
  const api = await connectOnline({ url, name, password, onEvent, onNet });
  Object.assign(net, api);
  $('newWorld').style.display = 'none'; // svět na serveru se nemaže z prohlížeče
  try {
    if (!localStorage.getItem('louka-intro')) { $('intro').style.display = 'grid'; localStorage.setItem('louka-intro', '1'); }
  } catch {}
}

// Co se děje se spojením a s ostatními hráči.
function onNet(what, data) {
  switch (what) {
    case 'welcome':
      rebuildBlocks();
      rebuildForest(player.pos.x, player.pos.z, true);
      renderHotbar();
      renderInventory();
      break;
    case 'lost':
      if (ui.open) closeInventory();
      netStatus('Spojení ztraceno — připojuji znovu…');
      break;
    case 'back': netStatus(''); break;
    case 'fatal': netStatus(data); break;
    case 'join': notice(`👋 ${data.name} je ve hře`); break;
    case 'leave': notice(`${data.name} už není ve hře`); break;
    case 'list': setPlayerList(data); break;
    case 'ping': fk.ping = data; break;
  }
}

/** Ukáže přihlášení (nebo rovnou spustí hru pro jednoho, když je v adrese ?offline). */
export function showStart() {
  if (new URLSearchParams(location.search).has('offline')) startSolo();
  else showJoin({ onSolo: startSolo, onTogether: startTogether });
}
