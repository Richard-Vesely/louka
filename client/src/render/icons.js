// ============================================================ pixelové ikony předmětů
// Bloky se kreslí jako malé 3D kostičky (jako v Minecraftu), ostatní předměty jako pixel art 16×16.
import { clamp, hash2 } from '@louka/shared/math.js';
import { ITEMS } from '@louka/shared/items.js';
import { planksTex, cobbleTex, bricksTex } from './textures.js';
import { TIER_PAL, HANDLE, SWORD, AXE, PICK, ART } from './pixel-art.js';

const canvas = (n) => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
const rgb = (c, k = 1) => `rgb(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0})`;

// Malá 16×16 textura stěny (zmenšená velká textura nebo nakreslená po pixelech).
const shrink = (src) => { const c = canvas(16); c.getContext('2d').drawImage(src, 0, 0, 16, 16); return c; };
const tiny = (fn) => {
  const c = canvas(16), g = c.getContext('2d');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = rgb(...fn(x, y)); g.fillRect(x, y, 1, 1); }
  return c;
};
const n = (x, y, s = 0) => 0.85 + hash2(x * 7 + s, y * 13 - s) * 0.3;
const BARK = [104, 76, 46], WOOD = [176, 138, 86];
const barkSide = tiny((x, y) => [BARK, x % 4 === 1 ? 0.7 * n(x, y) : n(x, y)]);
const logTop = tiny((x, y) => {
  const d = Math.hypot(x - 7.5, y - 7.5);
  if (d > 6.6) return [BARK, n(x, y, 1)];
  return [Math.floor(d) % 2 ? [190, 152, 98] : [160, 124, 78], n(x, y, 2) * 0.95 + 0.05];
});
const planks16 = shrink(planksTex.image), cobble16 = shrink(cobbleTex.image), bricks16 = shrink(bricksTex.image);
const wool16 = tiny((x, y) => [[232, 228, 218], (x + y) % 3 === 0 ? 0.88 : n(x, y, 3)]);
const benchTop = tiny((x, y) => {
  const edge = x === 0 || y === 0 || x === 15 || y === 15 || x === 7 || y === 7;
  return [WOOD, edge ? 0.55 : n(x, y, 4) * (y % 4 === 3 ? 0.8 : 1)];
});
const benchSide = tiny((x, y) => {
  if (y < 3) return [WOOD, y === 2 ? 0.6 : n(x, y, 5)];
  if (x > 2 && x < 13 && y > 5) return [[40, 28, 18], 1];
  return [WOOD, n(x, y, 6) * (x % 5 === 0 ? 0.75 : 1)];
});

// Šablona 16×16 stěn kostky -> izometrická kostka 32×32
const iso = (top, left, right = left) => {
  const c = canvas(32), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const S = 16;
  const face = (img, a, b, cc, d, e, f, shade) => {
    g.setTransform(a / S, b / S, cc / S, d / S, e, f);
    g.drawImage(img, 0, 0);
    if (shade) { g.fillStyle = `rgba(0,0,0,${shade})`; g.fillRect(0, 0, S, S); }
  };
  face(top, 14, -7, 14, 7, 2, 8, 0);
  face(left, 14, 7, 0, 16, 2, 8, 0.25);
  face(right, 14, -7, 0, 16, 16, 15, 0.45);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
};

// Pixel art podle šablony: každé písmeno je barva z palety, tečka je průhledná.
const pixel = (rows, pal) => {
  const c = canvas(16), g = c.getContext('2d');
  rows.forEach((row, y) => { for (let x = 0; x < 16; x++) { const col = pal[row[x]]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } } });
  return c;
};
const tool = (rows, tier) => pixel(rows, { ...TIER_PAL[tier], ...HANDLE,
  G: tier >= 3 ? '#e8c04a' : '#5a3e22', g: tier >= 3 ? '#a8822a' : '#3a2814', K: tier >= 3 ? '#e8c04a' : '#5a3e22' });

// Záložní ikona: emoji předmětu (pro nové předměty bez vlastního obrázku).
const emoji = (ch) => { const c = canvas(32), g = c.getContext('2d'); g.font = '26px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 16, 18); return c; };

/** Ikona každého předmětu: { canvas, url } podle id předmětu. */
export const ICONS = (() => {
  const icons = {
    log: iso(logTop, barkSide),
    planks: iso(planks16, planks16),
    stone: iso(cobble16, cobble16),
    bricks: iso(bricks16, bricks16),
    wool: iso(wool16, wool16),
    workbench: iso(benchTop, benchSide),
  };
  for (const [id, [rows, pal]] of Object.entries(ART)) icons[id] = pixel(rows, pal);
  for (const [id, it] of Object.entries(ITEMS)) {
    if (icons[id]) continue;
    if (it.tool) icons[id] = tool(it.tool === 'sword' ? SWORD : it.tool === 'axe' ? AXE : PICK, it.tier);
    else icons[id] = emoji(it.icon || '?');
  }
  const out = {};
  for (const [id, c] of Object.entries(icons)) out[id] = { canvas: c, url: c.toDataURL() };
  return out;
})();
