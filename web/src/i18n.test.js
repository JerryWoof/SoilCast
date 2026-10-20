import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { cs } from './lang/cs.js';
import { en } from './lang/en.js';
import { pickLang, t, tp, fmtNum, fmtDM, fmtPct, fmtDateFull, setLangForTest, getLang } from './i18n.js';
import { dayLabels, ageText } from './manifest.js';
import { vvkWord, anomWord, sowingDay, CROPS } from './cards.js';
import { describeTexture, soilOf, mapSoilLine, optionLabel } from './soil.js';
import { krLine, calendarBan } from './bpej.js';

afterEach(() => setLangForTest('cs'));

test('cs and en tables have exactly the same keys', () => {
  // Plural categories legitimately differ (Czech has 'few', English does not); each plural needs '.other'.
  const base = (tbl) => [...new Set(Object.keys(tbl).map((k) => k.replace(/\.(one|few|many)$/, '.other')))].sort();
  const a = base(cs);
  const b = base(en);
  assert.deepEqual(a.filter((k) => !b.includes(k)), [], 'keys missing in en');
  assert.deepEqual(b.filter((k) => !a.includes(k)), [], 'keys missing in cs');
});

test('placeholders match between cs and en', () => {
  const ph = (s) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
  for (const k of Object.keys(cs)) {
    if (/\.(one|few|many|other)$/.test(k)) continue; // plural forms may differ in what they use
    assert.deepEqual(ph(en[k]), ph(cs[k]), `placeholders of ${k}`);
  }
});

test('no empty strings in the tables', () => {
  for (const [name, tbl] of [['cs', cs], ['en', en]]) for (const [k, v] of Object.entries(tbl)) assert.ok(String(v).trim() !== '', `${name}.${k}`);
});

test('every literal t("key") / tp("key") in the sources exists in the tables', () => {
  const dir = new URL('.', import.meta.url);
  const used = new Set();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js') && !x.endsWith('.test.js') && x !== 'i18n.js')) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/\bt\('([\w.\-]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/\btp\('([\w.\-]+)'/g)) used.add(`${m[1]}.other`);
  }
  const html = ['index.html', 'presnost.html', 'jak-to-funguje.html'].map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).join('\n');
  for (const m of html.matchAll(/data-i18n(?:-html)?="([\w.\-]+)"/g)) used.add(m[1]);
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const p of m[1].split(';')) used.add(p.split(':')[1].trim());
  const missing = [...used].filter((k) => !(k in cs) || !(k in en));
  assert.deepEqual(missing, []);
});

test('language choice: ?lang, saved choice, then Czech system → cs, anything else → en', () => {
  assert.equal(pickLang({ languages: ['cs-CZ', 'en'] }), 'cs');
  assert.equal(pickLang({ languages: ['cs'] }), 'cs');
  assert.equal(pickLang({ languages: ['en-US'] }), 'en');
  assert.equal(pickLang({ languages: ['de-DE', 'cs'] }), 'en', 'only the first (system) language counts');
  assert.equal(pickLang({ languages: ['sk'] }), 'en');
  assert.equal(pickLang({ languages: [] }), 'en');
  assert.equal(pickLang({}), 'en');
  assert.equal(pickLang({ languages: ['cs'], stored: 'en' }), 'en', 'manual choice overrides the system');
  assert.equal(pickLang({ languages: ['en'], stored: 'cs' }), 'cs');
  assert.equal(pickLang({ languages: ['cs'], stored: 'xx' }), 'cs', 'garbage in storage is ignored');
  assert.equal(pickLang({ languages: ['cs'], stored: 'cs', search: '?lang=en' }), 'en', 'URL parameter wins');
  assert.equal(pickLang({ languages: ['en'], search: '?foo=1&lang=CS' }), 'cs');
  assert.equal(pickLang({ languages: ['en'], search: '?lang=de' }), 'en');
});

test('t() fills placeholders and falls back to the key', () => {
  assert.equal(t('hint.long', { n: 5 }).includes('5 dní'), true);
  setLangForTest('en');
  assert.equal(t('hint.long', { n: 5 }), 'Click anywhere in Czechia: we show the soil temperature and moisture at that spot and a 5-day forecast.');
  assert.equal(t('no.such.key'), 'no.such.key');
  assert.equal(t('status.asof', {}), 'As of {time}', 'unknown placeholders are left alone');
});

