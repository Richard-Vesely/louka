// ============================================================ tvorové
// Ovce, kanci a stínožrouti.
//
// Vlastnosti:
//   name   – název v češtině
//   hp     – kolik vydrží zásahů (životy)
//   radius – jak velký je (pro míření)
//   cy     – výška středu těla
//   dmg    – kolik ubere hráči při útoku
//   drops  – co z něj padne: [předmět, nejméně, nejvíc]

export const MOBS = {
  sheep: { name: 'Ovce', hp: 5, radius: 0.75, cy: 0.75, drops: [['raw_meat', 1, 2], ['wool', 1, 2]] },
  boar: { name: 'Kanec', hp: 12, radius: 0.8, cy: 0.7, dmg: 10, drops: [['raw_meat', 2, 3]] },
  crawler: { name: 'Stínožrout', hp: 10, radius: 0.7, cy: 0.5, dmg: 14, drops: [['essence', 1, 2]] },
};
