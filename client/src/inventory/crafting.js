// ============================================================ výroba a táborák (akce z okna inventáře)
// Kliknutí v okně se pošlou hře jako akce; co se stane, řeší shared/game/crafting.js.
import { RECIPES } from '@louka/shared/recipes.js';
import * as shared from '@louka/shared/game/crafting.js';
import { hasFor as sharedHasFor } from '@louka/shared/game/inventory.js';
import { net } from '../net/net.js';
import { fires } from '../world/state.js';
import { player } from '../player/state.js';
import { renderCraftArea } from './inventory-ui.js';

/**
 * Stav okna inventáře.
 * open – je otevřené, mode: 'inv' = inventář s mřížkou 2×2, 'bench' = pracovní stůl 3×3, 'fire' = táborák,
 * size – velikost mřížky, craft – políčka mřížky, fireKey – který táborák, ghost – průhledná nápověda receptu.
 */
export const ui = player.ui;

/** Obsah táboráku podle klíče bloku (jen pro čtení). */
export const fireOf = (k) => fires.get(k) || { slots: [null, null], t: 0 };
/** Máš všechny suroviny na recept? */
export const hasFor = (r) => sharedHasFor(player, r);
/** Recept, který teď leží v mřížce (nebo null). */
export const currentResult = () => shared.currentResult(player);

/** Klik na políčko (c = 'inv' | 'craft' | 'fire', button 0 levé / 2 pravé, shift = rychlý přesun). */
export const slotClick = (c, i, button, shift) => net.act({ t: 'slot', c, i, button, shift: !!shift });
/** Vzít výsledek výroby (shift = co nejvíc). */
export const takeResult = (shift) => net.act({ t: 'take', shift: !!shift });
/** Kniha receptů: rozloží suroviny receptu do mřížky (shift = víc najednou). */
export const fillRecipe = (r, shift) => net.act({ t: 'fill', r: RECIPES.indexOf(r), shift: !!shift });
/** Vloží surovinu do otevřeného táboráku. */
export const fillCooking = (id) => net.act({ t: 'cook', id });

// Ukazatel pečení se překresluje, i když nikdo neklikne.
let fireRenderT = 0;
export function updateFireWindow(dt) {
  if (ui.open && ui.mode === 'fire' && (fireRenderT -= dt) <= 0) { fireRenderT = 0.15; renderCraftArea(); }
}
