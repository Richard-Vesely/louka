// Předměty ležící na zemi (vyhozené klávesou G): letí, dopadnou, točí se a po 5 minutách zmizí.
// Sebrat je může kdokoli: ve hře pro jednoho a u hostitele rovnou, připojený hráč o sebrání požádá hostitele ('pk').
import { ITEMS } from '../data/index.js';
import { NET, r2 } from '../net/net.js';
import { Vec3 } from '../vec3.js';
import { solidAny, voxFloor } from '../world/collision.js';
import { groundHeight } from '../world/voxels.js';

export const groundItems = []; // { gid, id, n, pos, vel, age, delay, spin, req, w? }
// w = opotřebení nástroje (shared/tools.js); posílá se jen u opotřebovaných kusů jako 8. prvek operace 'g'.
export function spawnGroundItem(id, n, pos, vel, delay = 0.6, gid = NET.uid(), w = 0) {
  const op = ['g', gid, id, n, [pos.x, pos.y, pos.z].map(r2), [vel.x, vel.y, vel.z].map(r2), delay];
  if (w > 0) op.push(w);
  NET.op(op);
  groundItems.push({ gid, id, n, pos: new Vec3(pos.x, pos.y, pos.z), vel: new Vec3(vel.x, vel.y, vel.z), age: 0, delay, spin: Math.random() * 6, req: 0, ...(w > 0 ? { w } : {}) });
}
// Podlaha pod předmětem: povrch terénu nebo horní stěna bloku
function itemFloor(x, y, z) {
  const g = groundHeight(x, z);
  const vf = voxFloor(x, y, z);
  return isFinite(g) && y >= g - 0.6 ? Math.max(g, vf) : vf;
}
// Stejné předměty ležící u sebe se slijí do jedné hromádky (jako v Minecraftu: do 0,5 × 0,25 × 0,5 bloku).
// Rozhoduje jen ten, kdo drží svět (hra pro jednoho, hostitel, server); ostatní dostanou změnu jako 'gx'.
export function mergeGroundItems() {
  for (let i = 0; i < groundItems.length; i++) {
    const a = groundItems[i];
    if (a.n <= 0 || a.vel.y !== 0) continue;
    const max = ITEMS[a.id]?.stack || 64;
    for (let j = i + 1; j < groundItems.length && a.n < max; j++) {
      const b = groundItems[j];
      if (b.n <= 0 || b.id !== a.id || b.vel.y !== 0) continue;
      if (Math.abs(a.pos.x - b.pos.x) > 0.5 || Math.abs(a.pos.z - b.pos.z) > 0.5 || Math.abs(a.pos.y - b.pos.y) > 0.25) continue;
      const k = Math.min(max - a.n, b.n);
      a.n += k; b.n -= k;
      a.age = Math.min(a.age, b.age); // sloučená hromádka zmizí podle mladšího kusu
      NET.op(['gx', a.gid, a.n]);
      NET.op(['gx', b.gid, b.n]);
    }
  }
}
let mergeT = 0;
// pickup(it) = hráč u této obrazovky zkusí předmět sebrat (prohlížeč); server ho nepředává.
export function updateGroundItems(dt, pickup) {
  if (!NET.client && (mergeT -= dt) <= 0) { mergeT = 0.5; mergeGroundItems(); }
  for (let i = groundItems.length - 1; i >= 0; i--) {
    const it = groundItems[i];
    it.age += dt;
    // pohyb a gravitace
    it.vel.y -= 18 * dt;
    const nx = it.pos.x + it.vel.x * dt, nz = it.pos.z + it.vel.z * dt;
    if (solidAny(Math.floor(nx), Math.floor(it.pos.y + 0.1), Math.floor(nz))) { it.vel.x *= -0.2; it.vel.z *= -0.2; }
    else { it.pos.x = nx; it.pos.z = nz; }
    it.pos.y += it.vel.y * dt;
    const fl = itemFloor(it.pos.x, it.pos.y, it.pos.z);
    if (it.pos.y <= fl) { it.pos.y = fl; it.vel.y = 0; it.vel.x *= 0.8; it.vel.z *= 0.8; }
    it.spin += dt * 1.8;
    // sebrání
    if (it.req > 0) it.req -= dt;
    if (pickup) pickup(it);
    if (it.n <= 0 || it.age > 300) groundItems.splice(i, 1);
  }
}
// Hráč chce sebrat předmět (zpráva 'pk' u hostitele / serveru): kolik kusů dostane, nebo 0.
export function claimGroundItem(gid) {
  const it = groundItems.find((g) => g.gid === gid);
  if (!it || it.n <= 0) return null;
  const got = it.w ? { id: it.id, n: it.n, w: it.w } : { id: it.id, n: it.n };
  it.n = 0;
  NET.op(['gx', it.gid, 0]);
  return got;
}
