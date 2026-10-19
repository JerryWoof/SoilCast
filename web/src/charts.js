// Small SVG charts as strings. Colours come from CSS custom properties so
// light and dark mode work without re-rendering.

import { fmtNum } from './cards.js';
import { LAYER_BOUNDS, TEXTURE_COLORS, fullTexture } from './soil.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function niceDomain(values, pad = 0.08, minSpan = 4) {
  const v = values.filter((x) => x !== null && x !== undefined && !Number.isNaN(x));
  if (!v.length) return [0, 1];
  let lo = Math.min(...v);
  let hi = Math.max(...v);
  if (hi - lo < minSpan) {
    const m = (hi + lo) / 2;
    lo = m - minSpan / 2;
    hi = m + minSpan / 2;
  }
  const span = hi - lo;
  return [lo - span * pad, hi + span * pad];
}

function ticks([lo, hi], n = 3) {
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
  return out;
}

const path = (pts) =>
  pts
    .map((p, k) => (p ? `${k === 0 || !pts[k - 1] ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}` : ''))
    .join('');

/**
 * Seven-day band chart: lo–hi band, optional mid line, reference lines,
 * highlighted selected day and per-day hover targets (data-day, data-tip).
 */
export function bandChart({ labels, lo, hi, mid, unit, color, selected, refs = [], domain, tip, title, minSpan = 4 }) {
  const W = 400, H = 132, L = 34, R = 8, T = 10, B = 24;
  const n = labels.length;
  const dom = domain ?? niceDomain([...lo, ...hi, ...(mid ?? []), ...refs.map((r) => r.v)], 0.08, minSpan);
  const x = (k) => L + ((k + 0.5) * (W - L - R)) / n;
  const y = (v) => T + (1 - (v - dom[0]) / (dom[1] - dom[0])) * (H - T - B);
  const colW = (W - L - R) / n;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`;
  for (const t of ticks(dom, 3)) {
    s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 6}" y="${y(t) + 3.5}" text-anchor="end">${fmtNum(t)}</text>`;
  }
  if (selected !== null && selected !== undefined) s += `<rect class="sel" x="${x(selected) - colW / 2 + 2}" y="${T - 4}" width="${colW - 4}" height="${H - T - B + 8}" rx="6"/>`;
  for (const r of refs) {
    if (r.v < dom[0] || r.v > dom[1]) continue;
    s += `<line class="ref ${r.cls ?? ''}" x1="${L}" x2="${W - R}" y1="${y(r.v)}" y2="${y(r.v)}"/><text class="reflabel" x="${W - R - 2}" y="${y(r.v) - 3}" text-anchor="end">${esc(r.label)}</text>`;
  }
  const top = lo.map((_, k) => (hi[k] !== null && lo[k] !== null ? [x(k), y(hi[k])] : null));
  const bot = lo.map((_, k) => (hi[k] !== null && lo[k] !== null ? [x(k), y(lo[k])] : null));
  const okIdx = top.map((p, k) => (p ? k : -1)).filter((k) => k >= 0);
  if (okIdx.length > 1) {
    const poly = [...okIdx.map((k) => top[k]), ...okIdx.reverse().map((k) => bot[k])];
    s += `<polygon class="band" style="fill:${color}" points="${poly.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}"/>`;
  }
  if (mid) {
    const pts = mid.map((v, k) => (v === null ? null : [x(k), y(v)]));
    s += `<path class="line" style="stroke:${color}" d="${path(pts)}"/>`;
    pts.forEach((p, k) => {
      if (p) s += `<circle class="dot${k === selected ? ' on' : ''}" style="fill:${color}" cx="${p[0]}" cy="${p[1]}" r="${k === selected ? 4.5 : 3}"/>`;
    });
  } else {
    [top, bot].forEach((pts) => (s += `<path class="line thin" style="stroke:${color}" d="${path(pts)}"/>`));
  }
  labels.forEach((lab, k) => {
    s += `<text class="xl${k === selected ? ' on' : ''}" x="${x(k)}" y="${H - 7}" text-anchor="middle">${esc(lab)}</text>`;
    s += `<rect class="hit" data-day="${k}" data-tip="${esc(tip(k))}" x="${x(k) - colW / 2}" y="0" width="${colW}" height="${H}"/>`;
  });
  return s + `</svg><span class="unit">${esc(unit)}</span>`;
}