test('Czech plurals: 1 den, 2–4 dny, 5+ dní; English: 1 day, 2 days', () => {
  assert.equal(tp('unit.days', 1), '1 den');
  assert.equal(tp('unit.days', 3), '3 dny');
  assert.equal(tp('unit.days', 5), '5 dní');
  assert.equal(tp('unit.days', 22), '22 dní'.replace('22 dní', '22 dní'));
  assert.equal(tp('ago.days', 1), 'před 1 dnem');
  assert.equal(tp('ago.days', 2), 'před 2 dny');
  setLangForTest('en');
  assert.equal(tp('unit.days', 1), '1 day');
  assert.equal(tp('unit.days', 3), '3 days');
  assert.equal(tp('ago.days', 2), '2 days ago');
  assert.equal(tp('lead.days', 1), '+1 day');
});

test('number and date formatting follow the language', () => {
  assert.equal(fmtNum(-1.5), '−1,5');
  assert.equal(fmtDM(20, 10), '20. 10.');
  assert.equal(fmtPct(60), '60 %');
  assert.equal(fmtDateFull('2026-10-20'), '20. 10. 2026');
  setLangForTest('en');
  assert.equal(getLang(), 'en');
  assert.equal(fmtNum(-1.5), '−1.5');
  assert.equal(fmtNum(1234.5, 1), '1,234.5');
  assert.equal(fmtDM(20, 10), '20 Oct');
  assert.equal(fmtPct(60), '60%');
  assert.equal(fmtDateFull('2026-10-20'), '20 Oct 2026');
});

test('day labels and ages in English', () => {
  setLangForTest('en');
  const L = dayLabels(['2026-10-19', '2026-10-20', '2026-10-21'], '2026-10-19');
  assert.equal(L[0].rel, 'Today');
  assert.equal(L[1].rel, 'Tomorrow');
  assert.equal(L[2].weekday, 'Wed');
  assert.equal(L[2].dm, '21 Oct');
  assert.match(L[2].long, /Wednesday/);
  assert.equal(ageText(0.2), 'just now');
  assert.equal(ageText(3), '3 h ago');
  assert.equal(ageText(60), '3 days ago');
});

test('English wording of the card helpers', () => {
  setLangForTest('en');
  assert.equal(vvkWord(112), 'above FC (waterlogged)');
  assert.equal(vvkWord(25), 'dry');
  assert.equal(anomWord(-2), 'drier than usual');
  const crop = CROPS.find((c) => c.id === 'kukurice');
  const daily = (v) => ({ t: { t2_min: Array(7).fill(5), t5_min: Array(7).fill(v), t5_max: Array(7).fill(v + 4), t5_09: Array(7).fill(v) }, flags: { value: Array(7).fill(4) } });
  const cold = sowingDay({ static: {}, daily: daily(3) }, 0, crop);
  assert.ok(cold.reasons.some((r) => /below 8/.test(r)), cold.reasons.join('|'));
  const edge = sowingDay({ static: {}, daily: daily(9) }, 5, crop);
  assert.ok(edge.notes.some((n) => /extends beyond the forecast/.test(n)));
  assert.equal(krLine(3), 'climate region 3 (warm, moderately humid)');
  assert.equal(calendarBan('2026-12-01', 4, 'min').text, '1 Nov – 15 Feb');
});

test('English soil wording, generic labels translated and proper names kept', () => {
  setLangForTest('en');
  const soil = soilOf({ clay: [20, 20, 22, 30, 35, 35], sand: [40, 40, 38, 30, 25, 25], cfvo: [10, 15, 15, 20, 20, 20] });
  assert.match(describeTexture(soil), /soil, heavier at depth, stone content/);
  const manifest = {
    soil_types: [
      { id: 0, tksp: 'hnědozem modální', wrb: 'Haplic Luvisol', group: 'hnědozem' },
      { id: 1, tksp: 'kambizem pelická', wrb: null, group: 'kambizem' },
    ],
    quaternary: ['spraše a sprašové hlíny'],
  };
  assert.equal(mapSoilLine({ soil_type: 0, soil_src: 1 }, manifest), 'Soil map: Haplic Luvisol (hnědozem modální) – source: CGS soil map 1:50,000');
  assert.match(mapSoilLine({ soil_type: 1, soil_src: 4 }, manifest), /^By BPEJ: Cambisol \(kambizem pelická\) – source: SPÚ, 2026$/);
  assert.equal(mapSoilLine({ soil_type: null, soil_src: 0 }, manifest), 'The soil map has no data here');
  assert.equal(optionLabel({ kind: 'cover', cover: 1 }, manifest), 'As grassland');
  assert.equal(optionLabel({ kind: 'soil', soil_type: 0 }, manifest), 'Haplic Luvisol');
});
