// ============================================================ těžba, útok, pokládání
// Levé tlačítko: těžba / kácení / sekání trávy / útok. Pravé: položit blok, jíst, otevřít stůl / táborák.
import * as THREE from 'three';
import { ITEMS, TOOL_SPEED } from '@louka/shared/items.js';
import { BLOCKS, bkey } from '@louka/shared/blocks.js';
import { randInt } from '@louka/shared/math.js';
import { $ } from '../core/dom.js';
import { scene } from '../render/renderer.js';
import { debris } from '../render/particles.js';
import { startSwing } from '../render/held-item.js';
import { Sound } from '../audio/sound.js';
import { removed, blocks, placedAny, fires } from '../world/state.js';
import { rebuildForest } from '../world/forest.js';
import { rebuildBlocks } from '../world/blocks.js';
import { cutGrass } from '../world/grass.js';
import { addItem, consumeSelected, heldStack } from '../inventory/inventory.js';
import { openInventory } from '../inventory/inventory-ui.js';
import { hitMob } from '../mobs/mobs.js';
import { toast } from '../ui/hud.js';
import { player, playerIntersects } from './player.js';
import { input } from './controls.js';
import { pickTarget } from './targeting.js';

const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
outline.visible = false;
scene.add(outline);
// Kroužek na zemi = kam míříš; průhledná kostka = kam se položí blok.
const groundRing = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
groundRing.visible = false;
scene.add(groundRing);
const preview = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
preview.visible = false;
scene.add(preview);

/** target – na co míříš, swingCd / useCd – kolik sekund do dalšího máchnutí / použití. */
export const act = { target: null, swingCd: 0, useCd: 0 };

// Kam se položí blok: vedle bloku, na který míříš, nebo na zem.
function placementCell(t) {
  if (!t) return null;
  if (t.kind === 'block') return t.cell.map((v, i) => v + t.normal[i]);
  if (t.kind === 'ground') { const [x, y, z] = t.point; return [Math.floor(x), Math.floor(y + 0.2), Math.floor(z)]; }
  return null;
}
const mining = { key: null, p: 0 };
const toolOf = (s) => (s && ITEMS[s.id].tool ? ITEMS[s.id] : null);
// Barva třísek podle toho, co těžíš.
const CHIP = { tree: [0.42, 0.3, 0.17], rock: [0.5, 0.5, 0.48], iron: [0.65, 0.35, 0.15], ground: [0.25, 0.5, 0.12], planks: [0.6, 0.45, 0.28], cobble: [0.5, 0.5, 0.48], bricks: [0.55, 0.52, 0.48] };

/** Každý snímek: najde cíl, těží / útočí podle tlačítek a ukáže popisek a kroužek postupu. */
export function updateInteraction(dt) {
  const target = act.target = pickTarget();
  const tool = toolOf(heldStack());
  let warn = '';
  outline.visible = target?.kind === 'block';
  if (outline.visible) outline.position.set(...target.at);
  groundRing.visible = target?.kind === 'ground';
  if (groundRing.visible) {
    groundRing.position.set(target.point[0], target.point[1] + 0.04, target.point[2]);
    groundRing.material.color.set(target.breakable ? 0xffffff : 0x999999);
  }
  const held = heldStack();
  const cell = held && ITEMS[held.id].block ? placementCell(target) : null;
  preview.visible = !!cell && !blocks.has(bkey(...cell));
  if (preview.visible) preview.position.set(cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5);

  act.swingCd -= dt;
  act.useCd -= dt;
  if (input.lmb && target?.kind === 'mob') {
    if (act.swingCd <= 0) { startSwing(); Sound.swing(); act.swingCd = 0.42; hitMob(target.mob, tool ? tool.dmg : 1); }
    mining.key = null;
  } else if (input.lmb && target && target.kind !== 'mob' && target.breakable !== false) {
    if (mining.key !== target.key) { mining.key = target.key; mining.p = 0; }
    const req = target.req;
    if (req && !(tool && tool.tool === req.tool && tool.tier >= req.tier)) {
      warn = req.tier > 1 ? 'Potřebuješ kamenný krumpáč' : 'Potřebuješ krumpáč';
      mining.p = 0;
      if (act.swingCd <= 0) { startSwing(); act.swingCd = 0.4; Sound.mine(); }
    } else {
      const speed = tool && tool.tool === target.tool ? TOOL_SPEED[tool.tier] : 1;
      mining.p += (dt * speed) / target.hard;
      if (act.swingCd <= 0) {
        startSwing();
        act.swingCd = 0.34;
        const chip = CHIP[target.kind === 'rock' && target.rock.iron ? 'iron' : target.kind === 'block' ? target.type : target.kind] || CHIP.rock;
        debris.emit(...target.at, chip, 6, 2.5, 1.5);
        if (target.kind === 'tree' || target.tool === 'axe') Sound.chop();
        else if (target.kind === 'ground') Sound.rustle();
        else Sound.mine();
      }
      if (mining.p >= 1) { breakTarget(target); mining.key = null; mining.p = 0; }
    }
  } else {
    if (input.lmb && act.swingCd <= 0) { startSwing(); Sound.swing(); act.swingCd = 0.42; }
    mining.key = null;
    mining.p = 0;
  }
  if (input.rmb && act.useCd <= 0) { act.useCd = 0.25; useItem(); }

  const label = $('targetLabel');
  label.innerHTML = warn ? `<span class="warn">${warn}</span>` : target ? `${target.name}${target.hint ? `<small>${target.hint}</small>` : ''}` : '';
  const pr = $('progress');
  pr.style.opacity = mining.p > 0 ? 1 : 0;
  pr.style.background = `conic-gradient(rgba(255,255,255,0.9) ${mining.p * 360}deg, rgba(255,255,255,0.15) 0deg)`;
}

