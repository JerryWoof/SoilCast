#!/usr/bin/env node
// Writes a synthetic sample of the engine's published outputs into
// public/data/ (git-ignored) for local development and browser tests.
// Values are plausible but invented. Usage: node scripts/fake-data.mjs [outDir]

import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { gzipSync, deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toLaea, gridCell } from '../src/laea.js';
import { encodeBlock } from '../src/blocks.js';
import { insideGeometry } from '../src/manifest.js';
import { FORMAT_V1, FORMAT_V11 } from './format-v1.mjs';
import { usdaClass } from '../src/soil.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.argv[2] ?? join(ROOT, 'public', 'data');
const cz = JSON.parse(readFileSync(join(ROOT, 'public', 'cz.geojson'), 'utf8')).features[0].geometry;

const NDAYS = 7;
const GRID = { crs: 'EPSG:3035', x0: 4460000, y0: 3130000, cell: 250, nx: 2080, ny: 1160, block: 32 };
const BOUNDS = [[12.09, 48.55], [18.86, 51.06]];

// ---------- time ----------
const now = new Date();
const analysis = new Date(Math.floor((now.getTime() - 2 * 3_600_000) / 21_600_000) * 21_600_000);
const pragueDate = (t) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(t);
const d0 = new Date(`${pragueDate(now)}T12:00:00Z`);
const days = Array.from({ length: NDAYS }, (_, k) => pragueDate(new Date(d0.getTime() + k * 86_400_000)));
const doy = Math.floor((d0 - new Date(Date.UTC(d0.getUTCFullYear(), 0, 0))) / 86_400_000);
const iso = (t) => t.toISOString().replace(/\.\d+Z$/, 'Z');

// ---------- synthetic fields as functions of lon/lat ----------
const g = (x, y, x0, y0, sx, sy) => Math.exp(-(((x - x0) / sx) ** 2) - ((y - y0) / sy) ** 2);
function elevation(lon, lat) {
  return (
    230 +
    900 * g(lon, lat, 15.6, 50.75, 0.5, 0.12) + // Krkonoše
    750 * g(lon, lat, 13.6, 49.0, 0.7, 0.25) + // Šumava
    380 * g(lon, lat, 15.7, 49.5, 0.8, 0.35) + // Vysočina
    700 * g(lon, lat, 17.2, 50.1, 0.35, 0.15) + // Jeseníky
    500 * g(lon, lat, 18.4, 49.5, 0.35, 0.15) + // Beskydy
    350 * g(lon, lat, 13.0, 50.45, 0.8, 0.1) + // Krušné hory
    -60 * g(lon, lat, 14.3, 50.35, 0.5, 0.3) - // Polabí
    40 * g(lon, lat, 16.9, 48.9, 0.6, 0.3) // jižní Morava
  );
}
// Synoptic anomaly of the surface (°C) for d0..d6: mild, then a cold spell.
const WX = [1.2, 1.8, 0.2, -2.6, -6.5, -8.6, -5.2];
// Rain arrives on d2.
const RAIN = [0, 0, 1, 0.3, 0, 0, 0];
const RAIN_MM = [0.5, 0, 14, 4, 0, 1.5, 7]; // regional daily totals for the synthetic forecast

function tAt(depthCm, lon, lat, d) {
  const elev = elevation(lon, lat);
  const z = depthCm / 100;
  const D = 2.3; // annual damping depth (m)
  const lag = (z / D) * (365 / (2 * Math.PI));
  const annual = 9.3 + 10.5 * Math.exp(-z / D) * Math.cos((2 * Math.PI * (doy - 205 - lag)) / 365);
  const lapse = -0.55 * ((elev - 250) / 100);
  const east = 0.4 * (lon - 15);
  // multi-day weather anomaly damps quickly with depth and lags a little
  const dl = Math.max(0, Math.min(NDAYS - 1, d - Math.round(depthCm / 40)));
  const synoptic = WX[dl] * Math.exp(-depthCm / 22);
  return annual + lapse + east + synoptic;
}
const DIURNAL = { 2: 4.2, 5: 2.6, 10: 1.2 };

