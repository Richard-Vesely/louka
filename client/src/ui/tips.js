// ============================================================ rady
// Tvůj postup světem – od dřeva přes kámen a železo až ke krystalu.
import { $ } from '../core/dom.js';
import { Sound } from '../audio/sound.js';
import { crafted, placedAny } from '../world/state.js';
import { countItem } from '../inventory/inventory.js';
import { toast } from './hud.js';

const TIPS = [
  { text: 'Pokácej strom – namiř na kmen a drž levé tlačítko myši.', done: () => countItem('log') > 0 || crafted.planks },
  { text: 'Otevři inventář (E), polož kmen do mřížky výroby a vezmi si prkna. Pak 4 prkna do čtverce = pracovní stůl. (Recepty vlevo rozloží suroviny za tebe.)', done: () => crafted.workbench },
  { text: 'Polož pracovní stůl (pravé tlačítko), klikni na něj pravým a vyrob dřevěný krumpáč.', done: () => crafted.wood_pick },
  { text: 'Vytěž kámen z balvanů a vyrob kamenné nástroje. Vytrhej trávu (míř pod sebe) na vlákno.', done: () => crafted.stone_pick || crafted.stone_axe || crafted.stone_sword },
  { text: 'Vyrob a polož táborák (u stolu). Světlo odhání stínožrouty.', done: () => placedAny.campfire },
  { text: 'Ulov ovci nebo kance, klikni pravým na táborák a vlož do něj maso.', done: () => crafted.meat },
  { text: 'Najdi rezavé balvany se železnou rudou, vytěž je kamenným krumpáčem a přetav v táboráku.', done: () => crafted.iron },
  { text: 'Hledej úlomky světla – zářící paprsky na obzoru (✦ na kompasu).', done: () => countItem('shard') >= 3 || crafted.crystal_sword },
  { text: 'Poraz stínožrouty v noci, získej jejich esenci a vyrob krystalový meč.', done: () => crafted.crystal_sword },
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
