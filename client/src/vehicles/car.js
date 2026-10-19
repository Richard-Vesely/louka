// Auto: model, jízda, kufr.
import '../world/fishing.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { NET } from '../../../shared/net/net.js';
import { others } from '../../../shared/net/room.js';
import { mobs } from '../../../shared/sim/mobs.js';
import { clamp, randInt, wrapAngle } from '../../../shared/util.js';
import { solidAny, voxFloor } from '../../../shared/world/collision.js';
import { PH, PW } from '../../../shared/world/constants.js';
import { waterAt } from '../../../shared/world/nature.js';
import { vehicles } from '../../../shared/world/state.js';
import { terrainH } from '../../../shared/world/terrain.js';
import { groundHeight } from '../../../shared/world/voxels.js';
import { Sound } from '../audio/sound.js';
import { MP } from '../game/boot.js';
import { gameTime } from '../game/loop.js';
import { TOUCH } from '../game/prefs.js';
import { hitMob } from '../mobs/mobs.js';
import { clearTarget, groundRing, outline, preview, target } from '../player/interaction.js';
import { collidesBlocks, input, keys, player } from '../player/player.js';
import { tmpV } from '../render/daylight.js';
import { forestColliders } from '../render/forest.js';
import { holder } from '../render/held-item.js';
import { U, camera, scene } from '../render/renderer.js';
import { $ } from '../ui/dom.js';
import { toast } from '../ui/hud.js';
import { slotHTML, ui } from '../ui/inventory-ui.js';
import { PLANE, buildPlaneModel, flyPlane, placePlaneCamera } from './plane.js';

// ============================================================ vozidla: auto
// Stav auta se ukládá a v multiplayeru synchronizuje jako malá mapa (vehicles). Kdo řídí, počítá fyziku u sebe
// a polohu posílá s pozicí hráče (12× za sekundu); ostatní auto plynule dopočítávají.
export const CAR = { len: 4.2, wid: 1.9, wb: 2.6, track: 1.6, maxFwd: 22, maxRev: 6, accel: 7, brake: 16, steerMax: 0.55, fuelMax: 40, step: 0.65 };
export const myDriverId = () => (MP ? NET.pid : 'me');
// Rozměry a vlastnosti podle druhu vozidla (letadlo je definované v 19c)
export const vehDim = (t) => (t === 'plane' ? { wid: PLANE.span, len: PLANE.len, h: 2.6, push: 1.1, name: 'Dvouplošník', fuelMax: PLANE.fuelMax }
  : { wid: CAR.wid, len: CAR.len, h: 1.62, push: CAR.wid, name: 'Auto', fuelMax: CAR.fuelMax });
const remoteVeh = new Map(); // id auta -> poslední poloha od hráče, který ho řídí (neukládá se)
export const carWarn = { t: 0 }; // odpočet do dalšího upozornění (auto i letadlo)
export let carCam = 0;
export function toggleCarCam() { carCam = 1 - carCam; } // 0 = z první osoby, 1 = ze třetí osoby
const vehMeshes = new Map();
// Jediné reflektorové světlo pro auto, které řídíš (stálý počet světel = žádné překompilování shaderů)
const carSpot = new THREE.SpotLight(0xfff2d0, 0, 45, 0.55, 0.5, 1.2);
scene.add(carSpot, carSpot.target);