function vvkAt(layer, lon, lat, d) {
  const elev = elevation(lon, lat);
  const base = 50 + 0.05 * (elev - 250) + 12 * Math.sin(lon * 2.7) * Math.cos(lat * 3.1) - 8 * g(lon, lat, 14.4, 50.3, 0.8, 0.4) - 6 * g(lon, lat, 16.8, 49.0, 0.7, 0.4);
  let rain = 0;
  for (let k = 0; k <= d; k++) rain = rain * 0.86 + RAIN[k];
  const amp = { '0-10': 46, '0-40': 20, '0-100': 7 }[layer];
  const dry = { '0-10': -2.2, '0-40': -1.0, '0-100': -0.4 }[layer] * d;
  const offset = { '0-10': -4, '0-40': 0, '0-100': 6 }[layer];
  return Math.max(3, base + offset + amp * rain + dry);
}
function frostAt(lon, lat, d) {
  const t2min = tAt(2, lon, lat, d) - DIURNAL[2];
  return t2min < 0 ? Math.min(40, Math.round(-t2min * 3)) : 0;
}

// ---------- inverse LAEA (Newton on the forward projection) ----------
function fromLaea(x, y) {
  let lon = 15, lat = 50;
  for (let k = 0; k < 8; k++) {
    const [fx, fy] = toLaea(lon, lat);
    const [ax, ay] = toLaea(lon + 1e-4, lat);
    const [bx, by] = toLaea(lon, lat + 1e-4);
    const j11 = (ax - fx) / 1e-4, j21 = (ay - fy) / 1e-4, j12 = (bx - fx) / 1e-4, j22 = (by - fy) / 1e-4;
    const det = j11 * j22 - j12 * j21;
    const ex = x - fx, ey = y - fy;
    lon += (j22 * ex - j12 * ey) / det;
    lat += (-j21 * ex + j11 * ey) / det;
  }
  return [lon, lat];
}

// ---------- blocks ----------
function hash(i) {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}
const FC = { 1: 0.42, 2: 0.4, 3: 0.36, 4: 0.36, 5: 0.38, 6: 0.3, 7: 0.31, 8: 0.33, 9: 0.22, 10: 0.33, 11: 0.15, 12: 0.11 };
const WP = { 1: 0.27, 2: 0.25, 3: 0.23, 4: 0.2, 5: 0.2, 6: 0.17, 7: 0.13, 8: 0.11, 9: 0.08, 10: 0.07, 11: 0.05, 12: 0.04 };

