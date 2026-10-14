// Kousky shaderového kódu (GLSL) pro louku: šum a barva trávy.
// Výška terénu v GLSL je v shared/terrain.js (vedle stejného vzorce v JavaScriptu).

export const NOISE_GLSL = /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float meadow(vec2 p) { return vnoise(p * 0.07) * 0.65 + vnoise(p * 0.29) * 0.35; }
  vec3 meadowColor(float m, float v) {
    return mix(vec3(0.09, 0.22, 0.03), vec3(0.30, 0.29, 0.09), smoothstep(0.3, 0.9, (1.0 - m) * 0.75 + v * 0.35));
  }
`;
