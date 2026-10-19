// Síťová smyčka a spuštění hry pro více hráčů.
import './mp-ui.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { NET, r2 } from '../../../shared/net/net.js';
import { dayCount, dayTime } from '../../../shared/sim/day.js';
import { mobs } from '../../../shared/sim/mobs.js';
import { nearLight } from '../../../shared/world/collision.js';
import { shrineDist } from '../../../shared/world/terrain.js';
import { BOOT, MP } from '../game/boot.js';
import { clock, lastFrameAt, tick } from '../game/loop.js';
import { playerSafe } from '../mobs/mobs.js';
import { pcOpen } from '../pc/computer.js';
import { docOpen } from '../pc/doc-view.js';
import { creative, guideOpen, isLocked, player, setCreative } from '../player/player.js';
import { rebuildBlocks } from '../render/blocks.js';
import { rebuildForest } from '../render/forest.js';
import { $ } from '../ui/dom.js';
import { toast } from '../ui/hud.js';
import { fullSet, invOpen } from '../ui/inventory-ui.js';
import { myPose, updateAvatars } from './avatars.js';
import { chatOpen, hidePause, leaveGame, netBox, renderNetBox, showPause, sysLine } from './mp-ui.js';
import { broadcast, hostAccept, kvDiff, onHostMsg, others, sendTo, toHost } from './multiplayer.js';

// ---------- hlavní smyčka sítě (volá ji tick)
function netUpdate(dt) {
  if (NET.dirtyBlocks) { NET.dirtyBlocks = false; rebuildBlocks(); }
  if (NET.dirtyForest) { NET.dirtyForest = false; rebuildForest(player.pos.x, player.pos.z, true); }
  if (NET.ops.length) {
    const ops = NET.ops;
    NET.ops = [];
    if (NET.host) broadcast(['ops', ops]); else toHost(['ops', creative ? 1 : 0, ops]);
  }
  if ((NET.poseT -= dt) <= 0) {
    NET.poseT = 1 / 12;
    if (NET.host) { if (others.size) broadcast(['pl', [['host', NET.name, myPose(), 1], ...[...others.values()].map((P) => [P.pid, P.name, P.pose, P.perm ? 1 : 0])]]); }
    else toHost(['pose', myPose()]);
  }
  if (NET.host && (NET.mobT -= dt) <= 0) {
    NET.mobT = 0.2;
    if (others.size) broadcast(['mobs', dayTime, dayCount, mobs.map((m) => [m.nid, m.type, r2(m.pos.x), r2(m.pos.y), r2(m.pos.z), r2(m.ry), Math.round(m.hp), r2(m.flash), m.dead ? 1 : 0, m.eggs || 0, m.milkT > 0 ? 1 : 0])]);
  }
  if ((NET.kvT -= dt) <= 0) {
    NET.kvT = NET.host ? 0.5 : 0.2;
    const ch = kvDiff();
    if (ch.length) {
      if (NET.host) broadcast(['kv', ch]);
      else { toHost(['kv', ch]); const until = performance.now() + 1500; for (const [m, k] of ch) NET.pend.set(m + '|' + k, until); }
    }
  }
  updateAvatars(dt);
  if ((NET.boxT -= dt) <= 0) { NET.boxT = 0.5; renderNetBox(); }
}

if (MP) {
  Object.assign(NET, {
    update: netUpdate,
    sendTo,
    give: (pid, id, n) => sendTo(pid, ['give', id, n]),
    req: (msg) => toHost(msg),
    targets() {
      const list = [{ pos: player.pos, alive: player.alive, creative, set: fullSet(), safe: playerSafe(), pid: null }];
      for (const P of others.values()) {
        const q = P.pose;
        if (!q || !P.conn) continue;
        const pos = (P.tpos ||= new THREE.Vector3()).set(q.x, q.y, q.z);
        list.push({ pos, alive: q.alive, creative: !!q.cr, set: q.set, safe: shrineDist(q.x, q.z) < 11 || nearLight(q.x, q.z, 5), pid: P.pid });
      }
      return list;
    },
    spawnCenter() { const l = this.targets().filter((t) => t.alive); return (l[Math.floor(Math.random() * l.length)] || l[0] || { pos: player.pos }).pos; },
    nearestDist(x, y, z) { return Math.min(...this.targets().map((t) => Math.hypot(x - t.pos.x, y - t.pos.y, z - t.pos.z))); },
    hostSave: () => ({ code: NET.code }),
  });
  kvDiff(); // výchozí stav malých map (posílají se jen další změny)
  NET.ready = true;
  netBox.style.display = 'flex';
  document.body.classList.add('mp');
  $('newWorld').style.display = 'none';
  $('hint').textContent += ' · T chat · Esc menu a hráči';
  document.addEventListener('pointerlockchange', () => {
    if (isLocked()) { hidePause(); return; }
    if (!invOpen && !guideOpen && !chatOpen && !pcOpen && !docOpen && !NET.leaving) showPause();
  });
  window.__netOnPeerError = (e) => { if (NET.client && !BOOT.conn?.open) leaveGame('Spojení s hostitelem se přerušilo.'); else console.warn('PeerJS:', e?.type); };
  if (NET.host) {
    window.__netOnConn = hostAccept;
    for (const c of BOOT.pendingConns || []) hostAccept(c);
    toast(`Server běží · kód ${NET.code}`);
    sysLine(`Server spuštěn. Kód pro kamarády: ${NET.code}`);
  } else {
    window.__netOnData = (d) => { try { onHostMsg(d); } catch (e) { console.error(e); } };
    window.__netOnClose = () => { if (!NET.leaving) leaveGame(NET.kicked ? 'Hostitel tě vyhodil ze hry.' : 'Hostitel ukončil hru.'); };
    for (const d of BOOT.queue || []) window.__netOnData(d);
    if (!NET.perm && creative) setCreative(false);
    sysLine(`Připojeno k serveru ${NET.code}`);
  }
  // Záložka na pozadí: prohlížeč zastaví snímky (requestAnimationFrame), svět (hlavně u hostitele) ale musí běžet dál.
  setInterval(() => {
    if (performance.now() - lastFrameAt < 300) return;
    let left = Math.min(clock.getDelta(), 1);
    while (left > 0) { tick(Math.min(left, 0.1)); left -= 0.1; }
  }, 100);
  addEventListener('pagehide', () => { try { for (const P of others.values()) P.conn?.close(); BOOT.peer?.destroy(); } catch {} });
}
