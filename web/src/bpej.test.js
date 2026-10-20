import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBpej, krName, krLine, inPeriod, calendarBan } from './bpej.js';

test('BPEJ code is shown as k.hh.dd', () => {
  assert.equal(formatBpej(3, 850), '3.08.50');
  assert.equal(formatBpej(4, 4167), '4.41.67');
  assert.equal(formatBpej(0, 5), '0.00.05');
  assert.equal(formatBpej(3, null), null);
  assert.equal(formatBpej(null, 850), '?.08.50');
});

test('climate region names', () => {
  assert.equal(krName(3), 'teplý, mírně vlhký');
  assert.equal(krName(9), 'chladný, vlhký');
  assert.equal(krName(null), null);
  assert.equal(krName(10), null);
  assert.equal(krLine(3), 'klimatický region 3 (teplý, mírně vlhký)');
  assert.equal(krLine(undefined), null);
});

test('period check works across New Year', () => {
  assert.equal(inPeriod(12, 14, [15, 12], [15, 2]), false);
  assert.equal(inPeriod(12, 15, [15, 12], [15, 2]), true);
  assert.equal(inPeriod(1, 1, [15, 12], [15, 2]), true);
  assert.equal(inPeriod(2, 15, [15, 12], [15, 2]), true);
  assert.equal(inPeriod(2, 16, [15, 12], [15, 2]), false);
  assert.equal(inPeriod(6, 1, [1, 3], [31, 5]), false);
});

test('calendar ban per region group, fertiliser type and slope/crop', () => {
  // KR 3, mineral: 1. 11. – 15. 2.
  assert.deepEqual(calendarBan('2026-11-01', 3, 'min'), { known: true, inBan: true, text: '1. 11. – 15. 2.' });
  assert.equal(calendarBan('2026-10-31', 3, 'min').inBan, false);
  assert.equal(calendarBan('2027-02-15', 3, 'min').inBan, true);
  assert.equal(calendarBan('2027-02-16', 3, 'min').inBan, false);
  // shorter (**) period
  assert.equal(calendarBan('2027-02-01', 3, 'min', true).inBan, false);
  assert.equal(calendarBan('2027-01-31', 3, 'min', true).text, '1. 11. – 31. 1.');
  // fast: 30. 11.
  assert.equal(calendarBan('2026-11-29', 2, 'fast').inBan, false);
  assert.equal(calendarBan('2026-11-30', 2, 'fast').inBan, true);
  // slow: no shorter period
  assert.equal(calendarBan('2027-02-10', 1, 'slow', true).inBan, true);
  assert.equal(calendarBan('2026-12-14', 1, 'slow').inBan, false);
  assert.equal(calendarBan('2026-12-15', 1, 'slow').inBan, true);
  // KR 6–7 ends 28. 2.; KR 8–9 starts 15. 10.
  assert.equal(calendarBan('2027-02-28', 7, 'min').inBan, true);
  assert.equal(calendarBan('2027-02-16', 7, 'min', true).inBan, false);
  assert.equal(calendarBan('2026-10-15', 8, 'min').inBan, true);
  assert.equal(calendarBan('2026-10-14', 9, 'min').inBan, false);
  assert.equal(calendarBan('2026-11-15', 9, 'fast').inBan, true);
  // unknown region
  assert.deepEqual(calendarBan('2026-12-01', null, 'min'), { known: false, inBan: false, text: null });
});
