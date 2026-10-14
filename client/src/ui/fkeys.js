// ============================================================ klávesy F1–F11 (jako v Minecraftu)
// F1 schová HUD i ruce · F2 snímek obrazovky (stáhne se jako PNG) · F3 ladicí údaje
// F3+B obrysy tvorů a věcí · F3+H pokročilé popisky · F3+C zkopíruje pozici · F3+A překreslí svět · F3+Q seznam
// F5 pohled (z očí / zezadu / zepředu) · F11 celá obrazovka (a Ctrl+W pak nezavře hru)
import * as THREE from 'three';
import { PW, PH } from '@louka/shared/constants.js';
import { $ } from '../core/dom.js';
import { renderer, scene, canvas } from '../render/renderer.js';
import { hidden as hands } from '../render/held-item.js';
import { view, cycleView } from '../render/view.js';
import { net } from '../net/net.js';
import { others } from '../net/replica.js';
import { world, mobs } from '../world/state.js';
import { rebuildBlocks } from '../world/blocks.js';
import { rebuildForest } from '../world/forest.js';
import { player } from '../player/state.js';
import { act } from '../player/interaction.js';
import { invView } from '../inventory/inventory-ui.js';
import { time } from '../world/day.js';
import { toast } from './hud.js';

/** Stav: hud = HUD vidět (F1), debug = ladicí údaje (F3), boxes = obrysy (F3+B), shot = čeká snímek (F2), ping = poslední ping. */
export const fk = { hud: true, debug: false, boxes: false, shot: false, ping: 0 };

const SIDES = ['sever (−Z)', 'západ (−X)', 'jih (+Z)', 'východ (+X)'];
let f3Down = false, f3Used = false;

// Hraje se (ne přihlašování)?
const inGame = () => net.mode !== 'none';

addEventListener('keydown', (e) => {
  if (!inGame() || e.target.matches?.('input:not([type=checkbox])')) return;
  if (e.code === 'F3') { e.preventDefault(); if (!e.repeat) { f3Down = true; f3Used = false; } return; }
  if (f3Down && f3Combo(e.code)) { e.preventDefault(); f3Used = true; return; }
  switch (e.code) {
    case 'F1': e.preventDefault(); toggleHud(); break;
    case 'F2': e.preventDefault(); fk.shot = true; break;
    case 'F5': e.preventDefault(); if (!e.repeat) cycleView(); break;
    case 'F11': e.preventDefault(); if (!e.repeat) toggleFullscreen(); break;
  }
});
addEventListener('keyup', (e) => {
  if (e.code !== 'F3' || !f3Down) return;
  f3Down = false;
  if (!f3Used) toggleDebug();
});

/** F1: schová / ukáže HUD a ruce. */
export function toggleHud() {
  fk.hud = !fk.hud;
  document.body.classList.toggle('hud-off', !fk.hud);
  hands.hands = !fk.hud;
}

/** F3: ladicí údaje vlevo nahoře. */
export function toggleDebug() {
  fk.debug = !fk.debug;
  $('debug').style.display = fk.debug ? 'block' : 'none';
}

// F3 + klávesa. Vrátí true, když to byla známá kombinace.
function f3Combo(code) {
  switch (code) {
    case 'KeyB': fk.boxes = !fk.boxes; toast(fk.boxes ? 'Obrysy: zapnuto' : 'Obrysy: vypnuto'); return true;
    case 'KeyH': invView.advanced = !invView.advanced; toast(invView.advanced ? 'Pokročilé popisky: zapnuto' : 'Pokročilé popisky: vypnuto'); return true;
    case 'KeyC': {
      const p = player.pos, text = `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`;
      navigator.clipboard?.writeText(text).catch(() => {});
      toast(`Pozice zkopírována: ${text}`);
      return true;
    }
    case 'KeyA': rebuildForest(player.pos.x, player.pos.z, true); rebuildBlocks(); toast('Svět překreslen'); return true;
    case 'KeyQ':
      if (!fk.debug) toggleDebug();
      showHelp = 3;
      return true;
  }
  return false;
}
let showHelp = 0;

