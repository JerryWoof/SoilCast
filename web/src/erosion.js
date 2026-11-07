// Soil erosion in the point panel: what the published fields mean in words.
// Pure helpers (data -> keys, numbers, strings); the panel turns them into markup.
// Public texts say WHAT is shown, never how it is computed.

import { t, fmtInt, fmtNum } from './i18n.js';

export const LPIS_URL = 'https://eagri.cz/public/app/lpisext/lpis/verejny2/plpis/';
export const VUMOP_URL = 'https://www.vumop.cz/';
export const VUMOP_CREDIT = 'VÚMOP, v. v. i. (a MZe), CC BY-SA 4.0';

// Bits of `ero_why`.
export const WHY = { HEAVY: 1, STORM: 2, WET: 4, FROZEN: 8, BARE: 16, SLOPE: 32, UNSURE: 64, POSSIBLE: 128 };
// Reasons shown as words, in this order (UNSURE / POSSIBLE only change the chip style).
const REASONS = [
  [WHY.HEAVY, 'ero.why.heavy'],
  [WHY.STORM, 'ero.why.storm'],
  [WHY.WET, 'ero.why.wet'],
  [WHY.FROZEN, 'ero.why.frozen'],
  [WHY.BARE, 'ero.why.bare'],
  [WHY.SLOPE, 'ero.why.slope'],
];

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const COVER_PROTECTIVE = [1, 2]; // grass, forest (cover codes of the soil map legend)

/** Level 0..3 or null. */
const level = (v) => (num(v) && v >= 0 && v <= 3 ? Math.round(v) : null);

/** True when the cell carries any erosion field (older data has none, then the whole fold is hidden). */
export function hasErosion(cell) {
  const s = cell?.static ?? {};
  const d = cell?.daily ?? {};
  if (num(s.ero_cls) || num(s.dzes_seo) || num(s.dzes_meo)) return true;
  return Boolean(d.ero?.local?.some(num));
}

/** Share of the arable area (published in whole percent) rounded to 5 % (we only know it roughly), or null. */
export function roundShare(share) {
  if (!num(share)) return null;
  return Math.min(100, Math.round(share / 5) * 5);
}

/**
 * Long-term line: { kind: 'few' | 'cover' | 'level', cls, share }, or null without data.
 * `cover` is the land cover code of the cell (grass / forest protect the soil).
 */
export function longTerm(s) {
  if (!num(s?.ero_cls)) return null;
  const cls = Math.round(s.ero_cls);
  if (cls < 0 || cls > 4) return null;
  if (cls === 0) return { kind: COVER_PROTECTIVE.includes(s.cover) ? 'cover' : 'few', cls, share: null };
  return { kind: 'level', cls, share: roundShare(s.ero_share) };
}

export function longTermText(s) {
  const lt = longTerm(s);
  if (!lt) return '';
  if (lt.kind === 'cover') return t('ero.lt.cover');
  if (lt.kind === 'few') return t('ero.lt.few');
  const head = t('ero.lt.head', { level: t(`ero.lt.lvl.${lt.cls}`) });
  const tail = lt.share !== null && lt.share >= 5 ? t('ero.lt.share', { n: lt.share }) : t(`ero.lt.cls.${lt.cls}`);
  return `${head} ${tail}`;
}

/**
 * VÚMOP actual-loss line (format 1.7): { over, g } or null for data without the fields.
 * over = share of the arable area above the permissible loss in whole percent rounded to 5 %, g = mean loss in t/ha per year.
 */
export function actualLoss(s) {
  if (!num(s?.ero_over) || !num(s?.ero_gact) || !num(s?.ero_cls) || s.ero_cls < 1) return null;
  const g = s.ero_gact;
  return { over: Math.min(100, Math.round(s.ero_over / 5) * 5), g: g >= 10 ? Math.round(g) : Math.round(g * 10) / 10 };
}

export const hasVumop = (s) => actualLoss(s) !== null;

export function actualLossText(s) {
  const a = actualLoss(s);
  if (!a) return '';
  return a.over < 5 ? t('ero.loss.none', { g: fmtNum(a.g) }) : t('ero.loss', { over: fmtInt(a.over), g: fmtNum(a.g) });
}

/** Boxes of a classed map legend: [{ color, label }] from the manifest legend (stops = [class, colour]); labels by layer and class. */
export function classLegend(layer, tr = t) {
  const stops = layer?.legend?.stops ?? [];
  const key = layer?.id === 'eros' ? 'ero.lt.lvl' : 'ero.lvl';
  return stops.map(([v, color]) => ({ color, label: tr(`${key}.${v}`) }));
}

/** LPIS shares: { seo, meo } in whole percent, or null when LPIS has nothing for the cell (nodata). */
export function lpisShares(s) {
  if (!num(s?.dzes_seo) || !num(s?.dzes_meo)) return null;
  return { seo: Math.round(s.dzes_seo), meo: Math.round(s.dzes_meo) };
}

export function lpisText(s) {
  const l = lpisShares(s);
  if (!l) return '';
  return l.seo === 0 && l.meo === 0 ? t('ero.lpis.none') : t('ero.lpis', { seo: fmtInt(l.seo), meo: fmtInt(l.meo) });
}

/**
 * Forecast of the days: [{ level, area, why, possible, unsure }] (level null = no value).
 * `area` is only set when the surroundings (up to 10 km) are worse than the point itself.
 */
export function forecastDays(daily) {
  const local = daily?.ero?.local ?? [];
  const area = daily?.ero?.area ?? [];
  const why = daily?.ero_why?.bits ?? daily?.ero_why?.value ?? [];
  return local.map((v, k) => {
    const lv = level(v);
    const ar = level(area[k]);
    const w = num(why[k]) ? why[k] : 0;
    return {
      level: lv,
      area: lv !== null && ar !== null && ar > lv ? ar : null,
      why: w,
      possible: (w & WHY.POSSIBLE) !== 0,
      unsure: (w & WHY.UNSURE) !== 0,
    };
  });
}

/** Reason words of one day ("silný déšť, mokrá půda"), '' when none. */
export function reasonText(why) {
  const words = REASONS.filter(([bit]) => (why & bit) !== 0).map(([, key]) => t(key));
  return words.length ? t('ero.why', { list: words.join(', ') }) : '';
}

export const hasStorm = (why) => (why & WHY.STORM) !== 0;

/** The sentences for the selected day, as plain strings. */
export function dayLines(day) {
  if (!day || day.level === null) return [];
  const out = [t(`ero.day.${day.level}`)];
  if (day.area !== null) out.push(t('ero.area', { level: t(`ero.lvl.${day.area}`) }));
  const r = reasonText(day.why);
  if (r) out.push(r);
  if (day.possible) out.push(t('ero.day.possible'));
  else if (day.unsure) out.push(t('ero.day.unsure'));
  if (hasStorm(day.why)) out.push(t('ero.storm'));
  return out;
}

/** Hint on the fold summary: the level of day ``k`` (today's index in the manifest days), or ''. */
export function foldHint(daily, k = 0) {
  const d0 = forecastDays(daily)[k];
  if (!d0 || d0.level === null) return '';
  return t('ero.hint', { level: t(`ero.lvl.${d0.level}`) });
}
