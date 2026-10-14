// ============================================================ ostatní hráči: postavička a jmenovka
// Jednoduchá postava (tělo, hlava, nohy) v barvě podle jména a nad ní jméno.
import * as THREE from 'three';
import { hash2 } from '@louka/shared/math.js';
import { scene } from './renderer.js';
import { others } from '../net/replica.js';

const views = new Map();
const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48a, roughness: 0.8 });
const dark = new THREE.MeshStandardMaterial({ color: 0x2c2a33, roughness: 0.9 });

// Barva podle jména: stejné jméno = vždy stejná barva.
function colorOf(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) | 0;
  return new THREE.Color().setHSL(hash2(h, 7), 0.6, 0.5);
}

// Jmenovka: text nakreslený do obrázku, který se vždy natáčí ke kameře.
function nameTag(name) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 34px "Pixelify Sans", monospace';
  const w = Math.min(248, g.measureText(name).width + 24);
  g.fillStyle = 'rgba(10, 14, 22, 0.6)';
  g.fillRect(128 - w / 2, 8, w, 48);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 128, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1);
  s.position.y = 2.2;
  s.renderOrder = 10;
  return s;
}

function build(o) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: colorOf(o.name), roughness: 0.7 });
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
  box(0.55, 0.7, 0.3, body, 0, 1.1, 0);
  box(0.42, 0.42, 0.42, skin, 0, 1.68, 0);
  box(0.36, 0.08, 0.06, dark, 0, 1.72, -0.21); // oči
  // Noha se otáčí v kyčli, proto je její střed otáčení nahoře (translate posune kostku dolů).
  const leg = (x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.24).translate(0, -0.375, 0), dark); m.position.set(x, 0.75, 0); g.add(m); return m; };
  const legs = [leg(-0.14), leg(0.14)];
  g.add(nameTag(o.name));
  scene.add(g);
  return { g, legs, last: { x: o.pos.x, z: o.pos.z }, phase: 0 };
}

/** Překreslí ostatní hráče (každý snímek). */
export function updateAvatars(dt) {
  for (const o of others.values()) {
    const v = views.get(o.id) || views.set(o.id, build(o)).get(o.id);
    const sp = dt > 0 ? Math.hypot(o.pos.x - v.last.x, o.pos.z - v.last.z) / dt : 0;
    v.last.x = o.pos.x; v.last.z = o.pos.z;
    v.phase += dt * sp * 2.2;
    const swing = Math.sin(v.phase * 2) * Math.min(sp / 3, 1) * 0.6;
    v.legs[0].rotation.x = swing;
    v.legs[1].rotation.x = -swing;
    v.g.position.set(o.pos.x, o.pos.y, o.pos.z);
    v.g.rotation.y = o.yaw;
  }
  for (const [id, v] of views) if (!others.has(id)) { scene.remove(v.g); views.delete(id); }
}
