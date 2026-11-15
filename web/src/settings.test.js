import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
store['soilcast.settings.v1'] = JSON.stringify({
  crop: '"><img src=x onerror=alert(1)>',
  cropThresholds: { kukurice: { temp: '"><b>', days: '5', rain: 12 }, 'x y': { temp: 1 } },
  irrigation: { trigger: 'abc', layer: '0-100' },
  ngentle: 'yes',
});
const { loadSettings, DEFAULTS } = await import('./settings.js');

test('stored settings keep only plain values', () => {
  const s = loadSettings();
  assert.equal(s.crop, DEFAULTS.crop);
  assert.deepEqual(s.cropThresholds, { kukurice: { days: 5, rain: 12 } });
  assert.deepEqual(s.irrigation, { trigger: DEFAULTS.irrigation.trigger, layer: '0-100' });
  assert.equal(s.ngentle, false);
});
