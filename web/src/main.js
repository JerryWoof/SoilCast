import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import './style.css';
import { loadManifest, manifestStatus, insideGeometry, dayLabels, ageText } from './manifest.js';
import { gridCell } from './laea.js';
import { loadBlock } from './blocks.js';
import { loadSettings, saveSettings } from './settings.js';
import { initTheme, isDark, onThemeChange } from './theme.js';
import { renderPanel, panelEvents, resetPanelState } from './panel.js';
import { savedOption, saveOption } from './soil.js';

const BASE = import.meta.env.BASE_URL;
const STYLE = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' };
const CZ_BOUNDS = [[12.09, 48.55], [18.86, 51.06]];

setWorkerUrl(workerUrl);
const settings = loadSettings();
initTheme(document.getElementById('theme'));

const state = {
  manifest: null,
  status: { state: 'missing' },
  labels: [],
  layer: settings.layer,
  day: 0,
  point: null, // {lat, lng, inside, loading, error, cell, noData}
  stations: null,
};

// ---------- map ----------
const hash = parseHash();
const map = new MapLibreMap({
  container: 'map',
  style: isDark() ? STYLE.dark : STYLE.light,
  bounds: CZ_BOUNDS,
  fitBoundsOptions: { padding: { top: 20, bottom: 20, left: 20, right: 20 } },
  maxBounds: [[8.5, 46.5], [22.5, 53]],
  attributionControl: { compact: true },
  dragRotate: false,
  pitchWithRotate: false,
});
map.touchZoomRotate.disableRotation();
map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

let cz = null;
const czReady = fetch(`${BASE}cz.geojson`)
  .then((r) => r.json())
  .then((g) => (cz = g.features[0].geometry));
const manifestReady = loadManifest(BASE).then((m) => {
  state.manifest = m;
  state.status = manifestStatus(m);
  if (state.status.hasData) {
    state.labels = dayLabels(m.days);
    if (!m.maps?.layers?.some((l) => l.id === state.layer)) state.layer = m.maps?.layers?.[0]?.id ?? null;
    if (hash.l && m.maps?.layers?.some((l) => l.id === hash.l)) state.layer = hash.l;
    if (hash.d !== undefined && hash.d >= 0 && hash.d < m.days.length) state.day = hash.d;
  }
  return m;
});
const stationsReady = manifestReady.then(async (m) => {
  if (!m?.stations) return null;
  try {
    const r = await fetch(`${BASE}data/${m.stations}`);
    state.stations = r.ok ? await r.json() : null;
  } catch {
    state.stations = null;
  }
  return state.stations;
});

// Data goes under every line/symbol layer of the basemap (waterways, roads, boundaries, labels).
function firstLineOrSymbol() {
  return map.getStyle().layers.find((l) => l.type === 'line' || l.type === 'symbol')?.id;
}

