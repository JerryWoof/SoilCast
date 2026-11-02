// "Moje pozemky": user-drawn fields kept in localStorage, their grid cells, and the averages over those cells.
// Everything here is pure (no DOM, no fetch) so it can be tested in node; main.js loads the blocks and draws.

import { toLaea } from './laea.js';

export const MAX_FIELDS = 20;
export const MAX_CELLS = 4000; // 250 m cells: 250 km², about 5 000 ha; larger polygons are refused
export const FIELDS_KEY = 'soilcast.fields.v1';
const CELL_AREA_HA = 6.25;

// ---------- storage ----------

const validRing = (r) =>
  Array.isArray(r) && r.length >= 3 && r.length <= 200 && r.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));

export function loadFields(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(FIELDS_KEY) ?? '[]');
    if (!Array.isArray(v)) return [];
    return v.filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string' && validRing(f.ring)).slice(0, MAX_FIELDS);
  } catch {
    return [];
  }
}

export function saveFields(list, storage = globalThis.localStorage) {
  try {
    storage?.setItem(FIELDS_KEY, JSON.stringify(list.slice(0, MAX_FIELDS)));
    return true;
  } catch {
    return false;
  }
}

const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

/** Adds a field; returns {list, field} or {error: 'full' | 'name' | 'ring'}. */
export function addField(list, name, ring, now = Date.now()) {
  if (list.length >= MAX_FIELDS) return { error: 'full' };
  const nm = cleanName(name);
  if (!nm) return { error: 'name' };
  if (!validRing(ring)) return { error: 'ring' };
  const id = `f${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const field = { id, name: nm, ring: ring.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]), created: now };
  return { list: [...list, field], field };
}

export const removeField = (list, id) => list.filter((f) => f.id !== id);
export const renameField = (list, id, name) => {
  const nm = cleanName(name);
  return nm ? list.map((f) => (f.id === id ? { ...f, name: nm } : f)) : list;
};

// ---------- geometry ----------

/** Centroid of a lon/lat ring (plain mean of the vertices is enough to place a pin). */
export function ringCenter(ring) {
  const n = ring.length;
  return { lng: ring.reduce((a, p) => a + p[0], 0) / n, lat: ring.reduce((a, p) => a + p[1], 0) / n };
}

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Area in km² (LAEA is equal-area, so the shoelace formula in projected metres is exact up to the edge approximation). */
export function ringAreaKm2(ring) {
  const p = ring.map(([lo, la]) => toLaea(lo, la));
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return Math.abs(s) / 2 / 1e6;
}

/**
 * Grid cells whose centre lies inside the ring. {cells: [{r,c,br,bc,i}], tooBig}.
 * A polygon smaller than one cell (no centre inside) falls back to the cell under its centroid.
 */
export function polygonCells(grid, ring) {
  const p = ring.map(([lo, la]) => toLaea(lo, la));
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  const c0 = Math.max(0, Math.floor((Math.min(...xs) - grid.x0) / grid.cell));
  const c1 = Math.min(grid.nx - 1, Math.floor((Math.max(...xs) - grid.x0) / grid.cell));
  const r0 = Math.max(0, Math.floor((grid.y0 - Math.max(...ys)) / grid.cell));
  const r1 = Math.min(grid.ny - 1, Math.floor((grid.y0 - Math.min(...ys)) / grid.cell));
  if ((c1 - c0 + 1) * (r1 - r0 + 1) > MAX_CELLS * 4) return { cells: [], tooBig: true };
  const b = grid.block;
  const mk = (r, c) => {
    const br = Math.floor(r / b);
    const bc = Math.floor(c / b);
    return { r, c, br, bc, i: (r - br * b) * b + (c - bc * b) };
  };
  const cells = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const x = grid.x0 + (c + 0.5) * grid.cell;
      const y = grid.y0 - (r + 0.5) * grid.cell;
      if (inRing([x, y], p)) cells.push(mk(r, c));
    }
  }
  if (cells.length > MAX_CELLS) return { cells: [], tooBig: true };
  if (!cells.length) {
    const cen = ringCenter(ring);
    const [x, y] = toLaea(cen.lng, cen.lat);
    const c = Math.floor((x - grid.x0) / grid.cell);
    const r = Math.floor((grid.y0 - y) / grid.cell);
    if (r >= 0 && c >= 0 && r < grid.ny && c < grid.nx) cells.push(mk(r, c));
  }
  return { cells, tooBig: false };
}

export const cellsToHa = (n) => n * CELL_AREA_HA;

// ---------- averaging ----------

const num = (v) => typeof v === 'number' && Number.isFinite(v);
// Static fields that are codes, not quantities: the most common value wins instead of a mean.
const MODE_STATIC = new Set(['land', 'cover', 'texture', 'confidence', 'bottom', 'soil_type', 'soil_src', 'gw_class', 'perched', 'quaternary', 'geology', 'water', 'ero_cls', 'dzes_seo', 'dzes_meo', 'bpej', 'kr']);
const FLAG_BITS = [1, 2, 4, 8];

const mean = (xs) => {
  const v = xs.filter(num);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const max = (xs) => {
  const v = xs.filter(num);
  return v.length ? Math.max(...v) : null;
};
const min = (xs) => {
  const v = xs.filter(num);
  return v.length ? Math.min(...v) : null;
};
function mode(xs) {
  const m = new Map();
  for (const v of xs) if (num(v)) m.set(v, (m.get(v) ?? 0) + 1);
  let best = null;
  let n = 0;
  for (const [v, k] of m) if (k > n) [best, n] = [v, k];
  return best;
}

/** Bits set in at least half of the cells that have a value. */
function majorityBits(xs, bits) {
  const v = xs.filter(num);
  if (!v.length) return null;
  let out = 0;
  for (const b of bits) if (v.filter((x) => (x & b) !== 0).length * 2 >= v.length) out |= b;
  return out;
}
function orBits(xs) {
  const v = xs.filter(num);
  return v.length ? v.reduce((a, b) => a | b, 0) : null;
}

/** How a daily field is combined across cells. */
function dayRule(name) {
  if (name === 'flags') return (xs) => majorityBits(xs, FLAG_BITS);
  if (name === 'ero_why') return orBits;
  if (name === 'ero' || name === 'pmax') return max;
  return mean;
}

/**
 * Combines decoded cells (blocks.js `cell(i)` objects) into one pseudo cell with the same shape, so the panel and
 * the decision cards work unchanged. Water / no-land cells are ignored.
 * Returns {cell, n, spread} or null without any land cell. spread = per day {t5:[lo,hi], vvk:[lo,hi], rain:[lo,hi]}:
 * the coldest morning / warmest afternoon, driest / wettest cell, least / most rain over the cells.
 */
export function aggregateCells(cells) {
  const land = cells.filter((c) => c?.static?.land);
  if (!land.length) return null;
  const first = land[0];
  const out = { static: {}, daily: {} };
  for (const [name, v] of Object.entries(first.static)) {
    if (Array.isArray(v)) out.static[name] = v.map((_, k) => mean(land.map((c) => c.static[name]?.[k])));
    else out.static[name] = MODE_STATIC.has(name) ? mode(land.map((c) => c.static[name])) : mean(land.map((c) => c.static[name]));
  }
  for (const [name, comps] of Object.entries(first.daily)) {
    const rule = dayRule(name);
    out.daily[name] = {};
    for (const [label, series] of Object.entries(comps)) {
      out.daily[name][label] = series.map((_, d) => rule(land.map((c) => c.daily[name]?.[label]?.[d])));
    }
  }
  const nd = first.daily.t?.t5_min?.length ?? 0;
  const col = (name, label, d) => land.map((c) => c.daily[name]?.[label]?.[d]);
  const spread = Array.from({ length: nd }, (_, d) => ({
    t5: [min(col('t', 't5_min', d)), max(col('t', 't5_max', d))],
    vvk: [min(col('vvk', '0-40', d)), max(col('vvk', '0-40', d))],
    rain: [min(col('precip', 'mm', d)), max(col('precip', 'mm', d))],
  }));
  return { cell: out, n: land.length, spread };
}

// ---------- CSV ----------

const csvNum = (v, digits = 2) => (num(v) ? String(Math.round(v * 10 ** digits) / 10 ** digits) : '');

/**
 * CSV of the days for a point or a field. `days` are 'YYYY-MM-DD'; `cell` is a decoded or aggregated cell.
 * Dot decimals, comma separator, UTF-8; the licence line comes first as a comment.
 */
export function cellToCsv({ days, cell, meta = {} }) {
  const d = cell.daily;
  const g = (name, label, k) => d[name]?.[label]?.[k];
  const cols = [
    ['date', (k) => days[k]],
    ['t2_min_C', (k) => csvNum(g('t', 't2_min', k))],
    ['t2_max_C', (k) => csvNum(g('t', 't2_max', k))],
    ['t5_min_C', (k) => csvNum(g('t', 't5_min', k))],
    ['t5_max_C', (k) => csvNum(g('t', 't5_max', k))],
    ['t10_min_C', (k) => csvNum(g('t', 't10_min', k))],
    ['t10_max_C', (k) => csvNum(g('t', 't10_max', k))],
    ['t20_C', (k) => csvNum(g('t', 't20', k))],
    ['t50_C', (k) => csvNum(g('t', 't50', k))],
    ['t100_C', (k) => csvNum(g('t', 't100', k))],
    ['vvk_0_10_pct', (k) => csvNum(g('vvk', '0-10', k), 0)],
    ['vvk_0_40_pct', (k) => csvNum(g('vvk', '0-40', k), 0)],
    ['vvk_0_40_low_pct', (k) => csvNum(g('vvk_lo', '0-40', k), 0)],
    ['vvk_0_40_high_pct', (k) => csvNum(g('vvk_hi', '0-40', k), 0)],
    ['vvk_0_100_pct', (k) => csvNum(g('vvk', '0-100', k), 0)],
    ['available_water_0_40_mm', (k) => csvNum(g('avail_mm', '0-40', k), 0)],
    ['precip_mm', (k) => csvNum(g('precip', 'mm', k) ?? g('precip', 'value', k), 1)],
    ['frost_depth_cm', (k) => csvNum(g('frost_depth', 'value', k) ?? g('frost_depth', 'cm', k), 0)],
    ['snow_cm', (k) => csvNum(g('snow', 'value', k) ?? g('snow', 'cm', k), 0)],
  ];
  const head = [
    `# Pudomer (pudomer.cz): model estimate, not a measurement. Data CC BY-SA 4.0. ${meta.what ?? ''}`.trim(),
    meta.cycle ? `# model cycle ${meta.cycle}` : null,
    cols.map((c) => c[0]).join(','),
  ].filter(Boolean);
  const rows = days.map((_, k) => cols.map((c) => c[1](k)).join(','));
  return `${head.join('\n')}\n${rows.join('\n')}\n`;
}

