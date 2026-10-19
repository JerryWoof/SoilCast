import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLaea, gridCell } from './laea.js';

test('EPSG:3035 forward matches the IOGP worked example', () => {
  // IOGP Guidance Note 7-2: 50°N 5°E -> E 3962799.45, N 2999718.85
  const [x, y] = toLaea(5, 50);
  assert.ok(Math.abs(x - 3962799.45) < 0.05, x);
  assert.ok(Math.abs(y - 2999718.85) < 0.05, y);
});

test('grid cell and block lookup', () => {
  const grid = { x0: 4460000, y0: 3130000, cell: 250, nx: 2080, ny: 1160, block: 32 };
  const praha = gridCell(grid, 14.42, 50.08);
  assert.ok(praha.r > 0 && praha.c > 0);
  assert.equal(praha.br, Math.floor(praha.r / 32));
  assert.equal(praha.i, (praha.r % 32) * 32 + (praha.c % 32));
  assert.equal(gridCell(grid, 2, 45), null);
});
