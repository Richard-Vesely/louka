// Fyzikální materiály bloků (PBR): drsnost, kov, reliéf, zastínění spár, odlesky skla a svícení.
// Jedna tabulka pro každou rodinu bloků (kámen, dřevo, cihly, kov, sklo…), aby kov svítil odlesky, kámen byl drsný
// a sklo odráželo oblohu. Jen funkce a tabulky: nic se nespouští při načtení (volá je blocks.js a power.js).
import * as THREE from 'three';
import { QUALITY } from '../game/prefs.js';
import { cavity, dataTex, heightToNormal } from './texgen.js';

/** Co zapne která grafika: mapy reliéfu a drsnosti jen se střední a vysokou (nízká zůstává levná). */
export const MATQ = { maps: QUALITY !== 'low', normal: QUALITY === 'high' ? 1 : 0.8 };

/**
 * Rodiny materiálů. rough = drsnost (0 zrcadlo, 1 mat), metal = kov (0/1), bump = hloubka reliéfu,
 * edge = jak moc ztmavit hranu bloku (aby byl vidět obrys), cav = síla zastínění spár.
 */
export const PBR = {
  stone: { rough: 0.85, metal: 0, bump: 1.6, edge: 0.2, cav: 3 },
  polished: { rough: 0.32, metal: 0, bump: 0.7, edge: 0.14, cav: 2 },
  wood: { rough: 0.7, metal: 0, bump: 1.4, edge: 0.18, cav: 3 },
  brick: { rough: 0.8, metal: 0, bump: 2.6, edge: 0.18, cav: 4 },
  soil: { rough: 0.95, metal: 0, bump: 1.2, edge: 0.16, cav: 2 },
  sand: { rough: 0.95, metal: 0, bump: 0.8, edge: 0.12, cav: 1.5 },
  snow: { rough: 0.75, metal: 0, bump: 0.6, edge: 0.1, cav: 1 },
  ceramic: { rough: 0.55, metal: 0, bump: 1.8, edge: 0.16, cav: 3 },
  concrete: { rough: 0.85, metal: 0, bump: 0.6, edge: 0.16, cav: 1.5 },
  metal: { rough: 0.35, metal: 1, bump: 1.4, edge: 0.12, cav: 3 },
  glass: { rough: 0.05, metal: 0, bump: 0, edge: 0, cav: 0 },
  obsidian: { rough: 0.15, metal: 0, bump: 1.0, edge: 0.12, cav: 2 },
  organic: { rough: 0.6, metal: 0, bump: 1.0, edge: 0.14, cav: 2 },
  neon: { rough: 0.25, metal: 0, bump: 0.8, edge: 0, cav: 2 },
};
// Blok (klíč materiálu v blocks.js) -> rodina; volitelně vlastní drsnost.
export const BLOCK_PBR = {
  planks: 'wood', mark_planks: 'wood', cherry_planks: 'wood', jungle_planks: 'wood', acacia_planks: 'wood', log_block: 'wood', markwood_block: 'wood',
  cobble: 'stone', granite: 'stone', basalt: 'stone', sandstone: 'stone', stone_tiles: 'stone', marble: ['polished', { rough: 0.45 }],
  polished_stone: 'polished', polished_granite: ['polished', { rough: 0.24 }], polished_marble: ['polished', { rough: 0.18 }], marble_pillar: ['polished', { rough: 0.3 }],
  polished_basalt: ['polished', { rough: 0.3 }], smooth_sandstone: ['stone', { rough: 0.7 }], quartz_block: ['polished', { rough: 0.35 }], quartz_pillar: ['polished', { rough: 0.35 }],
  bricks: 'brick', roof_tiles: 'ceramic', dirt: 'soil', markdirt: 'soil', farmland: 'soil', sand: 'sand', snow_block: 'snow', concrete: 'concrete',
  iron_block: 'metal', steel_block: ['metal', { rough: 0.28 }], copper_block: ['metal', { rough: 0.32 }], cut_copper: ['metal', { rough: 0.38 }], gold_block: ['metal', { rough: 0.22 }],
  glass: 'glass', obsidian: 'obsidian', mushroom_block: 'organic', mushroom_stem: 'organic',
  tech_panel: ['metal', { rough: 0.4 }], white_panel: ['polished', { rough: 0.3 }], neon_cyan: 'neon', neon_amber: 'neon', neon_magenta: 'neon',
};
/** Vlastnosti materiálu bloku (rodina + výjimky). */
export function blockPBR(key) {
  const e = BLOCK_PBR[key] || 'stone', [fam, over] = Array.isArray(e) ? e : [e, null];
  return { fam, ...PBR[fam], ...over };
}

