// Úlomky z těžby a z rozbitých nástrojů (malé kostičky, které padají, jednou odskočí a zmizí) a hvězdičky kritického zásahu.
// Vše se vytvoří až při prvním použití (modul nemá vedlejší účinky při načtení).
import * as THREE from 'three';
import { groundHeight } from '../../../shared/world/voxels.js';
import { voxFloor } from '../../../shared/world/collision.js';
import { GFX, QUALITY } from '../game/prefs.js';
import { scene } from './renderer.js';

const N = 480;
let mesh = null, next = 0;
const P = new Float32Array(N * 3), Vv = new Float32Array(N * 3), S = new Float32Array(N), L = new Float32Array(N), ML = new Float32Array(N), F = new Float32Array(N), B = new Uint8Array(N), R = new Float32Array(N * 3), RV = new Float32Array(N * 3);
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), col = new THREE.Color();
function init() {
  mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 }), N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = N;
  m4.makeScale(0, 0, 0);
  for (let i = 0; i < N; i++) { mesh.setMatrixAt(i, m4); mesh.setColorAt(i, col.setRGB(1, 1, 1)); }
  scene.add(mesh);
}
// Podlaha pod úlomkem: povrch terénu nebo horní stěna bloku
function floorAt(x, y, z) {
  const g = groundHeight(x, z), vf = voxFloor(x, y, z);
  return isFinite(g) && y >= g - 0.6 ? Math.max(g, vf) : vf;
}
/** Kolik úlomků ukázat při rozbití (nízká grafika 16, střední 40, vysoká 64). */
export const breakCount = () => ({ low: 16, medium: 40, high: 64 })[QUALITY] || 40;

/**
 * Vystřelí úlomky.
 * @param {number[]} at bod [x, y, z]
 * @param {number[][]} colors seznam barev [r, g, b] 0–1 v sRGB (náhodně se střídají)
 * @param {number} n počet
 * @param {{speed?: number, up?: number, size?: [number, number], spread?: number, life?: [number, number], dir?: number[], metal?: number}} [o]
 */
