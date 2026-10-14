// ============================================================ zem
// Jedna velká síť, kterou shader ohne podle terénu. Posouvá se s hráčem.
import * as THREE from 'three';
import { TERRAIN_GLSL } from '@louka/shared/terrain.js';
import { scene, shaderUniforms } from '../render/renderer.js';
import { detailTex } from '../render/textures.js';
import { NOISE_GLSL } from '../render/glsl.js';

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
  uniforms: shaderUniforms({ uDetail: { value: detailTex } }),
  vertexShader: /* glsl */`
    #include <fog_pars_vertex>
    varying vec3 vWorld, vN;
    ${TERRAIN_GLSL}
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      w.y = terrainH(w.xz);
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
    uniform sampler2D uDetail;
    uniform vec3 uSunDir, uSunColor, uAmbient, uCam;
    varying vec3 vWorld, vN;
    ${NOISE_GLSL}
    void main() {
      vec2 p = vWorld.xz;
      float m = meadow(p);
      float fine = texture2D(uDetail, p * 0.31).r;
      float coarse = texture2D(uDetail, p * 0.023).r;
      vec3 soil = mix(vec3(0.05, 0.07, 0.02), vec3(0.09, 0.07, 0.04), smoothstep(0.45, 0.75, fine));
      soil *= 0.6 + fine * 0.8;
      vec3 far = meadowColor(m, coarse) * (0.8 + coarse * 0.4);
      vec3 col = mix(soil, far, smoothstep(8.0, 45.0, length(p - uCam.xz)));
      float diff = max(dot(normalize(vN), uSunDir), 0.0);
      gl_FragColor = vec4(col * (uAmbient * 0.9 + uSunColor * diff), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
});
export const ground = new THREE.Mesh(makeGroundGeometry(), groundMat);
ground.frustumCulled = false;
scene.add(ground);
