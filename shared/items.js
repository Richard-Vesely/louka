// ============================================================ předměty
// Každý předmět ve hře. Nový předmět = nový řádek tady (a ikona v client/src/render/pixel-art.js).
//
// Vlastnosti:
//   name  – název v češtině
//   icon  – emoji (záložní ikona)
//   block – jaký blok se položí pravým tlačítkem (viz blocks.js)
//   food  – kolik nasytí, heal – kolik vyléčí
//   tool  – 'axe' | 'pick' | 'sword', tier – úroveň 1–4, dmg – poškození
//   stack – kolik kusů se vejde do jednoho políčka (výchozí 64)

/** Barva podle úrovně nástroje (1 dřevo, 2 kámen, 3 železo, 4 krystal). */
export const TIER_COLOR = { 1: '#a0784a', 2: '#a8a8a8', 3: '#eef0f6', 4: '#7ff3ff' };

/** Jak rychle nástroj těží podle úrovně (ruka = 1). */
export const TOOL_SPEED = { 1: 2, 2: 3.5, 3: 6, 4: 7 };

export const ITEMS = {
  log: { name: 'Kmen', icon: '🪵' },
  planks: { name: 'Prkna', icon: '🟫', block: 'planks' },
  stick: { name: 'Klacek', icon: '🥢' },
  fiber: { name: 'Vlákno', icon: '🌾' },
  stone: { name: 'Kámen', icon: '🪨', block: 'cobble' },
  bricks: { name: 'Kamenné cihly', icon: '🧱', block: 'bricks' },
  iron_ore: { name: 'Železná ruda', icon: '🟠' },
  iron: { name: 'Železný ingot', icon: '🔩' },
  shard: { name: 'Úlomek světla', icon: '💎' },
  essence: { name: 'Stínová esence', icon: '🟣' },
  wool: { name: 'Vlna', icon: '🧶' },
  berries: { name: 'Lesní plody', icon: '🫐', food: 8 },
  raw_meat: { name: 'Syrové maso', icon: '🥩', food: 6 },
  meat: { name: 'Pečené maso', icon: '🍖', food: 35, heal: 10 },
  fruit_salad: { name: 'Ovocný salát', icon: '🥗', food: 18 },
  torch: { name: 'Pochodeň', icon: '🕯️', block: 'torch' },
  campfire: { name: 'Táborák', icon: '🔥', block: 'campfire', stack: 8 },
  workbench: { name: 'Pracovní stůl', icon: '🛠️', block: 'workbench', stack: 8 },
};

// Nástroje pro každý materiál: sekera, krumpáč, meč.
for (const [tier, mat] of [[1, 'Dřevěn'], [2, 'Kamenn'], [3, 'Železn']]) {
  const t = Number(tier), key = ['', 'wood', 'stone', 'iron'][t];
  ITEMS[`${key}_axe`] = { name: `${mat}á sekera`, icon: '🪓', tool: 'axe', tier: t, dmg: 1 + t, stack: 1 };
  ITEMS[`${key}_pick`] = { name: `${mat}ý krumpáč`, icon: '⛏️', tool: 'pick', tier: t, dmg: 1 + t * 0.5, stack: 1 };
  ITEMS[`${key}_sword`] = { name: `${mat}ý meč`, icon: '🗡️', tool: 'sword', tier: t, dmg: [0, 3, 4, 6][t], stack: 1 };
}
ITEMS.crystal_sword = { name: 'Krystalový meč', icon: '🗡️', tool: 'sword', tier: 4, dmg: 10, stack: 1 };

for (const it of Object.values(ITEMS)) it.stack ??= 64;
