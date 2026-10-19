// Mraky: kopule kolem kamery s pomalu plujícími mraky ze šumu. Okraje proti slunci prosvítají, v noci jsou tmavé.
// Jen se střední a vysokou grafikou (FX.clouds). Hustotu a jas určuje vzhled (LK.clouds).
import * as THREE from 'three';
import { FX, LK } from './look.js';
import { U, camera, scene } from './renderer.js';

let dome = null;
const CU = { uCover: { value: LK.clouds.cover }, uSoft: { value: LK.clouds.soft }, uBright: { value: LK.clouds.bright } };
export function initClouds() {
  if (!FX.clouds || dome) return;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSunDir: U.sunDir, uSunColor: U.sunColor, uAmbient: U.ambient, uTime: U.time, uNight: U.night, uTwilight: U.twilight, uRain: U.rain, ...CU },
    transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // vždy úplně vzadu (za vším ostatním)
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir, uSunColor, uAmbient;
      uniform float uTime, uNight, uCover, uSoft, uBright, uTwilight, uRain;
      varying vec3 vDir;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        if (d.y < 0.01) discard;
        // mraky plují ve směru větru; za deště je jich víc a jsou tmavší
        vec2 p = d.xz / (d.y + 0.08) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
        float n = fbm(p);
        float cover = uCover - 0.3 * uRain;
        float c = smoothstep(cover - uSoft, cover + uSoft, n);
        if (c < 0.003) discard;
        // světlo: kus směrem ke slunci je mrak řidší = osvětlená hrana; spodek hustého mraku je tmavší
        float toward = fbm(p + normalize(uSunDir.xz + 1e-4) * 0.12);
        float lit = clamp(0.72 + (n - toward) * 2.5, 0.35, 1.1);
        float mu = max(dot(d, uSunDir), 0.0);
        // barvy bez přepalu jednotlivých kanálů (jinak u slunce vznikají duhové pruhy): jas zvlášť, barva slunce zvlášť
        float sunL = dot(uSunColor, vec3(0.3, 0.59, 0.11));
        vec3 sunHue = uSunColor / max(sunL, 1e-4);
        float sunAmt = sunL * (0.42 * lit + pow(mu, 6.0) * 0.5 * (1.0 - c * 0.5));
        vec3 sun = sunHue * min(sunAmt, 3.0);
        vec3 amb = vec3(dot(uAmbient, vec3(0.3, 0.59, 0.11))) * vec3(0.82, 0.9, 1.05) * 1.35; // mraky jsou bílé, ne v barvě stínů
        vec3 col = (amb + sun) * uBright * mix(1.0, 0.72, c * c) * (1.0 - 0.55 * uRain);
        // červánky: spodky mraků zrůžoví a zoranžoví
        col += vec3(1.0, 0.45, 0.35) * uTwilight * (0.25 + 0.35 * mu) * (1.0 - c * 0.4);
        // v noci jsou mraky jen tmavě šedomodré (měsíc)
        col *= mix(1.0, 0.55, uNight);
        float a = c * smoothstep(0.01, 0.18, d.y) * mix(0.95, 0.8, uNight);
        gl_FragColor = vec4(col, min(a + uRain * 0.3 * c, 1.0));
      }`,
  });
  dome = new THREE.Mesh(new THREE.SphereGeometry(3500, 32, 16), mat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  scene.add(dome);
}
export function updateClouds() {
  if (!dome) return;
  dome.position.copy(camera.position);
  CU.uCover.value = LK.clouds.cover; CU.uSoft.value = LK.clouds.soft; CU.uBright.value = LK.clouds.bright;
}
