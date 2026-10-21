// Decision-card logic. Pure functions over one decoded grid cell
// (see blocks.js `cell(i)`), so they can be unit-tested without a browser.

import { t, tp, fmtNum, locale } from './i18n.js';

export { fmtNum };

export const FLAG = { FROZEN: 1, WATERLOGGED: 2, TRAFFICABLE: 4, SNOW: 8 };
export const STATUS = { OK: 'ok', BORDER: 'border', BAD: 'bad' };
const RANK = { ok: 0, border: 1, bad: 2 };
const worse = (a, b) => (RANK[a] >= RANK[b] ? a : b);

export const coverName = (i) => (i >= 0 && i < 6 ? t(`cover.${i}`) : null);
export const confName = (i) => t(`conf.${i}`);
// USDA texture classes 1–12 (0–30 cm): name and a simple heavy/medium/light grouping.
const TEXTURE_WEIGHT = [null, 'heavy', 'heavy', 'heavy', 'heavy', 'heavy', 'medium', 'medium', 'medium', 'light', 'medium', 'light', 'light'];
export const textureOf = (cls) => (cls >= 1 && cls <= 12 ? [t(`tex.${cls}`), t(`texw.${TEXTURE_WEIGHT[cls]}`)] : null);

export const has = (flags, bit) => flags !== null && flags !== undefined && (flags & bit) !== 0;
const at = (p, field, comp, d) => p.daily[field]?.[comp]?.[d] ?? null;
const flagsAt = (p, d) => at(p, 'flags', 'value', d);
/**
 * Frozen surface on day d. The FROZEN bit alone is not trusted: the published blocks turn
 * flags 0 (wet, not trafficable) into 1, so it also needs frost ≥ 2 cm (the bit's own definition).
 */
export const frozenAt = (p, d) => has(flagsAt(p, d), FLAG.FROZEN) && (at(p, 'frost_depth', 'value', d) ?? 2) >= 2;

/** Words for a % AWC (VVK) value. */
export function vvkWord(v) {
  if (v === null || v === undefined) return '—';
  if (v > 100) return t('vvk.over');
  if (v >= 70) return t('vvk.wet');
  if (v >= 50) return t('vvk.ok');
  if (v >= 30) return t('vvk.dryish');
  return t('vvk.dry');
}

/** Words for the deep moisture anomaly class −3…+3. */
export function anomWord(a) {
  if (a === null || a === undefined) return null;
  return t(`anom.${Math.max(-3, Math.min(3, Math.round(a)))}`);
}

// ---------- Sowing ----------

