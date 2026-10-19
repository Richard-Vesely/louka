// Podzemí: 3D model chunků 16×16.
import './blocks.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { TERRAIN_GLSL } from './glsl.js';
import { renderer, scene } from './renderer.js';
import { stoneField } from './textures.js';
import { dirtyVoxChunks } from '../world/dig.js';
import { clamp, hash2 } from '../../../shared/util.js';
import { V, VMIN, VOX, editAt, naturalAt, topY, voxEdits } from '../../../shared/world/voxels.js';

// ============================================================ podzemí – vykreslení
// Atlas textur podzemních bloků: hlína, kámen, uhlí, železo, krystal, podloží.
const voxAtlasTex = (() => {
  const T = 64, N = 18, c = document.createElement('canvas');
  c.width = T * N; c.height = T;
  const g = c.getContext('2d'), img = g.createImageData(T * N, T);
  const put = (tile, x, y, col) => img.data.set([clamp(col[0], 0, 255), clamp(col[1], 0, 255), clamp(col[2], 0, 255), 255], (y * T * N + tile * T + x) * 4);
  const f = (x, y, s) => stoneField[((y * 4 + s * 37) & 255) * 256 + ((x * 4 + s * 91) & 255)];
  const mul = (c3, k) => [c3[0] * k, c3[1] * k, c3[2] * k];
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const v = f(x, y, 0), grain = hash2(x * 3 + 1, y * 7) * 0.14, spot = f(x, y, 7) > 0.7 && f(x, y, 11) > 0.45;
    const stone = mul([128, 126, 122], 0.55 + v * 0.45 + grain);
    put(0, x, y, mul([120, 86, 58], 0.72 + v * 0.42 + grain - (f(x, y, 3) > 0.72 ? 0.18 : 0)));
    put(1, x, y, stone);
    put(2, x, y, spot ? mul([34, 32, 32], 0.8 + grain * 2) : stone);
    put(3, x, y, spot ? mul([206, 150, 104], 0.8 + grain * 2) : stone);
    put(4, x, y, spot ? mul([140, 245, 255], 0.85 + grain) : mul([70, 72, 82], 0.55 + v * 0.45 + grain));
    put(5, x, y, mul([60, 60, 64], 0.4 + v * 0.9 + grain));
    put(6, x, y, mul([54, 78, 150], 0.72 + v * 0.42 + grain - (f(x, y, 3) > 0.72 ? 0.18 : 0)));
    put(7, x, y, spot ? mul([255, 110, 245], 0.85 + grain) : mul([62, 52, 80], 0.55 + v * 0.45 + grain));
    const h = hash2(x * 5 + 3, y * 11 + 7);
    put(8, x, y, h > 0.92 ? [44, 36, 36] : h < 0.07 ? [232, 226, 218] : mul([176, 128, 112], 0.75 + v * 0.3)); // žula
    const vein = Math.abs(Math.sin((x * 0.09 + y * 0.05 + f(x, y, 5) * 3) * Math.PI));
    put(9, x, y, mul([236, 234, 230], (vein < 0.08 ? 0.66 : 1) * (0.9 + v * 0.1))); // mramor
    put(10, x, y, (x + (y >> 4) * 13) % 16 === 0 ? [26, 26, 30] : mul([72, 72, 78], 0.55 + v * 0.4 + grain)); // čedič
    put(11, x, y, mul([218, 190, 132], 0.82 + v * 0.16 + grain * 0.6)); // písek
    put(12, x, y, mul([214, 182, 124], 0.8 + Math.sin(y * 0.6 + v * 2) * 0.06 + v * 0.12)); // pískovec
    put(13, x, y, mul([238, 244, 250], 0.9 + v * 0.1)); // sníh
    put(14, x, y, mul([40, 24, 60], 0.4 + v * 0.6 + (hash2(x * 3, y * 5) > 0.97 ? 1.2 : 0))); // obsidián
    put(15, x, y, spot ? (f(x, y, 13) > 0.6 ? mul([80, 170, 120], 0.9 + grain) : mul([216, 120, 66], 0.8 + grain * 2)) : stone); // měď (s měděnkou)
    put(16, x, y, spot ? mul([250, 206, 70], 0.85 + grain * 2) : stone); // zlato
    put(17, x, y, spot ? mul([246, 242, 255], 0.9 + grain) : stone); // křemen
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
})();
const VOX_TILES = 18;

