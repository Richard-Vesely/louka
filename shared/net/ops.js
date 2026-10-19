// Změny světa, které si hráči posílají (protokol: viz shared/net/protocol.md).
// Operace (ops): ['m', mapa, klíč, hodnota] bloky, ['s', množina, klíč], ['r', stavba], ['v', x, y, z, id] podzemí,
// ['c', x, z, r] posekaná tráva, ['p'] probuzená svatyně, ['g', gid, id, n, pos, vel, delay] předmět na zemi, ['gx', gid, n].
// Malé mapy (kv): táboráky, truhly, sporáky, pole… se porovnávají jako JSON a posílají se změněné klíče (vyhrává poslední změna).
import { ITEMS } from '../data/index.js';
import { emit } from '../events.js';
import { groundItems, spawnGroundItem } from '../sim/ground-items.js';
import { markPowerDirty } from '../sim/power.js';
import { Vec3 } from '../vec3.js';
import { KV_MAPS, blockMeta, blocks, removed, ruinsBuilt, ruinsOpened, setPortalActive } from '../world/state.js';
import { BUILDERS, buildStructure } from '../world/structures.js';
import { setVox } from '../world/voxels.js';
import { NET } from './net.js';

// Přehraje cizí změnu světa (bez dalšího rozesílání).
export function applyOp(o) {
  NET.quiet(() => {
    switch (o[0]) {
      case 'm': {
        const [, name, k, v] = o;
        if (name === 'blockMeta') { if (v === null) blockMeta.delete(k); else blockMeta.set(k, v); NET.dirtyBlocks = true; return; }
        if (name !== 'blocks') return;
        emit('blockOp', k, v); // prohlížeč: pryč se starým modelem bloku, vstát ze zbořené židle
        if (v === null) blocks.delete(k); else blocks.set(k, v);
        NET.dirtyBlocks = true;
        break;
      }
      case 's': ({ removed, ruinsOpened })[o[1]]?.add(o[2]); if (o[1] === 'removed') NET.dirtyForest = true; break;
      case 'r': if (o[1]?.key && !ruinsBuilt.has(o[1].key) && BUILDERS[o[1].type]) buildStructure(o[1]); break;
      case 'v': setVox(o[1], o[2], o[3], o[4]); break;
      case 'c': emit('grassCut', o[1], o[2], o[3]); break; // posekaná tráva je jen obrázek (prohlížeč)
      case 'p': setPortalActive(true); break;
      case 'g': if (ITEMS[o[2]] && !groundItems.some((g) => g.gid === o[1])) spawnGroundItem(o[2], o[3], new Vec3(...o[4]), new Vec3(...o[5]), o[6], o[1]); break;
      case 'gx': { const it = groundItems.find((g) => g.gid === o[1]); if (it) { it.n = o[2]; it.req = 0; } break; }
    }
  });
}
// Malé mapy: změněné klíče od posledního odeslání
export function kvDiff() {
  const ch = [];
  for (const [m, map] of Object.entries(KV_MAPS)) {
    const L = (NET.kvLast[m] ||= new Map());
    const once = m === 'papers'; // vytištěné papíry se nemění: stačí poslat nové
    for (const [k, v] of map) { if (once && L.has(k)) continue; const j = JSON.stringify(v); if (L.get(k) !== j) { L.set(k, j); ch.push([m, k, v]); } }
    for (const k of [...L.keys()]) if (!map.has(k)) { L.delete(k); ch.push([m, k, null]); }
  }
  return ch;
}
export function applyKV(m, k, v) {
  const map = KV_MAPS[m];
  if (!map) return;
  const old = map.get(k);
  if (v === null) map.delete(k); else map.set(k, v);
  const visual = m === 'crops' ? old?.stage !== v?.stage : (m === 'tableItems' || m === 'chairRot') && JSON.stringify(old) !== JSON.stringify(v);
  if (visual && blocks.has(k)) emit('refreshSpecial', k); // nový model (plodina povyrostla, jídlo na stole…)
  if (m === 'power') markPowerDirty(); // vypínač mohl změnit tvar sítě
  emit('kv', m, k); // prohlížeč: obnovit otevřené okno truhly / stroje
}
