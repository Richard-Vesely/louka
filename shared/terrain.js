// ============================================================ terén
// Výška krajiny v každém bodě. Stejný vzorec je v JavaScriptu (fyzika, server)
// i v GLSL (vykreslení na grafické kartě) – když měníš jeden, změň i druhý!
import { smoothstep } from './math.js';

/** Výška terénu v bodě (x, z). U svatyně (střed) je rovina. */
export function terrainH(x, z) {
  const h = Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013 - 0.7) * 6.0
          + Math.sin(x * 0.027 + z * 0.018) * 2.4
          + Math.cos(z * 0.035 - x * 0.021 + 2.0) * 1.4
          + Math.sin(x * 0.071 + 0.5) * Math.sin(z * 0.064 + 1.7) * 0.5;
  return h * smoothstep(16, 70, Math.hypot(x, z));
}

/** Stejný vzorec pro grafickou kartu (shader). */
export const TERRAIN_GLSL = /* glsl */`
  float terrainH(vec2 p) {
    float h = sin(p.x * 0.011 + 1.3) * cos(p.y * 0.013 - 0.7) * 6.0
            + sin(p.x * 0.027 + p.y * 0.018) * 2.4
            + cos(p.y * 0.035 - p.x * 0.021 + 2.0) * 1.4
            + sin(p.x * 0.071 + 0.5) * sin(p.y * 0.064 + 1.7) * 0.5;
    return h * smoothstep(16.0, 70.0, length(p));
  }
`;

/** Výška, na které hráč stojí: podlaha svatyně, nebo terén. */
export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  if (r < 4.6) return 0.45;
  if (r < 9.6) return 0.2;
  return terrainH(x, z);
}

/** Jak hustý je les v bodě (x, z): 0 = louka, 1 = hustý les. */
export const forest = (x, z) => 0.5 + 0.5 * (Math.sin(x * 0.0081 + 0.4) * Math.cos(z * 0.0093 + 1.1) * 0.75 + Math.sin(x * 0.023 - z * 0.017) * 0.3);
