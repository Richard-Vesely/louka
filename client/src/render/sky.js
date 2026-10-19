// Obloha, slunce, měsíc a hvězdy.
import './renderer.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { Sky } from 'three/addons/objects/Sky.js';
import * as THREE from 'three';
import { renderer, scene } from './renderer.js';
import { rng } from '../../../shared/util.js';

// ============================================================ obloha, slunce, měsíc, hvězdy
export const sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);
export const skyU = sky.material.uniforms;
skyU.rayleigh.value = 1.4;
skyU.mieCoefficient.value = 0.004;
skyU.mieDirectionalG.value = 0.82;
export const sunDir = new THREE.Vector3();
export const sunLight = new THREE.DirectionalLight(0xffffff, 3);
scene.add(sunLight);
export const hemi = new THREE.HemisphereLight(0xbcd3ff, 0x40452a, 1);
scene.add(hemi);

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
export const glowTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
export const moon = new THREE.Sprite(new THREE.SpriteMaterial({
  map: radialTexture([[0, '#fffdf4'], [0.42, '#f4f0e0'], [0.48, 'rgba(220,230,255,0.25)'], [1, 'rgba(200,220,255,0)']]),
  fog: false, depthWrite: false, transparent: true,
}));
moon.scale.setScalar(420);
scene.add(moon);
export const stars = (() => {
  const n = 2500, pos = new Float32Array(n * 3), r = rng(42);
  for (let i = 0; i < n; i++) {
    const u = r() * Math.PI * 2, v = Math.acos(r() * 0.98);
    pos.set([Math.sin(v) * Math.cos(u) * 4500, Math.cos(v) * 4500, Math.sin(v) * Math.sin(u) * 4500], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
  p.frustumCulled = false;
  return p;
})();
scene.add(stars);

const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
let envRT = null;
export function updateEnvironment() {
  const p = sky.position.clone();
  sky.position.set(0, 0, 0);
  envScene.add(sky);
  const rt = pmrem.fromScene(envScene, 0, 1, 20000);
  scene.add(sky);
  sky.position.copy(p);
  if (envRT) envRT.dispose();
  envRT = rt;
  scene.environment = rt.texture;
}
