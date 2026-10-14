// ============================================================ obloha, slunce, měsíc, hvězdy
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { lerp, smoothstep, rng } from '@louka/shared/math.js';
import { renderer, scene, camera, U } from './renderer.js';
import { radialTexture } from './textures.js';

export const sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);
const skyU = sky.material.uniforms;
skyU.rayleigh.value = 1.4;
skyU.mieCoefficient.value = 0.004;
skyU.mieDirectionalG.value = 0.82;
const sunDir = new THREE.Vector3();
const sunLight = new THREE.DirectionalLight(0xffffff, 3);
scene.add(sunLight);
const hemi = new THREE.HemisphereLight(0xbcd3ff, 0x40452a, 1);
scene.add(hemi);

const moon = new THREE.Sprite(new THREE.SpriteMaterial({
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

// Odraz oblohy na lesklých věcech (přepočítává se každé 3 sekundy).
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

const tmpV = new THREE.Vector3();
const DAY_FOG = new THREE.Color(0xc4d3de), NIGHT_FOG = new THREE.Color(0x070b14), DUSK_FOG = new THREE.Color(0xd9a98a);

/**
 * Nastaví slunce, světla, mlhu a oblohu podle denní doby.
 * @param {number} dayTime 0..1 (0,25 = východ slunce, 0,5 = poledne)
 * @returns {{night:number, day:number}} jak moc je noc / den (0..1)
 */
export function updateSky(dayTime) {
  const elev = Math.sin((dayTime - 0.25) * Math.PI * 2);
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev * 62), THREE.MathUtils.degToRad(120 + dayTime * 360));
  skyU.sunPosition.value.copy(sunDir);
  skyU.turbidity.value = lerp(4.5, 9, 1 - smoothstep(0.0, 0.4, elev));
  const day = smoothstep(-0.12, 0.12, elev);
  const warm = (1 - smoothstep(0.02, 0.4, elev)) * day;
  const night = 1 - day;
  U.night.value = smoothstep(0.4, 1, night);
  if (elev >= 0) {
    U.sunDir.value.copy(sunDir);
    const k = smoothstep(-0.02, 0.12, elev) * 3.2;
    U.sunColor.value.set(k, lerp(0.92, 0.55, warm) * k, lerp(0.8, 0.28, warm) * k);
  } else {
    U.sunDir.value.copy(sunDir).negate();
    const k = smoothstep(0, -0.2, elev) * 0.7;
    U.sunColor.value.set(0.35 * k, 0.45 * k, 0.75 * k);
  }
  U.ambient.value.set(lerp(0.035, 0.48, day), lerp(0.05, 0.6, day), lerp(0.1, 0.86, day)).multiplyScalar(lerp(1, 0.85, warm));
  scene.fog.color.copy(NIGHT_FOG).lerp(DAY_FOG, day).lerp(DUSK_FOG, warm * 0.55);
  renderer.toneMappingExposure = lerp(0.85, 0.55, day);
  const sc = U.sunColor.value, am = U.ambient.value;
  sunLight.position.copy(U.sunDir.value).multiplyScalar(100);
  sunLight.color.setRGB(sc.x, sc.y, sc.z);
  sunLight.intensity = Math.PI * 0.9;
  hemi.color.setRGB(am.x, am.y, am.z);
  hemi.groundColor.setRGB(am.x * 0.35, am.y * 0.4, am.z * 0.25);
  hemi.intensity = Math.PI * 0.8;
  scene.environmentIntensity = 0.25 + day * 0.35;
  stars.material.opacity = smoothstep(0.3, 1, night);
  moon.material.opacity = smoothstep(0.2, 0.9, night);
  moon.position.copy(camera.position).addScaledVector(tmpV.copy(sunDir).negate(), 4000);
  return { night, day };
}