// ---------- Telegram alert deep link ----------

export const ALERT_COND = { frost: 0, sow: 1, irrigate: 2 };

/** Douglas-Peucker on [lon, lat] until at most `max` vertices remain (tolerance grows). */
export function simplifyRing(ring, maxVerts = 12) {
  let pts = ring.slice();
  const dist = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  // Drop the vertex that deviates least from its neighbours until the limit is reached.
  while (pts.length > maxVerts) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = dist(pts[i], pts[(i + pts.length - 1) % pts.length], pts[(i + 1) % pts.length]);
      if (d < bd) [bi, bd] = [i, d];
    }
    pts = pts.filter((_, i) => i !== bi);
  }
  return pts;
}

class Bits {
  constructor() {
    this.b = [];
  }
  put(v, n) {
    for (let i = n - 1; i >= 0; i--) this.b.push((v >> i) & 1);
  }
  bytes() {
    const out = [];
    for (let i = 0; i < this.b.length; i += 8) {
      let x = 0;
      for (let j = 0; j < 8; j++) x = (x << 1) | (this.b[i + j] ?? 0);
      out.push(x);
    }
    return Uint8Array.from(out);
  }
}
const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

// Quantisation: 1e-3 degree (about 75-110 m, finer than the 250 m cell) inside the grid's lon/lat box.
const LON0 = 12;
const LAT0 = 48.5;
const Q = 1000;

