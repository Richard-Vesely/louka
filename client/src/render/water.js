// Voda v rybnících: vlnky (normály z několika vln a šumu), odraz oblohy podle úhlu pohledu (Fresnel), barva podle hloubky
// a pěna u břehu. Hloubku počítá shader z výšky terénu (terrainH v glsl.js), takže nepotřebuje hloubkovou texturu.
// S nízkou grafikou zůstává jednoduchý materiál jako dřív.
import * as THREE from 'three';
import { NOISE_GLSL, TERRAIN_GLSL } from './glsl.js';
import { FX, LK } from './look.js';
import { U, scene } from './renderer.js';

const mats = [];
/** Materiál hladiny; mark = fialová voda Markovy dimenze. */
export function makeWaterMaterial(mark = false) {
  if (!FX.post) {
    const m = new THREE.MeshStandardMaterial({ color: 0x1d5288, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.86 });
    if (mark) m.color.set(0x6a3ad0);
    return m;
  }
  const W = LK.water;
  const lin = (c) => new THREE.Color().setRGB(...c, THREE.SRGBColorSpace);
  const shallow = mark ? lin([0.45, 0.25, 0.85]) : lin(W.shallow), deep = mark ? lin([0.12, 0.04, 0.3]) : lin(W.deep);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: W.rough, metalness: 0, transparent: true, depthWrite: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: U.time, uShallow: { value: shallow }, uDeep: { value: deep }, uFoam: { value: W.foam } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        uniform float uTime, uFoam;
        uniform vec3 uShallow, uDeep;
        ${TERRAIN_GLSL}
        ${NOISE_GLSL}
        // výška vln: pár dlouhých vln + drobné vlnky ze šumu
        float waveH(vec2 p) {
          float t = uTime;
          float h = sin(dot(p, vec2(0.62, 0.31)) + t * 1.3) * 0.030 + sin(dot(p, vec2(-0.27, 0.71)) * 1.7 + t * 1.7) * 0.018
                  + sin(dot(p, vec2(0.91, -0.53)) * 2.9 + t * 2.6) * 0.008;
          h += (vnoise(p * 2.3 + vec2(t * 0.35, t * 0.2)) + vnoise(p * 4.1 - vec2(t * 0.25, -t * 0.4))) * 0.012;
          return h;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float depth = max(vWPos.y - terrainH(vWPos.xz), 0.0);
        float kD = 1.0 - exp(-depth * 0.85);
        diffuseColor.rgb = mix(uShallow, uDeep, kD);
        // pěna: tenký rozbitý lem u břehu, který pomalu dýchá, a pár chuchvalců kousek od něj
        float fn = vnoise(vWPos.xz * 3.1 + uTime * 0.35) * 0.6 + vnoise(vWPos.xz * 7.3 - uTime * 0.5) * 0.4;
        float edge = 0.12 + 0.05 * sin(uTime * 0.9 + vWPos.x * 0.7);
        float foam = smoothstep(edge, 0.0, depth) * smoothstep(0.35, 0.65, fn) * uFoam;
        foam += smoothstep(0.45, 0.2, depth) * smoothstep(0.7, 0.85, fn) * 0.5 * uFoam;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.96, 1.0), clamp(foam, 0.0, 1.0));
        diffuseColor.a = mix(0.3, 0.9, 1.0 - exp(-depth * 1.8));
        diffuseColor.a = max(diffuseColor.a, clamp(foam, 0.0, 1.0));`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        {
          float e = 0.06, h0 = waveH(vWPos.xz);
          vec3 wn = normalize(vec3(h0 - waveH(vWPos.xz + vec2(e, 0.0)), e, h0 - waveH(vWPos.xz + vec2(0.0, e))));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
          // Fresnel: při pohledu zešikma voda víc odráží (a míň je vidět dno)
          vec3 V = normalize(cameraPosition - vWPos);
          float F = 0.02 + 0.98 * pow(1.0 - max(dot(wn, V), 0.0), 5.0);
          diffuseColor.a = diffuseColor.a + (1.0 - diffuseColor.a) * F;
        }`);
  };
  mats.push(m);
  return m;
}
/** Každý snímek: voda odráží aktuální oblohu (prostředí se přepočítává jednou za pár sekund). */
export function updateWater() {
  for (const m of mats) {
    if (m.envMap !== scene.environment) { m.envMap = scene.environment; m.needsUpdate = !m.userData.hadEnv; m.userData.hadEnv = true; }
    m.envMapIntensity = 0.35 + 0.9 * (1 - U.night.value * 0.85);
  }
}
