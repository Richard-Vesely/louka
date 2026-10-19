import { defineConfig } from 'vite';

// Herní server (npm start) běží na portu 8787. Při vývoji (npm run dev) ho Vite zpřístupní na adrese /ws,
// takže hra v prohlížeči potřebuje jen jeden port – funguje to i v GitHub Codespaces.
const proxy = { '/ws': { target: 'ws://localhost:8787', ws: true } };

export default defineConfig({
  // './' = hra funguje z libovolné složky, např. na GitHub Pages (/louka/)
  base: './',
  server: {
    port: 5173,
    proxy,
    allowedHosts: ['.app.github.dev'], // Codespaces
    hmr: process.env.CODESPACES ? { clientPort: 443 } : undefined,
  },
  preview: { port: 4173, proxy },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022', // await na nejvyšší úrovni modulu (game/boot.js čeká na volbu v menu)
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      onwarn(w, warn) { if (w.code === 'CIRCULAR_DEPENDENCY') return; warn(w); }, // moduly hry na sebe odkazují záměrně
    },
  },
});