// ---------- mapy z textury: normálová (z reliéfu) a ORM (R zastínění, G drsnost, B kov), jednou pro každou texturu
const mapCache = new WeakMap();
/** Výška pixelů textury: z dat, která textura uložila při kreslení (userData.pbr.h), jinak z jasu. */
function heightOf(tex) {
  const img = tex.image, W = img.width, H = img.height;
  if (tex.userData.pbr?.h) return { h: tex.userData.pbr.h, W, H };
  const d = (img.getContext ? img : (() => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(img, 0, 0); return c; })())
    .getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const h = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) h[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  return { h, W, H };
}
/** Normálová a ORM mapa pro texturu bloku (generuje se až při prvním použití bloku). */
export function pbrMaps(tex, p) {
  let m = mapCache.get(tex);
  if (m) return m;
  const { h, W, H } = heightOf(tex), pb = tex.userData.pbr || {};
  const nrm = dataTex(heightToNormal(h, W, H, p.bump * 2.2), W, H);
  const cav = cavity(h, W, H, Math.max(2, Math.round(W / 96)), p.cav);
  const orm = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4, r = pb.rough ? pb.rough[i] : p.rough * (1 + (1 - cav[i]) * 0.25);
    orm[o] = cav[i] * 255; orm[o + 1] = Math.min(1, Math.max(0.03, r)) * 255; orm[o + 2] = (pb.metal ? pb.metal[i] : p.metal) * 255; orm[o + 3] = 255;
  }
  m = { nrm, orm: dataTex(orm, W, H) };
  for (const t of [m.nrm, m.orm]) { t.anisotropy = tex.anisotropy; t.repeat.copy(tex.repeat); }
  mapCache.set(tex, m);
  return m;
}

// ---------- úprava shaderu: tmavší hrana bloku, reliéf slábne s dálkou (nemihotá se), sklo s odlesky
function patchShader(mat, p) {
  const edge = p.edge, glass = p.fam === 'glass';
  mat.customProgramCacheKey = () => `blk|${edge > 0}|${glass}`;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uEdge = { value: edge };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uEdge;');
    if (edge > 0) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
{ vec2 ed = abs(fract(vMapUv) - 0.5); diffuseColor.rgb *= 1.0 - uEdge * smoothstep(0.44, 0.5, max(ed.x, ed.y)); }
#endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale * (1.0 - 0.7 * smoothstep(8.0, 24.0, length(vViewPosition)));
  normal = normalize(tbn * mapN);
#endif`);
    // Sklo: průhledné, ale odlesky (obloha, slunce, lampy) zůstanou plně vidět – výstup je předem vynásobený alfou.
    if (glass) sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `vec3 glassSpec = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
gl_FragColor = vec4((outgoingLight - glassSpec) * diffuseColor.a + glassSpec, clamp(diffuseColor.a + dot(glassSpec, vec3(0.3)), 0.0, 1.0));`);
  };
}

/** Nastaví materiál bloku podle tabulky (drsnost, kov, hrany, sklo). Mapy reliéfu přidá až readyBlockMat. */
export function setupBlockMat(mat, key) {
  const p = blockPBR(key);
  mat.roughness = p.rough;
  mat.metalness = p.metal;
  mat.userData.pbr = p;
  if (p.fam === 'glass') {
    mat.blending = THREE.CustomBlending;
    mat.blendSrc = THREE.OneFactor;
    mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    mat.envMapIntensity = 1.6;
  }
  if (p.fam === 'metal') mat.envMapIntensity = 1.25;
  patchShader(mat, p);
  return mat;
}
/** Přidá materiálu mapy reliéfu a drsnosti (jen střední a vysoká grafika, jednou). */
export function readyBlockMat(mat) {
  if (!mat || mat.userData.ready || !MATQ.maps || !mat.map || !mat.userData.pbr) return mat;
  mat.userData.ready = true;
  const p = mat.userData.pbr;
  if (p.fam === 'glass') return mat;
  const m = pbrMaps(mat.map, p);
  mat.normalMap = m.nrm;
  mat.normalScale.setScalar(MATQ.normal);
  mat.roughnessMap = mat.metalnessMap = mat.aoMap = m.orm;
  mat.roughness = mat.metalness = 1; // hodnoty jsou přímo v mapě
  mat.aoMapIntensity = 1;
  mat.needsUpdate = true;
  return mat;
}
