import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { decodeBlock, encodeBlock, gunzipIfNeeded, isGzip } from './blocks.js';
import { FORMAT_V1, FORMAT_V11 } from '../scripts/format-v1.mjs';

const NDAYS = 7;
// Deterministic physical values that are exactly representable after scaling.
function value(f, k, d, i) {
  if (d === null) {
    if (f.components) return (i + k * 5) % 90;
    if (f.name === 'elev') return 200 + i;
    if (f.name === 'land') return i % 2;
    if (f.name === 'fc10' || f.name === 'awc10') return 0.5 * (i % 60);
    return 1 + (i % 3);
  }
  if (f.name === 't') return -20 + 0.25 * ((i + k * 7 + d * 3) % 250);
  if (f.name === 'theta') return 0.004 * ((i + k + d) % 120);
  if (f.name === 'precip') return 0.5 * ((i + k + d) % 100);
  if (f.name === 'deep_anom') return ((i + k + d) % 7) - 3;
  return (i + k + d) % 130;
}
const byName = Object.fromEntries([...FORMAT_V1.static, ...FORMAT_V1.daily].map((f) => [f.name, f]));
const encode = (fmt = FORMAT_V1) => encodeBlock({ ndays: NDAYS, br: 15, bc: 22 }, fmt, (name, k, d, i) => value(byName[name] ?? { name }, k, d, i));

test('header and round trip of every v1 field', () => {
  const block = decodeBlock(encode(), FORMAT_V1);
  assert.equal(block.ndays, NDAYS);
  assert.equal(block.br, 15);
  assert.equal(block.bc, 22);
  for (const i of [0, 1, 33, 517, 1023]) {
    const p = block.cell(i);
    for (const f of FORMAT_V1.static) assert.equal(p.static[f.name], value(f, null, null, i), `${f.name}[${i}]`);
    for (const f of FORMAT_V1.daily) {
      const comps = f.components ?? ['value'];
      comps.forEach((c, k) => {
        for (let d = 0; d < NDAYS; d++) {
          const got = p.daily[f.name][c][d];
          assert.ok(Math.abs(got - value(f, k, d, i)) < 1e-9, `${f.name}.${c}[${d}] cell ${i}: ${got}`);
        }
      });
    }
  }
});

test('new fields: fc10/awc10 scale 0.5, precip, t5_09 as last t component', () => {
  assert.equal(FORMAT_V1.daily[0].components.at(-1), 't5_09');
  const p = decodeBlock(encode(), FORMAT_V1).cell(9);
  assert.equal(p.static.fc10, 4.5);
  assert.ok(p.daily.t.t5_09.every((v) => v !== null));
  assert.equal(p.daily.precip.mm[3], 0.5 * ((9 + 0 + 3) % 100));
});

test('decoder tolerates `bottom` present or absent', () => {
  const noBottom = { static: FORMAT_V1.static.filter((f) => f.name !== 'bottom'), daily: FORMAT_V1.daily };
  const p = decodeBlock(encode(noBottom), noBottom).cell(3);
  assert.equal(p.static.bottom, undefined);
  assert.equal(p.static.fc10, 1.5);
  assert.ok(decodeBlock(encode(), FORMAT_V1).cell(3).static.bottom !== undefined);
});

test('nodata decodes to null', () => {
  const buf = encodeBlock({ ndays: 2, br: 0, bc: 0 }, FORMAT_V1, (name, k) => (name === 't' && k === 12 ? null : name === 'deep_anom' ? null : 1));
  const p = decodeBlock(buf, FORMAT_V1).cell(5);
  assert.deepEqual(p.daily.t.t200, [null, null]);
  assert.deepEqual(p.daily.deep_anom['150'], [null, null]);
  assert.equal(p.daily.t.t2_min[0], 1);
});

test('decodes generically: an extra field appended by the engine', () => {
  const fmt = { static: [...FORMAT_V1.static, { name: 'slope', dtype: 'u8', scale: 0.5, offset: 0 }], daily: [...FORMAT_V1.daily, { name: 'extra', dtype: 'u16', scale: 0.1, offset: 0, nodata: 65535 }] };
  const buf = encodeBlock({ ndays: 3, br: 1, bc: 2 }, fmt, (name, k, d, i) => (name === 'slope' ? 7.5 : name === 'extra' ? 12.3 : 0));
  const p = decodeBlock(buf, fmt).cell(100);
  assert.equal(p.static.slope, 7.5);
  assert.ok(Math.abs(p.daily.extra.value[2] - 12.3) < 1e-9);
});

test('rejects wrong magic, field count mismatch and truncation', () => {
  const buf = encode();
  assert.throws(() => decodeBlock(new ArrayBuffer(16), FORMAT_V1), /not a SoilCast block/);
  assert.throws(() => decodeBlock(buf, { static: FORMAT_V1.static, daily: FORMAT_V1.daily.slice(1) }), /fields/);
  assert.throws(() => decodeBlock(buf.slice(0, 5000), FORMAT_V1), /truncated/);
});

test('gzip and plain bodies both decode', async () => {
  const plain = encode();
  const gz = gzipSync(Buffer.from(plain));
  assert.equal(isGzip(new Uint8Array(gz)), true);
  assert.equal(isGzip(new Uint8Array(plain)), false);
  const ab = gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength);
  const out = await gunzipIfNeeded(ab);
  assert.equal(out.byteLength, plain.byteLength);
  assert.equal(decodeBlock(out, FORMAT_V1).cell(7).static.elev, 207);
  assert.equal(await gunzipIfNeeded(plain), plain);
});

test('v1.1 static fields with components decode as arrays [component][cell]', () => {
  const byName11 = Object.fromEntries([...FORMAT_V11.static, ...FORMAT_V11.daily].map((f) => [f.name, f]));
  const buf = encodeBlock({ ndays: NDAYS, br: 3, bc: 4 }, FORMAT_V11, (name, k, d, i) => value(byName11[name] ?? { name }, k, d, i));
  const block = decodeBlock(buf, FORMAT_V11);
  for (const i of [0, 77, 1023]) {
    const st = block.cell(i).static;
    for (const name of ['clay', 'sand', 'cfvo']) {
      assert.equal(st[name].length, 6);
      st[name].forEach((v, k) => assert.equal(v, (i + k * 5) % 90, `${name}[${k}] cell ${i}`));
    }
    assert.equal(typeof st.soil_src, 'number');
    assert.equal(typeof st.perched, 'number');
  }
  // bedrock scale 2 cm, nodata 255 -> null; gw too
  const nb = decodeBlock(encodeBlock({ ndays: 1, br: 0, bc: 0 }, FORMAT_V11, (name, k) => (name === 'bedrock' ? 60 : name === 'gw' || name === 'soil_type' ? null : 1)), FORMAT_V11).cell(9).static;
  assert.equal(nb.bedrock, 60);
  assert.equal(nb.gw, null);
  assert.equal(nb.soil_type, null);
});

test('old v1 blocks still decode with plain scalar statics', () => {
  const st = decodeBlock(encode(), FORMAT_V1).cell(5).static;
  assert.equal(st.clay, undefined);
  assert.equal(typeof st.fc10, 'number');
});
