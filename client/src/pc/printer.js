// Tiskárna v prohlížeči: nový dokument, tisk z počítače, okno tiskárny (fronta a tisk: shared/sim/power.js).
import './tanks.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { NET } from '../../../shared/net/net.js';
import { dayCount } from '../../../shared/sim/day.js';
import { PRINT_TIME, elecOf, queuePrint } from '../../../shared/sim/power.js';
import { papers } from '../../../shared/world/state.js';
import { slotHTML } from '../ui/inventory-ui.js';

// ============================================================ dokumenty: textový editor, tiskárna, papíry ve světě, čtení a předání
// pcDisks: uložené dokumenty každého počítače (klíč bloku -> { docs: [{ id, name, text, day }] }).
// Tiskárna (power[k]): slots[0] papír, slots[1..3] vytištěné listy, q = fronta úloh { p: id papíru, n: kopií, done }.
// paperSpots: papíry položené na zemi a na stole, pověšené na zdi, rámečky (id -> { d: id papíru | null, x, y, z, ry, w: na zdi, fr: rámeček }).
export const DISK_MAX = 30, DOC_TEXT_MAX = 4000;
export const escH = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const kvPend = (m, k) => { if (NET.client) NET.pend.set(m + '|' + k, performance.now() + 1500); }; // vlastní změnu hostitel hned nepřepíše
export function newPaper(title, text) {
  const id = NET.uid();
  papers.set(id, { title: String(title).slice(0, 40), text: String(text).slice(0, DOC_TEXT_MAX), by: NET.name || 'Hráč', day: dayCount });
  return id;
}

// ---------- tiskárna (fronta a tisk: shared/sim/power.js)
export function printJob(k, p, n) {
  if (NET.client) { NET.req(['print', k, p, n]); return true; }
  return queuePrint(k, p, n);
}
export function printerDev(st) {
  const job = st.q?.[0], title = job && (papers.get(job.p)?.title || '…'), out = st.slots.slice(1).filter(Boolean).length;
  const red = (s) => `<span style="color:#ff8a7a">${s}</span>`;
  const status = !job ? 'Čeká na tisk. Dokument pošli z textového editoru v počítači, který je ve stejné elektrické síti.'
    : st.slots[0]?.id !== 'paper' ? red('Došel papír – vlož papír do levého políčka.')
    : out >= 3 ? red('Zásobník je plný – vyber vytištěné listy.')
    : st.pw ? `Tiskne „${escH(title)}“ – kopie ${job.done + 1} / ${job.n}` : red('Málo energie – stojí.');
  const queue = (st.q || []).map((j, i) => `<div>${i + 1}. ${escH(papers.get(j.p)?.title || '…')} · ${j.done}/${j.n}</div>`).join('');
  return `<div class="fire-ui">${slotHTML(st.slots[0], 0, '', 'power')}<div class="parrow" style="width:90px"><i style="width:${job && st.pw ? ((st.t || 0) / PRINT_TIME) * 100 : 0}%"></i></div>
    ${[1, 2, 3].map((i) => slotHTML(st.slots[i], i, 'out', 'power')).join('')}</div>
    <div class="mc-note">${status}</div>${queue ? `<div class="mc-note">Fronta tisku:${queue}</div>` : ''}<div class="mc-note">Jeden list = 1 papír a ${PRINT_TIME} s. Příkon ${elecOf('printer').use} W jen při tisku.</div>`;
}
export function buildPrinterModel(g) {
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.55, ...o });
  const box = (w, h, d, m, x, y, z) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); g.add(me); return me; };
  const body = M({ color: 0xe0dcd4 }), dark = M({ color: 0x3a3a42 });
  box(0.7, 0.3, 0.5, body, 0, 0.15, -0.02);
  box(0.6, 0.02, 0.02, dark, 0, 0.2, 0.235); // výstupní štěrbina
  box(0.5, 0.02, 0.2, body, 0, 0.06, 0.32); // zásobník
  const tray = box(0.42, 0.14, 0.02, body, 0, 0.36, -0.2); // podavač papíru vzadu
  tray.rotation.x = -0.4;
  box(0.36, 0.11, 0.005, M({ color: 0xfbf8ee }), 0, 0.37, -0.19).rotation.x = -0.4;
  g.userData.led = box(0.04, 0.03, 0.01, M({ color: 0x222222, emissive: 0x3aff5a, emissiveIntensity: 0 }), 0.28, 0.25, 0.231).material;
  const sheet = box(0.36, 0.005, 0.24, M({ color: 0xfbf8ee }), 0, 0.075, 0.3);
  sheet.visible = false;
  g.userData.sheet = sheet;
}
