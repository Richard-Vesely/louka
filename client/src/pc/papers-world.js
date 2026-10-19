// Papíry ve světě: na zemi, na stole, na zdi, v rámečku; předání hráči.
import './printer.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { BLOCKS, ITEMS } from '../../../shared/data/index.js';
import { NET } from '../../../shared/net/net.js';
import { others, sendTo } from '../../../shared/net/room.js';
import { spawnGroundItem } from '../../../shared/sim/ground-items.js';
import { clamp } from '../../../shared/util.js';
import { REACH } from '../../../shared/world/constants.js';
import { bkey, paperSpots, papers } from '../../../shared/world/state.js';
import { Sound } from '../audio/sound.js';
import { MP } from '../game/boot.js';
import { target } from '../player/interaction.js';
import { addItem, consumeSelected, heldStack } from '../player/inventory.js';
import { player } from '../player/player.js';
import { rayD, rayO } from '../player/targeting.js';
import { specials } from '../render/blocks.js';
import { scene } from '../render/renderer.js';
import { planksTex } from '../render/textures.js';
import { toast } from '../ui/hud.js';
import { openDoc } from './doc-view.js';

// ---------- papír jako textura (nadpis, text, autor)
const paperGeo = new THREE.PlaneGeometry(0.42, 0.594), paperTexCache = new Map();
function wrapLines(x, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (x.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}
function paperTex(pid) {
  const rec = papers.get(pid), key = pid + (rec ? '1' : '0');
  if (paperTexCache.has(key)) return paperTexCache.get(key);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 362;
  const x = c.getContext('2d');
  x.fillStyle = '#fbf8ee';
  x.fillRect(0, 0, 256, 362);
  x.fillStyle = '#1a1a2a';
  x.font = 'bold 20px Georgia, serif';
  const title = wrapLines(x, rec?.title || '…', 224).slice(0, 2);
  title.forEach((l, i) => x.fillText(l, 16, 32 + i * 23));
  x.font = '15px Georgia, serif';
  x.fillStyle = '#16161e';
  let y = 46 + title.length * 23;
  for (const l of wrapLines(x, rec?.text || '', 224)) { if (y > 336) break; x.fillText(l, 16, y); y += 18; }
  x.fillStyle = '#8a8a92';
  x.font = 'italic 10px Georgia, serif';
  if (rec) x.fillText(`${rec.by} · den ${rec.day}`, 16, 352);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  paperTexCache.set(key, mat);
  return mat;
}

// ---------- papíry a rámečky ve světě
const spotObjs = new Map(); // id -> { obj, sig }
const frameMat = new THREE.MeshStandardMaterial({ map: planksTex, color: 0x9a6a3a, roughness: 0.6 }), backMat = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.9 });
const pinMat = new THREE.MeshStandardMaterial({ color: 0xd82a2a, roughness: 0.4 });
function buildSpot(s) {
  const g = new THREE.Group(), inner = new THREE.Group();
  g.position.set(s.x, s.y, s.z);
  g.rotation.y = s.ry;
  if (!s.w) inner.rotation.x = -Math.PI / 2; // na zemi a na stole leží
  g.add(inner);
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); inner.add(m); return m; };
  if (s.fr) {
    for (const [w, h, x, y] of [[0.56, 0.05, 0, 0.345], [0.56, 0.05, 0, -0.345], [0.05, 0.74, -0.255, 0], [0.05, 0.74, 0.255, 0]]) add(new THREE.BoxGeometry(w, h, 0.04), frameMat, x, y, 0.02);
    add(new THREE.PlaneGeometry(0.46, 0.64), backMat, 0, 0, 0.004);
  }
  if (s.d) {
    const p = add(paperGeo, paperTex(s.d), 0, 0, s.fr ? 0.01 : 0.002);
    if (s.fr) p.scale.setScalar(1.05);
    if (s.w && !s.fr) add(new THREE.SphereGeometry(0.018, 8, 6), pinMat, 0, 0.27, 0.01); // připínáček
  }
  scene.add(g);
  return g;
}
let spotT = 0;
export function updateDocs(dt) {
  if ((spotT -= dt) > 0) return;
  spotT = 0.25;
  for (const [id, s] of paperSpots) {
    const sig = JSON.stringify(s) + (s.d && papers.has(s.d) ? 1 : 0), o = spotObjs.get(id);
    if (o?.sig === sig) continue;
    if (o) scene.remove(o.obj);
    spotObjs.set(id, { obj: buildSpot(s), sig });
  }
  for (const [id, o] of spotObjs) if (!paperSpots.has(id)) { scene.remove(o.obj); spotObjs.delete(id); }
}
// Paprsek proti obdélníkům papírů (na zemi vodorovně, na zdi svisle)
function rayPaper(o, d, maxT) {
  let best = null;
  for (const [id, s] of paperSpots) {
    const dx = s.x - o.x, dy = s.y - o.y, dz = s.z - o.z;
    if (dx * dx + dy * dy + dz * dz > 64) continue;
    const c = Math.cos(s.ry), sn = Math.sin(s.ry), n = s.w ? [sn, 0, c] : [0, 1, 0], u = [c, 0, -sn], v = s.w ? [0, 1, 0] : [sn, 0, c];
    const den = d.x * n[0] + d.y * n[1] + d.z * n[2];
    if (Math.abs(den) < 1e-4) continue;
    const t = (dx * n[0] + dy * n[1] + dz * n[2]) / den;
    if (t <= 0 || t >= maxT || (best && t >= best.t)) continue;
    const px = o.x + d.x * t - s.x, py = o.y + d.y * t - s.y, pz = o.z + d.z * t - s.z, hu = s.fr ? 0.29 : 0.22, hv = s.fr ? 0.38 : 0.31;
    if (Math.abs(px * u[0] + py * u[1] + pz * u[2]) < hu && Math.abs(px * v[0] + py * v[1] + pz * v[2]) < hv) best = { id, t, at: [px + s.x, py + s.y, pz + s.z] };
  }
  return best;
}
// Doplní cíl pohledu o papír, když je blíž než to, na co se hráč dívá
export function withPaper(best) {
  const pp = rayPaper(rayO, rayD, REACH), hit = best?.point || best?.at;
  if (!pp || (hit && pp.t > Math.hypot(hit[0] - rayO.x, hit[1] - rayO.y, hit[2] - rayO.z) + 0.05)) return best;
  const s = paperSpots.get(pp.id), title = s.d && papers.get(s.d)?.title;
  return {
    kind: 'paper', id: pp.id, key: 'pd' + pp.id, at: pp.at, hard: 0.35,
    name: s.d ? `Dokument „${title || '…'}“` : 'Prázdný rámeček',
    hint: s.d ? `pravé tl. = číst · drž levé = ${s.fr ? 'sundat s rámečkem' : 'sebrat'}` : 'pravé tl. s dokumentem v ruce = zarámovat · drž levé = sundat',
  };
}
export function takeSpot(id) {
  const s = paperSpots.get(id);
  if (!s) return;
  paperSpots.delete(id);
  if (s.d) addItem('doc_' + s.d, 1);
  if (s.fr) addItem('picture_frame', 1);
  Sound.rustle();
}
// Zničený blok shodí papíry, které na něm leží nebo visí
export function dropSpotsAt(cx, cy, cz) {
  for (const [id, s] of paperSpots) if (s.x > cx - 0.06 && s.x < cx + 1.06 && s.y > cy - 0.06 && s.y < cy + 1.06 && s.z > cz - 0.06 && s.z < cz + 1.06) takeSpot(id);
}
// Kam položit papír nebo pověsit rámeček podle toho, kam se hráč dívá. null = nikam (dokument se jen přečte), text = proč to nejde.
function surfaceSpot(wallOnly) {
  const t = target;
  if (!t?.point || !t.normal) return null;
  const [nx, ny, nz] = t.normal, p = t.point, B = t.kind === 'block' ? BLOCKS[t.type] : null, half = wallOnly ? [0.29, 0.38] : [0.22, 0.31];
  let spot;
  if (B && t.type === 'table') { // na stůl
    if (wallOnly) return 'Rámeček se věší na zeď – zamiř na stěnu bloku';
    const [cx, cy, cz] = t.cell;
    spot = { x: clamp(p[0], cx + 0.26, cx + 0.74), y: (specials.get(bkey(cx, cy, cz))?.ry ?? cy) + 0.905, z: clamp(p[2], cz + 0.26, cz + 0.74), ry: player.yaw, w: 0 };
  } else if (ny === 0 && (t.kind === 'vox' || (B && !B.special && !B.shape && B.solid !== false))) { // na zeď
    const [cx, cy, cz] = t.cell;
    spot = { x: p[0] + nx * 0.012, y: clamp(p[1], cy + half[1], cy + 1 - half[1]), z: p[2] + nz * 0.012, ry: Math.atan2(nx, nz), w: 1 };
    if (nx) spot.z = clamp(p[2], cz + half[0], cz + 1 - half[0]); else spot.x = clamp(p[0], cx + half[0], cx + 1 - half[0]);
  } else if (wallOnly) return 'Rámeček se věší na zeď – zamiř na stěnu bloku';
  else if (ny === 1 && (t.kind === 'grass' || t.kind === 'ground' || t.kind === 'vox' || (B && !B.special && !B.shape))) spot = { x: p[0], y: p[1] + 0.012, z: p[2], ry: player.yaw, w: 0 }; // na zem
  else if (B) return 'Sem se papír položit nedá';
  else return null;
  for (const s of paperSpots.values()) if ((s.x - spot.x) ** 2 + (s.y - spot.y) ** 2 + (s.z - spot.z) ** 2 < 0.16) return 'Tady už papír je';
  return spot;
}