// Relief, then water redrawn on top of the (opaque) data image so rivers and lakes stay visible.
function addRelief(dark, before) {
  if (!map.getSource('relief')) {
    map.addSource('relief', {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 14,
      attribution: '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Terrain: Mapzen / AWS Terrain Tiles</a>',
    });
  }
  map.addLayer({
    id: 'hillshade',
    type: 'hillshade',
    source: 'relief',
    paint: dark
      ? { 'hillshade-exaggeration': 0.42, 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': '#8a96a0', 'hillshade-accent-color': '#000000', 'hillshade-illumination-direction': 315 }
      : { 'hillshade-exaggeration': 0.4, 'hillshade-shadow-color': '#2a2f3a', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#2a2f3a', 'hillshade-illumination-direction': 315 },
  }, before);
  if (map.getSource('openmaptiles')) {
    map.addLayer({ id: 'water-top', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': dark ? '#1d3f5c' : '#a9cbe6', 'fill-outline-color': dark ? '#4f86b0' : '#6fa4cc' } }, before);
    map.addLayer({ id: 'waterway-top', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', paint: { 'line-color': dark ? '#4f93c8' : '#5b9bd0', 'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 6, 0.5, 10, 1.4, 14, 3] } }, before);
  }
}

function layerDef() {
  return state.manifest?.maps?.layers?.find((l) => l.id === state.layer) ?? null;
}

function imageUrl() {
  const L = layerDef();
  return L ? `${BASE}data/${L.url.replace('{d}', state.day)}` : null;
}

function imageCoords() {
  const [[w, s], [e, n]] = state.manifest.maps.bounds;
  return [[w, n], [e, n], [e, s], [w, s]];
}

// Czech place names where OpenStreetMap has them.
const LABEL_MINZOOM = { label_village: 10, place_village: 10, label_other: 11, place_other: 11, place_suburb: 12 };
function czechLabels() {
  for (const l of map.getStyle().layers) {
    if (LABEL_MINZOOM[l.id]) map.setLayerZoomRange(l.id, LABEL_MINZOOM[l.id], 24);
    if (l.type !== 'symbol' || !l.layout?.['text-field']) continue;
    const tf = JSON.stringify(l.layout['text-field']);
    if (tf.includes('name')) map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:cs'], ['get', 'name']]);
    // Labels must stay readable on top of the coloured data layer: strong halo in both themes.
    const dark = isDark();
    map.setPaintProperty(l.id, 'text-color', dark ? '#f4f1ea' : '#1c1a17');
    map.setPaintProperty(l.id, 'text-halo-color', dark ? 'rgba(14,13,12,0.92)' : 'rgba(255,255,255,0.95)');
    map.setPaintProperty(l.id, 'text-halo-width', 1.6);
  }
}

async function addOverlays() {
  czechLabels();
  await Promise.all([czReady, manifestReady]);
  const dark = isDark();
  const before = firstLineOrSymbol();
  if (!map.getLayer('hillshade')) addRelief(dark, before);
  if (state.status.hasData && imageUrl() && !map.getSource('soil')) {
    map.addSource('soil', { type: 'image', url: imageUrl(), coordinates: imageCoords() });
    map.addLayer({ id: 'soil', type: 'raster', source: 'soil', paint: { 'raster-opacity': dark ? 0.82 : 0.88, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, 'hillshade');
  }
  if (!map.getSource('cz')) {
    map.addSource('cz', { type: 'geojson', data: { type: 'Feature', geometry: cz, properties: {} } });
    map.addLayer({ id: 'cz-line', type: 'line', source: 'cz', paint: { 'line-color': dark ? '#d3e6ee' : '#2b4a5c', 'line-width': 1.4, 'line-opacity': 0.8 } });
  }
  const st = await stationsReady;
  if (st && !map.getSource('stations')) {
    map.addSource('stations', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: st.stations.map((s) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: { name: s.name, wsi: s.wsi } })) },
    });
    map.addLayer({ id: 'stations', type: 'circle', source: 'stations', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4.5, 10, 7], 'circle-color': dark ? '#151412' : '#ffffff', 'circle-stroke-color': dark ? '#d3e6ee' : '#1f1c18', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'stations-label', type: 'symbol', source: 'stations', minzoom: 7.5, layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': dark ? '#ece7df' : '#1f1c18', 'text-halo-color': dark ? '#151412' : '#ffffff', 'text-halo-width': 1.4 } });
  }
  setStationsVisible(loadSettings().stations);
}

function setStationsVisible(on) {
  for (const id of ['stations', 'stations-label']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
}

map.on('style.load', addOverlays);
// A map image that is missing or half-written (e.g. while the engine publishes a new cycle) makes the browser
// throw "The source image could not be decoded". Retry a couple of times instead of leaving the layer blank.
let imageRetries = 0;
map.on('error', (e) => {
  const msg = String(e.error?.message ?? e.error ?? '');
  if (e.sourceId === 'soil' || /could not be decoded/i.test(msg)) {
    if (imageRetries++ < 3) setTimeout(updateImage, 2000 * imageRetries);
    else console.warn('SoilCast: map image could not be loaded', msg);
    return;
  }
  console.error(e.error ?? e);
});
onThemeChange((dark) => {
  map.setStyle(dark ? STYLE.dark : STYLE.light, { diff: false });
});

map.on('mouseenter', 'stations', () => (map.getCanvas().style.cursor = 'pointer'));
map.on('mouseleave', 'stations', () => (map.getCanvas().style.cursor = ''));

map.on('click', (e) => {
  const hit = map.getLayer('stations') ? map.queryRenderedFeatures(e.point, { layers: ['stations'] }) : [];
  if (hit.length) {
    const [lng, lat] = hit[0].geometry.coordinates;
    openPoint(lat, lng);
  } else {
    openPoint(e.lngLat.lat, e.lngLat.lng);
  }
});

// ---------- controls ----------
const layersEl = document.getElementById('layers');
const daysEl = document.getElementById('days');
const legendEl = document.getElementById('legend');
const stationsEl = document.getElementById('stations');

function renderControls() {
  const m = state.manifest;
  const controls = document.getElementById('controls');
  controls.hidden = !state.status.hasData;
  if (!state.status.hasData) return;
  layersEl.innerHTML = m.maps.layers
    .map((L) => `<button type="button" role="radio" aria-checked="${L.id === state.layer}" data-layer="${L.id}">${shortLayerName(L.name)}</button>`)
    .join('');
  daysEl.innerHTML = state.labels
    .map((d, k) => `<button type="button" role="radio" aria-checked="${k === state.day}" data-day="${k}" title="${d.long}"><span>${d.rel ?? d.weekday}</span><b>${d.dm}</b></button>`)
    .join('');
  renderLegend();
}

function shortLayerName(name) {
  return name.replace('Teplota půdy', 'Teplota').replace('Vlhkost', 'Vlhkost');
}

function renderLegend() {
  const L = layerDef();
  if (!L?.legend?.stops?.length) {
    legendEl.innerHTML = '';
    return;
  }
  const stops = L.legend.stops;
  const lo = stops[0][0];
  const hi = stops.at(-1)[0];
  const pos = (v) => ((v - lo) / (hi - lo)) * 100;
  const grad = stops.map(([v, c]) => `${c} ${pos(v).toFixed(1)}%`).join(', ');
  // Label stops that are at least 9 % of the bar apart; always keep the ends.
  const kept = [];
  stops.forEach(([v], k) => {
    const last = k === stops.length - 1;
    if (last) {
      while (kept.length && pos(v) - pos(kept.at(-1)) < 9) kept.pop();
      kept.push(v);
    } else if (!kept.length || pos(v) - pos(kept.at(-1)) >= 9) kept.push(v);
  });
  const marks = kept
    .map((v) => {
      let text = String(v).replace('-', '−');
      if (L.unit === '% VVK' && v === 100) text = 'PK';
      if (L.id === 'frost' && v === hi) text = `${v}+`;
      return `<span style="left:${pos(v)}%">${text}</span>`;
    })
    .join('');
  const note = L.unit === '% VVK' ? '<p class="legend-note">% využitelné vodní kapacity; nad 100 = nad polní kapacitou (přemokřeno)</p>' : L.id === 'frost' ? '<p class="legend-note">hloubka promrznutí; průhledné = nepromrzlé</p>' : '';
  legendEl.innerHTML = `<div class="legend-head"><span>${L.name}</span><span class="muted">${L.unit}</span></div><div class="legend-bar${L.id === 'frost' ? ' checker' : ''}" style="background:linear-gradient(to right, ${grad})"></div><div class="legend-marks">${marks}</div>${note}`;
}

layersEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-layer]');
  if (!b) return;
  state.layer = b.dataset.layer;
  imageRetries = 0;
  saveSettings({ layer: state.layer });
  updateImage();
  renderControls();
  writeHash();
});

daysEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-day]');
  if (b) setDay(Number(b.dataset.day));
});

