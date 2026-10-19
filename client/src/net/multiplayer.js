// Hra pro více hráčů: hostitel a klient (zprávy, změny světa, tvorové).
import '../game/loop.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { Sound } from '../audio/sound.js';
import { BOOT, NET, isBusy, uiBusy } from '../game/boot.js';
import { worldState } from '../game/save.js';
import { furnaces } from '../machines/furnace.js';
import { crops, stoves } from '../machines/kitchen.js';
import { markPowerDirty, power } from '../machines/power.js';
import { MOBS, hitMob, mobs, removeMob, spawnMob } from '../mobs/mobs.js';
import { chatLine, leaveGame, renderPause, sysLine } from './mp-ui.js';
import { receiveGift } from '../pc/papers-world.js';
import { paperSpots, pcDisks, queuePrint } from '../pc/printer.js';
import { chairRot, refreshSpecial, tableItems } from '../player/eating.js';
import { swapHeld } from '../player/interaction.js';
import { addItem, countItem, heldStack, removeItem } from '../player/inventory.js';
import { creative, player, setCreative } from '../player/player.js';
import { damagePlayer } from '../player/survival.js';
import { specials } from '../render/blocks.js';
import { setDay } from '../render/daylight.js';
import { cutGrass } from '../render/grass.js';
import { scene } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { chests, fires, invOpen, renderInventory, ui } from '../ui/inventory-ui.js';
import { vehicles } from '../vehicles/car.js';
import { setVox } from '../world/dig.js';
import { groundItems, spawnGroundItem } from '../world/ground-items.js';
import { papers } from '../world/papers.js';
import { setPortalActive } from '../world/shrine.js';
import { BUILDERS, buildStructure, ruinsBuilt, ruinsOpened, spawners } from '../world/structures.js';
import { blockMeta, blocks, removed } from '../world/world-state.js';
import { ITEMS } from '../../../shared/data/index.js';
import { clamp, wrapAngle } from '../../../shared/util.js';
import { getVox } from '../../../shared/world/voxels.js';

// ============================================================ hra pro více hráčů (PeerJS, hostitel = server)
// Hostitel drží svět: klienti mu posílají změny (bloky, stromy, podzemí…), on je provede a rozešle ostatním.
// Tvory simuluje jen hostitel. Malé mapy (táboráky, truhly, sporáky, pole…) se porovnávají a posílají změněné klíče.
export const MAX_PLAYERS = 6;
const KV_MAPS = { fires, stoves, crops, tableItems, chairRot, chests, spawners, furnaces, power, vehicles, papers, pcDisks, paperSpots };
export const others = new Map(); // ostatní hráči: pid -> { pid, name, pose, perm, conn?, avatar? }
const puppets = new Map(); // klient: tvorové podle hostitele (nid -> tvor)
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
Object.assign(NET, { code: BOOT.code, pid: NET.host ? 'host' : BOOT.welcome?.pid, allowAll: !!BOOT.settings?.creative, kvLast: {}, pend: new Map(), poseT: 0, mobT: 0, kvT: 0, boxT: 0 });

// ---------- zprávy
export function sendTo(pid, msg) { const c = others.get(pid)?.conn; if (c?.open) c.send(msg); }
export function broadcast(msg, except) { for (const [pid, P] of others) if (pid !== except && P.conn?.open) P.conn.send(msg); }
export function toHost(msg) { if (BOOT.conn?.open) BOOT.conn.send(msg); }

