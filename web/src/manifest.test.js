import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { manifestStatus, insideGeometry } from './manifest.js';

const cz = JSON.parse(readFileSync(new URL('../public/cz.geojson', import.meta.url))).features[0].geometry;

test('missing or broken manifest', () => {
  assert.equal(manifestStatus(null).state, 'missing');
  assert.equal(manifestStatus({ analysis_time: 'nonsense' }).state, 'missing');
});

test('preview manifest', () => {
  assert.equal(manifestStatus({ status: 'preview', generated: '2026-10-19T00:00Z' }).state, 'preview');
});

test('fresh and stale', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  assert.equal(manifestStatus({ analysis_time: '2026-10-19T06:00:00Z' }, now).state, 'fresh');
  assert.equal(manifestStatus({ analysis_time: '2026-10-19T02:00:00Z' }, now).state, 'stale');
});

test('points inside and outside Czechia', () => {
  assert.equal(insideGeometry([14.42, 50.09], cz), true); // Praha
  assert.equal(insideGeometry([16.61, 49.19], cz), true); // Brno
  assert.equal(insideGeometry([13.40, 52.52], cz), false); // Berlin
  assert.equal(insideGeometry([16.37, 48.21], cz), false); // Vienna
});

test('status carries satellite date, data presence and synthetic flag', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  const s = manifestStatus({ status: 'live', analysis_time: '2026-10-19T06:00:00Z', last_ssm_date: '2026-10-18', synthetic: true, grid: {}, blocks: {}, days: [] }, now);
  assert.equal(s.lastSsm, '2026-10-18');
  assert.equal(s.synthetic, true);
  assert.equal(s.hasData, true);
  assert.equal(Math.round(s.ageHours), 6);
  assert.equal(manifestStatus({ status: 'live', analysis_time: '2026-10-19T06:00:00Z' }, now).hasData, false);
});

test('Prague date and Czech day labels', async () => {
  const { pragueToday, dayLabels } = await import('./manifest.js');
  assert.equal(pragueToday(new Date('2026-10-19T22:30:00Z')), '2026-10-20'); // after midnight CEST
  const L = dayLabels(['2026-10-19', '2026-10-20', '2026-10-21'], '2026-10-19');
  assert.equal(L[0].rel, 'Dnes');
  assert.equal(L[1].rel, 'Zítra');
  assert.equal(L[2].rel, null);
  assert.equal(L[1].dm, '20. 10.');
  assert.match(L[1].weekday, /^út/);
});