// Sowing windows (MM-DD) for a middle climate region (BPEJ 3–5, roughly the sugar-beet / cereal areas):
// `opt` = the usual recommended dates, `win` = the outer range still sown in practice (early or late
// sowing). Outside `win` the card never says sowing is possible; `shiftDays` moves both by region.
// Dates: ÚKZÚZ/MZe field-trial methodology (MP 01/VR 5.4.1 and the crop trial rules: maize 15.4.–30.4.,
// colder areas by 7.5.; sunflower by end of April; sugar beet from +5 °C, by end of April; potatoes
// 20.4.–5.5., early potatoes end of March; winter wheat by 5.–10.10.; rape by 20.–30.8.) widened to
// farm practice (KWS CZ: maize mid-April to mid-May). Soybean, winter barley, rye and triticale follow
// common Czech practice; no official dated source was found, so treat them as approximate.
export const CROPS = [
  {
    id: 'obilniny',
    kind: 'spring',
    opt: ['03-10', '04-10'],
    win: ['03-01', '04-30'],
    depth: 5,
    temp: 4,
    days: 1,
    tempSecondary: true,
    sources: [['ÚKZÚZ/MZe – metodika polních zkoušek', 'https://mze.gov.cz/public/portal/-a43300---d7E1TbsP/zakladni-metodika-presnych-polnich-a-nadobovych-zkousek?_linka=a570010'], 
      ['Úroda', 'https://uroda.cz/jarni-jecmen-chce-svoje-vhodne-prostredi-a-dobrou-peci/'],
      ['Agromanuál', 'https://www.agromanual.cz/cz/atlas/plodiny/plodina/jecmen-jarni'],
    ],
  },
  {
    id: 'repa',
    kind: 'spring',
    opt: ['03-20', '04-20'],
    win: ['03-10', '04-30'],
    depth: 5,
    temp: 5,
    optTemp: 10,
    days: 3,
    sources: [['ÚKZÚZ/MZe – metodika polních zkoušek', 'https://mze.gov.cz/public/portal/-a43300---d7E1TbsP/zakladni-metodika-presnych-polnich-a-nadobovych-zkousek?_linka=a570010'], 
      ['BBRO', 'https://bbro.co.uk/media/50019/19-advisory-bulletin-no-3.pdf'],
      ['KWS', 'https://kws.com/gb/en/digital-services/mykws/start-page/sugarbeet/soil-temperature'],
    ],
  },
  {
    id: 'brambory',
    kind: 'spring',
    opt: ['04-05', '05-05'],
    win: ['03-20', '05-31'],
    depth: 10,
    temp: 8,
    days: 3,
    sources: [['ÚKZÚZ/MZe – metodika polních zkoušek', 'https://mze.gov.cz/public/portal/-a43300---d7E1TbsP/zakladni-metodika-presnych-polnich-a-nadobovych-zkousek?_linka=a570010'], ['Úroda', 'https://uroda.cz/pole-neni-zahrada-aneb-jak-doma-vypestovat-nejlepsi-brambory/']],
  },
  {
    id: 'kukurice',
    kind: 'spring',
    opt: ['04-15', '05-10'],
    win: ['04-05', '05-31'],
    depth: 5,
    temp: 8,
    optTemp: 10,
    days: 3,
    sources: [
      ['ÚKZÚZ/MZe – metodika polních zkoušek', 'https://mze.gov.cz/public/portal/-a43300---d7E1TbsP/zakladni-metodika-presnych-polnich-a-nadobovych-zkousek?_linka=a570010'],
      ['ÚKZÚZ – zkoušky kukuřice', 'https://mze.gov.cz/public/portal/-a16683---dNSzOq6k/kukurice?_linka=a555716'],
      ['KWS', 'https://www.kws.com/cz/cs/poradenstvi/zakladani-porostu/termin-seti/kukurice/'],
      ['JČU', 'https://dspace.jcu.cz/bitstreams/aee4937e-1cd8-460d-9e50-559df19df7e2/download'],
    ],
  },
  {
    id: 'slunecnice',
    kind: 'spring',
    opt: ['04-05', '04-30'],
    win: ['03-25', '05-15'],
    depth: 5,
    temp: 8,
    optTemp: 10,
    days: 3,
    unresolved: true,
    sources: [
      ['ÚKZÚZ – zkoušky slunečnice', 'https://mze.gov.cz/public/portal/mze/-a16735---MKsxQUjb/slunecnice'],
      ['UNL CropWatch', 'https://cropwatch.unl.edu/soil-temperature-guide-planting-agronomic-crops-nebraska'],
    ],
  },
  {
    id: 'soja',
    kind: 'spring',
    opt: ['04-20', '05-10'],
    win: ['04-10', '05-25'],
    depth: 5,
    temp: 10,
    optTemp: 12,
    days: 3,
    sources: [['UNL CropWatch', 'https://cropwatch.unl.edu/soil-temperature-guide-planting-agronomic-crops-nebraska']],
  },
  {
    id: 'psenice',
    kind: 'winter',
    opt: ['09-20', '10-10'],
    win: ['09-10', '11-05'],
    depth: 5,
    temp: 5,
    days: 1,
    tempSecondary: true,
    sources: [
      ['ÚKZÚZ/MZe – metodika polních zkoušek', 'https://mze.gov.cz/public/portal/-a43300---d7E1TbsP/zakladni-metodika-presnych-polnich-a-nadobovych-zkousek?_linka=a570010'],
    ],
  },
  {
    id: 'jecmen',
    kind: 'winter',
    opt: ['09-10', '09-30'],
    win: ['09-01', '10-15'],
    depth: 5,
    temp: 5,
    days: 1,
    tempSecondary: true,
    sources: [['ÚKZÚZ/MZe – metodika polních zkoušek', 'https://mze.gov.cz/public/portal/-a43300---d7E1TbsP/zakladni-metodika-presnych-polnich-a-nadobovych-zkousek?_linka=a570010']],
  },
  {
    id: 'zito',
    kind: 'winter',
    opt: ['09-15', '10-10'],
    win: ['09-05', '10-31'],
    depth: 5,
    temp: 4,
    days: 1,
    tempSecondary: true,
    sources: [['ÚKZÚZ/MZe – metodika polních zkoušek', 'https://mze.gov.cz/public/portal/-a43300---d7E1TbsP/zakladni-metodika-presnych-polnich-a-nadobovych-zkousek?_linka=a570010']],
  },
  {
    id: 'repka',
    kind: 'winter',
    opt: ['08-10', '08-25'],
    win: ['08-01', '09-05'],
    depth: 5,
    temp: 8,
    days: 1,
    sources: [['ÚKZÚZ/MZe – metodika polních zkoušek', 'https://mze.gov.cz/public/portal/-a43300---d7E1TbsP/zakladni-metodika-presnych-polnich-a-nadobovych-zkousek?_linka=a570010']],
  },
];

