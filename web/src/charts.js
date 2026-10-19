// Small SVG charts as strings. Colours come from CSS custom properties so
// light and dark mode work without re-rendering.

import { fmtNum } from './cards.js';

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

/**
 * Vertical profile: depth downwards, temperature to the right.
 * rows: [{z, min, max, mean}] for 0–100 cm; deep: [{z, mean}].
 */
export function profileChart(rows, deep, { selectedLabel } = {}) {
  // Rows are equally spaced (like the table next to it), not to depth scale.
  const W = 132, T = 36.8, step = 25.6, gap = 18, L = 28, R = 8;
  const H = T + (rows.length + deep.length - 1) * step + gap + 12;
  const vals = [...rows.flatMap((r) => [r.min, r.max, r.mean]), ...deep.map((d) => d.mean)];
  const dom = niceDomain(vals, 0.12, 4);
  const x = (v) => L + ((v - dom[0]) / (dom[1] - dom[0])) * (W - L - R);
  const yRow = (k) => T + k * step + (k >= rows.length ? gap : 0);
  let s = `<svg class="chart profile-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Teplotní profil ${esc(selectedLabel ?? '')}">`;
  for (const t of ticks(dom, 3)) s += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${T - 6}" y2="${H - 6}"/><text class="tick" x="${x(t)}" y="${T - 20}" text-anchor="middle">${fmtNum(t)}°</text>`;
  if (dom[0] < 0 && dom[1] > 0) s += `<line class="zero" x1="${x(0)}" x2="${x(0)}" y1="${T - 6}" y2="${H - 6}"/>`;
  const sepY = yRow(rows.length - 1) + (step + gap) / 2;
  s += `<line class="deepsep" x1="2" x2="${W - 2}" y1="${sepY}" y2="${sepY}"/>`;
  [...rows, ...deep].forEach((r, k) => (s += `<text class="tick" x="${L - 6}" y="${yRow(k) + 3.5}" text-anchor="end">${r.z}</text>`));
  rows.forEach((r, k) => {
    if (r.min !== null && r.max !== null) s += `<line class="whisker" x1="${x(r.min)}" x2="${x(r.max)}" y1="${yRow(k)}" y2="${yRow(k)}"/>`;
  });
  const pts = rows.map((r, k) => (r.mean === null ? null : [x(r.mean), yRow(k)]));
  s += `<path class="line" style="stroke:var(--temp)" d="${path(pts)}"/>`;
  pts.forEach((p) => p && (s += `<circle class="dot" style="fill:var(--temp)" cx="${p[0]}" cy="${p[1]}" r="3"/>`));
  const dpts = deep.map((d, k) => (d.mean === null ? null : [x(d.mean), yRow(rows.length + k)]));
  s += `<path class="line deep" style="stroke:var(--temp)" d="${path(dpts)}"/>`;
  dpts.forEach((p) => p && (s += `<circle class="dot hollow" style="stroke:var(--temp)" cx="${p[0]}" cy="${p[1]}" r="3"/>`));
  return s + `</svg>`;
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
