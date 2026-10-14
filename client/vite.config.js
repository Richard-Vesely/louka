import { defineConfig } from 'vite';

// Herní server (npm run dev ho spustí taky) běží na portu 8787. Vite ho zpřístupní na adrese /ws,
// takže hra v prohlížeči potřebuje jen jeden port – funguje to i v GitHub Codespaces.
const proxy = { '/ws': { target: 'ws://localhost:8787', ws: true } };

export default defineConfig({
  // './' = works from any folder, e.g. GitHub Pages at /louka/
  base: './',
  server: {
    port: 5173,
    proxy,
    allowedHosts: ['.app.github.dev'], // Codespaces
    hmr: process.env.CODESPACES ? { clientPort: 443 } : undefined,
  },
  preview: { port: 4173, proxy },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1000 },
});
