// ============================================================ Říše – start hry a herní smyčka
// Tady se všechno spojí dohromady. Každý snímek se zavolá tick(): pohyb, svět, tvorové, HUD, vykreslení.
import * as THREE from 'three';
import { EYE } from '@louka/shared/constants.js';
import { RECIPES, findRecipe } from '@louka/shared/recipes.js';
import { $ } from './core/dom.js';
import { clock, debug } from './core/runtime.js';
import { save } from './save/load.js';
import { renderer, scene, camera, U } from './render/renderer.js';
import { sky, stars, updateEnvironment } from './render/sky.js';
import { ICONS } from './render/icons.js';
import { ground } from './world/ground.js';
import { grassLayers, regrowGrass, cutGrass } from './world/grass.js';
import './render/fireflies.js';
import { blocks, fires } from './world/state.js';
import { rebuildForest, forestTrees, forestRocks } from './world/forest.js';
import { updateShards } from './world/shards.js';
import './world/shrine.js';
import { rebuildBlocks, specials, updateLights } from './world/blocks.js';
import { sparks, debris } from './render/particles.js';
import { Sound } from './audio/sound.js';
import { inv, addItem, countItem } from './inventory/inventory.js';
import { ui, slotClick, takeResult, fillRecipe, fillCooking, updateFires } from './inventory/crafting.js';
import { renderHotbar, openInventory, closeInventory } from './inventory/inventory-ui.js';
import { player, updatePlayer } from './player/player.js';
import { keys, input, isLocked } from './player/controls.js';
import { updateHeldModel, updateSwing } from './render/held-item.js';
import { act, updateInteraction } from './player/interaction.js';
import { updateSurvival } from './player/survival.js';
import { mobs, spawnMob, updateMobs, updateSpawns } from './mobs/mobs.js';
import { time, updateDay } from './world/day.js';
import { updateHUD } from './ui/hud.js';
import { updateTips } from './ui/tips.js';
import './save/save.js';

const timer = new THREE.Clock();
let envTimer = 0, frames = 0, fpsTimer = 0, settle = 0;
rebuildForest(player.pos.x, player.pos.z, true);
rebuildBlocks();
updateDay(0);
updateEnvironment();
renderHotbar();
updateTips();
if (!save) $('intro').style.display = 'grid';

/** Jeden krok hry o `realDt` sekund. */
function tick(realDt) {
  const playing = (isLocked() || debug.testMode) && !ui.open;
  const dt = playing ? realDt : 0;
  clock.gameClock += realDt;
  clock.gameTime += dt;
  U.time.value = clock.gameClock;

  let moving = 0;
  if (playing && player.alive) moving = updatePlayer(dt);
  else { camera.rotation.set(player.pitch, player.yaw, 0); camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z); }
  updateHeldModel();
  updateSwing(dt, moving);

  const { night, day } = updateDay(dt);
  rebuildForest(player.pos.x, player.pos.z);
  if (playing) {
    if (player.alive) updateInteraction(dt);
    updateSurvival(dt);
    updateMobs(dt, day);
    updateSpawns(dt, night);
    updateShards(dt);
  }
  updateFires(realDt);
  regrowGrass(realDt);
  updateLights(clock.gameClock);
  if (Math.random() < realDt * 6) for (const s of specials.values()) if (s.type === 'campfire') sparks.emit(s.x + 0.5, s.ry + 0.4, s.z + 0.5, [1, 0.5, 0.15], 1, 0.6, 1.5);
  sparks.update(realDt);
  debris.update(realDt);
  const gust = 0.5 + 0.5 * Math.sin(clock.gameClock * 0.35) * Math.sin(clock.gameClock * 0.13 + 1);
  Sound.update(gust, night, realDt);

  U.cam.value.copy(camera.position);
  sky.position.copy(camera.position);
  ground.position.set(Math.round(camera.position.x / 4) * 4, 0, Math.round(camera.position.z / 4) * 4);
  stars.position.copy(camera.position);
  if ((envTimer += realDt) > 3) { envTimer = 0; updateEnvironment(); }

  // Když hra běží pomalu (pod 40 snímků za sekundu), ubere se trávy.
  frames++;
  if ((fpsTimer += realDt) >= 2) {
    if (++settle > 1 && frames / fpsTimer < 40) for (const g of grassLayers) if (g.geometry.instanceCount > 25000) g.geometry.instanceCount = Math.floor(g.geometry.instanceCount * 0.8);
    frames = 0;
    fpsTimer = 0;
  }
  updateHUD(realDt);
  renderer.render(scene, camera);
}
function frame() {
  requestAnimationFrame(frame);
  tick(Math.min(timer.getDelta(), 0.05));
}

// Pro ladění v konzoli prohlížeče (a pro automatický test tests/playtest).
window.game = {
  get testMode() { return debug.testMode; },
  set testMode(v) { debug.testMode = !!v; },
  tick, input, keys, player, inv, ui, fires, ICONS, addItem, countItem, RECIPES, mobs, spawnMob, blocks, rebuildBlocks, forestTrees, forestRocks,
  slotClick, takeResult, fillRecipe, fillCooking, findRecipe, cutGrass,
  setTime: (t) => (time.dayTime = t), get target() { return act.target; }, openInventory, closeInventory,
};
window.gameStarted = true;
frame();
