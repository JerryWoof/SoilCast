import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frozenAt, IRRIGATION_RAIN, rain48, sowingSeason, sowingRegion, topsoilFcPct, CROPS, FLAG, STATUS, sowingDay, winter, trafficability, nConditions, irrigation, vvkWord, anomWord } from './cards.js';

const crop = (id) => CROPS.find((c) => c.id === id);
const T = FLAG.TRAFFICABLE;

// A point with 7 days; override any series.
function point({ t5min = 9, t5max = 13, t2min = 5, t2max = 15, flags = T, vvk40 = 70, snow = 0, frost = 0, precip = null, t509 = null, theta = null, fc10 = null } = {}) {
  const s = (v) => (Array.isArray(v) ? v : Array(7).fill(v));
  return {
    static: { awc40: 80, awc100: 180, fc10, awc10: 20 },
    daily: {
      t: { t2_min: s(t2min), t2_max: s(t2max), t5_min: s(t5min), t5_max: s(t5max), t10_min: s(t5min), t10_max: s(t5max), ...(t509 !== null ? { t5_09: s(t509) } : {}) },
      vvk: { '0-10': s(70), '0-40': s(vvk40), '0-100': s(75) },
      avail_mm: { '0-40': s(vvk40).map((v) => (v / 100) * 80), '0-100': s(135) },
      flags: { value: s(flags) },
      snow: { value: s(snow) },
      frost_depth: { value: s(frost) },
      ...(precip !== null ? { precip: { mm: s(precip) } } : {}),
      ...(theta !== null ? { theta: { 2: s(theta), 5: s(theta), 10: s(theta) } } : {}),
    },
  };
}

test('maize: warm mornings for 3 days → suitable, cool mornings → borderline or not', () => {
  assert.equal(sowingDay(point(), 0, crop('kukurice')).status, STATUS.OK);
  assert.equal(sowingDay(point({ t5min: [9, 9, 7, 9, 9, 9, 9] }), 0, crop('kukurice')).status, STATUS.BORDER); // mean still ≥ 8
  assert.equal(sowingDay(point({ t5min: 4, t5max: 8 }), 0, crop('kukurice')).status, STATUS.BAD);
  // editable threshold
  assert.equal(sowingDay(point({ t5min: 4, t5max: 8 }), 0, crop('kukurice'), { temp: 3, days: 2 }).status, STATUS.OK);
});

test('sowing is ruled out by frozen, waterlogged or untrafficable soil', () => {
  assert.equal(sowingDay(point({ flags: 0 }), 0, crop('obilniny')).status, STATUS.BAD);
  assert.equal(sowingDay(point({ flags: FLAG.WATERLOGGED }), 0, crop('obilniny')).reasons[0], 'přemokřené seťové lůžko');
  assert.equal(sowingDay(point({ flags: FLAG.FROZEN, frost: 4 }), 0, crop('repa')).status, STATUS.BAD);
});

test('spring cereals: cold soil is only borderline (temperature is secondary)', () => {
  assert.equal(sowingDay(point({ t5min: 1, t5max: 3 }), 0, crop('obilniny')).status, STATUS.BORDER);
});

test('a later hard frost downgrades a suitable day', () => {
  const r = sowingDay(point({ t2min: [5, 5, 5, -3, 5, 5, 5] }), 0, crop('kukurice'));
  assert.equal(r.status, STATUS.BORDER);
  assert.ok(r.reasons.includes('pozdější mráz u povrchu'));
});

test('window running past the forecast is noted', () => {
  assert.ok(sowingDay(point(), 6, crop('kukurice')).notes.some((n) => n.includes('přesahuje')));
});

test('sowing: rain in the next 48 h downgrades, threshold editable, absent precip ignored', () => {
  const m = crop('kukurice');
  assert.equal(rain48(point({ precip: [3, 4, 0, 0, 0, 0, 0] }), 0), 7);
  assert.equal(rain48(point(), 0), null);
  assert.equal(sowingDay(point({ precip: 2 }), 0, m).status, STATUS.OK);
  const r = sowingDay(point({ precip: [6, 6, 0, 0, 0, 0, 0] }), 0, m);
  assert.equal(r.status, STATUS.BORDER);
  assert.ok(r.reasons[0].includes('12 mm'));
  assert.equal(sowingDay(point({ precip: [15, 15, 0, 0, 0, 0, 0] }), 0, m).status, STATUS.BAD);
  assert.equal(sowingDay(point({ precip: [6, 6, 0, 0, 0, 0, 0] }), 0, m, { rain: 20 }).status, STATUS.OK);
});

