// ============================================================ kamera: pohled z očí, zezadu, zepředu (F5)
// Jako v Minecraftu: F5 přepíná 1. osobu → 3. osobu zezadu → 3. osobu zepředu.
// Ve 3. osobě je vidět vlastní postavička; míří se ale pořád z očí (player/targeting.js).
// Při běhu se zorné pole trochu rozšíří.
import { lookDir } from '@louka/shared/game/player.js';
import { groundHeight } from '@louka/shared/terrain.js';
import { camera } from './renderer.js';
import { buildAvatar, poseAvatar } from './avatars.js';
import { setHandsVisible } from './held-item.js';
import { solidAt } from '../world/blocks.js';
import { player } from '../player/state.js';

const FOV = 70, MODES = 3, DIST = 4;

/** mode: 0 = z očí, 1 = zezadu, 2 = zepředu. */
export const view = { mode: 0 };

/** F5: další pohled. */
export function cycleView() { view.mode = (view.mode + 1) % MODES; }

let self = null, fov = FOV;

// Jak daleko může kamera couvnout od očí, než narazí na blok nebo terén.
function freeDistance(x, y, z, dx, dy, dz) {
  for (let t = 0.2; t <= DIST; t += 0.1) {
    const px = x + dx * t, py = y + dy * t, pz = z + dz * t;
    if (solidAt(Math.floor(px), Math.floor(py), Math.floor(pz)) || py < groundHeight(px, pz) + 0.15) return Math.max(0.2, t - 0.3);
  }
  return DIST;
}

/**
 * Postaví kameru. (x, y, z) = oči hráče (už s pohupováním a otřesem).
 * @param {number} dt čas od minulého snímku
 */
export function placeCamera(x, y, z, dt) {
  const d = lookDir(player);
  if (view.mode === 0) {
    camera.position.set(x, y, z);
    camera.rotation.set(player.pitch, player.yaw, 0);
  } else {
    const back = view.mode === 1 ? -1 : 1, t = freeDistance(x, y, z, d.x * back, d.y * back, d.z * back);
    camera.position.set(x + d.x * back * t, y + d.y * back * t, z + d.z * back * t);
    if (view.mode === 1) camera.rotation.set(player.pitch, player.yaw, 0);
    else camera.rotation.set(-player.pitch, player.yaw + Math.PI, 0);
  }
  setHandsVisible(view.mode === 0);
  if (view.mode !== 0 || self) {
    self ||= buildAvatar(player.name, false);
    self.g.visible = view.mode !== 0 && player.alive;
    if (self.g.visible) poseAvatar(self, player.pos, player.yaw, player.sneaking, dt);
  }
  // Běh: zorné pole se plynule rozšíří o 10 %.
  const want = FOV * (player.sprinting ? 1.1 : 1);
  if (Math.abs(fov - want) > 0.01) {
    fov += (want - fov) * Math.min(1, dt * 10);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}