/** Small daily bar chart (precipitation). values may contain null. */
export function barChart({ labels, values, unit, color, selected, tip, title }) {
  const W = 400, H = 84, L = 34, R = 8, T = 8, B = 22;
  const n = labels.length;
  const top = Math.max(5, ...values.filter((v) => v !== null && v !== undefined));
  const dom = [0, top * 1.1];
  const x = (k) => L + ((k + 0.5) * (W - L - R)) / n;
  const y = (v) => T + (1 - (v - dom[0]) / (dom[1] - dom[0])) * (H - T - B);
  const colW = (W - L - R) / n;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`;
  for (const t of ticks(dom, 2)) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 6}" y="${y(t) + 3.5}" text-anchor="end">${fmtNum(t, 0)}</text>`;
  if (selected !== null && selected !== undefined) s += `<rect class="sel" x="${x(selected) - colW / 2 + 2}" y="${T - 4}" width="${colW - 4}" height="${H - T - B + 8}" rx="6"/>`;
  labels.forEach((lab, k) => {
    const v = values[k];
    if (v !== null && v !== undefined) {
      const h = Math.max(v > 0 ? 1.5 : 0, y(0) - y(v));
      s += `<rect class="bar${k === selected ? ' on' : ''}" style="fill:${color}" x="${x(k) - colW * 0.22}" y="${y(0) - h}" width="${colW * 0.44}" height="${h}" rx="2"/>`;
      if (v > 0) s += `<text class="barval" x="${x(k)}" y="${y(0) - h - 3}" text-anchor="middle">${fmtNum(v, v < 10 ? 1 : 0)}</text>`;
    }
    s += `<text class="xl${k === selected ? ' on' : ''}" x="${x(k)}" y="${H - 7}" text-anchor="middle">${esc(lab)}</text>`;
    s += `<rect class="hit" data-day="${k}" data-tip="${esc(tip(k))}" x="${x(k) - colW / 2}" y="0" width="${colW}" height="${H}"/>`;
  });
  return s + `</svg><span class="unit">${esc(unit)}</span>`;
}

const ANOM_SHORT = { '-3': 'mnohem sušší', '-2': 'sušší', '-1': 'mírně sušší', 0: 'obvyklé', 1: 'mírně vlhčí', 2: 'vlhčí', 3: 'mnohem vlhčí' };

// Soil pit geometry. Piecewise depth scale: top 30 cm is expanded, 30–100 medium,
// 100–200 compressed. Table rows have a fixed height and are joined to their depth by leaders.
const PIT_SCALE = [[0, 30, 90], [30, 100, 88], [100, 200, 78]]; // [from cm, to cm, px]
const PIT = { W: 340, T: 26, RH: 24, GAP: 16, X0: 32, X1: 92, TX: 150, MX: 226, BAR: 48 };
const pitY = (z) => {
  let y = PIT.T;
  for (const [a, b, px] of PIT_SCALE) {
    if (z <= b) return y + ((Math.max(a, z) - a) / (b - a)) * px;
    y += px;
  }
  return y;
};
const PIT_STONY = 10; // % coarse fragments below which stones are not drawn

const SVG_DEFS = `<defs>
  <pattern id="p-rock" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" class="rk-bg"/><line x1="0" y1="0" x2="0" y2="8" class="rk-ln"/></pattern>
  <pattern id="p-stone1" width="14" height="12" patternUnits="userSpaceOnUse"><ellipse cx="3.5" cy="3" rx="1.7" ry="1.3" class="stn"/><ellipse cx="10" cy="8.5" rx="1.4" ry="1.1" class="stn"/></pattern>
  <pattern id="p-stone2" width="9" height="8" patternUnits="userSpaceOnUse"><ellipse cx="2.5" cy="2" rx="1.7" ry="1.3" class="stn"/><ellipse cx="7" cy="4.5" rx="1.5" ry="1.2" class="stn"/><ellipse cx="3" cy="6.8" rx="1.2" ry="1" class="stn"/></pattern>
  <pattern id="p-perch" width="10" height="8" patternUnits="userSpaceOnUse"><ellipse cx="2.5" cy="2" rx="2" ry="1.2" class="pc-a"/><ellipse cx="7.5" cy="6" rx="2" ry="1.2" class="pc-b"/></pattern>
</defs>`;

/**
 * Soil pit 0–200 cm. Left: the six SoilGrids layers coloured by texture on a piecewise
 * depth scale, with stones, bedrock, groundwater and stagnic water. Right: a fixed-row table
 * (depth, temperature, moisture) joined to the depth by leader lines.
 * depths: [{z, min, max, mean, th, anom, interp}].
 */
