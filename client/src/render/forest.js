// Les a balvany kolem hráče.
import '../world/world-state.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { hash2 } from '../../../shared/util.js';
import { ROCK_CELL, TREE_CELL } from '../../../shared/world/constants.js';
import { TREE_THICK, rockAt, treeAt } from '../../../shared/world/nature.js';
import { isMark, terrainH } from '../../../shared/world/terrain.js';
import { GFX } from '../game/prefs.js';
import { refreshPonds } from '../world/fishing.js';
import { FX, LK } from './look.js';
import { U, scene } from './renderer.js';
import { SHADOW_LAYER } from './shadows.js';
import { refreshShards } from './shards.js';
import { barkTex, normalMapFrom, rockTex } from './textures.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ============================================================ les a balvany
export function lumpy(geo, amt, seed) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 + seed * 1.7) * Math.sin(v.z * 3.3 + seed * 0.7);
    v.multiplyScalar(1 + n * amt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
const MAX_TREES = 3000, TREE_RADIUS = GFX.trees; // dohled lesa podle nastavení grafiky
// Vítr v korunách: koruna se kývá (víc nahoře), listí se třepotá. Posun dělá vertex shader, takže to nic nestojí.
// Všechno řídí společný vítr U.wind (stejný jako tráva a déšť). kind: 'trunk' = kmen se ohýbá jen nahoře a má tmavší patu,
// 'crown' = koruna (zblízka tmavší uvnitř, proti slunci prosvítá okraj), 'leaves' = lístky (třepotají se nejvíc).
function windy(mat, kind = 'crown') {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: U.time, uWind: U.wind, uCardR: { value: FX.leafCards }, uSSS: U.sss });
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uCardR, uSSS;
      varying float vLocalY, vDist;`).replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb = max(mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, ${LK.foliage.toFixed(3)}), 0.0) * ${(kind === 'trunk' ? 1 : LK.leaves).toFixed(3)};
      ${kind === 'trunk' ? 'diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(0.0, 0.22, vLocalY)); // pata kmene u země je tmavší' : ''}
      ${kind === 'crown' && FX.leafCards ? 'diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(uCardR * 0.8, uCardR, vDist)); // zblízka je jádro koruny tmavší (lístky kolem jsou světlé)' : ''}
      ${kind === 'leaves' ? 'diffuseColor.rgb *= 0.95 + 0.15 * vLocalY;' : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      ${kind === 'trunk' ? '' : `{ // světlo prosvítá okrajem koruny, když je za ní slunce
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
        totalEmissiveRadiance += diffuseColor.rgb * rim * uSSS * 0.3 * smoothstep(-0.3, 0.3, vLocalY);
      }`}`);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec4 uWind;\nvarying float vLocalY, vDist;').replace('#include <begin_vertex>', `#include <begin_vertex>
      vLocalY = position.y; vDist = 0.0;
      #ifdef USE_INSTANCING
      {
        vec3 ip = instanceMatrix[3].xyz;
        vDist = distance(ip, cameraPosition);
        float ph = ip.x * 0.37 + ip.z * 0.21;
        // poryv se valí krajinou ve směru větru (stejná vlna jako v trávě)
        float wave = sin(dot(ip.xz, uWind.xy) * 0.05 - uTime * 0.9);
        float gust = (0.55 + 0.45 * wave) * (0.7 + 0.6 * uWind.z) * uWind.w;
        vec2 sway = uWind.xy * (sin(uTime * 1.2 + ph) * 0.6 + sin(uTime * 2.1 + ph * 1.7) * 0.3 + 0.35 * wave) * gust * ${(0.045 * LK.wind).toFixed(4)};
        ${kind === 'trunk' ? 'transformed.xz += sway * transformed.y * transformed.y * 0.6;'
    : kind === 'crown' ? `transformed.xz += sway * (0.6 + 0.4 * clamp(position.y, -1.0, 1.0));
        transformed += normalize(position + vec3(0.0, 0.001, 0.0)) * sin(uTime * 7.0 + dot(position, vec3(4.0)) + ph) * ${(0.018 * LK.wind).toFixed(4)} * gust;`
      : `transformed.xz += sway * (0.6 + 0.4 * clamp(position.y, -1.0, 1.0));
        transformed += normal * sin(uTime * 9.0 + dot(position, vec3(7.0)) + ph) * ${(0.05 * LK.wind).toFixed(4)} * gust;`}
      }
      #endif`);
  };
  return mat;
}
// Hladká koruna: spojené vrcholy → měkké stínování místo plošek
const crownGeo = lumpy(mergeVertices(new THREE.IcosahedronGeometry(1, 3).deleteAttribute('normal').deleteAttribute('uv')), 0.2, 1.3).scale(1, 0.85, 1);
// Smrk / borovice: patro z převislých větví (hvězdicový okraj), hladce stínované
function pineTierGeo(spikes = 11) {
  const pos = [0, 1, 0], idx = []; // špička
  const ring = (y, rad, jag, droop, off) => {
    const start = pos.length / 3;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 + off, out = i % 2 === 0;
      const r = rad * (out ? 1 : 1 - jag);
      pos.push(Math.cos(a) * r, y - (out ? droop : 0), Math.sin(a) * r);
    }
    return start;
  };
  const mid = ring(0.45, 0.55, 0.25, 0.04, 0.1), rim = ring(0.0, 1.0, 0.42, 0.12, 0);
  const n = spikes * 2;
  for (let i = 0; i < n; i++) idx.push(0, mid + ((i + 1) % n), mid + i);
  for (let i = 0; i < n; i++) { const a = mid + i, b = mid + ((i + 1) % n), c = rim + i, d = rim + ((i + 1) % n); idx.push(a, b, c, b, d, c); }
  const under = pos.length / 3;
  pos.push(0, 0.12, 0); // spodní strana (pod větvemi)
  for (let i = 0; i < n; i++) idx.push(under, rim + i, rim + ((i + 1) % n));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// Lístky (jen zblízka, do FX.leafCards m): trsy listů na průhledných kartách kolem povrchu koruny
function leafTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  let s = 3;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const x = 12 + r() * 104, y = 12 + r() * 104, a = r() * Math.PI * 2, l = 6 + r() * 6;
    const v = 185 + r() * 50;
    g.fillStyle = `rgb(${v * 0.92 | 0},${v | 0},${v * 0.8 | 0})`;
    g.beginPath(); g.ellipse(x, y, l, l * 0.42, a, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(60,70,40,0.5)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function leafCardGeo(n = 46) {
  const pos = [], nor = [], uv = [], idx = [], v = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(1, 0, 0);
  let k = 0;
  for (let i = 0; i < n; i++) {
    // rovnoměrně po kouli (Fibonacci), lehce náhodně
    const y = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - y * y), a = i * 2.39996 + Math.sin(i * 7.3) * 0.4;
    v.set(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize();
    t1.crossVectors(Math.abs(v.y) > 0.9 ? side : up, v).normalize();
    t2.crossVectors(v, t1).normalize();
    const rot = Math.sin(i * 3.1) * 1.2, c = Math.cos(rot), sn = Math.sin(rot), size = 0.42 + 0.12 * Math.sin(i * 5.7);
    const center = v.clone().multiplyScalar(0.93 + 0.1 * Math.sin(i * 2.3));
    for (const [px, py, u, w] of [[-1, -1, 0, 0], [1, -1, 1, 0], [-1, 1, 0, 1], [1, 1, 1, 1]]) {
      const x = (px * c - py * sn) * size, yy = (px * sn + py * c) * size;
      const p = center.clone().addScaledVector(t1, x).addScaledVector(t2, yy).addScaledVector(v, 0.12 * (Math.abs(px) + Math.abs(py) - 1));
      pos.push(p.x, p.y * 0.85, p.z);
      const nn = p.clone().normalize();
      nor.push(nn.x, nn.y, nn.z);
      uv.push(u, w);
    }
    idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    k += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
const makeInstanced = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.count = 0; m.userData.noCast = FX.shadows; scene.add(m); return m; };
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.95 });
if (FX.post) { trunkMat.normalMap = normalMapFrom(barkTex); trunkMat.normalScale.setScalar(1.2); } // kůra (reliéf)
const trunks = makeInstanced(new THREE.CylinderGeometry(0.16, 0.28, 1, 9).translate(0, 0.5, 0), windy(trunkMat, 'trunk'), MAX_TREES);
const blobs = makeInstanced(crownGeo, windy(new THREE.MeshStandardMaterial({ roughness: 0.8 })), MAX_TREES * 5);
const cones = makeInstanced(pineTierGeo(), windy(new THREE.MeshStandardMaterial({ roughness: 0.85 })), MAX_TREES * 4);
const LEAF_N = FX.leafCards ? 2600 : 0;
const leaves = FX.leafCards ? makeInstanced(leafCardGeo(), windy(new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 }), 'leaves'), LEAF_N) : null;
const rocks = makeInstanced(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.3, 4.2).scale(1, 0.6, 1), new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.95, flatShading: true }), 1500);
// Stínové kopie blízkých stromů a balvanů: vrhají stín, ale vidět nejsou (vrstva SHADOW_LAYER, viz render/shadows.js).
// Celý les do mapy stínů kreslit nejde (tisíce stromů), tak se do ní dávají jen ty v dosahu stínů.
const SHADOW_R2 = (FX.shadowRange + 34) ** 2, proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const proxies = new Map();
if (FX.shadows) for (const [src, n] of [[trunks, 1200], [blobs, 3000], [cones, 2400], [rocks, 400]]) {
  const p = new THREE.InstancedMesh(src.geometry, proxyMat, n);
  Object.assign(p, { frustumCulled: false, count: 0, castShadow: true });
  p.layers.set(SHADOW_LAYER);
  p.userData.sh = 1;
  scene.add(p);
  proxies.set(src, p);
}
// (kde roste který strom a leží který balvan: treeAt a rockAt v shared/world/nature.js)