// Přehraje cizí změnu světa (bez dalšího rozesílání).
function applyOp(o) {
  NET.quiet(() => {
    switch (o[0]) {
      case 'm': {
        const [, name, k, v] = o;
        if (name === 'blockMeta') { if (v === null) blockMeta.delete(k); else blockMeta.set(k, v); NET.dirtyBlocks = true; return; }
        if (name !== 'blocks') return;
        const sp = specials.get(k);
        if (sp && blocks.get(k) !== v) { scene.remove(sp.obj); specials.delete(k); }
        if (v === null) { blocks.delete(k); if (player.sitting === k) player.sitting = null; } else blocks.set(k, v);
        NET.dirtyBlocks = true;
        break;
      }
      case 's': ({ removed, ruinsOpened })[o[1]]?.add(o[2]); if (o[1] === 'removed') NET.dirtyForest = true; break;
      case 'r': if (o[1]?.key && !ruinsBuilt.has(o[1].key) && BUILDERS[o[1].type]) buildStructure(o[1]); break;
      case 'v': setVox(o[1], o[2], o[3], o[4]); break;
      case 'c': cutGrass(o[1], o[2], o[3]); break;
      case 'p': setPortalActive(true); break;
      case 'g': if (ITEMS[o[2]] && !groundItems.some((g) => g.gid === o[1])) spawnGroundItem(o[2], o[3], new THREE.Vector3(...o[4]), new THREE.Vector3(...o[5]), o[6], o[1]); break;
      case 'gx': { const it = groundItems.find((g) => g.gid === o[1]); if (it) { it.n = o[2]; it.req = 0; } break; }
    }
  });
}
// Malé mapy: změněné klíče od posledního odeslání
export function kvDiff() {
  const ch = [];
  for (const [m, map] of Object.entries(KV_MAPS)) {
    const L = (NET.kvLast[m] ||= new Map());
    const once = m === 'papers'; // vytištěné papíry se nemění: stačí poslat nové
    for (const [k, v] of map) { if (once && L.has(k)) continue; const j = JSON.stringify(v); if (L.get(k) !== j) { L.set(k, j); ch.push([m, k, v]); } }
    for (const k of [...L.keys()]) if (!map.has(k)) { L.delete(k); ch.push([m, k, null]); }
  }
  return ch;
}
function applyKV(m, k, v) {
  const map = KV_MAPS[m];
  if (!map) return;
  const old = map.get(k);
  if (v === null) map.delete(k); else map.set(k, v);
  const visual = m === 'crops' ? old?.stage !== v?.stage : (m === 'tableItems' || m === 'chairRot') && JSON.stringify(old) !== JSON.stringify(v);
  if (visual && blocks.has(k)) refreshSpecial(k);
  if (m === 'power') markPowerDirty(); // vypínač mohl změnit tvar sítě
  if (invOpen && ui.fireKey === k) renderInventory();
}

