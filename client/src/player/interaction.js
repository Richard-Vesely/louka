// Těžba, útok, pokládání a použití předmětů.
import './targeting.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { BLOCKS, CROPS, ITEMS, TOOL_SPEED } from '../../../shared/data/index.js';
import { NET } from '../../../shared/net/net.js';
import { randInt } from '../../../shared/util.js';
import { nearPond } from '../../../shared/world/nature.js';
import { bkey, blockMeta, blocks, chairRot, chests, crops, fires, furnaces, pcDisks, power, removed, ruinsOpened, spawners, stoves, tableItems, vehicles } from '../../../shared/world/state.js';
import { structuresNear } from '../../../shared/world/structures.js';
import { biomeAt, forest } from '../../../shared/world/terrain.js';
import { V, VOX, columnDug, getVox, setVox, topY } from '../../../shared/world/voxels.js';
import { Sound } from '../audio/sound.js';
import { MP } from '../game/boot.js';
import { harvestCrop } from '../machines/kitchen.js';
import { toggleSwitch } from '../machines/power.js';
import { hitMob } from '../mobs/mobs.js';
import { others } from '../net/multiplayer.js';
import { openPC } from '../pc/computer.js';
import { dropSpotsAt, takeSpot, useDocs, withPaper } from '../pc/papers-world.js';
import { rebuildBlocks } from '../render/blocks.js';
import { rebuildForest } from '../render/forest.js';
import { cutGrass } from '../render/grass.js';
import { startSwing } from '../render/held-item.js';
import { debris, sparks } from '../render/particles.js';
import { scene } from '../render/renderer.js';
import { $ } from '../ui/dom.js';
import { toast } from '../ui/hud.js';
import { openInventory, renderHotbar } from '../ui/inventory-ui.js';
import { carHits, floorAt, myDriverId, spawnVehicle, vehDim } from '../vehicles/car.js';
import { planeSpot } from '../vehicles/plane.js';
import { useRod } from '../world/fishing.js';
import { usePortal } from '../world/shrine.js';
import { placedAny } from '../world/world-state.js';
import { sitOn, startEating, useTable } from './eating.js';
import { addItem, consumeSelected, heldStack, inv } from './inventory.js';
import { creative, input, player, playerIntersects } from './player.js';
import { pickTarget } from './targeting.js';

// ============================================================ těžba, útok, pokládání
export const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
outline.visible = false;
scene.add(outline);
// Kroužek na zemi = kam míříš; průhledná kostka = kam se položí blok.
export const groundRing = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
groundRing.visible = false;
scene.add(groundRing);
export const preview = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
preview.visible = false;
scene.add(preview);
export let target = null, swingCd = 0, useCd = 0;
export function clearTarget() { target = null; }
export function resetUseCd() { useCd = 0; }
// Kam se položí blok: k zasažené stěně, na povrch terénu nebo na podlahu svatyně.
function placementCell(t) {
  if (!t) return null;
  if (t.surface || t.kind === 'grass' || t.kind === 'ground') { const [x, y, z] = t.point; return [Math.floor(x), Math.floor(y + 0.2), Math.floor(z)]; }
  if (t.kind === 'block' || t.kind === 'vox') return t.cell.map((v, i) => v + t.normal[i]);
  return null;
}
// Je buňka volná pro nový blok? (nic tam není položené ani to není plná zemina pod povrchem)
export function cellFree(x, y, z) {
  if (blocks.has(bkey(x, y, z))) return false;
  const top = topY(x, z);
  if (y > top) return true;
  if (y === top && !columnDug(x, z)) return true; // horní blok je schovaný pod terénem
  return getVox(x, y, z, top) === V.AIR;
}
const mining = { key: null, p: 0 };
const toolOf = (s) => (s && ITEMS[s.id].tool ? ITEMS[s.id] : null);
const CHIP = { tree: [0.42, 0.3, 0.17], rock: [0.5, 0.5, 0.48], iron: [0.65, 0.35, 0.15], grass: [0.25, 0.5, 0.12], planks: [0.6, 0.45, 0.28], cobble: [0.5, 0.5, 0.48], bricks: [0.55, 0.52, 0.48], dirt: [0.42, 0.3, 0.2] };

