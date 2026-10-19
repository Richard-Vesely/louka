// Hlavní menu: jméno, hra pro jednoho, světy serveru kroužku (tlačítko pro každý svět ze seznamu GET /worlds),
// Nastavení a Další možnosti (server na svém počítači přes PeerJS, připojení kódem). Hra (client/src/game/boot.js) čeká na window.bootPromise.
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
const pages = ['pgMain', 'pgMore', 'pgHost', 'pgJoin', 'pgPass', 'pgBusy'];
const show = (id) => pages.forEach((p) => ($m(p).hidden = p !== id));
const msg = (text) => { $m('menuMsg').hidden = !text; $m('menuMsg').textContent = text || ''; };
try { const m = sessionStorage.getItem('rise-menu-msg'); if (m) { msg(m); sessionStorage.removeItem('rise-menu-msg'); } } catch {}
let cancel = null, cancelPage = 'pgMain';
const busy = (text, onCancel, back = 'pgMain') => { msg(''); $m('busyText').textContent = text; cancel = onCancel; cancelPage = back; show('pgBusy'); };
const fail = (text, page = 'pgMain') => { cancel = null; msg(text); show(page); };
$m('mCancel').addEventListener('click', () => { cancel?.(); cancel = null; msg(''); show(cancelPage); });
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { msg(''); show(b.dataset.back || 'pgMain'); }));
const finish = (boot) => { const name = myName(); clearInterval(refresh); $m('menu').remove(); resolveBoot({ name, ...boot }); };

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
  if (!window.Peer) fail('Nepodařilo se načíst knihovnu pro hru po síti (PeerJS). Zkontroluj připojení k internetu.', 'pgMore');
  return window.Peer;
};

$m('mSolo').addEventListener('click', () => finish({ mode: 'sp' }));
$m('mSettings').addEventListener('click', () => window.RiseSettings.open());
$m('mMore').addEventListener('click', () => { msg(''); show('pgMore'); });
$m('mHost').addEventListener('click', () => { msg(''); show('pgHost'); });
$m('mJoin').addEventListener('click', () => { msg(''); show('pgJoin'); setTimeout(() => $m('mCode').focus(), 0); });
$m('mCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') startJoin(); });

// ---------- Další možnosti: server na svém počítači (PeerJS). Hostitel: peer s pevným ID podle kódu;
// připojení, která přijdou dřív, než hra naběhne, počkají ve frontě.
$m('mHostGo').addEventListener('click', async () => {
  if (!(await needPeer())) return;
  let saved = null;
  try { saved = JSON.parse(ls.get(HOST_KEY)); } catch {}
  let code = saved?.code || newCode(), tries = 0, peer = null, stop = false;
  busy('Spouštím server…', () => { stop = true; peer?.destroy(); }, 'pgHost');
  const attempt = () => {
    peer = new Peer(PEER_PREFIX + code);
    let opened = false;
    const timer = setTimeout(() => { if (!opened && !stop) { stop = true; peer.destroy(); fail(errText({ type: 'network' }), 'pgHost'); } }, 15000);
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
      fail(errText(e), 'pgHost');
    });
  };
  attempt();
});

