// Společný stav běžící hry, který čte víc souborů najednou.

/**
 * Herní čas v sekundách.
 * gameTime – běží jen když se hraje (pauza v inventáři), gameClock – běží pořád.
 */
export const clock = { gameTime: 0, gameClock: 0 };

/** Přepínače pro ladění a automatické testy (window.game.testMode). */
export const debug = { testMode: false };