test('sowing: uses the 09:00 value when published, else the minimum', () => {
  const m = crop('kukurice');
  assert.equal(sowingDay(point({ t5min: 5, t5max: 14, t509: 10 }), 0, m).status, STATUS.OK);
  assert.equal(sowingDay(point({ t5min: 9, t5max: 8, t509: 4 }), 0, m).status, STATUS.BAD);
  assert.equal(sowingDay(point({ t5min: 9, t5max: 13 }), 0, m).status, STATUS.OK);
});

test('trafficability: editable % FC threshold from theta, vvk, or flag fallback', () => {
  // fc10 = 30 mm → theta_fc = 0.30; theta 0.26 → 87 %
  const wet = point({ theta: 0.26, flags: 0, fc10: 30 });
  assert.equal(Math.round(topsoilFcPct(wet, 0).pct), 87);
  assert.equal(trafficability(wet, 0).ok, true); // default 90 %, flag says no but theta wins
  assert.equal(trafficability(wet, 0, { fc: 85 }).ok, false);
  assert.ok(trafficability(wet, 0, { fc: 85 }).reasons[0].includes('85 %'));
  assert.equal(trafficability(point({ theta: 0.26, flags: FLAG.FROZEN | T, frost: 4, fc10: 30 }), 0).ok, false);
  // vvk fallback: wilting = 10 mm, awc10 = 20, vvk 70 → 24 mm = 80 %
  const v = point({ fc10: 30 });
  assert.equal(topsoilFcPct(v, 0).source, 'vvk');
  assert.equal(Math.round(topsoilFcPct(v, 0).pct), 80);
  // no fc10 → flag bit 4 fallback
  const nf = point({ fc10: null, flags: [0, T, T, T, T, T, T] });
  assert.equal(trafficability(nf, 0).ok, false);
  assert.equal(trafficability(nf, 0).daysUntil, 1);
});

test('winter: frozen morning, thaw, cycles, frost depth', () => {
  const w = winter(point({ t2min: [-3, -1, 2, -2, -2, 3, 3], t2max: [2, -0.5, 6, 1, 1, 8, 8], frost: [6, 12, 0, 0, 0, 0, 0] }), 0);
  assert.equal(w.frozenMorning, true);
  assert.equal(w.thaws, true);
  assert.equal(w.cycles, 3);
  assert.equal(w.frostDepth, 6);
  assert.equal(winter(point({ frost: 12 }), 0).status, STATUS.BAD);
  assert.equal(winter(point(), 0).status, STATUS.OK);
});

test('trafficability: days until trafficable', () => {
  const t = trafficability(point({ flags: [0, FLAG.WATERLOGGED, T, T, T, T, T] }), 0);
  assert.equal(t.ok, false);
  assert.equal(t.daysUntil, 2);
  assert.equal(trafficability(point({ flags: 0 }), 0).daysUntil, null);
  assert.equal(trafficability(point(), 3).daysUntil, 0);
});

test('N conditions flag frozen, saturated and snow-covered soil', () => {
  assert.equal(nConditions(point(), 0).status, STATUS.OK);
  const n = nConditions(point({ flags: FLAG.FROZEN | FLAG.SNOW, frost: 4 }), 0);
  assert.equal(n.status, STATUS.BAD);
  assert.deepEqual(n.reasons, ['promrzlá', 'pokrytá sněhem']);
});

test('N conditions add the calendar ban only when it is binding', () => {
  const ban = { known: true, inBan: true, text: '1. 11. – 15. 2.' };
  const a = nConditions(point(), 0, ban, true);
  assert.equal(a.status, STATUS.BAD);
  assert.deepEqual(a.reasons, []);
  assert.equal(nConditions(point(), 0, ban, false).status, STATUS.OK);
  assert.equal(nConditions(point(), 0, { known: false, inBan: false, text: null }, true).status, STATUS.OK);
});

