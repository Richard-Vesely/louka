// ============================================================ les a balvany
// Stromy a balvany kolem hráče. Kde stojí, říká shared/worldgen.js; tady se jen kreslí.
import * as THREE from 'three';
import { terrainH } from '@louka/shared/terrain.js';
import { treeAt, rockAt } from '@louka/shared/worldgen.js';
import { TREE_CELL, TREE_RADIUS, ROCK_CELL } from '@louka/shared/constants.js';
import { rockTex } from '../render/textures.js';
import { lumpy, makeInstanced, dummy, tmpColor } from '../render/mesh-utils.js';
import { removed } from './state.js';
import { refreshShards } from './shards.js';

const MAX_TREES = 3000;
const trunks = makeInstanced(new THREE.CylinderGeometry(0.16, 0.28, 1, 7).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 1 }), MAX_TREES);
const blobs = makeInstanced(lumpy(new THREE.IcosahedronGeometry(1, 2), 0.22, 1.3).scale(1, 0.85, 1), new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), MAX_TREES * 5);
const cones = makeInstanced(lumpy(new THREE.ConeGeometry(1, 1, 9, 3).translate(0, 0.5, 0), 0.08, 2.1), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), MAX_TREES * 4);
const rocks = makeInstanced(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.3, 4.2).scale(1, 0.6, 1), new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.95, flatShading: true }), 1500);

/** Stromy kolem hráče (pro míření a kácení). */
export const forestTrees = [];
/** Balvany kolem hráče (pro míření a těžbu). */
export const forestRocks = [];
/** Kruhy, do kterých se nedá vejít (kmeny a velké balvany). */
export const forestColliders = [];

// Koruna dubu: 5 koulí [x, y, z, velikost].
const OAK_BLOBS = [[0, 1.3, 0, 2.1], [1.3, 0.5, 0.3, 1.5], [-1.1, 0.6, -0.6, 1.5], [0.2, 0.5, -1.3, 1.4], [-0.4, 2.3, 0.3, 1.3]];
let forestKey = '';

/**
 * Postaví les kolem bodu (px, pz). Přestaví se, jen když hráč přejde do jiného čtverce 24 m
 * (nebo s `force`, např. po pokácení stromu).
 */
export function rebuildForest(px, pz, force = false) {
  const key = Math.floor(px / 24) + ',' + Math.floor(pz / 24);
  if (key === forestKey && !force) return;
  forestKey = key;
  forestTrees.length = forestRocks.length = forestColliders.length = 0;
  let nt = 0, nb = 0, nc = 0, nr = 0;
  const put = (mesh, i, x, y, z, sx, sy, sz, ry, color, rx = 0, rz = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color);
  };
  const R2 = TREE_RADIUS * TREE_RADIUS;
  for (let cz = Math.floor((pz - TREE_RADIUS) / TREE_CELL); cz <= Math.floor((pz + TREE_RADIUS) / TREE_CELL); cz++) {
    for (let cx = Math.floor((px - TREE_RADIUS) / TREE_CELL); cx <= Math.floor((px + TREE_RADIUS) / TREE_CELL); cx++) {
      const t = treeAt(cx, cz, removed);
      if (!t || (t.x - px) ** 2 + (t.z - pz) ** 2 > R2 || nt >= MAX_TREES) continue;
      const y = terrainH(t.x, t.z) - 0.2;
      t.y = y;
      forestTrees.push(t);
      put(trunks, nt++, t.x, y, t.z, t.s, t.trunkH, t.s, t.rot, tmpColor.setHSL(0.08, 0.25, 0.75 + t.v * 0.25));
      forestColliders.push({ x: t.x, z: t.z, r: 0.3 * t.s });
      const c = Math.cos(t.rot), s = Math.sin(t.rot);
      if (t.pine) {
        for (let i = 0; i < 4; i++) {
          const r = (2.0 - i * 0.42) * t.s;
          put(cones, nc++, t.x, y + t.trunkH * 0.5 + i * 1.25 * t.s, t.z, r, 2.4 * t.s, r, t.rot + i, tmpColor.setHSL(0.36 + t.v * 0.04, 0.45, 0.13 + t.v * 0.05));
        }
      } else {
        for (const [ox, oy, oz, r] of OAK_BLOBS) {
          const bx = (ox * c - oz * s) * t.s, bz = (ox * s + oz * c) * t.s;
          put(blobs, nb++, t.x + bx, y + t.trunkH + oy * t.s, t.z + bz, r * t.s, r * t.s, r * t.s, t.rot + ox, tmpColor.setHSL(0.24 + t.v * 0.06 + oy * 0.01, 0.5, 0.2 + t.v * 0.08));
        }
      }
    }
  }
  const RR = 150;
  for (let cz = Math.floor((pz - RR) / ROCK_CELL); cz <= Math.floor((pz + RR) / ROCK_CELL); cz++) {
    for (let cx = Math.floor((px - RR) / ROCK_CELL); cx <= Math.floor((px + RR) / ROCK_CELL); cx++) {
      const rock = rockAt(cx, cz, removed);
      if (!rock || (rock.x - px) ** 2 + (rock.z - pz) ** 2 > RR * RR || nr >= 1500) continue;
      const { x, y, z, s, iron, r } = rock;
      forestRocks.push(rock);
      put(rocks, nr++, x, y, z, s * 1.2, s, s, r * 900, iron ? tmpColor.setHSL(0.06, 0.55, 0.42) : tmpColor.setHSL(0.1, 0.06, 0.55 + rock.shade * 0.3), r * 3, r * 7);
      if (s > 0.6) forestColliders.push({ x, z, r: 0.9 * s });
    }
  }
  for (const [m, n] of [[trunks, nt], [blobs, nb], [cones, nc], [rocks, nr]]) {
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  refreshShards(px, pz);
}
