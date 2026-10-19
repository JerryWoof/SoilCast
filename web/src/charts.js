// Small SVG charts as strings. Colours come from CSS custom properties so
// light and dark mode work without re-rendering.

import { fmtNum } from './cards.js';
import { LAYER_BOUNDS, TEXTURE_COLORS, textureInk, shortTexture, fullTexture } from './soil.js';

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
const rnd = (i) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * Soil pit 0–200 cm. Six texture bands of equal height (the depth axis is
 * piecewise linear inside each layer, so thin top layers stay readable), with
 * stones, bedrock, groundwater and stagnic water, and per display depth the
 * temperature and moisture of the selected day on the same vertical scale.
 * depths: [{z, min, max, mean, th, anom}], vvk: [{z, label, v}] extra lines.
 */
export function soilPitChart({ soil, depths, vvk = [], title }) {
  const W = 340, T = 34, BH = 40, X0 = 40, X1 = 140, TX = 148, MX = 232, BAR = 62;
  const H = T + BH * 6 + 10;
  const yAt = (z) => {
    const zc = Math.max(0, Math.min(200, z));
    let k = LAYER_BOUNDS.findIndex((b, i) => zc <= LAYER_BOUNDS[i + 1] && i < 6);
    if (k < 0) k = 5;
    return T + k * BH + ((zc - LAYER_BOUNDS[k]) / (LAYER_BOUNDS[k + 1] - LAYER_BOUNDS[k])) * BH;
  };
  let s = `<svg class="chart pit" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`;
  s += `<defs>
    <pattern id="p-rock" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="var(--rock)"/><line x1="0" y1="0" x2="0" y2="7" stroke="var(--rock-ink)" stroke-width="2.4"/></pattern>
    <pattern id="p-perch" width="12" height="9" patternUnits="userSpaceOnUse"><ellipse cx="3" cy="2.5" rx="2.6" ry="1.4" fill="#d9772e"/><ellipse cx="9" cy="6.5" rx="2.6" ry="1.4" fill="#d9772e"/><ellipse cx="9" cy="1.8" rx="1.8" ry="1.1" fill="#7f9bb0"/><ellipse cx="3" cy="7" rx="1.8" ry="1.1" fill="#7f9bb0"/></pattern>
    <clipPath id="pit-clip"><rect x="${X0}" y="${T}" width="${X1 - X0}" height="${BH * 6}"/></clipPath></defs>`;
  s += `<text class="pt-head" x="${X0}" y="${T - 20}">Řez půdou</text><text class="pt-head" x="${TX}" y="${T - 20}">Teplota °C</text><text class="pt-head" x="${MX}" y="${T - 20}">Vlhkost m³/m³</text>`;
  s += `<text class="pt-sub" x="${TX}" y="${T - 9}">ráno min / den max</text>`;
  // texture bands
  soil.layers.forEach((l, k) => {
    const y = T + k * BH;
    const col = l.group === null ? 'var(--surface-2)' : TEXTURE_COLORS[l.group];
    const ink = l.group === null ? 'var(--muted)' : textureInk(l.group);
    const halo = col;
    const tip = l.cls ? `${l.name} cm: ${fullTexture(l.cls)} (jíl ${l.clay} %, prach ${l.silt} %, písek ${l.sand} %), kameny ${l.cfvo} %` : `${l.name} cm: bez údaje`;
    s += `<g data-tip="${esc(tip)}"><rect x="${X0}" y="${y}" width="${X1 - X0}" height="${BH}" fill="${col}"/>`;
    const n = Math.round((l.cfvo / 100) * 90);
    for (let d = 0; d < n; d++) {
      const r = 1.2 + rnd(k * 997 + d * 3 + 1) * 1.6;
      const cx = X0 + 3 + rnd(k * 997 + d * 3) * (X1 - X0 - 6);
      const cy = y + 3 + rnd(k * 997 + d * 3 + 2) * (BH - 6);
      s += `<ellipse class="stone" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 0.78).toFixed(1)}"/>`;
    }
    s += `<text class="pt-tex" fill="${ink}" style="stroke:${halo}" x="${(X0 + X1) / 2}" y="${y + 17}" text-anchor="middle">${esc(l.cls ? shortTexture(l.cls) : 'bez údaje')}</text>`;
    if (l.cls) s += `<text class="pt-mix" fill="${ink}" style="stroke:${halo}" x="${(X0 + X1) / 2}" y="${y + 29}" text-anchor="middle">jíl ${l.clay} · písek ${l.sand} %</text>`;
    s += `</g>`;
    if (k > 0) s += `<line class="pt-edge" x1="${X0}" x2="${X1}" y1="${y}" y2="${y}"/>`;
  });
  // depth axis
  LAYER_BOUNDS.forEach((b, k) => {
    const y = T + k * BH;
    s += `<line class="pt-axis" x1="${X0 - 4}" x2="${X0}" y1="${y}" y2="${y}"/><text class="tick" x="${X0 - 6}" y="${y + (k === 0 ? 8 : k === 6 ? -1 : 3.5)}" text-anchor="end">${b}</text>`;
  });
  s += `<text class="pt-sub" x="2" y="${T - 9}">cm</text>`;
  // lower, less reliable part
  const yDeep = yAt(100);
  s += `<rect class="pt-veil" x="${X0}" y="${yDeep}" width="${X1 - X0}" height="${BH}"/>`;
  s += `<rect class="pt-frame" x="${X0}" y="${T}" width="${X1 - X0}" height="${BH * 6}"/>`;
  // stagnic water
  if (soil.perched) {
    const y1 = yAt(30), y2 = yAt(100);
    s += `<g data-tip="oglejení – voda se drží (vrstva 30–100 cm)"><rect x="${X0}" y="${y1}" width="${X1 - X0}" height="${y2 - y1}" fill="url(#p-perch)" opacity="0.55"/><rect x="${X1 - 4}" y="${y1}" width="4" height="${y2 - y1}" fill="#d9772e"/></g>`;
  }
  // bedrock
  if (soil.bedrock !== null) {
    const y = yAt(soil.bedrock);
    s += `<g data-tip="${esc(`mělká skála od ${Math.round(soil.bedrock)} cm`)}"><rect x="${X0}" y="${y}" width="${X1 - X0}" height="${T + BH * 6 - y}" fill="url(#p-rock)"/><line class="pt-rockline" x1="${X0}" x2="${X1}" y1="${y}" y2="${y}"/>`;
    if (T + BH * 6 - y > 16) s += `<text class="pt-rocklabel" x="${(X0 + X1) / 2}" y="${y + 13}" text-anchor="middle">skála od ${Math.round(soil.bedrock)} cm</text>`;
    s += `</g>`;
  }
  // measurements per display depth
  const sep = yDeep + 9;
  s += `<line class="deepsep" x1="${TX - 2}" x2="${W - 4}" y1="${sep}" y2="${sep}"/><text class="pt-low" x="${TX}" y="${sep + 9}">pod 1 m: nižší spolehlivost</text>`;
  for (const r of depths) {
    const y = yAt(r.z);
    const deep = r.z > 100;
    const temp = r.min !== null && r.max !== null && r.min !== undefined ? `${fmtNum(r.min)} / ${fmtNum(r.max)}` : r.mean === null || r.mean === undefined ? '—' : fmtNum(r.mean);
    const mois = deep ? (r.anom === null || r.anom === undefined ? 'bez dat' : ANOM_SHORT[Math.max(-3, Math.min(3, Math.round(r.anom)))]) : r.th === null || r.th === undefined ? '—' : fmtNum(r.th, 2);
    const tip = `${r.z} cm: teplota ${temp} °C${deep ? `, vlhkost ${mois} než obvykle (nižší spolehlivost)` : r.th !== null && r.th !== undefined ? `, vlhkost ${fmtNum(r.th, 2)} m³/m³` : ''}${r.interp ? ' · hloubku stanice ČHMÚ neměří' : ''}`;
    s += `<g class="pt-row${deep ? ' lowrel' : ''}" data-tip="${esc(tip)}"><rect class="hit" x="0" y="${y - 10}" width="${W}" height="20"/>`;
    s += `<line class="pt-lead" x1="${X1}" x2="${TX - 4}" y1="${y}" y2="${y}"/><circle class="pt-pin" cx="${X1}" cy="${y}" r="2.6"/>`;
    s += `<text class="pt-val" x="${TX}" y="${y + 4}">${temp}${r.interp ? '<tspan class="pt-star">*</tspan>' : ''}</text>`;
    if (deep) s += `<text class="pt-anom" x="${MX}" y="${y + 4}">${esc(mois)}</text>`;
    else {
      const f = r.th === null || r.th === undefined ? 0 : Math.max(0, Math.min(1, r.th / 0.5));
      s += `<rect class="pt-track" x="${MX}" y="${y - 4}" width="${BAR}" height="8" rx="4"/><rect class="pt-fill" x="${MX}" y="${y - 4}" width="${(BAR * f).toFixed(1)}" height="8" rx="4"/>`;
      s += `<text class="pt-val" x="${MX + BAR + 6}" y="${y + 4}">${mois}</text>`;
    }
    s += `</g>`;
    const extra = vvk.find((e) => e.z === r.z);
    if (extra && extra.v !== null && extra.v !== undefined) s += `<text class="pt-vvk" x="${MX}" y="${y + 15}">${esc(extra.label)}: ${extra.v > 100 ? 'nad PK, ' : ''}${Math.round(extra.v)} % VVK</text>`;
  }
  // groundwater
  if (soil.gw !== null) {
    const y = yAt(soil.gw);
    // put the label above or below the line, wherever it clears the value texts on the right
    const zones = depths.flatMap((r) => [[yAt(r.z) - 8, yAt(r.z) + 4], ...(vvk.some((e) => e.z === r.z) ? [[yAt(r.z) + 6, yAt(r.z) + 16]] : [])]);
    const overlap = (b) => zones.reduce((t, [a, c]) => t + Math.max(0, Math.min(b + 2, c) - Math.max(b - 8, a)), 0);
    let gwY = y - 4, best = Infinity;
    for (let b = y - 16; b <= y + 22; b += 0.5) {
      if (b > y - 3 && b < y + 11) continue;
      const score = overlap(b) * 10 + Math.abs(b - y);
      if (score < best) [best, gwY] = [score, b];
    }
    s += `<g data-tip="${esc(`podzemní voda v ${Math.round(soil.gw)} cm`)}"><line class="pt-gw" x1="${X0 - 6}" x2="${W - 4}" y1="${y}" y2="${y}"/><path class="pt-gwmark" d="M${X0 - 6},${y} l-7,-6 h14z" transform="translate(${-1},0)"/><text class="pt-gwlabel" x="${W - 4}" y="${gwY}" text-anchor="end">podzemní voda ${Math.round(soil.gw)} cm</text></g>`;
  }
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
