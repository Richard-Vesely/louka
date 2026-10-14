import { defineConfig } from 'vite';

export default defineConfig({
  // './' = works from any folder, e.g. GitHub Pages at /louka/
  base: './',
  server: { port: 5173 },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1000 },
});
