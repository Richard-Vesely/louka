// Stolování: talíř a příbor před hráčem.
import '../player/eating.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { ICONS } from '../render/icons.js';
import { camera } from '../render/renderer.js';

// ============================================================ příbory: krájení, namotávání špaget, lžíce, hůlky
// Jídlo se ukáže na talíři před tebou a jíš ho po soustech. Pravé tlačítko = krájet / nabrat / uchopit,
// u špaget pravé tlačítko DRŽ = namotávat, pustit = do pusy. Levé tlačítko nebo pohyb = přestat jíst.
export const DINE_STYLE = {
  spaghetti: 'twirl',
  chicken_soup: 'spoon', goulash: 'spoon', venison_goulash: 'spoon', bone_broth: 'spoon', mashed_potatoes: 'spoon', tomato_sauce: 'spoon', cooked_rice: 'spoon',
  steak: 'cut', schnitzel: 'cut', pizza: 'cut', pancakes: 'cut', berry_pancakes: 'cut', strudel: 'cut', pork_dumplings: 'cut', mutton_potatoes: 'cut',
  roast_chicken: 'cut', fried_trout: 'cut', fried_egg: 'cut', eggs_bacon: 'cut', cooked_mutton: 'cut', cooked_pork: 'cut', cooked_venison: 'cut', meat: 'cut', baked_potato: 'cut',
  maki: 'chop', nigiri: 'chop', sushi_platter: 'chop',
  dumplings: 'stab', fries: 'stab', mushroom_fry: 'stab', fruit_salad: 'stab', scrambled_eggs: 'stab',
};
export const DINE_BITES = { sushi_platter: 5, spaghetti: 4, pork_dumplings: 4, goulash: 4, venison_goulash: 4, pizza: 4, maki: 2, nigiri: 2 };
// Barva jídla = průměr sytých pixelů jeho ikony (bez talíře a obrysu)
const foodColorCache = {};
export function foodColor(id) {
  if (foodColorCache[id]) return foodColorCache[id];
  const d = ICONS[id].canvas.getContext('2d').getImageData(0, 0, 16, 16).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (mx < 50 || (mx - mn) / mx < 0.22) continue; // přeskoč talíř a obrys
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
  }
  return (foodColorCache[id] = n ? new THREE.Color(r / n / 255, g / n / 255, b / n / 255).convertSRGBToLinear() : new THREE.Color(0.8, 0.6, 0.4));
}

export const dineView = new THREE.Group();
dineView.visible = false;
camera.add(dineView);
const steelMat = new THREE.MeshStandardMaterial({ color: 0xe6eaf0, metalness: 1, roughness: 0.16 });
export const ceramicMat = new THREE.MeshStandardMaterial({ color: 0xf8f8fa, roughness: 0.22 });
const woodStickMat = new THREE.MeshStandardMaterial({ color: 0xc8a06a, roughness: 0.6 });
export const part = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
// Příbor směřuje špičkou dopředu (−z); kloub (počátek) je v ruce.
function makeFork() {
  const g = new THREE.Group();
  part(new THREE.BoxGeometry(0.012, 0.005, 0.14), steelMat, 0, 0, 0.02, g);
  part(new THREE.BoxGeometry(0.022, 0.004, 0.025), steelMat, 0, 0, -0.06, g);
  for (let i = 0; i < 4; i++) part(new THREE.BoxGeometry(0.003, 0.003, 0.045), steelMat, -0.0085 + i * 0.0057, 0, -0.095, g);
  return g;
}
function makeKnife() {
  const g = new THREE.Group();
  part(new THREE.BoxGeometry(0.013, 0.008, 0.1), steelMat, 0, 0, 0.04, g);
  part(new THREE.BoxGeometry(0.016, 0.002, 0.11), steelMat, 0.002, 0, -0.065, g);
  return g;
}
function makeSpoon() {
  const g = new THREE.Group();
  part(new THREE.BoxGeometry(0.011, 0.005, 0.13), steelMat, 0, 0.004, 0.03, g);
  const bowl = part(new THREE.SphereGeometry(0.03, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), steelMat, 0, 0.006, -0.065, g);
  bowl.scale.set(0.8, 0.45, 1.2);
  bowl.material = steelMat.clone();
  bowl.material.side = THREE.DoubleSide;
  return g;
}
function makeChopstick() {
  const g = new THREE.Group();
  part(new THREE.CylinderGeometry(0.0025, 0.004, 0.22, 6).rotateX(Math.PI / 2), woodStickMat, 0, 0, -0.04, g);
  return g;
}
export const DT = { fork: makeFork(), knife: makeKnife(), spoon: makeSpoon(), chopA: makeChopstick(), chopB: makeChopstick() };
for (const t of Object.values(DT)) dineView.add(t);
const plateG = new THREE.Group();
plateG.position.set(0, -0.27, -0.58);
plateG.rotation.x = 0.7;
dineView.add(plateG);
part(new THREE.CylinderGeometry(0.17, 0.12, 0.014, 32), ceramicMat, 0, 0, 0, plateG);
export const foodG = new THREE.Group();
plateG.add(foodG);
export const bite = new THREE.Group(); // sousto na vidličce / lžíci / v hůlkách
dineView.add(bite);
export const PLATE_TO_VIEW = (x, y, z) => new THREE.Vector3(x, y, z).applyEuler(plateG.rotation).add(plateG.position);
