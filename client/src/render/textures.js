// Textury bloků generované kódem.
import './sky.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { hash2, rng } from '../../../shared/util.js';
import { renderer } from './renderer.js';

// ============================================================ textury (generované kódem)
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
export const stoneField = noiseField(256, 99, [8, 16, 32, 64, 128]);
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
export const dirtTex = canvasTexture(256, (x, y) => {
  const v = 0.66 + stoneField[y * 256 + x] * 0.42 + (hash2(x, y) - 0.5) * 0.12;
  return [120 * v, 86 * v, 58 * v];
});
// Přebarvená kopie textury (pro modré bloky Markovy dimenze).
function tintTexture(src, filter) {
  const c = document.createElement('canvas');
  c.width = src.image.width; c.height = src.image.height;
  const g = c.getContext('2d');
  g.filter = filter;
  g.drawImage(src.image, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const markPlanksTex = tintTexture(planksTex, 'hue-rotate(185deg) saturate(1.4) brightness(0.95)');
// Orná půda: tmavá zemina s brázdami
export const farmlandTex = canvasTexture(256, (x, y) => {
  const furrow = Math.abs(((y % 32) - 16) / 16);
  const v = (0.42 + furrow * 0.3) * (0.8 + stoneField[y * 256 + x] * 0.35);
  return [110 * v, 74 * v, 46 * v];
});
export const markdirtTex = tintTexture(dirtTex, 'hue-rotate(195deg) saturate(1.6) brightness(0.8)');
export const bricksTex = canvasTexture(256, (x, y) => {
  const row = Math.floor(y / 32), off = row % 2 ? 32 : 0;
  const mortar = y % 32 < 3 || (x + off) % 64 < 3;
  if (mortar) return [150, 146, 138];
  const tone = 0.75 + hash2(Math.floor((x + off) / 64), row) * 0.25;
  const v = (0.6 + stoneField[y * 256 + x] * 0.4) * tone;
  return [v * 150, v * 142, v * 132];
});

// ============================================================ textury nových stavebních bloků (generované kódem)
const speckField = noiseField(256, 211, [16, 32, 64, 128]);
const veinField = noiseField(256, 307, [2, 4, 8, 16]);
// Žula: narůžovělá se zrnky živce, slídy a křemene
export const graniteTex = canvasTexture(256, (x, y) => {
  const n = speckField[y * 256 + x], h = hash2(x * 5 + 3, y * 11 + 7);
  if (h > 0.93) return [40, 34, 34]; // tmavá slída
  if (h < 0.07) return [236, 230, 222]; // světlý křemen
  const v = 0.78 + n * 0.3;
  return [176 * v, 128 * v, 112 * v];
});
// Mramor: bílý s šedými žilkami
const marbleVein = (x, y) => Math.abs(Math.sin((x * 0.03 + y * 0.018 + veinField[y * 256 + x] * 5) * Math.PI));
export const marbleTex = canvasTexture(256, (x, y) => {
  const d = marbleVein(x, y), v = 0.92 + speckField[y * 256 + x] * 0.08;
  const k = d < 0.06 ? 0.62 : d < 0.13 ? 0.82 : 1;
  return [236 * v * k, 234 * v * k, 230 * v * k];
});
// Čedič: tmavý, se svislými sloupcovitými puklinami
export const basaltTex = canvasTexture(256, (x, y) => {
  const v = 0.55 + stoneField[y * 256 + x] * 0.35 + (hash2(x, y) - 0.5) * 0.08;
  const crack = (x + Math.floor(y / 64) * 21) % 64 < 2 || (y % 64 < 2 && hash2(Math.floor(x / 64), Math.floor(y / 64)) > 0.5);
  return crack ? [26, 26, 30] : [72 * v, 72 * v, 78 * v];
});
// Leštěné verze: hladší, s jemným okrajem desky
const polished = (src, k = 1) => (x, y) => {
  const edge = x % 128 < 3 || y % 128 < 3 ? 0.78 : x % 128 > 124 || y % 128 > 124 ? 1.08 : 1;
  const c = src(x, y);
  return [c[0] * edge * k, c[1] * edge * k, c[2] * edge * k];
};
const smoothStone = (x, y) => { const v = 0.7 + stoneField[y * 256 + x] * 0.12; return [158 * v, 156 * v, 152 * v]; };
export const polishedStoneTex = canvasTexture(256, polished(smoothStone));
export const polishedGraniteTex = canvasTexture(256, polished((x, y) => { const h = hash2(x * 5 + 3, y * 11 + 7); return h > 0.95 ? [60, 50, 50] : h < 0.05 ? [240, 232, 226] : [190, 136, 118]; }));
export const polishedMarbleTex = canvasTexture(256, polished((x, y) => { const d = marbleVein(x, y); const k = d < 0.05 ? 0.7 : 1; return [244 * k, 242 * k, 238 * k]; }));
export const polishedBasaltTex = canvasTexture(256, polished((x, y) => { const v = 0.6 + stoneField[y * 256 + x] * 0.15; return [66 * v, 66 * v, 72 * v]; }));
// Dlaždice: mřížka 4×4 desek se spárami
export const stoneTilesTex = canvasTexture(256, (x, y) => {
  if (x % 64 < 3 || y % 64 < 3) return [92, 90, 86];
  const t = 0.92 + hash2(Math.floor(x / 64), Math.floor(y / 64)) * 0.14;
  const c = smoothStone(x, y);
  return [c[0] * t, c[1] * t, c[2] * t];
});
// Mramorový sloup: svislé kanelury
export const marblePillarTex = canvasTexture(256, (x, y) => {
  const f = 0.82 + 0.18 * Math.cos(((x % 32) / 32) * Math.PI * 2);
  const band = y < 14 || y > 241 ? 0.86 : 1;
  return [238 * f * band, 236 * f * band, 232 * f * band];
});
// Železný blok: kovové desky s nýty
export const ironBlockTex = canvasTexture(256, (x, y) => {
  const lx = x % 128, ly = y % 128;
  if (lx < 3 || ly < 3) return [70, 72, 76];
  const rivet = Math.hypot(lx - 14, ly - 14) < 5 || Math.hypot(lx - 114, ly - 14) < 5 || Math.hypot(lx - 14, ly - 114) < 5 || Math.hypot(lx - 114, ly - 114) < 5;
  const v = (rivet ? 1.12 : 0.86) + stoneField[y * 256 + x] * 0.08 - ly * 0.0009;
  return [188 * v, 192 * v, 198 * v];
});
// Trám: kůra po stranách, letokruhy na čelech
export const barkTex = canvasTexture(256, (x, y) => {
  const v = 0.6 + woodField[((y * 2) & 255) * 256 + ((x * 3) & 255)] * 0.3 + (x % 32 < 4 ? -0.18 : 0) + Math.sin(y * 0.08 + x) * 0.03;
  return [104 * v * 1.15, 76 * v * 1.15, 46 * v * 1.15];
});
export const ringsTex = canvasTexture(256, (x, y) => {
  const d = Math.hypot(x - 127.5, y - 127.5);
  if (d > 118) return [96, 70, 42];
  const ring = 0.85 + 0.15 * Math.sin(d * 0.45 + woodField[y * 256 + x] * 3);
  return [188 * ring, 150 * ring, 98 * ring];
});
export const markBarkTex = tintTexture(barkTex, 'hue-rotate(185deg) saturate(1.3) brightness(0.9)');
export const markRingsTex = tintTexture(ringsTex, 'hue-rotate(185deg) saturate(1.3)');

// ============================================================ textury bloků z biomů
// Jako canvasTexture, ale s průhledností (sklo)
function canvasTextureA(N, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const [r, g, b, a] = fn(x, y); img.data.set([r, g, b, a], (y * N + x) * 4); }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
export const sandTex = canvasTexture(256, (x, y) => { const v = 0.82 + stoneField[y * 256 + x] * 0.16 + (hash2(x, y) - 0.5) * 0.1; return [218 * v, 190 * v, 132 * v]; });
export const sandstoneTex = canvasTexture(256, (x, y) => {
  const layer = Math.sin(y * 0.19 + stoneField[y * 256 + x] * 2.5) * 0.06, v = 0.82 + layer + stoneField[y * 256 + x] * 0.12;
  return y % 64 < 3 ? [150, 120, 80] : [214 * v, 182 * v, 124 * v];
});
export const smoothSandstoneTex = canvasTexture(256, (x, y) => {
  const edge = x % 256 < 4 || y % 256 < 4 || x > 251 || y > 251 ? 0.82 : 1, v = (0.9 + stoneField[y * 256 + x] * 0.08) * edge;
  return [222 * v, 192 * v, 136 * v];
});
export const glassTex = canvasTextureA(64, (x, y) => {
  if (x < 3 || y < 3 || x > 60 || y > 60) return [236, 244, 250, 235]; // rámeček
  const streak = Math.abs(x - y - 12) < 2 || Math.abs(x - y + 20) < 1 ? 70 : 0; // odlesk
  return [200, 228, 240, 36 + streak];
});
export const snowTex = canvasTexture(256, (x, y) => { const v = 0.9 + stoneField[y * 256 + x] * 0.1 + (hash2(x, y) - 0.5) * 0.04; return [238 * v, 244 * v, 250 * v]; });
export const obsidianTex = canvasTexture(256, (x, y) => {
  const v = 0.35 + stoneField[y * 256 + x] * 0.5, shine = hash2(x * 3, y * 5) > 0.985 ? 2.4 : 1;
  return [34 * v * shine, 20 * v * shine, 52 * v * shine];
});
export const mushroomCapTex = canvasTexture(256, (x, y) => {
  const spot = Math.hypot((x % 64) - 32 + (Math.floor(y / 64) % 2) * 10, (y % 64) - 30) < 11;
  const v = 0.85 + stoneField[y * 256 + x] * 0.2;
  return spot ? [236 * v, 230 * v, 220 * v] : [184 * v, 36 * v, 30 * v];
});
export const mushroomStemTex = canvasTexture(256, (x, y) => { const v = 0.86 + Math.sin(x * 0.6) * 0.04 + stoneField[y * 256 + x] * 0.1; return [228 * v, 222 * v, 206 * v]; });
export const roofTilesTex = canvasTexture(256, (x, y) => {
  const row = Math.floor(y / 32), lx = (x + (row % 2) * 16) % 32, ly = y % 32;
  const arc = Math.hypot(lx - 16, ly - 34) < 18 ? 1 : 0.7; // oblouk tašky, spodek je ve stínu další řady
  const v = (0.75 + stoneField[y * 256 + x] * 0.25) * arc * (0.85 + hash2(Math.floor((x + (row % 2) * 16) / 32), row) * 0.25);
  return [178 * v, 74 * v, 46 * v];
});
export const concreteTex = canvasTexture(256, (x, y) => { const v = 0.86 + stoneField[y * 256 + x] * 0.12 + (hash2(x, y) - 0.5) * 0.05; return [236 * v, 236 * v, 232 * v]; });
export const cherryPlanksTex = tintTexture(planksTex, 'hue-rotate(-28deg) saturate(1.15) brightness(1.18)');
export const junglePlanksTex = tintTexture(planksTex, 'hue-rotate(-8deg) saturate(1.35) brightness(0.82)');
export const acaciaPlanksTex = tintTexture(planksTex, 'hue-rotate(-14deg) saturate(1.9) brightness(1.05)');

// ============================================================ textury kovových a křemenných bloků
const metalPlates = (base, k = 128) => (x, y) => {
  const lx = x % k, ly = y % k;
  if (lx < 3 || ly < 3) return base.map((v) => v * 0.55);
  const v = 0.86 + stoneField[y * 256 + x] * 0.12 + (lx < 10 || ly < 10 ? 0.12 : 0) - ly * 0.0006;
  return base.map((c) => c * v);
};
export const copperBlockTex = canvasTexture(256, metalPlates([216, 120, 66], 256));
export const cutCopperTex = canvasTexture(256, metalPlates([206, 114, 62], 64));
export const goldBlockTex = canvasTexture(256, metalPlates([246, 200, 70], 128));
export const steelBlockTex = canvasTexture(256, metalPlates([150, 160, 172], 128));
export const quartzTex = canvasTexture(256, (x, y) => { const v = 0.92 + stoneField[y * 256 + x] * 0.06 + (hash2(x >> 2, y >> 2) > 0.93 ? 0.05 : 0); return [242 * v, 238 * v, 234 * v]; });
export const quartzPillarTex = canvasTexture(256, (x, y) => { const f = 0.88 + 0.1 * Math.cos(((x % 42) / 42) * Math.PI * 2); return [244 * f, 240 * f, 236 * f]; });

// Normálová mapa z jasu textury (Sobel): tmavé spáry a praskliny jsou hlubší, takže na bloky dopadá světlo s reliéfem.
// tile = šířka dlaždice v atlasu (sousední dlaždice se nemíchají). Jen se střední a vysokou grafikou (vzhled, LK.normals).
const normalCache = new Map();
export function normalMapFrom(tex, tile = 0) {
  if (normalCache.has(tex)) return normalCache.get(tex);
  const img = tex.image, W = img.width, H = img.height;
  const src = (img.getContext ? img : (() => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(img, 0, 0); return c; })()).getContext('2d').getImageData(0, 0, W, H).data;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = (src[i * 4] * 0.3 + src[i * 4 + 1] * 0.59 + src[i * 4 + 2] * 0.11) / 255;
  const T = tile || W;
  const at = (x, y) => { const tx = Math.floor(x / T) * T; x = tx + ((x - tx) % T + T) % T; y = ((y % H) + H) % H; return lum[y * W + x]; };
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), out = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tx = Math.floor(x / T) * T, lx = x - tx, xl = tx + ((lx - 1 + T) % T), xr = tx + ((lx + 1) % T);
    const dx = (at(xr, y - 1) + 2 * at(xr, y) + at(xr, y + 1)) - (at(xl, y - 1) + 2 * at(xl, y) + at(xl, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    const nx = -dx * 2.2, ny = dy * 2.2, nz = 1, l = Math.hypot(nx, ny, nz);
    out.data.set([(nx / l * 0.5 + 0.5) * 255, (ny / l * 0.5 + 0.5) * 255, (nz / l * 0.5 + 0.5) * 255, 255], (y * W + x) * 4);
  }
  g.putImageData(out, 0, 0);
  const n = new THREE.CanvasTexture(c);
  n.wrapS = tex.wrapS; n.wrapT = tex.wrapT;
  n.anisotropy = tex.anisotropy;
  normalCache.set(tex, n);
  return n;
}
