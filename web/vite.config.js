import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/SoilCast/',
  build: {
    // MapLibre alone is about 1 MB minified
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        about: resolve(import.meta.dirname, 'jak-to-funguje.html'),
      },
    },
  },
});
