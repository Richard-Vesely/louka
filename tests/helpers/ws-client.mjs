// A tiny game client for tests and bots: connects, collects every message, can wait for one.
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from '@louka/shared/protocol.js';

export class TestClient {
  constructor(url) {
    this.url = url;
    this.msgs = [];
    this.waiters = [];
    this.bytesIn = 0;
    this.bytesOut = 0;
    this.n = 0;
  }

  /** Connect and say hello. Resolves with the welcome (or error) message. */
  async join(name, password = '') {
    this.ws = new WebSocket(this.url);
    this.ws.on('message', (data) => {
      this.bytesIn += data.length;
      for (const m of JSON.parse(data)) {
        m.at = Date.now();
        this.msgs.push(m);
        for (const w of [...this.waiters]) if (w.fn(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.ok(m); }
      }
    });
    this.closed = new Promise((ok) => this.ws.on('close', ok));
    await new Promise((ok, fail) => { this.ws.on('open', ok); this.ws.on('error', fail); });
    this.send({ t: 'hello', name, password, v: PROTOCOL_VERSION });
    return this.wait((m) => m.t === 'welcome' || m.t === 'error');
  }

  send(...msgs) {
    for (const m of msgs) if (m.t !== 'hello' && m.t !== 'ping' && m.t !== 'move') m.n = ++this.n;
    const s = JSON.stringify(msgs);
    this.bytesOut += s.length;
    this.ws.send(s);
  }

  /** Wait for the first (already received or future) message matching `fn`. */
  wait(fn, timeout = 3000, since = 0) {
    const old = this.msgs.slice(since).find(fn);
    if (old) return Promise.resolve(old);
    return new Promise((ok, fail) => {
      const w = { fn, ok };
      this.waiters.push(w);
      setTimeout(() => { if (this.waiters.includes(w)) { this.waiters.splice(this.waiters.indexOf(w), 1); fail(new Error('timeout waiting for message')); } }, timeout);
    });
  }

  close() { this.ws.close(); return this.closed; }
}
