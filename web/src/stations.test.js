import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withMeasurements } from './stations.js';

test('drops stations and depths without measurements', () => {
  const st = (wsi, measured) => ({ wsi, depths: [5, 10], series: { time: ['a', 'b'], measured, model: {} } });
  const out = withMeasurements({
    updated: 'x',
    stations: [st('A', { 5: [1, null], 10: [null, null] }), st('B', { 5: [null, null] }), st('C', { 5: [2, 3], 10: [4, null] })],
  });
  assert.equal(out.updated, 'x');
  assert.deepEqual(out.stations.map((s) => [s.wsi, s.depths]), [['A', [5]], ['C', [5, 10]]]);
  assert.equal(withMeasurements(null), null);
});
