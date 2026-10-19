// Kopání: změna podzemního bloku a maska děr pro shadery.
import './papers.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { NET } from '../game/boot.js';
import { save } from '../game/save-load.js';
import { DIG_N, V, digData, digIdx, naturalAt, topY, vchunkKey, voxEdits } from '../../../shared/world/voxels.js';

export const digTex = new THREE.DataTexture(digData, DIG_N, DIG_N, THREE.RedFormat, THREE.UnsignedByteType);
digTex.wrapS = digTex.wrapT = THREE.RepeatWrapping;
digTex.magFilter = digTex.minFilter = THREE.NearestFilter;
digTex.needsUpdate = true;

export const dirtyVoxChunks = new Set();
export function setVox(x, y, z, id) {
  NET.op(['v', x, y, z, id]);
  const ck = vchunkKey(x, z), k = `${x},${y},${z}`, top = topY(x, z);
  let m = voxEdits.get(ck);
  if (id === naturalAt(x, y, z, top)) m?.delete(k);
  else { if (!m) voxEdits.set(ck, (m = new Map())); m.set(k, id); }
  if (y === top) { digData[digIdx(x, z)] = id === V.AIR ? 255 : 0; digTex.needsUpdate = true; }
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16), lx = x - cx * 16, lz = z - cz * 16;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if ((dx === -1 && lx !== 0) || (dx === 1 && lx !== 15) || (dz === -1 && lz !== 0) || (dz === 1 && lz !== 15)) continue;
    dirtyVoxChunks.add(`${cx + dx},${cz + dz}`);
  }
}
for (const [k, id] of save?.vox || []) { const [x, y, z] = k.split(',').map(Number); setVox(x, y, z, id); }
dirtyVoxChunks.clear();
