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
  };
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
