import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

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

// Content Security Policy as a <meta> tag (GitHub Pages cannot send headers). Inline scripts are allowed by their
// SHA-256 hash, computed here from the final HTML, so editing them never silently breaks the page. Only for the build:
// the dev server injects its own scripts.
const CSP = {
  'default-src': ["'self'"],
  'script-src': ["'self'", 'https://static.cloudflareinsights.com'],
  'style-src': ["'self'", "'unsafe-inline'"],              // fallback for browsers without the -elem/-attr split
  'style-src-elem': ["'self'"],                            // + hashes of the inline <style> blocks
  'style-src-attr': ["'unsafe-inline'"],                   // style="" from the charts, legend and MapLibre
  'img-src': ["'self'", 'data:', 'blob:', 'https://tiles.openfreemap.org', 'https://s3.amazonaws.com'],
  'font-src': ["'self'"],
  'connect-src': ["'self'", 'https://tiles.openfreemap.org', 'https://s3.amazonaws.com', 'https://cloudflareinsights.com'],
  'worker-src': ["'self'", 'blob:'],                      // MapLibre web workers
  'child-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'form-action': ["'self'"],
};
const cspMeta = () => ({
  name: 'csp-meta',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      if (!ctx.bundle) return html;
      const sha = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
      // every inline <script> that runs (not src=, not JSON-LD data) and every <style> block gets its hash
      const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
        .filter(([, attrs]) => !/\bsrc\s*=/.test(attrs) && !/type\s*=\s*["']?application\/ld\+json/.test(attrs))
        .map(([, , body]) => sha(body));
      const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(([, body]) => sha(body));
      const pol = { ...CSP, 'script-src': [...CSP['script-src'], ...scripts], 'style-src-elem': [...CSP['style-src-elem'], ...styles] };
      const value = `${Object.entries(pol).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ')}; upgrade-insecure-requests`;
      return html.replace(/<head>/, `<head>\n    <meta http-equiv="Content-Security-Policy" content="${value}" />`);
    },
  },
});

export default defineConfig({
  plugins: [earlyScript(), cspMeta()],
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
