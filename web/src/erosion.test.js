import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setLangForTest } from './i18n.js';
import { hasErosion, roundShare, longTerm, longTermText, lpisShares, lpisText, forecastDays, reasonText, dayLines, foldHint, WHY } from './erosion.js';

afterEach(() => setLangForTest('cs'));

const daily = (local, area = local, why = local.map(() => 0)) => ({ ero: { local, area }, ero_why: { bits: why, value: why } });

test('hasErosion: false for older data, true for any erosion field', () => {
  assert.equal(hasErosion({ static: { cover: 0 }, daily: {} }), false);
  assert.equal(hasErosion({ static: { ero_cls: null, dzes_seo: null, dzes_meo: null }, daily: { ero: { local: [null, null], area: [null, null] } } }), false);
  assert.equal(hasErosion({ static: { ero_cls: 2 }, daily: {} }), true);
  assert.equal(hasErosion({ static: { dzes_seo: 5, dzes_meo: 10 }, daily: {} }), true);
  assert.equal(hasErosion({ static: {}, daily: daily([0, 1]) }), true);
  assert.equal(hasErosion(null), false);
});

test('roundShare rounds to 5 percent', () => {
  assert.equal(roundShare(41), 40);
  assert.equal(roundShare(43), 45);
  assert.equal(roundShare(100), 100);
  assert.equal(roundShare(null), null);
  assert.equal(roundShare(NaN), null);
});

test('longTerm: class 0 is "few arable land", protective cover gets its own text', () => {
  assert.deepEqual(longTerm({ ero_cls: 0, cover: 0 }), { kind: 'few', cls: 0, share: null });
  assert.equal(longTerm({ ero_cls: 0, cover: 1 }).kind, 'cover');
  assert.equal(longTerm({ ero_cls: 0, cover: 2 }).kind, 'cover');
  assert.equal(longTerm({ ero_cls: 0, cover: 3 }).kind, 'few');
  assert.deepEqual(longTerm({ ero_cls: 3, ero_share: 40 }), { kind: 'level', cls: 3, share: 40 });
  assert.equal(longTerm({ ero_cls: null }), null);
  assert.equal(longTerm({}), null);
  assert.equal(longTerm({ ero_cls: 9 }), null);
});

test('longTermText', () => {
  assert.equal(longTermText({ ero_cls: 3, ero_share: 40 }), 'Dlouhodobé ohrožení erozí: <b>vysoké</b> – asi 40 % orné půdy v tomto čtverci je na místech, odkud déšť snadno odnáší holou půdu.');
  assert.match(longTermText({ ero_cls: 1, ero_share: 1 }), /převážně v rovině/, 'tiny share falls back to the class sentence');
  assert.match(longTermText({ ero_cls: 4, ero_share: null }), /velká část orné půdy/);
  assert.match(longTermText({ ero_cls: 0, cover: 0 }), /málo orné půdy/);
  assert.match(longTermText({ ero_cls: 0, cover: 2 }), /bahno přitékající z polí nad vámi/);
  assert.equal(longTermText({}), '');
  setLangForTest('en');
  assert.match(longTermText({ ero_cls: 3, ero_share: 40 }), /high<\/b> – about 40% of the arable land/);
});

test('lpis: nodata hides the line; zero shares have their own text', () => {
  assert.equal(lpisShares({ dzes_seo: null, dzes_meo: null }), null);
  assert.equal(lpisText({}), '');
  assert.deepEqual(lpisShares({ dzes_seo: 35.2, dzes_meo: 19.8 }), { seo: 35, meo: 20 });
  assert.equal(lpisText({ dzes_seo: 35, dzes_meo: 20 }), 'Podle LPIS (DZES 5) je 35 % zemědělské půdy v tomto čtverci silně erozně ohrožené (SEO), 20 % mírně (MEO). Závazný je údaj v LPIS u konkrétního dílu.');
  assert.match(lpisText({ dzes_seo: 0, dzes_meo: 0 }), /není evidována/);
});

test('forecastDays: area only when worse than local; flags from ero_why', () => {
  const f = forecastDays(daily([1, 2, 0, null, 1, 2], [2, 2, 3, 3, 1, 3], [1, 0, 0, 64, 128 | 1, 128]));
  assert.equal(f.length, 6);
  assert.equal(f[0].level, 1);
  assert.equal(f[0].area, 2);
  assert.equal(f[1].area, null, 'same level: nothing extra');
  assert.equal(f[2].area, 3);
  assert.equal(f[3].level, null);
  assert.equal(f[3].area, null, 'no local value: no area note');
  assert.equal(f[3].unsure, true);
  assert.equal(f[4].possible, true);
  assert.equal(f[5].possible, true);
  assert.deepEqual(forecastDays({}), []);
});

test('reasonText: words only, no numbers', () => {
  assert.equal(reasonText(0), '');
  assert.equal(reasonText(WHY.HEAVY | WHY.WET | WHY.BARE), 'Proč: vydatný déšť, půda je už mokrá, období s holou půdou.');
  assert.equal(reasonText(WHY.UNSURE | WHY.POSSIBLE), '', 'certainty bits are not reasons');
  setLangForTest('en');
  assert.equal(reasonText(WHY.STORM | WHY.SLOPE), 'Why: a downpour, sloping land.');
});

test('dayLines: level text, neighbourhood, reasons, storm and certainty notes', () => {
  const [d] = forecastDays(daily([2], [3], [WHY.HEAVY | WHY.STORM]));
  const lines = dayLines(d);
  assert.match(lines[0], /hrozí smyv půdy/);
  assert.equal(lines[1], 'V okolí do 10 km je možné i velmi vysoké riziko.');
  assert.match(lines[2], /^Proč: vydatný déšť, přívalový déšť\.$/);
  assert.match(lines[3], /bouřkách/);
  const [p] = forecastDays(daily([1], [1], [WHY.POSSIBLE]));
  assert.ok(dayLines(p).some((x) => /jen možné riziko/.test(x)));
  const [u] = forecastDays(daily([1], [1], [WHY.UNSURE]));
  assert.ok(dayLines(u).some((x) => /méně jistá/.test(x)));
  assert.deepEqual(dayLines(forecastDays(daily([null]))[0]), []);
  assert.deepEqual(dayLines(undefined), []);
  assert.equal(dayLines(forecastDays(daily([0]))[0]).length, 1);
});

test('foldHint: today level, empty without data', () => {
  assert.equal(foldHint(daily([1, 3])), 'dnes zvýšené');
  assert.equal(foldHint(daily([3, 1])), 'dnes velmi vysoké');
  assert.equal(foldHint(daily([null, 1])), '');
  assert.equal(foldHint({}), '');
  setLangForTest('en');
  assert.equal(foldHint(daily([2])), 'today high');
});

test('public texts contain no thresholds or method words', () => {
  setLangForTest('cs');
  const all = [1, 2, 3].map((l) => dayLines(forecastDays(daily([l], [3], [255 & ~WHY.UNSURE]))[0]).join(' ')).join(' ') + longTermText({ ero_cls: 3, ero_share: 40 });
  assert.doesNotMatch(all, /t\/ha|percentil|R·K|RUSLE|USLE|mm\/h|\bp90\b|\bp75\b/i);
});
