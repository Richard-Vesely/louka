// Futuristický vzhled elektrických zařízení: grafitové skříně s panely a šrouby, bílé díly, svítící proužek v barvě
// funkce, stavová kontrolka (zelená = pracuje, jantarová = bez proudu) a nad zapnutým strojem hologram s údajem.
// Barvy světel mají pevný význam: tyrkysová = elektřina, jantarová = teplo a oheň, fialová = Markova dimenze, zelená = v pořádku.
// Jen funkce a líně vytvořené materiály (nic se nespouští při načtení); volá je machines/power.js, pc/computer.js a pc/printer.js.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, hash2 } from '../../../shared/util.js';
import { ICONS } from '../render/icons.js';
import { MATQ, pbrMaps } from '../render/materials.js';
import { dataTex, noiseField } from '../render/texgen.js';

export const TECH = { cyan: 0x38e8ff, amber: 0xffb066, magenta: 0xd04bff, green: 0x5cff8a, gunmetal: 0x3a414d, white: 0xdfe5ec, warm: 0xffc58a };

// ---------- textura panelu: spáry mezi deskami, šrouby, jemné broušení (barva + výška pro reliéf)
function panelTexture() {
  const N = 256, n = noiseField(N, 401, [8, 16, 64, 128], 0.05), rgba = new Uint8Array(N * N * 4), h = new Float32Array(N * N);
  const rough = new Float32Array(N * N), metal = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, rowH = N / 3, row = Math.min(2, Math.floor(y / rowH)), lx = x % 128, ly = y - row * rowH;
    const d = Math.min(lx, 127 - lx, ly, rowH - 1 - ly);
    const screw = [[8, 8], [119, 8], [8, rowH - 9], [119, rowH - 9]].some(([sx, sy]) => Math.hypot(lx - sx, ly - sy) < 3.2);
    const streak = (n[(y * 3 & 255) * N + (x >> 2)] - 0.5) * 0.12;
    let v = 1 + streak + (n[i] - 0.5) * 0.1, hh = 0.55 + clamp(d / 6, 0, 1) * 0.25, r = 0.42 + streak, m = 1;
    if (d < 1.6) { v = 0.45; hh = 0.05; r = 0.75; }
    if (screw) { v = 1.25; hh = 0.95; r = 0.3; }
    if (hash2(Math.floor(x / 128), row + 3) > 0.7 && !screw && d > 1.6) v *= 0.88; // některé desky tmavší
    const o = i * 4;
    rgba[o] = clamp(255 * v, 0, 255); rgba[o + 1] = clamp(255 * v, 0, 255); rgba[o + 2] = clamp(255 * v, 0, 255); rgba[o + 3] = 255;
    h[i] = hh; rough[i] = r; metal[i] = m;
  }
  const t = dataTex(rgba, N, N, true);
  // pbrMaps čte výšku z userData.pbr (a velikost z image)
  t.userData.pbr = { h, rough, metal };
  return t;
}

let M = null;
/** Sdílené materiály strojů (vytvoří se při prvním stroji). */
export function techMats() {
  if (M) return M;
  const panel = panelTexture();
  const housing = new THREE.MeshStandardMaterial({ color: TECH.gunmetal, map: panel, metalness: 0.75, roughness: 0.42, envMapIntensity: 1.3 });
  const trim = new THREE.MeshStandardMaterial({ color: TECH.white, metalness: 0, roughness: 0.36 }); // čistý bílý plast
  if (MATQ.maps) {
    const mp = pbrMaps(panel, { bump: 1.2, cav: 2, rough: 0.42, metal: 1 });
    housing.normalMap = mp.nrm; housing.normalScale.setScalar(MATQ.normal);
    housing.aoMap = housing.roughnessMap = housing.metalnessMap = mp.orm;
    housing.roughness = 1;
  }
  M = {
    housing, trim,
    dark: new THREE.MeshStandardMaterial({ color: 0x1a1d23, metalness: 0.6, roughness: 0.5 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd8dee6, metalness: 1, roughness: 0.18 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xd8783a, metalness: 1, roughness: 0.3 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.85 }),
  };
  return M;
}
/** Svítící materiál (emissive); intenzitu mění updatePowerVisuals. */
export const glowMat = (color, intensity = 0, base = 0x0b0d12) => new THREE.MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });

/** Pomocník pro stavbu modelu: kvádr (se zaoblenými hranami, když r > 0) do skupiny. */
export function builder(g) {
  return {
    box(w, h, d, m, x, y, z, r = 0, parent = g) {
      const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
      const me = new THREE.Mesh(geo, m);
      me.position.set(x, y, z);
      parent.add(me);
      return me;
    },
    cyl(rt, rb, h, m, x, y, z, seg = 16, parent = g) {
      const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
      me.position.set(x, y, z);
      parent.add(me);
      return me;
    },
  };
}
/**
 * Spojí nehybné díly stroje se stejným materiálem do jednoho modelu (méně kreslení za snímek).
 * Pohyblivé díly jsou v podskupinách (ventilátor, hřídel, páčka, panel) nebo mají userData.keep.
 */
