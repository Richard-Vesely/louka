// ============================================================ modely zvláštních bloků
// Pracovní stůl, táborák a pochodeň. Nový zvláštní blok = nová větev v buildSpecial().
import * as THREE from 'three';
import { glowTex, rockTex } from '../render/textures.js';
import { lumpy } from '../render/mesh-utils.js';
import { blockMats } from './blocks.js';

/**
 * Postaví 3D model zvláštního bloku.
 * @param {string} type typ bloku (workbench | campfire | torch)
 * @returns {{obj: THREE.Group, flames: THREE.Sprite[]}}
 */
export function buildSpecial(type) {
  const g = new THREE.Group();
  const flames = [];
  const flame = (scale, y) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.setScalar(scale);
    s.position.y = y;
    s.userData.base = scale;
    g.add(s);
    flames.push(s);
  };
  if (type === 'workbench') {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1, 0.16, 1), blockMats.planks);
    top.position.y = 0.84;
    g.add(top);
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.78, 0.14), blockMats.planks);
      leg.position.set(x, 0.39, z);
      g.add(leg);
    }
    const tool = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.4 }));
    tool.position.set(0.1, 0.95, 0.15);
    tool.rotation.y = 0.5;
    g.add(tool);
  } else if (type === 'campfire') {
    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 1 });
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.8, 7), logMat);
      log.rotation.set(Math.PI / 2 - 0.45, (i / 4) * Math.PI * 2, 0, 'YXZ');
      log.position.y = 0.18;
      g.add(log);
    }
    const stoneGeo = lumpy(new THREE.IcosahedronGeometry(0.12, 1), 0.25, 3);
    for (let i = 0; i < 9; i++) {
      const st = new THREE.Mesh(stoneGeo, new THREE.MeshStandardMaterial({ map: rockTex, roughness: 1 }));
      const a = (i / 9) * Math.PI * 2;
      st.position.set(Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.45);
      g.add(st);
    }
    flame(0.9, 0.35);
    flame(0.6, 0.55);
  } else if (type === 'torch') {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x5a3e26, roughness: 1 }));
    stick.position.y = 0.35;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.1, 6), new THREE.MeshStandardMaterial({ color: 0x2a1a10, emissive: 0xff6a1a, emissiveIntensity: 1.5 }));
    head.position.y = 0.72;
    g.add(stick, head);
    flame(0.45, 0.82);
  }
  return { obj: g, flames };
}
