// ============================================================ textury (generované kódem)
// Žádné obrázky – všechny textury se namalují při startu hry.
import * as THREE from 'three';
import { hash2, rng } from '@louka/shared/math.js';
import { renderer } from './renderer.js';

/** Kulatá textura s přechodem (záře, měsíc). */
export function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
export const glowTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);

function noiseField(N, seed, octs = [4, 8, 16, 32, 64]) {
  const r = rng(seed);
  const layers = octs.map((s) => ({ s, g: Float32Array.from({ length: s * s }, r) }));
  const sm = (t) => t * t * (3 - 2 * t);
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0, amp = 1, norm = 0;
    for (const { s, g } of layers) {
      const fx = (x / N) * s, fy = (y / N) * s, ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = sm(fx - ix), ty = sm(fy - iy), x1 = (ix + 1) % s, y1 = (iy + 1) % s;
      const a = g[iy * s + ix], b = g[iy * s + x1], c = g[y1 * s + ix], d = g[y1 * s + x1];
      v += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
      norm += amp;
      amp *= 0.6;
    }
    out[y * N + x] = v / norm * 0.85 + r() * 0.15;
  }
  return out;
}
function canvasTexture(N, fn, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const [r, g, b] = fn(x, y);
    img.data.set([r, g, b, 255], (y * N + x) * 4);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const detailField = noiseField(256, 7);
export const detailTex = canvasTexture(256, (x, y) => { const v = detailField[y * 256 + x] * 255; return [v, v, v]; }, false);
const stoneField = noiseField(256, 99, [8, 16, 32, 64, 128]);
export const stoneTex = canvasTexture(256, (x, y) => {
  let v = 0.45 + stoneField[y * 256 + x] * 0.45;
  if (y % 64 < 3 || (x + Math.floor(y / 64) * 37) % 96 < 3) v *= 0.45;
  return [v * 168, v * 160, v * 148];
});
export const rockTex = canvasTexture(256, (x, y) => { const v = 0.4 + stoneField[y * 256 + x] * 0.6; return [v * 160, v * 155, v * 145]; });
export const cobbleTex = canvasTexture(256, (x, y) => {
  const f = stoneField[y * 256 + x], g = stoneField[((y * 3) % 256) * 256 + ((x * 3) % 256)];
  let v = 0.5 + f * 0.4;
  if (Math.abs(g - 0.5) < 0.04) v *= 0.4; // spáry mezi kameny
  return [v * 150, v * 146, v * 140];
});
const woodField = noiseField(256, 31, [2, 4, 64, 128]);
export const planksTex = canvasTexture(256, (x, y) => {
  const board = Math.floor(y / 64);
  // Kresba dřeva: vlnky podél prkna + odlišný odstín každého prkna.
  let v = 0.6 + hash2(board, 3) * 0.12 + Math.sin(x * 0.15 + board * 7 + woodField[y * 256 + x] * 6) * 0.06 + woodField[y * 256 + x] * 0.1;
  if (y % 64 < 3) v *= 0.45;
  if ((x + board * 97) % 256 < 3) v *= 0.55;
  return [v * 190, v * 140, v * 88];
});
export const bricksTex = canvasTexture(256, (x, y) => {
  const row = Math.floor(y / 32), off = row % 2 ? 32 : 0;
  const mortar = y % 32 < 3 || (x + off) % 64 < 3;
  if (mortar) return [150, 146, 138];
  const tone = 0.75 + hash2(Math.floor((x + off) / 64), row) * 0.25;
  const v = (0.6 + stoneField[y * 256 + x] * 0.4) * tone;
  return [v * 150, v * 142, v * 132];
});
