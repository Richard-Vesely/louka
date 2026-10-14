// ============================================================ tráva
// Statisíce stébel, která kreslí grafická karta. Stébla "jezdí" s hráčem (opakují se po `area` metrech).
import * as THREE from 'three';
import { TERRAIN_GLSL } from '@louka/shared/terrain.js';
import { scene, shaderUniforms } from '../render/renderer.js';
import { NOISE_GLSL } from '../render/glsl.js';

/** Dvě vrstvy trávy: hustá u hráče, řidší dál. */
export const GRASS_LAYERS = [
  { area: 32, count: 150000, seg: 4, width: [0.007, 0.016], height: [0.25, 0.6], fadeIn: [0, 0], fadeOut: [7, 15.5], flowers: 0.006 },
  { area: 96, count: 100000, seg: 2, width: [0.022, 0.04], height: [0.25, 0.6], fadeIn: [5, 14], fadeOut: [26, 46], flowers: 0.01 },
];

// Maska posekané trávy: 0,5 m na pixel, opakuje se po 128 m. Tráva postupně doroste.
const CUT_N = 256, CUT_WORLD = 128;
const cutData = new Uint8Array(CUT_N * CUT_N);
const cutTex = new THREE.DataTexture(cutData, CUT_N, CUT_N, THREE.RedFormat, THREE.UnsignedByteType);
cutTex.wrapS = cutTex.wrapT = THREE.RepeatWrapping;
cutTex.magFilter = cutTex.minFilter = THREE.LinearFilter;
cutTex.needsUpdate = true;
const cutIndex = (x, z) => {
  const px = ((Math.floor((x / CUT_WORLD) * CUT_N) % CUT_N) + CUT_N) % CUT_N;
  const pz = ((Math.floor((z / CUT_WORLD) * CUT_N) % CUT_N) + CUT_N) % CUT_N;
  return pz * CUT_N + px;
};

/** Je tráva v bodě (x, z) posekaná? */
export const isCut = (x, z) => cutData[cutIndex(x, z)] > 120;

/** Poseká trávu v kruhu o poloměru `r` kolem (x, z). */
export function cutGrass(x, z, r = 0.9) {
  const step = CUT_WORLD / CUT_N;
  for (let dz = -r; dz <= r; dz += step) for (let dx = -r; dx <= r; dx += step) if (dx * dx + dz * dz <= r * r) cutData[cutIndex(x + dx, z + dz)] = 255;
  cutTex.needsUpdate = true;
}

let regrowT = 0;
/** Posekaná tráva pomalu dorůstá (každé 2 s o kousek). */
export function regrowGrass(dt) {
  if ((regrowT += dt) < 2) return;
  regrowT = 0;
  let any = false;
  for (let i = 0; i < cutData.length; i++) if (cutData[i]) { cutData[i] = Math.max(0, cutData[i] - 2); any = true; }
  if (any) cutTex.needsUpdate = true;
}