export function soilPitChart({ soil, depths, title }) {
  const { W, T, RH, GAP, X0, X1, TX, MX, BAR } = PIT;
  const nShallow = depths.filter((r) => r.z <= 100).length;
  const rowY = (i) => T + i * RH + (i >= nShallow ? GAP : 0) + RH / 2;
  const yBot = pitY(200);
  const H = Math.max(yBot, rowY(depths.length - 1) + RH / 2) + 4;
  const LX = X1 + 26; // leaders end here
  let s = `<svg class="chart pit" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${SVG_DEFS}`;
  s += `<text class="pt-head" x="${X0 - 6}" y="14" text-anchor="end">cm</text><text class="pt-head" x="${LX + 28}" y="14" text-anchor="end">cm</text><text class="pt-head" x="${TX}" y="14">Teplota °C</text><text class="pt-head" x="${MX}" y="14">Vlhkost m³/m³</text>`;
  // layers
  soil.layers.forEach((l, k) => {
    const y1 = pitY(l.from), y2 = pitY(l.to);
    const col = l.group === null ? 'var(--surface-2)' : TEXTURE_COLORS[l.group];
    const tip = l.cls ? `${l.name} cm: ${fullTexture(l.cls)} (jíl ${l.clay} %, prach ${l.silt} %, písek ${l.sand} %), kameny ${l.cfvo} %` : `${l.name} cm: bez údaje o zrnitosti`;
    s += `<g data-tip="${esc(tip)}"><rect x="${X0}" y="${y1}" width="${X1 - X0}" height="${y2 - y1}" fill="${col}"/>`;
    if (l.cfvo >= PIT_STONY) s += `<rect x="${X0}" y="${y1}" width="${X1 - X0}" height="${y2 - y1}" fill="url(#${l.cfvo >= 25 ? 'p-stone2' : 'p-stone1'})"/>`;
    s += `</g>`;
    if (k > 0) s += `<line class="pt-edge" x1="${X0}" x2="${X1}" y1="${y1}" y2="${y1}"/>`;
  });
  // stagnic water (30–100 cm)
  if (soil.perched) {
    const y1 = pitY(30), y2 = pitY(100);
    s += `<g data-tip="oglejení – voda se v půdě zdržuje (vrstva 30–100 cm)"><rect x="${X0}" y="${y1}" width="${X1 - X0}" height="${y2 - y1}" fill="url(#p-perch)" opacity="0.8"/><rect class="pt-perchbar" x="${X0}" y="${y1}" width="3" height="${y2 - y1}"/></g>`;
  }
  // below 1 m: lower confidence
  s += `<rect class="pt-veil" x="${X0}" y="${pitY(100)}" width="${X1 - X0}" height="${yBot - pitY(100)}"/>`;
  // bedrock
  if (soil.bedrock !== null) {
    const y = pitY(soil.bedrock);
    s += `<g data-tip="${esc(`mělká skála od ${Math.round(soil.bedrock)} cm`)}"><rect x="${X0}" y="${y}" width="${X1 - X0}" height="${yBot - y}" fill="url(#p-rock)"/><line class="pt-rockline" x1="${X0}" x2="${X1}" y1="${y}" y2="${y}"/></g>`;
  }
  s += `<rect class="pt-frame" x="${X0}" y="${T}" width="${X1 - X0}" height="${yBot - T}"/>`;
  // depth axis (layer boundaries)
  LAYER_BOUNDS.forEach((b, k) => {
    const y = pitY(b);
    s += `<line class="pt-axis" x1="${X0 - 4}" x2="${X0}" y1="${y}" y2="${y}"/><text class="tick" x="${X0 - 7}" y="${y + (k === 6 ? 1 : 4)}" text-anchor="end">${b}</text>`;
  });
  // groundwater: dashed line across the column plus a triangle marker
  if (soil.gw !== null) {
    const y = pitY(soil.gw);
    s += `<g data-tip="${esc(`podzemní voda v ${Math.round(soil.gw)} cm`)}"><line class="pt-gwhalo" x1="${X0}" x2="${X1}" y1="${y}" y2="${y}"/><line class="pt-gw" x1="${X0}" x2="${X1}" y1="${y}" y2="${y}"/><path class="pt-gwmark" d="M${X0 + 4},${y - 5} h10 l-5,9z"/></g>`;
  }
  // rows
  s += `<line class="pt-sep" x1="${X0}" x2="${W - 6}" y1="${T + nShallow * RH + GAP / 2}" y2="${T + nShallow * RH + GAP / 2}"/>`;
  depths.forEach((r, i) => {
    const yr = rowY(i), yd = pitY(r.z);
    const deep = r.z > 100;
    const temp = r.min !== null && r.max !== null && r.min !== undefined && r.max !== undefined ? `${fmtNum(r.min)} / ${fmtNum(r.max)}` : r.mean === null || r.mean === undefined ? '—' : fmtNum(r.mean);
    const thOk = r.th !== null && r.th !== undefined;
    const anomOk = r.anom !== null && r.anom !== undefined;
    const tip = `${r.z} cm: teplota ${temp} °C${deep ? (anomOk ? `, vlhkost ${ANOM_SHORT[Math.max(-3, Math.min(3, Math.round(r.anom)))]} než obvykle (nižší spolehlivost)` : '') : thOk ? `, vlhkost ${r.th.toFixed(2).replace('.', ',')} m³/m³` : ''}${r.interp ? ' · hloubku stanice ČHMÚ neměří, hodnota je dopočtená' : ''}`;
    s += `<g class="pt-row${deep ? ' lowrel' : ''}" data-tip="${esc(tip)}"><rect class="hit" x="${LX - 4}" y="${yr - RH / 2}" width="${W - LX + 4}" height="${RH}"/>`;
    if (i > 0 && i !== nShallow) s += `<line class="pt-rowline" x1="${LX + 30}" x2="${W - 6}" y1="${yr - RH / 2}" y2="${yr - RH / 2}"/>`;
    s += `<line class="pt-lead" x1="${X1}" x2="${LX}" y1="${yd}" y2="${yr}"/><circle class="pt-pin" cx="${X1}" cy="${yd}" r="2.6"/>`;
    s += `<text class="pt-depth" x="${LX + 28}" y="${yr + 4}" text-anchor="end">${r.z}</text>`;
    s += `<text class="pt-val" x="${TX}" y="${yr + 4}">${temp}${r.interp ? '<tspan class="pt-star" dx="2">*</tspan>' : ''}</text>`;
    if (deep) s += `<text class="pt-anom" x="${MX}" y="${yr + 4}">${anomOk ? esc(ANOM_SHORT[Math.max(-3, Math.min(3, Math.round(r.anom)))]) : 'bez dat'}</text>`;
    else {
      const f = thOk ? Math.max(0, Math.min(1, r.th / 0.5)) : 0;
      s += `<rect class="pt-track" x="${MX}" y="${yr - 3.5}" width="${BAR}" height="7" rx="3.5"/>`;
      if (f > 0) s += `<rect class="pt-fill" x="${MX}" y="${yr - 3.5}" width="${Math.max(7, BAR * f).toFixed(1)}" height="7" rx="3.5"/>`;
      s += `<text class="pt-val" x="${MX + BAR + 6}" y="${yr + 4}">${thOk ? r.th.toFixed(2).replace('.', ',') : '—'}</text>`;
    }
    s += `</g>`;
  });
  return s + `</svg>`;
}