// Soil types as in manifest.soil_types, with a plausible profile for each.
const SOIL_TYPES = [
  { id: 0, tksp: 'kambizem modální', wrb: 'Haplic Cambisol', group: 'kambizem' },
  { id: 1, tksp: 'hnědozem modální', wrb: 'Haplic Luvisol', group: 'hnědozem' },
  { id: 2, tksp: 'černozem modální', wrb: 'Haplic Chernozem', group: 'černozem' },
  { id: 3, tksp: 'pseudoglej modální', wrb: 'Haplic Stagnosol', group: 'pseudoglej' },
  { id: 4, tksp: 'fluvizem modální', wrb: 'Haplic Fluvisol', group: 'fluvizem' },
  { id: 5, tksp: 'podzol modální', wrb: 'Haplic Podzol', group: 'podzol' },
  { id: 6, tksp: 'rendzina modální', wrb: 'Rendzic Leptosol', group: 'rendzina' },
];
const GEOLOGY = [
  { id: 0, name: 'žuly a granodiority', era: 'paleozoikum' },
  { id: 1, name: 'spraše a sprašové hlíny', genesis: 'eolická', era: 'kvartér' },
  { id: 2, name: 'fluviální písky a štěrky (terasy)', genesis: 'fluviální', era: 'kvartér' },
  { id: 3, name: 'deluviální hlinitokamenité sedimenty', genesis: 'deluviální', era: 'kvartér' },
  { id: 4, name: 'eolické písky', genesis: 'eolická', era: 'kvartér' },
];
const QUATERNARY = ['bez kvartérního pokryvu', 'spraše', 'fluviální písky a štěrky', 'deluviální sedimenty', 'eolické písky'];
const PROFILES = [
  { clay: [18, 18, 20, 24, 26, 22], sand: [35, 35, 33, 30, 28, 30], cfvo: [8, 10, 12, 18, 25, 35], bedrock: null, gw: null, perched: 0, q: 3 },
  { clay: [17, 17, 18, 26, 28, 24], sand: [20, 20, 19, 15, 14, 16], cfvo: [0, 0, 1, 2, 3, 5], bedrock: null, gw: null, perched: 0, q: 1 },
  { clay: [24, 24, 24, 22, 20, 19], sand: [14, 14, 14, 14, 16, 18], cfvo: [0, 0, 0, 0, 1, 2], bedrock: null, gw: null, perched: 0, q: 1 },
  { clay: [22, 22, 24, 38, 42, 40], sand: [22, 22, 20, 14, 12, 12], cfvo: [2, 2, 3, 4, 6, 8], bedrock: null, gw: null, perched: 1, q: 3 },
  { clay: [14, 14, 12, 10, 8, 5], sand: [38, 38, 42, 50, 60, 75], cfvo: [2, 2, 4, 10, 20, 35], bedrock: null, gw: 120, perched: 0, q: 2 },
  { clay: [5, 5, 6, 8, 6, 4], sand: [78, 78, 76, 72, 78, 85], cfvo: [5, 6, 8, 12, 18, 25], bedrock: null, gw: null, perched: 0, q: 4 },
  { clay: [28, 28, 30, 32, 32, 30], sand: [20, 20, 20, 18, 15, 15], cfvo: [20, 25, 35, 50, 60, 70], bedrock: 60, gw: null, perched: 0, q: 0 },
];
// Soil of each landscape patch (0-4) and the soils offered in the options file, with their share nearby.
const PATCH_SOIL = { praha: [1, 3, 4, 0, 2], brno: [2, 1, 4, 3, 6] };
const OPTION_SOILS = { praha: [[1, 0.34], [3, 0.24], [4, 0.17], [0, 0.12], [2, 0.08], [5, 0.05]], brno: [[2, 0.38], [1, 0.22], [4, 0.14], [3, 0.12], [6, 0.09], [0, 0.05]] };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const TCOMP = FORMAT_V1.daily[0].components;
const VLAYERS = ['0-10', '0-40', '0-100'];
const DEPTHS = [2, 5, 10, 20, 30, 50, 75, 100];

/** All fields of one model column (a grid cell or an option), physical values. */
function buildCell({ lon, lat, h, urban, cover, soilId, src, profile, jitter = 0 }) {
  const clay = profile.clay.map((v) => clamp(Math.round(v + jitter * 5), 1, 80));
  const sand = profile.sand.map((v, k) => clamp(Math.round(v - jitter * 8), 2, 97 - clay[k]));
  const cfvo = profile.cfvo.map((v) => clamp(Math.round(v * (1 + jitter)), 0, 90));
  const top = (a) => (a[0] * 5 + a[1] * 10 + a[2] * 15) / 30;
  const texture = usdaClass(top(clay), top(sand));
  const fc = FC[texture], wp = WP[texture];
  const stones = (cfvo[0] * 5 + cfvo[1] * 10 + cfvo[2] * 15 + cfvo[3] * 30) / 60;
  const awcK = 1 - (0.7 * stones) / 100;
  const wet = 1 + (profile.perched ? 0.1 : 0) + (profile.gw ? 0.06 : 0) + (cover === 2 ? -0.1 : cover === 1 ? 0.04 : 0);
  const T = {};
  for (const z of [2, 5, 10]) {
    for (let d = 0; d < NDAYS; d++) {
      const m = tAt(z, lon, lat, d) + (cover === 3 ? 1.5 : cover === 2 ? -0.8 : 0);
      (T[`t${z}_min`] ??= [])[d] = m - DIURNAL[z] * (cover === 2 ? 0.5 : 1);
      (T[`t${z}_max`] ??= [])[d] = m + DIURNAL[z] * (cover === 2 ? 0.5 : 1);
    }
  }
  for (const z of [20, 30, 50, 75, 100, 150, 200]) T[`t${z}`] = Array.from({ length: NDAYS }, (_, d) => tAt(z, lon, lat, d));
  T.t5_09 = T.t5_min.map((lo, d) => lo + 0.45 * (T.t5_max[d] - lo));
  const V = {};
  for (const L of VLAYERS) V[L] = Array.from({ length: NDAYS }, (_, d) => Math.min(130, vvkAt(L, lon, lat, d) * (0.9 + 0.2 * h) * (texture <= 5 ? 1.08 : 1) * wet));
  const spread = texture <= 5 ? 9 : 6;
  const theta = {};
  const layerFor = (z) => (z <= 10 ? '0-10' : z <= 40 ? '0-40' : '0-100');
  for (const z of DEPTHS) {
    theta[z] = Array.from({ length: NDAYS }, (_, d) => {
      const v = V[layerFor(z)][d] / 100 + (z === 2 ? -0.08 : 0) + (z >= 50 ? 0.05 : 0);
      return Math.min(0.55, wp + v * (fc - wp));
    });
  }
  const awc40 = Math.round((fc - wp) * 400 * awcK), awc100 = Math.round((fc - wp) * 1000 * awcK);
  const flags = Array.from({ length: NDAYS }, (_, d) => {
    let f = 0;
    const frozen = T.t2_min[d] < 0;
    if (frozen) f |= 1;
    if (V['0-10'][d] > 100) f |= 2;
    if (V['0-10'][d] <= (texture <= 5 ? 72 : 86) && !frozen) f |= 4;
    return f;
  });
  return {
    static: {
      land: 1, cover, elev: Math.round(elevation(lon, lat) + 25 * (h - 0.5)), texture,
      fc10: Math.round(fc * 100 * 2) / 2, awc10: Math.round((fc - wp) * 100 * awcK * 2) / 2, fc40: Math.round(fc * 400), fc100: Math.round(fc * 1000), awc40, awc100,
      confidence: cover === 3 || cover === 2 ? 0 : h < 0.5 ? 2 : 1, bottom: 0,
      soil_type: src ? soilId : null, soil_src: src, clay, sand, cfvo,
      bedrock: profile.bedrock ?? null, gw: profile.gw ?? null, perched: profile.perched, quaternary: profile.q, geology: profile.q,
    },
    T, V, theta, flags, spread, awc40, awc100,
    deep: [lon < 15 ? -2 : -1, -1],
    frost: Array.from({ length: NDAYS }, (_, d) => (cover === 3 ? 0 : frostAt(lon, lat, d))),
  };
}