// ---------- model: dopředu je -z, počátek mezi nápravami na zemi
function buildCarModel(color) {
  const g = new THREE.Group();
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, ...o });
  const paint = M({ color, metalness: 0.45, roughness: 0.3 }), dark = M({ color: 0x1e1e22, roughness: 0.8 }), chrome = M({ color: 0xd8dce2, metalness: 0.9, roughness: 0.2 });
  const glass = M({ color: 0x223040, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.3 });
  const box = (w, h, d, m, x, y, z, parent = g) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); parent.add(me); return me; };
  box(1.9, 0.5, 4.2, paint, 0, 0.68, 0);              // spodní část karoserie
  box(1.86, 0.12, 1.5, paint, 0, 0.98, -1.3);         // kapota
  box(1.8, 0.62, 1.95, glass, 0, 1.24, 0.25);         // kabina se skly
  box(1.84, 0.08, 1.75, paint, 0, 1.58, 0.3);         // střecha
  for (const [x, z] of [[-0.88, -0.7], [0.88, -0.7], [-0.88, 1.2], [0.88, 1.2]]) box(0.08, 0.62, 0.1, paint, x, 1.24, z); // sloupky
  box(1.95, 0.22, 0.18, dark, 0, 0.52, -2.12);        // přední nárazník
  box(1.95, 0.22, 0.18, dark, 0, 0.52, 2.12);         // zadní nárazník
  box(1.0, 0.2, 0.04, chrome, 0, 0.75, -2.11);        // maska chladiče
  const head = M({ color: 0xfff8e0, emissive: 0xfff2c0, emissiveIntensity: 0 }), tail = M({ color: 0x6a1010, emissive: 0xff2010, emissiveIntensity: 0.25 });
  for (const x of [-0.65, 0.65]) { box(0.38, 0.16, 0.04, head, x, 0.78, -2.11); box(0.36, 0.14, 0.04, tail, x, 0.78, 2.11); }
  const seat = M({ color: 0x4a2e22 });
  for (const x of [-0.42, 0.42]) { box(0.55, 0.12, 0.55, seat, x, 0.98, 0.35); box(0.55, 0.6, 0.12, seat, x, 1.25, 0.66); }
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 16), dark);
  sw.position.set(-0.42, 1.2, -0.25);
  sw.rotation.x = -0.9;
  g.add(sw);
  // kola: natáčecí čep -> rotující kolo (pneumatika, ráfek, paprsek, aby bylo vidět otáčení)
  const wheels = [], pivots = [];
  const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 18).rotateZ(Math.PI / 2), rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.32, 12).rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.95, -1.3], [0.95, -1.3], [-0.95, 1.3], [0.95, 1.3]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.38, z);
    g.add(pivot);
    const spin = new THREE.Group();
    pivot.add(spin);
    spin.add(new THREE.Mesh(tireGeo, dark), new THREE.Mesh(rimGeo, chrome));
    box(0.34, 0.06, 0.36, chrome, 0, 0, 0, spin);
    wheels.push(spin);
    if (z < 0) pivots.push(pivot);
  }
  return { group: g, wheels, pivots, head, tail };
}
const CAR_COLORS = [0xc82a2a, 0x2a5ab0, 0x2a8a3a, 0xe8c030, 0xe8e8e8, 0x2a2a30, 0xe07a20];

// ---------- vytvoření, nastoupení, vystoupení
export function spawnVehicle(type, x, z, yaw) {
  const id = NET.uid();
  const y = floorAt(x, z, terrainH(x, z) + 1);
  vehicles.set(id, { type, x, y, z, yaw, pitch: type === 'plane' ? PLANE.groundPitch : 0, roll: 0, spd: 0, steer: 0, fuel: 0, bat: 0, slots: Array(19).fill(null), lights: false, driver: null,
    color: type === 'plane' ? [0x8a2a22, 0x3a5a3a, 0x3a4a7a, 0xb8a060][randInt(0, 3)] : CAR_COLORS[randInt(0, CAR_COLORS.length - 1)], ...(type === 'plane' ? { vx: 0, vy: 0, vz: 0, thr: 0, ground: true } : {}) });
  return id;
}
export function enterVehicle(id) {
  const v = vehicles.get(id);
  if (!v) return;
  if (v.driver && v.driver !== myDriverId()) { toast('V autě už někdo sedí'); return; }
  v.driver = myDriverId();
  player.vehicle = id;
  player.sitting = null;
  player.yaw = 0; // ve voze je natočení kamery relativní k autu
  player.pitch = -0.08;
  holder.visible = false;
  v.engine = false;
  Sound.place();
  if (v.type === 'plane') toast(TOUCH ? 'Plyn + / − · joystick = knipl (dolů = nos nahoru, do stran = náklon) · kamera, vystoupit' : 'Mezerník / Shift = plyn · S nos nahoru, W dolů · A/D náklon (na zemi řízení) · L světla · V kamera · F vystoupit');
  else toast(TOUCH ? 'Joystick = jízda a zatáčení · tlačítka: brzda, světla, klakson, kamera, vystoupit' : 'W/S plyn a brzda · A/D zatáčení · Mezerník brzda · L světla · B klakson · V kamera · F vystoupit');
}
export function exitVehicle() {
  const v = vehicles.get(player.vehicle);
  // z letadla se vystupuje jen na zemi, když stojí
  if (v?.type === 'plane' && player.alive && (!v.ground || Math.hypot(v.vx || 0, v.vz || 0) > 3)) { toast('Vystoupit můžeš jen na zemi, až letadlo zastaví'); return; }
  player.vehicle = null;
  holder.visible = true;
  Sound.engine?.(false, 0);
  if (!v) return;
  v.driver = null;
  v.engine = false;
  v.spd = 0;
  // vystoupí vlevo od auta (nebo vpravo, když vlevo je zeď)
  for (const side of [-1, 1]) {
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw), lx = side * (v.type === 'plane' ? 5.2 : 1.6);
    const x = v.x + c * lx, z = v.z - s * lx, y = floorAt(x, z, v.y + 1);
    player.pos.set(x, y + 0.02, z);
    if (!collidesBlocks(player.pos)) break;
  }
  player.vel.set(0, 0, 0);
  player.yaw = v.yaw + player.yaw;
  Sound.place();
}