const icon = (inner, w = 18, h = 12) => `<svg class="lgi" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${inner}</svg>`;

/** Compact legend under the pit: only the symbols that occur in this soil. */
export function pitLegend(soil) {
  const items = [];
  items.push(`<span class="lg-scale" title="Barva vrstvy podle zrnitosti"><span>písčitá</span><i>${TEXTURE_COLORS.map((c) => `<b style="background:${c}"></b>`).join('')}</i><span>jílovitá</span></span>`);
  if (soil.layers.some((l) => l.cfvo >= PIT_STONY)) items.push(`<span>${icon('<rect width="18" height="12" rx="2" class="lg-box" fill="var(--surface-2)"/><rect width="18" height="12" fill="url(#p-stone2)"/>')}kameny (≥ ${PIT_STONY} %)</span>`);
  if (soil.bedrock !== null) items.push(`<span>${icon('<rect width="18" height="12" rx="2" fill="url(#p-rock)"/><rect width="18" height="12" rx="2" class="lg-box"/>')}skála od ${Math.round(soil.bedrock)} cm</span>`);
  if (soil.gw !== null) items.push(`<span>${icon('<line x1="0" x2="18" y1="6" y2="6" class="pt-gw"/><path class="pt-gwmark" d="M4,1 h10 l-5,9z"/>')}podzemní voda ${Math.round(soil.gw)} cm</span>`);
  if (soil.perched) items.push(`<span>${icon('<rect width="18" height="12" rx="2" fill="var(--surface-2)"/><rect width="18" height="12" fill="url(#p-perch)"/><rect width="3" height="12" class="pt-perchbar"/><rect width="18" height="12" rx="2" class="lg-box"/>')}oglejení (voda se zdržuje)</span>`);
  return `<div class="pitlegend">${items.join('')}</div>`;
}

