// Postavičky ostatních hráčů.
import './multiplayer.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { ITEMS } from '../../../shared/data/index.js';
import { r2 } from '../../../shared/net/net.js';
import { others } from '../../../shared/net/room.js';
import { clamp, wrapAngle } from '../../../shared/util.js';
import { vehicles } from '../../../shared/world/state.js';
import { dining } from '../dining/dining.js';
import { iconVoxels } from '../dining/food-models.js';
import { heldStack } from '../player/inventory.js';
import { creative, input, isLocked, player } from '../player/player.js';
import { blockMat } from '../render/blocks.js';
import { tmpV } from '../render/daylight.js';
import { swingT } from '../render/held-item.js';
import { ICONS } from '../render/icons.js';
import { scene } from '../render/renderer.js';
import { armor, fullSet, invOpen, ui } from '../ui/inventory-ui.js';
import { hornN } from '../vehicles/car.js';

// ---------- postavičky ostatních hráčů
function nameTag(name) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 34px "Pixelify Sans", monospace';
  const w = Math.min(248, g.measureText(name).width + 24);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(128 - w / 2, 8, w, 48);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 128, 33, 236);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(1.3, 0.325, 1);
  return s;
}
function makeAvatar(name) {
  const g = new THREE.Group();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  const shirt = M(new THREE.Color().setHSL((h % 360) / 360, 0.55, 0.42)), pants = M(0x2f3a52), skin = M(0xe0b088), hair = M(new THREE.Color().setHSL(0.07, 0.5, 0.12 + ((h >> 8) % 5) * 0.06)), dark = M(0x1a1a1a);
  const box = (w, hh, d, m, x, y, z, parent = g) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); me.position.set(x, y, z); parent.add(me); return me; };
  const pivot = (x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); g.add(p); return p; };
  const legL = pivot(-0.12, 0.76, 0), legR = pivot(0.12, 0.76, 0);
  for (const l of [legL, legR]) { box(0.22, 0.64, 0.24, pants, 0, -0.32, 0, l); box(0.23, 0.12, 0.27, dark, 0, -0.7, -0.015, l); }
  box(0.48, 0.66, 0.27, shirt, 0, 1.09, 0);
  const armL = pivot(-0.33, 1.38, 0), armR = pivot(0.33, 1.38, 0);
  for (const a of [armL, armR]) { box(0.18, 0.46, 0.2, shirt, 0, -0.2, 0, a); box(0.16, 0.18, 0.18, skin, 0, -0.52, 0, a); }
  const head = pivot(0, 1.42, 0);
  box(0.42, 0.42, 0.42, skin, 0, 0.21, 0, head);
  box(0.44, 0.12, 0.44, hair, 0, 0.42, 0, head);
  box(0.44, 0.3, 0.1, hair, 0, 0.3, 0.18, head);
  for (const x of [-0.09, 0.09]) box(0.07, 0.06, 0.02, dark, x, 0.24, -0.215, head);
  const hand = new THREE.Group();
  hand.position.set(0, -0.62, -0.06);
  armR.add(hand);
  const tag = nameTag(name);
  tag.position.y = 2.15;
  g.add(tag);
  scene.add(g);
  return { group: g, head, legL, legR, armL, armR, hand, armorKey: '', held: undefined, phase: 0, atk: 0, yaw: 0, init: false };
}
// Barva kusu brnění = průměrná barva jeho ikony (bez obrysu a tmavých pixelů)
const armorMatCache = {};
function armorMat(id) {
  if (armorMatCache[id]) return armorMatCache[id];
  const d = ICONS[id].canvas.getContext('2d').getImageData(0, 0, 16, 16).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200 || d[i] + d[i + 1] + d[i + 2] < 120) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  const c = n ? new THREE.Color(r / n / 255, g / n / 255, b / n / 255).convertSRGBToLinear() : new THREE.Color(0.6, 0.6, 0.6);
  const t = ITEMS[id].tier, shiny = t === 3 || t === 4 || t === 5;
  return (armorMatCache[id] = new THREE.MeshStandardMaterial({ color: c, roughness: shiny ? 0.35 : 0.8, metalness: shiny ? 0.6 : 0,
    emissive: t === 4 || t === 5 || t === 'sky' ? c : 0x000000, emissiveIntensity: t === 4 || t === 5 || t === 'sky' ? 0.25 : 0 }));
}
// Brnění na postavičce: helma, hrudní plát s nárameníky, kalhoty, boty (podle toho, co hráč nosí)
function setAvatarArmor(A, ids) {
  A.armorKey = ids.join('|');
  for (const part of [A.head, A.armL, A.armR, A.legL, A.legR, A.group]) for (const o of [...part.children]) if (o.userData.armor) part.remove(o);
  const box = (parent, id, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), armorMat(id)); m.position.set(x, y, z); m.userData.armor = true; parent.add(m); };
  const [helmet, chest, legs, boots] = ids;
  if (helmet) { box(A.head, helmet, 0.48, 0.2, 0.48, 0, 0.42, 0); box(A.head, helmet, 0.48, 0.24, 0.06, 0, 0.26, 0.22); for (const x of [-0.235, 0.235]) box(A.head, helmet, 0.04, 0.24, 0.46, x, 0.27, 0); }
  if (chest) { box(A.group, chest, 0.52, 0.62, 0.31, 0, 1.11, 0); for (const a of [A.armL, A.armR]) box(a, chest, 0.22, 0.26, 0.24, 0, -0.08, 0); }
  if (legs) { box(A.group, legs, 0.5, 0.12, 0.29, 0, 0.78, 0); for (const l of [A.legL, A.legR]) box(l, legs, 0.25, 0.46, 0.27, 0, -0.24, 0); }
  if (boots) for (const l of [A.legL, A.legR]) box(l, boots, 0.26, 0.2, 0.3, 0, -0.68, -0.015);
}
function setAvatarHeld(A, id) {
  A.held = id;
  A.hand.clear();
  if (!id || !ITEMS[id]) return;
  const d = ITEMS[id];
  let m;
  if (d.block && blockMat(d.block)) { m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), blockMat(d.block)); m.position.set(0, -0.05, -0.08); }
  else { m = iconVoxels(id, 0.026); m.rotation.set(-Math.PI / 2, Math.PI / 2, 0); m.position.set(0, -0.02, -0.18); }
  A.hand.add(m);
}
const shown = new Map(); // hráč -> postavička ve scéně
export function updateAvatars(dt) {
  for (const [P, A] of shown) if (others.get(P.pid) !== P) { scene.remove(A.group); shown.delete(P); } // hráč odešel
  const k = 1 - Math.exp(-dt * 12);
  for (const P of others.values()) {
    const q = P.pose;
    if (!q) continue;
    if (!P.avatar) shown.set(P, (P.avatar = makeAvatar(P.name)));
    const A = P.avatar;
    A.group.visible = q.alive !== false && !q.veh; // v autě není postavička vidět (sedí uvnitř)
    const tx = q.x, ty = q.y - (q.sit ? 0.42 : 0), tz = q.z;
    if (!A.init || Math.hypot(A.group.position.x - tx, A.group.position.z - tz) > 12) { A.group.position.set(tx, ty, tz); A.yaw = q.yaw; A.init = true; }
    else A.group.position.lerp(tmpV.set(tx, ty, tz), k);
    A.yaw += wrapAngle(q.yaw - A.yaw) * k;
    A.group.rotation.y = A.yaw;
    A.head.rotation.x = clamp(q.pitch, -1.2, 1.2) * 0.8;
    if (q.held !== A.held) setAvatarHeld(A, q.held);
    const ar = (q.ar || []).map((id) => (id && ITEMS[id]?.armor ? id : null));
    if (ar.join('|') !== A.armorKey) setAvatarArmor(A, ar);
    A.phase += dt * Math.min(q.mv, 9) * 2.2;
    const swing = Math.sin(A.phase) * Math.min(q.mv / 4, 1) * 0.7;
    if (q.sit) { A.legL.rotation.x = A.legR.rotation.x = Math.PI / 2; }
    else if (q.fly) { A.legL.rotation.x = A.legR.rotation.x = 0.15; }
    else { A.legL.rotation.x = swing; A.legR.rotation.x = -swing; }
    A.armL.rotation.x = q.sit ? 0.3 : -swing * 0.8;
    if (q.sw) { A.atk = (A.atk + dt * 3.2) % 1; A.armR.rotation.x = 1.0 + Math.sin(A.atk * Math.PI * 2) * 0.7; }
    else if (q.eat) A.armR.rotation.x = 1.9 + Math.sin(performance.now() / 120) * 0.15;
    else { A.atk = 0; A.armR.rotation.x = q.sit ? 0.3 : swing * 0.8 + (q.held ? 0.25 : 0); }
  }
}
export function myPose() {
  return {
    x: r2(player.pos.x), y: r2(player.pos.y), z: r2(player.pos.z), yaw: r2(player.yaw), pitch: r2(player.pitch), held: heldStack()?.id || null,
    ui: invOpen && ui.fireKey != null ? String(ui.fireKey) : null, // otevřená truhla / stroj (zámek)
    mv: r2(Math.hypot(player.vel.x, player.vel.z)), sw: swingT >= 0 || (input.lmb && isLocked()) ? 1 : 0, eat: player.eating || dining ? 1 : 0,
    veh: (() => { const v = vehicles.get(player.vehicle); return v ? { id: player.vehicle, x: r2(v.x), y: r2(v.y), z: r2(v.z), yaw: r2(v.yaw), pitch: r2(v.pitch || 0), roll: r2(v.roll || 0), spd: r2(v.spd), steer: r2(v.steer), thr: r2(v.thr || 0), lights: v.lights ? 1 : 0 } : null; })(), hn: hornN,
    ar: armor.map((a) => a?.id || null), sit: player.sitting ? 1 : 0, fly: player.flying ? 1 : 0, flyT: player.flyT > 0 ? 1 : 0, alive: player.alive, cr: creative ? 1 : 0, set: fullSet(), hp: Math.round(player.hp),
  };
}