// ---------- fyzika jízdy
// Podlaha pod bodem: terén (když není vykopaný) nebo horní stěna bloku / podzemí; jen do výšky schodu nad yRef
export function floorAt(x, z, yRef) {
  const g = groundHeight(x, z), vf = voxFloor(x, yRef + 0.2, z);
  return Math.max(isFinite(g) && g <= yRef + CAR.step ? g : -Infinity, vf);
}
const carLocal = (v, lx, lz) => { const c = Math.cos(v.yaw), s = Math.sin(v.yaw); return [v.x + c * lx + s * lz, v.z - s * lx + c * lz]; };
// Narazí karoserie (body po obvodu ve výšce 0,5–1,5 m) do bloku, stromu nebo balvanu?
export function carHits(v, x, z, yaw) {
  const t = { ...v, x, z, yaw };
  for (const [lx, lz] of [[-0.9, -2.05], [0.9, -2.05], [-0.9, 2.05], [0.9, 2.05], [-0.95, 0], [0.95, 0], [0, -2.1], [0, 2.1]]) {
    const [px, pz] = carLocal(t, lx, lz);
    for (const dy of [0.6, 1.3]) if (solidAny(Math.floor(px), Math.floor(v.y + dy), Math.floor(pz))) return true;
    if (v.y > terrainH(px, pz) - 2) for (const c of forestColliders) if ((px - c.x) ** 2 + (pz - c.z) ** 2 < (c.r + 0.15) ** 2) return true;
  }
  return false;
}
export let hornN = 0, carHitT = 0;
export function driveVehicle(dt) {
  const v = vehicles.get(player.vehicle);
  if (!v) { exitVehicle(); return 0; }
  if (v.type === 'plane') return flyPlane(v, dt);
  if (target) { clearTarget(); outline.visible = groundRing.visible = preview.visible = false; $('targetLabel').innerHTML = ''; $('progress').style.opacity = 0; } // za volantem se nemíří
  const joy = input.joy;
  const fwd = clamp((keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + (joy ? -joy.y : 0), -1, 1);
  const steerIn = clamp((keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) + (joy ? -joy.x : 0), -1, 1);
  const hand = keys.has('Space');
  // startování: palivo + nabitá baterie
  if (!v.engine && Math.abs(fwd) > 0.2) {
    if (v.fuel <= 0) { if ((carWarn.t -= dt) <= 0) { carWarn.t = 3; toast('Došlo palivo – natankuj z kanystru (pravé tl. s kanystrem na auto)'); } }
    else if (!(v.slots[0]?.id === 'car_battery' && v.bat > 0)) { if ((carWarn.t -= dt) <= 0) { carWarn.t = 3; toast('Auto nenastartuje – do kufru vlož nabitou autobaterii'); } }
    else { v.engine = true; v.bat = Math.max(0, v.bat - 2); Sound.burst({ dur: 0.6, f0: 300, f1: 120, q: 1.5, vol: 0.3, type: 'lowpass' }); }
  }
  if (v.engine && v.fuel <= 0) { v.engine = false; toast('Motor zhasl – došlo palivo'); }
  // zrychlení, brzdy, zpátečka, odpor
  const thr = v.engine ? fwd : 0;
  if (hand) v.spd -= Math.sign(v.spd) * Math.min(Math.abs(v.spd), CAR.brake * 1.2 * dt);
  else if (thr > 0) v.spd = v.spd < 0 ? Math.min(0, v.spd + CAR.brake * dt) : Math.min(CAR.maxFwd, v.spd + CAR.accel * thr * (1 - v.spd / (CAR.maxFwd * 1.15)) * dt);
  else if (thr < 0) v.spd = v.spd > 0.3 ? Math.max(0, v.spd - CAR.brake * dt) : Math.max(-CAR.maxRev, v.spd + CAR.accel * 0.6 * thr * dt);
  else if (fwd < 0 && v.spd > 0) v.spd = Math.max(0, v.spd - CAR.brake * dt); // brzda funguje i s vypnutým motorem
  v.spd *= 1 - Math.min(1, (0.25 + Math.abs(v.spd) * 0.012) * dt); // valivý a vzdušný odpor
  if (Math.abs(v.spd) < 0.02 && !thr) v.spd = 0;
  // svah: auto do kopce zpomaluje, z kopce zrychluje
  v.spd -= Math.sin(v.pitch || 0) * 9.8 * dt * 0.6;
  // natáčení kol a zatáčení (kolo se otáčí kolem zadní nápravy)
  v.steer += (steerIn * CAR.steerMax * (1 - Math.min(0.6, Math.abs(v.spd) / 40)) - v.steer) * Math.min(1, dt * 6);
  const yawRate = (v.spd * Math.tan(v.steer)) / CAR.wb;
  const nyaw = v.yaw + yawRate * dt;
  const nx = v.x - Math.sin(nyaw) * v.spd * dt, nz = v.z - Math.cos(nyaw) * v.spd * dt;
  // kola: výška podlahy pod každým kolem
  const wy = [[-0.95, -1.3], [0.95, -1.3], [-0.95, 1.3], [0.95, 1.3]].map(([lx, lz]) => { const [px, pz] = carLocal({ x: nx, z: nz, yaw: nyaw }, lx, lz); return floorAt(px, pz, v.y); });
  const blockedStep = wy.some((h) => !isFinite(h)) || (v.spd > 0 ? Math.max(wy[0], wy[1]) : Math.max(wy[2], wy[3])) > v.y + CAR.step;
  if (blockedStep || carHits(v, nx, nz, nyaw)) {
    if (Math.abs(v.spd) > 4 && (carHitT -= dt) <= 0) { carHitT = 0.5; Sound.burst({ dur: 0.25, f0: 500, f1: 120, q: 1, vol: 0.5, type: 'lowpass' }); player.shake = 0.3; }
    v.spd *= -0.25;
  } else { v.x = nx; v.z = nz; v.yaw = nyaw; }
  // výška, náklon a pád
  const fy = Math.max(...wy.map((h) => (isFinite(h) ? h : -99)));
  const avg = wy.reduce((s, h) => s + (isFinite(h) ? h : fy), 0) / 4;
  if (avg < v.y - 0.08) { v.vy = (v.vy || 0) - 18 * dt; v.y = Math.max(avg, v.y + v.vy * dt); } else { v.y += (avg - v.y) * Math.min(1, dt * 12); v.vy = 0; }
  const f = (wy[0] + wy[1]) / 2, r = (wy[2] + wy[3]) / 2, l = (wy[0] + wy[2]) / 2, rt = (wy[1] + wy[3]) / 2;
  v.pitch = isFinite(f - r) ? clamp(Math.atan2(f - r, CAR.wb), -0.6, 0.6) : 0;
  v.roll = isFinite(l - rt) ? clamp(Math.atan2(l - rt, CAR.track), -0.5, 0.5) : 0;
  if (waterAt(v.x, v.y + 0.3, v.z) !== null) v.spd *= 1 - Math.min(1, dt * 2); // voda brzdí
  // palivo a baterie: motor žere palivo podle plynu a dobíjí baterii; světla s vypnutým motorem vybíjejí
  if (v.engine) { v.fuel = Math.max(0, v.fuel - (0.012 + Math.abs(thr) * 0.06) * dt); v.bat = Math.min(100, v.bat + 0.5 * dt); }
  else if (v.lights) v.bat = Math.max(0, v.bat - 0.4 * dt);
  if (v.lights && v.bat <= 0 && !v.engine) { v.lights = false; toast('Baterie je vybitá – světla zhasla'); }
  if (v.slots[0]?.id === 'car_battery' && v.bat <= 0 && !v.engine) v.slots[0] = { id: 'car_battery_empty', n: 1 };
  // srážka s tvorem
  if (Math.abs(v.spd) > 5) for (const m of mobs) {
    if (m.dead || (m.carT || 0) > gameTime) continue;
    const [fx, fz] = carLocal(v, 0, -Math.sign(v.spd) * 2);
    if (Math.hypot(m.pos.x - fx, m.pos.z - fz) < 1.4 + m.def.radius) { m.carT = gameTime + 0.6; hitMob(m, Math.abs(v.spd) * 0.8, v.yaw); }
  }
  // hráč sedí v autě (pozice kvůli načítání okolí, tvorům a síti)
  const [sx, sz] = carLocal(v, -0.42, 0.35);
  player.pos.set(sx, v.y + 0.6, sz);
  player.vel.set(0, 0, 0);
  player.onGround = true;
  placeCarCamera(v);
  Sound.engine(v.engine, Math.abs(v.spd) / CAR.maxFwd + Math.max(0, thr) * 0.25);
  return Math.abs(v.spd);
}
export function placeCarCamera(v) {
  if (v.type === 'plane') return placePlaneCamera(v);
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  if (carCam === 0) {
    const [cx, cz] = carLocal(v, -0.42, 0.62); // oči řidiče nad sedadlem, pod střechou
    camera.position.set(cx, v.y + 1.42, cz);
    e.set(player.pitch + (v.pitch || 0), v.yaw + clamp(player.yaw, -2.4, 2.4), 0);
  } else {
    const yaw = v.yaw + player.yaw, d = 7.5;
    let cx = v.x + Math.sin(yaw) * d, cz = v.z + Math.cos(yaw) * d, cy = v.y + 2.6 - player.pitch * 6;
    cy = Math.max(cy, terrainH(cx, cz) + 0.6);
    camera.position.set(cx, cy, cz);
    e.set(Math.atan2(v.y + 1.2 - cy, d), yaw, 0);
  }
  camera.quaternion.setFromEuler(e);
  camera.rotation.set(e.x, e.y, e.z);
}
export function honk() { hornN++; Sound.horn(); }
const vehHud = document.createElement('div');
vehHud.id = 'vehHud';
document.body.append(vehHud);
function updateVehHud() {
  const v = vehicles.get(player.vehicle);
  vehHud.style.display = v ? 'block' : 'none';
  if (!v) return;
  const dm = vehDim(v.type), fuel = `⛽ ${v.fuel.toFixed(1)} / ${dm.fuelMax} l`;
  let html;
  if (v.type === 'plane') {
    const sp = Math.hypot(v.vx || 0, v.vy || 0, v.vz || 0), alt = Math.max(0, v.y - terrainH(v.x, v.z));
    const stall = !v.ground && sp < PLANE.stall + 2;
    html = `✈ ${Math.round(sp * 3.6)} km/h · ⇡ ${Math.round(alt)} m · plyn ${Math.round((v.thr || 0) * 100)} % · ${fuel}${v.ground ? ' · na zemi' : ''}${stall ? ' <b class="warn">PÁD RYCHLOSTI</b>' : ''}`;
  } else html = `🚗 ${Math.round(Math.abs(v.spd) * 3.6)} km/h${v.spd < -0.3 ? ' (zpátečka)' : ''} · ${fuel} · 🔋 ${v.slots[0]?.id === 'car_battery' ? Math.round(v.bat) + ' %' : 'chybí'}${v.engine ? '' : ' · motor stojí'}`;
  if (vehHud.innerHTML !== html) vehHud.innerHTML = html;
}

// ---------- zobrazení všech aut (i řízených ostatními hráči)
export function updateVehicles(dt) {
  const me = myDriverId();
  // auta řízená ostatními: poloha z jejich pozice (12× za sekundu), plynule
  for (const P of others.values()) {
    const q = P.pose?.veh;
    if (!q) continue;
    const v = vehicles.get(q.id);
    if (!v) continue;
    remoteVeh.set(q.id, q);
    if (P.hornSeen !== undefined && P.pose.hn > P.hornSeen && Math.hypot(q.x - player.pos.x, q.z - player.pos.z) < 60) Sound.horn();
    P.hornSeen = P.pose.hn;
  }
  for (const [id, v] of vehicles) {
    let m = vehMeshes.get(id);
    if (!m) { m = v.type === 'plane' ? buildPlaneModel(v.color || 0x8a2a22) : buildCarModel(v.color || 0xc82a2a); scene.add(m.group); vehMeshes.set(id, m); m.group.position.set(v.x, v.y, v.z); m.group.rotation.y = v.yaw; m.spin = 0; }
    const remote = v.driver && v.driver !== me ? remoteVeh.get(id) || null : null;
    const src = remote || v;
    const k = remote ? 1 - Math.exp(-dt * 10) : 1;
    m.group.position.lerp(tmpV.set(src.x, src.y, src.z), k);
    m.yaw = m.yaw === undefined ? src.yaw : m.yaw + wrapAngle(src.yaw - m.yaw) * k;
    m.group.rotation.set(0, 0, 0);
    m.group.rotateY(m.yaw);
    m.group.rotateX(src.pitch || 0); // předek výš = kladný náklon
    m.group.rotateZ(-(src.roll || 0));
    m.spin += ((src.spd || 0) / 0.38) * dt;
    for (const w of m.wheels) w.rotation.x = -m.spin;
    if (m.prop) m.prop.rotation.z += (src.thr || 0) * 70 * dt + (src.thr > 0 ? 6 * dt : 0); // vrtule
    for (const p of m.pivots) p.rotation.y = src.steer || 0;
    const lights = remote ? remote.lights : v.lights;
    if (m.head) { m.head.emissiveIntensity = lights ? 2.2 : 0; m.tail.emissiveIntensity = lights ? 1.2 : 0.25; }
    if (m.navs) m.navs.forEach((n, i) => (n.emissiveIntensity = lights ? (i === 2 && Math.sin(performance.now() / 300) < 0 ? 0 : 2) : 0)); // poziční světla, ocasní bliká
    if (v.slots?.[0]?.id && v.batId !== v.slots[0].id) { v.bat = v.slots[0].id === 'car_battery' ? 100 : 0; v.batId = v.slots[0].id; } // nově vložená baterie
    if (!v.slots?.[0]) v.batId = null;
  }
  for (const [id, m] of vehMeshes) if (!vehicles.has(id)) { scene.remove(m.group); vehMeshes.delete(id); }
  updateVehHud();
  // reflektor auta, ve kterém sedíš
  const v = vehicles.get(player.vehicle);
  if (v && v.lights && v.type !== 'plane') {
    const [hx, hz] = carLocal(v, 0, -2.2), [tx, tz] = carLocal(v, 0, -14);
    carSpot.position.set(hx, v.y + 0.9, hz);
    carSpot.target.position.set(tx, v.y - 0.5, tz);
    carSpot.intensity = 60;
    U.headPos.value.set(hx, v.y + 0.9, hz);
    U.headDir.value.set(tx - hx, -1.4, tz - hz).normalize();
    U.headOn.value = 1;
  } else { carSpot.intensity = 0; U.headOn.value = 0; }
}
// Hráč pěšky se do auta nepropadne: odsune se z obrysu karoserie
export function vehiclePush(p) {
  for (const v of vehicles.values()) {
    if (v.driver === myDriverId()) continue;
    const dx = p.x - v.x, dz = p.z - v.z;
    if (dx * dx + dz * dz > 9 || p.y > v.y + 1.6 || p.y + PH < v.y + 0.2) continue;
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw), lx = c * dx - s * dz, lz = s * dx + c * dz;
    const dm = vehDim(v.type), hx = dm.push / 2 + PW, hz = dm.len / 2 + PW;
    if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) continue;
    let nx = lx, nz = lz;
    if (hx - Math.abs(lx) < hz - Math.abs(lz)) nx = Math.sign(lx || 1) * hx; else nz = Math.sign(lz || 1) * hz;
    p.x = v.x + c * nx + s * nz;
    p.z = v.z - s * nx + c * nz;
  }
}
// Paprsek na auto (míření): obdélník karoserie v souřadnicích auta
export function rayVehicle(o, d, maxT) {
  let best = null;
  for (const [id, v] of vehicles) {
    if (id === player.vehicle || (v.x - o.x) ** 2 + (v.z - o.z) ** 2 > 100) continue;
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
    const lo = [c * (o.x - v.x) - s * (o.z - v.z), o.y - v.y, s * (o.x - v.x) + c * (o.z - v.z)], ld = [c * d.x - s * d.z, d.y, s * d.x + c * d.z];
    const dm = vehDim(v.type), mn = [-dm.wid / 2, 0.15, -dm.len / 2], mx = [dm.wid / 2, dm.h, dm.len / 2];
    let t0 = 0, t1 = maxT;
    for (let a = 0; a < 3 && t0 <= t1; a++) {
      if (Math.abs(ld[a]) < 1e-9) { if (lo[a] < mn[a] || lo[a] > mx[a]) t0 = Infinity; continue; }
      let ta = (mn[a] - lo[a]) / ld[a], tb = (mx[a] - lo[a]) / ld[a];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (t0 <= t1 && t0 < maxT && (!best || t0 < best.t)) best = { t: t0, id };
  }
  return best;
}
// Okno auta: palivo, baterie, kufr
export function renderCarUI(area) {
  const v = vehicles.get(ui.fireKey);
  if (!v) { area.innerHTML = '<div class="mc-note">Auto tu už není.</div>'; return; }
  const bar = (p, color) => `<div class="parrow" style="width:160px"><i style="width:${clamp(p, 0, 100)}%;background:${color}"></i></div>`;
  const dm = vehDim(v.type), plane = v.type === 'plane';
  area.innerHTML = `<div class="mc-title">${dm.name}</div>
    <div class="car-ui">
      <div><div class="k-label">Palivo ${v.fuel.toFixed(1)} / ${dm.fuelMax} l</div>${bar((v.fuel / dm.fuelMax) * 100, '#e0a03b')}
        ${plane ? '' : `<div class="k-label">Autobaterie ${v.slots[0]?.id === 'car_battery' ? Math.round(v.bat) + ' %' : v.slots[0] ? 'vybitá' : 'chybí'}</div>
        <div style="display:flex;gap:8px;align-items:center">${slotHTML(v.slots[0], 0, '', 'car')}${bar(v.slots[0]?.id === 'car_battery' ? v.bat : 0, '#3aff5a')}</div>`}</div>
      <button class="mc-btn" data-car-enter>${v.driver && v.driver !== myDriverId() ? 'Obsazeno' : 'Nastoupit (F)'}</button>
    </div>
    <div class="k-label">${plane ? 'Zavazadlový prostor' : 'Kufr'}</div><div class="grid">${v.slots.slice(1).map((s, i) => slotHTML(s, i + 1, '', 'car')).join('')}</div>
    <div class="mc-note">${plane ? 'Natankuješ kanystrem s palivem (pravé tl. s kanystrem). Startuje se plynem (mezerník), vzlétne se při rychlosti kolem 21 m/s.' : 'Natankuješ kanystrem s palivem (pravé tl. s kanystrem na auto). Vybitou autobaterii nabiješ v nabíječce.'}</div>`;
}
Object.assign(Sound, {
  // Motor: pila přes dolní propust, výška tónu podle otáček
  engine(on, rpm) {
    const c = this.ctx;
    if (!c) return;
    if (!this.eng) {
      const o = c.createOscillator(), f = c.createBiquadFilter(), gn = c.createGain();
      o.type = 'sawtooth';
      f.type = 'lowpass';
      gn.gain.value = 0;
      o.connect(f).connect(gn).connect(this.master);
      o.start();
      this.eng = { o, f, gn };
    }
    const t = c.currentTime;
    this.eng.gn.gain.setTargetAtTime(on ? 0.07 : 0, t, 0.15);
    this.eng.o.frequency.setTargetAtTime(36 + rpm * 95, t, 0.1);
    this.eng.f.frequency.setTargetAtTime(220 + rpm * 600, t, 0.1);
  },
  horn() { this.tone(415, 0.5, 0.16, 'square'); this.tone(523, 0.5, 0.12, 'square'); },
});
