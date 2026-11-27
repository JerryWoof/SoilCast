// Experimental 10-day ensemble outlook (data/ens/): one small file per block of 32 x 32 one-kilometre columns.
// Everything here fails soft: a missing file, a 404 or a cell without data gives null and the panel card stays hidden.

import { decodeBlock, gunzipIfNeeded } from './blocks.js';
import { dayLabels, pragueToday } from './manifest.js';
import { fmtPct, getLang } from './i18n.js';

/** Block and position (in the block file) of the ensemble column that contains 250 m cell (r, c). */
export function ensCell(r, c, grid = {}) {
  const stride = grid.stride ?? 4;
  const b = grid.block ?? 32;
  const r1 = Math.floor(r / stride);
  const c1 = Math.floor(c / stride);
  const br = Math.floor(r1 / b);
  const bc = Math.floor(c1 / b);
  return { br, bc, i: (r1 - br * b) * b + (c1 - bc * b) };
}

const cache = new Map();

function getJson(url) {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then((res) => {
          if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return null;
          return res.json();
        })
        .catch(() => null),
    );
  }
  return cache.get(url);
}

/** data/ens/ens.json, or null when the product is not published. */
export function loadEnsIndex(base, manifest) {
  const v = manifest?.cycle ?? manifest?.analysis_time;
  return getJson(`${base}data/ens/ens.json${v ? `?v=${encodeURIComponent(v)}` : ''}`).then((j) => (j && j.format && Array.isArray(j.days) ? j : null));
}

/** The ensemble verification summary (data/ens_verify.json), or null. */
export function loadEnsVerify(base) {
  return getJson(`${base}data/ens_verify.json`);
}

/** Fetches and decodes one ensemble block; null when it does not exist. */
export function loadEnsBlock(base, ens, br, bc) {
  const url = `${base}data/ens/${(ens.url ?? '{br}_{bc}.bin').replace('{br}', br).replace('{bc}', bc)}?run=${encodeURIComponent(ens.run ?? '')}`;
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then(async (res) => {
          if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return null;
          return decodeBlock(await gunzipIfNeeded(await res.arrayBuffer()), ens.format);
        })
        .catch(() => null),
    );
  }
  return cache.get(url);
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * One row per local day from today on: probabilities (percent), 10 cm temperature quantiles and 0-40 cm moisture quantiles.
 * Returns [] when the column has no data (water, outside the ensemble grid) or the run is out of date.
 */
export function ensRows(cell, ens, today = pragueToday()) {
  const p = cell?.daily?.p;
  const t = cell?.daily?.t;
  if (!p || !t || !Array.isArray(ens?.days)) return [];
  const v = cell.daily.vvk;
  const labels = dayLabels(ens.days, today);
  const rows = [];
  ens.days.forEach((date, d) => {
    if (date < today) return;
    const row = {
      d,
      date,
      label: labels[d],
      frost5: num(p.frost5?.[d]),
      frost2: num(p.frost2?.[d]),
      sow: num(p.t10_ge8?.[d]),
      t10: { p10: num(t.t10_p10?.[d]), p50: num(t.t10_p50?.[d]), p90: num(t.t10_p90?.[d]) },
      vvk: { p10: num(v?.vvk40_p10?.[d]), p90: num(v?.vvk40_p90?.[d]) },
    };
    if (row.frost5 !== null || row.sow !== null || row.t10.p50 !== null) rows.push(row);
  });
  return rows;
}

/** Probability for display: the ensemble is not calibrated, so steps of 10 % and "<10 %" / ">90 %" at the ends. */
export function probText(p) {
  if (p === null || p === undefined) return '—';
  if (p < 5) return `<${fmtPct(10)}`;
  if (p >= 95) return `>${fmtPct(90)}`;
  return fmtPct(Math.round(p / 10) * 10);
}

/** 'low' | 'mid' | 'high' for the word shown as a tooltip. */
export function probLevel(p) {
  if (p === null || p === undefined) return null;
  return p < 20 ? 'low' : p < 60 ? 'mid' : 'high';
}

/** How the last 30 days of verification read: {temp, prob} each 'better' | 'same' | 'worse', or null without data. */
export function verifyVerdict(v) {
  const sk = (x) => (x > 0.05 ? 'better' : x < -0.05 ? 'worse' : 'same');
  const crpss = num(v?.crpss_30d);
  if (crpss === null) return null;
  const bss = ['frost5', 't10_ge8'].map((k) => num(v?.brier?.[k]?.bss)).filter((x) => x !== null);
  const prob = bss.length ? (bss.every((x) => x > 0.05) ? 'better' : bss.some((x) => x < -0.05) ? 'worse' : 'same') : null;
  return { temp: sk(crpss), prob };
}

/** ECMWF attribution text in the page language (from ens.json), or a fixed fallback. */
export function ensAttribution(ens, lang = getLang()) {
  const a = ens?.attribution;
  const pick = Array.isArray(a) ? (lang === 'en' ? a[1] ?? a[0] : a[0]) : a;
  if (typeof pick === 'string' && pick) return pick;
  return lang === 'en' ? 'Contains ECMWF open data (IFS ENS), CC BY 4.0' : 'Obsahuje data ECMWF open data (IFS ENS), CC BY 4.0';
}

/** Everything the panel card needs for 250 m cell (r, c), or null (hide the card). */
export async function loadEnsForCell(base, manifest, r, c, today = pragueToday()) {
  const ens = await loadEnsIndex(base, manifest);
  if (!ens) return null;
  const { br, bc, i } = ensCell(r, c, ens.grid);
  const block = await loadEnsBlock(base, ens, br, bc);
  if (!block) return null;
  const rows = ensRows(block.cell(i), ens, today);
  if (!rows.length) return null;
  const verify = await loadEnsVerify(base);
  return { rows, attribution: ensAttribution(ens), verdict: verifyVerdict(verify) };
}