export function mergeStatic(g) {
  const byMat = new Map();
  for (const o of [...g.children]) {
    if (!o.isMesh || o.userData.keep || Array.isArray(o.material) || o.material.isShaderMaterial) continue;
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(o);
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const geos = list.map((o) => { o.updateMatrix(); const ge = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); ge.applyMatrix4(o.matrix); for (const k of Object.keys(ge.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ge.deleteAttribute(k); return ge; });
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    for (const o of list) { g.remove(o); o.geometry.dispose(); }
    g.add(new THREE.Mesh(merged, mat));
  }
}
/** Stavová kontrolka (malá kulička). Barvu a jas nastaví setStatus. */
export function addStatus(g, x, y, z) {
  const m = glowMat(TECH.amber, 0.6);
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), m);
  s.position.set(x, y, z);
  g.add(s);
  g.userData.status = m;
  return m;
}
const C_GREEN = new THREE.Color(TECH.green), C_AMBER = new THREE.Color(TECH.amber);
/** Kontrolka: zelená = pracuje, jantarová (pomalu bliká) = bez proudu. */
export function setStatus(m, on, time) {
  m.emissive.copy(on ? C_GREEN : C_AMBER);
  m.emissiveIntensity = on ? 2.2 : 0.7 + 0.5 * Math.max(0, Math.sin(time * 3));
}
/** Svítící proužek (tyrkysový = elektřina) – zapnutý stroj svítí naplno. */
export function addStrip(g, w, h, d, x, y, z, color = TECH.cyan) {
  const m = glowMat(color, 0.15);
  const b = builder(g).box(w, h, d, m, x, y, z);
  (g.userData.strips ||= []).push(m);
  return b;
}

// ---------- hologram nad zapnutým strojem: ikona stroje a údaj (výkon, nabití), průhledně tyrkysový, s řádky a blikáním
const holoVS = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const holoFS = `uniform sampler2D map;
uniform float uTime, uOn, uSeed;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  float glitch = step(0.985, fract(sin(floor(uTime * 9.0 + uSeed) * 91.7) * 4375.5));
  uv.x += glitch * 0.03 * sin(uv.y * 60.0 + uTime * 40.0);
  vec4 t = texture2D(map, uv);
  vec4 tr = texture2D(map, uv + vec2(0.006, 0.0)); // trocha barevného posunu
  float lum = dot(t.rgb, vec3(0.3, 0.59, 0.11));
  float scan = 0.7 + 0.3 * sin(uv.y * 140.0 - uTime * 7.0);
  float flick = 0.88 + 0.12 * sin(uTime * 31.0 + uSeed * 7.0) * sin(uTime * 7.3 + uSeed);
  float a = max(t.a, tr.a * 0.5);
  vec3 col = uColor * (0.55 + lum * 0.8) + vec3(0.25, 0.0, 0.3) * (tr.a - t.a) * 0.6;
  gl_FragColor = vec4(col * scan * flick * 2.2, a * uOn * (0.75 + 0.25 * scan));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/** Hologram (plocha, která se otáčí k hráči) s vlastním obrázkem: ikona + text. */
export function addHolo(g, type, y = 1.25) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uTime: { value: 0 }, uOn: { value: 0 }, uSeed: { value: Math.random() * 10 }, uColor: { value: new THREE.Color(TECH.cyan) } },
    vertexShader: holoVS, fragmentShader: holoFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.36), mat);
  mesh.position.y = y;
  mesh.renderOrder = 5;
  mesh.visible = false;
  g.add(mesh);
  g.userData.holo = { mesh, mat, ctx: c.getContext('2d'), tex, type, text: null, base: y };
  return g.userData.holo;
}
/** Překreslí obrázek hologramu, když se změní text (pár krát za sekundu nejvýš). */
export function drawHolo(H, text) {
  if (H.text === text) return;
  H.text = text;
  const x = H.ctx;
  x.clearRect(0, 0, 128, 64);
  x.strokeStyle = 'rgba(255,255,255,0.9)';
  x.lineWidth = 2;
  x.beginPath();
  x.roundRect?.(3, 3, 122, 58, 8);
  x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.12)';
  x.fill();
  const ic = ICONS[H.type]?.canvas;
  if (ic) { x.imageSmoothingEnabled = false; x.drawImage(ic, 8, 12, 40, 40); }
  x.fillStyle = '#ffffff';
  x.font = 'bold 22px system-ui, sans-serif';
  x.textAlign = 'left';
  x.textBaseline = 'middle';
  x.fillText(text, 54, 33);
  H.tex.needsUpdate = true;
}
/** Hologram: viditelný, jen když stroj běží a hráč je blízko; plynule se rozsvítí a otáčí se k hráči. */
export function updateHolo(H, g, on, cam, dt, time) {
  const wx = g.position.x, wz = g.position.z, d2 = (cam.x - wx) ** 2 + (cam.z - wz) ** 2;
  const target = on && d2 < 22 * 22 ? 1 : 0;
  const u = H.mat.uniforms.uOn;
  u.value += clamp(target - u.value, -dt * 3, dt * 3);
  H.mesh.visible = u.value > 0.01;
  if (!H.mesh.visible) return;
  H.mat.uniforms.uTime.value = time;
  H.mesh.rotation.y = Math.atan2(cam.x - wx, cam.z - wz) - g.rotation.y;
  H.mesh.position.y = H.base + Math.sin(time * 1.6 + wx) * 0.03;
  H.mesh.scale.setScalar(0.85 + 0.15 * u.value);
}