// Části bloků, které vyčnívají nad hladký terén, se nekreslí (kraje díry tak přesně navazují na povrch).
function clipToTerrain(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${TERRAIN_GLSL}`)
      .replace('void main() {', 'void main() {\n  if (vWPos.y > terrainH(vWPos.xz) + 0.02) discard;');
  };
  return mat;
}
const voxMats = [
  clipToTerrain(new THREE.MeshStandardMaterial({ map: voxAtlasTex, vertexColors: true, roughness: 0.95 })),
  clipToTerrain(new THREE.MeshStandardMaterial({ map: voxAtlasTex, vertexColors: true, roughness: 0.35, emissive: 0xffffff, emissiveMap: voxAtlasTex, emissiveIntensity: 1.1 })),
];

const VFACES = [
  { dir: [-1, 0, 0], corners: [[0, 1, 0, 0, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 1, 1, 0]] },
  { dir: [1, 0, 0], corners: [[1, 1, 1, 0, 1], [1, 0, 1, 0, 0], [1, 1, 0, 1, 1], [1, 0, 0, 1, 0]] },
  { dir: [0, -1, 0], corners: [[1, 0, 1, 1, 0], [0, 0, 1, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 0, 1]] },
  { dir: [0, 1, 0], corners: [[0, 1, 1, 1, 1], [1, 1, 1, 0, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]] },
  { dir: [0, 0, -1], corners: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 1]] },
  { dir: [0, 0, 1], corners: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1]] },
].map((f) => ({ ...f, axis: f.dir.findIndex((v) => v !== 0) }));
const AO_LIGHT = [0.4, 0.62, 0.8, 1.0];

// Postaví 3D model podzemí jednoho chunku. Kreslí jen stěny, které sousedí se vzduchem v jeskyni nebo v díře.
function buildVoxGeometry(cx, cz) {
  const P = 18, bx = cx * 16 - 1, bz = cz * 16 - 1;
  const tops = new Int32Array(P * P);
  let maxTop = VMIN;
  for (let z = 0; z < P; z++) for (let x = 0; x < P; x++) { const t = topY(bx + x, bz + z); tops[z * P + x] = t; maxTop = Math.max(maxTop, t); }
  const H = maxTop - VMIN + 2;
  const data = new Uint8Array(P * P * H);
  let edits = false;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (voxEdits.get(`${cx + dx},${cz + dz}`)?.size) edits = true;
  for (let z = 0; z < P; z++) for (let x = 0; x < P; x++) {
    const top = tops[z * P + x], wx = bx + x, wz = bz + z;
    for (let yi = 0; yi <= top - VMIN; yi++) {
      const y = VMIN + yi;
      let v = naturalAt(wx, y, wz, top);
      if (edits) { const e = editAt(wx, y, wz); if (e !== undefined) v = e; }
      data[(yi * P + z) * P + x] = v;
    }
  }
  const dug = new Uint8Array(P * P);
  for (let i = 0; i < P * P; i++) dug[i] = data[(tops[i] - VMIN) * P * P + i] === V.AIR ? 1 : 0;
  const at = (x, yi, z) => (yi < 0 ? V.BEDROCK : yi >= H || x < 0 || z < 0 || x >= P || z >= P ? V.AIR : data[(yi * P + z) * P + x]);
  const openAir = (x, yi, z) => {
    if (yi < 0 || at(x, yi, z) !== V.AIR) return false;
    const i = z * P + x;
    return yi + VMIN <= tops[i] || dug[i] === 1;
  };

  const pos = [], nor = [], uv = [], col = [], idxA = [], idxB = [];
  const q = [0, 0, 0], ao = [0, 0, 0, 0], IN = 0.004;
  for (let yi = 0; yi < H; yi++) for (let z = 1; z <= 16; z++) for (let x = 1; x <= 16; x++) {
    const v = data[(yi * P + z) * P + x];
    if (!v) continue;
    const def = VOX[v];
    for (const f of VFACES) {
      const nx = x + f.dir[0], ny = yi + f.dir[1], nz = z + f.dir[2];
      if (!openAir(nx, ny, nz)) continue;
      const u = (f.axis + 1) % 3, w = (f.axis + 2) % 3, n = pos.length / 3;
      for (let i = 0; i < 4; i++) {
        const c = f.corners[i];
        pos.push(x - 1 + c[0], VMIN + yi + c[1] * (f.axis !== 1 && VMIN + yi === tops[z * P + x] ? 2 : 1), z - 1 + c[2]);
        nor.push(...f.dir);
        uv.push((def.tile + IN + c[3] * (1 - 2 * IN)) / VOX_TILES, IN + c[4] * (1 - 2 * IN));
        const su = c[u] === 1 ? 1 : -1, sw = c[w] === 1 ? 1 : -1;
        q[0] = nx; q[1] = ny; q[2] = nz;
        q[u] += su; const s1 = at(q[0], q[1], q[2]) ? 1 : 0;
        q[w] += sw; const cc = at(q[0], q[1], q[2]) ? 1 : 0;
        q[u] -= su; const s2 = at(q[0], q[1], q[2]) ? 1 : 0;
        ao[i] = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
        const l = AO_LIGHT[ao[i]];
        col.push(l, l, l);
      }
      const out = def.glow ? idxB : idxA;
      if (ao[1] + ao[2] > ao[0] + ao[3]) out.push(n, n + 1, n + 3, n, n + 3, n + 2);
      else out.push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex([...idxA, ...idxB]);
  geo.addGroup(0, idxA.length, 0);
  geo.addGroup(idxA.length, idxB.length, 1);
  geo.computeBoundingSphere();
  return geo;
}

export const voxChunks = new Map();
const VOX_R = 3;
const VOX_OFFSETS = [];
for (let dz = -VOX_R; dz <= VOX_R; dz++) for (let dx = -VOX_R; dx <= VOX_R; dx++) VOX_OFFSETS.push([dx, dz]);
VOX_OFFSETS.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));
function buildVoxChunk(k) {
  const [cx, cz] = k.split(',').map(Number);
  const old = voxChunks.get(k);
  if (old?.mesh) { scene.remove(old.mesh); old.mesh.geometry.dispose(); }
  const geo = buildVoxGeometry(cx, cz);
  let mesh = null;
  if (geo) {
    mesh = new THREE.Mesh(geo, voxMats);
    mesh.position.set(cx * 16, 0, cz * 16);
    scene.add(mesh);
  }
  voxChunks.set(k, { mesh });
}
// Každý snímek: přestaví změněné chunky a dostaví pár chybějících kolem hráče (max ~6 ms).
export function updateVoxChunks(px, pz) {
  for (const k of dirtyVoxChunks) if (voxChunks.has(k)) buildVoxChunk(k);
  dirtyVoxChunks.clear();
  const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16), start = performance.now();
  for (const [dx, dz] of VOX_OFFSETS) {
    const k = `${pcx + dx},${pcz + dz}`;
    if (voxChunks.has(k)) continue;
    buildVoxChunk(k);
    if (performance.now() - start > 6) break;
  }
  for (const [k, c] of voxChunks) {
    const [cx, cz] = k.split(',').map(Number);
    if (Math.abs(cx - pcx) > VOX_R + 1 || Math.abs(cz - pcz) > VOX_R + 1) {
      if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); }
      voxChunks.delete(k);
    }
  }
}
