// ============================================================ postavičky hráčů a jmenovky
// Jednoduchá postava (tělo, hlava, nohy) v barvě podle jména a nad ní jméno.
// Ostatní hráče kreslí updateAvatars(); vlastní postavu (pohled F5) render/view.js.
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

/**
 * Postaví postavičku hráče a přidá ji do scény.
 * @param {string} name jméno (podle něj barva a jmenovka)
 * @param {boolean} [tag] ukázat jmenovku
 */
export function buildAvatar(name, tag = true) {
  const g = new THREE.Group(), upper = new THREE.Group();
  g.add(upper);
  const body = new THREE.MeshStandardMaterial({ color: colorOf(name), roughness: 0.7 });
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); upper.add(m); return m; };
  box(0.55, 0.7, 0.3, body, 0, 1.1, 0);
  box(0.42, 0.42, 0.42, skin, 0, 1.68, 0);
  box(0.36, 0.08, 0.06, dark, 0, 1.72, -0.21); // oči
  // Noha se otáčí v kyčli, proto je její střed otáčení nahoře (translate posune kostku dolů).
  const leg = (x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.24).translate(0, -0.375, 0), dark); m.position.set(x, 0.75, 0); g.add(m); return m; };
  const legs = [leg(-0.14), leg(0.14)];
  const label = tag ? nameTag(name) : null;
  if (label) g.add(label);
  scene.add(g);
  return { g, upper, legs, label, last: null, phase: 0 };
}

/**
 * Nastaví postavičku: místo, otočení, krok nohou, a přikrčení při plížení (Shift).
 * Plížícímu se hráči je jmenovka vidět jen napřímo, ne přes zeď (jako v Minecraftu).
 */
export function poseAvatar(v, pos, yaw, sneak, dt) {
  const last = v.last || { x: pos.x, z: pos.z };
  const sp = dt > 0 ? Math.hypot(pos.x - last.x, pos.z - last.z) / dt : 0;
  v.last = { x: pos.x, z: pos.z };
  v.phase += dt * sp * 2.2;
  const swing = Math.sin(v.phase * 2) * Math.min(sp / 3, 1) * 0.6;
  v.legs[0].rotation.x = swing;
  v.legs[1].rotation.x = -swing;
  // Přikrčení: horní půlka se nakloní dopředu a sníží.
  v.upper.rotation.x = sneak ? -0.45 : 0;
  v.upper.position.set(0, sneak ? -0.12 : 0, sneak ? 0.32 : 0);
  if (v.label) {
    v.label.material.depthTest = !!sneak;
    v.label.material.opacity = sneak ? 0.5 : 1;
    v.label.position.y = sneak ? 1.95 : 2.2;
  }
  v.g.position.set(pos.x, pos.y, pos.z);
  v.g.rotation.y = yaw;
}

/** Překreslí ostatní hráče (každý snímek). */
export function updateAvatars(dt) {
  for (const o of others.values()) {
    const v = views.get(o.id) || views.set(o.id, buildAvatar(o.name)).get(o.id);
    poseAvatar(v, o.pos, o.yaw, o.sneak, dt);
  }
  for (const [id, v] of views) if (!others.has(id)) { scene.remove(v.g); views.delete(id); }
}
