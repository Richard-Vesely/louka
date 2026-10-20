// Vstupní bod hry Říše (Louka).
// 1. hlavní menu (volba: hra pro jednoho / vytvořit server / připojit se),
// 2. hra: moduly v client/src se spouštějí v pevném pořadí jako dřív jeden velký skript.
//    Každý z nich nejdřív importuje předchozí (řádek "pořadí spouštění"), takže tady stačí importovat poslední.
//    Pořadí: game/boot → game/prefs → … → net/mp-start → game/debug (seznam je v AGENTS.md).
import './menu/settings.js';
import './menu/costume.js';
import './menu/menu.js';
import './game/debug.js';