// Climate-region shift (days) by BPEJ climate region 0 (very warm, dry) … 9 (cold, wet): spring crops
// go in earlier in warm regions and later in cool ones; winter crops the other way round.
const SHIFT = { spring: [-7, -5, -5, 0, 0, 0, 7, 7, 14, 14], winter: [7, 5, 5, 0, 0, 0, -5, -7, -10, -10] };
// Without a BPEJ code the altitude stands in for it (production areas: maize < 250 m, sugar beet
// 250–350, cereals 350–500, potato 500–650, upland above): returns a comparable region number.
export const krFromElev = (elev) =>
  !Number.isFinite(elev) ? null : elev < 250 ? 1 : elev < 450 ? 3 : elev < 600 ? 6 : elev < 700 ? 7 : 8;
/** Climate region for the sowing dates: the BPEJ code when known, else from altitude. {kr, basis} */
export function sowingRegion(st = {}) {
  if (Number.isInteger(st?.kr)) return { kr: st.kr, basis: 'kr' };
  const kr = krFromElev(st?.elev);
  return { kr, basis: kr === null ? null : 'elev' };
}
export const shiftDays = (kind, kr) => (Number.isInteger(kr) && kr >= 0 && kr <= 9 ? SHIFT[kind][kr] : 0);

const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const doy = (md) => {
  const [m, d] = md.split('-').map(Number);
  return MDAYS.slice(0, m - 1).reduce((a, b) => a + b, 0) + Math.min(d, MDAYS[m - 1]);
};
/** Day of year 1–365 → a short local date ('15. 4.' / '15 Apr'). */
const fmtDoy = (n) => {
  let m = 0;
  while (n > MDAYS[m]) n -= MDAYS[m++];
  return new Date(2001, m, n).toLocaleDateString(locale(), { day: 'numeric', month: locale().startsWith('cs') ? 'numeric' : 'short' });
};

/**
 * Where `date` ('YYYY-MM-DD') falls in the crop's sowing season: 'winter' (December–February, no
 * sowing at all), 'before' / 'after' the outer window, or 'early' / 'opt' / 'late' inside it.
 * Null without a date. Dates in the result are formatted.
 */
export function sowingSeason(crop, date, kr = null) {
  if (!date || !crop.win) return null;
  const sh = shiftDays(crop.kind, kr);
  const [w0, w1, o0, o1] = [crop.win[0], crop.win[1], crop.opt[0], crop.opt[1]].map((md) => doy(md) + sh);
  const x = doy(date.slice(5, 10));
  const m = Number(date.slice(5, 7));
  const phase = m === 12 || m <= 2 ? 'winter' : x < w0 ? 'before' : x > w1 ? 'after' : x < o0 ? 'early' : x > o1 ? 'late' : 'opt';
  return { phase, from: fmtDoy(o0), to: fmtDoy(o1), next: fmtDoy(w0), shift: sh };
}

/** Rain (mm) in the next 48 h counted as today + tomorrow; null when unknown. */
export function rain48(p, d) {
  const a = at(p, 'precip', 'mm', d) ?? at(p, 'precip', 'value', d);
  if (a === null) return null;
  const b = at(p, 'precip', 'mm', d + 1) ?? at(p, 'precip', 'value', d + 1);
  return a + (b ?? 0);
}
export const dayRain = (p, d) => at(p, 'precip', 'mm', d) ?? at(p, 'precip', 'value', d);
export const RAIN_DEFAULT = { border: 10 }; // mm in 48 h → borderline; 2.5× → unsuitable

/** Soil-state reasons that rule out field work on day d. */
function fieldBlockers(p, d) {
  const f = flagsAt(p, d);
  const out = [];
  if (has(f, FLAG.SNOW)) out.push(t('sow.r.snow'));
  if (frozenAt(p, d)) out.push(t('sow.r.frozen'));
  if (has(f, FLAG.WATERLOGGED)) out.push(t('sow.r.waterlogged'));
  else if (f !== null && !has(f, FLAG.TRAFFICABLE)) out.push(t('sow.r.notraffic'));
  return out;
}