/**
 * Telegram `start` payload (at most 64 characters of [A-Za-z0-9_-]). Layout, big-endian bit fields:
 *   ver(4)=1 | cond(2) | kind(1: 0 point, 1 polygon) | spare(1) | threshold(8, offset +40) | days(4)
 *   point: lat(13) lon(13);  polygon: n-3(4) then n x (lat(13) lon(13))
 * cond: 0 soil temperature at 5 cm at or below `threshold` degrees C (frost); 1 morning T5 at or above
 * `threshold` for `days` days (sowing); 2 VVK 0-40 below `threshold` percent (irrigation).
 * No name, no user data: the chat id is the only personal datum the backend will ever hold.
 */
export function encodeAlertPayload({ cond, threshold, days = 1, ring = null, lat = null, lng = null }) {
  if (!(cond in { 0: 1, 1: 1, 2: 1 })) throw new Error('bad condition');
  const th = Math.round(threshold) + 40;
  if (th < 0 || th > 255) throw new Error('bad threshold');
  const w = new Bits();
  w.put(1, 4);
  w.put(cond, 2);
  const poly = Array.isArray(ring);
  w.put(poly ? 1 : 0, 1);
  w.put(0, 1);
  w.put(th, 8);
  w.put(Math.max(1, Math.min(15, Math.round(days))), 4);
  const q = ([lo, la]) => [Math.round((la - LAT0) * Q), Math.round((lo - LON0) * Q)];
  const putPt = ([la, lo]) => {
    if (la < 0 || la >= 8192 || lo < 0 || lo >= 8192) throw new Error('outside the grid');
    w.put(la, 13);
    w.put(lo, 13);
  };
  if (poly) {
    const pts = simplifyRing(ring, 12).map(q);
    w.put(pts.length - 3, 4);
    pts.forEach(putPt);
  } else putPt(q([lng, lat]));
  const s = b64u(w.bytes());
  if (s.length > 64) throw new Error('payload too long');
  return s;
}

export function decodeAlertPayload(s) {
  const u = unb64u(s);
  let pos = 0;
  const get = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) {
      v = (v << 1) | ((u[pos >> 3] >> (7 - (pos & 7))) & 1);
      pos++;
    }
    return v;
  };
  const ver = get(4);
  if (ver !== 1) throw new Error('unknown version');
  const cond = get(2);
  const poly = get(1) === 1;
  get(1);
  const threshold = get(8) - 40;
  const days = get(4);
  const pt = () => {
    const la = get(13);
    const lo = get(13);
    return [lo / Q + LON0, la / Q + LAT0];
  };
  if (poly) {
    const n = get(4) + 3;
    return { cond, threshold, days, ring: Array.from({ length: n }, pt) };
  }
  const [lng, lat] = pt();
  return { cond, threshold, days, lat, lng };
}

export function telegramLink(bot, payload) {
  return `https://t.me/${encodeURIComponent(bot)}?start=${payload}`;
}