function setDay(d) {
  const n = state.manifest?.days?.length ?? 1;
  state.day = Math.max(0, Math.min(n - 1, d));
  imageRetries = 0;
  updateImage();
  renderControls();
  drawPanel();
  writeHash();
}

function updateImage() {
  const src = map.getSource('soil');
  if (src && imageUrl()) src.updateImage({ url: imageUrl(), coordinates: imageCoords() });
}

stationsEl.checked = settings.stations;
stationsEl.addEventListener('change', () => {
  saveSettings({ stations: stationsEl.checked });
  setStationsVisible(stationsEl.checked);
});

const locateBtn = document.getElementById('locate');
if (!('geolocation' in navigator)) locateBtn.hidden = true;
locateBtn.addEventListener('click', () => {
  locateBtn.disabled = true;
  locateBtn.textContent = 'Hledám…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locateBtn.disabled = false;
      locateBtn.textContent = 'Moje poloha';
      openPoint(pos.coords.latitude, pos.coords.longitude, { fly: true });
    },
    () => {
      locateBtn.disabled = false;
      locateBtn.textContent = 'Poloha nedostupná';
      setTimeout(() => (locateBtn.textContent = 'Moje poloha'), 3000);
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
  );
});

// ---------- status ----------
function renderStatus() {
  const el = document.getElementById('status');
  const s = state.status;
  const time = (t) => new Date(t).toLocaleString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' });
  const date = (d) => {
    const [, m, dd] = d.split('-').map(Number);
    return `${dd}. ${m}.`;
  };
  el.className = `status ${s.state}`;
  if (s.state === 'missing' || s.state === 'preview' || !s.hasData) {
    el.innerHTML = '<span class="dot"></span>Ve vývoji: předpověď zatím nevychází. Mapa ukazuje jen hranice Česka.';
    return;
  }
  const parts = [
    `<strong>Platné k ${time(s.analysisTime)}</strong>`,
    s.lastSsm ? `satelit do ${date(s.lastSsm)}` : 'bez družicové opravy',
    s.generated ? `přepočteno ${ageText((Date.now() - Date.parse(s.generated)) / 3_600_000)}` : null,
  ].filter(Boolean);
  const warn = s.state === 'stale' && !s.test ? '<span class="warnword">Data jsou starší než obvykle.</span><span class="sep"></span>' : '';
  const synth = s.synthetic ? '<span class="tag">Ukázková data</span>' : s.test ? '<span class="tag">Testovací verze – data nejsou ověřená</span>' : '';
  el.innerHTML = `<span class="dot"></span>${synth}${warn}${parts.join('<span class="sep">·</span>')}`;
}

