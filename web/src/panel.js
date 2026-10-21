// The point panel: profile, 7-day charts and decision cards for one grid cell.

import './soilpit.css';
import { bandChart, barChart, soilPitChart, pitLegend, pitDetails, seriesChart, attachTooltips } from './charts.js';
import { soilOf, mapSoil, simulatedLine, applyOption, optionLabel, describeTexture, shareText, coverOption } from './soil.js';
import { t, tp, fmtPct, fmtInt } from './i18n.js';
import { eraEn } from './lang/data-en.js';
import { getLang } from './i18n.js';
import {
  CROPS, RAIN_DEFAULT, coverName, confName, textureOf, STATUS, FLAG, has, fmtNum, vvkWord,
  sowingDay, winter, trafficability, nConditions, irrigation, dayRain, rain48,
} from './cards.js';
import { loadSettings, saveSettings } from './settings.js';
import { formatBpej, krLine, calendarBan, typeShort, nTypes, krNames } from './bpej.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const deg = (v) => (v === null || v === undefined ? '—' : `${fmtNum(v)} °C`);
const pct = fmtPct;
const nvzUrl = () => t('nvz.url');
const ICON = { ok: '✓', border: '!', bad: '✕' };
// Which ">" sections are open, kept per visitor (storage can be missing or throw).
const OPEN_KEY = 'soilcast.panel.open.v1';
const openDetails = new Set(loadOpen());
function loadOpen() {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(OPEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function saveOpen() {
  try {
    globalThis.localStorage?.setItem(OPEN_KEY, JSON.stringify([...openDetails]));
  } catch {
    /* ignore */
  }
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function pill(status, text) {
  return `<span class="pill ${status}"><i aria-hidden="true">${ICON[status]}</i>${esc(text)}</span>`;
}

const CHEV = '<span class="chev" aria-hidden="true">›</span>';

/** A collapsed section: one summary row with a ">" that opens the body. */
function fold(id, title, body, hint = '', cls = '') {
  return `<details class="fold${cls ? ` ${cls}` : ''}" data-id="${id}">
    <summary><span class="ftitle">${title}</span>${hint ? `<span class="fhint">${hint}</span>` : ''}${CHEV}</summary>
    <div class="fbody">${body}</div>
  </details>`;
}

function coords(lat, lng) {
  return t('coords', { lat: fmtNum(lat, 4), lng: fmtNum(lng, 4) });
}

function header(state, extra = '') {
  const { lat, lng } = state.point;
  return `<div class="phead">
      <div><h2>${t('panel.title')}</h2><p class="coords">${coords(lat, lng)}${extra}</p></div>
      <button class="close" type="button" data-act="close" aria-label="${t('panel.close')}">×</button>
    </div>`;
}

function message(state, title, text) {
  return `${header(state)}<div class="pmsg"><h3>${esc(title)}</h3><p>${text}</p></div>`;
}

export function renderPanel(el, state) {
  const scroll = el.scrollTop;
  el.innerHTML = panelHtml(state);
  el.querySelectorAll('details[data-id]').forEach((d) => {
    if (openDetails.has(d.dataset.id)) d.open = true;
  });
  el.scrollTop = scroll;
}

function panelHtml(state) {
  const P = state.point;
  if (!P.inside) return message(state, t('panel.outside'), t('panel.outside.text'));
  if (!state.status.hasData)
    return message(state, t('panel.nodata.title'), t('panel.nodata.text'));
  if (P.loading) return `${header(state)}<div class="pmsg loading"><span class="spinner" aria-hidden="true"></span>${t('panel.loading')}</div>`;
  if (P.error) return message(state, t('panel.error.title'), `${t('panel.error.text')} <span class="muted">(${esc(P.error)})</span>`);
  if (P.water) {
    const w = P.water;
    const name = w.name ? `<p class="wname">${esc(w.name)}</p>` : '';
    return `${header(state)}<div class="pmsg water"><h3>${t('water.title')}</h3>${name}<p>${t('water.text')}</p></div>`;
  }
  if (P.noData) {
    const synth = state.status.synthetic ? ` ${t('panel.none.synth')}` : '';
    return message(state, t('panel.none.title'), `${t('panel.none.text')}${synth}`);
  }

  const anyData = P.cell.daily.t?.t5_min?.some((v) => v !== null && v !== undefined) || P.cell.daily.vvk?.['0-40']?.some((v) => v !== null && v !== undefined);
  if (!anyData) return message(state, t('panel.none.title'), t('panel.none.water'));

  const opt = selectedOption(P);
  const p = applyOption(P.cell, opt, state.manifest?.blocks?.format?.daily);
  const s = p.static;
  const d = state.day;
  const lab = state.labels[d];
  const settings = loadSettings();
  const elev = s.elev !== null ? ` · ${Math.round(s.elev)} ${t('elev')}` : '';
  const tex = textureOf(s.texture);

  const chips = [
    `<span class="chip" title="${esc(t('chip.cover.tip'))}">${t('chip.cover', { cover: coverName(s.cover) ?? '—', how: t(opt ? 'chip.cover.own' : 'chip.cover.est') })}</span>`,
    tex ? `<span class="chip" title="${esc(t('chip.soil.tip'))}">${t('chip.soil', { name: tex[0], weight: tex[1] })}</span>` : '',
    s.awc100 !== null ? `<span class="chip" title="${esc(t('chip.awc.tip'))}">${t('chip.awc', { a40: Math.round(s.awc40), a100: Math.round(s.awc100) })}</span>` : '',
    s.confidence !== null ? `<span class="badge conf${s.confidence}" title="${esc(t('chip.conf.tip'))}">${t('chip.conf', { level: confName(s.confidence) })}</span>` : '',
  ].join('');

  const dayNav = `<div class="daynav">
      <button type="button" data-day="${d - 1}" ${d === 0 ? 'disabled' : ''} aria-label="${t('daynav.prev')}">‹</button>
      <div><strong>${lab.rel ? `${lab.rel} · ${esc(lab.long)}` : esc(cap(lab.long))}</strong>${d > 0 ? `<span class="muted"> · ${t('daynav.fcday', { n: d })}</span>` : ''}</div>
      <button type="button" data-day="${d + 1}" ${d >= state.labels.length - 1 ? 'disabled' : ''} aria-label="${t('daynav.next')}">›</button>
    </div>`;

  return `${header(state, elev)}
    ${optBanner(P, opt, state)}
    ${dayNav}
    ${heroTiles(p, d)}
    ${depthGrid(p, state, settings)}
    ${weekSection(p, state, settings)}
    <h3 class="sec">${t('sec.decide')}</h3>
    <div class="cards">
    ${sowingCard(p, state, settings)}
    ${winterCard(p, state)}
    ${trafficCard(p, state, settings)}
    ${nCard(p, state, settings)}
    ${irrigationCard(p, state, settings)}
    </div>
    <h3 class="sec">${t('sec.more')}</h3>
    <div class="folds">
    ${profileSection(p, d, settings, state, opt)}
    ${fold('soil', t('sec.soil'), `<div class="chips">${chips}</div>${soilLines(state, p, opt)}`, soilHint(state))}
    ${picker(state, opt)}
    ${stationSection(state)}
    </div>
    <footer class="pfoot">
      <p><span class="beta">${t('beta')}</span> ${t('foot.beta', { links: `<a href="${t('url.intersucho')}" target="_blank" rel="noopener">Intersucho</a>, <a href="https://agropocasi.cz/" target="_blank" rel="noopener">Agropočasí</a>` })}</p>
      <p>${t('foot.soilmap')}</p>
      <p>${t('foot.disclaimer')}</p>
    </footer>`;
}

// ---------- hero ----------
function heroTiles(p, d) {
  const tt = p.daily.t;
  const v40 = p.daily.vvk?.['0-40']?.[d];
  const lo = p.daily.vvk_lo?.['0-40']?.[d];
  const hi = p.daily.vvk_hi?.['0-40']?.[d];
  const f = p.daily.flags?.value?.[d];
  const frozen = has(f, FLAG.FROZEN);
  const rain = dayRain(p, d);
  const r48 = rain48(p, d);
  const rainTile = rain === null || rain === undefined ? '' : `<div class="tile rain">
      <span class="tl">${t('tile.rain')}</span>
      <span class="tv">${fmtNum(rain, 1)}<small> mm</small></span>
      <span class="ts">${r48 !== null ? t('tile.rain48', { mm: fmtNum(r48, 1) }) : ''}</span>
    </div>`;
  const w = winter(p, d);
  const flags = [
    frozen || w.frostDepth ? `<span class="flag frost">❄ ${w.frostDepth >= 10 ? t('winter.s.deep', { n: w.frostDepth }) : t('tile.frozen')}</span>` : '',
    w.snow ? `<span class="flag snow">${t('flag.snow', { n: w.snow })}</span>` : '',
  ].join('');
  return `${flags ? `<div class="flags">${flags}</div>` : ''}<div class="tiles">
    <div class="tile temp">
      <span class="tl">${t('tile.temp')}</span>
      <span class="tv">${fmtNum(tt.t5_min[d])}<small> ${t('to')} </small>${fmtNum(tt.t5_max[d])}<small> °C</small></span>
      <span class="ts">${t('tile.temp.sub')}${frozen ? ` · <b>${t('tile.frozen')}</b>` : ''}</span>
    </div>
    <div class="tile moist">
      <span class="tl">${t('tile.moist')} <span class="beta">${t('beta')}</span></span>
      <span class="tv">${v40 === null || v40 === undefined ? '—' : Math.round(v40)}<small> ${t('unit.vvk')}</small></span>
      <span class="ts">${vvkWord(v40)}${lo !== null && lo !== undefined ? ` · ${t('tile.range', { lo: Math.round(lo), hi: Math.round(hi) })}` : ''}</span>
    </div>
    ${rainTile}
  </div>`;
}

// ---------- profile ----------
const DEPTH_ROWS = [
  { z: 2, min: 't2_min', max: 't2_max', theta: '2' },
  { z: 5, min: 't5_min', max: 't5_max', theta: '5' },
  { z: 10, min: 't10_min', max: 't10_max', theta: '10' },
  { z: 20, mean: 't20', theta: '20' },
  { z: 30, mean: 't30', theta: '30', interp: true },
  { z: 50, mean: 't50', theta: '50' },
  { z: 75, mean: 't75', theta: '75', interp: true },
  { z: 100, mean: 't100', theta: '100' },
];

function profileSection(p, d, settings, state, opt) {
  const tt = p.daily.t;
  const th = p.daily.theta ?? {};
  const rows = DEPTH_ROWS.map((r) => {
    const min = r.min ? tt[r.min]?.[d] ?? null : null;
    const max = r.max ? tt[r.max]?.[d] ?? null : null;
    const mean = r.mean ? tt[r.mean]?.[d] ?? null : min !== null && max !== null ? (min + max) / 2 : null;
    return { z: r.z, interp: r.interp, min, max, mean, th: th[r.theta]?.[d] ?? null };
  });
  const deep = [150, 200].map((z) => ({ z, mean: tt[`t${z}`]?.[d] ?? null, anom: p.daily.deep_anom?.[String(z)]?.[d] ?? null }));
  const soil = soilOf(p.static);
  const pit = soilPitChart({ soil, depths: [...rows, ...deep], title: t('pit.title', { desc: describeTexture(soil) }) });
  const layers = ['0-10', '0-40', '0-100']
    .map((L) => {
      const v = p.daily.vvk?.[L]?.[d] ?? null;
      const lo = p.daily.vvk_lo?.[L]?.[d] ?? null;
      const hi = p.daily.vvk_hi?.[L]?.[d] ?? null;
      const mm = p.daily.avail_mm?.[L]?.[d] ?? null;
      const scale = (x) => Math.max(0, Math.min(100, (x / 130) * 100));
      const name = t(`moist.bar.${L}`);
      return `<div class="vbar" title="${esc(t('moist.tip', { L, v: pct(v), lo: pct(lo), hi: pct(hi), mm: mm !== null ? t('moist.tip.mm', { mm: Math.round(mm) }) : '' }))}">
        <div class="vlab"><b>${L.replace('-', '–')} cm</b> <span class="muted">${name}</span></div>
        <div class="vtrack">
          <span class="vfill${v > 100 ? ' over' : ''}" style="width:${scale(v ?? 0)}%"></span>
          ${lo !== null && hi !== null ? `<span class="vrange" style="left:${scale(lo)}%;width:${scale(hi) - scale(lo)}%"></span>` : ''}
          <span class="vfc" style="left:${scale(100)}%" title="${t('moist.fc')}"></span>
        </div>
        <div class="vval"><b>${v === null ? '—' : v > 100 ? t('moist.overfc') : pct(v)}</b><span class="muted">${v > 100 ? pct(v) : vvkWord(v)}${mm !== null ? ` · ${Math.round(mm)} mm` : ''}</span></div>
      </div>`;
    })
    .join('');
  const body = `<div class="pitwrap">${pit}</div>
    ${pitLegend(soil)}
    ${pitDetails(soil)}
    <p class="fine">${t('pit.fine')}</p>
    <h4>${t('moist.title')} <span class="muted">${t('moist.unit')}</span></h4>
    <div class="vbars">${layers}</div>
    <p class="fine">${t('moist.fine')}</p>`;
  return fold('profile', t('sec.profile'), body, esc(describeTexture(soil)));
}

function soilHint(state) {
  const base = state.point.cell.static;
  if (!('soil_src' in base) && !('clay' in base)) return '';
  const m = mapSoil(base, state.manifest);
  return m.known ? esc(m.name) : t('map.unknown.short');
}

// ---------- soil map vs. simulated soil, options ----------
function selectedOption(P) {
  return P.optId ? P.options?.list?.find((o) => o.id === P.optId) ?? null : null;
}

function soilLines(state, p, opt) {
  const base = state.point.cell.static;
  if (!('soil_src' in base) && !('clay' in base)) return '';
  const m = mapSoil(base, state.manifest);
  const map = m.known
    ? `<b>${esc(m.lead)}:</b> ${esc(m.label)} – ${t('map.source')}: ${esc(m.credit)}`
    : `<b>${t('map.unknown')}</b>`;
  const g = Number.isFinite(base.geology) ? state.manifest?.geology?.[base.geology] : null;
  const geo = g ? `<p class="sline geo"><b>${t('line.geo')}:</b> ${esc(g.name)}${g.era ? ` <span class="muted">· ${esc(getLang() === 'en' ? eraEn(g.era) : g.era)}</span>` : ''}</p>` : '';
  const code = Number.isFinite(base.bpej) ? formatBpej(base.kr, base.bpej) : null;
  const region = krLine(base.kr);
  const bpej = code
    ? `<p class="sline bpej">${t('line.bpej', { code: esc(code), region: region ? `; ${esc(region)}` : '' })}</p>`
    : '';
  const water = base.water === 1 ? `<p class="sline water">${t('line.water')}</p>` : '';
  return `<div class="soillines">${water}<p class="sline map">${map}</p>${bpej}${geo}<p class="sline sim"><b>${t('line.sim')}:</b> ${esc(simulatedLine(p.static, state.manifest))}${opt ? ` <span class="muted">(${t('line.own')})</span>` : ''}</p></div>`;
}

let pickerPref = null;
export function resetPanelState() {
  pickerPref = null;
}

function optBanner(P, opt, state) {
  if (!opt) return '';
  return `<div class="optbanner" role="status"><span>${t('opt.banner', { label: esc(optionLabel(opt, state.manifest)) })}</span><button type="button" class="btn" data-act="opt-reset">${t('opt.reset')}</button></div>`;
}

function picker(state, opt) {
  const P = state.point;
  const base = P.cell.static;
  const noMap = 'soil_src' in base && !base.soil_src;
  const o = P.options;
  const open = pickerPref ?? (noMap && !opt);
  let body;
  if (!o || o.status === 'loading') body = `<p class="fine"><span class="spinner" aria-hidden="true"></span> ${t('opt.loading')}</p>`;
  else if (o.status === 'none' || !o.list?.length) body = `<p class="fine">${t('opt.none')}</p>`;
  else {
    const soils = o.list.filter((x) => x.kind === 'soil');
    const covers = o.list.filter((x) => x.kind === 'cover');
    const mapName = mapSoil(base, state.manifest);
    const item = (id, name, desc, share, on) =>
      `<button type="button" class="opt" data-opt="${esc(id)}" aria-pressed="${on}"><span class="on" aria-hidden="true">${on ? '●' : '○'}</span><span class="otxt"><b>${esc(name)}</b>${desc ? `<span class="muted">${esc(desc)}</span>` : ''}${share ? `<span class="share">${esc(share)}</span>` : ''}</span></button>`;
    body = `<div class="optlist">${item('', t('opt.default'), mapName.known ? t('opt.default.map', { name: mapName.name }) : t('opt.default.likely'), '', !opt)}
      ${soils.map((x) => item(x.id, optionLabel(x, state.manifest), describeTexture(soilOf(x)), shareText(x), opt?.id === x.id)).join('')}</div>
      ${covers.length ? `<h4>${t('opt.covers')}</h4><div class="covers">${covers.map((x) => `<button type="button" class="cov" data-opt="${esc(x.id)}" aria-pressed="${opt?.id === x.id}">${esc(coverOption(x.cover))}</button>`).join('')}</div>` : ''}`;
  }
  const note = noMap ? `<p class="picknote">${t('opt.nomap')}</p>` : '';
  return `<details class="fold picker${noMap ? ' nomap' : ''}" data-id="picker" ${open ? `open${pickerPref === null ? ' data-auto="1"' : ''}` : ''}>
    <summary><span class="ftitle">${t('opt.summary')}</span>${opt ? `<span class="fhint">${esc(optionLabel(opt, state.manifest))}</span>` : noMap ? `<span class="fhint warnword">${t('opt.nomap.short')}</span>` : ''}${CHEV}</summary>
    <div class="fbody">
    ${note}
    <p class="fine">${t('opt.help')}</p>
    ${body}
    </div>
  </details>`;
}

// ---------- week ----------
function weekSection(p, state, settings) {
  const labels = state.labels.map((l) => cap(l.rel ?? l.weekday));
  const nDays = state.labels.length;
  const tt = p.daily.t;
  const mid = tt.t5_min.map((v, k) => (v === null || tt.t5_max[k] === null ? null : (v + tt.t5_max[k]) / 2));
  const tChart = bandChart({
    labels,
    lo: tt.t5_min,
    hi: tt.t5_max,
    mid,
    unit: '°C',
    color: 'var(--temp)',
    selected: state.day,
    refs: [{ v: 0, label: '0 °C', cls: 'zero' }],
    tip: (k) => t('week.tip.temp', { day: state.labels[k].long, lo: deg(tt.t5_min[k]), hi: deg(tt.t5_max[k]) }),
    title: t('week.temp.title', { n: nDays }),
  });
  const v = p.daily.vvk?.['0-40'] ?? [];
  const lo = p.daily.vvk_lo?.['0-40'] ?? v;
  const hi = p.daily.vvk_hi?.['0-40'] ?? v;
  const trig = settings.irrigation.trigger;
  const vChart = bandChart({
    labels,
    lo,
    hi,
    mid: v,
    unit: t('unit.vvk'),
    color: 'var(--moist)',
    selected: state.day,
    refs: [{ v: 100, label: t('unit.fc'), cls: 'fc' }, { v: trig, label: t('week.irr', { n: trig }), cls: 'trig' }],
    domain: [Math.max(0, Math.min(...lo.filter((x) => x !== null), trig) - 10), Math.max(...hi.filter((x) => x !== null), 100) + 8],
    tip: (k) => t('week.tip.moist', { day: state.labels[k].long, v: pct(v[k]), lo: pct(lo[k]), hi: pct(hi[k]) }),
    title: t('week.moist.title', { n: nDays }),
  });
  const pr = p.daily.precip?.mm ?? p.daily.precip?.value;
  const rainChart = pr
    ? barChart({
        labels,
        values: pr,
        unit: 'mm',
        color: 'var(--moist)',
        selected: state.day,
        tip: (k) => t('week.tip.rain', { day: state.labels[k].long, v: pr[k] === null ? '—' : `${fmtNum(pr[k], 1)} mm` }),
        title: t('week.rain.title', { n: nDays }),
      })
    : '';
  return fold('charts', t('sec.charts', { n: nDays }), `<div class="mini"><div class="minihead"><span class="key temp"></span>${t('week.temp')} <span class="muted">${t('week.temp.sub')}</span></div>${tChart}</div>
    <div class="mini"><div class="minihead"><span class="key moist"></span>${t('week.moist')} <span class="beta">${t('beta')}</span> <span class="muted">${t('week.moist.sub')}</span></div>${vChart}</div>
    ${rainChart ? `<div class="mini"><div class="minihead"><span class="key rain"></span>${t('week.rain')} <span class="muted">${t('week.rain.sub')}</span></div>${rainChart}</div>` : ''}`, '', 'charts');
}

const GRID_T = [
  { z: 2, min: 't2_min', max: 't2_max' },
  { z: 5, min: 't5_min', max: 't5_max' },
  { z: 10, min: 't10_min', max: 't10_max' },
  { z: 20, mean: 't20' },
  { z: 30, mean: 't30' },
  { z: 50, mean: 't50' },
  { z: 75, mean: 't75' },
  { z: 100, mean: 't100' },
  { z: 150, mean: 't150' },
  { z: 200, mean: 't200' },
];
const ANOM_ARROW = { '-3': '↓↓↓', '-2': '↓↓', '-1': '↓', 0: '=', 1: '↑', 2: '↑↑', 3: '↑↑↑' };

// Light tints only, so the numbers stay readable: blue below 0 °C, green around 8, orange when warm.
function tempTint(v) {
  if (v === null || v === undefined) return '';
  const x = Math.max(-10, Math.min(30, v));
  const hue = x < 0 ? 215 : x < 15 ? 200 - (x / 15) * 110 : 90 - ((x - 15) / 15) * 70;
  return `--tint:hsl(${hue.toFixed(0)} 70% 50% / 0.18)`;
}
function anomTint(a) {
  if (a === null || a === undefined || Math.round(a) === 0) return '--tint:transparent';
  const k = Math.min(3, Math.abs(Math.round(a)));
  return a < 0 ? `--tint:rgb(184 53 42 / ${(0.06 + k * 0.06).toFixed(2)})` : `--tint:rgb(27 111 138 / ${(0.08 + k * 0.08).toFixed(2)})`;
}
function moistTint(th) {
  if (th === null || th === undefined) return '';
  return `--tint:rgb(27 111 138 / ${(0.06 + Math.min(1, th / 0.45) * 0.34).toFixed(2)})`;
}

/** All depths 2–200 cm × today + 5 days, for temperature or moisture (switch). Tap a column to select the day. */
function depthGrid(p, state, settings) {
  const qty = settings.gridQty === 'm' ? 'm' : 't';
  const tt = p.daily.t;
  const th = p.daily.theta ?? {};
  const n = state.labels.length;
  const ks = [...Array(n).keys()];
  const r0 = (x) => (x === null || x === undefined ? '—' : Math.round(x));
  const col = (k) => `${k === state.day ? ' on' : ''}`;
  const cell = (k, html, style = '', tip = '') => `<button type="button" class="gc${col(k)}" data-day="${k}"${style ? ` style="${style}"` : ''}${tip ? ` title="${esc(tip)}"` : ''}>${html}</button>`;
  const row = (label, cells, cls = '') => `<div class="grow${cls}"><span class="gz">${label}</span>${cells}</div>`;
  const rows = [];
  rows.push(`<div class="grow ghead"><span class="gz"></span>${ks.map((k) => `<button type="button" class="gd${col(k)}" data-day="${k}">${esc(cap(state.labels[k].rel ?? state.labels[k].weekday))}</button>`).join('')}</div>`);
  if (qty === 't') {
    for (const r of GRID_T) {
      if (r.z === 150) rows.push(`<div class="gsep">${t('pit.sep')}</div>`);
      rows.push(row(`${r.z} cm`, ks.map((k) => {
        const lo = r.min ? tt[r.min]?.[k] ?? null : null;
        const hi = r.max ? tt[r.max]?.[k] ?? null : null;
        const mean = r.mean ? tt[r.mean]?.[k] ?? null : lo !== null && hi !== null ? (lo + hi) / 2 : null;
        const txt = r.min ? `${r0(lo)}–${r0(hi)}` : mean === null ? '—' : fmtNum(mean);
        const tip = `${state.labels[k].long}, ${r.z} cm: ${r.min ? `${deg(lo)} ${t('to')} ${deg(hi)}` : deg(mean)}`;
        return cell(k, txt, tempTint(mean), tip);
      }).join(''), r.z > 100 ? ' gdeep' : ''));
    }
  } else {
    const v = p.daily.vvk?.['0-40'] ?? [];
    const cls = (x) => (x === null || x === undefined ? '' : x >= 70 ? 'wet' : x >= 50 ? 'ok' : x >= 30 ? 'dryish' : 'dry');
    rows.push(row(t('grid.vvk40'), ks.map((k) => cell(k, `<span class="dv ${cls(v[k])}">${r0(v[k])} %</span>`, '', `${state.labels[k].long}: ${pct(v[k])} ${t('unit.vvk')} · ${vvkWord(v[k])}`)).join(''), ' gvvk'));
    for (const r of GRID_T) {
      if (r.z === 150) rows.push(`<div class="gsep">${t('pit.sep')}</div>`);
      if (r.z > 100) {
        rows.push(row(`${r.z} cm`, ks.map((k) => {
          const a = p.daily.deep_anom?.[String(r.z)]?.[k];
          const ok = a !== null && a !== undefined;
          return cell(k, ok ? ANOM_ARROW[Math.max(-3, Math.min(3, Math.round(a)))] : '—', ok ? anomTint(a) : '', ok ? `${state.labels[k].long}, ${r.z} cm: ${t(`anom.${Math.max(-3, Math.min(3, Math.round(a)))}`)}` : '');
        }).join(''), ' gdeep'));
        continue;
      }
      rows.push(row(`${r.z} cm`, ks.map((k) => {
        const x = th[String(r.z)]?.[k];
        const ok = x !== null && x !== undefined;
        return cell(k, ok ? Math.round(x * 100) : '—', moistTint(x), ok ? `${state.labels[k].long}, ${r.z} cm: ${fmtNum(x * 100, 0)} % ${t('grid.vol')}` : '');
      }).join('')));
    }
  }
  const pr = p.daily.precip?.mm ?? p.daily.precip?.value;
  if (pr) rows.push(row(t('grid.rain'), ks.map((k) => cell(k, pr[k] === null || pr[k] === undefined ? '' : pr[k] >= 0.5 ? `${fmtNum(pr[k], pr[k] < 10 ? 1 : 0)}` : '–')).join(''), ' grain'));
  const seg = ['t', 'm'].map((q) => `<button type="button" data-grid="${q}" aria-pressed="${q === qty}">${t(`grid.q.${q}`)}</button>`).join('');
  const unit = qty === 't' ? t('grid.unit.t') : t('grid.unit.m');
  return `<section class="dgrid" aria-label="${t('grid.aria')}">
    <div class="ghd"><div class="gseg" role="group">${seg}</div><span class="gunit">${unit}</span></div>
    <div class="gtab" style="--n:${n}">${rows.join('')}</div>
  </section>`;
}

/** Today + 5 days at a glance: 5 cm temperature range, 0–40 cm moisture, rain. Tap a day to select it. */
function dayStrip(p, state) {
  const tt = p.daily.t;
  const v = p.daily.vvk?.['0-40'] ?? [];
  const pr = p.daily.precip?.mm ?? p.daily.precip?.value;
  const r0 = (x) => (x === null || x === undefined ? '—' : Math.round(x));
  const cls = (x) => (x === null || x === undefined ? '' : x > 100 || x >= 70 ? 'wet' : x >= 50 ? 'ok' : x >= 30 ? 'dryish' : 'dry');
  const days = state.labels
    .map((l, k) => {
      const rain = pr?.[k];
      const tip = t('days.tip', { day: l.long, lo: deg(tt.t5_min[k]), hi: deg(tt.t5_max[k]), v: pct(v[k]), w: vvkWord(v[k]) });
      return `<button type="button" class="dd${k === state.day ? ' on' : ''}" data-day="${k}" title="${esc(tip)}">
        <span class="dw">${esc(cap(l.rel ?? l.weekday))}</span>
        <span class="dt">${r0(tt.t5_min[k])}–${r0(tt.t5_max[k])}</span>
        <span class="dv ${cls(v[k])}">${r0(v[k])} %</span>
        <span class="dr">${rain === null || rain === undefined ? '' : rain >= 0.5 ? `${fmtNum(rain, rain < 10 ? 1 : 0)} mm` : '–'}</span>
      </button>`;
    })
    .join('');
  return `<div class="dstrip" role="group" aria-label="${t('days.aria')}">
    <div class="dkey" aria-hidden="true"><span></span><span>${t('days.k.temp')}</span><span>${t('days.k.moist')}</span><span>${t('days.k.rain')}</span></div>
    ${days}</div>`;
}

// ---------- cards ----------
function strip(state, fn) {
  return `<div class="strip" role="group" aria-label="${t('strip.aria')}">${state.labels
    .map((l, k) => {
      const st = fn(k);
      return `<button type="button" class="sd ${st.status}${k === state.day ? ' on' : ''}" data-day="${k}" title="${esc(`${l.long}: ${st.text}`)}"><span>${esc(l.weekday)}</span><i aria-hidden="true">${ICON[st.status]}</i></button>`;
    })
    .join('')}</div>`;
}

function card({ id, title, status, statusText, body, why, settingsHtml, stripHtml }) {
  return `<details class="card fold ${status}" id="card-${id}" data-id="card-${id}">
    <summary><span class="dot ${status}" aria-hidden="true"></span><span class="ftitle">${title}</span>${pill(status, statusText)}${CHEV}</summary>
    <div class="fbody">
    ${body}
    ${stripHtml ?? ''}
    ${why ? `<p class="why"><b>${t('card.why')}</b> ${why}</p>` : ''}
    ${settingsHtml ? `<details class="edit" data-id="${id}"><summary>${t('card.edit')}</summary>${settingsHtml}</details>` : ''}
    </div>
  </details>`;
}

const sowText = (st) => t(`status.${st}`);

function sowingCard(p, state, settings) {
  const crop = CROPS.find((c) => c.id === settings.crop) ?? CROPS[0];
  const th = { temp: crop.temp, days: crop.days, ...(settings.cropThresholds[crop.id] ?? {}) };
  const r = sowingDay(p, state.day, crop, th);
  const options = CROPS.map((c) => `<option value="${c.id}" ${c.id === crop.id ? 'selected' : ''}>${t(`crop.${c.id}.name`)}</option>`).join('');
  const details = [...r.reasons, ...r.notes];
  const body = `<div class="cardrow"><label class="sel">${t('sow.crop')} <select data-set="crop">${options}</select></label></div>
    <p class="verdict">${cap(t('sow.verdict', { status: sowText(r.status) }))}${details.length ? `: ${esc(details.join(', '))}` : ''}.</p>`;
  const srcs = crop.sources.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${n}</a>`).join(', ');
  const settingsHtml = `<div class="form">
      <label>${t('sow.temp', { depth: crop.depth })} <span class="inp"><input type="number" step="0.5" min="-5" max="25" value="${th.temp}" data-set="crop-temp"/> °C</span></label>
      <label>${t('sow.days')} <span class="inp"><input type="number" step="1" min="1" max="7" value="${th.days}" data-set="crop-days"/></span></label>
      <label>${t('sow.rain')} <span class="inp"><input type="number" step="1" min="1" max="60" value="${th.rain ?? RAIN_DEFAULT.border}" data-set="crop-rain"/> mm</span></label>
      <button type="button" class="linkbtn" data-act="crop-reset">${t('card.default')}</button>
    </div>
    <p class="fine">${t('sow.fine')}</p>`;
  return card({
    id: 'sow',
    title: t('sow.title'),
    status: r.status,
    statusText: sowText(r.status),
    body,
    stripHtml: strip(state, (k) => {
      const x = sowingDay(p, k, crop, th);
      return { status: x.status, text: sowText(x.status) };
    }),
    why: `${esc(t(`crop.${crop.id}.why`))}${crop.unresolved ? ` <span class="warnword">${t('sow.unresolved')}</span>` : ''} ${t('sow.sources')}: ${srcs}.`,
    settingsHtml,
  });
}

function winterCard(p, state) {
  const w = winter(p, state.day);
  const statusText = w.frostDepth >= 10 ? t('winter.s.deep', { n: w.frostDepth }) : w.frozenMorning ? t('winter.s.frozen') : t('winter.s.none');
  const lines = [
    t('winter.l.surface', { state: t(w.frozenMorning ? 'winter.frozen' : 'winter.notfrozen'), thaw: w.frozenMorning ? t(w.thaws ? 'winter.thaws' : 'winter.nothaw') : '' }),
    t('winter.l.depth', { v: w.frostDepth ? t('unit.cm', { n: w.frostDepth }) : t('winter.nofrost') }),
    t('winter.l.cycles', { n: w.cycles, risk: w.cycles >= 3 ? t('winter.risk') : '' }),
    t('winter.l.snow', { v: w.snow ? t('unit.cm', { n: w.snow }) : t('winter.nosnow') }),
  ];
  return card({
    id: 'winter',
    title: t('winter.title'),
    status: w.status,
    statusText,
    body: `<ul class="facts">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`,
    stripHtml: strip(state, (k) => {
      const x = winter(p, k);
      return { status: x.status, text: x.frostDepth ? t('winter.t.deep', { n: x.frostDepth }) : x.frozenMorning ? t('winter.t.frozen') : t('winter.t.none') };
    }),
    why: t('winter.why'),
  });
}

function trafficCard(p, state, settings) {
  const tf = trafficability(p, state.day, settings.traffic);
  const until = tf.ok ? t('traffic.v.ok') : tf.daysUntil ? t('traffic.v.in', { days: tp('unit.days', tf.daysUntil), day: esc(state.labels[state.day + tf.daysUntil].long) }) : t('traffic.v.never');
  return card({
    id: 'traffic',
    title: t('traffic.title'),
    status: tf.status,
    statusText: t(tf.ok ? 'traffic.ok' : 'traffic.bad'),
    body: `<p class="verdict">${until}${!tf.ok && tf.reasons.length ? ` <span class="muted">${t('traffic.reason', { r: esc(tf.reasons.join(', ')) })}</span>` : ''}</p>
      <p class="fine">${t('traffic.fine', { fc: tf.fcPct !== null ? t('traffic.fine.fc', { v: pct(tf.fcPct) }) : '', vvk: pct(tf.vvk10) })}</p>`,
    stripHtml: strip(state, (k) => {
      const x = trafficability(p, k, settings.traffic);
      return { status: x.status, text: t(x.ok ? 'traffic.ok' : 'traffic.bad') };
    }),
    settingsHtml: `<div class="form">
        <label>${t('traffic.until')} <span class="inp"><input type="number" min="50" max="130" step="1" value="${tf.limit}" data-set="traffic-fc"/> ${t('traffic.until.unit')}</span></label>
        <button type="button" class="linkbtn" data-act="traffic-reset">${t('card.default')}</button>
      </div>
      <p class="fine">${t('traffic.set.fine')}</p>`,
    why: t('traffic.why', { link: `<a href="https://escholarship.org/uc/item/1590v33s" target="_blank" rel="noopener">${t('traffic.why.link')}</a>` }),
  });
}

function nCard(p, state, settings) {
  const nvz = settings.nvz;
  const binding = nvz !== 'ne';
  const autoKr = Number.isInteger(p.static?.kr) ? p.static.kr : null;
  const kr = settings.nkr === 'auto' || settings.nkr === undefined ? autoKr : Number(settings.nkr);
  const type = settings.ntype ?? 'min';
  const gentle = Boolean(settings.ngentle);
  const calAt = (k) => calendarBan(state.labels[k]?.date, kr, type, gentle);
  const cal = calAt(state.day);
  const n = nConditions(p, state.day, cal, binding);
  const calTxt = cal.known ? t('n.cal.txt', { kr, type: typeShort(type), text: cal.text }) : '';
  const soil = n.reasons.length ? t('n.soil.bad', { r: esc(n.reasons.join(', ')) }) : t('n.soil.ok');
  let calendar;
  if (!cal.known) calendar = t('n.cal.pick');
  else if (cal.inBan) calendar = t(binding ? 'n.cal.ban' : 'n.cal.banNot', { txt: esc(calTxt) });
  else calendar = t('n.cal.free', { txt: esc(calTxt) });
  const scope = t(nvz === 'ne' ? 'n.scope.no' : 'n.scope.yes');
  const yn = ['nevim', 'ano', 'ne'].map((v) => `<option value="${v}" ${v === nvz ? 'selected' : ''}>${t(`n.yn.${v}`)}</option>`).join('');
  const krOpts = [
    autoKr !== null ? `<option value="auto" ${settings.nkr === 'auto' ? 'selected' : ''}>${t('n.kr.auto', { kr: autoKr })}</option>` : `<option value="auto" ${settings.nkr === 'auto' ? 'selected' : ''} disabled>${t('n.kr.pick')}</option>`,
    ...krNames().map((name, i) => `<option value="${i}" ${String(settings.nkr) === String(i) ? 'selected' : ''}>${t('kr.opt', { i, name: esc(name) })}</option>`),
  ].join('');
  const typeOpts = nTypes().map(([v, l]) => `<option value="${v}" ${v === type ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const status = n.status;
  const statusText = status === STATUS.BAD ? t('n.s.bad') : !cal.known ? t('n.s.okSoil') : t('n.s.ok');
  return card({
    id: 'n',
    title: t('n.title'),
    status,
    statusText,
    body: `<p class="verdict">${soil} ${calendar}</p>
      <div class="cardrow"><label class="sel">${t('n.q.nvz')} <select data-set="nvz">${yn}</select></label></div>
      <div class="cardrow"><label class="sel">${t('n.q.kr')} <select data-set="nkr">${krOpts}</select></label></div>
      <div class="cardrow"><label class="sel">${t('n.q.type')} <select data-set="ntype">${typeOpts}</select></label></div>
      <div class="cardrow"><label class="chk"><input type="checkbox" data-set="ngentle" ${gentle ? 'checked' : ''}/> ${t('n.q.gentle')}</label></div>
      <p class="fine">${scope} ${t('n.fine', { url: nvzUrl() })}</p>`,
    stripHtml: strip(state, (k) => {
      const c = calAt(k);
      const x = nConditions(p, k, c, binding);
      const parts = [...x.reasons];
      if (c.inBan) parts.push(t(binding ? 'n.strip.ban' : 'n.strip.banInfo'));
      return { status: x.status, text: parts.length ? parts.join(', ') : t('n.s.ok') };
    }),
  });
}

function irrigationCard(p, state, settings) {
  const ir = irrigation(p, state.day, settings.irrigation);
  const statusText = t(`irr.s.${ir.status}`);
  const when =
    ir.vvk === null
      ? t('irr.nodata')
      : ir.daysUntil === 0
        ? t('irr.now', { layer: ir.layer.replace('-', '–'), v: pct(ir.vvk), trig: ir.trigger })
        : ir.daysUntil
          ? t('irr.soon', { trig: ir.trigger, days: tp('unit.days', ir.daysUntil) })
          : t('irr.stays', { trig: ir.trigger });
  const refill = ir.refill !== null && ir.status !== STATUS.OK ? ` ${t('irr.refill', { mm: Math.round(ir.refill) })}` : '';
  const layerOpts = [['0-40', '0–40 cm'], ['0-100', '0–100 cm']].map(([v, l]) => `<option value="${v}" ${v === ir.layer ? 'selected' : ''}>${l}</option>`).join('');
  return card({
    id: 'irr',
    title: `${t('irr.title')} <span class="beta">${t('beta')}</span>`,
    status: ir.status,
    statusText,
    body: `<p class="verdict">${when}${refill}</p>`,
    stripHtml: strip(state, (k) => {
      const v = p.daily.vvk?.[ir.layer]?.[k];
      const st = v === null || v === undefined ? STATUS.BORDER : v < ir.trigger ? STATUS.BAD : STATUS.OK;
      return { status: st, text: `${pct(v)} ${t('unit.vvk').replace(/^%\s*/, '')}` };
    }),
    why: t('irr.why'),
    settingsHtml: `<div class="form">
        <label>${t('irr.below')} <span class="inp"><input type="number" min="20" max="95" step="5" value="${ir.trigger}" data-set="irr-trigger"/> ${t('unit.vvk')}</span></label>
        <label>${t('irr.layer')} <select data-set="irr-layer">${layerOpts}</select></label>
      </div>`,
  });
}

// ---------- station ----------
function haversine(a, b) {
  const R = 6371;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function stationSection(state) {
  const list = state.stations?.stations;
  if (!list?.length) return '';
  const here = { lat: state.point.lat, lon: state.point.lng };
  const st = list.map((s) => ({ s, km: haversine(here, s) })).sort((a, b) => a.km - b.km)[0];
  const { s, km } = st;
  const depth = s.depths.includes(5) ? 5 : s.depths[0];
  const time = s.series.time;
  const meas = s.series.measured[depth] ?? [];
  const model = s.series.model[depth] ?? [];
  const split = meas.findLastIndex((v) => v !== null) + 1;
  const sk = s.skill?.[depth];
  const chart = seriesChart({
    time,
    split,
    unit: '°C',
    title: t('st.title', { depth, name: s.name }),
    series: [
      { name: t('st.meas'), values: meas, cls: 'meas' },
      { name: t('st.model'), values: model, cls: 'model' },
    ],
  });
  return fold('station', t('st.nearest', { name: esc(s.name) }), `<p class="fine">${t('st.fine', { depth })}</p>
    <div class="legend2"><span><i class="k meas"></i>${t('st.legend.meas')}</span><span><i class="k model"></i>${t('st.legend.model')}</span></div>
    ${chart}
    ${sk ? `<p class="fine">${t('st.skill', { mae: fmtNum(sk.mae), bias: fmtNum(sk.bias), n: fmtInt(sk.n) })} <a href="presnost.html#${encodeURIComponent(s.wsi)}">${t('st.detail')}</a></p>` : ''}`, `${fmtNum(km, 0)} km`, 'station');
}

// ---------- events ----------
export function panelEvents(el, { close, setDay, redraw, setOption }) {
  attachTooltips(el);
  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') return close();
    if (act === 'opt-reset') return setOption(null);
    const g = e.target.closest('[data-grid]');
    if (g) {
      saveSettings({ gridQty: g.dataset.grid });
      return redraw();
    }
    const pick = e.target.closest('[data-opt]');
    if (pick) return setOption(pick.dataset.opt || null);
    if (act === 'theta') {
      saveSettings({ showTheta: !loadSettings().showTheta });
      return redraw();
    }
    if (act === 'traffic-reset') {
      saveSettings({ traffic: { fc: 90 } });
      return redraw();
    }
    if (act === 'crop-reset') {
      const s = loadSettings();
      const th = { ...s.cropThresholds };
      delete th[s.crop];
      saveSettings({ cropThresholds: th });
      return redraw();
    }
    const day = e.target.closest('[data-day]');
    if (day && !day.disabled) setDay(Number(day.dataset.day));
  });
  el.addEventListener('toggle', (e) => {
    const id = e.target.dataset?.id;
    if (!id) return;
    if (e.target.dataset.auto && e.target.open) return; // opened for a cell without a soil map, not by the visitor
    if (id === 'picker') pickerPref = e.target.open;
    if (e.target.open) openDetails.add(id);
    else openDetails.delete(id);
    saveOpen();
  }, true);
  el.addEventListener('change', (e) => {
    const key = e.target.dataset.set;
    if (!key) return;
    const s = loadSettings();
    const v = e.target.value;
    const num = Number(v);
    if (key === 'crop') saveSettings({ crop: v });
    if (key === 'nvz') saveSettings({ nvz: v });
    if (key === 'nkr') saveSettings({ nkr: v });
    if (key === 'ntype') saveSettings({ ntype: v });
    if (key === 'ngentle') saveSettings({ ngentle: e.target.checked });
    if (key === 'traffic-fc' && Number.isFinite(num) && v !== '') saveSettings({ traffic: { fc: Math.max(50, Math.min(130, Math.round(num))) } });
    if ((key === 'crop-temp' || key === 'crop-days' || key === 'crop-rain') && Number.isFinite(num) && v !== '') {
      const cur = { ...(s.cropThresholds[s.crop] ?? {}) };
      if (key === 'crop-temp') cur.temp = Math.max(-5, Math.min(25, num));
      else if (key === 'crop-rain') cur.rain = Math.max(1, Math.min(60, num));
      else cur.days = Math.max(1, Math.min(7, Math.round(num)));
      saveSettings({ cropThresholds: { ...s.cropThresholds, [s.crop]: cur } });
    }
    if (key === 'irr-trigger' && Number.isFinite(num) && v !== '') saveSettings({ irrigation: { ...s.irrigation, trigger: Math.max(10, Math.min(100, Math.round(num))) } });
    if (key === 'irr-layer') saveSettings({ irrigation: { ...s.irrigation, layer: v } });
    redraw();
  });
}
