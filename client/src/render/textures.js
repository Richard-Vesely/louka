// Textury bloků generované kódem. Každý pixel má barvu a (u bloků) i výšku reliéfu, drsnost a kov:
// z nich materials.js udělá normálovou mapu a mapu drsnosti (spáry jsou zapuštěné, kov se leskne, kámen je drsný).
import './sky.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { clamp, hash2 } from '../../../shared/util.js';
import { renderer } from './renderer.js';
import { noiseField, worley } from './texgen.js';

// ============================================================ textury (generované kódem)
// fn(x, y) vrací [r, g, b] nebo [r, g, b, výška 0–1, drsnost 0–1, kov 0–1]; výška/drsnost/kov se uloží do userData.pbr.
function canvasTexture(N, fn, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  let h = null, rough = null, metal = null;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const p = fn(x, y), i = y * N + x;
    img.data[i * 4] = clamp(p[0], 0, 255); img.data[i * 4 + 1] = clamp(p[1], 0, 255); img.data[i * 4 + 2] = clamp(p[2], 0, 255); img.data[i * 4 + 3] = 255;
    if (p.length > 3) { h ||= new Float32Array(N * N); h[i] = clamp(p[3], 0, 1); }
    if (p.length > 4) { rough ||= new Float32Array(N * N); rough[i] = p[4]; }
    if (p.length > 5) { metal ||= new Float32Array(N * N); metal[i] = p[5]; }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (h) t.userData.pbr = { h, rough, metal };
  return t;
}
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const detailField = noiseField(256, 7);
export const detailTex = canvasTexture(256, (x, y) => { const v = detailField[y * 256 + x] * 255; return [v, v, v]; }, false);
export const stoneField = noiseField(256, 99, [8, 16, 32, 64, 128]);
const smoothField = noiseField(256, 101, [4, 8, 16, 32, 64], 0); // hladký šum pro reliéf (bez zrnění)
const fineField = noiseField(256, 103, [32, 64, 128], 0.1);
const F = (f, x, y) => f[(y & 255) * 256 + (x & 255)];
export const stoneTex = canvasTexture(256, (x, y) => {
  let v = 0.45 + stoneField[y * 256 + x] * 0.45;
  if (y % 64 < 3 || (x + Math.floor(y / 64) * 37) % 96 < 3) v *= 0.45;
  return [v * 168, v * 160, v * 148];
});
export const rockTex = canvasTexture(256, (x, y) => { const v = 0.4 + stoneField[y * 256 + x] * 0.6; return [v * 160, v * 155, v * 145]; });
// Dlažební kámen: oblé kameny různých odstínů, mezi nimi zapuštěné spáry
const cobbleCells = worley(256, 7, 41);
export const cobbleTex = canvasTexture(256, (x, y) => {
  const i = y * 256 + x, edge = cobbleCells.f2[i] - cobbleCells.f1[i], id = cobbleCells.id[i];
  const gap = sm(3.2, 1.2, edge), bulge = Math.sqrt(Math.min(edge, 14) / 14);
  const v = (0.62 + id * 0.3 + (F(smoothField, x * 2, y * 2) - 0.5) * 0.25 + (fineField[i] - 0.5) * 0.15) * (1 - 0.55 * gap);
  const warm = (id - 0.5) * 0.1;
  return [150 * v * (1 + warm), 146 * v, 140 * v * (1 - warm), bulge * 0.8 + fineField[i] * 0.15 - gap * 0.3, 0.88 + gap * 0.1];
});
const woodField = noiseField(256, 31, [2, 4, 64, 128]);
// Prkna: 4 prkna s drážkami, kresba let, suky, hřebíky na koncích; každé prkno trochu jiný odstín
export const planksTex = canvasTexture(256, (x, y) => {
  const board = Math.floor(y / 64), ly = y % 64, joint = (x + board * 97) % 256;
  const grain = Math.sin(x * 0.15 + board * 7 + woodField[y * 256 + x] * 6) * 0.06 + Math.sin(ly * 0.9 + woodField[y * 256 + x] * 9) * 0.025;
  const kx = (board * 61 + 40) % 256, knot = Math.hypot((x - kx) * 0.5, ly - 30) < 6 ? 0.78 : 1;
  let v = (0.6 + hash2(board, 3) * 0.12 + grain + woodField[y * 256 + x] * 0.1) * knot;
  const seam = ly < 3 || joint < 3, nail = (Math.hypot(joint - 9, ly - 10) < 2.2 || Math.hypot(joint - 9, ly - 54) < 2.2);
  if (seam) v *= 0.45;
  if (nail) return [70, 66, 62, 0.75, 0.4, 1];
  const bevel = sm(0, 6, Math.min(ly, 63 - ly)) * sm(0, 6, Math.min(joint, 255 - joint));
  return [v * 190, v * 140, v * 88, seam ? 0.05 : 0.45 + bevel * 0.3 + grain * 0.8, 0.68 + (knot < 1 ? 0.05 : 0)];
});
export const dirtTex = canvasTexture(256, (x, y) => {
  const i = y * 256 + x, peb = cobbleCells.f1[(y * 3 & 255) * 256 + (x * 3 & 255)] < 5 && cobbleCells.id[(y * 3 & 255) * 256 + (x * 3 & 255)] < 0.3;
  const v = 0.66 + stoneField[i] * 0.42 + (hash2(x, y) - 0.5) * 0.12;
  return peb ? [134 * v, 112 * v, 92 * v, 0.8, 0.8] : [120 * v, 86 * v, 58 * v, 0.3 + F(smoothField, x * 3, y * 3) * 0.4, 0.96];
});
// Přebarvená kopie textury (pro modré bloky Markovy dimenze, třešňová a jiná prkna); reliéf zůstane stejný.
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
  if (src.userData.pbr) t.userData.pbr = src.userData.pbr;
  return t;
}
export const markPlanksTex = tintTexture(planksTex, 'hue-rotate(185deg) saturate(1.4) brightness(0.95)');
// Orná půda: tmavá zemina s brázdami
export const farmlandTex = canvasTexture(256, (x, y) => {
  const furrow = Math.abs(((y % 32) - 16) / 16);
  const v = (0.42 + furrow * 0.3) * (0.8 + stoneField[y * 256 + x] * 0.35);
  return [110 * v, 74 * v, 46 * v, furrow * 0.8 + fineField[y * 256 + x] * 0.2, 0.97];
});
export const markdirtTex = tintTexture(dirtTex, 'hue-rotate(195deg) saturate(1.6) brightness(0.8)');
// Cihly: zapuštěná malta, sražené hrany cihel, každá cihla jiný odstín (teplá šedá s nádechem do červena)
export const bricksTex = canvasTexture(256, (x, y) => {
  const row = Math.floor(y / 32), off = row % 2 ? 32 : 0, lx = (x + off) % 64, ly = y % 32;
  const d = Math.min(lx, 63 - lx, ly, 31 - ly); // vzdálenost od spáry
  const i = y * 256 + x;
  if (d < 2.5) { const m = 0.9 + fineField[i] * 0.2; return [150 * m, 146 * m, 138 * m, 0.08 + fineField[i] * 0.1, 0.95]; }
  const id = hash2(Math.floor((x + off) / 64), row), tone = 0.75 + id * 0.25, red = 1 + (hash2(row, Math.floor((x + off) / 64) + 9) - 0.4) * 0.16;
  const v = (0.6 + stoneField[i] * 0.4) * tone;
  const chamfer = sm(2.5, 6, d), pit = F(smoothField, x * 3, y * 3) < 0.3 ? 0.08 : 0;
  return [v * 156 * red, v * 140, v * 128 / red, 0.35 + chamfer * 0.45 + fineField[i] * 0.12 - pit, 0.82];
});

