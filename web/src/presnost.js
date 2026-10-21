import './style.css';
import { initTheme } from './theme.js';
import { loadManifest } from './manifest.js';
import { seriesChart, attachTooltips } from './charts.js';
import { loadSettings } from './settings.js';
import { BASELINE_EN } from './lang/data-en.js';
import { t, tp, getLang, initPage, fmtNum, fmtFixed, fmtInt, fmtDateFull } from './i18n.js';

initTheme(document.getElementById('theme'));
initPage();
const BASE = import.meta.env.BASE_URL;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt2 = (v) => fmtFixed(v, 2);
const lc = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');
// The baseline name comes from the data (Czech); the generic one is translated.
const baselineName = (n) => (!n ? t('acc.baseline') : getLang() === 'en' ? BASELINE_EN[n] ?? n : n);
const date = fmtDateFull;
// Plain-language hover/focus/tap explanation (a 'tip.*' key), shown by attachTooltips.
const term = (k, label) => `<span class="term" tabindex="0" data-tip="${esc(t(k))}">${label}</span>`;

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
await renderStations(stations);
attachTooltips(document.body);

function renderOverall(s) {
  const el = document.getElementById('overall');
  if (!s?.analysis) {
    el.innerHTML = `<p class="notice">${t('acc.none')}</p>`;
    return;
  }
  const depths = s.depths ?? Object.keys(s.analysis).map(Number);
  const unit = s.unit ?? '°C';
  const base = s.baseline?.analysis;
  const hold = s.holdout?.analysis;
  const bname = baselineName(s.baseline?.name);
  const z0 = depths[0];
  const a5 = s.analysis[z0];
  const tiles = `<div class="statgrid">
    <div class="stat"><span class="tl">${term('tip.mae', t('acc.tile.mae', { z: z0 }))}</span><span class="tv">${fmt2(a5?.mae)}<small> ${unit}</small></span></div>
    ${base ? `<div class="stat"><span class="tl">${term('tip.base', t('acc.tile.base', { z: z0 }))}</span><span class="tv">${fmt2(base[z0]?.mae)}<small> ${unit}</small></span></div>` : ''}
    <div class="stat"><span class="tl">${term('tip.tile.n', t('acc.tile.n'))}</span><span class="tv">${s.n_stations ?? '—'}</span></div>
    <div class="stat"><span class="tl">${term('tip.tile.period', t('acc.tile.period'))}</span><span class="tv" style="font-size:1.05rem">${date(s.period?.from)} – ${date(s.period?.to)}</span></div>
  </div>`;

  // Plain-language reading of the numbers; wording stays neutral whichever way they point.
  const cmp = base ? depths.filter((z) => s.analysis[z] && base[z]) : [];
  const modelBetter = cmp.filter((z) => s.analysis[z].mae < base[z].mae);
  let summary = t('acc.sum.1', { z: z0, mae: fmt2(a5?.mae), unit });
  if (a5?.bias != null && Math.abs(a5.bias) >= 0.1) summary += t('acc.sum.bias', { b: fmt2(Math.abs(a5.bias)), unit, dir: t(a5.bias > 0 ? 'acc.warmer' : 'acc.colder') });
  if (cmp.length) {
    if (modelBetter.length === 0) summary += t('acc.sum.baseBetter', { name: lc(bname), z: z0, v: fmt2(base[z0].mae), unit });
    else if (modelBetter.length === cmp.length) summary += t('acc.sum.modelBetter', { name: lc(bname) });
    else summary += t('acc.sum.mixed', { name: lc(bname), zs: modelBetter.join(', ') });
  }
  if (hold?.[z0]) summary += t('acc.sum.hold', { hold: term('tip.hold', t('acc.hold.sum')), n: s.holdout.n_stations, z: z0, v: fmt2(hold[z0].mae), unit });

  const lower = (a, b) => (a != null && b != null && a < b ? ' class="better"' : '');
  const rows = depths
    .map((z) => {
      const m = s.analysis[z] ?? {};
      const b = base?.[z];
      const h = hold?.[z];
      return `<tr><td>${z} cm</td><td${lower(m.mae, b?.mae)}>${fmt2(m.mae)}</td><td>${fmt2(m.bias)}</td><td>${fmt2(m.rmse)}</td><td>${fmt2(m.acc)}</td>${base ? `<td${lower(b?.mae, m.mae)}>${fmt2(b?.mae)}</td>` : ''}${hold ? `<td>${fmt2(h?.mae)}</td>` : ''}<td>${fmtInt(m.n)}</td></tr>`;
    })
    .join('');
  const table = `<div class="tablewrap"><table class="metrics">
    <thead><tr><th>${term('tip.depth', t('acc.th.depth'))}</th><th>${term('tip.mae', t('acc.th.mae'))}</th><th>${term('tip.bias', t('acc.th.bias'))}</th><th>${term('tip.rmse', t('acc.th.rmse'))}</th><th>${term('tip.corr', t('acc.th.corr'))}</th>${base ? `<th>${term('tip.base', t('acc.th.base'))}</th>` : ''}${hold ? `<th>${term('tip.hold', t('acc.th.hold'))}</th>` : ''}<th>${term('tip.n', t('acc.th.n'))}</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="fine">${t('acc.tfine', { unit, analysis: term('tip.analysis', t('acc.analysis')) })}${base ? t('acc.tfine.base', { base: term('tip.base', t('acc.d.base')), name: lc(bname) }) : ''}${hold ? t('acc.tfine.hold', { hold: term('tip.hold', t('acc.hold.name')), n: s.holdout.n_stations }) : ''}</p>`;
  let lead = '';
  const leads = s.forecast ? Object.keys(s.forecast).map(Number).sort((a, b) => a - b) : [];
  if (leads.length) {
    const head = [term('tip.now', t('acc.lead.now')), ...leads.map((L) => term('tip.lead', tp('lead.days', L)))];
    const all = depths.flatMap((z) => [s.analysis[z]?.mae, ...leads.map((L) => s.forecast[L]?.[z]?.mae)]).filter((v) => v != null);
    const max = Math.max(...all);
    const cell = (v) => (v == null ? '<td>—</td>' : `<td><span class="heat" style="--w:${((v / max) * 100).toFixed(0)}%">${fmt2(v)}</span></td>`);
    const rows2 = depths.map((z) => `<tr><td>${z} cm</td>${cell(s.analysis[z]?.mae)}${leads.map((L) => cell(s.forecast[L]?.[z]?.mae)).join('')}</tr>`).join('');
    lead = `<h2>${t('acc.lead.h')}</h2>
      <p class="muted">${t('acc.lead.p', { unit })}</p>
      <div class="tablewrap"><table class="metrics lead"><thead><tr><th>${term('tip.depth', t('acc.th.depth'))}</th>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows2}</tbody></table></div>`;
  }
  el.innerHTML = `${tiles}<h2>${t('acc.what')}</h2><p class="summary">${summary}</p><h2>${t('acc.overall')}</h2>${table}${lead}`;
}