// ---------- předání dokumentu jinému hráči (pravé tlačítko, když se na něj díváš zblízka)
function lookedPlayer() {
  if (!MP) return null;
  let best = null, bd = 3.5;
  for (const P of others.values()) {
    const q = P.pose;
    if (!q || q.alive === false) continue;
    const vx = q.x - rayO.x, vy = q.y + 1 - rayO.y, vz = q.z - rayO.z, t = vx * rayD.x + vy * rayD.y + vz * rayD.z;
    if (t <= 0 || t >= bd) continue;
    if ((vx - rayD.x * t) ** 2 + (vy - rayD.y * t) ** 2 + (vz - rayD.z * t) ** 2 < 0.45) { best = P; bd = t; }
  }
  return best;
}
function giveDoc(P, id) {
  consumeSelected();
  if (NET.host) sendTo(P.pid, ['gift', id, NET.name]); else NET.req(['giveTo', P.pid, id]);
  Sound.pop();
  toast(`Předal jsi hráči ${P.name}: ${ITEMS[id].name}`);
}
export function receiveGift(id, from) {
  if (typeof id !== 'string' || !ITEMS[id]) return;
  const left = addItem(id, 1);
  if (left > 0) spawnGroundItem(id, left, player.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(), 3);
  Sound.pop();
  toast(`${from} ti předal: ${ITEMS[id].name}`);
}