// Připojit se kódem: připojí se k serveru kamaráda (kód = PeerJS) a čeká na uvítání s celým světem.
async function startJoin() {
  const code = normCode($m('mCode').value.trim());
  if (!/^LOUKA-[A-Z0-9]{4}$/.test(code)) { fail('Zadej kód serveru ve tvaru LOUKA-7K2F (stačí ty 4 znaky na konci).', 'pgJoin'); return; }
  if (!(await needPeer())) return;
  const peer = new Peer();
  let done = false;
  const end = (text) => { if (done) return; done = true; clearTimeout(timer); peer.destroy(); fail(text, 'pgJoin'); };
  busy(`Připojuji se k serveru ${code}…`, () => { done = true; clearTimeout(timer); peer.destroy(); }, 'pgJoin');
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

// ---------- server kroužku (Node.js, npm start): každý svět je tlačítko v hlavním menu
// Adresa: odkaz s ?server=adresa, hra načtená přímo ze serveru (značka <meta name="louka-server">, server/static.js),
// nebo adresa serveru kroužku při sestavení (VITE_SERVER_URL). Bez adresy se tlačítka světů neukážou.
const PASS_KEY = 'rise-heslo'; // { ws adresa serveru: heslo kroužku } (zadává se jen jednou)
const WORLD_KEY = 'rise-server-svet'; // { ws adresa serveru: id naposledy vybraného světa }
const readMap = (k) => { try { return JSON.parse(ls.get(k)) || {}; } catch { return {}; } };
const remember = (k, url, v) => { const m = readMap(k); if (v == null) delete m[url]; else m[url] = v; ls.set(k, JSON.stringify(m)); };
// "hry.example.cz" -> wss://hry.example.cz/ws (holá doména běží za HTTPS), "192.168.1.5:8787" -> ws://192.168.1.5:8787/ws
function wsUrl(s) {
  s = s.trim().replace(/\/+$/, '');
  if (!/^[a-z]+:\/\//i.test(s)) {
    const host = s.split('/')[0];
    const plain = /:\d+$/.test(host) || /^localhost$/i.test(host) || /^[\d.]+$/.test(host) || host.startsWith('[');
    s = (location.protocol === 'https:' || !plain ? 'wss://' : 'ws://') + s;
  }
  const u = new URL(s.replace(/^http/i, 'ws'));
  if (u.pathname === '/' || u.pathname === '') u.pathname = '/ws';
  return u.href;
}
// ws://host/ws -> http://host/worlds (seznam světů bez hesla; server posílá Access-Control-Allow-Origin: *)
const worldsUrl = (url) => { const u = new URL(url.replace(/^ws/i, 'http')); u.pathname = u.pathname.replace(/\/?ws$/, '') + '/worlds'; return u.href; };
const params = new URLSearchParams(location.search);
let club = null; // { url: ws adresa, needPass: true = server určitě chce heslo }
{
  const here = document.querySelector('meta[name="louka-server"]');
  let addr = params.get('server'), needPass = false;
  if (!addr && here) {
    let info = {};
    try { info = JSON.parse(here.content); } catch {}
    addr = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + location.pathname.replace(/[^/]*$/, '') + 'ws';
    needPass = !!info.password;
  }
  addr ||= import.meta.env.VITE_SERVER_URL || '';
  try { if (addr) club = { url: wsUrl(addr), needPass }; } catch {}
}

const box = $m('mWorlds');
let worlds = []; // poslední seznam ze serveru
const line = (text, cls) => { const b = document.createElement('button'); b.className = `mc-btn big world-btn ${cls}`; b.disabled = true; b.textContent = text; return b; };
function renderWorlds(list, first = false) {
  if (!Array.isArray(list) || !list.length) { worlds = []; box.replaceChildren(line('Server kroužku je nedostupný', 'world-off')); return; }
  worlds = list;
  const pick = params.get('world') || readMap(WORLD_KEY)[club.url]; // odkaz s ?world=id, jinak naposledy vybraný svět
  const focused = box.contains(document.activeElement) ? document.activeElement.dataset.world : null;
  box.replaceChildren(...list.map((w) => {
    const b = document.createElement('button');
    const full = w.players >= w.max;
    b.className = 'mc-btn big world-btn' + (w.id === pick ? ' on' : '');
    b.dataset.world = w.id;
    b.disabled = full;
    const name = document.createElement('span');
    name.textContent = w.name;
    const tags = document.createElement('small');
    tags.textContent = `${w.creative ? 'kreativní · ' : ''}${full ? 'plný' : `${w.players}/${w.max} hráčů`}`;
    b.append(name, tags);
    b.addEventListener('click', () => joinWorld(w.id));
    return b;
  }));
  const again = focused && box.querySelector(`[data-world="${CSS.escape(focused)}"]:not([disabled])`);
  if (again) again.focus();
  else if (first && params.get('world') && !$m('pgMain').hidden) box.querySelector('.on:not([disabled])')?.focus();
}
async function loadWorlds(first = false) {
  let list = null;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(worldsUrl(club.url), { cache: 'no-store', signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) list = await r.json();
  } catch {}
  if ($m('menu')) renderWorlds(list, first);
}
let refresh = null;
if (club) {
  box.hidden = false;
  box.replaceChildren(line('Načítám světy kroužku…', 'world-wait'));
  loadWorlds(true);
  // počty hráčů se obnovují, dokud je vidět hlavní stránka menu
  refresh = setInterval(() => { if (!$m('pgMain').hidden) loadWorlds(); }, 15000);
}

// Klik na svět: heslo kroužku z paměti prohlížeče, jinak se zeptá (jednou; správné heslo si zapamatuje).
let passWorld = null;
function askPass(world, text = '') {
  passWorld = world;
  $m('mPass').value = '';
  fail(text, 'pgPass');
  setTimeout(() => $m('mPass').focus(), 0);
}
function joinWorld(world, typed) {
  const pass = typed ?? readMap(PASS_KEY)[club.url] ?? '';
  if (!pass && club.needPass) { askPass(world); return; }
  remember(WORLD_KEY, club.url, world);
  joinServer(pass, world);
}
const passGo = () => { const p = $m('mPass').value; if (!p) { msg('Napiš heslo kroužku.'); $m('mPass').focus(); return; } joinWorld(passWorld, p); };
$m('mPassGo').addEventListener('click', passGo);
$m('mPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') passGo(); });

