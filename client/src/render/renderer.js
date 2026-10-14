// ============================================================ renderer, scéna, kamera
import * as THREE from 'three';

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
document.body.prepend(renderer.domElement);

/** Plátno, do kterého se hra kreslí (na něj se kliká a zamyká myš). */
export const canvas = renderer.domElement;

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xc4d3de, 0.0058);
export const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 12000);
camera.rotation.order = 'YXZ';
scene.add(camera);

/** Hodnoty sdílené všemi shadery (slunce, světlo, čas, pozice kamery, noc). */
export const U = {
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  sunColor: { value: new THREE.Vector3(1, 1, 1) },
  ambient: { value: new THREE.Vector3(0.4, 0.5, 0.7) },
  time: { value: 0 },
  cam: { value: new THREE.Vector3() },
  night: { value: 0 },
};
export const shaderUniforms = (extra = {}) => ({
  ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  uSunDir: U.sunDir, uSunColor: U.sunColor, uAmbient: U.ambient, uTime: U.time, uCam: U.cam, uNight: U.night,
  ...extra,
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
