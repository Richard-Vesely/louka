// ============================================================ webové stránky hry
// Server umí posílat i samotnou hru (složku client/dist), takže na jednom VPS běží všechno.
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

/**
 * Vytvoří obsluhu HTTP požadavků pro složku `root` (nebo jen /health, když složka není).
 * @param {string|null} root složka se sestavenou hrou (client/dist)
 * @param {() => object} health co vrátit na /health
 */
export function staticHandler(root, health) {
  const base = root && fs.existsSync(root) ? path.resolve(root) : null;
  return (req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(health()));
      return;
    }
    if (!base) { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Herní server Louky běží.'); return; }
    const file = path.resolve(base, '.' + (url.endsWith('/') ? url + 'index.html' : url));
    if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('Nenalezeno'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  };
}
