import './style.css';
import { initTheme } from './theme.js';
import { loadManifest } from './manifest.js';
import { seriesChart, attachTooltips } from './charts.js';
import { fmtNum } from './cards.js';

initTheme(document.getElementById('theme'));
const BASE = import.meta.env.BASE_URL;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('-', '−'));
const lc = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : '');
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
  const hold = s.holdout?.analysis;
  const bname = s.baseline?.name ?? 'srovnávací odhad';
  const z0 = depths[0];
  const a5 = s.analysis[z0];
  const tiles = `<div class="statgrid">
    <div class="stat"><span class="tl">SoilCast: průměrná chyba v ${z0} cm</span><span class="tv">${fmt2(a5?.mae)}<small> ${unit}</small></span></div>
    ${base ? `<div class="stat"><span class="tl" title="${esc(bname)}">Srovnávací odhad: průměrná chyba v ${z0} cm</span><span class="tv">${fmt2(base[z0]?.mae)}<small> ${unit}</small></span></div>` : ''}
    <div class="stat"><span class="tl">Stanic ČHMÚ</span><span class="tv">${s.n_stations ?? '—'}</span></div>
    <div class="stat"><span class="tl">Období</span><span class="tv" style="font-size:1.05rem">${date(s.period?.from)} – ${date(s.period?.to)}</span></div>
  </div>`;

  // Plain-language reading of the numbers; wording stays neutral whichever way they point.
  const cmp = base ? depths.filter((z) => s.analysis[z] && base[z]) : [];
  const modelBetter = cmp.filter((z) => s.analysis[z].mae < base[z].mae);
  let summary = `V hloubce ${z0} cm se modelovaná teplota v průměru liší od měření o ${fmt2(a5?.mae)} ${unit}.`;
  if (a5?.bias != null && Math.abs(a5.bias) >= 0.1) summary += ` Model je v průměru o ${fmt2(Math.abs(a5.bias))} ${unit} ${a5.bias > 0 ? 'teplejší' : 'chladnější'} než měření.`;
  if (cmp.length) {
    if (modelBetter.length === 0) summary += ` V tomto srovnání je ${lc(bname)} zatím přesnější ve všech hloubkách (v ${z0} cm ${fmt2(base[z0].mae)} ${unit}). Model je ve vývoji a dál ho ladíme.`;
    else if (modelBetter.length === cmp.length) summary += ` Ve všech hloubkách je SoilCast přesnější než ${lc(bname)}.`;
    else summary += ` SoilCast je přesnější než ${lc(bname)} v hloubkách ${modelBetter.join(', ')} cm, v ostatních je přesnější ${lc(bname)}.`;
  }
  if (hold?.[z0]) summary += ` Na ${s.holdout.n_stations} stanicích vyčleněných pro nezávislé ověření je chyba v ${z0} cm ${fmt2(hold[z0].mae)} ${unit}.`;

  const lower = (a, b) => (a != null && b != null && a < b ? ' class="better"' : '');
  const rows = depths
    .map((z) => {
      const m = s.analysis[z] ?? {};
      const b = base?.[z];
      const h = hold?.[z];
      return `<tr><td>${z} cm</td><td${lower(m.mae, b?.mae)}>${fmt2(m.mae)}</td><td>${fmt2(m.bias)}</td><td>${fmt2(m.rmse)}</td><td>${fmt2(m.acc)}</td>${base ? `<td${lower(b?.mae, m.mae)}>${fmt2(b?.mae)}</td>` : ''}${hold ? `<td>${fmt2(h?.mae)}</td>` : ''}<td>${m.n?.toLocaleString('cs-CZ') ?? '—'}</td></tr>`;
    })
    .join('');
  const table = `<div class="tablewrap"><table class="metrics">
    <thead><tr><th>Hloubka</th><th>Průměrná chyba</th><th>Systematická chyba</th><th>RMSE</th><th>Korelace odchylek</th>${base ? `<th title="${esc(bname)}">Srovnávací odhad: průměrná chyba</th>` : ''}${hold ? '<th>Nezávislé stanice: průměrná chyba</th>' : ''}<th>Počet dní × stanic</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="fine">Analýza proti měření, chyby v ${unit}.${base ? ` Srovnávací odhad: ${lc(bname)}. Tučně je ten z obou odhadů, který se měření blíží víc.` : ''}${hold ? ` „Nezávislé stanice“: ${s.holdout.n_stations} stanic vyčleněných pro ověření.` : ''}</p>`;
  let lead = '';
  const leads = s.forecast ? Object.keys(s.forecast).map(Number).sort((a, b) => a - b) : [];
  if (leads.length) {
    const head = ['teď', ...leads.map((L) => `+${L} ${L === 1 ? 'den' : L < 5 ? 'dny' : 'dní'}`)];
    const all = depths.flatMap((z) => [s.analysis[z]?.mae, ...leads.map((L) => s.forecast[L]?.[z]?.mae)]).filter((v) => v != null);
    const max = Math.max(...all);
    const cell = (v) => (v == null ? '<td>—</td>' : `<td><span class="heat" style="--w:${((v / max) * 100).toFixed(0)}%">${fmt2(v)}</span></td>`);
    const rows2 = depths.map((z) => `<tr><td>${z} cm</td>${cell(s.analysis[z]?.mae)}${leads.map((L) => cell(s.forecast[L]?.[z]?.mae)).join('')}</tr>`).join('');
    lead = `<h2>Jak roste chyba s délkou předpovědi</h2>
      <p class="muted">Průměrná chyba v ${unit} podle toho, kolik dní dopředu předpověď platí.</p>
      <div class="tablewrap"><table class="metrics lead"><thead><tr><th>Hloubka</th>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows2}</tbody></table></div>`;
  }
  el.innerHTML = `${tiles}<h2>Co z toho plyne</h2><p class="summary">${summary}</p><h2>Celkově</h2>${table}${lead}`;
}