test('irrigation: trigger, days until and refill amount', () => {
  const now = irrigation(point({ vvk40: 50 }), 0);
  assert.equal(now.status, STATUS.BAD);
  assert.equal(now.daysUntil, 0);
  assert.equal(now.refill, 40); // 80 mm capacity, 40 mm available
  const later = irrigation(point({ vvk40: [80, 72, 65, 59, 55, 52, 50] }), 0);
  assert.equal(later.status, STATUS.BORDER);
  assert.equal(later.daysUntil, 3);
  assert.equal(irrigation(point({ vvk40: 80 }), 0).status, STATUS.OK);
  assert.equal(irrigation(point({ vvk40: [80, 72, 65, 59, 55, 52, 50] }), 0, { trigger: 50, layer: '0-40' }).daysUntil, null);
});

test('irrigation: rain today or tomorrow puts watering on hold', () => {
  const july = '2026-07-10';
  const dry = { vvk40: [30, 45, 50, 48, 46, 44, 42], t2max: 25 };
  const today = irrigation(point({ ...dry, precip: [12, 3, 0, 0, 0, 0, 0] }), 0, undefined, july);
  assert.equal(today.reason, 'rain');
  assert.equal(today.status, STATUS.BORDER);
  assert.equal(today.rain, 15);
  assert.equal(today.after, 50); // forecast moisture two days on, i.e. after the rain
  assert.equal(today.refillAfter, 40); // 50 % of 80 mm
  const tomorrow = irrigation(point({ ...dry, precip: [0, 8, 0, 0, 0, 0, 0] }), 0, undefined, july);
  assert.equal(tomorrow.reason, 'rain');
  assert.equal(tomorrow.rainToday, 0);
});

test('irrigation: dry with no rain, or only a little rain vs a big deficit → water', () => {
  const july = '2026-07-10';
  const none = irrigation(point({ vvk40: 30, t2max: 25, precip: 0 }), 0, undefined, july);
  assert.equal(none.status, STATUS.BAD);
  assert.equal(none.reason, null);
  assert.equal(none.refill, 56);
  const small = irrigation(point({ vvk40: 20, t2max: 25, precip: [1.5, 2, 0, 0, 0, 0, 0] }), 0, undefined, july);
  assert.ok(small.rain < IRRIGATION_RAIN);
  assert.equal(small.status, STATUS.BAD);
});

test('irrigation: not needed on frozen soil, under snow, outside the season or in cool weather', () => {
  const dry = { vvk40: 30, t2max: 25 };
  assert.equal(irrigation(point({ ...dry, frost: 5 }), 0, undefined, '2026-07-10').reason, 'frozen');
  assert.equal(irrigation(point({ ...dry, snow: 3 }), 0, undefined, '2026-07-10').reason, 'frozen');
  // the FROZEN bit alone (published for wet unfrozen soil too) is not trusted
  assert.equal(irrigation(point({ ...dry, flags: FLAG.FROZEN }), 0, undefined, '2026-07-10').status, STATUS.BAD);
  const late = irrigation(point({ ...dry, precip: 8 }), 0, undefined, '2026-10-22');
  assert.equal(late.reason, 'season');
  assert.equal(late.status, STATUS.OK);
  assert.equal(irrigation(point(dry), 0, undefined, '2026-03-20').reason, 'season');
  assert.equal(irrigation(point(dry), 0, undefined, '2026-04-01').reason, null);
  assert.equal(irrigation(point({ vvk40: 30, t2max: 8 }), 0, undefined, '2026-05-02').reason, 'cool');
  // moist soil needs no reason
  assert.equal(irrigation(point({ vvk40: 80, frost: 5 }), 0, undefined, '2026-01-10').reason, null);
});

