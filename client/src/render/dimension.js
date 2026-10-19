// Markova dimenze: barvy oblohy a mlhy.
import '../world/structures.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { isMark } from '../../../shared/world/terrain.js';
import { player } from '../player/player.js';
import { U, scene } from './renderer.js';
import { hemi, skyU, sunLight } from './sky.js';

// Markova dimenze: fialová obloha, modravé světlo a mlha.
const MARK_FOG = new THREE.Color(0x5a3f96);
const markTint = new THREE.Vector3(0.9, 0.88, 1.15), markAmb = new THREE.Vector3(0.75, 0.8, 1.3);
export function applyDimension() {
  const mk = isMark(player.pos.x);
  skyU.rayleigh.value = mk ? 3.4 : 1.4;
  skyU.mieDirectionalG.value = mk ? 0.9 : 0.82;
  if (!mk) return;
  U.sunColor.value.multiply(markTint);
  U.ambient.value.multiply(markAmb);
  const sc = U.sunColor.value, am = U.ambient.value;
  sunLight.color.setRGB(sc.x, sc.y, sc.z);
  hemi.color.setRGB(am.x, am.y, am.z);
  scene.fog.color.lerp(MARK_FOG, 0.55);
}