/** Daily value of a cell for field `name`, component k, day d (precip excluded: it belongs to the grid cell). */
function dailyValue(p, name, k, d) {
  switch (name) {
    case 't': return p.T[TCOMP[k]][d];
    case 'theta': return p.theta[DEPTHS[k]][d];
    case 'vvk': return Math.min(255, p.V[VLAYERS[k]][d]);
    case 'vvk_lo': return Math.max(0, p.V[VLAYERS[k]][d] - p.spread);
    case 'vvk_hi': return Math.min(255, p.V[VLAYERS[k]][d] + p.spread);
    case 'avail_mm': return k === 0 ? Math.min(p.awc40, (p.V['0-40'][d] / 100) * p.awc40) : Math.min(p.awc100, (p.V['0-100'][d] / 100) * p.awc100);
    case 'deep_anom': return p.deep[k];
    case 'snow': return 0;
    case 'frost_depth': return p.frost[d];
    case 'flags': return p.flags[d];
  }
  throw new Error(name);
}

function cellInputs(br, bc, r, c, region) {
  const x = GRID.x0 + (c + 0.5) * GRID.cell, y = GRID.y0 - (r + 0.5) * GRID.cell;
  const [lon, lat] = fromLaea(x, y);
  const h = hash(r * 4099 + c);
  const patch = Math.floor((Math.sin(r / 5.3) + Math.cos(c / 4.1) + 2) * 1.25) % 5;
  const urban = region === 'praha' ? g(lon, lat, 14.43, 50.08, 0.07, 0.04) > 0.4 : g(lon, lat, 16.61, 49.2, 0.05, 0.03) > 0.4;
  const cover = urban ? 3 : h < 0.12 ? 2 : h < 0.22 ? 1 : 0;
  const soilId = PATCH_SOIL[region][patch];
  const src = urban ? 0 : patch === 4 ? 2 : patch === 3 ? 3 : 1;
  return { lon, lat, h, urban, cover, soilId: urban ? PATCH_SOIL[region][0] : soilId, src, profile: PROFILES[urban ? PATCH_SOIL[region][0] : soilId], jitter: (h - 0.5) * 0.5 };
}

