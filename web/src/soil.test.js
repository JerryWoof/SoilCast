import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usdaClass, soilOf, describeTexture, simulatedLine, mapSoil, mapSoilLine, applyOption, optionDaily, optionLabel, textureGroup, topClass } from './soil.js';

const manifest = {
  soil_types: [{ id: 0, tksp: 'hnědozem modální', wrb: 'Haplic Luvisol', group: 'hnědozem' }],
  quaternary: ['bez pokryvu', 'spraše'],
};
const loamHeavyDeep = { clay: [20, 20, 20, 30, 40, 40], sand: [40, 40, 40, 30, 20, 20], cfvo: [15, 15, 15, 15, 15, 15] };

test('USDA texture classes', () => {
  assert.equal(usdaClass(5, 90), 12);
  assert.equal(usdaClass(20, 40), 7);
  assert.equal(usdaClass(50, 20), 1);
  assert.equal(usdaClass(45, 15), 2);
  assert.equal(usdaClass(33, 10), 5);
  assert.equal(usdaClass(10, 70), 9);
  assert.equal(usdaClass(null, 3), null);
  assert.ok(textureGroup(12) < textureGroup(7) && textureGroup(7) < textureGroup(1));
});

test('plain-language description: texture, deeper heavier, stones', () => {
  const soil = soilOf({ ...loamHeavyDeep, bedrock: 255, gw: null, perched: 0 });
  assert.equal(topClass(soil), 7);
  assert.equal(describeTexture(soil), 'hlinitá půda, v hloubce těžší, kamenitost 15 %');
  const light = soilOf({ clay: [5, 5, 5, 5, 5, 5], sand: [88, 88, 88, 88, 88, 88], cfvo: [0, 0, 0, 0, 0, 0] });
  assert.equal(describeTexture(light), 'písčitá půda');
  assert.equal(describeTexture(soilOf({})), 'půda bez údaje o zrnitosti');
});

test('simulated line: quaternary, bedrock, groundwater, stagnic', () => {
  const st = { ...loamHeavyDeep, bedrock: 60, gw: 120, perched: 1, quaternary: 1 };
  assert.equal(simulatedLine(st, manifest), 'hlinitá půda, v hloubce těžší, kamenitost 15 %, podloží: spraše, mělká skála v 60 cm, podzemní voda v 120 cm, oglejení');
  assert.equal(soilOf({ ...st, bedrock: 300 }).bedrock, null);
  assert.equal(soilOf({ ...st, gw: null }).gw, null);
});

test('soil map line and missing map unit', () => {
  assert.equal(mapSoilLine({ soil_type: 0, soil_src: 1 }, manifest), 'Podle půdní mapy: hnědozem modální (Haplic Luvisol) – zdroj: ČGS půdní mapa 1 : 50 000');
  assert.match(mapSoilLine({ soil_type: 0, soil_src: 3 }, manifest), /\(sken\)$/);
  assert.match(mapSoilLine({ soil_type: 0, soil_src: 2 }, manifest), /1 : 1 000 000$/);
  assert.match(mapSoilLine({ soil_type: 0, soil_src: 4 }, manifest), /^Podle BPEJ: .+ – zdroj: SPÚ, 2026$/);
  assert.equal(mapSoilLine({ soil_type: null, soil_src: 0 }, manifest), 'Půdní mapa zde nemá údaj');
  assert.equal(mapSoil({ soil_type: 5, soil_src: 1 }, manifest).known, false);
});

test('options replace soil, cover and daily series but keep precipitation', () => {
  const fmt = [{ name: 't', count: 2, components: ['a', 'b'] }, { name: 'snow', count: 1 }, { name: 'precip', count: 1, components: ['mm'] }];
  assert.deepEqual(optionDaily({ t: [[1, 2], [3, 4]], snow: [[0, 0]] }, fmt), { t: { a: [1, 2], b: [3, 4] }, snow: { value: [0, 0] } });
  const cell = { static: { cover: 0, texture: 7, soil_type: 0, soil_src: 0, elev: 300, fc10: 30 }, daily: { t: { a: [9, 9], b: [9, 9] }, precip: { mm: [1, 2] } } };
  const opt = { id: 's2', kind: 'soil', soil_type: 0, src: 1, share: 0.3, cover: 2, ...loamHeavyDeep, bedrock: 300, gw: null, perched: 0, fc10: 40, daily: { t: [[1, 2], [3, 4]] } };
  const out = applyOption(cell, opt, fmt);
  assert.equal(out.static.cover, 2);
  assert.equal(out.static.soil_src, 1);
  assert.equal(out.static.fc10, 40);
  assert.equal(out.static.elev, 300);
  assert.equal(out.static.bedrock, null);
  assert.equal(out.static.texture, 7);
  assert.deepEqual(out.daily.t.a, [1, 2]);
  assert.deepEqual(out.daily.precip.mm, [1, 2]);
  assert.equal(applyOption(cell, null, fmt), cell);
  assert.equal(optionLabel(opt, manifest), 'hnědozem modální');
  assert.equal(optionLabel({ kind: 'cover', cover: 2 }, manifest), 'Jako les');
});

test('optionDaily reads all components when the manifest lists components without a count', () => {
  const fmt = [{ name: 't', components: ['a', 'b', 'c'] }, { name: 'flags', components: ['bits'] }];
  const out = optionDaily({ t: [[1, 2], [3, 4], [5, 6]], flags: [[4, 0]] }, fmt);
  assert.deepEqual(out.t, { a: [1, 2], b: [3, 4], c: [5, 6] });
  assert.deepEqual(out.flags, { bits: [4, 0], value: [4, 0] });
});
