// Ukládání světa serveru na disk: DATA_DIR/world.json každých 30 s a při vypnutí serveru.
// Jednou denně se udělá záloha do DATA_DIR/backups/world-RRRR-MM-DD.json (drží se posledních 7).
import fs from 'node:fs';
import path from 'node:path';

const KEEP_BACKUPS = 7;
const VERSION = 2;

/**
 * Načte uložený svět, nebo null (první spuštění). Starý soubor z verze 1 (jiná hra) se odloží stranou.
 * @param {string} dir složka s daty
 * @param {(msg: string) => void} [log]
 * @returns {object | null} stav světa ve tvaru worldState()
 */
export function loadWorldFile(dir, log = () => {}) {
  const file = path.join(dir, 'world.json');
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.version !== VERSION) {
    const old = path.join(dir, `world-v${data.version || 1}-${Date.now()}.json`);
    fs.renameSync(file, old);
    log(`Soubor světa je ze starší verze hry, odložen jako ${path.basename(old)}; začíná nový svět.`);
    return null;
  }
  return data.world;
}

/**
 * Uloží svět bezpečně: nejdřív do dočasného souboru, pak přejmenuje (když server spadne uprostřed zápisu,
 * starý soubor zůstane celý). Jednou denně záloha.
 * @param {string} dir složka s daty
 * @param {object} world stav světa (worldState())
 */
export function saveWorldFile(dir, world) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'world.json'), tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ version: VERSION, savedAt: new Date().toISOString(), world }));
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