// ---------- hostitel
export function hostAccept(conn) {
  const setup = () => {
    if (others.size >= MAX_PLAYERS - 1) { conn.send(['full']); setTimeout(() => conn.close(), 500); return; }
    let name = String(conn.metadata?.name || 'Hráč').slice(0, 16), n = 2;
    const base = name;
    while (name === NET.name || [...others.values()].some((P) => P.name === name)) name = `${base} ${n++}`;
    const P = { pid: conn.peer, name, conn, pose: null, perm: NET.allowAll };
    others.set(P.pid, P);
    conn.on('data', (d) => { try { onClientMsg(P, d); } catch (e) { console.error(e); } });
    conn.on('close', () => dropPlayer(P.pid));
    conn.on('error', () => dropPlayer(P.pid));
    conn.send(['welcome', { pid: P.pid, name, perm: P.perm, world: worldState(), spawn: [player.pos.x + 1.5, player.pos.y + 0.5, player.pos.z + 1.5] }]);
    broadcast(['join', name], P.pid);
    sysLine(`${name} se připojil`);
    renderPause();
  };
  if (conn.open) setup(); else conn.on('open', setup);
}
function dropPlayer(pid) {
  const P = others.get(pid);
  if (!P) return;
  for (const v of vehicles.values()) if (v.driver === pid) { v.driver = null; v.spd = 0; v.engine = false; } // auto odcházejícího hráče zůstane stát
  others.delete(pid);
  if (P.avatar) scene.remove(P.avatar.group);
  if (NET.host) broadcast(['leave', P.name]);
  sysLine(`${P.name} odešel`);
  renderPause();
}
function onClientMsg(P, msg) {
  if (!Array.isArray(msg)) return;
  switch (msg[0]) {
    case 'ops': {
      const [, cr, ops] = msg;
      if (cr && !P.perm) { // kreativní změny od hráče bez povolení hostitel ignoruje a vrátí mu skutečný stav
        const fix = ops.filter((o) => (o[0] === 'm' && o[1] === 'blocks') || o[0] === 'v')
          .map((o) => (o[0] === 'm' ? ['m', 'blocks', o[2], blocks.get(o[2]) ?? null] : ['v', o[1], o[2], o[3], getVox(o[1], o[2], o[3])]));
        if (fix.length) sendTo(P.pid, ['ops', fix]);
        sendTo(P.pid, ['perm', false]);
        return;
      }
      for (const o of ops) if (o[0] !== 'gx') applyOp(o);
      broadcast(['ops', ops.filter((o) => o[0] !== 'gx')], P.pid);
      break;
    }
    case 'kv': for (const [m, k, v] of msg[1]) applyKV(m, k, v); break;
    case 'pose': {
      const q = msg[1];
      if (!P.pose) renderPause();
      P.pose = q;
      if (typeof q.ui === 'string') {
        if (!isBusy(q.ui)) NET.kvT = 0; // hráč právě otevřel truhlu / stroj: hned mu poslat aktuální stav
        uiBusy.set(q.ui, performance.now() + 1200);
      }
      // létání nebo kreativní režim bez povolení: hostitel ho hráči znovu vypne
      if (!P.perm && (q.cr || (q.fly && !q.flyT)) && (P.permNag = (P.permNag || 0) - 1) < 0) { P.permNag = 12; sendTo(P.pid, ['perm', false]); }
      break;
    }
    case 'pk': { // žádost o sebrání předmětu ze země
      const it = groundItems.find((g) => g.gid === msg[1]);
      if (!it || it.n <= 0) return;
      sendTo(P.pid, ['give', it.id, it.n]);
      it.n = 0;
      NET.op(['gx', it.gid, 0]);
      break;
    }
    case 'hit': {
      const m = mobs.find((x) => x.nid === msg[1] && !x.dead);
      if (!m) return;
      NET.killer = P.pid;
      try { hitMob(m, clamp(Number(msg[2]) || 1, 0, 20), Number(msg[3]) || 0); } finally { NET.killer = null; }
      break;
    }
    case 'mu': { // slepice (vejce) a kráva (mléko)
      const m = mobs.find((x) => x.nid === msg[1] && !x.dead);
      if (!m) return;
      if (m.type === 'chicken') { if (m.eggs > 0) { sendTo(P.pid, ['give', 'egg', m.eggs]); m.eggs = 0; } else sendTo(P.pid, ['toast', 'Slepice ještě nesnesla vejce']); }
      else if (m.type === 'cow') { if (m.milkT > 0) sendTo(P.pid, ['toast', 'Kráva potřebuje chvíli odpočinout']); else { m.milkT = 40; sendTo(P.pid, ['swap', 'bucket', 'milk_bucket']); } }
      break;
    }
    case 'print': queuePrint(String(msg[1]), msg[2], Number(msg[3])); break; // tisk z počítače hráče
    case 'giveTo': { // hráč předává dokument jinému hráči
      const id = String(msg[2]);
      if (!id.startsWith('doc_')) return;
      if (msg[1] === 'host') receiveGift(id, P.name); else if (others.has(msg[1])) sendTo(msg[1], ['gift', id, P.name]);
      break;
    }
    case 'chat': { const text = String(msg[1] || '').slice(0, 200).trim(); if (!text) return; chatLine(P.name, text); broadcast(['chat', P.name, text], P.pid); break; }
  }
}
export function setPerm(P, on) {
  P.perm = on;
  sendTo(P.pid, ['perm', on]);
  renderPause();
}
export function kick(pid) {
  const P = others.get(pid);
  if (!P) return;
  sendTo(pid, ['kick']);
  setTimeout(() => P.conn.close(), 300);
  dropPlayer(pid);
}

