// ============================================================ svatyně (místo oživení, bezpečná zóna)
import * as THREE from 'three';
import { scene } from '../render/renderer.js';
import { stoneTex } from '../render/textures.js';

// Kde stojí sloupy (do kterých se nedá vejít), je v shared/game/colliders.js.
const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9, color: 0xd8d2c4 });
const floorTex = stoneTex.clone();
floorTex.repeat.set(5, 5);
floorTex.needsUpdate = true;
const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95, color: 0xbab3a4 });

(function buildShrine() {
  const add = (geo, mat, x, y, z, ry = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    scene.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(9.6, 9.9, 1, 64), floorMat, 0, -0.3, 0);
  add(new THREE.CylinderGeometry(4.6, 4.7, 0.25, 48), floorMat, 0, 0.325, 0);
  const heights = [6, 6, 2.3, 6, 3.6, 6, 6, 1.4];
  const pillars = heights.map((h, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * 7.4, z = Math.sin(a) * 7.4, tilt = h < 6 ? 0.05 : 0;
    add(new THREE.BoxGeometry(1.2, h, 1.2), stoneMat, x, 0.2 + h / 2, z, -a, tilt, tilt);
    return { x, z };
  });
  for (const [i, j] of [[0, 1], [5, 6]]) {
    const p = pillars[i], q = pillars[j];
    add(new THREE.BoxGeometry(Math.hypot(q.x - p.x, q.z - p.z) + 1.2, 0.75, 1.35), stoneMat, (p.x + q.x) / 2, 6.55, (p.z + q.z) / 2, -Math.atan2(q.z - p.z, q.x - p.x));
  }
  add(new THREE.BoxGeometry(1.15, 3.2, 1.15), stoneMat, 9.8, 0.45, 5.6, 0.6, 0, Math.PI / 2 - 0.1);
  add(new THREE.BoxGeometry(1.1, 2.0, 1.1), stoneMat, -3.2, 0.75, 9.9, 1.3, 0, Math.PI / 2);
  // Spící portál – tajemství na později
  add(new THREE.TorusGeometry(2.45, 0.32, 18, 72), new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x9aa3a8, roughness: 0.6, metalness: 0.2, emissive: 0x2ad8ff, emissiveIntensity: 0.15 }), 0, 3.05, 0);
  add(new THREE.BoxGeometry(1.0, 0.9, 1.0), stoneMat, -2.45, 0.9, 0);
  add(new THREE.BoxGeometry(1.0, 0.9, 1.0), stoneMat, 2.45, 0.9, 0);
})();
