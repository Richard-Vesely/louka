// ============================================================ položené bloky a stavby
// Obyčejné bloky (prkna, kámen, cihly) se kreslí jako kostky, zvláštní bloky (stůl, táborák,
// pochodeň) mají vlastní model ze special-blocks.js. Pochodně a táboráky svítí.
import * as THREE from 'three';
import { BLOCKS, bkey } from '@louka/shared/blocks.js';
import { groundHeight } from '@louka/shared/terrain.js';
import { scene } from '../render/renderer.js';
import { planksTex, cobbleTex, bricksTex } from '../render/textures.js';
import { makeInstanced, dummy } from '../render/mesh-utils.js';
import { world, blocks } from './state.js';
import { buildSpecial } from './special-blocks.js';
import { player } from '../player/state.js';

/** Materiály obyčejných bloků (podle typu bloku). Nový blok bez textury dostane barvu `color` z shared/blocks.js. */
export const blockMats = {
  planks: new THREE.MeshStandardMaterial({ map: planksTex, roughness: 0.85 }),
  cobble: new THREE.MeshStandardMaterial({ map: cobbleTex, roughness: 0.95 }),
  bricks: new THREE.MeshStandardMaterial({ map: bricksTex, roughness: 0.9 }),
};
/** Materiál bloku (pro nový blok ho vyrobí podle barvy z dat). */
export function blockMat(type) {
  return (blockMats[type] ||= new THREE.MeshStandardMaterial({ color: BLOCKS[type]?.color || '#9a9a9a', roughness: 0.9 }));
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
// Jedna "kreslicí sada" (až 6000 kostek) pro každý typ obyčejného bloku.
const blockMeshes = {};
const meshOf = (type) => (blockMeshes[type] ||= makeInstanced(boxGeo, blockMat(type), 6000));
for (const type of Object.keys(blockMats)) meshOf(type);

/** Zvláštní bloky ve scéně: klíč -> { type, x, y, z, ry, obj, flames }. */
export const specials = new Map();

/** Je na políčku (x, y, z) pevný blok? */
export const solidAt = (x, y, z) => { const t = blocks.get(bkey(x, y, z)); return !!t && BLOCKS[t].solid; };

/** Překreslí všechny bloky podle mapy `blocks` (po položení nebo rozbití). */
export function rebuildBlocks() {
  world.rev++; // bloky se mohly změnit i přímo (ladění) – hra si přepočítá světla
  const counts = {};
  for (const [k, type] of blocks) {
    if (!BLOCKS[type] || BLOCKS[type].special) continue;
    counts[type] ||= 0;
    const [x, y, z] = k.split(',').map(Number);
    dummy.position.set(x + 0.5, y + 0.5, z + 0.5);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    meshOf(type).setMatrixAt(counts[type]++, dummy.matrix);
  }
  for (const [t, m] of Object.entries(blockMeshes)) { m.count = counts[t] || 0; m.instanceMatrix.needsUpdate = true; }

  for (const [k, type] of blocks) {
    if (!BLOCKS[type]?.special || specials.has(k)) continue;
    const [x, y, z] = k.split(',').map(Number);
    const { obj, flames } = buildSpecial(type);
    const ry = solidAt(x, y - 1, z) ? y : Math.max(y, groundHeight(x + 0.5, z + 0.5));
    obj.position.set(x + 0.5, ry, z + 0.5);
    scene.add(obj);
    specials.set(k, { type, x, y, z, ry, obj, flames });
  }
  for (const [k, s] of specials) if (!blocks.has(k)) { scene.remove(s.obj); specials.delete(k); }
}

// Světla pochodní a táboráků: pevný počet světel se přiděluje těm nejbližším.
const lightPool = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xff9440, 0, 16, 1.7); scene.add(l); return l; });

/** Rozsvítí nejbližší pochodně a táboráky a nechá plameny plápolat. */
export function updateLights(time) {
  const list = [...specials.values()].filter((s) => BLOCKS[s.type].light);
  const p = player.pos;
  list.sort((a, b) => (a.x - p.x) ** 2 + (a.z - p.z) ** 2 - ((b.x - p.x) ** 2 + (b.z - p.z) ** 2));
  lightPool.forEach((l, i) => {
    const s = list[i];
    if (!s) { l.intensity = 0; return; }
    const flick = 0.85 + 0.1 * Math.sin(time * 13 + i) + 0.05 * Math.sin(time * 31 + i * 3);
    l.position.set(s.x + 0.5, s.ry + (s.type === 'campfire' ? 0.6 : 0.85), s.z + 0.5);
    l.intensity = BLOCKS[s.type].light * flick;
  });
  for (const s of list) for (const f of s.flames) f.scale.setScalar(f.userData.base * (0.85 + 0.2 * Math.sin(time * 17 + s.x + f.position.y * 9)));
}
