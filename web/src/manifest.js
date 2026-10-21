// Reads data/manifest.json, which the engine publishes with every cycle,
// and works out what the site should tell the visitor about freshness.

import { t, tp, locale, fmtDM } from './i18n.js';

export const STALE_AFTER_HOURS = 9;

export function manifestStatus(manifest, now = new Date()) {
  if (!manifest) return { state: 'missing' };
  if (manifest.status === 'preview') return { state: 'preview', generated: manifest.generated };
  const analysis = Date.parse(manifest.analysis_time);
  if (Number.isNaN(analysis)) return { state: 'missing' };
  const ageHours = (now.getTime() - analysis) / 3_600_000;
  return {
    state: ageHours > STALE_AFTER_HOURS ? 'stale' : 'fresh',
    ageHours,
    analysisTime: manifest.analysis_time,
    generated: manifest.generated ?? null,
    lastSsm: manifest.last_ssm_date ?? null,
    synthetic: manifest.synthetic === true,
    test: manifest.test === true,
    hasData: Boolean(manifest.blocks && manifest.grid && Array.isArray(manifest.days)),
  };
}

/** Today's date in Europe/Prague as YYYY-MM-DD. */
export function pragueToday(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(now);
}

const parseDay = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};

/**
 * Index of the day to show first: today in Europe/Prague if the data has it,
 * else the first later day, else the last one (stale data).
 */
export function defaultDayIndex(days, today = pragueToday()) {
  if (!days?.length) return 0;
  const i = days.findIndex((d) => d >= today);
  return i === -1 ? days.length - 1 : i;
}

/**
 * Labels for the forecast days: {short: 'po 20. 10.', rel: 'Dnes' | 'Zítra' | null, long: 'pondělí 20. října'}.
 */
export function dayLabels(days, today = pragueToday()) {
  const t0 = parseDay(today).getTime();
  return days.map((s) => {
    const date = parseDay(s);
    const diff = Math.round((date.getTime() - t0) / 86_400_000);
    const opts = { timeZone: 'UTC' };
    return {
      date: s,
      weekday: date.toLocaleDateString(locale(), { ...opts, weekday: 'short' }),
      dm: fmtDM(date.getUTCDate(), date.getUTCMonth() + 1),
      long: date.toLocaleDateString(locale(), { ...opts, weekday: 'long', day: 'numeric', month: 'long' }),
      rel: diff === 0 ? t('day.today') : diff === 1 ? t('day.tomorrow') : diff === -1 ? t('day.yesterday') : null,
    };
  });
}

/** Human age like "před 3 h" / "3 h ago". */
export function ageText(hours) {
  if (hours < 1) return t('ago.now');
  if (hours < 36) return t('ago.hours', { n: Math.round(hours) });
  return tp('ago.days', Math.round(hours / 24));
}

export async function loadManifest(base) {
  try {
    const res = await fetch(`${base}data/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Ray casting on [lon, lat] rings. Holes count as outside.
export function insidePolygon([x, y], rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export function insideGeometry(point, geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.some((rings) => insidePolygon(point, rings));
}
