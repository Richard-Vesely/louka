// Helpers for the server tests: start the real server (node server/index.js) in a child process, WebSocket players.
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

export const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
export function startServer(env) {
  const child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: '0', STATIC_DIR: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  return new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('server did not start: ' + out)), 15000);
    child.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/http:\/\/localhost:(\d+)\//);
      if (m) { clearTimeout(t); ok({ child, port: Number(m[1]), out: () => out }); }
    });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => { clearTimeout(t); fail(new Error(`server exited (${code}): ${out}`)); });
  });
}
export const stop = (s) => new Promise((ok) => { if (s.child.exitCode !== null) return ok(); s.child.on('exit', ok); s.child.kill(); });
/** A player over WebSocket. `hello` is merged into ['hello', { name, pass, pin: '1234', … }] (e.g. { v: 2, world: 'kreativ' }; { pin: undefined, token } = log in with a token). */
export function player(port, name, pass, hello = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const p = { ws, msgs: [], welcome: null };
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); p.msgs.push(m); if (m[0] === 'welcome') p.welcome = m[1]; });
  p.ready = new Promise((ok) => ws.on('open', () => { ws.send(JSON.stringify(['hello', { name, pass, pin: '1234', ...hello }])); ok(); }));
  p.send = (m) => ws.send(JSON.stringify(m));
  p.waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = p.msgs.find(fn); if (m) return m; await sleep(30); } return null; };
  p.close = () => new Promise((ok) => { if (ws.readyState === WebSocket.CLOSED) return ok(); ws.on('close', ok); ws.close(); });
  return p;
}
export const pose = (x, z) => ({ x, y: 0.45, z, yaw: 0, pitch: 0, held: null, ui: null, mv: 0, sw: 0, eat: 0, veh: null, hn: 0, ar: [null, null, null, null], sit: 0, fly: 0, flyT: 0, alive: true, cr: 0, set: null, hp: 100 });