export function updateInteraction(dt) {
  target = withPaper(pickTarget()); // papíry a rámečky ve světě (14e)
  const tool = toolOf(heldStack());
  let warn = '';
  const boxCell = target?.kind === 'block' || (target?.kind === 'vox' && !target.surface) ? target.cell : null;
  outline.visible = !!boxCell;
  if (boxCell) outline.position.set(boxCell[0] + 0.5, boxCell[1] + 0.5, boxCell[2] + 0.5);
  groundRing.visible = !!target?.point && (target.kind === 'ground' || target.kind === 'grass' || !!target.surface);
  if (groundRing.visible) {
    groundRing.position.set(target.point[0], target.point[1] + 0.04, target.point[2]);
    groundRing.material.color.set(target.breakable === false ? 0x999999 : target.kind === 'grass' ? 0xffffff : 0xffd27a);
  }
  const held = heldStack();
  const cell = held && ITEMS[held.id].block ? placementCell(target) : null;
  preview.visible = !!cell && cellFree(...cell);
  if (preview.visible) preview.position.set(cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5);

  swingCd -= dt;
  useCd -= dt;
  if (input.lmb && target?.kind === 'mob') {
    if (swingCd <= 0) { startSwing(); Sound.swing(); swingCd = 0.42; hitMob(target.mob, tool ? tool.dmg : 1); }
    mining.key = null;
  } else if (creative && input.lmb && target && target.kind !== 'mob' && target.breakable !== false) {
    if (swingCd <= 0) { startSwing(); swingCd = 0.2; breakTarget(target); }
    mining.key = null;
    mining.p = 0;
  } else if (input.lmb && target && target.kind !== 'mob' && target.breakable !== false) {
    if (mining.key !== target.key) { mining.key = target.key; mining.p = 0; }
    const req = target.req;
    if (req && !(tool && tool.tool === req.tool && tool.tier >= req.tier)) {
      warn = `Potřebuješ ${target.reqName || (req.tier > 1 ? 'kamenný krumpáč' : 'krumpáč')}`;
      mining.p = 0;
      if (swingCd <= 0) { startSwing(); swingCd = 0.4; Sound.mine(); }
    } else {
      const speed = tool && tool.tool === target.tool ? TOOL_SPEED[tool.tier] : 1;
      mining.p += (dt * speed) / target.hard;
      if (swingCd <= 0) {
        startSwing();
        swingCd = 0.34;
        const chip = target.kind === 'vox' ? VOX[target.vox].chip : CHIP[target.kind === 'rock' && target.rock.iron ? 'iron' : target.kind === 'block' ? target.type : target.kind] || CHIP.rock;
        debris.emit(...target.at, chip, 6, 2.5, 1.5);
        if (target.kind === 'tree' || target.tool === 'axe') Sound.chop();
        else if (target.kind === 'grass' || target.tool === 'shovel') Sound.rustle();
        else Sound.mine();
      }
      if (mining.p >= 1) { breakTarget(target); mining.key = null; mining.p = 0; }
    }
  } else {
    if (input.lmb && swingCd <= 0) { startSwing(); Sound.swing(); swingCd = 0.42; }
    mining.key = null;
    mining.p = 0;
  }
  if (input.rmb && useCd <= 0) { useCd = ITEMS[heldStack()?.id]?.block ? 0.15 : 0.25; useItem(); }
  if (input.rmb) pillarPlace();

  const label = $('targetLabel');
  label.innerHTML = warn ? `<span class="warn">${warn}</span>` : target ? `${target.name}${target.hint ? `<small>${target.hint}</small>` : ''}` : '';
  const pr = $('progress');
  pr.style.opacity = mining.p > 0 ? 1 : 0;
  pr.style.background = `conic-gradient(rgba(255,255,255,0.9) ${mining.p * 360}deg, rgba(255,255,255,0.15) 0deg)`;
}