function renderStations(data) {
  const el = document.getElementById('stations');
  if (!data?.stations?.length) {
    el.innerHTML = '<p class="muted">Data stanic zatím nejsou k dispozici.</p>';
    return;
  }
  const today = manifest?.days?.[0] ?? '9999';
  const hasForecast = data.stations.some((st) => Object.values(st.series.model).some((arr) => arr.some((v, k) => v !== null && st.series.time[k] > today)));
  document.getElementById('stations-note').textContent = hasForecast
    ? 'Denní průměry za posledních 30 dní a předpověď na další dny. Vyberte hloubku.'
    : 'Denní průměry za posledních 30 dní. Vyberte hloubku.';
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
  let meas = s.series.measured[depth] ?? [];
  let model = s.series.model[depth] ?? [];
  let time = s.series.time;
  // Cut the empty tail: when the model has no forecast values the chart ends with the last measurement.
  const lastData = Math.max(meas.findLastIndex((v) => v !== null), model.findLastIndex((v) => v !== null));
  const end = lastData + 1 || time.length;
  meas = meas.slice(0, end);
  model = model.slice(0, end);
  time = time.slice(0, end);
  const split = meas.findLastIndex((v) => v !== null) + 1;
  const hasFc = split < end;
  const sk = s.skill?.[depth];
  card.innerHTML = `<h3>${esc(s.name)}</h3>
    <p class="fine">${fmtNum(s.lat, 3)}° s. š. · ${fmtNum(s.lon, 3)}° v. d. · ${s.elev} m n. m.</p>
    <div class="depthsel" role="group" aria-label="Hloubka">${s.depths.map((z) => `<button type="button" data-depth="${z}" aria-pressed="${z === depth}">${z} cm</button>`).join('')}</div>
    <div class="legend2"><span><i class="k meas"></i>měřeno ČHMÚ</span><span><i class="k model"></i>SoilCast</span><span class="u">°C</span></div>
    ${seriesChart({ time, split: hasFc ? split : null, unit: '°C', title: `${s.name}, ${depth} cm: model a měření`, series: [{ name: 'měřeno', values: meas, cls: 'meas' }, { name: 'model', values: model, cls: 'model' }] })}
    ${sk ? `<p class="fine">Průměrná chyba <b>${fmt2(sk.mae)} °C</b> · systematická ${fmt2(sk.bias)} °C · ${sk.n.toLocaleString('cs-CZ')} dní</p>` : ''}`;
}