export function emitChips(at, colors, n, o = {}) {
  if (!mesh) init();
  const [s0, s1] = o.size || [0.035, 0.08], [l0, l1] = o.life || [0.2, 1.5], speed = o.speed ?? 2.5, up = o.up ?? 2, spread = o.spread ?? 0.35;
  const fl = floorAt(at[0], at[1], at[2]);
  for (let k = 0; k < n; k++) {
    const i = next; next = (next + 1) % N;
    P[i * 3] = at[0] + (Math.random() - 0.5) * spread; P[i * 3 + 1] = at[1] + (Math.random() - 0.5) * spread; P[i * 3 + 2] = at[2] + (Math.random() - 0.5) * spread;
    const a = Math.random() * Math.PI * 2, sp = speed * (0.3 + Math.random() * 0.7);
    let vx = Math.cos(a) * sp, vy = up * (0.4 + Math.random() * 0.8), vz = Math.sin(a) * sp;
    if (o.dir) { vx = vx * 0.5 + o.dir[0] * speed; vy += o.dir[1] * speed; vz = vz * 0.5 + o.dir[2] * speed; }
    Vv[i * 3] = vx; Vv[i * 3 + 1] = vy; Vv[i * 3 + 2] = vz;
    S[i] = s0 + Math.random() * (s1 - s0);
    L[i] = ML[i] = l0 + Math.random() * (l1 - l0);
    F[i] = fl; B[i] = 0;
    for (let j = 0; j < 3; j++) { R[i * 3 + j] = Math.random() * 6; RV[i * 3 + j] = (Math.random() - 0.5) * 14; }
    const c = colors[(Math.random() * colors.length) | 0], v = 0.8 + Math.random() * 0.35;
    mesh.setColorAt(i, col.setRGB(Math.min(1, c[0] * v), Math.min(1, c[1] * v), Math.min(1, c[2] * v), THREE.SRGBColorSpace));
  }
  mesh.instanceColor.needsUpdate = true;
}
export function updateChips(dt) {
  if (!mesh) return;
  let any = false;
  for (let i = 0; i < N; i++) {
    if (L[i] <= 0) continue;
    any = true;
    L[i] -= dt;
    const j = i * 3;
    Vv[j + 1] -= 16 * dt;
    P[j] += Vv[j] * dt; P[j + 1] += Vv[j + 1] * dt; P[j + 2] += Vv[j + 2] * dt;
    const half = S[i] / 2;
    if (P[j + 1] - half < F[i]) { // dopad: jednou odskočí, pak leží
      P[j + 1] = F[i] + half;
      if (!B[i] && Vv[j + 1] < -1) { B[i] = 1; Vv[j + 1] *= -0.35; Vv[j] *= 0.5; Vv[j + 2] *= 0.5; } else { Vv[j + 1] = 0; Vv[j] *= 0.8; Vv[j + 2] *= 0.8; RV[j] *= 0.9; RV[j + 1] *= 0.9; RV[j + 2] *= 0.9; }
    }
    R[j] += RV[j] * dt; R[j + 1] += RV[j + 1] * dt; R[j + 2] += RV[j + 2] * dt;
    const k = L[i] <= 0 ? 0 : Math.min(1, L[i] / 0.25); // na konci se zmenší
    q.setFromEuler(e.set(R[j], R[j + 1], R[j + 2]));
    m4.compose(pos.set(P[j], P[j + 1], P[j + 2]), q, scl.setScalar(S[i] * k));
    mesh.setMatrixAt(i, m4);
  }
  if (any) mesh.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------ hvězdičky (kritický zásah) a kroužky (zásah)
let stars = null;
const SN = 160, SP = new Float32Array(SN * 3), SV = new Float32Array(SN * 3), SL = new Float32Array(SN), SC = new Float32Array(SN * 3), SB = new Float32Array(SN * 3);
function starTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff';
  g.beginPath(); // čtyřcípá hvězda
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, r = k % 2 ? 4 : 30; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function initStars() {
  const geo = new THREE.BufferGeometry();
  SP.fill(-9999);
  geo.setAttribute('position', new THREE.BufferAttribute(SP, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(SC, 3));
  stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.22, map: starTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  stars.frustumCulled = false;
  scene.add(stars);
}
let sNext = 0;
/** Hvězdičky kolem bodu (kritický zásah, oprava). */
export function emitStars(at, color, n, speed = 3) {
  if (!stars) initStars();
  n = Math.max(2, Math.round(n * Math.max(0.5, GFX.particles)));
  for (let k = 0; k < n; k++) {
    const i = sNext; sNext = (sNext + 1) % SN;
    SP.set([at[0], at[1], at[2]], i * 3);
    const a = Math.random() * Math.PI * 2, el = Math.random() * 2 - 1, sp = speed * (0.4 + Math.random() * 0.6), r = Math.sqrt(1 - el * el);
    SV.set([Math.cos(a) * r * sp, el * sp + 1.2, Math.sin(a) * r * sp], i * 3);
    SB.set(color, i * 3);
    SL[i] = 0.45 + Math.random() * 0.35;
  }
}
export function updateStars(dt) {
  if (!stars) return;
  for (let i = 0; i < SN; i++) {
    if (SL[i] <= 0) continue;
    SL[i] -= dt;
    const j = i * 3;
    SV[j] *= 1 - 3 * dt; SV[j + 1] = SV[j + 1] * (1 - 3 * dt) - 2 * dt; SV[j + 2] *= 1 - 3 * dt;
    SP[j] += SV[j] * dt; SP[j + 1] += SV[j + 1] * dt; SP[j + 2] += SV[j + 2] * dt;
    const k = Math.max(0, Math.min(1, SL[i] / 0.3));
    SC[j] = SB[j] * k; SC[j + 1] = SB[j + 1] * k; SC[j + 2] = SB[j + 2] * k;
    if (SL[i] <= 0) SP[j + 1] = -9999;
  }
  stars.geometry.attributes.position.needsUpdate = true;
  stars.geometry.attributes.color.needsUpdate = true;
}

// ------------------------------------------------------------ barvy úlomků podle textury
const colorCache = new Map();
/**
 * Několik barev z obrázku (textura bloku, ikona předmětu) pro úlomky: 4 vzorky z mřížky, průhledné pixely se přeskočí.
 * @param {string} key klíč do mezipaměti
 * @param {HTMLCanvasElement|HTMLImageElement|null} img
 * @param {number[]} fallback [r, g, b] 0–1
 */
export function paletteOf(key, img, fallback) {
  if (colorCache.has(key)) return colorCache.get(key);
  let out = [fallback];
  try {
    if (img && img.width) {
      const c = document.createElement('canvas'), W = 8;
      c.width = c.height = W;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, W, W);
      const d = g.getImageData(0, 0, W, W).data, cols = [];
      for (let i = 0; i < W * W; i++) if (d[i * 4 + 3] > 128) cols.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]].map((v) => v / 255));
      if (cols.length) { cols.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]); out = [0.3, 0.5, 0.68, 0.85].map((f) => cols[Math.floor(f * (cols.length - 1))]); }
    }
  } catch { /* obrázek z cizího zdroje nebo bez canvasu: zůstane záložní barva */ }
  colorCache.set(key, out);
  return out;
}
