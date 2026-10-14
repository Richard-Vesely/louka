// Pomocníci pro 3D modely.
import * as THREE from 'three';
import { scene } from './renderer.js';

/** Udělá tvar "hrbolatým" (balvany, koruny stromů). */
export function lumpy(geo, amt, seed) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 + seed * 1.7) * Math.sin(v.z * 3.3 + seed * 0.7);
    v.multiplyScalar(1 + n * amt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Jeden model nakreslený mnohokrát najednou (rychlé pro tisíce stromů nebo bloků). */
export const makeInstanced = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.count = 0; scene.add(m); return m; };

/** Pomocný objekt pro výpočet pozice a otočení kopií. */
export const dummy = new THREE.Object3D();
export const tmpColor = new THREE.Color();