function makeGrass(layer) {
  const { area, count, seg: SEG } = layer;
  const rand = (r) => r[0] + Math.random() * (r[1] - r[0]);
  const pos = [];
  for (let i = 0; i < SEG; i++) { const t = i / SEG, w = 1 - Math.pow(t, 1.4); pos.push(-w, t, 0, w, t, 0); }
  pos.push(0, 1, 0);
  const index = [];
  for (let i = 0; i < SEG - 1; i++) { const a = 2 * i; index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  index.push(2 * (SEG - 1), 2 * (SEG - 1) + 1, 2 * SEG);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  const offsets = new Float32Array(count * 2), params = new Float32Array(count * 4), extra = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    offsets[i * 2] = (Math.random() - 0.5) * area;
    offsets[i * 2 + 1] = (Math.random() - 0.5) * area;
    const flower = Math.random() < layer.flowers ? 1 + Math.floor(Math.random() * 3) : 0;
    params.set([rand(layer.height) * (flower ? 1.3 : 1), Math.random() * Math.PI * 2, Math.random() * 0.45, rand(layer.width) * (flower ? 2 : 1)], i * 4);
    extra.set([Math.random(), flower], i * 2);
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
  geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4));
  geo.setAttribute('aExtra', new THREE.InstancedBufferAttribute(extra, 2));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    fog: true,
    side: THREE.DoubleSide,
    uniforms: shaderUniforms({ uSize: { value: area }, uFade: { value: new THREE.Vector4(...layer.fadeIn, ...layer.fadeOut) }, uCut: { value: cutTex } }),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      uniform float uTime, uSize;
      uniform vec3 uCam;
      uniform vec4 uFade;
      uniform sampler2D uCut;
      attribute vec2 aOffset, aExtra;
      attribute vec4 aParams;
      varying float vT, vVar, vFlower, vMeadow;
      varying vec3 vNormal, vWorld;
      ${NOISE_GLSL}
      ${TERRAIN_GLSL}
      void main() {
        vec2 wp = uCam.xz + mod(aOffset - uCam.xz + uSize * 0.5, uSize) - uSize * 0.5;
        float t = position.y;
        float m = meadow(wp);
        float h = aParams.x * (0.45 + 0.95 * m);
        float dist = length(wp - uCam.xz);
        float keep = 1.0 - smoothstep(uFade.z, uFade.w, dist);
        if (uFade.y > 0.0) keep *= smoothstep(uFade.x, uFade.y, dist);
        h *= step(fract(aExtra.x * 7.31), keep);
        h *= smoothstep(9.7, 10.4, length(wp));
        h *= 1.0 - smoothstep(0.3, 0.55, texture2D(uCut, wp / ${CUT_WORLD.toFixed(1)}).r); // posekaná tráva
        vec2 dir = vec2(cos(aParams.y), sin(aParams.y));
        vec2 side = vec2(-dir.y, dir.x);
        vec2 windDir = normalize(vec2(1.0, 0.35));
        float gust = vnoise(wp * 0.045 - windDir * uTime * 0.8);
        float sway = sin(uTime * 2.3 + dot(wp, windDir) * 0.7 + aParams.y * 3.0) * 0.18;
        vec2 bend = dir * aParams.z + windDir * (gust * gust * 1.3 + sway);
        float k = t * t;
        vec3 local;
        local.xz = side * position.x * aParams.w + bend * k * h;
        local.y = t * h * (1.0 - 0.3 * k * min(length(bend), 1.0));
        vec3 world = vec3(wp.x, terrainH(wp), wp.y) + local;
        vNormal = normalize(vec3(dir.x, 0.35 + t * 0.6, dir.y));
        vT = t; vVar = aExtra.x; vFlower = aExtra.y; vMeadow = m; vWorld = world;
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uSunDir, uSunColor, uAmbient;
      varying float vT, vVar, vFlower, vMeadow;
      varying vec3 vNormal, vWorld;
      ${NOISE_GLSL}
      void main() {
        vec3 base = vec3(0.03, 0.06, 0.012);
        vec3 tip = meadowColor(vMeadow, vVar) * (0.8 + vVar * 0.4);
        vec3 col = mix(base, tip, smoothstep(0.0, 0.9, vT));
        if (vFlower > 0.5 && vT > 0.8) {
          col = vFlower < 1.5 ? vec3(0.95, 0.72, 0.08) : vFlower < 2.5 ? vec3(0.92, 0.92, 0.88) : vec3(0.45, 0.24, 0.75);
        }
        float diff = abs(dot(normalize(vNormal), uSunDir)) * 0.55 + 0.45;
        float ao = mix(0.3, 1.0, smoothstep(0.0, 0.7, vT));
        vec3 lit = col * (uAmbient + uSunColor * diff) * ao;
        vec3 view = normalize(vWorld - cameraPosition);
        lit += col * uSunColor * pow(max(dot(view, uSunDir), 0.0), 5.0) * vT * 0.9;
        gl_FragColor = vec4(lit, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

/** Vrstvy trávy ve scéně (při nízkém FPS se jim ubírá stébel). */
export const grassLayers = GRASS_LAYERS.map(makeGrass);
grassLayers.forEach((g) => scene.add(g));
