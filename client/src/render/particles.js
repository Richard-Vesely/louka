// ============================================================ částice
// Jiskry (svítí) a úlomky (třísky, kamínky, tráva), které odletí při těžbě nebo zásahu.
import * as THREE from 'three';
import { scene } from './renderer.js';
import { glowTex } from './textures.js';

function makeParticles(blending) {
  const N = 1000;
  const pos = new Float32Array(N * 3).fill(-9999), col = new Float32Array(N * 3), base = new Float32Array(N * 3), vel = new Float32Array(N * 3);
  const life = new Float32Array(N), maxLife = new Float32Array(N);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: blending === THREE.AdditiveBlending ? 0.13 : 0.09, vertexColors: true, transparent: true, depthWrite: false, blending, map: glowTex }));
  pts.frustumCulled = false;
  scene.add(pts);
  let next = 0;
  return {
    /** Vypustí `n` částic z bodu (x, y, z) dané barvy [r, g, b]. */
    emit(x, y, z, color, n, speed = 4, up = 2) {
      for (let k = 0; k < n; k++) {
        const i = next;
        next = (next + 1) % N;
        pos.set([x, y, z], i * 3);
        const a = Math.random() * Math.PI * 2, e = Math.random() * 2 - 1, sp = speed * (0.3 + Math.random() * 0.7);
        vel.set([Math.cos(a) * Math.sqrt(1 - e * e) * sp, e * sp + up, Math.sin(a) * Math.sqrt(1 - e * e) * sp], i * 3);
        const v = 0.7 + Math.random() * 0.6;
        base.set([color[0] * v, color[1] * v, color[2] * v], i * 3);
        life[i] = maxLife[i] = 0.5 + Math.random() * 0.8;
      }
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        const j = i * 3;
        vel[j + 1] -= 7 * dt;
        pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
        const k = Math.max(life[i] / maxLife[i], 0);
        col[j] = base[j] * k; col[j + 1] = base[j + 1] * k; col[j + 2] = base[j + 2] * k;
        if (life[i] <= 0) pos[j + 1] = -9999;
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
    },
  };
}
export const sparks = makeParticles(THREE.AdditiveBlending);
export const debris = makeParticles(THREE.NormalBlending);