function writeBlock(br, bc, region, gzip) {
  const cells = [];
  for (let i = 0; i < 1024; i++) cells.push(buildCell(cellInputs(br, bc, br * 32 + Math.floor(i / 32), bc * 32 + (i % 32), region)));
  const values = (name, k, d, i) => {
    const p = cells[i];
    if (d === null) {
      const v = p.static[name];
      return Array.isArray(v) ? v[k] : v;
    }
    if (name === 'precip') return Math.round(RAIN_MM[d] * (0.6 + 0.8 * hash(i + d * 31 + br * 7)) * 2) / 2;
    return dailyValue(p, name, k, d);
  };
  const buf = Buffer.from(encodeBlock({ ndays: NDAYS, br, bc }, FORMAT_V11, values));
  writeFileSync(join(OUT, 'blocks', `${br}_${bc}.bin`), gzip ? gzipSync(buf) : buf);
}

/** opts/{br}_{bc}.json: other soils nearby and the three covers, forced at the block centre. */
function writeOptions(br, bc, region) {
  const centre = cellInputs(br, bc, br * 32 + 16, bc * 32 + 16, region);
  const base = { ...centre, urban: false, cover: 0, src: 1, jitter: 0 };
  const rnd2 = (v) => Math.round(v * 100) / 100;
  const entry = (id, kind, extra, inputs) => {
    const p = buildCell(inputs);
    const st = p.static;
    const daily = {};
    for (const f of FORMAT_V1.daily) {
      if (f.name === 'precip') continue;
      const count = f.count ?? 1;
      daily[f.name] = Array.from({ length: count }, (_, k) => Array.from({ length: NDAYS }, (_, d) => rnd2(dailyValue(p, f.name, k, d))));
    }
    return {
      id, kind, ...extra, cover: st.cover, clay: st.clay, sand: st.sand, cfvo: st.cfvo, bedrock: st.bedrock ?? 300, gw: st.gw, perched: st.perched,
      fc10: st.fc10, awc10: st.awc10, fc40: st.fc40, awc40: st.awc40, fc100: st.fc100, awc100: st.awc100, daily,
    };
  };
  const options = OPTION_SOILS[region].map(([soilId, share], k) => entry(`s${k + 1}`, 'soil', { soil_type: soilId, src: 1, share }, { ...base, soilId, profile: PROFILES[soilId] }));
  [[0, 'c0'], [1, 'c1'], [2, 'c2']].forEach(([cover, id]) => options.push(entry(id, 'cover', {}, { ...base, cover })));
  writeFileSync(join(OUT, 'opts', `${br}_${bc}.json`), JSON.stringify({ block: [br, bc], centre: fromLaea(GRID.x0 + (bc * 32 + 16.5) * GRID.cell, GRID.y0 - (br * 32 + 16.5) * GRID.cell).map((v) => Math.round(v * 1e4) / 1e4), options }));
}

// ---------- PNG ----------
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const hex = (s) => [1, 3, 5, 7].map((k) => (k < s.length ? parseInt(s.slice(k, k + 2), 16) : 255));
function colour(stops, v) {
  if (v <= stops[0][0]) return hex(stops[0][1]);
  for (let k = 1; k < stops.length; k++) {
    if (v <= stops[k][0]) {
      const [v0, c0] = stops[k - 1], [v1, c1] = stops[k];
      const t = (v - v0) / (v1 - v0);
      const a = hex(c0), b = hex(c1);
      return a.map((x, j) => Math.round(x + t * (b[j] - x)));
    }
  }
  return hex(stops.at(-1)[1]);
}

const LAYERS = [
  { id: 't5', name: 'Teplota půdy 5 cm', unit: '°C', legend: { stops: [[-10, '#2b3a8f'], [-5, '#3f6fc4'], [0, '#8fc3e6'], [5, '#d6eecf'], [10, '#fde59a'], [15, '#fbae5e'], [20, '#ef6c3f'], [25, '#cf3427'], [30, '#9e1c2b']] }, f: (lon, lat, d) => tAt(5, lon, lat, d) },
  { id: 'vvk40', name: 'Vlhkost 0–40 cm', unit: '% VVK', legend: { stops: [[0, '#8a4b12'], [30, '#cf9a4d'], [50, '#efe0b0'], [70, '#a9dccf'], [90, '#3f9f95'], [100, '#1d6b6a'], [120, '#24407e']] }, f: (lon, lat, d) => vvkAt('0-40', lon, lat, d) },
  { id: 'vvk100', name: 'Vlhkost 0–100 cm', unit: '% VVK', legend: { stops: [[0, '#8a4b12'], [30, '#cf9a4d'], [50, '#efe0b0'], [70, '#a9dccf'], [90, '#3f9f95'], [100, '#1d6b6a'], [120, '#24407e']] }, f: (lon, lat, d) => vvkAt('0-100', lon, lat, d) },
  { id: 'frost', name: 'Promrzání', unit: 'cm', legend: { stops: [[0, '#ffffff00'], [1, '#d4e6f5'], [10, '#8dbde0'], [20, '#4a8fc9'], [40, '#1d559c']] }, f: frostAt },
];

