// Pec a táborák v prohlížeči: obnovení oken, žhnoucí otvor a jiskry (tavení a pečení: shared/sim/machines.js).
import './kitchen.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { FUEL, ITEMS, SMELT_TIME, smeltResult } from '../../../shared/data/index.js';
import { on } from '../../../shared/events.js';
import { furnaceOf, furnaces } from '../../../shared/world/state.js';
import { addItem, countItem, removeItem } from '../player/inventory.js';
import { specials } from '../render/blocks.js';
import { sparks } from '../render/particles.js';
import { toast } from '../ui/hud.js';
import { iconImg, invOpen, refreshUI, renderCraftArea, slotHTML, ui } from '../ui/inventory-ui.js';

// ============================================================ pec: tavení rud, písku a dalších surovin s palivem
// Políčka: [surovina, palivo, výsledek]. Palivo hoří i se zavřeným oknem; když nemá co tavit, nové palivo se nezapálí.
on('fireDone', (k) => { const s = specials.get(k); if (s) sparks.emit(s.x + 0.5, s.ry + 0.6, s.z + 0.5, [1, 0.6, 0.2], 12, 1.5, 2); });
on('furnaceDone', (k) => { const s = specials.get(k); if (s) sparks.emit(s.x + 0.5, s.ry + 0.5, s.z + 0.5, [1, 0.6, 0.2], 8, 1.2, 1.5); });
let furnaceRenderT = 0;
// Okno pece se během tavení obnovuje (tavení samo je v shared/sim/machines.js).
export function refreshFurnaceUI(dt) {
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
