// window.game pro ladění a testy; spuštění smyčky.
import '../net/mp-start.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { DINE_STYLE } from '../dining/dine-view.js';
import { canDine, dining, startDining, takeBite } from '../dining/dining.js';
import { buildFoodInto } from '../dining/food-models.js';
import { NET } from './boot.js';
import { frame, tick } from './loop.js';
import { GFX, QUALITY, TOUCH } from './prefs.js';
import { saveGame, worldState } from './save.js';
import { furnaces } from '../machines/furnace.js';
import { crops, startCooking, stoves, updateCrops } from '../machines/kitchen.js';
import { netStats, nets, power, rebuildNets, toggleSwitch } from '../machines/power.js';
import { hitMob, mobs, spawnMob } from '../mobs/mobs.js';
import { others } from '../net/multiplayer.js';
import { closePC, openApp, openPC, pc, pcPower } from '../pc/computer.js';
import { closeDoc, openDoc } from '../pc/doc-view.js';
import { useDocs } from '../pc/papers-world.js';
import { newPaper, paperSpots, pcDisks, printJob } from '../pc/printer.js';
import { sitOn, startEating, tableItems, useTable } from '../player/eating.js';
import { breakTarget, cellFree, placeBlock, target, useItem } from '../player/interaction.js';
import { addItem, countItem, findRecipe, inv } from '../player/inventory.js';
import { collidesBlocks, creative, input, keys, lockPointer, player, setCreative, toggleGuide, unlockPointer } from '../player/player.js';
import { damagePlayer } from '../player/survival.js';
import { pickTarget } from '../player/targeting.js';
import { rebuildBlocks } from '../render/blocks.js';
import { setDay, underground } from '../render/daylight.js';
import { forestRocks, forestTrees } from '../render/forest.js';
import { cutGrass } from '../render/grass.js';
import { ICONS } from '../render/icons.js';
import { camera, renderer, scene } from '../render/renderer.js';
import { voxChunks } from '../render/vox-mesh.js';
import { armor, armorPoints, chests, closeInventory, fillCooking, fillRecipe, fires, fullSet, openInventory, slotClick, takeResult, ui } from '../ui/inventory-ui.js';
import { CAR, enterVehicle, exitVehicle, spawnVehicle, vehicles } from '../vehicles/car.js';
import { PLANE, planeHits } from '../vehicles/plane.js';
import { setVox } from '../world/dig.js';
import { fishing, useRod } from '../world/fishing.js';
import { dropHeld, groundItems, throwItem } from '../world/ground-items.js';
import { ensureDoc, papers } from '../world/papers.js';
import { portalActive, teleport, usePortal } from '../world/shrine.js';
import { buildStructure, ruinsBuilt, spawners } from '../world/structures.js';
import { blockMeta, blocks } from '../world/world-state.js';
import { BLOCKS, ITEMS, KITCHEN, RECIPES, RECIPE_CATS, SHAPES, smeltResult } from '../../../shared/data/index.js';
import { pondLevel, waterAt } from '../../../shared/world/nature.js';
import { STRUCTS, ruinsNear, structuresNear } from '../../../shared/world/structures.js';
import { SHRINES, biomeAt, biomeWeights, pondOf, terrainH, volcanoOf } from '../../../shared/world/terrain.js';
import { V, columnDug, getVox, groundHeight, topY } from '../../../shared/world/voxels.js';

// Pro ladění v konzoli prohlížeče.
export const game = window.game = {
  testMode: false, tick, input, keys, player, inv, ui, fires, ICONS, addItem, countItem, RECIPES, mobs, spawnMob, blocks, rebuildBlocks, forestTrees, forestRocks,
  slotClick, takeResult, fillRecipe, fillCooking, findRecipe, cutGrass, getVox, setVox, topY, columnDug, voxChunks, V,
  get underground() { return underground; }, armor, armorPoints, chests, damagePlayer, SHRINES, usePortal, teleport, ruinsNear, ruinsBuilt, ITEMS,
  get portalActive() { return portalActive; }, get dining() { return dining; }, canDine, tableItems, useTable, sitOn, useRod, fishing, waterAt, pondOf, pondLevel, startEating, groundItems, dropHeld, stoves, crops, KITCHEN, startCooking, updateCrops, spawners, structuresNear, STRUCTS, toggleGuide, fullSet, buildStructure, setCreative, get creative() { return creative; }, cellFree,
  NET, others, worldState, saveGame, renderer, pc, openPC, closePC, pcPower, openApp, papers, pcDisks, paperSpots, openDoc, closeDoc, useDocs, newPaper, printJob, ensureDoc, vehicles, spawnVehicle, enterVehicle, exitVehicle, CAR, PLANE, planeHits, power, nets, netStats, rebuildNets, toggleSwitch, furnaces, smeltResult, RECIPE_CATS, terrainH, groundHeight, biomeAt, biomeWeights, volcanoOf, teleport, blockMeta, BLOCKS, SHAPES, useItem, collidesBlocks, TOUCH, QUALITY, GFX, lockPointer, unlockPointer, breakTarget, placeBlock, throwItem, hitMob, pickTarget, setTime: (t) => setDay(t), get target() { return target; }, openInventory, closeInventory, startDining, DINE_STYLE, scene, camera, buildFoodInto, takeBite,
};
window.gameStarted = true;
frame();
