// Hlavní menu: hra pro jednoho, vytvoření serveru (hostitel), připojení ke kódu. Hra (client/src/game/boot.js) čeká na window.bootPromise.
import { Peer } from 'peerjs';

window.Peer = Peer; // knihovna PeerJS je součástí hry (dřív se stahovala zvlášť)
const $m = (id) => document.getElementById(id);
let resolveBoot;
window.bootPromise = new Promise((r) => (resolveBoot = r));
const NAME_KEY = 'rise-jmeno', HOST_KEY = 'rise-server-v1', PEER_PREFIX = 'rise-hra-';
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
$m('mName').value = ls.get(NAME_KEY) || '';
$m('mName').addEventListener('input', () => ls.set(NAME_KEY, $m('mName').value.trim()));
const myName = () => $m('mName').value.trim().slice(0, 16) || 'Hráč';
const pages = ['pgMain', 'pgHost', 'pgJoin', 'pgBusy'];
const show = (id) => pages.forEach((p) => ($m(p).hidden = p !== id));
const msg = (text) => { $m('menuMsg').hidden = !text; $m('menuMsg').textContent = text || ''; };
try { const m = sessionStorage.getItem('rise-menu-msg'); if (m) { msg(m); sessionStorage.removeItem('rise-menu-msg'); } } catch {}
let cancel = null;
const busy = (text, onCancel) => { msg(''); $m('busyText').textContent = text; cancel = onCancel; show('pgBusy'); };
const fail = (text, page = 'pgMain') => { cancel = null; msg(text); show(page); };
$m('mCancel').addEventListener('click', () => { cancel?.(); cancel = null; msg(''); show('pgMain'); });
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { msg(''); show('pgMain'); }));
const finish = (boot) => { const name = myName(); $m('menu').remove(); resolveBoot({ name, ...boot }); };

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => 'LOUKA-' + Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
const normCode = (s) => { s = s.toUpperCase().replace(/\s+/g, ''); return /^[A-Z0-9]{4}$/.test(s) ? 'LOUKA-' + s : s; };
const errText = (e) => ({
  'browser-incompatible': 'Tento prohlížeč nepodporuje přímé spojení (WebRTC). Zkus aktuální Chrome, Edge nebo Firefox.',
  'unavailable-id': 'Kód serveru je právě obsazený. Zkus to znovu.',
  'invalid-id': 'Neplatný kód serveru.',
})[e?.type] || (['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'].includes(e?.type)
  ? 'Nepodařilo se spojit se zprostředkovacím serverem PeerJS. Zkontroluj připojení k internetu, případně to zkus za chvíli znovu.'
  : 'Chyba spojení: ' + (e?.type || e?.message || 'neznámá'));
// PeerJS se načítá na pozadí; počkej na něj nejvýš 10 s.
const needPeer = async () => {
  for (let i = 0; i < 100 && !window.Peer; i++) await new Promise((r) => setTimeout(r, 100));
  if (!window.Peer) fail('Nepodařilo se načíst knihovnu pro hru po síti (PeerJS). Zkontroluj připojení k internetu.');
  return window.Peer;
};

$m('mSolo').addEventListener('click', () => finish({ mode: 'sp' }));
$m('mSettings').addEventListener('click', () => window.RiseSettings.open());
$m('mHost').addEventListener('click', () => { msg(''); show('pgHost'); });
$m('mJoin').addEventListener('click', () => { msg(''); show('pgJoin'); setTimeout(() => $m('mCode').focus(), 0); });
$m('mCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') startJoin(); });

// Hostitel: peer s pevným ID podle kódu; připojení, která přijdou dřív, než hra naběhne, počkají ve frontě.
$m('mHostGo').addEventListener('click', async () => {
  if (!(await needPeer())) return;
  let saved = null;
  try { saved = JSON.parse(ls.get(HOST_KEY)); } catch {}
  let code = saved?.code || newCode(), tries = 0, peer = null, stop = false;
  busy('Spouštím server…', () => { stop = true; peer?.destroy(); });
  const attempt = () => {
    peer = new Peer(PEER_PREFIX + code);
    let opened = false;
    const timer = setTimeout(() => { if (!opened && !stop) { stop = true; peer.destroy(); fail(errText({ type: 'network' })); } }, 15000);
    peer.on('open', () => {
      if (stop) return;
      opened = true;
      clearTimeout(timer);
      const pendingConns = [];
      peer.on('connection', (c) => (window.__netOnConn ? window.__netOnConn(c) : pendingConns.push(c)));
      finish({ mode: 'host', peer, code, settings: { creative: $m('mCreative').checked }, pendingConns });
    });
    peer.on('error', (e) => {
      if (opened) { window.__netOnPeerError?.(e); return; }
      if (stop) return;
      clearTimeout(timer);
      peer.destroy();
      if (e.type === 'unavailable-id' && tries++ < 4) { code = newCode(); attempt(); return; }
      stop = true;
      fail(errText(e));
    });
  };
  attempt();
});

// Klient: připojí se k hostiteli a čeká na uvítání s celým světem.
async function startJoin() {
  const code = normCode($m('mCode').value);
  if (!/^LOUKA-[A-Z0-9]{4}$/.test(code)) { fail('Zadej kód serveru ve tvaru LOUKA-7K2F.', 'pgJoin'); return; }
  if (!(await needPeer())) return;
  const peer = new Peer();
  let done = false;
  const end = (text) => { if (done) return; done = true; clearTimeout(timer); peer.destroy(); fail(text, 'pgJoin'); };
  busy(`Připojuji se k serveru ${code}…`, () => { done = true; clearTimeout(timer); peer.destroy(); });
  const timer = setTimeout(() => end('Spojení se nepodařilo navázat. Tvoje síť nebo síť hostitele nejspíš blokuje přímé spojení mezi počítači (typicky školní či firemní Wi-Fi nebo přísný firewall). Zkus jinou síť, třeba mobilní hotspot.'), 20000);
  peer.on('error', (e) => {
    if (done) { window.__netOnPeerError?.(e); return; }
    end(e.type === 'peer-unavailable' ? `Server s kódem ${code} neexistuje nebo už skončil. Zkontroluj kód.` : errText(e));
  });
  peer.on('open', () => {
    if (done) return;
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true, metadata: { name: myName() } });
    const queue = [];
    conn.on('data', (d) => {
      if (window.__netOnData) { window.__netOnData(d); return; }
      if (done) { queue.push(d); return; }
      if (d?.[0] === 'full') { end('Server je plný (max. 6 hráčů).'); return; }
      if (d?.[0] === 'welcome') { done = true; clearTimeout(timer); finish({ mode: 'client', peer, conn, code, welcome: d[1], queue }); }
    });
    conn.on('close', () => { if (window.__netOnClose) window.__netOnClose(); else end('Hostitel spojení ukončil.'); });
    conn.on('error', () => { if (!window.__netOnClose) end('Spojení s hostitelem selhalo.'); });
  });
}
$m('mJoinGo').addEventListener('click', startJoin);
// Po restartu kvůli nastavení grafiky pokračuje hra pro jednoho rovnou, bez menu.
try { if (sessionStorage.getItem('rise-autostart') === 'sp') { sessionStorage.removeItem('rise-autostart'); finish({ mode: 'sp' }); } } catch {}
