// ============================================================ tvorové – jak vypadají a hýbou se
// Kde tvorové jsou a co dělají, řeší hra (shared/game/mobs.js). Tady se kreslí: model, stín,
// pohyb nohou, blikání po zásahu, umírání, hoření na slunci a zvuky.
import * as THREE from 'three';
import { scene } from '../render/renderer.js';
import { debris } from '../render/particles.js';
import { Sound } from '../audio/sound.js';
import { mobs } from '../world/state.js';
import { player } from '../player/state.js';
import { buildMob } from './mob-models.js';

export { mobs };

const shadowGeo = new THREE.CircleGeometry(0.75, 20).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });

/** Modely ve scéně: id tvora -> { group, body, legs, mats, shadow, phase, flash, deathT, soundT, last }. */
const views = new Map();

function createView(m) {
  const v = buildMob(m.type);
  v.shadow = new THREE.Mesh(shadowGeo, shadowMat);
  scene.add(v.group, v.shadow);
  Object.assign(v, { phase: Math.random() * 6, flash: 0, deathT: 0, soundT: 3 + Math.random() * 8, last: { x: m.pos.x, z: m.pos.z } });
  views.set(m.id, v);
  return v;
}

/** Tvor dostal zásah – na chvíli zbělá. */
export function flashMob(id) {
  const v = views.get(id);
  if (v) v.flash = 1;
}

/**
 * Překreslí všechny tvory.
 * @param {number} dt herní čas (0 = pauza)
 * @param {number} day jak moc je den (0..1) – stínožrouti na slunci kouří
 */
export function updateMobViews(dt, day) {
  const seen = new Set();
  for (const m of mobs) {
    seen.add(m.id);
    const v = views.get(m.id) || createView(m);
    if (m.dead) {
      v.deathT += dt;
      v.group.scale.setScalar(Math.max(0.01, 1 - v.deathT * 2.5));
      v.group.rotation.z += dt * 6;
      continue;
    }
    // Rychlost: offline ji hra zná, online ji odhadneme z posunu.
    const sp = m.vel ? Math.hypot(m.vel.x, m.vel.z) : dt > 0 ? Math.hypot(m.pos.x - v.last.x, m.pos.z - v.last.z) / dt : 0;
    v.last.x = m.pos.x; v.last.z = m.pos.z;
    v.phase += dt * (sp * 2.2 + (m.type === 'crawler' ? 2 : 0));
    let hop = 0;
    if (m.type === 'crawler') {
      hop = Math.abs(Math.sin(v.phase)) * (sp > 2 ? 0.5 : 0.18);
      const squash = 1 + Math.cos(v.phase * 2) * 0.12;
      v.body.scale.set(1 / Math.sqrt(squash), 0.8 * squash, 1.15 / Math.sqrt(squash));
      if (day > 0.75 && Math.random() < dt * 20) debris.emit(m.pos.x, m.pos.y + 0.8, m.pos.z, [0.1, 0.1, 0.1], 2, 1, 2);
    } else {
      const swing = Math.sin(v.phase * 2.2) * Math.min(sp / 2, 1) * 0.7;
      v.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? 1 : -1) * swing));
      v.body.position.y = (m.type === 'sheep' ? 0.78 : 0.72) + Math.abs(swing) * 0.03;
    }
    v.group.position.set(m.pos.x, m.pos.y + hop, m.pos.z);
    v.shadow.position.set(m.pos.x, m.pos.y + 0.03, m.pos.z);
    v.group.rotation.y = m.ry;

    v.flash = Math.max(0, v.flash - dt * 5);
    for (const mat of v.mats) mat.emissive.setRGB(v.flash * 1.5, v.flash * 1.5, v.flash * 1.5);
    if ((v.soundT -= dt) <= 0) {
      v.soundT = 5 + Math.random() * 10;
      if (Math.hypot(player.pos.x - m.pos.x, player.pos.z - m.pos.z) < 25) m.type === 'sheep' ? Sound.baa() : m.type === 'boar' ? Sound.grunt() : Sound.growl();
    }
  }
  for (const [id, v] of views) if (!seen.has(id)) { scene.remove(v.group, v.shadow); views.delete(id); }
}
