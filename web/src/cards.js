// Decision-card logic. Pure functions over one decoded grid cell
// (see blocks.js `cell(i)`), so they can be unit-tested without a browser.

import { t, tp, fmtNum } from './i18n.js';

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

export const CROPS = [
  {
    id: 'obilniny',
    depth: 5,
    temp: 4,
    days: 1,
    tempSecondary: true,
    sources: [
      ['Úroda', 'https://uroda.cz/jarni-jecmen-chce-svoje-vhodne-prostredi-a-dobrou-peci/'],
      ['Agromanuál', 'https://www.agromanual.cz/cz/atlas/plodiny/plodina/jecmen-jarni'],
    ],
  },
  {
    id: 'repa',
    depth: 5,
    temp: 5,
    opt: 10,
    days: 3,
    sources: [
      ['BBRO', 'https://bbro.co.uk/media/50019/19-advisory-bulletin-no-3.pdf'],
      ['KWS', 'https://kws.com/gb/en/digital-services/mykws/start-page/sugarbeet/soil-temperature'],
    ],
  },
  {
    id: 'brambory',
    depth: 10,
    temp: 8,
    days: 3,
    sources: [['Úroda', 'https://uroda.cz/pole-neni-zahrada-aneb-jak-doma-vypestovat-nejlepsi-brambory/']],
  },
  {
    id: 'kukurice',
    depth: 5,
    temp: 8,
    opt: 10,
    days: 3,
    sources: [
      ['JČU', 'https://dspace.jcu.cz/bitstreams/aee4937e-1cd8-460d-9e50-559df19df7e2/download'],
      ['Farmers Weekly', 'https://www.fwi.co.uk/arable/wait-on-maize-till-it-s-warm'],
    ],
  },
  {
    id: 'slunecnice',
    depth: 5,
    temp: 8,
    opt: 10,
    days: 3,
    unresolved: true,
    sources: [['UNL CropWatch', 'https://cropwatch.unl.edu/soil-temperature-guide-planting-agronomic-crops-nebraska']],
  },
];

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
  if (has(f, FLAG.FROZEN)) out.push(t('sow.r.frozen'));
  if (has(f, FLAG.WATERLOGGED)) out.push(t('sow.r.waterlogged'));
  else if (f !== null && !has(f, FLAG.TRAFFICABLE)) out.push(t('sow.r.notraffic'));
  return out;
}

/**
 * Sowing verdict for one crop and day. `th` = {temp, days} overrides the crop defaults.
 * Returns {status, reasons[], notes[]}.
 */
export function sowingDay(p, d, crop, th = {}) {
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
    if (crop.opt && mins.every((v) => v >= crop.opt)) notes.push(t('sow.r.warm'));
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

  // Frost after emergence: a hard surface frost later in the forecast.
  for (let k = d + 1; k < ndays; k++) {
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
  const frozenMorning = has(f, FLAG.FROZEN) || (t2min !== null && t2min < 0);
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
      const hard = has(f, FLAG.FROZEN) || has(f, FLAG.SNOW);
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
  if (has(f, FLAG.FROZEN)) reasons.push(t('sow.r.frozen'));
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
  if (has(f, FLAG.FROZEN)) reasons.push(t('n.r.frozen'));
  if (has(f, FLAG.WATERLOGGED)) reasons.push(t('n.r.wet'));
  if (has(f, FLAG.SNOW)) reasons.push(t('n.r.snow'));
  const banned = Boolean(cal?.inBan);
  return { status: reasons.length || (banned && binding) ? STATUS.BAD : STATUS.OK, reasons, known: f !== null, calendar: cal, banned, binding };
}

// ---------- Irrigation ----------

export const IRRIGATION_DEFAULT = { trigger: 60, layer: '0-40' };

export function irrigation(p, d, settings = IRRIGATION_DEFAULT) {
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
  let refill = null;
  if (awc !== null && awc !== undefined) {
    refill = avail !== null ? Math.max(0, awc - avail) : vvk !== null ? Math.max(0, ((100 - vvk) / 100) * awc) : null;
  }
  const status = vvk === null ? STATUS.BORDER : vvk < trigger ? STATUS.BAD : daysUntil !== null ? STATUS.BORDER : STATUS.OK;
  return { status, vvk, trigger, layer, daysUntil, refill, awc };
}
