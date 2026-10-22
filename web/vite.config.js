import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Vite folds every module script of a page into one entry, so the page's own script (MapLibre, ~1 MB) would load
// before the translation of the static HTML could run. early.js is therefore a separate entry that this plugin adds
// to the head of every page as its own <script type="module">: English visitors see the translated page as soon as
// the small i18n tables arrive instead of after the whole app.
const earlyScript = () => ({
  name: 'early-i18n-script',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      const entry = ctx.bundle && Object.values(ctx.bundle).find((c) => c.type === 'chunk' && c.isEntry && c.name === 'early');
      const src = entry ? `/${entry.fileName}` : '/src/early.js';
      return { html, tags: [{ tag: 'script', attrs: { type: 'module', src }, injectTo: 'head-prepend' }] };
    },
  },
});

export default defineConfig({
  plugins: [earlyScript()],
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
        data: resolve(import.meta.dirname, 'data.html'),
        privacy: resolve(import.meta.dirname, 'soukromi.html'),
        early: resolve(import.meta.dirname, 'src/early.js'),
      },
    },
  },
});
