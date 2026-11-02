import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLaea, gridCell } from './laea.js';
import {
  MAX_FIELDS, loadFields, saveFields, addField, removeField, renameField, polygonCells, ringAreaKm2, aggregateCells, cellToCsv,
  simplifyRing, encodeAlertPayload, decodeAlertPayload, telegramLink, cellsToHa,
} from './fields.js';

const grid = { crs: 'EPSG:3035', x0: 4460000, y0: 3130000, cell: 250, nx: 2080, ny: 1160, block: 32 };

// A square of about 3 x 3 cells around Brno, built in projected metres so the expected cell count is exact.
function squareAround(lon, lat, cells = 3) {
  const [x, y] = toLaea(lon, lat);
  const c0 = Math.floor((x - grid.x0) / 250);
  const r0 = Math.floor((grid.y0 - y) / 250);
  // corners slightly inside the outer edge of the cell block [c0, c0+cells) x [r0, r0+cells)
  const inv = (cx, cy) => {
    // invert LAEA numerically with Newton steps on (lon, lat)
    let lo = lon;
    let la = lat;
    for (let i = 0; i < 20; i++) {
      const [px, py] = toLaea(lo, la);
      const e = 1e-6;
      const [ax, ay] = toLaea(lo + e, la);
      const [bx, by] = toLaea(lo, la + e);
      const j = [[(ax - px) / e, (bx - px) / e], [(ay - py) / e, (by - py) / e]];
      const det = j[0][0] * j[1][1] - j[0][1] * j[1][0];
      const dx = cx - px;
      const dy = cy - py;
      lo += (j[1][1] * dx - j[0][1] * dy) / det;
      la += (-j[1][0] * dx + j[0][0] * dy) / det;
    }
    return [lo, la];
  };
  const xa = grid.x0 + c0 * 250 + 10;
  const xb = grid.x0 + (c0 + cells) * 250 - 10;
  const ya = grid.y0 - r0 * 250 - 10;
  const yb = grid.y0 - (r0 + cells) * 250 + 10;
  return { ring: [inv(xa, ya), inv(xb, ya), inv(xb, yb), inv(xa, yb)], c0, r0 };
}

test('polygonCells returns exactly the cells whose centre is inside', () => {
  const { ring, c0, r0 } = squareAround(16.6068, 49.1951, 3);
  const { cells, tooBig } = polygonCells(grid, ring);
  assert.equal(tooBig, false);
  assert.equal(cells.length, 9);
  assert.deepEqual([...new Set(cells.map((x) => x.c))].sort((a, b) => a - b), [c0, c0 + 1, c0 + 2]);
  assert.deepEqual([...new Set(cells.map((x) => x.r))].sort((a, b) => a - b), [r0, r0 + 1, r0 + 2]);
  // the cell index agrees with gridCell() for the cell centre of the first cell
  const first = cells.find((x) => x.r === r0 && x.c === c0);
  assert.ok(first.i >= 0 && first.i < 1024);
  assert.ok(Math.abs(ringAreaKm2(ring) - 9 * 0.0625 + 0.0) < 0.06, 'area about 9 cells');
  assert.equal(cellsToHa(9), 56.25);
});

test('a polygon smaller than a cell falls back to the cell under it; huge polygons are refused', () => {
  const tiny = [[16.6, 49.2], [16.6003, 49.2], [16.6003, 49.2003]];
  const r = polygonCells(grid, tiny);
  assert.equal(r.cells.length, 1);
  const g = gridCell(grid, 16.6001, 49.2001);
  assert.equal(r.cells[0].r, g.r);
  assert.equal(r.cells[0].c, g.c);
  const big = [[12.5, 48.7], [18.5, 48.7], [18.5, 50.9], [12.5, 50.9]];
  assert.equal(polygonCells(grid, big).tooBig, true);
});

const cellOf = (t5min, t5max, vvk, rain, flags, land = 1, extra = {}) => ({
  static: { land, cover: 3, elev: 200 + t5min, awc40: 100, clay: [10, 20], ...extra },
  daily: {
    t: { t5_min: [t5min, t5min + 1], t5_max: [t5max, t5max + 1] },
    vvk: { '0-40': [vvk, vvk + 10] },
    precip: { mm: [rain, null] },
    flags: { value: [flags, flags] },
    ero_why: { bits: [1, 4] },
  },
});

test('aggregateCells: means, ranges, majority flags, ignores water and nodata', () => {
  const cells = [
    cellOf(2, 8, 40, 0, 4 | 1),
    cellOf(4, 10, 60, 2, 4 | 1),
    cellOf(6, 12, 80, 4, 4, 1, { cover: 3 }),
    cellOf(0, 0, 0, 0, 0, 0), // water / no land: ignored
    null,
  ];
  const a = aggregateCells(cells);
  assert.equal(a.n, 3);
  const t = a.cell.daily.t;
  assert.equal(t.t5_min[0], 4);
  assert.equal(t.t5_max[0], 10);
  assert.equal(t.t5_min[1], 5);
  assert.equal(a.cell.daily.vvk['0-40'][0], 60);
  assert.equal(a.cell.daily.precip.mm[0], 2);
  assert.equal(a.cell.daily.precip.mm[1], null); // all nodata stays nodata
  assert.equal(a.cell.daily.flags.value[0], 4 | 1); // frozen in 2 of 3 cells -> frozen; trafficable in all
  assert.equal(a.cell.static.cover, 3);
  assert.equal(a.cell.static.elev, 204);
  assert.deepEqual(a.cell.static.clay, [10, 20]);
  assert.equal(a.cell.daily.ero_why.bits[0] | 0, 1);
  assert.deepEqual(a.spread[0].t5, [2, 12]);
  assert.deepEqual(a.spread[0].vvk, [40, 80]);
  assert.deepEqual(a.spread[0].rain, [0, 4]);
  assert.equal(aggregateCells([cellOf(0, 0, 0, 0, 0, 0)]), null);
  assert.equal(aggregateCells([]), null);
});