test('the FROZEN bit without frost depth (wet soil published as 1) is not frozen', () => {
  const wet = point({ flags: FLAG.FROZEN, frost: 0 });
  assert.equal(frozenAt(wet, 0), false);
  assert.equal(frozenAt(point({ flags: FLAG.FROZEN, frost: 3 }), 0), true);
  assert.ok(!nConditions(wet, 0).reasons.includes('promrzlá'));
  const sow = sowingDay(wet, 0, crop('obilniny'));
  assert.equal(sow.status, STATUS.BAD); // still not trafficable
  assert.ok(!sow.reasons.includes('zamrzlý povrch'));
});
test('wording helpers', () => {
  assert.equal(vvkWord(112), 'nad PK (přemokřená)');
  assert.equal(vvkWord(25), 'suchá');
  assert.equal(anomWord(-2), 'sušší než obvykle');
  assert.equal(anomWord(0), 'obvyklá');
  assert.equal(anomWord(null), null);
});

test('number formatting uses Czech comma and true minus, never −0', async () => {
  const { fmtNum } = await import('./cards.js');
  assert.equal(fmtNum(-1.25), '−1,3');
  assert.equal(fmtNum(-0.01), '0');
  assert.equal(fmtNum(null), '—');
});

test('sowing season: maize in October is out of season, early May depends on soil warmth', () => {
  const m = crop('kukurice');
  const oct = sowingDay(point(), 0, m, {}, '2026-10-22');
  assert.equal(oct.status, STATUS.BAD);
  assert.equal(oct.season.phase, 'after');
  assert.ok(oct.reasons[0].startsWith('mimo období setí'));
  assert.ok(oct.notes[0].startsWith('další období od'));
  assert.equal(sowingDay(point(), 0, m, {}, '2026-05-05').status, STATUS.OK);
  const cold = sowingDay(point({ t5min: 4, t5max: 8 }), 0, m, {}, '2026-05-05');
  assert.equal(cold.status, STATUS.BAD);
  assert.ok(cold.reasons.some((r) => r.startsWith('půda pod')));
  // early in the window: at best borderline; user thresholds still apply
  assert.equal(sowingDay(point(), 0, m, {}, '2026-04-10').status, STATUS.BORDER);
  assert.equal(sowingDay(point({ t5min: 4, t5max: 8 }), 0, m, { temp: 3 }, '2026-05-05').status, STATUS.OK);
});

test('sowing season: winter wheat early October ok, late November too late; rape in October too late', () => {
  const w = crop('psenice');
  // October: cool nights with a surface frost later are normal for winter crops
  assert.equal(sowingDay(point({ t5min: 7, t5max: 12, t2min: [3, 3, -3, 3, 3, 3, 3] }), 0, w, {}, '2026-10-05').status, STATUS.OK);
  const nov = sowingDay(point({ t5min: 2, t5max: 5 }), 0, w, {}, '2026-11-25');
  assert.equal(nov.status, STATUS.BAD);
  assert.ok(nov.reasons[0].startsWith('na setí už je pozdě'));
  const late = sowingDay(point({ t5min: 7, t5max: 12 }), 0, w, {}, '2026-10-28');
  assert.equal(late.status, STATUS.BORDER);
  assert.ok(late.reasons[0].startsWith('pozdní setí'));
  const rape = sowingDay(point(), 0, crop('repka'), {}, '2026-10-10');
  assert.equal(rape.status, STATUS.BAD);
  assert.ok(rape.reasons[0].startsWith('na setí už je pozdě'));
});

test('sowing season shifts with the climate region', () => {
  const m = crop('kukurice');
  assert.equal(sowingSeason(m, '2026-04-12', 3).phase, 'early');
  assert.equal(sowingSeason(m, '2026-04-12', 0).phase, 'opt'); // warm region: maize earlier
  assert.equal(sowingSeason(crop('psenice'), '2026-10-13', 1).phase, 'opt'); // warm region: wheat later
  assert.equal(sowingSeason(crop('psenice'), '2026-10-13', 8).phase, 'late');
  assert.equal(sowingSeason(m, null), null);
});

test('sowing region: BPEJ climate region first, else from altitude', () => {
  assert.deepEqual(sowingRegion({ kr: 2, elev: 700 }), { kr: 2, basis: 'kr' });
  assert.deepEqual(sowingRegion({ elev: 180 }), { kr: 1, basis: 'elev' });
  assert.deepEqual(sowingRegion({ elev: 820 }), { kr: 8, basis: 'elev' });
  assert.deepEqual(sowingRegion({}), { kr: null, basis: null });
});