// Připojení přes WebSocket rovnou do vybraného světa: ['hello', { name, pass, v: 2, world }].
function joinServer(pass, world) {
  const url = club.url;
  let ws;
  try { ws = new WebSocket(url); } catch { fail('Neplatná adresa serveru kroužku.'); return; }
  let done = false;
  const stop = () => { done = true; clearTimeout(timer); ws.onclose = null; try { ws.close(); } catch {} };
  const end = (text, page) => { if (done) return; stop(); fail(text, page); };
  const name = worlds.find((w) => w.id === world)?.name;
  busy(name ? `Připojuji se do světa ${name}…` : 'Připojuji se k serveru kroužku…', stop);
  const timer = setTimeout(() => end('Server kroužku neodpovídá. Zkus to za chvíli znovu.'), 15000);
  // Spojení se stejnými funkcemi jako spojení PeerJS (hra ho používá stejně).
  const conn = { get open() { return ws.readyState === 1; }, send(m) { if (ws.readyState === 1) ws.send(JSON.stringify(m)); }, on() {}, close() { ws.close(); } };
  const queue = [];
  ws.onopen = () => ws.send(JSON.stringify(['hello', { name: myName(), pass, v: 2, world }]));
  ws.onerror = () => end('Nepodařilo se spojit se serverem kroužku. Zkus to za chvíli znovu.');
  ws.onclose = () => { if (window.__netOnClose) window.__netOnClose(); else end('Server kroužku spojení ukončil.'); };
  ws.onmessage = (e) => {
    let d;
    try { d = JSON.parse(e.data); } catch { return; }
    if (window.__netOnData) { window.__netOnData(d); return; }
    if (done) { queue.push(d); return; }
    if (d?.[0] === 'denied') { // špatné (nebo zapomenuté) heslo: zapomenout a zeptat se znovu
      stop();
      remember(PASS_KEY, url, null);
      club.needPass = true;
      askPass(world, pass ? 'Špatné heslo. Zkus to znovu.' : '');
      return;
    }
    if (d?.[0] === 'full') { end('Tenhle svět je plný. Zkus jiný.'); return; }
    if (d?.[0] === 'worlds' && Array.isArray(d[1])) { stop(); renderWorlds(d[1]); fail('Tenhle svět na serveru už není. Vyber jiný.'); return; }
    if (d?.[0] === 'welcome') {
      done = true; clearTimeout(timer);
      if (pass) remember(PASS_KEY, url, pass);
      if (d[1]?.worldInfo?.id) remember(WORLD_KEY, url, d[1].worldInfo.id);
      finish({ mode: 'client', peer: null, conn, code: url, welcome: d[1], queue });
    }
  };
}
// Po restartu kvůli nastavení grafiky pokračuje hra pro jednoho rovnou, bez menu.
try { if (sessionStorage.getItem('rise-autostart') === 'sp') { sessionStorage.removeItem('rise-autostart'); finish({ mode: 'sp' }); } } catch {}