/** F11: celá obrazovka. Prohlížeč pak pustí hře i klávesy jako Ctrl+W (běh dopředu), takže nezavřou kartu. */
function toggleFullscreen() {
  if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
  document.documentElement.requestFullscreen?.()
    .then(() => navigator.keyboard?.lock?.().catch(() => {}))
    .catch(() => toast('Celá obrazovka tu nejde'));
}

// ---------------------------------------------------------------- F3: údaje
let frames = 0, fpsT = 0, fps = 0, textT = 0;
const facing = () => SIDES[((Math.round(player.yaw / (Math.PI / 2)) % 4) + 4) % 4];
function debugText() {
  const p = player.pos, t = act.target;
  const h = Math.floor(time.dayTime * 24), m = Math.floor((time.dayTime * 24 * 60) % 60);
  const lines = [
    `Říše · ${net.mode === 'online' ? `spolu (ping ${fk.ping} ms)` : 'sám'} · ${fps} FPS`,
    `XYZ: ${p.x.toFixed(3)} / ${p.y.toFixed(3)} / ${p.z.toFixed(3)}`,
    `Blok: ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}`,
    `Směr: ${facing()} · otočení ${(((player.yaw * 180) / Math.PI) % 360).toFixed(1)}° · sklon ${((player.pitch * 180) / Math.PI).toFixed(1)}°`,
    `Pohyb: ${player.sneaking ? 'plížení' : player.sprinting ? 'běh' : 'chůze'}${player.onGround ? '' : ' · ve vzduchu'} · pohled ${['z očí', 'zezadu', 'zepředu'][view.mode]}`,
    `Den ${time.dayCount} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    `Tvorové: ${mobs.length} · věci na zemi: ${world.drops.size} · bloky: ${world.blocks.size} · hráči: ${others.size + 1}`,
    `Kreslení: ${renderer.info.render.calls} volání, ${Math.round(renderer.info.render.triangles / 1000)} tis. trojúhelníků`,
  ];
  if (t) lines.push(`Cíl: ${t.name}${t.cell ? ` @ ${t.cell.join(' ')}` : ''}`);
  if (showHelp > 0) lines.push('', 'F3+B obrysy · F3+H pokročilé popisky · F3+C kopírovat pozici', 'F3+A překreslit svět · F3+Q tahle nápověda');
  return lines.join('\n');
}

// ---------------------------------------------------------------- F3+B: obrysy
const boxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
const boxMats = { mob: new THREE.LineBasicMaterial({ color: 0xffffff }), drop: new THREE.LineBasicMaterial({ color: 0x9fe8ff }), player: new THREE.LineBasicMaterial({ color: 0xffe680 }) };
const pool = [];
function drawBoxes() {
  let n = 0;
  const box = (kind, x, y, z, w, h) => {
    let b = pool[n];
    if (!b) { b = pool[n] = new THREE.LineSegments(boxGeo, boxMats.mob); scene.add(b); }
    b.material = boxMats[kind];
    b.position.set(x, y + h / 2, z);
    b.scale.set(w, h, w);
    b.visible = true;
    n++;
  };
  if (fk.boxes) {
    for (const m of mobs) if (!m.dead) box('mob', m.pos.x, m.pos.y, m.pos.z, m.def.radius * 2, m.def.cy * 2);
    for (const d of world.drops.values()) box('drop', d.x, d.y, d.z, 0.25, 0.25);
    for (const o of others.values()) box('player', o.pos.x, o.pos.y, o.pos.z, PW * 2, PH);
  }
  for (let i = n; i < pool.length; i++) pool[i].visible = false;
}

/** Každý snímek (před vykreslením): údaje F3 a obrysy F3+B. */
export function updateFKeys(dt) {
  frames++;
  if ((fpsT += dt) >= 1) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; showHelp = Math.max(0, showHelp - 1); }
  if (fk.debug && (textT -= dt) <= 0) { textT = 0.2; $('debug').textContent = debugText(); }
  drawBoxes();
}

/** Po vykreslení snímku: F2 uloží obrázek (musí to být hned po vykreslení, jinak je plátno prázdné). */
export function afterRender() {
  if (!fk.shot) return;
  fk.shot = false;
  const d = new Date(), pad = (v) => String(v).padStart(2, '0');
  const name = `rise-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.png`;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(`Snímek uložen: ${name}`);
  });
}