/**
 * Sowing verdict for one crop and day. `th` = {temp, days, rain} overrides the crop defaults.
 * `date` ('YYYY-MM-DD' of day d) and `kr` (climate region) add the sowing season: in winter the verdict
 * is unsuitable; outside the crop's window borderline with `cond` = the soil conditions alone
 * (sowingConditions); early or late in the window, at best borderline.
 * Returns {status, reasons[], notes[], season, cond} (season = sowingSeason() result or null).
 */
export function sowingDay(p, d, crop, th = {}, date = null, kr = null) {
  const season = sowingSeason(crop, date, kr);
  if (season?.phase === 'winter') return { status: STATUS.BAD, reasons: [t('sow.r.winter')], notes: [t('sow.r.next', { date: season.next })], season, cond: null };
  if (season && (season.phase === 'before' || season.phase === 'after')) {
    // Out of season: borderline (yellow) with the season reason; `cond` still says whether the soil would allow it.
    const late = crop.kind === 'winter' && season.phase === 'after';
    return {
      status: STATUS.BORDER,
      reasons: [t(late ? 'sow.r.toolate' : 'sow.r.out', { a: season.from, b: season.to })],
      notes: [t('sow.r.next', { date: season.next })],
      season,
      cond: sowingConditions(p, d, crop, th),
    };
  }
  const r = sowingConditions(p, d, crop, th);
  if (season?.phase === 'early') {
    r.status = worse(r.status, STATUS.BORDER);
    r.reasons.unshift(t('sow.r.early', { a: season.from }));
  } else if (season?.phase === 'late') {
    r.status = worse(r.status, STATUS.BORDER);
    r.reasons.unshift(t(crop.kind === 'winter' ? 'sow.r.lateautumn' : 'sow.r.late', { b: season.to }));
  }
  return { ...r, season, cond: null };
}

/** Soil and weather conditions for sowing on day d, regardless of the season. {status, reasons[], notes[]} */
export function sowingConditions(p, d, crop, th = {}) {
  const temp = th.temp ?? crop.temp;
  const days = Math.max(1, Math.round(th.days ?? crop.days));
  const ndays = p.daily.t?.t2_min?.length ?? 0;
  const minKey = `t${crop.depth}_min`;
  const nineKey = `t${crop.depth}_09`; // 09:00 value, only published for 5 cm
  const maxKey = `t${crop.depth}_max`;
  let status = STATUS.OK;
  const reasons = [];
  const notes = [];

  const block = fieldBlockers(p, d);
  if (block.length) {
    status = STATUS.BAD;
    reasons.push(...block);
  }

  const end = Math.min(ndays, d + days);
  const mins = [];
  const means = [];
  for (let k = d; k < end; k++) {
    const lo = at(p, 't', nineKey, k) ?? at(p, 't', minKey, k); // 09:00 rule where available, else minimum
    const hi = at(p, 't', maxKey, k);
    if (lo !== null) mins.push(lo);
    if (lo !== null && hi !== null) means.push((lo + hi) / 2);
  }
  let tStatus = STATUS.OK;
  if (!mins.length) {
    tStatus = STATUS.BORDER;
    reasons.push(t('sow.r.notemp'));
  } else if (mins.every((v) => v >= temp)) {
    if (crop.optTemp && mins.every((v) => v >= crop.optTemp)) notes.push(t('sow.r.warm'));
  } else if (means.length && means.every((v) => v >= temp)) {
    tStatus = STATUS.BORDER;
    reasons.push(t(nineKey in (p.daily.t ?? {}) ? 'sow.r.at9' : 'sow.r.morning', { t: fmtNum(temp) }));
  } else {
    tStatus = crop.tempSecondary ? STATUS.BORDER : STATUS.BAD;
    reasons.push(t('sow.r.below', { t: fmtNum(temp) }));
  }
  status = worse(status, tStatus);
  if (end - d < days) notes.push(t('sow.r.window', { days: tp('unit.days', days) }));

  // Rain in the next 48 h (seedbed work and drilling): provisional thresholds, editable.
  const rainBorder = th.rain ?? RAIN_DEFAULT.border;
  const r48 = rain48(p, d);
  if (r48 !== null && r48 >= rainBorder) {
    status = worse(status, r48 >= rainBorder * 2.5 ? STATUS.BAD : STATUS.BORDER);
    reasons.push(t('sow.r.rain', { mm: fmtNum(r48, 0) }));
  } else if (r48 !== null && r48 >= 1) notes.push(t('sow.r.rain', { mm: fmtNum(r48, 0) }));

  // Frost after emergence: a hard surface frost later in the forecast (winter crops are sown to overwinter).
  for (let k = d + 1; k < ndays && crop.kind !== 'winter'; k++) {
    const t2 = at(p, 't', 't2_min', k);
    if (t2 !== null && t2 <= -2) {
      if (status === STATUS.OK) status = STATUS.BORDER;
      reasons.push(t('sow.r.laterfrost'));
      break;
    }
  }
  return { status, reasons, notes };
}

