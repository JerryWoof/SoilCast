import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/',
  build: {
    // MapLibre alone is about 1 MB minified
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      // MapLibre in its own chunk: it changes only on upgrades, so browsers keep it cached across
      // site deploys and only the small app chunk is fetched again.
      output: {
        manualChunks: (id) => (id.includes('node_modules/maplibre-gl') ? 'maplibre' : undefined),
      },
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        about: resolve(import.meta.dirname, 'jak-to-funguje.html'),
        skill: resolve(import.meta.dirname, 'presnost.html'),
      },
    },
  },
});
