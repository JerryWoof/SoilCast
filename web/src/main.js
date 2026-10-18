import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import './style.css';
import { loadManifest, manifestStatus, insideGeometry } from './manifest.js';

const BASE = import.meta.env.BASE_URL;
// Depths the profile will show (cm). 150 and 200 form the lower-confidence deep section.
const DEPTHS = [2, 5, 10, 20, 30, 50, 75, 100];
const DEEP = [150, 200];

setWorkerUrl(workerUrl);

const map = new MapLibreMap({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/positron',
  bounds: [[12.0, 48.5], [18.9, 51.1]],
  fitBoundsOptions: { padding: 20 },
  maxBounds: [[9.5, 47.0], [21.5, 52.5]],
  attributionControl: { compact: true },
});
map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

let cz = null;
const czReady = fetch(`${BASE}cz.geojson`).then((r) => r.json()).then((g) => (cz = g.features[0].geometry));

map.on('load', async () => {
  await czReady;
  map.addSource('cz', { type: 'geojson', data: { type: 'Feature', geometry: cz, properties: {} } });
  map.addLayer({ id: 'cz-line', type: 'line', source: 'cz', paint: { 'line-color': '#7a5a2f', 'line-width': 1.5 } });
});

const panel = document.getElementById('panel');
let marker = null;

map.on('click', async (e) => {
  await czReady;
  const { lng, lat } = e.lngLat;
  const inside = insideGeometry([lng, lat], cz);
  if (!marker) marker = new Marker({ color: '#7a5a2f' });
  marker.setLngLat([lng, lat]).addTo(map);
  panel.hidden = false;
  panel.innerHTML = inside ? pointPanel(lat, lng) : outsidePanel();
  panel.querySelector('.close').addEventListener('click', () => {
    panel.hidden = true;
    marker.remove();
  });
});

function coords(lat, lng) {
  return `${lat.toFixed(4)}° s. š., ${lng.toFixed(4)}° v. d.`;
}

function pointPanel(lat, lng) {
  const rows = DEPTHS.map((d) => `<tr><th>${d} cm</th><td>—</td><td>—</td></tr>`).join('');
  const deep = DEEP.map((d) => `<tr><th>${d} cm</th><td>—</td><td>—</td></tr>`).join('');
  return `
    <button class="close" aria-label="Zavřít">×</button>
    <h2>Půda v tomto místě</h2>
    <p class="muted">${coords(lat, lng)}</p>
    <p class="notice">Zatím bez dat. Jako první spustíme teplotu půdy u stanic ČHMÚ, potom celou mapu a vlhkost.</p>
    <table class="profile">
      <thead><tr><th>Hloubka</th><th>Teplota</th><th>Vlhkost</th></tr></thead>
      <tbody>${rows}</tbody>
      <tbody class="deep"><tr><td colspan="3">Hluboká půda (nižší spolehlivost)</td></tr>${deep}</tbody>
    </table>`;
}

function outsidePanel() {
  return `
    <button class="close" aria-label="Zavřít">×</button>
    <h2>Mimo Česko</h2>
    <p>SoilCast počítá jen pro území Česka.</p>`;
}

async function showStatus() {
  const el = document.getElementById('status');
  const s = manifestStatus(await loadManifest(BASE));
  const fmt = (t) => new Date(t).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' });
  el.className = `status ${s.state}`;
  el.textContent = {
    missing: 'Ve vývoji: předpověď zatím nevychází.',
    preview: 'Ve vývoji: předpověď zatím nevychází. Spojení s výpočetním serverem funguje.',
    fresh: `Platné k ${s.analysisTime && fmt(s.analysisTime)}.`,
    stale: `Data jsou starší než obvykle (platné k ${s.analysisTime && fmt(s.analysisTime)}).`,
  }[s.state];
}
showStatus();
