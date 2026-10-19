// Stíny od slunce (v noci od měsíce): jedna mapa stínů, která jde s hráčem a překresluje se jen pár desítekkrát za sekundu.
// Jen se střední a vysokou grafikou (FX.shadows). Les vrhá stíny přes levné „stínové kopie“ blízkých stromů (forest.js).
import * as THREE from 'three';
import { FX, LK } from './look.js';
import { U, camera, renderer, scene } from './renderer.js';
import { sunLight } from './sky.js';

// Vrstva stínových kopií: kamera ji zapne jen ve snímku, kdy se mapa stínů překresluje (jinak se nekreslí vůbec).
export const SHADOW_LAYER = 1;
const R = FX.shadowRange, TEXEL = (2 * R) / FX.shadowSize;
let timer = 0, ready = false;
const center = new THREE.Vector3(), fwd = new THREE.Vector3(), basis = new THREE.Matrix4(), inv = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0), ORIGIN = new THREE.Vector3();

export function initShadows() {
  if (!FX.shadows || ready) return;
  ready = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  sunLight.castShadow = true;
  const s = sunLight.shadow;
  s.mapSize.set(FX.shadowSize, FX.shadowSize);
  Object.assign(s.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 420 });
  s.camera.updateProjectionMatrix();
  s.bias = -0.0003;
  s.normalBias = TEXEL * 0.9;
  s.radius = LK.shadow.soft;
  s.intensity = LK.shadow.strength;
  scene.add(sunLight.target);
  U.shadowMatrix.value = s.matrix;
  U.shadowP.value.set(0, 1 / FX.shadowSize, TEXEL * 1.2, LK.shadow.soft);
  U.shadowStrength.value = LK.shadow.strength;
}

// Kdo vrhá a přijímá stíny: běžné neprůhledné modely ano, vlastní shadery (terén, tráva, obloha) a sprity ne.
// Věci v ruce (děti kamery) stíny jen přijímají. Projde scénu dvakrát za sekundu a nastaví jen nové objekty.
let sweepT = 0;
function mark(o, cast) {
  if (o.userData.sh) return;
  o.userData.sh = 1;
  if (!o.isMesh || o.layers.mask !== 1) return;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  if (mats.some((m) => m.isShaderMaterial)) return;
  o.receiveShadow = true;
  o.castShadow = cast && !o.userData.noCast && mats.every((m) => !m.transparent || m.depthWrite) && mats.every((m) => m.colorWrite !== false);
}
function sweep() {
  for (const c of scene.children) {
    const cast = c !== camera;
    c.traverse((o) => mark(o, cast));
  }
}

// Každý snímek těsně před kreslením. under = jak moc je hráč pod zemí (tam slunce nesvítí, mapa se nepřekresluje).
export function updateShadows(dt, under = 0) {
  if (!FX.shadows) return;
  if ((sweepT -= dt) <= 0) { sweepT = 0.5; sweep(); }
  const dir = U.sunDir.value; // směr ke světlu (slunce, v noci měsíc)
  camera.layers.disable(SHADOW_LAYER);
  timer -= dt;
  if (timer <= 0 && under < 0.95 && dir.y > 0.03) {
    timer = 1 / FX.shadowHz;
    // střed oblasti stínů: kus před hráčem, ať je stín hlavně tam, kam se dívá
    camera.getWorldDirection(fwd);
    center.set(camera.position.x + fwd.x * R * 0.35, camera.position.y - 2, camera.position.z + fwd.z * R * 0.35);
    // zaokrouhlit na texely mapy v prostoru světla, jinak okraje stínů při chůzi „plavou“
    basis.lookAt(dir, ORIGIN, UP);
    inv.copy(basis).transpose();
    center.applyMatrix4(inv);
    center.x = Math.round(center.x / TEXEL) * TEXEL;
    center.y = Math.round(center.y / TEXEL) * TEXEL;
    center.applyMatrix4(basis);
    sunLight.target.position.copy(center);
    sunLight.target.updateMatrixWorld();
    renderer.shadowMap.needsUpdate = true;
    camera.layers.enable(SHADOW_LAYER);
  }
  // světlo vždy míří na střed oblasti stínů (směr = poloha − cíl)
  sunLight.position.copy(sunLight.target.position).addScaledVector(dir, 210);
  const map = sunLight.shadow.map?.texture || null;
  U.shadowMap.value = map;
  U.shadowP.value.x = map && dir.y > 0.03 && under < 0.95 ? 1 : 0;
}
