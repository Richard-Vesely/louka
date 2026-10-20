// Nástroje pro textury generované kódem: šum, buňky (kameny, krystaly), reliéf -> normálová mapa, zastínění spár.
// Jen funkce, nic se nespouští při načtení (používají je textures.js, materials.js a vox-mesh.js).
import * as THREE from 'three';
import { rng } from '../../../shared/util.js';

/** Hodnotový šum N×N, který navazuje přes okraje (dlaždice jde opakovat). white = podíl zrnitého šumu. Vrací 0–1. */
export function noiseField(N, seed, octs = [4, 8, 16, 32, 64], white = 0.15) {
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
    out[y * N + x] = v / norm * (1 - white) + (white ? r() * white : 0);
  }
  return out;
}

/**
 * Buňkový šum (Worley) N×N, navazuje přes okraje: f1 = vzdálenost k nejbližšímu bodu, f2 = k druhému,
 * id = náhodné číslo buňky 0–1 (každý kámen nebo krystal má svůj odstín), ox/oy = posun od nejbližšího bodu. V pixelech.
 */
export function worley(N, cells, seed) {
  const r = rng(seed), size = N / cells;
  const px = new Float32Array(cells * cells), py = new Float32Array(cells * cells), pid = new Float32Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) { px[i] = (i % cells + 0.15 + r() * 0.7) * size; py[i] = (Math.floor(i / cells) + 0.15 + r() * 0.7) * size; pid[i] = r(); }
  const f1 = new Float32Array(N * N), f2 = new Float32Array(N * N), id = new Float32Array(N * N), ox = new Float32Array(N * N), oy = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const cx = Math.floor(x / size), cy = Math.floor(y / size);
    let d1 = 1e9, d2 = 1e9, best = 0, bx = 0, by = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j, wx = ((gx % cells) + cells) % cells, wy = ((gy % cells) + cells) % cells, k = wy * cells + wx;
      const ddx = x - (px[k] + (gx - wx) * size), ddy = y - (py[k] + (gy - wy) * size), d = Math.hypot(ddx, ddy);
      if (d < d1) { d2 = d1; d1 = d; best = k; bx = ddx; by = ddy; } else if (d < d2) d2 = d;
    }
    const o = y * N + x;
    f1[o] = d1; f2[o] = d2; id[o] = pid[best]; ox[o] = bx; oy[o] = by;
  }
  return { f1, f2, id, ox, oy };
}

// Pixel (x, y) v dlaždici šířky T uvnitř obrázku W×H (sousední dlaždice atlasu se nemíchají, okraje navazují).
const wrapIn = (x, T) => ((x % T) + T) % T;

/** Normálová mapa (RGBA, tangentový prostor) z výškové mapy 0–1. strength = jak hluboký je reliéf. */
export function heightToNormal(h, W, H, strength = 2, T = W) {
  const out = new Uint8Array(W * H * 4);
  const at = (x, y) => { const tx = Math.floor(x / T) * T; return h[wrapIn(y, H) * W + tx + wrapIn(x - tx, T)]; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tx = Math.floor(x / T) * T, l = tx + wrapIn(x - tx - 1, T), r = tx + wrapIn(x - tx + 1, T);
    const dx = (at(r, y - 1) + 2 * at(r, y) + at(r, y + 1)) - (at(l, y - 1) + 2 * at(l, y) + at(l, y + 1));
    const sy = (at(l, y + 1) + 2 * at(x, y + 1) + at(r, y + 1)) - (at(l, y - 1) + 2 * at(x, y - 1) + at(r, y - 1));
    // Obrázek má řádek 0 nahoře, ale UV v má 0 dole: kladné sy = výška roste dolů = normála míří nahoru (+v).
    const nx = -dx * strength, ny = sy * strength, len = Math.hypot(nx, ny, 1);
    const o = (y * W + x) * 4;
    out[o] = (nx / len * 0.5 + 0.5) * 255;
    out[o + 1] = (ny / len * 0.5 + 0.5) * 255;
    out[o + 2] = (1 / len * 0.5 + 0.5) * 255;
    out[o + 3] = 255;
  }
  return out;
}

/** Zastínění prohlubní (spáry, praskliny): o kolik je pixel níž než okolí. Vrací Float32Array 0–1 (1 = nic). */
export function cavity(h, W, H, R = 3, k = 4, T = W) {
  // rozmazání po řádcích a sloupcích (posuvné okno), uvnitř každé dlaždice
  const tmp = new Float32Array(W * H), blur = new Float32Array(W * H), n = 2 * R + 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tx = Math.floor(x / T) * T;
    let s = 0;
    for (let i = -R; i <= R; i++) s += h[y * W + tx + wrapIn(x - tx + i, T)];
    tmp[y * W + x] = s / n;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let i = -R; i <= R; i++) s += tmp[wrapIn(y + i, H) * W + x];
    blur[y * W + x] = s / n;
  }
  const out = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = Math.max(0.25, Math.min(1, 1 - (blur[i] - h[i]) * k));
  return out;
}

// Data se píšou jako obrázek (řádek 0 nahoře, jako canvas); textura v WebGL má řádek 0 dole. Otočí řádky každé vrstvy.
function flipRows(u8, W, H, D = 1) {
  const out = new Uint8Array(u8.length), row = W * 4;
  for (let d = 0; d < D; d++) for (let y = 0; y < H; y++) out.set(u8.subarray((d * H + y) * row, (d * H + y + 1) * row), (d * H + H - 1 - y) * row);
  return out;
}

/** Textura z bajtů RGBA řazených jako obrázek (s mipmapami, opakuje se). srgb = barevná; jinak data (normály, drsnost). */
export function dataTex(u8, W, H, srgb = false) {
  const t = new THREE.DataTexture(flipRows(u8, W, H), W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Pole textur (WebGL2) D vrstev W×H: každý blok podzemí má svou vrstvu, takže se při oddálení barvy nemíchají. */
export function arrayTex(u8, W, H, D, srgb = false) {
  const t = new THREE.DataArrayTexture(flipRows(u8, W, H, D), W, H, D);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
