// Pec: tavení s palivem.
import './kitchen.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { isBusy } from '../game/boot.js';
import { save } from '../game/save-load.js';
import { addItem, countItem, removeItem } from '../player/inventory.js';
import { specials } from '../render/blocks.js';
import { sparks } from '../render/particles.js';
import { toast } from '../ui/hud.js';
import { iconImg, invOpen, refreshUI, renderCraftArea, slotHTML, ui } from '../ui/inventory-ui.js';
import { blocks, crafted } from '../world/world-state.js';
import { FUEL, ITEMS, SMELT_TIME, smeltResult } from '../../../shared/data/index.js';

// ============================================================ pec: tavení rud, písku a dalších surovin s palivem
// Políčka: [surovina, palivo, výsledek]. Palivo hoří i se zavřeným oknem; když nemá co tavit, nové palivo se nezapálí.
export const furnaces = new Map(Object.entries(save?.furnaces || {})); // klíč bloku -> { slots, t, burn, burnMax }
export const furnaceOf = (k) => { if (!furnaces.has(k)) furnaces.set(k, { slots: [null, null, null], t: 0, burn: 0, burnMax: 0 }); return furnaces.get(k); };
let furnaceRenderT = 0;
export function updateFurnaces(dt) {
  for (const [k, f] of furnaces) {
    if (blocks.get(k) !== 'furnace') { furnaces.delete(k); continue; }
    if (isBusy(k)) continue; // pec má otevřenou hráč
    const [inp, fuel, out] = f.slots;
    const res = inp && smeltResult(inp.id);
    const can = res && (!out || (out.id === res && out.n < ITEMS[res].stack));
    if (f.burn > 0) f.burn = Math.max(0, f.burn - dt);
    if (can && f.burn <= 0 && fuel && FUEL[fuel.id]) { // zapálí další palivo
      f.burn = f.burnMax = FUEL[fuel.id];
      if (!--fuel.n) f.slots[1] = null;
    }
    if (can && f.burn > 0) {
      if ((f.t += dt) < SMELT_TIME) continue;
      f.t = 0;
      if (!--inp.n) f.slots[0] = null;
      if (out) out.n++; else f.slots[2] = { id: res, n: 1 };
      crafted[res] = true;
      const s = specials.get(k);
      if (s) sparks.emit(s.x + 0.5, s.ry + 0.5, s.z + 0.5, [1, 0.6, 0.2], 8, 1.2, 1.5);
    } else f.t = Math.max(0, f.t - dt * 2);
  }
  if (invOpen && ui.mode === 'furnace' && (furnaceRenderT -= dt) <= 0) { furnaceRenderT = 0.15; renderCraftArea(); }
}
// Žhnoucí otvor pece (u klienta podle stavu, který posílá hostitel)
export function updateFurnaceGlow(time) {
  for (const [k, s] of specials) {
    if (s.type !== 'furnace') continue;
    const f = furnaces.get(k), on = f && f.burn > 0;
    s.obj.userData.glow.material.emissiveIntensity = on ? 1.3 + Math.sin(time * 9 + s.x) * 0.3 : 0;
  }
}
export function renderFurnace(area) {
  const f = furnaceOf(ui.fireKey), [inp, fuel, out] = f.slots, res = inp && smeltResult(inp.id);
  const p = res ? Math.min(100, (f.t / SMELT_TIME) * 100) : 0, b = f.burnMax ? (f.burn / f.burnMax) * 100 : 0;
  const note = !inp ? 'Nahoru vlož surovinu (ruda, písek, křemen, železo…), dolů palivo (uhlí, dřevo).'
    : !res ? 'Tohle se v peci tavit nedá.' : f.burn > 0 ? `Taví se: ${ITEMS[res].name}` : fuel ? 'Zapaluje se…' : 'Přidej palivo (uhlí, dřevěné uhlí, dřevo).';
  area.innerHTML = `<div class="mc-title">Pec</div>
    <div class="fire-ui">
      <div class="fire-col">${slotHTML(inp, 0, '', 'furnace')}
        <div class="flame ${f.burn > 0 ? 'on' : ''}">${iconImg('campfire')}</div>
        <div class="parrow fuelbar"><i style="width:${b}%"></i></div>
        ${slotHTML(fuel, 1, '', 'furnace')}</div>
      <div class="parrow"><i style="width:${p}%"></i></div>
      ${slotHTML(out, 2, 'out', 'furnace')}
    </div>
    <div class="mc-note">${note}</div>`;
}
// Klik v knize pece: surovina se přesune do pece, a když chybí palivo, přidá se uhlí/dřevo z batohu
export function fillFurnace(id) {
  const f = furnaceOf(ui.fireKey);
  if (f.slots[0] && f.slots[0].id !== id) { addItem(f.slots[0].id, f.slots[0].n, true); f.slots[0] = null; }
  const k = Math.min(countItem(id), ITEMS[id].stack - (f.slots[0]?.n || 0));
  if (k <= 0) { toast(`Nemáš: ${ITEMS[id].name}`); return refreshUI(); }
  removeItem(id, k);
  if (f.slots[0]) f.slots[0].n += k; else f.slots[0] = { id, n: k };
  if (!f.slots[1]) {
    const fuelId = Object.keys(FUEL).sort((a, b) => FUEL[b] - FUEL[a]).find((x) => x !== id && countItem(x) > 0);
    if (fuelId) { const n = Math.min(countItem(fuelId), ITEMS[fuelId].stack); removeItem(fuelId, n); f.slots[1] = { id: fuelId, n }; }
  }
  refreshUI();
}
