// ============================================================ nastavení hry
// Čísla, která určují, jak se hra chová. Používá je hra i server.

/** Délka dne v sekundách (noc ubíhá dvakrát rychleji). */
export const DAY_LENGTH = 480;

// Hráč: výška očí, rychlost chůze a běhu, síla skoku, gravitace, poloviční šířka a výška těla.
export const EYE = 1.62, WALK = 4.3, RUN = 8, JUMP = 6.2, GRAVITY = 18, PW = 0.3, PH = 1.8;

/** Jak daleko (v metrech) hráč dosáhne rukou. */
export const REACH = 5.5;

// Velikost buněk světa: v každé buňce může být jeden strom / balvan / úlomek.
export const TREE_CELL = 8, TREE_RADIUS = 190, ROCK_CELL = 11, SHARD_CELL = 110;

/** Kde se hráč objeví (u svatyně). */
export const SPAWN = [0, 0.45, 14];
