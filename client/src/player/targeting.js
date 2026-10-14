// ============================================================ míření (co je před hráčem)
// Paprsek z očí hráče: najde nejbližší blok, strom, balvan, tvora nebo kus země.
// Míří se z očí i ve 3. osobě (F5), jako v Minecraftu.
import * as THREE from 'three';
import { REACH } from '@louka/shared/constants.js';
import { BLOCKS, bkey } from '@louka/shared/blocks.js';
import { groundHeight } from '@louka/shared/terrain.js';
import { lookDir } from '@louka/shared/game/player.js';
import { player } from './state.js';
import { blocks } from '../world/state.js';
import { forestTrees, forestRocks } from '../world/forest.js';
import { isCut } from '../world/grass.js';
import { mobs } from '../mobs/mobs.js';

const rayO = new THREE.Vector3(), rayD = new THREE.Vector3();

// Prochází políčka podél paprsku (jako v Minecraftu) a vrátí první blok.
function raycastBlocks(o, d, max) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
  let tx = d.x === 0 ? Infinity : (sx > 0 ? x + 1 - o.x : o.x - x) * tdx;
  let ty = d.y === 0 ? Infinity : (sy > 0 ? y + 1 - o.y : o.y - y) * tdy;
  let tz = d.z === 0 ? Infinity : (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
  let t = 0, normal = [0, 0, 0];
  while (t <= max) {
    const type = blocks.get(bkey(x, y, z));
    if (type) return { t, x, y, z, type, normal };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; normal = [-sx, 0, 0]; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; normal = [0, -sy, 0]; }
    else { z += sz; t = tz; tz += tdz; normal = [0, 0, -sz]; }
  }
  return null;
}

/**
 * Co je přímo před hráčem (do vzdálenosti REACH).
 * @returns {object|null} cíl: kind 'block' | 'tree' | 'rock' | 'mob' | 'ground', jméno, nápověda, tvrdost…
 */
export function pickTarget() {
  rayO.set(player.pos.x, player.pos.y + player.eyeH, player.pos.z);
  const look = lookDir(player);
  rayD.set(look.x, look.y, look.z);
  const o = rayO, d = rayD;
  let best = null, bt = REACH;
  const bh = raycastBlocks(o, d, REACH);
  if (bh) {
    const b = BLOCKS[bh.type];
    bt = bh.t;
    best = { kind: 'block', key: 'b' + bkey(bh.x, bh.y, bh.z), cell: [bh.x, bh.y, bh.z], normal: bh.normal, type: bh.type, name: b.name,
      hint: bh.type === 'workbench' ? 'pravé tlačítko = výroba 3×3' : bh.type === 'campfire' ? 'pravé tlačítko = pečení a tavení' : '', hard: b.hard, tool: b.tool, req: b.req ? { tool: 'pick', tier: b.req } : null, at: [bh.x + 0.5, bh.y + 0.5, bh.z + 0.5] };
  }
  const a = d.x * d.x + d.z * d.z;
  for (const t of forestTrees) {
    const ox = o.x - t.x, oz = o.z - t.z;
    if (ox * ox + oz * oz > 64 || a < 1e-6) continue;
    const r = 0.3 * t.s + 0.2, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r, disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const tt = (-b - Math.sqrt(disc)) / (2 * a);
    if (tt < 0 || tt >= bt) continue;
    const hy = o.y + d.y * tt;
    if (hy < t.y - 0.5 || hy > t.y + t.trunkH + 1.5 * t.s) continue;
    bt = tt;
    best = { kind: 'tree', key: t.key, tree: t, name: t.pine ? 'Smrk' : 'Dub', hint: 'drž levé tlačítko · se sekerou rychleji', hard: 2.4 * t.s, tool: 'axe', at: [o.x + d.x * tt, hy, o.z + d.z * tt] };
  }
  const sphere = (cx, cy, cz, rad) => {
    const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
    const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - rad * rad, disc = b * b - c;
    if (disc < 0) return Infinity;
    return Math.max(0, -b - Math.sqrt(disc));
  };
  for (const r of forestRocks) {
    if ((o.x - r.x) ** 2 + (o.z - r.z) ** 2 > 64) continue;
    const tt = sphere(r.x, r.y + 0.1 * r.s, r.z, r.s * 0.95);
    if (tt >= bt) continue;
    bt = tt;
    best = { kind: 'rock', key: r.key, rock: r, name: r.iron ? 'Železná ruda' : 'Balvan', hint: r.iron ? 'těžíš kamenným nebo železným krumpáčem' : 'těžíš krumpáčem', hard: r.iron ? 4.5 : 3, tool: 'pick', req: { tool: 'pick', tier: r.iron ? 2 : 1 }, at: [o.x + d.x * tt, o.y + d.y * tt, o.z + d.z * tt] };
  }
  for (const m of mobs) {
    if (m.dead) continue;
    const tt = sphere(m.pos.x, m.pos.y + m.def.cy, m.pos.z, m.def.radius);
    if (tt >= bt) continue;
    bt = tt;
    best = { kind: 'mob', mob: m, name: m.def.name, hint: m.type === 'crawler' ? 'nepřítel' : 'lovná zvěř' };
  }
  for (let t = 0.2; t < bt; t += 0.1) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y >= groundHeight(x, z)) continue;
    let lo = t - 0.1, hi = t;
    for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2; if (o.y + d.y * mid < groundHeight(o.x + d.x * mid, o.z + d.z * mid)) hi = mid; else lo = mid; }
    const px = o.x + d.x * hi, py = o.y + d.y * hi, pz = o.z + d.z * hi;
    const onFloor = Math.hypot(px, pz) < 9.6, cut = isCut(px, pz);
    best = {
      kind: 'ground', key: `g${Math.round(px)},${Math.round(pz)}`, point: [px, py, pz], at: [px, py, pz], hard: 0.45, breakable: !onFloor && !cut,
      name: onFloor ? 'Podlaha svatyně' : cut ? 'Posekaná tráva' : 'Tráva', hint: onFloor ? '' : cut ? 'doroste za pár minut' : 'drž levé tlačítko · vlákno a plody',
    };
    break;
  }
  return best;
}
