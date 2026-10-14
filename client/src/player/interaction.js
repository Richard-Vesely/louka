// ============================================================ těžba, útok, pokládání
// Levé tlačítko: těžba / kácení / sekání trávy / útok. Pravé: položit blok, jíst, otevřít stůl / táborák.
import * as THREE from 'three';
import { ITEMS, TOOL_SPEED } from '@louka/shared/items.js';
import { bkey } from '@louka/shared/blocks.js';
import { $ } from '../core/dom.js';
import { scene } from '../render/renderer.js';
import { debris } from '../render/particles.js';
import { CHIP } from '../render/effects.js';
import { startSwing } from '../render/held-item.js';
import { Sound } from '../audio/sound.js';
import { net } from '../net/net.js';
import { blocks } from '../world/state.js';
import { heldStack } from '../inventory/inventory.js';
import { openInventory } from '../inventory/inventory-ui.js';
import { player } from './state.js';
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
    if (act.swingCd <= 0) { startSwing(); Sound.swing(); act.swingCd = 0.42; player.shake = 0.1; net.act({ t: 'hit', id: target.mob.id }); }
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

// Vytěžený cíl: hra (nebo server) zkontroluje, že to jde, a pošle kořist a efekty.
function breakTarget(t) {
  if (t.kind === 'tree' || t.kind === 'rock') net.act({ t: 'break', kind: t.kind, key: t.key });
  else if (t.kind === 'block') net.act({ t: 'break', kind: 'block', cell: t.cell });
  else if (t.kind === 'ground') net.act({ t: 'break', kind: 'ground', point: t.point });
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
    if (player.hunger < 100 || (d.heal && player.hp < 100)) act.useCd = 0.6;
    net.act({ t: 'eat' });
    return;
  }
  const cell = d.block ? placementCell(target) : null;
  if (cell && !blocks.has(bkey(...cell))) net.act({ t: 'place', cell });
}
