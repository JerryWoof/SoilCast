import './style.css';
import { initTheme } from './theme.js';
import { loadManifest } from './manifest.js';
import { seriesChart, attachTooltips } from './charts.js';
import { fmtNum } from './cards.js';

initTheme(document.getElementById('theme'));
const BASE = import.meta.env.BASE_URL;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const date = (s) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return `${d}. ${m}. ${y}`;
};

async function getJson(url) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const manifest = await loadManifest(BASE);
const [skill, stations] = await Promise.all([
  manifest?.skill ? getJson(`${BASE}data/${manifest.skill}`) : null,
  manifest?.stations ? getJson(`${BASE}data/${manifest.stations}`) : null,
]);

renderOverall(skill);
renderStations(stations);
attachTooltips(document.body);

function renderOverall(s) {
  const el = document.getElementById('overall');
  if (!s?.analysis) {
    el.innerHTML = '<p class="notice">Ověření zatím není k dispozici. Zveřejníme ho, jakmile model poběží dost dlouho.</p>';
    return;
  }
  const depths = s.depths ?? Object.keys(s.analysis).map(Number);
  const unit = s.unit ?? '°C';
  const base = s.baseline?.analysis;
  const a5 = s.analysis[depths[0]];
  const tiles = `<div class="statgrid">
    <div class="stat"><span class="tl">Průměrná chyba v ${depths[0]} cm</span><span class="tv">${fmtNum(a5?.mae, 2)}<small> ${unit}</small></span></div>
    <div class="stat"><span class="tl">Stanic ČHMÚ</span><span class="tv">${s.n_stations ?? '—'}</span></div>
    <div class="stat"><span class="tl">Období</span><span class="tv" style="font-size:1.05rem">${date(s.period?.from)} – ${date(s.period?.to)}</span></div>
    ${base ? `<div class="stat"><span class="tl">${esc(s.baseline.name)} v ${depths[0]} cm</span><span class="tv">${fmtNum(base[depths[0]]?.mae, 2)}<small> ${unit}</small></span></div>` : ''}
  </div>`;
  const rows = depths
    .map((z) => {
      const m = s.analysis[z] ?? {};
      const b = base?.[z];
      return `<tr><td>${z} cm</td><td class="${b && m.mae < b.mae ? 'better' : ''}">${fmtNum(m.mae, 2)}</td><td>${fmtNum(m.bias, 2)}</td><td>${fmtNum(m.rmse, 2)}</td><td>${fmtNum(m.acc, 2)}</td>${base ? `<td>${fmtNum(b?.mae, 2)}</td>` : ''}<td>${m.n?.toLocaleString('cs-CZ') ?? '—'}</td></tr>`;
    })
    .join('');
  const table = `<div class="tablewrap"><table class="metrics">
    <thead><tr><th>Hloubka</th><th>Průměrná chyba</th><th>Systematická</th><th>RMSE</th><th>Korelace odchylek</th>${base ? `<th>${esc(s.baseline.name)}: průměrná chyba</th>` : ''}<th>Počet dní × stanic</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="fine">Analýza (stav k dnešku) proti měření, v ${unit}.${base ? ` Zeleně tam, kde je SoilCast přesnější než ${esc(s.baseline.name)}.` : ''}</p>`;
  let lead = '';
  const leads = s.forecast ? Object.keys(s.forecast).map(Number).sort((a, b) => a - b) : [];
  if (leads.length) {
    const head = ['teď', ...leads.map((L) => `+${L} ${L === 1 ? 'den' : L < 5 ? 'dny' : 'dní'}`)];
    const all = depths.flatMap((z) => [s.analysis[z]?.mae, ...leads.map((L) => s.forecast[L]?.[z]?.mae)]).filter((v) => v != null);
    const max = Math.max(...all);
    const cell = (v) => (v == null ? '<td>—</td>' : `<td><span class="heat" style="--w:${((v / max) * 100).toFixed(0)}%">${fmtNum(v, 2)}</span></td>`);
    const rows2 = depths.map((z) => `<tr><td>${z} cm</td>${cell(s.analysis[z]?.mae)}${leads.map((L) => cell(s.forecast[L]?.[z]?.mae)).join('')}</tr>`).join('');
    lead = `<h2>Jak roste chyba s délkou předpovědi</h2>
      <p class="muted">Průměrná chyba v ${unit} podle toho, kolik dní dopředu předpověď platí.</p>
      <div class="tablewrap"><table class="metrics lead"><thead><tr><th>Hloubka</th>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows2}</tbody></table></div>`;
  }
  el.innerHTML = `${tiles}<h2>Celkově</h2>${table}${lead}`;
}

function renderStations(data) {
  const el = document.getElementById('stations');
  if (!data?.stations?.length) {
    el.innerHTML = '<p class="muted">Data stanic zatím nejsou k dispozici.</p>';
    return;
  }
  el.innerHTML = data.stations.map((s, k) => `<article class="scard" id="${esc(s.wsi)}" data-k="${k}"></article>`).join('');
  data.stations.forEach((s, k) => drawStation(el.querySelector(`[data-k="${k}"]`), s, s.depths.includes(5) ? 5 : s.depths[0]));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-depth]');
    if (!b) return;
    const card = b.closest('.scard');
    drawStation(card, data.stations[Number(card.dataset.k)], Number(b.dataset.depth));
  });
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}

function drawStation(card, s, depth) {
  const meas = s.series.measured[depth] ?? [];
  const model = s.series.model[depth] ?? [];
  const split = meas.findLastIndex((v) => v !== null) + 1;
  const sk = s.skill?.[depth];
  card.innerHTML = `<h3>${esc(s.name)}</h3>
    <p class="fine">${fmtNum(s.lat, 3)}° s. š. · ${fmtNum(s.lon, 3)}° v. d. · ${s.elev} m n. m.</p>
    <div class="depthsel" role="group" aria-label="Hloubka">${s.depths.map((z) => `<button type="button" data-depth="${z}" aria-pressed="${z === depth}">${z} cm</button>`).join('')}</div>
    <div class="legend2"><span><i class="k meas"></i>měřeno ČHMÚ</span><span><i class="k model"></i>SoilCast</span></div>
    ${seriesChart({ time: s.series.time, split, unit: '°C', title: `${s.name}, ${depth} cm: model a měření`, series: [{ name: 'měřeno', values: meas, cls: 'meas' }, { name: 'model', values: model, cls: 'model' }] })}
    ${sk ? `<p class="fine">Průměrná chyba <b>${fmtNum(sk.mae, 2)} °C</b> · systematická ${fmtNum(sk.bias, 2)} °C · ${sk.n} dní</p>` : ''}`;
}
