// ============================================================ táboráky pečou (i se zavřeným oknem)
import { ITEMS } from '../items.js';
import { COOKING, COOK_TIME } from '../cooking.js';

/**
 * Upeče / přetaví jeden kus každé COOK_TIME sekund.
 * @param {import('./game.js').Game} game
 */
export function updateFires(game, dt) {
  const w = game.world;
  for (const [k, f] of w.fires) {
    if (!w.blocks.has(k)) continue;
    const [inp, out] = f.slots;
    const res = inp && COOKING[inp.id];
    if (!res || (out && (out.id !== res || out.n >= ITEMS[res].stack))) { f.t = 0; continue; }
    f.t += dt;
    if (f.t < COOK_TIME) continue;
    f.t = 0;
    if (!--inp.n) f.slots[0] = null;
    if (out) out.n++; else f.slots[1] = { id: res, n: 1 };
    // Za upečené maso dostane radu splněnou ten, kdo ho do ohně dal (nebo všichni, když to nevíme).
    for (const p of game.players.values()) if (!f.by || f.by === p.name) p.crafted[res] = true;
    game.broadcast({ t: 'fire', k, f });
    game.broadcast({ t: 'fx', k: 'cook', key: k });
  }
}