// ---------- Winter ----------

export function winter(p, d) {
  const ndays = p.daily.t?.t2_min?.length ?? 0;
  const t2min = at(p, 't', 't2_min', d);
  const t2max = at(p, 't', 't2_max', d);
  const f = flagsAt(p, d);
  const frozenMorning = frozenAt(p, d) || (t2min !== null && t2min < 0);
  const thaws = frozenMorning && t2max !== null && t2max > 0;
  let cycles = 0;
  for (let k = 0; k < ndays; k++) {
    const lo = at(p, 't', 't2_min', k);
    const hi = at(p, 't', 't2_max', k);
    const snow = at(p, 'snow', 'value', k);
    if (lo !== null && hi !== null && lo < 0 && hi > 0 && !(snow > 0)) cycles++;
  }
  const frostDepth = at(p, 'frost_depth', 'value', d) ?? 0;
  const snow = at(p, 'snow', 'value', d) ?? 0;
  let status = STATUS.OK;
  if (frozenMorning) status = STATUS.BORDER;
  if (frostDepth >= 10) status = STATUS.BAD;
  return { status, frozenMorning, thaws, frostDepth, snow, cycles, t2min, t2max };
}

// ---------- Trafficability ----------

export const TRAFFIC_DEFAULT = { fc: 90 };

/**
 * Topsoil (0–10 cm) water as % of field capacity: from theta at 2/5/10 cm, else from
 * vvk 0-10 with fc10/awc10. Returns {pct, source} or null.
 */
export function topsoilFcPct(p, d) {
  const fc10 = p.static?.fc10;
  if (fc10 === null || fc10 === undefined || fc10 <= 0) return null;
  const th = [2, 5, 10].map((z) => at(p, 'theta', String(z), d));
  if (th.every((v) => v !== null)) {
    // 0–10 cm layer: 2 cm value covers 0–3.5, 5 cm covers 3.5–7.5, 10 cm covers 7.5–10 cm
    const mean = (th[0] * 3.5 + th[1] * 4 + th[2] * 2.5) / 10;
    return { pct: ((mean * 100) / fc10) * 100, source: 'theta' };
  }
  const awc10 = p.static?.awc10;
  const vvk = at(p, 'vvk', '0-10', d);
  if (vvk !== null && awc10 !== null && awc10 !== undefined) return { pct: ((fc10 - awc10 + (vvk / 100) * awc10) / fc10) * 100, source: 'vvk' };
  return null;
}

export function trafficability(p, d, settings = TRAFFIC_DEFAULT) {
  const ndays = p.daily.flags?.value?.length ?? p.daily.theta?.['5']?.length ?? 0;
  const limit = settings.fc ?? TRAFFIC_DEFAULT.fc;
  const one = (k) => {
    const f = flagsAt(p, k);
    const fc = topsoilFcPct(p, k);
    if (fc) {
      const hard = frozenAt(p, k) || has(f, FLAG.SNOW);
      return { ok: fc.pct <= limit && !hard, fc };
    }
    return { ok: has(f, FLAG.TRAFFICABLE), fc: null }; // fallback: the published trafficable flag
  };
  const now = one(d);
  let daysUntil = now.ok ? 0 : null;
  if (!now.ok) {
    for (let k = d + 1; k < ndays; k++) {
      if (one(k).ok) {
        daysUntil = k - d;
        break;
      }
    }
  }
  const reasons = [];
  const f = flagsAt(p, d);
  if (has(f, FLAG.SNOW)) reasons.push(t('sow.r.snow'));
  if (frozenAt(p, d)) reasons.push(t('sow.r.frozen'));
  if (now.fc && now.fc.pct > limit) reasons.push(t('traffic.r.moist', { a: Math.round(now.fc.pct), b: fmtNum(limit, 0) }));
  else if (!now.fc && !now.ok && !reasons.length) reasons.push(t('sow.r.notraffic'));
  return { status: now.ok ? STATUS.OK : STATUS.BAD, ok: now.ok, daysUntil, reasons, limit, fcPct: now.fc?.pct ?? null, vvk10: at(p, 'vvk', '0-10', d) };
}

