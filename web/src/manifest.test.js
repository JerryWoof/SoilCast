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

test('default day is today in Prague, with fallbacks', async () => {
  const { defaultDayIndex, pragueToday } = await import('./manifest.js');
  const days = ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
  assert.equal(defaultDayIndex(days, '2026-10-22'), 1); // today present: not yesterday
  assert.equal(defaultDayIndex(days, '2026-10-21'), 0);
  assert.equal(defaultDayIndex(['2026-10-23', '2026-10-24'], '2026-10-22'), 0); // today missing: next day
  assert.equal(defaultDayIndex(days, '2026-11-30'), 3); // stale: last day
  assert.equal(defaultDayIndex([], '2026-10-22'), 0);
  // after Prague midnight, still 22:30 UTC the day before
  assert.equal(pragueToday(new Date('2026-10-21T22:30:00Z')), '2026-10-22');
  assert.equal(defaultDayIndex(days, pragueToday(new Date('2026-10-21T22:30:00Z'))), 1);
});

test('versioned() appends the publishing cycle so a new cycle never reuses cached files', async () => {
  const { versioned } = await import('./manifest.js');
  assert.equal(versioned('/data/maps/t5_0.png', { cycle: '2026103122' }), '/data/maps/t5_0.png?v=2026103122');
  assert.equal(versioned('/data/x.json?a=1', { cycle: 'c' }), '/data/x.json?a=1&v=c');
  assert.equal(versioned('/data/x.png', { analysis_time: '2026-10-31T22:00:00Z' }), '/data/x.png?v=2026-10-31T22%3A00%3A00Z');
  assert.equal(versioned('/data/x.png', {}), '/data/x.png');
  assert.equal(versioned('/data/x.png', null), '/data/x.png');
});

test('Prague date rolls over at local midnight, DST included, and relabels Dnes/Včera', async () => {
  const { pragueToday, dayLabels } = await import('./manifest.js');
  const days = ['2026-10-31', '2026-11-01', '2026-11-02'];
  assert.equal(pragueToday(new Date('2026-10-31T22:30:00Z')), '2026-10-31'); // 23:30 local (CET, UTC+1)
  assert.equal(pragueToday(new Date('2026-10-31T23:30:00Z')), '2026-11-01');
  assert.equal(pragueToday(new Date('2026-10-24T22:30:00Z')), '2026-10-25'); // CEST (UTC+2): 00:30 local
  assert.equal(pragueToday(new Date('2026-10-25T22:30:00Z')), '2026-10-25'); // CET after the change: 23:30 local
  const before = dayLabels(days, '2026-10-31');
  const after = dayLabels(days, '2026-11-01');
  assert.equal(before[0].rel, 'Dnes');
  assert.equal(after[0].rel, 'Včera');
  assert.equal(after[1].rel, 'Dnes');
});