// ============================================================ textury nových stavebních bloků (generované kódem)
const speckField = noiseField(256, 211, [16, 32, 64, 128]);
const veinField = noiseField(256, 307, [2, 4, 8, 16]);
// Žula: narůžovělá se zrnky živce, slídy (lesklá) a křemene
export const graniteTex = canvasTexture(256, (x, y) => {
  const n = speckField[y * 256 + x], h = hash2(x * 5 + 3, y * 11 + 7), s = F(smoothField, x, y);
  if (h > 0.93) return [40, 34, 34, 0.45 + s * 0.3, 0.3]; // tmavá slída
  if (h < 0.07) return [236, 230, 222, 0.6 + s * 0.3, 0.55]; // světlý křemen
  const v = 0.78 + n * 0.3;
  return [176 * v, 128 * v, 112 * v, 0.5 + s * 0.35 + n * 0.1, 0.82];
});
// Mramor: bílý s šedými žilkami
const marbleVein = (x, y) => Math.abs(Math.sin((x * 0.03 + y * 0.018 + veinField[y * 256 + x] * 5) * Math.PI));
export const marbleTex = canvasTexture(256, (x, y) => {
  const d = marbleVein(x, y), v = 0.92 + speckField[y * 256 + x] * 0.08;
  const k = d < 0.06 ? 0.62 : d < 0.13 ? 0.82 : 1;
  return [236 * v * k, 234 * v * k, 230 * v * k, 0.6 + F(smoothField, x, y) * 0.3 - (1 - k) * 0.1, 0.42];
});
// Čedič: tmavý, se svislými sloupcovitými puklinami
export const basaltTex = canvasTexture(256, (x, y) => {
  const v = 0.55 + stoneField[y * 256 + x] * 0.35 + (hash2(x, y) - 0.5) * 0.08;
  const crack = (x + Math.floor(y / 64) * 21) % 64 < 2 || (y % 64 < 2 && hash2(Math.floor(x / 64), Math.floor(y / 64)) > 0.5);
  const cx = (x + Math.floor(y / 64) * 21) % 64, bevel = sm(1, 6, Math.min(cx, 63 - cx));
  return crack ? [34, 34, 38, 0.05, 0.95] : [72 * v, 72 * v, 78 * v, 0.4 + bevel * 0.35 + F(smoothField, x * 2, y * 2) * 0.25, 0.88];
});
// Leštěné verze: hladší, s jemně sraženým okrajem desky (zrcadlí víc, viz materials.js)
const polished = (src, k = 1) => (x, y) => {
  const lx = x % 128, ly = y % 128, d = Math.min(lx, 127 - lx, ly, 127 - ly);
  const edge = d < 3 ? (lx < 3 || ly < 3 ? 0.78 : 1.08) : 1;
  const c = src(x, y);
  return [c[0] * edge * k, c[1] * edge * k, c[2] * edge * k, d < 1.5 ? 0.1 : 0.4 + sm(1.5, 6, d) * 0.5 + F(smoothField, x, y) * 0.05];
};
const smoothStone = (x, y) => { const v = 0.7 + stoneField[y * 256 + x] * 0.12; return [158 * v, 156 * v, 152 * v]; };
export const polishedStoneTex = canvasTexture(256, polished(smoothStone));
export const polishedGraniteTex = canvasTexture(256, polished((x, y) => { const h = hash2(x * 5 + 3, y * 11 + 7); return h > 0.95 ? [60, 50, 50] : h < 0.05 ? [240, 232, 226] : [190, 136, 118]; }));
export const polishedMarbleTex = canvasTexture(256, polished((x, y) => { const d = marbleVein(x, y); const k = d < 0.05 ? 0.7 : 1; return [244 * k, 242 * k, 238 * k]; }));
export const polishedBasaltTex = canvasTexture(256, polished((x, y) => { const v = 0.6 + stoneField[y * 256 + x] * 0.15; return [66 * v, 66 * v, 72 * v]; }));
// Dlaždice: mřížka 4×4 desek se zapuštěnými spárami
export const stoneTilesTex = canvasTexture(256, (x, y) => {
  const lx = x % 64, ly = y % 64, d = Math.min(lx, 63 - lx, ly, 63 - ly);
  if (d < 1.5) return [92, 90, 86, 0.05, 0.95];
  const t = 0.92 + hash2(Math.floor(x / 64), Math.floor(y / 64)) * 0.14;
  const c = smoothStone(x, y);
  return [c[0] * t, c[1] * t, c[2] * t, 0.35 + sm(1.5, 5, d) * 0.5 + F(smoothField, x * 2, y * 2) * 0.1, 0.62];
});
// Mramorový sloup: svislé kanelury
export const marblePillarTex = canvasTexture(256, (x, y) => {
  const f = 0.82 + 0.18 * Math.cos(((x % 32) / 32) * Math.PI * 2);
  const band = y < 14 || y > 241 ? 0.86 : 1;
  return [238 * f * band, 236 * f * band, 232 * f * band, 0.2 + 0.6 * f * band, 0.3];
});
// Kovové desky: zapuštěné spáry, sražené hrany, nýty v rozích, broušení (drsnost v pruzích) – kov = 1
const metalPlates = (base, k = 128, { rivets = false, brushed = 0.5, rough = 0.32, patina = null } = {}) => (x, y) => {
  const lx = x % k, ly = y % k, d = Math.min(lx, k - 1 - lx, ly, k - 1 - ly), i = y * 256 + x;
  if (d < 1.5) return [...base.map((v) => v * 0.45), 0.02, 0.6, 1];
  const rv = rivets && [[14, 14], [k - 14, 14], [14, k - 14], [k - 14, k - 14]].some(([rx, ry]) => Math.hypot(lx - rx, ly - ry) < 5);
  const streak = F(fineField, x * 0.25, y * 4) - 0.5, light = d < 8 ? 0.1 * (1 - d / 8) * (lx < ly ? 1 : -0.5) : 0;
  const v = 0.86 + stoneField[i] * 0.1 + streak * 0.08 * brushed + light - ly * 0.0006;
  if (patina && fineField[(y * 2 & 255) * 256 + (x * 2 & 255)] > 0.86 && d < 22) return [...patina.map((c) => c * (0.9 + streak * 0.2)), 0.55, 0.85, 0];
  if (rv) { const r = Math.hypot(lx - (lx < k / 2 ? 14 : k - 14), ly - (ly < k / 2 ? 14 : k - 14)); return [...base.map((c) => c * (1.15 - r * 0.04)), 0.75 + (1 - r / 5) * 0.25, rough * 0.8, 1]; }
  return [...base.map((c) => c * v), 0.45 + sm(1.5, 7, d) * 0.3, rough + streak * 0.18 * brushed + (stoneField[i] - 0.5) * 0.08, 1];
};
export const ironBlockTex = canvasTexture(256, metalPlates([188, 192, 198], 128, { rivets: true, brushed: 1, rough: 0.36 }));
// Trám: hluboká kůra po stranách, letokruhy na čelech
export const barkTex = canvasTexture(256, (x, y) => {
  const ridge = Math.abs(Math.sin((x / 256) * Math.PI * 9 + woodField[((y * 2) & 255) * 256 + ((x * 3) & 255)] * 4));
  const v = 0.6 + woodField[((y * 2) & 255) * 256 + ((x * 3) & 255)] * 0.3 + (ridge < 0.25 ? -0.18 : 0) + Math.sin(y * 0.08 + x) * 0.03;
  return [104 * v * 1.15, 76 * v * 1.15, 46 * v * 1.15, sm(0.1, 0.7, ridge) * 0.8 + F(fineField, x, y * 0.5) * 0.2, 0.92];
});
export const ringsTex = canvasTexture(256, (x, y) => {
  const d = Math.hypot(x - 127.5, y - 127.5);
  if (d > 118) return [96, 70, 42, 0.5, 0.9];
  const ring = 0.85 + 0.15 * Math.sin(d * 0.45 + woodField[y * 256 + x] * 3);
  const crack = Math.abs(Math.atan2(y - 127.5, x - 127.5) - 0.7) < 0.02 && d > 30 ? 0.6 : 1;
  return [188 * ring * crack, 150 * ring * crack, 98 * ring * crack, 0.55 + ring * 0.2 - (crack < 1 ? 0.4 : 0) - (d > 112 ? 0.2 : 0), 0.75];
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
export const sandTex = canvasTexture(256, (x, y) => {
  const rip = Math.sin((y / 256 * 9 + F(smoothField, x, y) * 2.2) * Math.PI * 2) * 0.5 + 0.5;
  const v = 0.82 + stoneField[y * 256 + x] * 0.16 + (hash2(x, y) - 0.5) * 0.1 + rip * 0.03;
  return [218 * v, 190 * v, 132 * v, rip * 0.45 + fineField[y * 256 + x] * 0.25, 0.96];
});
export const sandstoneTex = canvasTexture(256, (x, y) => {
  const layer = Math.sin(y * 0.19 + stoneField[y * 256 + x] * 2.5) * 0.06, v = 0.82 + layer + stoneField[y * 256 + x] * 0.12;
  return y % 64 < 3 ? [150, 120, 80, 0.05, 0.95] : [214 * v, 182 * v, 124 * v, 0.45 + layer * 3 + F(smoothField, x * 2, y) * 0.2, 0.9];
});
export const smoothSandstoneTex = canvasTexture(256, (x, y) => {
  const d = Math.min(x, 255 - x, y, 255 - y), edge = d < 4 ? 0.82 : 1, v = (0.9 + stoneField[y * 256 + x] * 0.08) * edge;
  return [222 * v, 192 * v, 136 * v, 0.4 + sm(1, 8, d) * 0.4 + F(smoothField, x, y) * 0.1];
});
// Sklo: tenký světlý rámeček a skoro průhledná tabule (odlesky dodá materiál, viz materials.js)
export const glassTex = canvasTextureA(64, (x, y) => {
  if (x < 2 || y < 2 || x > 61 || y > 61) return [214, 228, 236, 220]; // rámeček
  const streak = Math.abs(x - y - 12) < 2 || Math.abs(x - y + 20) < 1 ? 34 : 0; // jemný odlesk
  return [196, 226, 238, 22 + streak];
});
export const snowTex = canvasTexture(256, (x, y) => { const v = 0.9 + stoneField[y * 256 + x] * 0.1 + (hash2(x, y) - 0.5) * 0.04; return [238 * v, 244 * v, 250 * v, F(smoothField, x * 2, y * 2) * 0.7 + fineField[y * 256 + x] * 0.2]; });
// Obsidián: sopečné sklo s lasturovým lomem (ostré hrany), lesklé, s fialovými záblesky
const obsCells = worley(256, 6, 59);
export const obsidianTex = canvasTexture(256, (x, y) => {
  const i = y * 256 + x, ridge = sm(2.2, 0.3, obsCells.f2[i] - obsCells.f1[i]), shell = Math.sin(obsCells.f1[i] * 0.35) * 0.5 + 0.5;
  const v = 0.45 + stoneField[i] * 0.4 + ridge * 0.5, shine = hash2(x * 3, y * 5) > 0.985 ? 2.2 : 1;
  return [40 * v * shine, 24 * v * shine, 60 * v * shine, 0.3 + shell * 0.4 + ridge * 0.25, 0.1 + ridge * 0.15];
});
export const mushroomCapTex = canvasTexture(256, (x, y) => {
  const r = Math.hypot((x % 64) - 32 + (Math.floor(y / 64) % 2) * 10, (y % 64) - 30), spot = r < 11;
  const v = 0.85 + stoneField[y * 256 + x] * 0.2;
  return spot ? [236 * v, 230 * v, 220 * v, 0.6 + sm(11, 4, r) * 0.3, 0.7] : [184 * v, 36 * v, 30 * v, 0.4 + F(smoothField, x, y) * 0.2, 0.5];
});
export const mushroomStemTex = canvasTexture(256, (x, y) => { const f = Math.sin(x * 0.6) * 0.5 + 0.5, v = 0.86 + f * 0.08 + stoneField[y * 256 + x] * 0.1; return [228 * v, 222 * v, 206 * v, 0.4 + f * 0.4, 0.75]; });
export const roofTilesTex = canvasTexture(256, (x, y) => {
  const row = Math.floor(y / 32), lx = (x + (row % 2) * 16) % 32, ly = y % 32;
  const d = Math.hypot(lx - 16, ly - 34), inArc = d < 18;
  const arc = inArc ? 1 : 0.7; // oblouk tašky, spodek je ve stínu další řady
  const v = (0.75 + stoneField[y * 256 + x] * 0.25) * arc * (0.85 + hash2(Math.floor((x + (row % 2) * 16) / 32), row) * 0.25);
  const round = Math.cos(((lx - 16) / 16) * Math.PI * 0.5); // vypouklá taška
  return [178 * v, 74 * v, 46 * v, (inArc ? 0.35 + round * 0.35 + (ly / 32) * 0.25 : 0.1 + ly / 32 * 0.2), 0.6];
});
// Beton: jemné póry (malé dírky)
export const concreteTex = canvasTexture(256, (x, y) => {
  const pore = hash2(x * 13 + 1, y * 7 + 3) > 0.985, v = (0.86 + stoneField[y * 256 + x] * 0.12 + (hash2(x, y) - 0.5) * 0.05) * (pore ? 0.82 : 1);
  return [236 * v, 236 * v, 232 * v, pore ? 0.2 : 0.5 + F(smoothField, x * 2, y * 2) * 0.12];
});
export const cherryPlanksTex = tintTexture(planksTex, 'hue-rotate(-28deg) saturate(1.15) brightness(1.18)');
export const junglePlanksTex = tintTexture(planksTex, 'hue-rotate(-8deg) saturate(1.35) brightness(0.82)');
export const acaciaPlanksTex = tintTexture(planksTex, 'hue-rotate(-14deg) saturate(1.9) brightness(1.05)');

// ============================================================ textury kovových a křemenných bloků
export const copperBlockTex = canvasTexture(256, metalPlates([216, 120, 66], 256, { rough: 0.3, patina: [92, 170, 140] }));
export const cutCopperTex = canvasTexture(256, metalPlates([206, 114, 62], 64, { rough: 0.36, brushed: 0.3 }));
export const goldBlockTex = canvasTexture(256, metalPlates([246, 200, 70], 128, { rough: 0.2, brushed: 0.3 }));
export const steelBlockTex = canvasTexture(256, metalPlates([150, 160, 172], 128, { rivets: true, rough: 0.26, brushed: 1.2 }));
export const quartzTex = canvasTexture(256, (x, y) => { const v = 0.92 + stoneField[y * 256 + x] * 0.06 + (hash2(x >> 2, y >> 2) > 0.93 ? 0.05 : 0); return [242 * v, 238 * v, 234 * v, 0.5 + F(smoothField, x, y) * 0.2]; });
export const quartzPillarTex = canvasTexture(256, (x, y) => { const c = Math.cos(((x % 42) / 42) * Math.PI * 2), f = 0.88 + 0.1 * c; return [244 * f, 240 * f, 236 * f, 0.3 + 0.5 * (c * 0.5 + 0.5)]; });

// ============================================================ futuristické stavební bloky (shared/data/tech.js)
// Technický panel: grafitové kovové desky se spárami, sraženými hranami, šrouby a větracími štěrbinami
export const techPanelTex = canvasTexture(256, (x, y) => {
  const lx = x % 128, ly = y % 128, d = Math.min(lx, 127 - lx, ly, 127 - ly), i = y * 256 + x;
  if (d < 2) return [24, 27, 33, 0.02, 0.7, 1];
  if ([[10, 10], [117, 10], [10, 117], [117, 117]].some(([sx, sy]) => Math.hypot(lx - sx, ly - sy) < 3.5)) return [150, 156, 166, 0.9, 0.3, 1];
  const vent = (Math.floor(x / 128) + Math.floor(y / 128)) % 2 === 1 && lx > 30 && lx < 98 && ly > 50 && ly < 78 && (ly - 50) % 7 < 3;
  if (vent) return [14, 16, 20, 0.08, 0.8, 1];
  const streak = (F(fineField, x * 0.25, y * 4) - 0.5) * 0.1, edge = d < 7 ? (lx < ly ? 0.12 : -0.08) : 0;
  const v = 1 + streak + (stoneField[i] - 0.5) * 0.06 + edge;
  return [62 * v, 69 * v, 81 * v, 0.35 + sm(2, 7, d) * 0.45, 0.4 + streak, 1];
});
// Bílý panel: čistý keramický povrch se zapuštěnou spárou a tenkou ozdobnou drážkou
export const whitePanelTex = canvasTexture(256, (x, y) => {
  const lx = x % 128, d = Math.min(lx, 127 - lx, y, 255 - y), groove = Math.abs(y - 200) < 1.5 && lx > 12 && lx < 116;
  if (d < 2) return [146, 152, 160, 0.02, 0.6];
  const v = (0.95 + stoneField[y * 256 + x] * 0.04) * (groove ? 0.82 : 1);
  return [226 * v, 231 * v, 238 * v, groove ? 0.3 : 0.4 + sm(2, 6, d) * 0.4, 0.3];
});
// Neon: tmavý kovový rámeček a matné sklo, které svítí (barvu dodá materiál); maska = co svítí
const neonD = (x, y) => Math.min(x, 127 - x, y, 127 - y);
export const neonTex = canvasTexture(128, (x, y) => {
  const d = neonD(x, y);
  if (d < 10) return [30, 33, 40, 0.5 + (d > 7 ? -0.3 : 0), 0.4, 1];
  if (d < 13) return [64, 68, 78, 0.25, 0.5, 1];
  const k = 0.84 + 0.16 * sm(13, 44, d);
  return [236 * k, 240 * k, 246 * k, 0.3, 0.22, 0];
});
export const neonMaskTex = canvasTexture(128, (x, y) => { const d = neonD(x, y), m = d < 13 ? 0 : 0.72 + 0.28 * sm(13, 44, d); return [255 * m, 255 * m, 255 * m]; });

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
