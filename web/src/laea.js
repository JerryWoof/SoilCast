// ETRS89-LAEA (EPSG:3035) forward projection and the SoilCast grid lookup.
// Formulas: IOGP Guidance Note 7-2, Lambert Azimuthal Equal Area (ellipsoidal).

const A = 6378137.0;
const F = 1 / 298.257222101; // GRS80
const E2 = 2 * F - F * F;
const E = Math.sqrt(E2);
const LAT0 = (52 * Math.PI) / 180;
const LON0 = (10 * Math.PI) / 180;
const FE = 4321000;
const FN = 3210000;

const q = (phi) => {
  const s = Math.sin(phi);
  return (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)));
};
const QP = q(Math.PI / 2);
const RQ = A * Math.sqrt(QP / 2);
const BETA0 = Math.asin(q(LAT0) / QP);
const D = (A * (Math.cos(LAT0) / Math.sqrt(1 - E2 * Math.sin(LAT0) ** 2))) / (RQ * Math.cos(BETA0));

/** [lon, lat] in degrees -> [x (easting), y (northing)] in metres, EPSG:3035. */
export function toLaea(lon, lat) {
  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  const beta = Math.asin(q(phi) / QP);
  const B = RQ * Math.sqrt(2 / (1 + Math.sin(BETA0) * Math.sin(beta) + Math.cos(BETA0) * Math.cos(beta) * Math.cos(lam - LON0)));
  const x = FE + B * D * Math.cos(beta) * Math.sin(lam - LON0);
  const y = FN + (B / D) * (Math.cos(BETA0) * Math.sin(beta) - Math.sin(BETA0) * Math.cos(beta) * Math.cos(lam - LON0));
  return [x, y];
}

/**
 * Cell of the published grid that contains a point. (x0, y0) is the outer
 * north-west corner of cell (0, 0); rows grow southwards.
 * Returns null outside the grid.
 */
export function gridCell(grid, lon, lat) {
  const [x, y] = toLaea(lon, lat);
  const c = Math.floor((x - grid.x0) / grid.cell);
  const r = Math.floor((grid.y0 - y) / grid.cell);
  if (r < 0 || c < 0 || r >= grid.ny || c >= grid.nx) return null;
  const b = grid.block;
  const br = Math.floor(r / b);
  const bc = Math.floor(c / b);
  return { r, c, br, bc, i: (r - br * b) * b + (c - bc * b) };
}
