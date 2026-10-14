// ============================================================ modely tvorů
// Ovce, kanec a stínožrout poskládaní z jednoduchých tvarů.
import * as THREE from 'three';
import { lumpy } from '../render/mesh-utils.js';

const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.22, 0.04), fog: false });

/**
 * Postaví 3D model tvora.
 * @param {string} type sheep | boar | crawler
 * @returns {{group: THREE.Group, body: THREE.Mesh, legs: THREE.Group[], mats: THREE.Material[]}}
 */
export function buildMob(type) {
  const g = new THREE.Group(), legs = [];
  const mat = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });
  const mesh = (geo, m, x, y, z, parent = g) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); parent.add(me); return me; };
  const leg = (m, x, y, z, len) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    mesh(new THREE.BoxGeometry(0.13, len, 0.13).translate(0, -len / 2, 0), m, 0, 0, 0, pivot);
    g.add(pivot);
    legs.push(pivot);
  };
  let body;
  if (type === 'sheep') {
    const wool = mat({ color: 0xe9e4d8, flatShading: true }), dark = mat({ color: 0x2b2522 });
    body = mesh(lumpy(new THREE.IcosahedronGeometry(1, 2), 0.12, 5), wool, 0, 0.78, 0);
    body.scale.set(0.5, 0.42, 0.72);
    mesh(new THREE.BoxGeometry(0.28, 0.32, 0.36), dark, 0, 0.92, -0.72);
    mesh(new THREE.BoxGeometry(0.34, 0.2, 0.2), wool, 0, 1.05, -0.62);
    for (const [x, z] of [[-0.2, -0.38], [0.2, -0.38], [-0.2, 0.38], [0.2, 0.38]]) leg(dark, x, 0.5, z, 0.5);
  } else if (type === 'boar') {
    const fur = mat({ color: 0x4e3424, flatShading: true }), dark = mat({ color: 0x2a1c14 }), pink = mat({ color: 0x9a6a5a }), tusk = mat({ color: 0xeee6d2, roughness: 0.5 });
    body = mesh(lumpy(new THREE.IcosahedronGeometry(1, 2), 0.1, 2), fur, 0, 0.72, 0);
    body.scale.set(0.48, 0.45, 0.85);
    mesh(new THREE.BoxGeometry(0.4, 0.38, 0.42), fur, 0, 0.74, -0.88);
    mesh(new THREE.BoxGeometry(0.22, 0.17, 0.14), pink, 0, 0.66, -1.14);
    for (const x of [-0.11, 0.11]) mesh(new THREE.ConeGeometry(0.03, 0.16, 5), tusk, x, 0.66, -1.12).rotation.x = -0.4;
    for (const x of [-0.13, 0.13]) mesh(new THREE.SphereGeometry(0.035, 6, 4), eyeMat.clone(), x, 0.84, -1.09).material.color.setRGB(0.05, 0.03, 0.02);
    for (const [x, z] of [[-0.22, -0.5], [0.22, -0.5], [-0.22, 0.5], [0.22, 0.5]]) leg(dark, x, 0.45, z, 0.45);
  } else {
    body = mesh(new THREE.SphereGeometry(0.6, 22, 16), mat({ color: 0x0e0a12, roughness: 0.35, metalness: 0.2 }), 0, 0.48, 0);
    body.scale.set(1, 0.8, 1.15);
    for (const sx of [-0.2, 0.2]) mesh(new THREE.SphereGeometry(0.075, 10, 8), eyeMat, sx, 0.12, -0.6, body);
    const spikeMat = mat({ color: 0x120c16, roughness: 0.5 });
    for (let i = 0; i < 5; i++) {
      const sp = mesh(new THREE.ConeGeometry(0.11, 0.5, 6), spikeMat, (i - 2) * 0.14, 0.5 - Math.abs(i - 2) * 0.06, 0.1 + Math.abs(i - 2) * 0.05, body);
      sp.rotation.set(-0.5, 0, (i - 2) * -0.35);
    }
  }
  const mats = [];
  g.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial && !mats.includes(o.material)) mats.push(o.material); });
  return { group: g, body, legs, mats };
}