test('storage: up to 20 fields, validation, rename, remove, bad JSON', () => {
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const ring = [[16.6, 49.2], [16.61, 49.2], [16.61, 49.21]];
  let list = loadFields(store);
  assert.deepEqual(list, []);
  assert.equal(addField(list, '  ', ring).error, 'name');
  assert.equal(addField(list, 'A', [[1, 2]]).error, 'ring');
  for (let i = 0; i < MAX_FIELDS; i++) list = addField(list, `Pole ${i}`, ring, 1000 + i).list;
  assert.equal(list.length, MAX_FIELDS);
  assert.equal(addField(list, 'x', ring).error, 'full');
  assert.equal(new Set(list.map((f) => f.id)).size, MAX_FIELDS);
  assert.ok(saveFields(list, store));
  assert.equal(loadFields(store).length, MAX_FIELDS);
  list = renameField(list, list[0].id, '  Louka   u lesa ');
  assert.equal(list[0].name, 'Louka u lesa');
  list = removeField(list, list[0].id);
  assert.equal(list.length, MAX_FIELDS - 1);
  mem.set('soilcast.fields.v1', '{nope');
  assert.deepEqual(loadFields(store), []);
  mem.set('soilcast.fields.v1', JSON.stringify([{ id: 'a', name: 'ok', ring }, { id: 'b', name: 'bad', ring: [[1]] }]));
  assert.equal(loadFields(store).length, 1);
});

test('cellToCsv: header, licence comment, one row per day, blanks for nodata', () => {
  const a = aggregateCells([cellOf(2, 8, 40, 1.25, 4)]);
  const csv = cellToCsv({ days: ['2026-11-01', '2026-11-02'], cell: a.cell, meta: { cycle: '2026110110', what: 'point 49.1951,16.6068' } });
  const lines = csv.trim().split('\n');
  assert.match(lines[0], /^# Pudomer .*CC BY-SA 4\.0\. point 49\.1951,16\.6068$/);
  assert.equal(lines[1], '# model cycle 2026110110');
  assert.ok(lines[2].startsWith('date,t2_min_C'));
  const cols = lines[2].split(',');
  assert.equal(lines.length, 5);
  const row = Object.fromEntries(lines[3].split(',').map((v, i) => [cols[i], v]));
  assert.equal(row.date, '2026-11-01');
  assert.equal(row.t5_min_C, '2');
  assert.equal(row.t5_max_C, '8');
  assert.equal(row.vvk_0_40_pct, '40');
  assert.equal(row.precip_mm, '1.3'); // 1.25 rounds to one decimal
  assert.equal(row.t2_min_C, ''); // not in this fake cell
  const row2 = Object.fromEntries(lines[4].split(',').map((v, i) => [cols[i], v]));
  assert.equal(row2.precip_mm, '');
});

test('alert payload: point and polygon round trip, at most 64 URL-safe characters, no extra data', () => {
  const p = encodeAlertPayload({ cond: 0, threshold: -2, days: 1, lat: 49.1951, lng: 16.6068 });
  assert.match(p, /^[A-Za-z0-9_-]{1,64}$/);
  const d = decodeAlertPayload(p);
  assert.equal(d.cond, 0);
  assert.equal(d.threshold, -2);
  assert.ok(Math.abs(d.lat - 49.1951) <= 0.0006 && Math.abs(d.lng - 16.6068) <= 0.0006);
  // a many-vertex polygon is simplified to 12 and still fits
  const ring = Array.from({ length: 60 }, (_, k) => [16.6 + 0.01 * Math.cos((k / 60) * 2 * Math.PI), 49.2 + 0.006 * Math.sin((k / 60) * 2 * Math.PI)]);
  assert.equal(simplifyRing(ring, 12).length, 12);
  const q = encodeAlertPayload({ cond: 1, threshold: 8, days: 3, ring });
  assert.ok(q.length <= 64);
  const dq = decodeAlertPayload(q);
  assert.equal(dq.cond, 1);
  assert.equal(dq.threshold, 8);
  assert.equal(dq.days, 3);
  assert.equal(dq.ring.length, 12);
  for (const [lo, la] of dq.ring) assert.ok(lo > 16.58 && lo < 16.62 && la > 49.19 && la < 49.21);
  assert.equal(decodeAlertPayload(encodeAlertPayload({ cond: 2, threshold: 50, lat: 50, lng: 15 })).threshold, 50);
  assert.throws(() => encodeAlertPayload({ cond: 0, threshold: 0, lat: 40, lng: 16 }), /outside/);
  assert.equal(telegramLink('PudomerAlertBot', p), `https://t.me/PudomerAlertBot?start=${p}`);
});
