// ============================================================ rady
// Tvůj postup světem – od dřeva přes kámen a železo až ke krystalu.
import { $ } from '../core/dom.js';
import { Sound } from '../audio/sound.js';
import { player } from '../player/state.js';
import { countItem } from '../inventory/inventory.js';
import { toast } from './hud.js';

// Postup je uložený u hráče (player.crafted = co už vyrobil, player.placedAny = co položil).
const TIPS = [
  { text: 'Pokácej strom – namiř na kmen a drž levé tlačítko myši.', done: () => countItem('log') > 0 || player.crafted.planks },
  { text: 'Otevři inventář (E), polož kmen do mřížky výroby a vezmi si prkna. Pak 4 prkna do čtverce = pracovní stůl. (Recepty vlevo rozloží suroviny za tebe.)', done: () => player.crafted.workbench },
  { text: 'Polož pracovní stůl (pravé tlačítko), klikni na něj pravým a vyrob dřevěný krumpáč.', done: () => player.crafted.wood_pick },
  { text: 'Vytěž kámen z balvanů a vyrob kamenné nástroje. Vytrhej trávu (míř pod sebe) na vlákno.', done: () => player.crafted.stone_pick || player.crafted.stone_axe || player.crafted.stone_sword },
  { text: 'Vyrob a polož táborák (u stolu). Světlo odhání stínožrouty.', done: () => player.placedAny.campfire },
  { text: 'Ulov ovci nebo kance, klikni pravým na táborák a vlož do něj maso.', done: () => player.crafted.meat },
  { text: 'Najdi rezavé balvany se železnou rudou, vytěž je kamenným krumpáčem a přetav v táboráku.', done: () => player.crafted.iron },
  { text: 'Hledej úlomky světla – zářící paprsky na obzoru (✦ na kompasu).', done: () => countItem('shard') >= 3 || player.crafted.crystal_sword },
  { text: 'Poraz stínožrouty v noci, získej jejich esenci a vyrob krystalový meč.', done: () => player.crafted.crystal_sword },
];
let tipIndex = -1;

/** Ukáže první nesplněnou radu (a "✔ Splněno", když jsi jednu právě splnil). */
export function updateTips() {
  const i = TIPS.findIndex((t) => !t.done());
  if (i === tipIndex) return;
  if (tipIndex >= 0 && (i > tipIndex || i < 0)) { toast('✔ Splněno'); Sound.craft(); }
  tipIndex = i;
  $('tipText').textContent = i < 0 ? 'Svět je tvůj. Stav, objevuj a přežij.' : TIPS[i].text;
}