async function renderStations(data) {
  const el = document.getElementById('stations');
  if (!data?.stations?.length) {
    el.innerHTML = `<p class="muted">${t('acc.nostations')}</p>`;
    return;
  }
  const today = manifest?.days?.[0] ?? '9999';
  const hasForecast = data.stations.some((st) => Object.values(st.series.model).some((arr) => arr.some((v, k) => v !== null && st.series.time[k] > today)));
  document.getElementById('stations-note').innerHTML = t(hasForecast ? 'acc.note.fc' : 'acc.note.nofc', {
    avg: term('tip.avg', t('acc.note.avg')),
    fc: term('tip.fc', t('acc.note.fcw')),
  });
  const list = data.stations
    .map((st, k) => ({ st, k }))
    .sort((x, y) => x.st.name.localeCompare(y.st.name, getLang() === 'en' ? 'en' : 'cs'));
  const hashWsi = decodeURIComponent(location.hash.slice(1));
  let cur = list.findIndex((x) => x.st.wsi === hashWsi);
  if (cur < 0) cur = nearestToLastPoint(list);
  if (cur < 0) {
    // Default: the best-measured station (most station-days at 5 cm).
    const n = (x) => x.st.skill?.[5]?.n ?? 0;
    cur = list.reduce((b, x, i) => (n(x) > n(list[b]) ? i : b), 0);
  }
  let depth = null;

  el.innerHTML = `<div class="stnmap-wrap"><svg class="stnmap" tabindex="0" role="application" aria-label="${esc(t('acc.map.aria'))}"></svg>
      <button type="button" class="locbtn" data-loc>${t('acc.loc')}</button></div>
    <article class="scard"></article>`;
  const card = el.querySelector('.scard');
  const mapEl = el.querySelector('.stnmap');
  const proj = await buildMap(mapEl, list);

  function show(i) {
    cur = (i + list.length) % list.length;
    const st = list[cur].st;
    if (!st.depths.includes(depth)) depth = st.depths.includes(5) ? 5 : st.depths[0];
    drawStation(card, st, depth);
    attachTooltips(card);
    proj.select(cur);
    try {
      history.replaceState(null, '', `#${encodeURIComponent(st.wsi)}`);
    } catch {
      /* ignore */
    }
  }
  mapEl.addEventListener('click', (e) => {
    const i = proj.nearest(e.clientX, e.clientY);
    if (i >= 0) show(i);
  });
  // Keyboard: arrows step through the stations in alphabetical order.
  mapEl.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!d) return;
    e.preventDefault();
    show(cur + d);
  });
  el.querySelector('[data-loc]').addEventListener('click', (ev) => {
    const b = ev.currentTarget;
    if (!navigator.geolocation) return;
    b.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        b.disabled = false;
        const i = nearestTo(list, pos.coords.latitude, pos.coords.longitude);
        if (i >= 0) show(i);
      },
      () => {
        b.disabled = false;
        b.textContent = t('acc.loc.fail');
      },
      { timeout: 8000, maximumAge: 600000 },
    );
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-depth]');
    if (!b) return;
    depth = Number(b.dataset.depth);
    drawStation(card, list[cur].st, depth);
    attachTooltips(card);
  });
  addEventListener('hashchange', () => {
    const i = list.findIndex((x) => x.st.wsi === decodeURIComponent(location.hash.slice(1)));
    if (i >= 0 && i !== cur) show(i);
  });
  show(cur);

  function nearestToLastPoint(arr) {
    const p = loadSettings().lastPoint;
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? nearestTo(arr, p.lat, p.lng) : -1;
  }
}

