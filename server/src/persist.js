// ============================================================ ukládání světa na disk
// Svět a všichni hráči jsou v jednom JSON souboru (data/world.json). Ukládá se každých 30 s
// a při vypnutí serveru. Jednou denně se udělá záloha do data/backups/ (drží se posledních 7).
import fs from 'node:fs';
import path from 'node:path';

const KEEP_BACKUPS = 7;

/**
 * Načte uložený svět, nebo null (první spuštění).
 * @param {string} dir složka s daty
 * @returns {{world: object, players: Object<string, object>} | null}
 */
export function loadData(dir) {
  const file = path.join(dir, 'world.json');
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { world: data.world || {}, players: data.players || {} };
}

/**
 * Uloží svět bezpečně: nejdřív do dočasného souboru, pak přejmenuje (když server spadne
 * uprostřed zápisu, starý soubor zůstane celý).
 */
export function saveData(dir, data) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'world.json'), tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), ...data }));
  fs.renameSync(tmp, file);
  dailyBackup(dir, file);
}

// Jednou za den zkopíruje world.json do backups/world-RRRR-MM-DD.json a smaže zálohy starší než 7 posledních.
function dailyBackup(dir, file) {
  const backups = path.join(dir, 'backups');
  fs.mkdirSync(backups, { recursive: true });
  const today = path.join(backups, `world-${new Date().toISOString().slice(0, 10)}.json`);
  if (fs.existsSync(today)) return;
  fs.copyFileSync(file, today);
  const old = fs.readdirSync(backups).filter((f) => /^world-\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
  for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) fs.unlinkSync(path.join(backups, f));
}
