// Reads data/manifest.json, which the engine publishes with every cycle,
// and works out what the site should tell the visitor about freshness.

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
 * Labels for the forecast days: {short: 'po 20. 10.', rel: 'Dnes' | 'Zítra' | null, long: 'pondělí 20. října'}.
 */
export function dayLabels(days, today = pragueToday()) {
  const t = parseDay(today).getTime();
  return days.map((s) => {
    const date = parseDay(s);
    const diff = Math.round((date.getTime() - t) / 86_400_000);
    const opts = { timeZone: 'UTC' };
    return {
      date: s,
      weekday: date.toLocaleDateString('cs-CZ', { ...opts, weekday: 'short' }),
      dm: `${date.getUTCDate()}. ${date.getUTCMonth() + 1}.`,
      long: date.toLocaleDateString('cs-CZ', { ...opts, weekday: 'long', day: 'numeric', month: 'long' }),
      rel: diff === 0 ? 'Dnes' : diff === 1 ? 'Zítra' : diff === -1 ? 'Včera' : null,
    };
  });
}

/** Human age like "před 3 h" / "před 2 dny". */
export function ageText(hours) {
  if (hours < 1) return 'před chvílí';
  if (hours < 36) return `před ${Math.round(hours)} h`;
  const d = Math.round(hours / 24);
  return `před ${d} ${d === 1 ? 'dnem' : 'dny'}`;
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
