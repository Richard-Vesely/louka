// ============================================================ bloky
// Bloky, které jde položit do světa.
//
// Vlastnosti:
//   name    – název v češtině
//   solid   – narazíš do něj (true), nebo jím projdeš (false)
//   hard    – jak dlouho se těží
//   tool    – který nástroj ho těží rychleji ('axe' | 'pick')
//   req     – potřebná úroveň krumpáče (bez něj nejde vytěžit)
//   drop    – jaký předmět z něj padne
//   special – má vlastní 3D model (client/src/world/special-blocks.js)
//   light   – jak silně svítí v noci

export const BLOCKS = {
  planks: { name: 'Prkna', solid: true, hard: 1.2, tool: 'axe', drop: 'planks' },
  cobble: { name: 'Kámen', solid: true, hard: 2.5, tool: 'pick', req: 1, drop: 'stone' },
  bricks: { name: 'Kamenné cihly', solid: true, hard: 2.5, tool: 'pick', req: 1, drop: 'bricks' },
  workbench: { name: 'Pracovní stůl', solid: true, hard: 1.2, tool: 'axe', drop: 'workbench', special: true },
  campfire: { name: 'Táborák', solid: false, hard: 0.8, tool: 'axe', drop: 'campfire', special: true, light: 20 },
  torch: { name: 'Pochodeň', solid: false, hard: 0.1, drop: 'torch', special: true, light: 8 },
};

/** Klíč bloku v mapě světa: "x,y,z". */
export const bkey = (x, y, z) => `${x},${y},${z}`;