// ---------- N fertiliser conditions (advisory) ----------

/**
 * `reasons` are soil-state reasons only. `cal` = result of calendarBan() for the day (optional) and
 * `binding` = whether the calendar ban applies (land in a nitrate-vulnerable zone, or not ruled out).
 * The status is BAD for a soil reason or a binding calendar ban.
 */
export function nConditions(p, d, cal = null, binding = true) {
  const f = flagsAt(p, d);
  const reasons = [];
  if (frozenAt(p, d)) reasons.push(t('n.r.frozen'));
  if (has(f, FLAG.WATERLOGGED)) reasons.push(t('n.r.wet'));
  if (has(f, FLAG.SNOW)) reasons.push(t('n.r.snow'));
  const banned = Boolean(cal?.inBan);
  return { status: reasons.length || (banned && binding) ? STATUS.BAD : STATUS.OK, reasons, known: f !== null, calendar: cal, banned, binding };
}

// ---------- Irrigation ----------

export const IRRIGATION_DEFAULT = { trigger: 60, layer: '0-40' };
export const IRRIGATION_RAIN = 5; // mm today + tomorrow that puts watering on hold
const SEASON = ['04-01', '10-15']; // irrigation season; outside it plants use little water and autumn/winter rain refills the soil
const COOL_TMAX = 10; // °C: mean daily maximum over the next 3 days below this → plants use almost no water

/**
 * Irrigation advice for day d (`date` = 'YYYY-MM-DD' of that day, optional).
 * `reason` explains why watering is not advised although the soil is below the trigger:
 * 'frozen', 'season', 'cool' or 'rain' (rain today + tomorrow ≥ IRRIGATION_RAIN mm).
 * `after` / `refillAfter` = forecast moisture and missing water two days on, i.e. after that rain.
 */
export function irrigation(p, d, settings = IRRIGATION_DEFAULT, date = null) {
  const trigger = settings.trigger ?? 60;
  const layer = settings.layer ?? '0-40';
  const series = p.daily.vvk?.[layer] ?? [];
  const vvk = series[d] ?? null;
  const awc = layer === '0-40' ? p.static.awc40 : p.static.awc100;
  const avail = at(p, 'avail_mm', layer, d);
  let daysUntil = null;
  for (let k = d; k < series.length; k++) {
    if (series[k] !== null && series[k] < trigger) {
      daysUntil = k - d;
      break;
    }
  }
  const hasAwc = awc !== null && awc !== undefined;
  let refill = null;
  if (hasAwc) {
    refill = avail !== null ? Math.max(0, awc - avail) : vvk !== null ? Math.max(0, ((100 - vvk) / 100) * awc) : null;
  }
  let status = vvk === null ? STATUS.BORDER : vvk < trigger ? STATUS.BAD : daysUntil !== null ? STATUS.BORDER : STATUS.OK;

  const rain = rain48(p, d);
  const after = series.length ? series[Math.min(d + 2, series.length - 1)] ?? null : null;
  const refillAfter = hasAwc && after !== null ? Math.max(0, ((100 - after) / 100) * awc) : null;
  let reason = null;
  if (vvk !== null && status !== STATUS.OK) {
    const frozen = frozenAt(p, d) || (at(p, 'frost_depth', 'value', d) ?? 0) >= 2 || (at(p, 'snow', 'value', d) ?? 0) > 0 || has(flagsAt(p, d), FLAG.SNOW);
    const md = date ? date.slice(5, 10) : null;
    const tmax = (p.daily.t?.t2_max ?? []).slice(d, d + 3).filter((v) => v !== null);
    const meanTmax = tmax.length ? tmax.reduce((a, b) => a + b, 0) / tmax.length : null;
    if (frozen) reason = 'frozen';
    else if (md && (md < SEASON[0] || md > SEASON[1])) reason = 'season';
    else if (meanTmax !== null && meanTmax < COOL_TMAX) reason = 'cool';
    else if (status === STATUS.BAD && rain !== null && rain >= IRRIGATION_RAIN) reason = 'rain';
    if (reason) status = reason === 'rain' ? STATUS.BORDER : STATUS.OK;
  }
  return { status, reason, vvk, trigger, layer, daysUntil, refill, awc, rain, rainToday: dayRain(p, d), after, refillAfter };
}
