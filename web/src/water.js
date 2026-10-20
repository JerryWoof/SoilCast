// Open-water detection for a clicked point: the base map's water polygon where the map is detailed
// enough to trust, otherwise the published cell cover (4 = water, a cell that is mostly water).

export const COVER_WATER = 4;
const POLY_MIN_ZOOM = 9; // below this the base-map polygons are too generalised to decide
const TRUST_ABSENCE_ZOOM = 11; // from here no polygon under the click means land, even in a water cell

/** polygon: a water polygon is rendered under the click (null = unknown); cover: cell cover code or null. */
export function isWater({ polygon, zoom, cover }) {
  if (polygon && zoom >= POLY_MIN_ZOOM) return true;
  if (polygon === false && zoom >= TRUST_ABSENCE_ZOOM) return false;
  return cover === COVER_WATER;
}
