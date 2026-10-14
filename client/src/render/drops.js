// ============================================================ věci ležící na zemi – jak vypadají
// Kde věci jsou, řeší hra (shared/game/drops.js). Tady se kreslí: malá kostka (bloky) nebo ikona,
// která se točí a pohupuje. Když věc někdo sebere, přiletí k němu.
import * as THREE from 'three';
import { ITEMS } from '@louka/shared/items.js';
import { BLOCKS } from '@louka/shared/blocks.js';
import { scene } from './renderer.js';
import { iconTexture } from './held-item.js';
import { blockMat } from '../world/blocks.js';
import { world } from '../world/state.js';
import { others } from '../net/replica.js';
import { player } from '../player/state.js';

const cube = new THREE.BoxGeometry(0.25, 0.25, 0.25);
const spriteMats = {};
const views = new Map(); // k -> { obj, n, fly }

function build(id) {
  const g = new THREE.Group(), d = ITEMS[id];
  const one = () => {
    if (d.block && !BLOCKS[d.block]?.special) return new THREE.Mesh(cube, blockMat(d.block));
    const s = new THREE.Sprite(spriteMats[id] ||= new THREE.SpriteMaterial({ map: iconTexture(id), transparent: true, alphaTest: 0.5 }));
    s.scale.setScalar(0.38);
    return s;
  };
  g.add(one());
  const extra = one(); // větší hromádka = dva kusy vedle sebe
  extra.position.set(0.08, 0.06, 0.06);
  extra.visible = false;
  g.add(extra);
  scene.add(g);
  return g;
}

/** Věc `k` sebral hráč `by`: nech ji přiletět k němu a pak zmizet. */
export function flyDrop(k, by) {
  const v = views.get(k);
  if (!v) return;
  const o = by === player.id ? player : others.get(by);
  v.fly = o ? { target: o.pos, t: 0 } : null;
  if (!v.fly) { scene.remove(v.obj); views.delete(k); }
}

/** Překreslí věci na zemi (každý snímek). */
export function updateDropViews(dt, clockT) {
  for (const d of world.drops.values()) {
    let v = views.get(d.k);
    if (!v) views.set(d.k, (v = { obj: build(d.id), fly: null }));
    v.obj.children[1].visible = d.n > 1;
    v.obj.position.set(d.x, d.y + 0.2 + Math.sin(clockT * 2.5 + d.k) * 0.06, d.z);
    v.obj.rotation.y = clockT * 1.6 + d.k;
  }
  for (const [k, v] of views) {
    if (world.drops.has(k)) continue;
    if (!v.fly) { scene.remove(v.obj); views.delete(k); continue; }
    // Let k hráči (0,15 s).
    v.fly.t += dt / 0.15;
    const p = v.obj.position, t = v.fly.target;
    p.lerp(new THREE.Vector3(t.x, t.y + 1.1, t.z), Math.min(1, v.fly.t));
    v.obj.scale.setScalar(Math.max(0.2, 1 - v.fly.t * 0.6));
    if (v.fly.t >= 1) { scene.remove(v.obj); views.delete(k); }
  }
}