// Vytěžený cíl: pokácený strom, rozbitý balvan nebo blok, posekaná tráva.
function breakTarget(t) {
  if (t.kind === 'tree') {
    removed.add(t.key);
    const tr = t.tree;
    addItem('log', (tr.pine ? 4 : 3) + randInt(0, 2));
    if (Math.random() < 0.4) addItem('stick', randInt(1, 3));
    if (!tr.pine && Math.random() < 0.3) addItem('berries', randInt(1, 3));
    debris.emit(tr.x, tr.y + tr.trunkH, tr.z, [0.2, 0.45, 0.12], 60, 5, 2);
    Sound.crack();
    rebuildForest(player.pos.x, player.pos.z, true);
  } else if (t.kind === 'rock') {
    removed.add(t.key);
    const r = t.rock;
    if (r.iron) { addItem('iron_ore', randInt(2, 3)); addItem('stone', 1); }
    else addItem('stone', 2 + Math.floor(r.s * 3));
    debris.emit(r.x, r.y + 0.3, r.z, CHIP[r.iron ? 'iron' : 'rock'], 40, 4, 2);
    Sound.crack();
    rebuildForest(player.pos.x, player.pos.z, true);
  } else if (t.kind === 'block') {
    const k = bkey(...t.cell);
    blocks.delete(k);
    addItem(BLOCKS[t.type].drop, 1);
    if (fires.has(k)) { for (const s of fires.get(k).slots) if (s) addItem(s.id, s.n); fires.delete(k); }
    debris.emit(...t.at, CHIP[t.type] || CHIP.planks, 25, 3, 1.5);
    Sound.crack();
    rebuildBlocks();
  } else if (t.kind === 'ground') {
    addItem('fiber', randInt(1, 2));
    if (Math.random() < 0.15) addItem('berries', 1);
    cutGrass(t.point[0], t.point[2]);
    debris.emit(...t.point, CHIP.ground, 18, 2, 2.5);
  }
}

// Pravé tlačítko.
function useItem() {
  const target = act.target;
  // Pravé tlačítko na pracovní stůl nebo táborák otevře jeho okno.
  if (target?.kind === 'block' && (target.type === 'workbench' || target.type === 'campfire')) {
    openInventory(target.type === 'workbench' ? 'bench' : 'fire', bkey(...target.cell));
    return;
  }
  const s = heldStack();
  if (!s) return;
  const d = ITEMS[s.id];
  if (d.food) {
    if (player.hunger >= 100 && !(d.heal && player.hp < 100)) { toast('Nemáš hlad'); return; }
    player.hunger = Math.min(100, player.hunger + d.food);
    if (d.heal) player.hp = Math.min(100, player.hp + d.heal);
    consumeSelected();
    Sound.eat();
    act.useCd = 0.6;
    return;
  }
  const cell = d.block ? placementCell(target) : null;
  if (!cell) return;
  const k = bkey(...cell);
  if (blocks.has(k)) return;
  if (BLOCKS[d.block].solid && playerIntersects(...cell)) return;
  blocks.set(k, d.block);
  placedAny[d.block] = true;
  consumeSelected();
  rebuildBlocks();
  Sound.place();
}