// ---------- klient
export function onHostMsg(msg) {
  if (!Array.isArray(msg)) return;
  switch (msg[0]) {
    case 'ops': for (const o of msg[1]) applyOp(o); break;
    case 'kv': {
      const now = performance.now();
      for (const [m, k, v] of msg[1]) {
        if ((NET.pend.get(m + '|' + k) || 0) > now) continue; // tady jsi právě něco změnil sám
        applyKV(m, k, v);
        const L = (NET.kvLast[m] ||= new Map());
        if (v === null) L.delete(k); else L.set(k, JSON.stringify(v));
      }
      break;
    }
    case 'pl': {
      const seen = new Set();
      for (const [pid, name, pose, perm] of msg[1]) {
        if (pid === NET.pid) continue;
        seen.add(pid);
        let P = others.get(pid);
        if (!P) { others.set(pid, (P = { pid, name })); renderPause(); }
        P.name = name; P.pose = pose; P.perm = perm;
      }
      for (const pid of [...others.keys()]) if (!seen.has(pid)) { const P = others.get(pid); if (P.avatar) scene.remove(P.avatar.group); others.delete(pid); renderPause(); }
      break;
    }
    case 'gift': receiveGift(String(msg[1]), String(msg[2] || 'Hráč')); break;
    case 'mobs': setDay(msg[1], msg[2]); syncPuppets(msg[3]); break;
    case 'give': { const left = addItem(msg[1], msg[2]); if (left > 0) spawnGroundItem(msg[1], left, player.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(), 3); else Sound.pop(); break; }
    case 'swap': {
      if (heldStack()?.id === msg[1]) swapHeld(msg[2]); else if (countItem(msg[1])) { removeItem(msg[1], 1); addItem(msg[2], 1, true); }
      Sound.rustle(); toast('Podojil jsi krávu');
      break;
    }
    case 'dmg': damagePlayer(msg[1], msg[2], msg[3]); break;
    case 'perm': {
      const was = NET.perm;
      NET.perm = !!msg[1];
      if (!NET.perm && (creative || player.flying)) { setCreative(false); toast('Hostitel ti vypnul kreativní režim'); }
      else if (NET.perm && !was) toast('Hostitel ti povolil kreativní režim (klávesa C)');
      renderPause();
      break;
    }
    case 'toast': toast(msg[1]); break;
    case 'chat': chatLine(msg[1], msg[2]); break;
    case 'join': sysLine(`${msg[1]} se připojil`); break;
    case 'leave': sysLine(`${msg[1]} odešel`); break;
    case 'kick': NET.kicked = true; leaveGame('Hostitel tě vyhodil ze hry.'); break;
  }
}
// Tvorové na klientovi: loutky, které plynule následují pozice od hostitele.
function syncPuppets(list) {
  const seen = new Set();
  for (const [nid, type, x, y, z, ry, hp, fl, dead, eggs, milk] of list) {
    if (!MOBS[type]) continue;
    seen.add(nid);
    let m = puppets.get(nid);
    if (!m) {
      spawnMob(type, x, z, y);
      m = mobs[mobs.length - 1];
      Object.assign(m, { nid, tgt: new THREE.Vector3(x, y, z), ry });
      m.pos.set(x, y, z);
      puppets.set(nid, m);
    }
    m.tgt.set(x, y, z);
    m.ry = ry; m.hp = hp; m.eggs = eggs; m.milkT = milk ? 1 : 0;
    m.flash = Math.max(m.flash, fl);
    if (dead && !m.dead) { m.dead = true; m.deathT = 0; }
  }
  for (const [nid, m] of puppets) if (!seen.has(nid) && !m.dead) { removeMob(m); puppets.delete(nid); }
}
export function updatePuppets(dt) {
  for (const [nid, m] of puppets) {
    if (m.dead) {
      m.deathT += dt;
      m.group.scale.setScalar(Math.max(0.01, 1 - m.deathT * 2.5));
      m.group.rotation.z += dt * 6;
      if (m.deathT > 0.4) { removeMob(m); puppets.delete(nid); }
      continue;
    }
    const ox = m.pos.x, oz = m.pos.z;
    if (m.pos.distanceTo(m.tgt) > 8) m.pos.copy(m.tgt); else m.pos.lerp(m.tgt, 1 - Math.exp(-dt * 10));
    const sp = dt > 0 ? Math.hypot(m.pos.x - ox, m.pos.z - oz) / dt : 0;
    m.phase += dt * (sp * 2.2 + (m.type === 'crawler' ? 2 : 0));
    let hop = 0;
    if (m.type === 'crawler') {
      hop = Math.abs(Math.sin(m.phase)) * (sp > 2 ? 0.5 : 0.18);
      const squash = 1 + Math.cos(m.phase * 2) * 0.12;
      m.body.scale.set(1 / Math.sqrt(squash), 0.8 * squash, 1.15 / Math.sqrt(squash));
    } else if (m.arms.length) {
      const swing = Math.sin(m.phase * (m.type === 'golem' ? 1.1 : 1.6)) * Math.min(sp / 2, 1) * 0.8;
      m.legs[0].rotation.x = swing; m.legs[1].rotation.x = -swing;
      m.arms[0].rotation.x = -swing * 0.8; m.arms[1].rotation.x = swing * 0.6;
    } else {
      const swing = Math.sin(m.phase * 2.2) * Math.min(sp / 2, 1) * 0.7;
      m.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? 1 : -1) * swing));
    }
    m.group.position.set(m.pos.x, m.pos.y + hop, m.pos.z);
    m.group.rotation.y += wrapAngle(m.ry - m.group.rotation.y) * Math.min(1, dt * 10);
    m.shadow.position.set(m.pos.x, m.pos.y + 0.03, m.pos.z);
    m.flash = Math.max(0, m.flash - dt * 5);
    for (const mat of m.mats) if (!mat.userData.glow) mat.emissive.setRGB(m.flash * 1.5, m.flash * 1.5, m.flash * 1.5);
  }
}
