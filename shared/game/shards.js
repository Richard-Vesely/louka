// ============================================================ sbírání úlomků světla
import { SHARD_CELL } from '../constants.js';
import { shardAt } from '../worldgen.js';
import { addItem } from './inventory.js';

/**
 * Hráč sebere úlomek, když do něj vejde (blíž než 1,9 m).
 * @param {import('./game.js').Game} game
 */
export function pickShards(game, p) {
  const w = game.world;
  const cx0 = Math.floor(p.pos.x / SHARD_CELL), cz0 = Math.floor(p.pos.z / SHARD_CELL);
  for (let cz = cz0 - 1; cz <= cz0 + 1; cz++) {
    for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
      const s = shardAt(cx, cz);
      if (!s || w.removed.has(s.key) || Math.hypot(p.pos.x - s.x, p.pos.z - s.z) >= 1.9) continue;
      w.removed.add(s.key);
      addItem(p, 'shard', 1, game.tell(p));
      game.broadcast({ t: 'removed', key: s.key });
      game.send(p, { t: 'fx', k: 'shard', x: s.x, z: s.z });
      game.send(p, { t: 'toast', text: 'Úlomek světla!' });
    }
  }
}
