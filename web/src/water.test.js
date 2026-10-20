import test from 'node:test';
import assert from 'node:assert/strict';
import { isWater } from './water.js';

test('water rule: polygon wins when detailed, cover decides when zoomed out', () => {
  assert.equal(isWater({ polygon: true, zoom: 12, cover: 1 }), true);
  assert.equal(isWater({ polygon: false, zoom: 13, cover: 4 }), false);
  assert.equal(isWater({ polygon: false, zoom: 8, cover: 4 }), true);
  assert.equal(isWater({ polygon: true, zoom: 6, cover: 1 }), false);
  assert.equal(isWater({ polygon: null, zoom: 12, cover: 4 }), true);
  assert.equal(isWater({ polygon: null, zoom: 12, cover: 2 }), false);
});
