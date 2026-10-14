// ============================================================ hráč u tohoto počítače – stav
// Offline: tohle JE hráč ve hře (shared/game). Online: kopie, kterou plní zprávy ze serveru.
// Je to samostatný soubor bez dalších závislostí, aby ho mohl hned při startu číst kdokoli.
import * as THREE from 'three';
import { EYE } from '@louka/shared/constants.js';
import { createPlayer } from '@louka/shared/game/player.js';
import { save } from '../save/load.js';

/**
 * Stav ze shared/game/player.js (pozice, batoh, zdraví, hlad…) a navíc věci jen pro prohlížeč:
 * rychlost, sklon pohledu, pohupování, otřes kamery, výška očí (při plížení níž).
 */
export const player = Object.assign(createPlayer('Hráč', save || {}, (x, y, z) => new THREE.Vector3(x, y, z)), {
  vel: new THREE.Vector3(), pitch: -0.05, onGround: true, bob: 0, shake: 0, eyeH: EYE,
});
