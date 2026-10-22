// Model auta (karoserie, sklo, světla, podsvícení, natáčecí kola). Jen funkce (nic se nespouští při načtení); volá ho vehicles/car.js.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MATQ, setupBlockMat } from '../render/materials.js';

// ---------- model: dopředu je -z, počátek mezi nápravami na zemi
export function buildCarModel(color) {
  const g = new THREE.Group();
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, ...o });
  // metalický lak s průhledným vrchním lakem (střední a vysoká grafika), sklo s odlesky oblohy
  const paint = MATQ.maps ? new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.3 }) : M({ color, metalness: 0.45, roughness: 0.3 });
  const dark = M({ color: 0x1e1e22, roughness: 0.8 }), chrome = M({ color: 0xd8dce2, metalness: 1, roughness: 0.16 });
  const glass = setupBlockMat(new THREE.MeshStandardMaterial({ color: 0x1a2632, transparent: true, opacity: 0.55, depthWrite: false }), 'glass');
  const box = (w, h, d, m, x, y, z, parent = g, r = 0) => { const me = new THREE.Mesh(r ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); parent.add(me); return me; };
  box(1.9, 0.5, 4.2, paint, 0, 0.68, 0, g, 0.14);     // spodní část karoserie (zaoblená)
  box(1.86, 0.12, 1.5, paint, 0, 0.98, -1.3, g, 0.05); // kapota
  box(1.8, 0.62, 1.95, glass, 0, 1.24, 0.25, g, 0.06); // kabina se skly
  box(1.84, 0.08, 1.75, paint, 0, 1.58, 0.3, g, 0.035); // střecha
  for (const [x, z] of [[-0.88, -0.7], [0.88, -0.7], [-0.88, 1.2], [0.88, 1.2]]) box(0.08, 0.62, 0.1, paint, x, 1.24, z); // sloupky
  box(1.95, 0.22, 0.18, dark, 0, 0.52, -2.12);        // přední nárazník
  box(1.95, 0.22, 0.18, dark, 0, 0.52, 2.12);         // zadní nárazník
  box(1.0, 0.2, 0.04, chrome, 0, 0.75, -2.11);        // maska chladiče
  const head = M({ color: 0xfff8e0, emissive: 0xfff2c0, emissiveIntensity: 0 }), tail = M({ color: 0x6a1010, emissive: 0xff2010, emissiveIntensity: 0.25 });
  for (const x of [-0.65, 0.65]) { box(0.38, 0.16, 0.04, head, x, 0.78, -2.11); box(0.36, 0.14, 0.04, tail, x, 0.78, 2.11); }
  // tyrkysové podsvícení podvozku (svítí, když auto jede nebo má rozsvíceno)
  const under = M({ color: 0x0b0d12, emissive: 0x38e8ff, emissiveIntensity: 0 });
  for (const x of [-0.96, 0.96]) box(0.03, 0.04, 3.5, under, x, 0.45, 0);
  box(1.6, 0.02, 3.6, under, 0, 0.42, 0);
  const seat = M({ color: 0x4a2e22 });
  for (const x of [-0.42, 0.42]) { box(0.55, 0.12, 0.55, seat, x, 0.98, 0.35); box(0.55, 0.6, 0.12, seat, x, 1.25, 0.66); }
  box(1.3, 0.12, 0.45, seat, 0, 0.98, 1.3); box(1.3, 0.5, 0.1, seat, 0, 1.2, 1.55); // zadní lavice pro spolujezdce
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 16), dark);
  sw.position.set(-0.42, 1.2, -0.25);
  sw.rotation.x = -0.9;
  g.add(sw);
  // kola: natáčecí čep -> rotující kolo (pneumatika, ráfek, paprsek, aby bylo vidět otáčení)
  const wheels = [], pivots = [];
  const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 18).rotateZ(Math.PI / 2), rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.32, 12).rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.95, -1.3], [0.95, -1.3], [-0.95, 1.3], [0.95, 1.3]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.38, z);
    g.add(pivot);
    const spin = new THREE.Group();
    pivot.add(spin);
    spin.add(new THREE.Mesh(tireGeo, dark), new THREE.Mesh(rimGeo, chrome));
    box(0.34, 0.06, 0.36, chrome, 0, 0, 0, spin);
    wheels.push(spin);
    if (z < 0) pivots.push(pivot);
  }
  return { group: g, wheels, pivots, head, tail, under, exhaust: [0.6, 0.45, 2.2] };
}
