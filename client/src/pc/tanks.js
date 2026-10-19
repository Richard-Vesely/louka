// Hra Tanky 2D v počítači.
import './computer.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { Sound } from '../audio/sound.js';
import { TOUCH } from '../game/prefs.js';
import { powerOf } from '../machines/power.js';
import { pc, pcSet } from './computer.js';
import { clamp } from '../../../shared/util.js';

// ============================================================ Tanky 2D
// Bludiště 20 × 12 polí (ocel se nedá zničit, cihly vydrží 2 zásahy), dva tanky se 3 životy, střely se jednou odrazí od oceli.
// Kolo končí zničením tanku, zápas vyhrává, kdo má první 5 bodů. Režim proti počítači (3 obtížnosti) nebo 2 hráči na jedné klávesnici.
const TK = { W: 20, H: 12, C: 32, R: 12, SPEED: 95, ROT: 2.8, TROT: 3, CD: 0.75, BSPD: 290, HP: 3, WIN: 5 };
const TK_DIFF = {
  easy: { name: 'Snadná', err: 0.22, cd: 1.7, trot: 0.55, lead: 0, keep: 260 },
  normal: { name: 'Normální', err: 0.1, cd: 1.15, trot: 0.85, lead: 0.6, keep: 220 },
  hard: { name: 'Těžká', err: 0.035, cd: 0.85, trot: 1.15, lead: 1, keep: 180 },
};
const TK_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Comma', 'Period', 'Enter', 'KeyR']);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function tanksInit(win) {
  win.body.innerHTML = `<div class="tk">
    <div class="tk-top"><div class="tk-score"></div>
      <div class="tk-btns"><button data-tk="ai">1 hráč</button><button data-tk="pvp">2 hráči</button>
      <select data-tk="diff">${Object.entries(TK_DIFF).map(([id, d]) => `<option value="${id}"${id === 'normal' ? ' selected' : ''}>${d.name}</option>`).join('')}</select>
      <button data-tk="restart">↻ Restart</button></div></div>
    <div class="tk-view"><canvas width="${TK.W * TK.C}" height="${TK.H * TK.C}"></canvas><div class="tk-msg" hidden></div>
      <div class="tk-pad">${[['KeyW', '▲'], ['KeyA', '◀'], ['KeyS', '▼'], ['KeyD', '▶']].map(([c, t]) => `<button data-key="${c}">${t}</button>`).join('')}</div>
      <div class="tk-pad r">${[['KeyQ', '↺'], ['KeyE', '↻'], ['Space', '💥']].map(([c, t]) => `<button data-key="${c}">${t}</button>`).join('')}</div></div>
    <div class="tk-help"></div></div>`;
  const root = win.body.firstChild, cv = root.querySelector('canvas'), g = cv.getContext('2d');
  const msgEl = root.querySelector('.tk-msg'), scoreEl = root.querySelector('.tk-score'), helpEl = root.querySelector('.tk-help');
  const keysT = new Set();
  const C = TK.C, W = TK.W, H = TK.H;
  let G = null, mode = 'ai', diff = 'normal';
  const idx = (x, y) => y * W + x;
  const solid = (cx, cy) => cx < 0 || cy < 0 || cx >= W || cy >= H || G.map[idx(cx, cy)] > 0;
  const cellOf = (t) => [Math.floor(t.x / C), Math.floor(t.y / C)];
  const SPAWN = [[2, 9], [W - 3, H - 10]];

  // Bludiště je souměrné podle středu (oba hráči mají stejné podmínky) a vždy průjezdné
  function bfs(m, from, to, through = (v) => v === 0) {
    const prev = new Int16Array(W * H).fill(-1), q = [idx(...from)];
    prev[q[0]] = q[0];
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      if (c === idx(...to)) {
        const path = [];
        for (let p = c; ; p = prev[p]) { path.unshift([p % W, Math.floor(p / W)]); if (p === prev[p]) break; }
        return path;
      }
      const cx = c % W, cy = Math.floor(c / W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, n = idx(nx, ny);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev[n] >= 0 || !through(m[n])) continue;
        prev[n] = c;
        q.push(n);
      }
    }
    return null;
  }
  function genMap() {
    for (let tries = 0; tries < 60; tries++) {
      const m = new Array(W * H).fill(0);
      const set = (x, y, v) => { m[idx(x, y)] = v; m[idx(W - 1 - x, H - 1 - y)] = v; };
      for (let x = 0; x < W; x++) set(x, 0, 9);
      for (let y = 0; y < H; y++) set(0, y, 9);
      const n = 9 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        const x = 1 + Math.floor(Math.random() * (W - 2)), y = 1 + Math.floor(Math.random() * (H - 2));
        const hor = Math.random() < 0.5, len = 1 + Math.floor(Math.random() * 3), v = Math.random() < 0.35 ? 9 : 2;
        for (let j = 0; j < len; j++) { const xx = x + (hor ? j : 0), yy = y + (hor ? 0 : j); if (xx >= W - 1 || yy >= H - 1) break; set(xx, yy, v); }
      }
      for (let y = 7; y <= 10; y++) for (let x = 1; x <= 4; x++) set(x, y, 0); // volné místo u startu
      if (bfs(m, SPAWN[0], SPAWN[1])) return m;
    }
    const m = new Array(W * H).fill(0);
    for (let x = 0; x < W; x++) { m[idx(x, 0)] = m[idx(x, H - 1)] = 9; }
    for (let y = 0; y < H; y++) { m[idx(0, y)] = m[idx(W - 1, y)] = 9; }
    return m;
  }
  const tank = (i) => ({ x: (SPAWN[i][0] + 0.5) * C, y: (SPAWN[i][1] + 0.5) * C, a: i ? Math.PI : 0, ta: i ? Math.PI : 0, hp: TK.HP, cd: 0.5, alive: true, vx: 0, vy: 0, i });
  function newRound() {
    G.map = genMap();
    G.tanks = [tank(0), tank(1)];
    G.shots = [];
    G.roundT = 0;
    msgEl.hidden = true;
  }
  function newMatch(m = mode) {
    mode = m;
    G = { score: [0, 0], parts: [], shake: 0, over: false, mouse: null, mouseDown: false };
    newRound();
    renderHud();
  }
  const names = () => (mode === 'ai' ? ['Ty', 'Počítač'] : ['Hráč 1', 'Hráč 2']);
  function renderHud() {
    const [a, b] = names();
    scoreEl.innerHTML = `<b class="p1">${a}</b> ${G.score[0]} : ${G.score[1]} <b class="p2">${b}</b> <span class="pc-dim">· do ${TK.WIN} bodů</span>`;
    root.querySelectorAll('[data-tk="ai"],[data-tk="pvp"]').forEach((b2) => b2.classList.toggle('on', b2.dataset.tk === mode));
    root.querySelector('[data-tk="diff"]').style.display = mode === 'ai' ? '' : 'none';
    helpEl.textContent = mode === 'ai'
      ? 'W S jízda · A D otáčení · Q E nebo myš věž · Mezerník / klik střelba · R restart'
      : 'Hráč 1: W S A D, věž Q E, střelba Mezerník · Hráč 2: šipky, věž , a . , střelba Enter · R restart';
  }
  function message(html, btn) {
    msgEl.innerHTML = html + (btn ? `<br><button data-tk="restart">${btn}</button>` : '');
    msgEl.hidden = false;
  }

  // ---------- pohyb a střelba
  function free(x, y, t) {
    const r = TK.R;
    for (let cy = Math.floor((y - r) / C); cy <= Math.floor((y + r) / C); cy++)
      for (let cx = Math.floor((x - r) / C); cx <= Math.floor((x + r) / C); cx++) {
        if (!solid(cx, cy)) continue;
        const px = clamp(x, cx * C, cx * C + C), py = clamp(y, cy * C, cy * C + C);
        if ((px - x) ** 2 + (py - y) ** 2 < r * r) return false;
      }
    for (const o of G.tanks) if (o !== t && o.alive && (o.x - x) ** 2 + (o.y - y) ** 2 < (2 * r) ** 2) return false;
    return true;
  }
  function moveTank(t, fwd, rot, dt) {
    t.a += rot * TK.ROT * dt;
    const sp = fwd * TK.SPEED * (fwd < 0 ? 0.6 : 1) * dt, ox = t.x, oy = t.y;
    const nx = t.x + Math.cos(t.a) * sp, ny = t.y + Math.sin(t.a) * sp;
    if (free(nx, t.y, t)) t.x = nx;
    if (free(t.x, ny, t)) t.y = ny;
    t.vx = (t.x - ox) / dt;
    t.vy = (t.y - oy) / dt;
  }
  function fire(t, mul = 1) {
    t.cd = TK.CD * mul;
    const ca = Math.cos(t.ta), sa = Math.sin(t.ta);
    G.shots.push({ x: t.x + ca * 18, y: t.y + sa * 18, vx: ca * TK.BSPD, vy: sa * TK.BSPD, life: 2.2, age: 0, bounce: 1, owner: t });
    burst(t.x + ca * 20, t.y + sa * 20, '#ffd27a', 5, 60, 0.15);
    Sound.burst({ dur: 0.12, f0: 900, f1: 120, q: 0.8, vol: 0.25, type: 'lowpass' });
  }
  function burst(x, y, col, n, spd, life, r = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = spd * (0.3 + Math.random());
      G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), max: life, col, r });
    }
  }
  function hitTank(t) {
    t.hp--;
    G.shake = 0.15;
    burst(t.x, t.y, '#ffb04a', 10, 90, 0.35);
    if (t.hp > 0) { Sound.hit(); return; }
    t.alive = false;
    G.shake = 0.5;
    burst(t.x, t.y, '#ff7a2a', 34, 160, 0.8, 4);
    burst(t.x, t.y, '#5a5a5a', 20, 70, 1.2, 5);
    Sound.crack();
    const win = 1 - t.i;
    G.score[win]++;
    G.roundT = 2.2;
    renderHud();
    const [a, b] = names(), who = win ? b : a;
    message(G.tanks.every((o) => !o.alive) ? 'Oba tanky zničeny – <b>remíza</b>, bod pro oba' : `Bod pro: <b>${who}</b>`);
  }
  function stepShots(dt) {
    for (let i = G.shots.length - 1; i >= 0; i--) {
      const b = G.shots[i];
      b.age += dt;
      let dead = (b.life -= dt) <= 0;
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt, cx = Math.floor(nx / C), cy = Math.floor(ny / C);
      if (!dead && solid(cx, cy)) {
        const v = cx >= 0 && cy >= 0 && cx < W && cy < H ? G.map[idx(cx, cy)] : 9;
        if (v !== 9) { // cihla: praskne, po druhém zásahu zmizí
          G.map[idx(cx, cy)] = v - 1;
          burst(nx, ny, '#b8603a', v === 1 ? 16 : 6, 80, 0.5);
          Sound.burst({ dur: 0.15, f0: 1200, f1: 200, q: 0.8, vol: 0.2, type: 'lowpass' });
          dead = true;
        } else if (b.bounce-- > 0) { // ocel: jeden odraz
          const ox = Math.floor(b.x / C), oy = Math.floor(b.y / C), hx = solid(cx, oy), hy = solid(ox, cy);
          if (hx) b.vx = -b.vx;
          if (hy) b.vy = -b.vy;
          if (!hx && !hy) { b.vx = -b.vx; b.vy = -b.vy; }
          Sound.tone(1400, 0.04, 0.05, 'square');
          continue;
        } else { burst(b.x, b.y, '#d8d8d8', 5, 50, 0.25); dead = true; }
      }
      if (!dead) {
        b.x = nx;
        b.y = ny;
        for (const t of G.tanks) if (t.alive && (t !== b.owner || b.age > 0.25) && (t.x - b.x) ** 2 + (t.y - b.y) ** 2 < (TK.R + 2) ** 2) { hitTank(t); dead = true; break; }
      }
      if (dead) G.shots.splice(i, 1);
    }
  }
  // Je mezi dvěma body volný výhled (bez zdí)?
  function los(x0, y0, x1, y1) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
    for (let i = 1; i < n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n; if (solid(Math.floor(x / C), Math.floor(y / C))) return false; }
    return true;
  }
  // ---------- počítačový protivník: hledá cestu bludištěm (cihly prostřelí), z dálky míří s předstihem
  function ai(t, foe, dt) {
    const D = TK_DIFF[diff], A = (t.ai ||= { path: null, pathT: 0, stuckT: 0, lx: t.x, ly: t.y, back: 0, err: 0, errT: 0 });
    if ((A.pathT -= dt) <= 0) { A.pathT = 0.5; A.path = bfs(G.map, cellOf(t), cellOf(foe), (v) => v !== 9); }
    const see = foe.alive && los(t.x, t.y, foe.x, foe.y), d = Math.hypot(foe.x - t.x, foe.y - t.y);
    let fwd = 0, rot = 0, aim = null, shoot = false, goal = null;
    if (A.path && A.path.length > 1) {
      const [nx, ny] = A.path[1];
      goal = [(nx + 0.5) * C, (ny + 0.5) * C];
      if (G.map[idx(nx, ny)]) { aim = goal; shoot = true; goal = null; } // cihla v cestě: prostřelit
    }
    if (see && d < D.keep) goal = null; // nepřítel na dostřel: zastavit a střílet
    if (goal) {
      const da = angDiff(Math.atan2(goal[1] - t.y, goal[0] - t.x), t.a);
      rot = clamp(da * 3, -1, 1);
      fwd = Math.abs(da) < 0.6 ? 1 : 0;
    }
    if (A.back > 0) { A.back -= dt; fwd = -1; rot = 0.7; }
    if ((A.stuckT += dt) > 1.2) {
      if (fwd > 0 && Math.hypot(t.x - A.lx, t.y - A.ly) < 8) A.back = 0.5; // zasekl se: kousek couvnout
      A.stuckT = 0; A.lx = t.x; A.ly = t.y;
    }
    moveTank(t, fwd, rot, dt);
    if (see) { const tt = (d / TK.BSPD) * D.lead; aim = [foe.x + foe.vx * tt, foe.y + foe.vy * tt]; shoot = true; }
    if ((A.errT -= dt) <= 0) { A.errT = 0.6; A.err = (Math.random() * 2 - 1) * D.err; }
    const want = aim ? Math.atan2(aim[1] - t.y, aim[0] - t.x) + (see ? A.err : 0) : t.a, da = angDiff(want, t.ta), lim = TK.TROT * D.trot * dt;
    t.ta += clamp(da, -lim, lim);
    if (shoot && Math.abs(da) < 0.07 && t.cd <= 0) fire(t, D.cd);
  }
  function human(t, [up, down, left, right, tl, tr, shot], dt, mouse) {
    const k = (c) => keysT.has(c);
    moveTank(t, (k(up) ? 1 : 0) - (k(down) ? 1 : 0), (k(right) ? 1 : 0) - (k(left) ? 1 : 0), dt);
    const turn = (k(tr) ? 1 : 0) - (k(tl) ? 1 : 0);
    if (turn) G.mouse = null;
    if (mouse && G.mouse) { const da = angDiff(Math.atan2(G.mouse[1] - t.y, G.mouse[0] - t.x), t.ta), lim = TK.TROT * 1.4 * dt; t.ta += clamp(da, -lim, lim); }
    else t.ta += turn * TK.TROT * dt;
    if ((k(shot) || (mouse && G.mouseDown)) && t.cd <= 0) fire(t);
  }
  function step(dt) {
    if (!G || dt <= 0) return;
    const [P1, P2] = G.tanks;
    if (!G.over) {
      for (const t of G.tanks) t.cd -= dt;
      if (P1.alive) human(P1, ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'Space'], dt, true);
      if (P2.alive) {
        if (mode === 'ai') { if (P1.alive) ai(P2, P1, dt); }
        else human(P2, ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Comma', 'Period', 'Enter'], dt, false);
      }
      stepShots(dt);
      if (G.roundT > 0 && (G.roundT -= dt) <= 0) {
        const [s0, s1] = G.score;
        if (Math.max(s0, s1) >= TK.WIN) {
          const w = s0 === s1 ? -1 : s0 > s1 ? 0 : 1; // -1 = remíza (oba tanky padly v posledním kole)
          G.over = true;
          if (mode === 'ai' && w >= 0) { const tk = [...(powerOf(pc.k).tk || [0, 0])]; tk[w]++; pcSet(pc.k, { tk }); } // výsledek si počítač pamatuje
          const [a, b] = names();
          message(`<b>${w < 0 ? 'Remíza' : mode === 'ai' ? (w ? 'Počítač vyhrál zápas' : 'Vyhrál jsi zápas!') : `${w ? b : a} vyhrál zápas!`}</b><br>${G.score[0]} : ${G.score[1]}`, 'Hrát znovu');
        } else newRound();
      }
    }
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const p = G.parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92;
      if ((p.life -= dt) <= 0) G.parts.splice(i, 1);
    }
    G.shake = Math.max(0, G.shake - dt);
    draw();
  }

  // ---------- kreslení
  function draw() {
    g.save();
    if (G.shake > 0) g.translate((Math.random() - 0.5) * G.shake * 16, (Math.random() - 0.5) * G.shake * 16);
    g.fillStyle = '#cbb68a';
    g.fillRect(-10, -10, W * C + 20, H * C + 20);
    g.fillStyle = 'rgba(120,96,60,0.16)';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x + y) % 2) g.fillRect(x * C, y * C, C, C);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = G.map[idx(x, y)], px = x * C, py = y * C;
      if (v === 9) {
        g.fillStyle = '#5e666f'; g.fillRect(px, py, C, C);
        g.fillStyle = '#87909a'; g.fillRect(px + 3, py + 3, C - 6, C - 6);
        g.fillStyle = '#4a5058'; for (const [a, b] of [[6, 6], [C - 9, 6], [6, C - 9], [C - 9, C - 9]]) g.fillRect(px + a, py + b, 3, 3);
      } else if (v > 0) {
        g.fillStyle = '#a8553a'; g.fillRect(px, py, C, C);
        g.fillStyle = '#d8c8a8';
        for (let r = 1; r < 4; r++) g.fillRect(px, py + r * 8, C, 1.5);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) g.fillRect(px + ((c * 16 + (r % 2) * 8) % C), py + r * 8, 1.5, 8);
        if (v === 1) { g.strokeStyle = '#2a1a12'; g.lineWidth = 2; g.beginPath(); g.moveTo(px + 6, py + 4); g.lineTo(px + 15, py + 15); g.lineTo(px + 11, py + 24); g.moveTo(px + 15, py + 15); g.lineTo(px + 27, py + 19); g.stroke(); }
      }
    }
    for (const t of G.tanks) drawTank(t);
    g.fillStyle = '#1a1a1a';
    for (const b of G.shots) { g.beginPath(); g.arc(b.x, b.y, 3.2, 0, Math.PI * 2); g.fill(); }
    for (const p of G.parts) { g.globalAlpha = clamp(p.life / p.max, 0, 1); g.fillStyle = p.col; g.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r); }
    g.globalAlpha = 1;
    g.restore();
  }
  function drawTank(t) {
    const col = t.i ? ['#b8463a', '#7a2a22', '#d8685a'] : ['#4a8a3a', '#2a5a22', '#6aaa5a'];
    if (!t.alive) { // vrak
      g.save(); g.translate(t.x, t.y); g.rotate(t.a);
      g.fillStyle = '#2a2622'; g.fillRect(-13, -11, 26, 22);
      g.restore();
      return;
    }
    g.save(); g.translate(t.x, t.y); g.rotate(t.a);
    g.fillStyle = '#26262a'; g.fillRect(-14, -13, 28, 6); g.fillRect(-14, 7, 28, 6);
    g.fillStyle = '#4a4a50'; for (let i = -12; i < 14; i += 5) { g.fillRect(i, -13, 2, 6); g.fillRect(i, 7, 2, 6); }
    g.fillStyle = col[0]; g.fillRect(-12, -8, 24, 16);
    g.fillStyle = col[1]; g.fillRect(9, -8, 3, 16);
    g.restore();
    g.save(); g.translate(t.x, t.y); g.rotate(t.ta);
    g.fillStyle = col[1]; g.fillRect(0, -2.5, 21, 5);
    g.fillStyle = col[2]; g.beginPath(); g.arc(0, 0, 7, 0, Math.PI * 2); g.fill();
    g.restore();
    for (let i = 0; i < TK.HP; i++) { g.fillStyle = i < t.hp ? '#3ad84a' : '#5a2a2a'; g.fillRect(t.x - 11 + i * 8, t.y - 24, 6, 3); }
  }

  // ---------- ovládání: klávesy (z okna počítače), myš na plátně, dotyková tlačítka
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tk]');
    if (!b || b.tagName === 'SELECT') return;
    if (b.dataset.tk === 'ai' || b.dataset.tk === 'pvp') newMatch(b.dataset.tk);
    else if (b.dataset.tk === 'restart') newMatch();
    b.blur();
  });
  root.querySelector('select').addEventListener('change', (e) => { diff = e.target.value; e.target.blur(); newMatch(); });
  const toCanvas = (e) => {
    const r = cv.getBoundingClientRect(), s = Math.min(r.width / cv.width, r.height / cv.height);
    return [(e.clientX - r.left - (r.width - cv.width * s) / 2) / s, (e.clientY - r.top - (r.height - cv.height * s) / 2) / s];
  };
  if (!TOUCH) {
    cv.addEventListener('mousemove', (e) => { G.mouse = toCanvas(e); });
    cv.addEventListener('mousedown', (e) => { if (e.button === 0) { G.mouse = toCanvas(e); G.mouseDown = true; } });
    addEventListener('mouseup', () => { if (G) G.mouseDown = false; });
  }
  for (const b of root.querySelectorAll('[data-key]')) {
    const c = b.dataset.key;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); keysT.add(c); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => keysT.delete(c));
  }
  root.classList.toggle('touch', TOUCH);
  win.game = {
    keys: keysT,
    get state() { return G; }, // pro ladění v konzoli
    step,
    key(code, down) {
      if (!TK_KEYS.has(code)) return false;
      if (code === 'KeyR') { if (down) newMatch(); return true; }
      if (down) keysT.add(code); else keysT.delete(code);
      return true;
    },
  };
  newMatch('ai');
  draw();
}
