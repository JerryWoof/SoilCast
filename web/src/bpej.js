// BPEJ code formatting, climate regions and the N-fertiliser calendar ban.
// Pure functions, no DOM.

import { t, fmtDM } from './i18n.js';

// Climate regions (vyhláška 227/2018 Sb., příloha 1): names live in the language tables (kr.0 … kr.9).
export const KR_COUNT = 10;
export const krNames = () => Array.from({ length: KR_COUNT }, (_, i) => t(`kr.${i}`));

const isKr = (v) => Number.isInteger(v) && v >= 0 && v <= 9;
const two = (n) => String(n).padStart(2, '0');

export const krName = (kr) => (isKr(kr) ? t(`kr.${kr}`) : null);
export const krLine = (kr) => (isKr(kr) ? t('kr.line', { kr, name: t(`kr.${kr}`) }) : null);

/** 'k.hh.dd' from the climate region and the code without its first digit (HPJ*100 + d4*10 + d5), e.g. 3.08.50. */
export function formatBpej(kr, bpej) {
  if (typeof bpej !== 'number' || !Number.isFinite(bpej) || bpej < 0) return null;
  const hpj = Math.floor(bpej / 100);
  const rest = Math.round(bpej) % 100;
  return `${isKr(kr) ? kr : '?'}.${two(hpj)}.${two(rest)}`;
}

// ---------- calendar ban (NV 262/2012 Sb., příloha č. 2, tabulka č. 1, od 1. 7. 2024) ----------

export const nTypes = () => ['min', 'fast', 'slow'].map((v) => [v, t(`n.type.${v}`)]);

// [from, to] as [day, month]; `short` = period on land with slope up to 5° and a crop (**).
const BAN = {
  low: { // KR 0–5
    min: { full: [[1, 11], [15, 2]], short: [[1, 11], [31, 1]] },
    fast: { full: [[30, 11], [15, 2]], short: [[30, 11], [31, 1]] },
    slow: { full: [[15, 12], [15, 2]], short: null },
  },
  mid: { // KR 6–7
    min: { full: [[1, 11], [28, 2]], short: [[1, 11], [15, 2]] },
    fast: { full: [[30, 11], [28, 2]], short: [[30, 11], [15, 2]] },
    slow: { full: [[15, 12], [28, 2]], short: null },
  },
  high: { // KR 8–9
    min: { full: [[15, 10], [28, 2]], short: [[15, 10], [15, 2]] },
    fast: { full: [[15, 11], [28, 2]], short: [[15, 11], [15, 2]] },
    slow: { full: [[15, 12], [28, 2]], short: null },
  },
};

const group = (kr) => (kr <= 5 ? 'low' : kr <= 7 ? 'mid' : 'high');
const ord = ([d, m]) => m * 100 + d;
const fmtPair = ([d, m]) => fmtDM(d, m);

/** Is the day (month 1–12, day 1–31) inside from…to, inclusive, also across New Year? */
export function inPeriod(month, day, from, to) {
  const x = month * 100 + day, a = ord(from), b = ord(to);
  return a <= b ? x >= a && x <= b : x >= a || x <= b;
}

/**
 * Calendar ban for a day. `date` is 'YYYY-MM-DD'; `kr` 0–9 or null; `type` min|fast|slow;
 * `gentle` = slope up to 5° and a crop on the land (shorter period for min/fast).
 * Returns {known, inBan, text}; `text` is '1. 11. – 15. 2.' (null when the region is unknown).
 */
export function calendarBan(date, kr, type = 'min', gentle = false) {
  if (!isKr(kr)) return { known: false, inBan: false, text: null };
  const row = BAN[group(kr)][type] ?? BAN[group(kr)].min;
  const [from, to] = gentle && row.short ? row.short : row.full;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  const text = `${fmtPair(from)} – ${fmtPair(to)}`;
  if (!m) return { known: true, inBan: false, text };
  return { known: true, inBan: inPeriod(Number(m[2]), Number(m[3]), from, to), text };
}

export const typeShort = (type) => t(`n.type.${['min', 'fast', 'slow'].includes(type) ? type : 'min'}.short`);
