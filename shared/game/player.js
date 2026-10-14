// ============================================================ PlayerState – stav hráče
// Co o hráči ví hra: kde je, co má v batohu, zdraví, hlad a postup.
import { ITEMS } from '../items.js';
import { SPAWN, EYE, PW, PH } from '../constants.js';

/** Výchozí vektor: obyčejný objekt { x, y, z }. Prohlížeč místo něj dává THREE.Vector3. */
export const plainVec = (x, y, z) => ({ x, y, z });

/**
 * @typedef {object} PlayerState
 * @property {string} name jméno hráče
 * @property {{x:number,y:number,z:number}} pos pozice nohou
 * @property {number} yaw kam se dívá (otočení doleva/doprava)
 * @property {number} hp zdraví 0..100
 * @property {number} hunger sytost 0..100
 * @property {boolean} alive žije (false = čeká na oživení)
 * @property {{slots:Array<{id:string,n:number}|null>, sel:number, cursor:{id:string,n:number}|null}} inv batoh
 * @property {{open:boolean, mode:string, size:number, craft:Array, fireKey:string|null, ghost:Array|null}} ui okno inventáře
 * @property {Object<string,boolean>} crafted co už vyrobil (pro rady)
 * @property {Object<string,boolean>} placedAny které bloky už položil (pro rady)
 */

/**
 * Vytvoří hráče (nového, nebo z uložené hry).
 * @param {string} name jméno
 * @param {object} [saved] uložená data ve formátu playerToSave()
 * @param {function} [vec3] jak vyrobit vektor pozice
 * @returns {PlayerState}
 */
export function createPlayer(name, saved = {}, vec3 = plainVec) {
  return {
    name,
    pos: vec3(...(saved.pos || SPAWN)),
    yaw: saved.yaw ?? 0,
    hp: saved.hp ?? 100,
    hunger: saved.hunger ?? 100,
    alive: true,
    lastHurt: -99,
    sprinting: false,
    inv: { slots: saved.inv || Array(36).fill(null), sel: 0, cursor: null },
    ui: { open: false, mode: 'inv', size: 2, craft: Array(9).fill(null), fireKey: null, ghost: null },
    crafted: saved.crafted || {},
    placedAny: saved.placedAny || {},
    // Časovače hry (neukládají se).
    respawnAt: 0, starveT: 0, hungerWarned: false, lastBreak: -99, lastHit: -99, invDirty: false,
  };
}

/** Hráč jako obyčejný objekt pro JSON (stejný formát jako původní uložená hra). */
export function playerToSave(p) {
  return { inv: p.inv.slots, pos: [p.pos.x, p.pos.y, p.pos.z], yaw: p.yaw, hp: Math.max(p.hp, 1), hunger: p.hunger, crafted: p.crafted, placedAny: p.placedAny };
}

/** Zasahuje hráč do políčka (x, y, z)? (Nejde položit blok do sebe.) */
export function playerIntersects(p, x, y, z) {
  const q = p.pos;
  return q.x - PW < x + 1 && q.x + PW > x && q.y < y + 1 && q.y + PH > y && q.z - PW < z + 1 && q.z + PW > z;
}

/** Co hráč drží v ruce (vybrané políčko hotbaru). */
export const heldStack = (p) => p.inv.slots[p.inv.sel];

/** Nástroj z hromádky (nebo null, když to není nástroj). */
export const toolOf = (s) => (s && ITEMS[s.id]?.tool ? ITEMS[s.id] : null);

/** Vzdálenost očí hráče od bodu (x, y, z). */
export const eyeDist = (p, x, y, z) => Math.hypot(p.pos.x - x, p.pos.y + EYE - y, p.pos.z - z);
