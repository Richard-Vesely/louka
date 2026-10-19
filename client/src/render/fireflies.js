// Světlušky v noci.
import './grass.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { TERRAIN_GLSL } from './glsl.js';
import { scene, shaderUniforms } from './renderer.js';

// ============================================================ světlušky
const fireflies = (() => {
  const n = 320, seeds = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) seeds.set([(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, Math.random() * 6.28, 0.4 + Math.random() * 0.8], i * 4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: shaderUniforms(),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uNight;
      uniform vec3 uCam;
      attribute vec4 aSeed;
      varying float vA;
      ${TERRAIN_GLSL}
      void main() {
        float S = 60.0;
        vec2 base = aSeed.xy + vec2(sin(uTime * aSeed.w + aSeed.z), cos(uTime * aSeed.w * 0.8 + aSeed.z * 1.3)) * 2.0;
        vec2 wp = uCam.xz + mod(base - uCam.xz + S * 0.5, S) - S * 0.5;
        float y = terrainH(wp) + 0.6 + sin(uTime * 0.7 + aSeed.z * 3.0) * 0.4 + aSeed.z * 0.15;
        vec4 mv = viewMatrix * vec4(wp.x, y, wp.y, 1.0);
        gl_Position = projectionMatrix * mv;
        float blink = pow(max(sin(uTime * 1.6 * aSeed.w + aSeed.z * 6.28), 0.0), 3.0);
        vA = blink * uNight * (1.0 - smoothstep(20.0, 30.0, length(wp - uCam.xz)));
        gl_PointSize = clamp(70.0 / -mv.z, 1.5, 22.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(0.8, 1.0, 0.35) * a * a * vA * 2.5, 1.0);
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
})();
scene.add(fireflies);