// Co padá ze stromů v biomech: [předmět, min, max]
const TREE_DROPS = {
  cherry: [['cherry_log', 3, 5], ['cherries', 0, 3], ['stick', 0, 2]], jungle: [['jungle_log', 5, 8], ['banana', 0, 3], ['resin', 0, 2]], acacia: [['acacia_log', 3, 5], ['stick', 0, 2]],
  spruce: [['log', 4, 6], ['snowball', 0, 2], ['resin', 0, 1]], dead: [['stick', 3, 6]], deadbush: [['stick', 1, 3]], cactus: [['cactus', 1, 3]], mushroom: [['mushroom_block', 2, 4], ['mushroom', 1, 3]],
};
export function breakTarget(t) {
  if (t.kind === 'tree') {
    removed.add(t.key);
    const tr = t.tree;
    const drops = !tr.mark && TREE_DROPS[tr.kind];
    if (drops) { for (const [id, a, b] of drops) { const n = randInt(a, b); if (n > 0) addItem(id, n); } }
    else {
      addItem(tr.mark ? 'markwood' : 'log', (tr.pine ? 4 : 3) + randInt(0, 2));
      if (Math.random() < 0.4) addItem('stick', randInt(1, 3));
      if (tr.pine && Math.random() < 0.45) addItem('resin', 1); // smrky pouštějí pryskyřici
      if (!tr.pine && !tr.mark && Math.random() < 0.45) addItem('apple', randInt(1, 3)); // jabloně
    }
    debris.emit(tr.x, tr.y + tr.trunkH, tr.z, [0.2, 0.45, 0.12], 60, 5, 2);
    Sound.crack();
    rebuildForest(player.pos.x, player.pos.z, true);
  } else if (t.kind === 'paper') takeSpot(t.id);
  else if (t.kind === 'vehicle') { // rozebrané auto se vrátí do batohu i s kufrem a baterií
    const v = vehicles.get(t.id);
    if (!v) return;
    if (v.driver && v.driver !== myDriverId()) { toast('V autě někdo sedí'); return; }
    for (const s of v.slots) if (s) addItem(s.id, s.n);
    addItem(v.type === 'plane' ? 'biplane' : v.type, 1);
    vehicles.delete(t.id);
    Sound.crack();
  } else if (t.kind === 'rock') {
    removed.add(t.key);
    const r = t.rock;
    if (r.iron) { addItem('iron_ore', randInt(2, 3)); addItem('stone', 1); }
    else addItem('stone', 2 + Math.floor(r.s * 3));
    if (Math.random() < 0.3) addItem('salt', randInt(1, 2)); // solné krystalky v kameni
    debris.emit(r.x, r.y + 0.3, r.z, CHIP[r.iron ? 'iron' : 'rock'], 40, 4, 2);
    Sound.crack();
    rebuildForest(player.pos.x, player.pos.z, true);
  } else if (t.kind === 'block') {
    const k = bkey(...t.cell);
    if (MP && [...others.values()].some((P) => P.pose?.ui === k)) { toast('Tohle teď používá jiný hráč'); return; } // otevřená truhla nebo stroj
    blocks.delete(k);
    blockMeta.delete(k);
    if (CROPS[t.type]) harvestCrop(t.type, k);
    if (BLOCKS[t.type].drop) addItem(BLOCKS[t.type].drop, 1);
    if (tableItems.has(k)) { const t = tableItems.get(k); if (t.food) addItem(t.food, 1); if (t.cutlery) addItem('cutlery', 1); tableItems.delete(k); }
    chairRot.delete(k);
    if (player.sitting === k) player.sitting = null;
    if (stoves.has(k)) { const st = stoves.get(k); if (st.slots[0]) addItem(st.slots[0].id, st.slots[0].n); stoves.delete(k); }
    spawners.delete(k);
    for (const store of [fires.get(k)?.slots, chests.get(k), furnaces.get(k)?.slots, power.get(k)?.slots]) if (store) for (const s of store) if (s) addItem(s.id, s.n);
    fires.delete(k);
    power.delete(k);
    pcDisks.delete(k); // rozebraný počítač přijde o uložené dokumenty
    dropSpotsAt(...t.cell); // papíry na bloku spadnou do batohu
    furnaces.delete(k);
    chests.delete(k);
    debris.emit(...t.at, CHIP[t.type] || CHIP.planks, 25, 3, 1.5);
    Sound.crack();
    rebuildBlocks();
  } else if (t.kind === 'grass') {
    addItem('fiber', randInt(1, 2));
    // V trávě rostou i divoké plodiny: semínka, rajčata, brambory a v lese houby.
    const [gx, , gz] = t.point, r = Math.random();
    if (r < 0.15) addItem('berries', 1);
    else if (r < 0.4) addItem('wheat_seeds', 1);
    else if (r < 0.47) addItem('tomato_seeds', 1);
    else if (r < 0.52) addItem('potato', 1);
    if (forest(gx, gz) > 0.5 && Math.random() < 0.15) addItem('mushroom', 1);
    if (Math.random() < (nearPond(gx, gz) ? 0.3 : 0.03)) addItem('rice', 1); // divoká rýže roste u vody
    // Květiny a houby podle biomu
    const bio = biomeAt(gx, gz);
    if (Math.random() < (bio === 'cherry' ? 0.15 : 0.04)) addItem('red_flower', 1);
    if ((bio === 'meadow' || bio === 'savanna') && Math.random() < 0.08) addItem('yellow_flower', 1);
    if (bio === 'jungle' && Math.random() < 0.12) addItem('blue_flower', 1);
    if (bio === 'mushroom') { if (Math.random() < 0.18) addItem('glowshroom', 1); if (Math.random() < 0.3) addItem('mushroom', 1); }
    cutGrass(t.point[0], t.point[2]);
    debris.emit(...t.point, CHIP.grass, 18, 2, 2.5);
  } else if (t.kind === 'vox') {
    const [x, y, z] = t.cell, def = VOX[t.vox];
    setVox(x, y, z, V.AIR);
    const [id, a, b] = def.drop;
    addItem(id, randInt(a, b));
    if (t.vox === V.STONE && Math.random() < 0.08) addItem('salt', 1);
    if (t.vox === V.DIRT && nearPond(x + 0.5, z + 0.5, 4) && Math.random() < 0.4) addItem('clay', randInt(1, 2)); // jíl u rybníka
    if (t.surface) cutGrass(x + 0.5, z + 0.5, 1.2);
    dropSpotsAt(x, y, z);
    if (t.surface) dropSpotsAt(x, y + 1, z);
    debris.emit(x + 0.5, y + 0.5, z + 0.5, def.chip, 30, 3, 1.5);
    if (def.glow) { sparks.emit(x + 0.5, y + 0.5, z + 0.5, [0.4, 0.95, 1.0], 50, 4, 2); Sound.pickup(); }
    else Sound.crack();
  }
}

