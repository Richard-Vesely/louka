// ============================================================ HUD
// Kompas, hodiny, zdraví a hlad, zprávy uprostřed (toast) a v rohu (feed).
import { wrapAngle } from '@louka/shared/math.js';
import { $ } from '../core/dom.js';
import { ICONS } from '../render/icons.js';
import { time } from '../world/day.js';
import { shardObjs } from '../world/shards.js';
import { player } from '../player/state.js';
import { ui } from '../inventory/crafting.js';
import { renderInventory } from '../inventory/inventory-ui.js';
import { updateTips } from './tips.js';

/** vignette – jak moc je obrazovka červená po zásahu (1 = hodně, pomalu mizí). */
export const hud = { vignette: 0 };

const compass = $('compass');
const compassItems = [];
const addCompass = (html, cls, yaw) => {
  const el = document.createElement('div');
  el.className = 'm ' + cls;
  el.innerHTML = html;
  compass.append(el);
  const item = { el, yaw };
  compassItems.push(item);
  return item;
};
for (let i = 0; i < 24; i++) addCompass('<div class="tick"></div>', '', (i / 24) * Math.PI * 2);
[['S', 0], ['V', -Math.PI / 2], ['J', Math.PI], ['Z', Math.PI / 2]].forEach(([t, a]) => addCompass(t, '', a));
const shrineMark = addCompass('◆<small></small>', 'shrine', 0);
const shardMark = addCompass('✦<small></small>', 'shard', 0);
function placeCompass(item) {
  const diff = wrapAngle(item.yaw - player.yaw);
  item.el.style.display = Math.abs(diff) < 1.75 ? '' : 'none';
  item.el.style.left = `${50 - (diff / (Math.PI / 2)) * 50}%`;
}
function setMarker(item, x, z) {
  if (x === null) { item.el.style.display = 'none'; return; }
  const dx = x - player.pos.x, dz = z - player.pos.z;
  item.yaw = Math.atan2(-dx, -dz);
  placeCompass(item);
  item.el.querySelector('small').textContent = `${Math.round(Math.hypot(dx, dz))} m`;
}

/** Zpráva v pravém dolním rohu s ikonou předmětu (např. "+3 Kmen"). */
export function feed(id, text) {
  const el = document.createElement('div');
  el.innerHTML = `<img src="${ICONS[id].url}" alt="">`;
  el.append(text);
  $('feed').prepend(el);
  setTimeout(() => el.remove(), 3000);
}

let toastTimer = 0;
/** Velká zpráva nahoře uprostřed (na 3 sekundy). */
export function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  toastTimer = 3.2;
}

let tipT = 0;
/** Překreslí HUD (každý snímek). */
export function updateHUD(dt) {
  for (const item of compassItems) if (item !== shrineMark && item !== shardMark) placeCompass(item);
  let best = null, bd = Infinity;
  for (const s of shardObjs.values()) {
    const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z);
    if (d < bd) { bd = d; best = s; }
  }
  setMarker(shrineMark, 0, 0);
  setMarker(shardMark, best ? best.x : null, best ? best.z : null);
  const h = Math.floor(time.dayTime * 24), mi = Math.floor((time.dayTime * 24 * 60) % 60);
  $('clock').textContent = `Den ${time.dayCount} · ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  $('hpfill').style.width = `${Math.max(0, player.hp)}%`;
  $('foodfill').style.width = `${player.hunger}%`;
  hud.vignette = Math.max(0, hud.vignette - dt * 1.5);
  $('vignette').style.opacity = Math.max(hud.vignette, player.alive ? (1 - player.hp / 100) * 0.5 : 0);
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').classList.remove('show');
  if ((tipT -= dt) <= 0) { tipT = 0.5; updateTips(); if (ui.open) renderInventory(); }
}
