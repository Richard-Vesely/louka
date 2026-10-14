// ============================================================ přihlášení, stav spojení, kdo hraje
// Přihlašovací okno (jméno + heslo), hláška při výpadku spojení, zprávy "přišel/odešel"
// v rohu a seznam hráčů na klávesu Tab.
import { NAME_RE } from '@louka/shared/protocol.js';
import { $ } from '../core/dom.js';

const STORE = 'louka-join';

/**
 * Adresa serveru: ?server=… v adrese stránky > VITE_SERVER_URL při sestavení >
 * vývoj (Vite přeposílá /ws na herní server) > stejný server, odkud je stránka > ws://localhost:8787.
 */
export function defaultServerUrl() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
  const h = location.hostname, ws = location.protocol === 'https:' ? 'wss' : 'ws';
  if (location.protocol === 'file:' || !h || h.endsWith('github.io')) return 'ws://localhost:8787';
  if (import.meta.env.DEV || location.port === '4173') return `${ws}://${location.host}/ws`; // vite dev / preview
  return `${ws}://${location.host}`; // hru posílá herní server
}

const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const store = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch {} };

/**
 * Ukáže přihlašovací okno.
 * @param {object} o
 * @param {() => void} o.onSolo hrát sám (offline)
 * @param {(opts:{url:string,name:string,password:string}) => Promise<void>} o.onTogether připojit se k serveru
 */
export function showJoin({ onSolo, onTogether }) {
  const saved = load(), def = defaultServerUrl();
  $('joinName').value = saved.name || '';
  $('joinUrl').value = saved.url || def;
  const msg = (text, bad = false) => { $('joinMsg').textContent = text; $('joinMsg').classList.toggle('bad', bad); };
  $('join').style.display = 'grid';
  $('joinName').focus();

  $('joinSolo').onclick = () => { hideJoin(); onSolo(); };
  $('joinForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('joinName').value.trim().replace(/\s+/g, ' '), password = $('joinPass').value, url = $('joinUrl').value.trim();
    if (!NAME_RE.test(name)) { msg('Jméno musí mít 2–16 znaků: písmena, číslice, mezera, _ nebo -.', true); return; }
    store({ name, url: url !== def ? url : undefined });
    $('joinGo').disabled = true;
    msg('Připojuji…');
    try {
      await onTogether({ url, name, password });
      hideJoin();
    } catch (err) {
      msg(err?.text || 'Nepodařilo se připojit.', true);
    } finally {
      $('joinGo').disabled = false;
    }
  };
}

export function hideJoin() { $('join').style.display = 'none'; }

/** Velká hláška uprostřed (výpadek spojení), nebo prázdný text = schovat. */
export function netStatus(text) {
  $('netStatus').textContent = text;
  $('netStatus').style.display = text ? 'grid' : 'none';
}

/** Zpráva vlevo nahoře (kdo přišel, kdo odešel), zmizí po 6 s. */
export function notice(text) {
  const el = document.createElement('div');
  el.textContent = text;
  $('notices').append(el);
  setTimeout(() => el.remove(), 6000);
}

// Seznam hráčů na Tab: [[id, jméno, ping]].
let list = [];
export function setPlayerList(pl) { list = pl; renderList(); }
function renderList() {
  $('playerList').innerHTML = '<div class="title">Ve hře</div>' + (list.length
    ? list.map(([, name, rtt]) => `<div><span></span><b>${rtt ? rtt + ' ms' : ''}</b></div>`).join('')
    : '<div><span>Hraješ sám</span></div>');
  // Jména vkládáme jako text, ne jako HTML (kdyby někdo zkusil v jméně psát značky).
  $('playerList').querySelectorAll('span').forEach((s, i) => { if (list[i]) s.textContent = list[i][1]; });
}
addEventListener('keydown', (e) => {
  if (e.code !== 'Tab') return;
  e.preventDefault();
  renderList();
  $('playerList').style.display = 'block';
});
addEventListener('keyup', (e) => { if (e.code === 'Tab') $('playerList').style.display = 'none'; });
