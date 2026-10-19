// Den a noc na obloze a tma v podzemí (čas dne: shared/sim/day.js).
import '../player/survival.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { advanceDay, dayCount, dayTime, sunElevation } from '../../../shared/sim/day.js';
import { lerp, smoothstep } from '../../../shared/util.js';
import { EYE } from '../../../shared/world/constants.js';
import { terrainH } from '../../../shared/world/terrain.js';
import { gameTime } from '../game/loop.js';
import { GFX } from '../game/prefs.js';
import { player } from '../player/player.js';
import { toast } from '../ui/hud.js';
import { FX, LK } from './look.js';
import { post } from './post.js';
import { FOG, U, camera, renderer, scene } from './renderer.js';
import { hemi, moon, skyU, stars, sunDir, sunLight } from './sky.js';

// ============================================================ den a noc
let wasNight = false; // (čas dne a počítadlo dní jsou v shared/sim/day.js)
export const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();
const DAY_FOG = new THREE.Color(0xc4d3de), NIGHT_FOG = new THREE.Color(0x070b14), DUSK_FOG = new THREE.Color(0xd9a98a);
// Jas (expozice) podle vzhledu; ACES v three.js má navíc vlastní násobek 1/0,6. Nízká grafika: ACES a jas jako dřív.
const EXPO = () => (FX.post ? LK.exposure * (LK.tone === 'aces' ? 0.6 : 1) : 0.6); // nízká: ACES jako dřív
const AMB_TINT = new THREE.Vector3(...LK.ambTint).multiplyScalar(LK.amb), SKY_AMB = new THREE.Vector3(...LK.skyAmb), GROUND_AMB = new THREE.Vector3(...LK.groundAmb);
U.skyAmb.value.copy(SKY_AMB);
U.groundAmb.value.copy(GROUND_AMB);
export function updateDay(dt) {
  advanceDay(dt);
  const elev = sunElevation();
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev * 62), THREE.MathUtils.degToRad(120 + dayTime * 360));
  skyU.sunPosition.value.copy(sunDir);
  skyU.skyGain.value = FX.post ? LK.sky.gain : 1;
  skyU.turbidity.value = lerp(LK.sky.turbidity, 9, 1 - smoothstep(0.0, 0.4, elev));
  const day = smoothstep(-0.12, 0.12, elev);
  const warm = (1 - smoothstep(0.02, 0.4, elev)) * day;
  const night = 1 - day;
  U.night.value = smoothstep(0.4, 1, night);
  if (elev >= 0) {
    U.sunDir.value.copy(sunDir);
    const k = smoothstep(-0.02, 0.12, elev) * 3.2;
    U.sunColor.value.set(k, lerp(0.92, 0.55, warm) * k, lerp(0.8, 0.28, warm) * k).multiplyScalar(LK.sun);
  } else {
    U.sunDir.value.copy(sunDir).negate();
    const k = smoothstep(0, -0.2, elev) * 0.7;
    U.sunColor.value.set(0.35 * k, 0.45 * k, 0.75 * k);
  }
  U.ambient.value.set(lerp(0.035, 0.48, day), lerp(0.05, 0.6, day), lerp(0.1, 0.86, day)).multiplyScalar(lerp(1, 0.85, warm)).multiply(AMB_TINT);
  FOG.color.copy(NIGHT_FOG).lerp(DAY_FOG, day).lerp(DUSK_FOG, warm * 0.55);
  renderer.toneMappingExposure = lerp(FX.post ? 1.75 : 1.42, 0.92, day) * EXPO();
  const sc = U.sunColor.value, am = U.ambient.value;
  sunLight.position.copy(U.sunDir.value).multiplyScalar(100);
  sunLight.color.setRGB(sc.x, sc.y, sc.z);
  sunLight.intensity = Math.PI * 0.9;
  hemi.color.setRGB(am.x, am.y, am.z);
  hemi.color.multiply(tmpC.setRGB(SKY_AMB.x, SKY_AMB.y, SKY_AMB.z));
  hemi.groundColor.setRGB(am.x * GROUND_AMB.x, am.y * GROUND_AMB.y, am.z * GROUND_AMB.z);
  hemi.intensity = Math.PI * 0.8;
  scene.environmentIntensity = 0.25 + day * 0.35;
  stars.material.opacity = smoothstep(0.3, 1, night);
  moon.material.opacity = smoothstep(0.2, 0.9, night);
  moon.position.copy(camera.position).addScaledVector(tmpV.copy(sunDir).negate(), 4000);
  const isNight = night > 0.6;
  if (isNight && !wasNight && gameTime > 1) toast('Padá noc… stínožrouti se probouzejí');
  if (!isNight && wasNight) toast(`Svítá – den ${dayCount}`);
  wasNight = isNight;
  return { night, day };
}

// Pod zemí je tma: slunce a obloha slábnou podle hloubky, svítí jen pochodně, táboráky a krystaly.
const CAVE_FOG = new THREE.Color(0x020203);
export let underground = 0;
export function applyUnderground() {
  const depth = terrainH(player.pos.x, player.pos.z) - (player.pos.y + EYE);
  underground = lerp(underground, smoothstep(1.5, 5, depth), 0.08);
  const u = underground;
  sunLight.intensity *= 1 - 0.97 * u;
  hemi.intensity *= 1 - 0.93 * u;
  scene.environmentIntensity *= 1 - 0.9 * u;
  FOG.color.lerp(CAVE_FOG, u);
  FOG.density = lerp(GFX.fog, 0.028, u);
  renderer.toneMappingExposure = lerp(renderer.toneMappingExposure, 1.58 * EXPO(), u);
  post.under = u;
}
