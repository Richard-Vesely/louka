// Povrch terénu (shader).
import './icons-food.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { MARK_X } from '../../../shared/world/terrain.js';
import { DIG_N } from '../../../shared/world/voxels.js';
import { digTex } from '../world/dig.js';
import { NOISE_GLSL, TERRAIN_GLSL } from './glsl.js';
import { scene, shaderUniforms } from './renderer.js';
import { detailTex } from './textures.js';

// ============================================================ zem
function makeGroundGeometry(N = 320, R = 3000) {
  const pos = [], idx = [];
  const map = (u) => Math.sign(u) * Math.pow(Math.abs(u), 2.2) * R;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) pos.push(map(i / N * 2 - 1), 0, map(j / N * 2 - 1));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
const groundMat = new THREE.ShaderMaterial({
  fog: true,
  side: THREE.DoubleSide,
  uniforms: shaderUniforms({ uDetail: { value: detailTex }, uDig: { value: digTex } }),
  vertexShader: /* glsl */`
    #include <fog_pars_vertex>
    varying vec3 vWorld, vN;
    varying vec4 vWa, vWb;
    varying float vLava;
    ${TERRAIN_GLSL}
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      biomeWeights(w.xz, vWa, vWb);
      w.y = terrainHW(w.xz, vWa, vWb);
      vLava = sst(13.0, 7.0, volcanoDist(w.xz)) * vWb.z; // dno kráteru = láva
      float e = 0.6;
      float hx = terrainH(w.xz + vec2(e, 0.0)) - terrainH(w.xz - vec2(e, 0.0));
      float hz = terrainH(w.xz + vec2(0.0, e)) - terrainH(w.xz - vec2(0.0, e));
      vN = normalize(vec3(-hx, 2.0 * e, -hz));
      vWorld = w.xyz;
      vec4 mvPosition = viewMatrix * w;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <common>
    #include <fog_pars_fragment>
    uniform sampler2D uDetail, uDig;
    uniform vec3 uSunDir, uSunColor, uAmbient, uCam;
    uniform float uTime, uHeadOn;
    uniform vec3 uHeadPos, uHeadDir;
    varying vec3 vWorld, vN;
    vec3 headlight(vec3 p) { vec3 L = p - uHeadPos; float d = length(L); return vec3(1.0, 0.94, 0.78) * smoothstep(0.8, 0.95, dot(L / max(d, 0.001), uHeadDir)) * (1.0 - smoothstep(8.0, 38.0, d)) * uHeadOn * 2.2; }
    varying vec4 vWa, vWb;
    varying float vLava;
    ${NOISE_GLSL}
    void main() {
      vec2 p = vWorld.xz;
      // Vykopaný sloupec: povrch se nekreslí, je vidět díra do podzemí.
      if (length(p - uCam.xz) < 46.0 && texture2D(uDig, (floor(p) + 0.5) / ${DIG_N.toFixed(1)}).r > 0.5) discard;
      float m = meadow(p);
      float fine = texture2D(uDetail, p * 0.31).r;
      float coarse = texture2D(uDetail, p * 0.023).r;
      float mk = step(${MARK_X.toFixed(1)}, p.x);
      vec3 soil = mix(vec3(0.05, 0.07, 0.02), vec3(0.09, 0.07, 0.04), smoothstep(0.45, 0.75, fine));
      soil = mix(soil, vec3(0.03, 0.04, 0.09), mk); // markdirt
      soil *= 0.6 + fine * 0.8;
      vec3 far = biomeGround(vWa, vWb, meadowColor(m, coarse, mk) * (0.8 + coarse * 0.4), coarse);
      vec3 near = biomeSoil(vWa, vWb, soil, biomeGround(vWa, vWb, vec3(0.0), fine) / max(0.001, vWa.z + vWb.x + vWb.z + vWa.y + vWa.w + vWb.y + vWb.w));
      vec3 col = mix(near, far, smoothstep(8.0, 45.0, length(p - uCam.xz)));
      float diff = max(dot(normalize(vN), uSunDir), 0.0);
      vec3 lit = col * (uAmbient * 0.9 + uSunColor * diff);
      // Láva v kráteru sopky svítí sama (pulzuje)
      if (vLava > 0.001) lit = mix(lit, vec3(1.0, 0.3, 0.04) * (1.4 + 0.5 * sin(uTime * 1.3 + p.x * 0.4) * sin(uTime * 0.9 + p.y * 0.3)) * (0.7 + fine * 0.6), vLava);
      if (uHeadOn > 0.0) lit += col * headlight(vWorld);
      gl_FragColor = vec4(lit, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
});
export const ground = new THREE.Mesh(makeGroundGeometry(), groundMat);
ground.frustumCulled = false;
scene.add(ground);