function nearestTo(arr, lat, lng) {
  const kx = Math.cos((lat * Math.PI) / 180);
  let best = -1;
  let bd = Infinity;
  arr.forEach((x, i) => {
    const d = (x.st.lat - lat) ** 2 + ((x.st.lon - lng) * kx) ** 2;
    if (d < bd) [bd, best] = [d, i];
  });
  return best;
}

// Small SVG map of Czechia with one dot per station; tapping picks the nearest dot (people rarely know station names).
async function buildMap(svg, list) {
  let ring = [];
  try {
    const gj = await (await fetch(`${BASE}cz.geojson`)).json();
    ring = gj.features[0].geometry.coordinates[0];
  } catch {
    /* outline is optional */
  }
  const pts = ring.length ? ring : list.map((x) => [x.st.lon, x.st.lat]);
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const kx = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const W = 400;
  const pad = 14;
  const sc = (W - 2 * pad) / ((x1 - x0) * kx);
  const H = Math.round((y1 - y0) * sc + 2 * pad);
  const X = (lon) => pad + (lon - x0) * kx * sc;
  const Y = (lat) => pad + (y1 - lat) * sc;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const outline = ring.length ? `<path class="cz" d="M${ring.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('L')}Z"/>` : '';
  svg.innerHTML = `${outline}${list.map((x, i) => `<circle class="dot" data-i="${i}" cx="${X(x.st.lon).toFixed(1)}" cy="${Y(x.st.lat).toFixed(1)}" r="3.2"/>`).join('')}<circle class="sel" r="7" hidden/><text class="lbl" hidden></text>`;
  const dots = svg.querySelectorAll('.dot');
  const sel = svg.querySelector('.sel');
  const lbl = svg.querySelector('.lbl');
  return {
    select(i) {
      dots.forEach((d, n) => d.classList.toggle('cur', n === i));
      const d = dots[i];
      const cx = Number(d.getAttribute('cx'));
      const cy = Number(d.getAttribute('cy'));
      sel.setAttribute('cx', cx);
      sel.setAttribute('cy', cy);
      sel.hidden = false;
      lbl.textContent = list[i].st.name;
      lbl.setAttribute('x', cx);
      lbl.setAttribute('y', cy < 30 ? cy + 20 : cy - 11);
      lbl.setAttribute('text-anchor', cx > W - 90 ? 'end' : cx < 90 ? 'start' : 'middle');
      lbl.hidden = false;
    },
    nearest(cx, cy) {
      const r = svg.getBoundingClientRect();
      const px = ((cx - r.left) / r.width) * W;
      const py = ((cy - r.top) / r.height) * H;
      let best = -1;
      let bd = Infinity;
      dots.forEach((d, n) => {
        const dd = (Number(d.getAttribute('cx')) - px) ** 2 + (Number(d.getAttribute('cy')) - py) ** 2;
        if (dd < bd) [bd, best] = [dd, n];
      });
      return bd < 28 ** 2 ? best : -1;
    },
  };
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
    <p class="fine">${t('coords', { lat: fmtNum(s.lat, 3), lng: fmtNum(s.lon, 3) })} · ${s.elev} ${t('elev')}</p>
    <div class="depthsel" role="group" aria-label="${t('acc.depth.aria')}">${s.depths.map((z) => `<button type="button" data-tip="${esc(t('tip.depthbtn'))}" data-depth="${z}" aria-pressed="${z === depth}">${z} cm</button>`).join('')}</div>
    <div class="legend2"><span><i class="k meas"></i>${t('st.legend.meas')}</span><span><i class="k model"></i>${t('st.legend.model')}</span><span class="u">°C</span></div>
    ${seriesChart({ time, split: hasFc ? split : null, unit: '°C', title: t('acc.card.title', { name: s.name, depth }), series: [{ name: t('st.meas'), values: meas, cls: 'meas' }, { name: t('st.model'), values: model, cls: 'model' }] })}
    ${sk ? `<p class="fine">${t('acc.card.skill', { maeL: term('tip.mae', t('acc.card.mae')), biasL: term('tip.bias', t('acc.card.bias')), daysL: term('tip.card.days', t('acc.card.days')), mae: fmt2(sk.mae), bias: fmt2(sk.bias), n: fmtInt(sk.n) })}</p>` : ''}`;
}