function writeMaps() {
  const W = 520;
  const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const yN = merc(BOUNDS[1][1]), yS = merc(BOUNDS[0][1]);
  const H = Math.round((W * (yN - yS)) / (((BOUNDS[1][0] - BOUNDS[0][0]) * Math.PI) / 180));
  const mask = new Uint8Array(W * H);
  const pos = [];
  for (let j = 0; j < H; j++) {
    const lat = (Math.atan(Math.sinh(yN - ((j + 0.5) / H) * (yN - yS))) * 180) / Math.PI;
    for (let i = 0; i < W; i++) {
      const lon = BOUNDS[0][0] + ((i + 0.5) / W) * (BOUNDS[1][0] - BOUNDS[0][0]);
      mask[j * W + i] = insideGeometry([lon, lat], cz) ? 1 : 0;
      pos.push([lon, lat]);
    }
  }
  for (const L of LAYERS) {
    for (let d = 0; d < NDAYS; d++) {
      const rgba = Buffer.alloc(W * H * 4);
      for (let p = 0; p < W * H; p++) {
        if (!mask[p]) continue;
        const [lon, lat] = pos[p];
        const v = L.f(lon, lat, d);
        const c = colour(L.legend.stops, L.id === 'frost' ? Math.max(0, Math.round(v - 1.5)) : v);
        rgba.set(c, p * 4);
      }
      writeFileSync(join(OUT, 'maps', `${L.id}_${d}.png`), png(W, H, rgba));
    }
  }
  return { W, H };
}

// ---------- stations ----------
const STATIONS = [
  { wsi: '0-203-0-11520', name: 'Praha-Libuš', lat: 50.0078, lon: 14.4469, elev: 302 },
  { wsi: '0-203-0-11723', name: 'Brno-Tuřany', lat: 49.1529, lon: 16.6886, elev: 241 },
  { wsi: '0-203-0-11509', name: 'Doksany', lat: 50.4587, lon: 14.1699, elev: 158 },
  { wsi: '0-203-0-11782', name: 'Kroměříž', lat: 49.2872, lon: 17.3845, elev: 233 },
  { wsi: '0-203-0-11457', name: 'Churáňov', lat: 49.0683, lon: 13.6150, elev: 1118 },
];
function stationsJson() {
  const PAST = 30;
  const time = Array.from({ length: PAST + NDAYS - 1 }, (_, k) => pragueDate(new Date(d0.getTime() + (k - PAST + 1) * 86_400_000)));
  const depths = [5, 10, 20, 50, 100];
  return {
    updated: iso(analysis),
    stations: STATIONS.map((s, si) => {
      const measured = {}, model = {}, skill = {};
      for (const z of depths) {
        const damp = Math.exp(-z / 30);
        const truth = time.map((_, k) => {
          const dd = k - (PAST - 1); // 0 = today
          const seasonal = tAt(z, s.lon, s.lat, Math.max(0, Math.min(NDAYS - 1, dd))) + (dd < 0 ? -dd * 0.13 * Math.exp(-z / 120) : 0);
          const wx = dd < 0 ? 2.4 * Math.sin(k / 3.1 + si) * damp + 1.2 * Math.sin(k / 1.7) * damp : 0;
          return seasonal + wx;
        });
        const bias = (si - 2) * 0.12 + (z > 50 ? 0.1 : 0);
        measured[z] = truth.map((v, k) => (k < PAST ? round1(v + 0.25 * Math.sin(k * 2.3 + z)) : null));
        model[z] = truth.map((v, k) => round1(v + bias + (0.6 * damp + 0.15) * Math.sin(k * 1.37 + si + z / 7)));
        const pairs = measured[z].map((m, k) => (m === null ? null : model[z][k] - m)).filter((e) => e !== null);
        skill[z] = { mae: round2(pairs.reduce((a, e) => a + Math.abs(e), 0) / pairs.length), bias: round2(pairs.reduce((a, e) => a + e, 0) / pairs.length), n: 620 + si * 40 };
      }
      return { ...s, depths, series: { time, measured, model }, skill };
    }),
  };
}
const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