// ---------- pravé tlačítko s dokumentem nebo rámečkem, na papír ve světě
export function useDocs() {
  const held = heldStack(), doc = held && ITEMS[held.id].doc;
  if (target?.kind === 'paper') {
    const s = paperSpots.get(target.id);
    if (!s) return true;
    if (!s.d && doc) { paperSpots.set(target.id, { ...s, d: doc }); consumeSelected(); Sound.place(); toast('Dokument je v rámečku'); }
    else if (s.d) openDoc(s.d);
    else toast('Do rámečku vlož dokument: vezmi ho do ruky a klikni pravým na rámeček');
    return true;
  }
  if (!doc && held?.id !== 'picture_frame') return false;
  if (doc) { const P = lookedPlayer(); if (P) { giveDoc(P, held.id); return true; } }
  const spot = surfaceSpot(!doc);
  if (spot === null) { if (doc) openDoc(doc); else toast('Rámeček se věší na zeď – zamiř na stěnu bloku'); return true; }
  if (typeof spot === 'string') { toast(spot); return true; }
  paperSpots.set(NET.uid(), doc ? { ...spot, d: doc, fr: 0 } : { ...spot, d: null, fr: 1 });
  consumeSelected();
  Sound.place();
  toast(doc ? (spot.w ? 'Dokument visí na zdi. Pravé tl. = číst, drž levé = sundat' : 'Dokument leží. Pravé tl. = číst, drž levé = sebrat') : 'Rámeček visí. Vlož do něj dokument (pravé tl. s dokumentem)');
  return true;
}