export const forestTrees = [], forestRocks = [], forestColliders = [];
export const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color(), leafCol = new THREE.Color();
const LEAF_R2 = (FX.leafCards + 30) ** 2; // lístky dostanou stromy o kus dál, než se ukážou (les se přestaví po 24 m)
const OAK_BLOBS = [[0, 1.3, 0, 2.1], [1.3, 0.5, 0.3, 1.5], [-1.1, 0.6, -0.6, 1.5], [0.2, 0.5, -1.3, 1.4], [-0.4, 2.3, 0.3, 1.3]];
let forestKey = '';

export function rebuildForest(px, pz, force = false) {
  const key = Math.floor(px / 24) + ',' + Math.floor(pz / 24);
  if (key === forestKey && !force) return;
  forestKey = key;
  forestTrees.length = forestRocks.length = forestColliders.length = 0;
  let nt = 0, nb = 0, nc = 0, nr = 0, nl = 0;
  for (const p of proxies.values()) p.count = 0;
  const put = (mesh, i, x, y, z, sx, sy, sz, ry, color, rx = 0, rz = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color);
    const p = proxies.get(mesh);
    const d2 = (x - px) ** 2 + (z - pz) ** 2;
    if (p && p.count < p.instanceMatrix.count && d2 < SHADOW_R2) p.setMatrixAt(p.count++, dummy.matrix);
    // lístky kolem blízkých korun (barva o kousek světlejší a žlutější než koruna)
    if (leaves && mesh === blobs && nl < LEAF_N && d2 < LEAF_R2) {
      dummy.scale.multiplyScalar(1.04);
      dummy.updateMatrix();
      leaves.setMatrixAt(nl, dummy.matrix);
      leaves.setColorAt(nl++, leafCol.copy(color).offsetHSL(0.01, 0.02, 0.03));
    }
  };
  const R2 = TREE_RADIUS * TREE_RADIUS;
  for (let cz = Math.floor((pz - TREE_RADIUS) / TREE_CELL); cz <= Math.floor((pz + TREE_RADIUS) / TREE_CELL); cz++) {
    for (let cx = Math.floor((px - TREE_RADIUS) / TREE_CELL); cx <= Math.floor((px + TREE_RADIUS) / TREE_CELL); cx++) {
      const t = treeAt(cx, cz);
      if (!t || (t.x - px) ** 2 + (t.z - pz) ** 2 > R2 || nt >= MAX_TREES) continue;
      const y = terrainH(t.x, t.z) - 0.2;
      t.y = y;
      forestTrees.push(t);
      const K = t.kind, thick = TREE_THICK[K] || 1;
      const trunkCol = t.mark ? tmpColor.setRGB(0.55, 0.8, 1.5) : K === 'cactus' ? tmpColor.setRGB(0.55, 1.7 + t.v * 0.3, 0.5) : K === 'mushroom' ? tmpColor.setRGB(2.3, 2.2, 1.95)
        : K === 'cherry' ? tmpColor.setHSL(0.02, 0.3, 0.42) : K === 'dead' || K === 'deadbush' ? tmpColor.setHSL(0.08, 0.1, 0.38) : K === 'acacia' ? tmpColor.setHSL(0.06, 0.15, 0.55) : tmpColor.setHSL(0.08, 0.25, 0.75 + t.v * 0.25);
      put(trunks, nt++, t.x, y, t.z, t.s * thick, t.trunkH, t.s * thick, t.rot, trunkCol);
      forestColliders.push({ x: t.x, z: t.z, r: 0.3 * t.s * thick });
      const c = Math.cos(t.rot), s = Math.sin(t.rot);
      if (K === 'cactus' || K === 'dead' || K === 'deadbush') {
        // větve: kaktus má boční "ruce", suchý strom pahýly
        for (const side of [-1, 1]) {
          if (nt >= MAX_TREES) break;
          const ax = c * side * 0.42 * t.s, az = s * side * 0.42 * t.s;
          if (K === 'cactus') put(trunks, nt++, t.x + ax, y + t.trunkH * (side > 0 ? 0.45 : 0.3), t.z + az, t.s * 0.9, t.trunkH * 0.38, t.s * 0.9, t.rot, tmpColor.setRGB(0.55, 1.75, 0.5));
          else put(trunks, nt++, t.x, y + t.trunkH * (0.55 + side * 0.12), t.z, t.s * 0.45, t.trunkH * 0.45, t.s * 0.45, t.rot + side, tmpColor.setHSL(0.08, 0.1, 0.36), 0.8 * side, 0.3);
        }
      } else if (K === 'mushroom') {
        put(blobs, nb++, t.x, y + t.trunkH, t.z, 2.3 * t.s, 0.8 * t.s, 2.3 * t.s, t.rot, t.v > 0.6 ? tmpColor.setHSL(0.07, 0.45, 0.33) : tmpColor.setHSL(0.0, 0.72, 0.4 + t.v * 0.08));
      } else if (K === 'acacia') {
        put(blobs, nb++, t.x + c * 0.6 * t.s, y + t.trunkH, t.z + s * 0.6 * t.s, 2.9 * t.s, 0.55 * t.s, 2.9 * t.s, t.rot, tmpColor.setHSL(0.2, 0.45, 0.24 + t.v * 0.06));
        put(blobs, nb++, t.x - c * 1.2 * t.s, y + t.trunkH - 0.5 * t.s, t.z - s * 1.2 * t.s, 1.8 * t.s, 0.45 * t.s, 1.8 * t.s, t.rot + 1, tmpColor.setHSL(0.21, 0.45, 0.22));
      } else if (K === 'spruce') {
        for (let i = 0; i < 4; i++) {
          const r = (2.0 - i * 0.42) * t.s;
          put(cones, nc++, t.x, y + t.trunkH * 0.5 + i * 1.25 * t.s, t.z, r, 2.4 * t.s, r, t.rot + i, tmpColor.setHSL(0.5, 0.12, 0.62 + t.v * 0.12)); // zasněžené větve
        }
      } else if (K === 'cherry' || K === 'jungle') {
        const big = K === 'jungle' ? 1.35 : 1;
        for (const [ox, oy, oz, r] of OAK_BLOBS) {
          const bx = (ox * c - oz * s) * t.s * big, bz = (ox * s + oz * c) * t.s * big;
          put(blobs, nb++, t.x + bx, y + t.trunkH + oy * t.s, t.z + bz, r * t.s * big, r * t.s * big, r * t.s * big, t.rot + ox,
            K === 'cherry' ? tmpColor.setHSL(0.93 + t.v * 0.03, 0.75, 0.58 + t.v * 0.08 + oy * 0.02) : tmpColor.setHSL(0.3 + t.v * 0.04, 0.6, 0.12 + t.v * 0.05));
        }
      } else if (t.pine) {
        for (let i = 0; i < 4; i++) {
          const r = (2.0 - i * 0.42) * t.s;
          put(cones, nc++, t.x, y + t.trunkH * 0.5 + i * 1.25 * t.s, t.z, r, 2.4 * t.s, r, t.rot + i, t.mark ? tmpColor.setHSL(0.74 + t.v * 0.08, 0.6, 0.22 + t.v * 0.08) : tmpColor.setHSL(0.36 + t.v * 0.04, 0.45, 0.13 + t.v * 0.05));
        }
      } else {
        for (const [ox, oy, oz, r] of OAK_BLOBS) {
          const bx = (ox * c - oz * s) * t.s, bz = (ox * s + oz * c) * t.s;
          put(blobs, nb++, t.x + bx, y + t.trunkH + oy * t.s, t.z + bz, r * t.s, r * t.s, r * t.s, t.rot + ox, t.mark ? tmpColor.setHSL(0.52 + t.v * 0.1 + oy * 0.02, 0.75, 0.3 + t.v * 0.1) : tmpColor.setHSL(0.24 + t.v * 0.06 + oy * 0.01, 0.5, 0.2 + t.v * 0.08));
        }
      }
    }
  }
  const RR = GFX.rocks;
  for (let cz = Math.floor((pz - RR) / ROCK_CELL); cz <= Math.floor((pz + RR) / ROCK_CELL); cz++) {
    for (let cx = Math.floor((px - RR) / ROCK_CELL); cx <= Math.floor((px + RR) / ROCK_CELL); cx++) {
      const rk = rockAt(cx, cz);
      if (!rk || (rk.x - px) ** 2 + (rk.z - pz) ** 2 > RR * RR || nr >= 1500) continue;
      const { key, x, z, s, iron, r } = rk;
      const y = terrainH(x, z) - 0.25 * s;
      forestRocks.push({ key, x, y, z, s, iron });
      put(rocks, nr++, x, y, z, s * 1.2, s, s, r * 900, iron ? tmpColor.setHSL(0.06, 0.55, 0.42) : isMark(x) ? tmpColor.setHSL(0.72, 0.25, 0.45 + hash2(cx, cz) * 0.25) : tmpColor.setHSL(0.1, 0.06, 0.55 + hash2(cx, cz) * 0.3), r * 3, r * 7);
      if (s > 0.6) forestColliders.push({ x, z, r: 0.9 * s });
    }
  }
  for (const [m, n] of [[trunks, nt], [blobs, nb], [cones, nc], [rocks, nr], ...(leaves ? [[leaves, nl]] : [])]) {
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  for (const p of proxies.values()) p.instanceMatrix.needsUpdate = true;
  refreshShards(px, pz);
  refreshPonds(px, pz);
}