function skillJson() {
  const depths = [5, 10, 20, 50, 100];
  const base = { 5: 0.85, 10: 0.7, 20: 0.55, 50: 0.4, 100: 0.3 };
  const m = (mae, k = 1) => ({ mae: round2(mae * k), bias: round2(0.08 * k - 0.05), rmse: round2(mae * k * 1.28), acc: round2(Math.max(0.3, 0.93 - (k - 1) * 0.12)), n: 26800 });
  const by = (k) => Object.fromEntries(depths.map((z) => [z, m(base[z], k)]));
  return {
    updated: iso(analysis),
    period: { from: '2018-01-01', to: days[0] },
    n_stations: 157,
    variable: 'soil_temperature',
    unit: '°C',
    depths,
    analysis: by(1),
    forecast: Object.fromEntries([1, 2, 3, 4, 5, 6].map((L) => [L, by(1 + L * 0.18)])),
    baseline: { name: 'ERA5-Land', analysis: Object.fromEntries(depths.map((z) => [z, { ...m(base[z] * 1.9), acc: 0.71 }])) },
  };
}

// ---------- write ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'blocks'), { recursive: true });
mkdirSync(join(OUT, 'maps'), { recursive: true });
mkdirSync(join(OUT, 'opts'), { recursive: true });

const written = [];
for (const [region, lon, lat] of [['praha', 14.42, 50.08], ['brno', 16.61, 49.2]]) {
  const cell = gridCell(GRID, lon, lat);
  for (const [dr, dc] of [[0, 0], [0, 1], [1, 0]]) {
    writeBlock(cell.br + dr, cell.bc + dc, region, written.length % 2 === 0);
    writeOptions(cell.br + dr, cell.bc + dc, region);
    written.push(`${cell.br + dr}_${cell.bc + dc}`);
  }
}
const size = writeMaps();
writeFileSync(join(OUT, 'stations.json'), JSON.stringify(stationsJson()));
writeFileSync(join(OUT, 'skill.json'), JSON.stringify(skillJson(), null, 1));
writeFileSync(
  join(OUT, 'manifest.json'),
  JSON.stringify(
    {
      status: 'live',
      synthetic: true,
      cycle: iso(analysis).slice(0, 13).replace(/[-T]/g, ''),
      analysis_time: iso(analysis),
      generated: iso(new Date(Math.min(now.getTime() - 600_000, analysis.getTime() + 4.5 * 3_600_000))),
      forcing: { aladin_run: iso(new Date(analysis.getTime() - 6 * 3_600_000)), meteoverdict: iso(new Date(analysis.getTime() - 1.2 * 3_600_000)), stations_until: iso(analysis) },
      last_ssm_date: pragueDate(new Date(analysis.getTime() - 86_400_000)),
      days,
      licence: 'CC BY-SA 4.0',
      attribution: ['ČHMÚ (CC BY 4.0)', 'MeteoVerdict (CC BY-SA 4.0)', 'SoilGrids, ISRIC (CC BY 4.0)', 'Česká geologická služba, půdní mapa (CC BY 4.0)', 'Copernicus'],
      grid: GRID,
      blocks: { url: 'blocks/{br}_{bc}.bin', format: FORMAT_V11 },
      opts: { url: 'opts/{br}_{bc}.json' },
      soil_types: SOIL_TYPES,
      quaternary: QUATERNARY,
      geology: GEOLOGY,
      maps: { bounds: BOUNDS, layers: LAYERS.map(({ f, ...L }) => ({ ...L, url: `maps/${L.id}_{d}.png` })) },
      stations: 'stations.json',
      skill: 'skill.json',
    },
    null,
    1,
  ),
);
console.log(`Synthetic data in ${OUT}: blocks ${written.join(', ')}; maps ${size.W}×${size.H}; days ${days[0]}…${days.at(-1)}`);