// ---------- point ----------
const panel = document.getElementById('panel');
const hint = document.getElementById('hint');
let marker = null;

const optCache = new Map();
/** Soil/cover options for a block (opts/{br}_{bc}.json); null when the block has none. */
function loadOptions(br, bc) {
  const tpl = state.manifest?.opts?.url;
  if (!tpl) return Promise.resolve(null);
  const url = `${BASE}data/${tpl.replace('{br}', br).replace('{bc}', bc)}`;
  if (!optCache.has(url)) {
    optCache.set(
      url,
      fetch(url)
        .then(async (res) => {
          if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return null;
          const j = await res.json();
          return Array.isArray(j.options) ? j.options : null;
        })
        .catch(() => null),
    );
  }
  return optCache.get(url);
}

async function openPoint(lat, lng, { fly = false, opt = null } = {}) {
  resetPanelState();
  await Promise.all([czReady, manifestReady]);
  hint.hidden = true;
  if (!marker) {
    const el = document.createElement('div');
    el.className = 'pin';
    marker = new Marker({ element: el, anchor: 'bottom' });
  }
  marker.setLngLat([lng, lat]).addTo(map);
  if (fly) map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 10) });
  const inside = insideGeometry([lng, lat], cz);
  state.point = { lat, lng, inside, loading: inside && state.status.hasData, cell: null };
  drawPanel();
  writeHash();
  if (!inside || !state.status.hasData) return;
  const token = state.point;
  try {
    const m = state.manifest;
    const c = gridCell(m.grid, lng, lat);
    const block = c ? await loadBlock(BASE, m, c.br, c.bc) : null;
    const cell = block ? block.cell(c.i) : null;
    if (state.point !== token) return;
    state.point = { ...token, loading: false, cell: cell && cell.static.land ? cell : null, noData: !cell || !cell.static.land };
    if (state.point.cell) {
      const pt = state.point;
      pt.optId = opt ?? savedOption(lat, lng);
      pt.options = { status: 'loading' };
      loadOptions(c.br, c.bc).then((list) => {
        if (state.point !== pt) return;
        pt.options = list ? { status: 'ready', list } : { status: 'none', list: [] };
        if (pt.optId && !list?.some((o) => o.id === pt.optId)) pt.optId = null;
        writeHash();
        drawPanel();
      });
    }
  } catch (err) {
    if (state.point !== token) return;
    state.point = { ...token, loading: false, error: String(err.message ?? err) };
  }
  await stationsReady;
  if (state.point.lat === lat && state.point.lng === lng) drawPanel();
}

function closePanel() {
  panel.hidden = true;
  document.body.classList.remove('has-panel');
  state.point = null;
  marker?.remove();
  writeHash();
}

function drawPanel() {
  if (!state.point) return;
  panel.hidden = false;
  document.body.classList.add('has-panel');
  renderPanel(panel, state);
}

panelEvents(panel, {
  close: closePanel,
  setDay,
  redraw: drawPanel,
  setOption(id) {
    const P = state.point;
    if (!P) return;
    P.optId = id;
    saveOption(P.lat, P.lng, id);
    writeHash();
    drawPanel();
  },
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !panel.hidden) closePanel();
  if (e.target.closest?.('input, select, textarea')) return;
  if (e.key === 'ArrowRight' && state.status.hasData) setDay(state.day + 1);
  if (e.key === 'ArrowLeft' && state.status.hasData) setDay(state.day - 1);
});

// ---------- URL hash: #p=lat,lng&l=layer&d=day ----------
function parseHash() {
  const out = {};
  const q = new URLSearchParams(location.hash.slice(1));
  const p = q.get('p')?.split(',').map(Number);
  if (p?.length === 2 && p.every(Number.isFinite)) out.p = p;
  if (q.get('l')) out.l = q.get('l');
  if (q.get('d') !== null && /^\d$/.test(q.get('d'))) out.d = Number(q.get('d'));
  if (/^[\w-]{1,12}$/.test(q.get('o') ?? '')) out.o = q.get('o');
  return out;
}

function writeHash() {
  const q = new URLSearchParams();
  if (state.point) q.set('p', `${state.point.lat.toFixed(4)},${state.point.lng.toFixed(4)}`);
  if (state.layer) q.set('l', state.layer);
  if (state.day) q.set('d', state.day);
  if (state.point?.optId) q.set('o', state.point.optId);
  history.replaceState(null, '', `${location.pathname}${location.search}#${q.toString().replace(/%2C/g, ',')}`);
}

// ---------- start ----------
manifestReady.then(() => {
  renderStatus();
  renderControls();
  setInterval(renderStatus, 60_000);
  if (hash.p) openPoint(hash.p[0], hash.p[1], { fly: true, opt: hash.o ?? null });
});
