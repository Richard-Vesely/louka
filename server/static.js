// Webové stránky hry: server posílá i samotnou hru (složku dist/), takže na jednom VPS nebo notebooku běží všechno.
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp',
};

/**
 * Vytvoří obsluhu HTTP požadavků pro složku `root` (nebo jen JSON adresy, když složka není).
 * Do index.html vloží značku <meta name="louka-server">, podle které menu ukáže světy tohoto serveru (a ví, jestli chce heslo).
 * @param {string|null} root složka se sestavenou hrou (dist/)
 * @param {Record<string, () => unknown>} api JSON adresy, např. { '/health': …, '/worlds': … } (bez hesla, smí je číst i jiné stránky)
 * @param {() => { password: boolean }} meta co vložit do index.html
 */
export function staticHandler(root, api, meta) {
  const base = root && fs.existsSync(root) ? path.resolve(root) : null;
  return (req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (Object.hasOwn(api, url)) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(api[url]()));
      return;
    }
    if (!base) { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Herní server Říše běží.'); return; }
    const file = path.resolve(base, '.' + (url.endsWith('/') ? url + 'index.html' : url));
    if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('Nenalezeno'); return; }
      const type = TYPES[path.extname(file)] || 'application/octet-stream';
      if (path.basename(file) === 'index.html') {
        const info = JSON.stringify({ password: !!meta().password }).replace(/"/g, '&quot;');
        buf = Buffer.from(buf.toString('utf8').replace('<head>', `<head>\n  <meta name="louka-server" content="${info}">`));
        res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
      } else res.writeHead(200, { 'content-type': type, 'cache-control': /\/assets\//.test(url) ? 'public, max-age=31536000, immutable' : 'no-cache' });
      res.end(buf);
    });
  };
}