export function useItem() {
  if (useDocs()) return; // dokumenty: číst, položit, pověsit, zarámovat, předat
  // Auto: s kanystrem natankuje, jinak otevře kufr
  if (target?.kind === 'vehicle') {
    const v = vehicles.get(target.id);
    if (!v) return;
    if (heldStack()?.id === 'fuel_canister') {
      const fmax = vehDim(v.type).fuelMax;
      if (v.fuel >= fmax - 0.5) { toast('Nádrž je plná'); return; }
      v.fuel = Math.min(fmax, v.fuel + 15);
      consumeSelected();
      Sound.rustle();
      toast(`Natankováno: ${v.fuel.toFixed(1)} / ${fmax} l`);
    } else openInventory('car', target.id);
    return;
  }
  // Položení auta na zem (natočené ve směru pohledu)
  const vehHeld = heldStack() && ITEMS[heldStack().id].vehicle;
  if (vehHeld && target?.point && ['grass', 'ground', 'vox', 'block'].includes(target.kind) && (target.kind !== 'block' || target.normal?.[1] === 1)) {
    let [x, , z] = target.point, y = floorAt(x, z, target.point[1] + 0.5);
    if (vehHeld === 'plane') { // letadlo je větší než dosah ruky: postaví se před hráče ocasem k němu
      const spot = planeSpot(target.point);
      if (!spot.ok) { toast(`Tady se letadlo nevejde – ${spot.why} (potřebuje asi 10 × 8 m)`); return; }
      ({ x, y, z } = spot);
    } else if (carHits({ y }, x, z, player.yaw) || Math.hypot(x - player.pos.x, z - player.pos.z) < 2.2) { toast('Tady se auto nevejde'); return; }
    const id = spawnVehicle(vehHeld, x, z, player.yaw);
    vehicles.get(id).y = y;
    consumeSelected();
    Sound.place();
    toast(vehHeld === 'plane' ? 'Dvouplošník stojí. F = nastoupit, pravé tl. = palivo a zavazadla' : 'Auto stojí. F = nastoupit, pravé tl. = kufr (palivo a autobaterie)');
    return;
  }
  // Pravé tlačítko na pracovní stůl nebo táborák otevře jeho okno.
  const STATION_UI = { workbench: 'bench', campfire: 'fire', chest: 'chest', stove: 'kitchen', furnace: 'furnace', adv_bench: 'adv' };
  const held0 = heldStack();
  if (target?.kind === 'block' && target.type === 'table') { useTable(bkey(...target.cell)); return; }
  if (target?.kind === 'block' && target.type === 'chair' && !player.sitting) { sitOn(bkey(...target.cell)); return; }
  if (held0?.id === 'fishing_rod') { useRod(); return; }
  // Studna: prázdný kbelík naplníš vodou
  if (target?.kind === 'block' && target.type === 'well') {
    if (held0?.id === 'bucket') { swapHeld('water_bucket'); Sound.rustle(); toast('Načerpal jsi vodu'); } else toast('Na vodu potřebuješ prázdný kbelík');
    return;
  }
  // Elektrická zařízení a kabely: vypínač se přepne, ostatní otevřou přehled sítě (s blokem v ruce se staví dál)
  if (target?.kind === 'block' && BLOCKS[target.type].elec && !(held0 && ITEMS[held0.id].block)) {
    const k = bkey(...target.cell);
    if (target.type === 'power_switch') toggleSwitch(k); else if (target.type === 'computer') openPC(k); else openInventory('power', k);
    return;
  }
  if (target?.kind === 'block' && STATION_UI[target.type]) {
    openInventory(STATION_UI[target.type], bkey(...target.cell));
    if (target.type === 'chest') { Sound.place(); for (const r of structuresNear(target.cell[0], target.cell[2], 14)) ruinsOpened.add(r.key); }
    return;
  }
  if (target?.kind === 'portal') return usePortal(target.shrine);
  // Slepice: sbírání vajec · Kráva: dojení do kbelíku
  if (target?.kind === 'mob') {
    const m = target.mob;
    if (NET.client && (m.type === 'chicken' || (m.type === 'cow' && held0?.id === 'bucket'))) { NET.req(['mu', m.nid]); return; }
    if (m.type === 'chicken') {
      if (m.eggs > 0) { addItem('egg', m.eggs); m.eggs = 0; Sound.pop(); } else toast('Slepice ještě nesnesla vejce');
      return;
    }
    if (m.type === 'cow' && held0?.id === 'bucket') {
      if (m.milkT > 0) { toast('Kráva potřebuje chvíli odpočinout'); return; }
      m.milkT = 40; swapHeld('milk_bucket'); Sound.rustle(); toast('Podojil jsi krávu');
      return;
    }
  }
  const s = heldStack();
  if (!s) return;
  const d = ITEMS[s.id];
  // Motyka: zorá trávu nebo hlínu na pole
  if (s.id === 'hoe') { tillGround(); return; }
  // Sázení semínek (a brambor) na ornou půdu
  if (d.plant && target?.kind === 'block' && target.type === 'farmland') {
    const [x, y, z] = target.cell, k = bkey(x, y + 1, z);
    if (!cellFree(x, y + 1, z)) return;
    blocks.set(k, d.plant);
    crops.set(k, { stage: 0, t: 0, next: 25 + Math.random() * 30 });
    consumeSelected();
    rebuildBlocks();
    Sound.place();
    return;
  }
  if (d.food) {
    startEating(s.id, 'hand');
    return;
  }
  // Půlblok na stejný půlblok = celý blok (dvojitý půlblok)
  if (d.block && BLOCKS[d.block].shape === 'slab' && target?.kind === 'block' && target.type === d.block) {
    const k = bkey(...target.cell), up = (blockMeta.get(k) || 0) & 4;
    if ((target.normal[1] === 1 && !up) || (target.normal[1] === -1 && up)) {
      blocks.set(k, BLOCKS[d.block].full);
      blockMeta.delete(k);
      consumeSelected();
      rebuildBlocks();
      Sound.place();
      return;
    }
  }
  const cell = d.block ? placementCell(target) : null;
  if (cell && cellFree(...cell)) placeBlock(d, cell);
}
// Vymění předmět v ruce za jiný (např. prázdný kbelík -> kbelík vody)
export function swapHeld(id) {
  const s = heldStack();
  if (s.n > 1) { s.n--; addItem(id, 1); }
  else inv.slots[inv.sel] = { id, n: 1 };
  renderHotbar();
}
function tillGround() {
  const t = target;
  if (!t) return;
  let cell = null;
  if (t.kind === 'grass' || (t.kind === 'vox' && t.surface)) {
    cell = [t.cell[0], topY(t.cell[0], t.cell[2]), t.cell[2]];
    if (getVox(...cell) !== V.DIRT && getVox(...cell) !== V.MARKDIRT) { toast('Motykou zorej trávu nebo hlínu'); return; }
    cutGrass(t.cell[0] + 0.5, t.cell[2] + 0.5, 1);
    setVox(...cell, V.AIR); // pole je zapuštěné do země místo hlíny
  }
  else if (t.kind === 'block' && (t.type === 'dirt' || t.type === 'markdirt')) cell = t.cell;
  else if (t.kind === 'vox' && (t.vox === V.DIRT || t.vox === V.MARKDIRT)) { cell = t.cell; setVox(...cell, V.AIR); }
  if (!cell) { toast('Motykou zorej trávu nebo hlínu'); return; }
  if (blocks.has(bkey(...cell)) && blocks.get(bkey(...cell)) !== 'dirt' && blocks.get(bkey(...cell)) !== 'markdirt') return;
  blocks.set(bkey(...cell), 'farmland');
  rebuildBlocks();
  debris.emit(cell[0] + 0.5, cell[1] + 1, cell[2] + 0.5, [0.4, 0.28, 0.18], 14, 2, 1.5);
  Sound.rustle();
}
// Otočení a poloha tvarovaného bloku při položení: schody stoupají směrem od hráče,
// půlblok je nahoře, když míříš na horní polovinu stěny nebo na spodek bloku.
function placeMeta(shape) {
  const rot = ((Math.round(player.yaw / (Math.PI / 2)) % 4) + 4) % 4;
  if (shape !== 'slab') return rot;
  const n = target?.normal, pt = target?.point;
  const up = n && (n[1] === -1 || (n[1] === 0 && pt && pt[1] - Math.floor(pt[1]) > 0.5));
  return up ? 4 : 0;
}
export function placeBlock(d, [x, y, z]) {
  if (BLOCKS[d.block].solid && playerIntersects(x, y, z)) return false;
  // Hlína a kámen vrácené do podzemí se stanou zase přirozenou zeminou (zaplní díru i povrch).
  const NATURAL = { dirt: V.DIRT, markdirt: V.MARKDIRT, cobble: V.STONE };
  if (NATURAL[d.block] && y <= topY(x, z) && getVox(x, y, z) === V.AIR) {
    setVox(x, y, z, NATURAL[d.block]);
  } else {
    const k = bkey(x, y, z), B = BLOCKS[d.block];
    blocks.set(k, d.block);
    if (B.shape || B.facing) blockMeta.set(k, placeMeta(B.shape)); else blockMeta.delete(k);
    placedAny[d.block] = true;
    if (d.block === 'chair') chairRot.set(bkey(x, y, z), Math.round(player.yaw / (Math.PI / 2)) * (Math.PI / 2));
    rebuildBlocks();
  }
  consumeSelected();
  Sound.place();
  return true;
}
// Stavění pod sebe (jako v Minecraftu): dívej se dolů, skákej a drž pravé tlačítko – pod nohama roste sloup.
function pillarPlace() {
  const held = heldStack();
  if (!held || !ITEMS[held.id].block || player.pitch > -0.35 || player.onGround) return;
  const p = player.pos, cell = [Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)];
  if (cellFree(...cell)) placeBlock(ITEMS[held.id], cell);
}
