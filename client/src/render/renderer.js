// Renderer, scéna, kamera a společné uniformy shaderů.
import '../game/save-load.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { GFX } from '../game/prefs.js';

// ============================================================ renderer, scéna
export const renderer = new THREE.WebGLRenderer({ antialias: GFX.aa, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, GFX.pr));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xc4d3de, GFX.fog); // hustší mlha při nižší grafice skryje kratší dohled
export const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 12000);
camera.rotation.order = 'YXZ';
scene.add(camera);

export const U = {
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  sunColor: { value: new THREE.Vector3(1, 1, 1) },
  ambient: { value: new THREE.Vector3(0.4, 0.5, 0.7) },
  time: { value: 0 },
  cam: { value: new THREE.Vector3() },
  night: { value: 0 },
  // světlomety auta, které řídíš (terén a tráva mají vlastní osvětlení, tak se kužel počítá v jejich shaderu)
  headPos: { value: new THREE.Vector3() }, headDir: { value: new THREE.Vector3(0, 0, -1) }, headOn: { value: 0 },
};
export const shaderUniforms = (extra = {}) => ({
  ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  uSunDir: U.sunDir, uSunColor: U.sunColor, uAmbient: U.ambient, uTime: U.time, uCam: U.cam, uNight: U.night, uHeadPos: U.headPos, uHeadDir: U.headDir, uHeadOn: U.headOn,
  ...extra,
});
