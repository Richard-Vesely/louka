// ============================================================ úlomky světla – vzhled a sbírání
// Zářící krystaly s paprskem do nebe. Kde leží, říká shardAt() v shared/worldgen.js.
import * as THREE from 'three';
import { terrainH } from '@louka/shared/terrain.js';
import { shardAt } from '@louka/shared/worldgen.js';
import { SHARD_CELL } from '@louka/shared/constants.js';
import { scene, U } from '../render/renderer.js';
import { glowTex } from '../render/textures.js';
import { sparks } from '../render/particles.js';
import { clock } from '../core/runtime.js';
import { Sound } from '../audio/sound.js';
import { removed } from './state.js';
import { player } from '../player/player.js';
import { addItem } from '../inventory/inventory.js';
import { toast } from '../ui/hud.js';

/** Úlomky, které jsou teď ve scéně: klíč -> { x, z, group, crystal }. */
export const shardObjs = new Map();
const beamMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.time },
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      float a = pow(1.0 - vUv.y, 2.5) * (0.55 + 0.15 * sin(uTime * 3.0 + vUv.y * 20.0));
      gl_FragColor = vec4(vec3(0.35, 0.9, 1.0) * a * 0.6, 1.0);
    }`,
});
const crystalGeo = new THREE.OctahedronGeometry(0.42).scale(1, 1.7, 1);
const crystalMat = new THREE.MeshStandardMaterial({ color: 0xbff8ff, emissive: 0x3fdcff, emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.1 });
const beamGeo = new THREE.CylinderGeometry(0.12, 0.5, 90, 12, 1, true).translate(0, 45, 0);

/** Přidá úlomky do 420 m od hráče a vzdálenější odebere. */
export function refreshShards(px, pz) {
  const R = 420, wanted = new Set();
  for (let cz = Math.floor((pz - R) / SHARD_CELL); cz <= Math.floor((pz + R) / SHARD_CELL); cz++) {
    for (let cx = Math.floor((px - R) / SHARD_CELL); cx <= Math.floor((px + R) / SHARD_CELL); cx++) {
      const s = shardAt(cx, cz);
      if (!s || removed.has(s.key) || (s.x - px) ** 2 + (s.z - pz) ** 2 > R * R) continue;
      wanted.add(s.key);
      if (shardObjs.has(s.key)) continue;
      const g = new THREE.Group();
      g.position.set(s.x, terrainH(s.x, s.z), s.z);
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      crystal.position.y = 1.3;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x66e8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glow.scale.setScalar(3.2);
      glow.position.y = 1.3;
      g.add(crystal, glow, new THREE.Mesh(beamGeo, beamMat));
      scene.add(g);
      shardObjs.set(s.key, { ...s, group: g, crystal });
    }
  }
  for (const [k, o] of shardObjs) if (!wanted.has(k)) { scene.remove(o.group); shardObjs.delete(k); }
}

/** Točí krystaly a sebere úlomek, když do něj hráč vejde. */
export function updateShards(dt) {
  for (const [k, s] of shardObjs) {
    s.crystal.rotation.y += dt * 1.2;
    s.crystal.position.y = 1.3 + Math.sin(clock.gameClock * 2 + s.x) * 0.15;
    if (player.alive && Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < 1.9) {
      removed.add(k);
      scene.remove(s.group);
      shardObjs.delete(k);
      addItem('shard', 1);
      sparks.emit(s.x, s.group.position.y + 1.3, s.z, [0.4, 0.95, 1.0], 80, 5, 3);
      Sound.pickup();
      toast('Úlomek světla!');
    }
  }
}
