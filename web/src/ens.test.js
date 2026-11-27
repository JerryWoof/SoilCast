import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeBlock, decodeBlock } from './blocks.js';
import { ensCell, ensRows, probText as probTextRaw, probLevel, verifyVerdict, ensAttribution } from './ens.js';

const format = {
  magic: 'SCE1',
  static: [{ name: 'elev', dtype: 'u16', scale: 1, offset: 0, nodata: 65535 }],
  daily: [
    { name: 'p', dtype: 'u8', scale: 1, offset: 0, nodata: 255, components: ['frost5', 'frost2', 't10_ge8', 't10_ge10', 'snow1'] },
    { name: 't', dtype: 'u8', scale: 0.25, offset: -20, nodata: 255, components: ['t5_p10', 't5_p50', 't5_p90', 't5_min_p10', 't5_min_p50', 't5_min_p90', 't10_p10', 't10_p50', 't10_p90', 't20_p10', 't20_p50', 't20_p90'] },
    { name: 'vvk', dtype: 'u8', scale: 1, offset: 0, nodata: 255, components: ['vvk40_p10', 'vvk40_p50', 'vvk40_p90'] },
  ],
};
const days = ['2026-11-26', '2026-11-27', '2026-11-28'];
const ens = { days, format, grid: { stride: 4, block: 32 } };

function block(valueAt) {
  const buf = encodeBlock({ ndays: 3, br: 1, bc: 2 }, format, (name, k, d, i) => {
    if (name === 'elev') return 300;
    const comp = format.daily.find((f) => f.name === name).components[k];
    return valueAt(comp, d, i);
  });
  return decodeBlock(buf, format);
}

test('250 m cell maps to the 1 km column, block and position', () => {
  assert.deepEqual(ensCell(0, 0), { br: 0, bc: 0, i: 0 });
  assert.deepEqual(ensCell(3, 3), { br: 0, bc: 0, i: 0 });
  assert.deepEqual(ensCell(4, 8), { br: 0, bc: 0, i: 32 + 2 });
  // r1 = 130 -> block 4, row 2; c1 = 70 -> block 2, col 6
  assert.deepEqual(ensCell(130 * 4 + 2, 70 * 4 + 1), { br: 4, bc: 2, i: 2 * 32 + 6 });
});

test('rows start today, carry the original day index and decode the quantities', () => {
  const b = block((comp, d) => ({ frost5: 20 + 10 * d, t10_ge8: 60, t10_p10: 3.5, t10_p50: 6, t10_p90: 8.25, vvk40_p10: 40, vvk40_p90: 70 })[comp] ?? 0);
  const rows = ensRows(b.cell(5), ens, '2026-11-27');
  assert.deepEqual(rows.map((r) => r.date), ['2026-11-27', '2026-11-28']);
  assert.equal(rows[0].d, 1);
  assert.equal(rows[0].frost5, 30);
  assert.equal(rows[1].frost5, 40);
  assert.equal(rows[0].sow, 60);
  assert.deepEqual(rows[0].t10, { p10: 3.5, p50: 6, p90: 8.25 });
  assert.deepEqual(rows[0].vvk, { p10: 40, p90: 70 });
});

test('no data, no rows (card hidden)', () => {
  const none = block(() => null); // nodata everywhere (water, outside the model)
  assert.deepEqual(ensRows(none.cell(0), ens, '2026-11-27'), []);
  assert.deepEqual(ensRows(null, ens), []);
  assert.deepEqual(ensRows(block(() => 10).cell(0), ens, '2027-01-01'), []); // outdated run
});

test('probabilities are shown coarse', () => {
  const probText = (p) => probTextRaw(p).replace(/\s/g, ' ');
  assert.equal(probText(0), '<10 %');
  assert.equal(probText(4), '<10 %');
  assert.equal(probText(5), '10 %');
  assert.equal(probText(35), '40 %');
  assert.equal(probText(94), '90 %');
  assert.equal(probText(95), '>90 %');
  assert.equal(probText(null), '—');
  assert.deepEqual([probLevel(5), probLevel(30), probLevel(80), probLevel(null)], ['low', 'mid', 'high', null]);
});

test('verification verdict and attribution', () => {
  const v = { crpss_30d: 0.28, brier: { frost5: { bss: -0.06 }, t10_ge8: { bss: -0.004 } } };
  assert.deepEqual(verifyVerdict(v), { temp: 'better', prob: 'worse' });
  assert.deepEqual(verifyVerdict({ crpss_30d: 0.01, brier: { frost5: { bss: 0.2 }, t10_ge8: { bss: 0.3 } } }), { temp: 'same', prob: 'better' });
  assert.equal(verifyVerdict({ crpss_30d: 0.2 }).prob, null);
  assert.equal(verifyVerdict(null), null);
  const a = { attribution: ['cs text', 'en text'] };
  assert.equal(ensAttribution(a, 'cs'), 'cs text');
  assert.equal(ensAttribution(a, 'en'), 'en text');
  assert.match(ensAttribution({}, 'en'), /ECMWF/);
});

test('loadEnsForCell hides the card (null) when files are missing or broken', async () => {
  const { loadEnsForCell } = await import('./ens.js');
  const real = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 404, headers: new Headers() });
    assert.equal(await loadEnsForCell('/x1/', {}, 10, 10), null);
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal(await loadEnsForCell('/x2/', {}, 10, 10), null);
    // index present, block 404
    globalThis.fetch = async (u) => (String(u).includes('ens.json')
      ? { ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ ...ens, run: 'r' }) }
      : { ok: false, status: 404, headers: new Headers() });
    assert.equal(await loadEnsForCell('/x3/', {}, 10, 10), null);
    // index served as the HTML app shell (dev server)
    globalThis.fetch = async () => ({ ok: true, headers: new Headers({ 'content-type': 'text/html' }), json: async () => { throw new Error('html'); } });
    assert.equal(await loadEnsForCell('/x4/', {}, 10, 10), null);
  } finally {
    globalThis.fetch = real;
  }
});
