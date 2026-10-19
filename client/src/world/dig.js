// Kopání v prohlížeči: maska děr pro shadery a chunky k překreslení (pravidlo setVox: shared/world/voxels.js).
import './papers.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { on } from '../../../shared/events.js';
import { DIG_N, digData } from '../../../shared/world/voxels.js';

export const digTex = new THREE.DataTexture(digData, DIG_N, DIG_N, THREE.RedFormat, THREE.UnsignedByteType);
digTex.wrapS = digTex.wrapT = THREE.RepeatWrapping;
digTex.magFilter = digTex.minFilter = THREE.NearestFilter;
digTex.needsUpdate = true;

export const dirtyVoxChunks = new Set();
// Změna podzemního bloku (shared/world/voxels.js setVox): překreslit masku děr a dotčené chunky (i sousední na hraně).
on('vox', (x, y, z, surface) => {
  if (surface) digTex.needsUpdate = true;
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16), lx = x - cx * 16, lz = z - cz * 16;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if ((dx === -1 && lx !== 0) || (dx === 1 && lx !== 15) || (dz === -1 && lz !== 0) || (dz === 1 && lz !== 15)) continue;
    dirtyVoxChunks.add(`${cx + dx},${cz + dz}`);
  }
});