/** Collapsible per-layer texture details. */
export function pitDetails(soil) {
  const rows = soil.layers
    .map((l) => {
      const col = l.group === null ? 'var(--surface-2)' : TEXTURE_COLORS[l.group];
      return `<tr><td><i class="sw" style="background:${col}"></i>${l.name} cm</td><td>${l.cls ? esc(fullTexture(l.cls)) : 'bez údaje'}</td><td class="num">${l.cls ? `${l.clay} / ${l.silt} / ${l.sand}` : '—'}</td><td class="num">${l.cfvo} %</td></tr>`;
    })
    .join('');
  return `<details class="pitdet"><summary>Zrnitost a kamenitost po vrstvách</summary><table><thead><tr><th>Vrstva</th><th>Půdní druh</th><th class="num" title="jíl / prach / písek v %">jíl / prach / písek %</th><th class="num">kameny</th></tr></thead><tbody>${rows}</tbody></table></details>`;
}

/**
 * Model vs measured time series. `series` = [{name, values, cls}], time = ISO dates,
 * `split` = index of the first forecast day (shaded).
 */
export function seriesChart({ time, series, split, unit, title, height = 150 }) {
  const W = 400, H = height, L = 34, R = 8, T = 10, B = 22;
  const n = time.length;
  const dom = niceDomain(series.flatMap((s) => s.values), 0.08, 3);
  const x = (k) => L + (k / Math.max(1, n - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - dom[0]) / (dom[1] - dom[0])) * (H - T - B);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`;
  if (split !== null && split !== undefined && split < n) s += `<rect class="fcst" x="${x(split) - 2}" y="${T}" width="${W - R - x(split) + 2}" height="${H - T - B}"/><text class="reflabel" x="${W - R - 3}" y="${T + 11}" text-anchor="end">předpověď</text>`;
  for (const t of ticks(dom, 4)) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 6}" y="${y(t) + 3.5}" text-anchor="end">${fmtNum(t)}</text>`;
  const step = Math.max(1, Math.round(n / 5));
  for (let k = 0; k < n; k += step) {
    const [, m, d] = time[k].split('-').map(Number);
    s += `<text class="xl" x="${x(k)}" y="${H - 6}" text-anchor="middle">${d}. ${m}.</text>`;
  }
  for (const se of series) s += `<path class="line ${se.cls}" d="${path(se.values.map((v, k) => (v === null || v === undefined ? null : [x(k), y(v)])))}"/>`;
  const colW = (W - L - R) / Math.max(1, n - 1);
  time.forEach((t, k) => {
    const [, m, d] = t.split('-').map(Number);
    const parts = series.map((se) => `${se.name} ${se.values[k] === null || se.values[k] === undefined ? '—' : fmtNum(se.values[k]) + ' ' + unit}`);
    s += `<rect class="hit" data-tip="${esc(`${d}. ${m}.: ${parts.join(' · ')}`)}" x="${x(k) - colW / 2}" y="0" width="${colW}" height="${H}"/>`;
  });
  return s + `</svg>`;
}

/** Hover tooltip for any [data-tip] inside root. */
export function attachTooltips(root) {
  let tipEl = document.getElementById('tooltip');
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.id = 'tooltip';
    tipEl.className = 'tooltip';
    tipEl.hidden = true;
    document.body.append(tipEl);
  }
  const show = (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t || !root.contains(t)) return;
    tipEl.textContent = t.dataset.tip;
    tipEl.hidden = false;
    const r = t.getBoundingClientRect();
    const w = tipEl.offsetWidth;
    const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    tipEl.style.left = `${left}px`;
    tipEl.style.top = `${Math.max(8, r.top - tipEl.offsetHeight - 6)}px`;
  };
  root.addEventListener('pointerover', show);
  root.addEventListener('pointerout', (e) => {
    if (e.target.closest?.('[data-tip]')) tipEl.hidden = true;
  });
  root.addEventListener('scroll', () => (tipEl.hidden = true), { passive: true });
}
