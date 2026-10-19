// Soil profile logic (v1.1): texture classes, plain-language descriptions, the
// soil-map header lines and soil/cover options. Pure functions, no DOM.

import { TEXTURE, COVER } from './cards.js';

export const LAYER_BOUNDS = [0, 5, 15, 30, 60, 100, 200];
export const LAYER_NAMES = ['0–5', '5–15', '15–30', '30–60', '60–100', '100–200'];

/** USDA texture class 1–12 (order as in docs/outputs.md) from clay and sand in %. */
export function usdaClass(clay, sand) {
  if (clay === null || clay === undefined || sand === null || sand === undefined) return null;
  const c = clay, s = sand, z = Math.max(0, 100 - c - s);
  if (z + 1.5 * c < 15) return 12; // sand
  if (z + 1.5 * c >= 15 && z + 2 * c < 30) return 11; // loamy sand
  if (c >= 40) return z >= 40 ? 2 : 1;
  if (c >= 35 && s > 45) return 3;
  if (c >= 27 && s <= 45) return s <= 20 ? 5 : 4;
  if (c >= 20 && s > 45 && z < 28) return 6;
  if (c >= 7 && c < 27 && z >= 28 && z < 50 && s <= 52) return 7;
  if (z >= 80 && c < 12) return 10;
  if (z >= 50) return 8;
  return 9;
}

// Colour group (0 light sand … 5 heavy clay) for each USDA class.
const GROUP = [null, 5, 4, 4, 3, 3, 2, 2, 2, 1, 2, 0, 0];
export const textureGroup = (cls) => (cls ? GROUP[cls] : null);
// Sequential palette, one hue from pale sand to dark clay. The band text switches to white from group 3.
export const TEXTURE_COLORS = ['#f1e7c6', '#e3cf96', '#cfad75', '#ad8458', '#876443', '#5f4630'];
export const textureInk = (g) => (g >= 3 ? '#ffffff' : '#2b2012');

const SHORT = [null, 'jíl', 'prach. jíl', 'písč. jíl', 'jílov. hlína', 'prach.-jílov. hl.', 'písč.-jílov. hl.', 'hlína', 'prach. hlína', 'písč. hlína', 'prach', 'hlin. písek', 'písek'];
const PLAIN = [null, 'jílovitá půda', 'těžká prachovitojílovitá půda', 'těžká písčitojílovitá půda', 'jílovitohlinitá půda', 'prachovitojílovitohlinitá půda', 'písčitojílovitohlinitá půda', 'hlinitá půda', 'prachovitohlinitá půda', 'písčitohlinitá půda', 'prachovitá půda', 'hlinitopísčitá půda', 'písčitá půda'];
export const shortTexture = (cls) => (cls ? SHORT[cls] : '—');
export const plainTexture = (cls) => (cls ? PLAIN[cls] : 'půda');
export const fullTexture = (cls) => (cls ? TEXTURE[cls][0] : '—');

export const SOIL_SRC = {
  1: 'ČGS půdní mapa 1 : 50 000',
  2: 'ČGS půdní mapa 1 : 1 000 000',
  3: 'ČGS půdní mapa 1 : 50 000 (sken)',
};
export const GW_NONE = 200; // groundwater below this depth is not drawn
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Normalised soil description from static fields (block cell or option). */
export function soilOf(st) {
  const arr = (a) => (Array.isArray(a) ? a : []);
  const clay = arr(st.clay), sand = arr(st.sand), cfvo = arr(st.cfvo);
  const layers = LAYER_NAMES.map((name, k) => {
    const c = num(clay[k]), s = num(sand[k]);
    const cls = c !== null && s !== null ? usdaClass(c, s) : null;
    return { name, from: LAYER_BOUNDS[k], to: LAYER_BOUNDS[k + 1], clay: c, sand: s, silt: c !== null && s !== null ? Math.max(0, 100 - c - s) : null, cfvo: num(cfvo[k]) ?? 0, cls, group: textureGroup(cls) };
  });
  const bedrock = num(st.bedrock);
  const gw = num(st.gw);
  return {
    layers,
    hasLayers: layers.some((l) => l.cls !== null),
    bedrock: bedrock !== null && bedrock < 200 ? bedrock : null,
    gw: gw !== null && gw <= GW_NONE ? gw : null,
    perched: Boolean(st.perched),
  };
}

const weighted = (layers, key, to) => {
  let sum = 0, w = 0;
  for (const l of layers) {
    if (l.from >= to || l[key] === null) continue;
    const t = Math.min(l.to, to) - l.from;
    sum += l[key] * t;
    w += t;
  }
  return w ? sum / w : null;
};

/** Texture class of the topsoil 0–30 cm (thickness-weighted clay and sand). */
export function topClass(soil) {
  const c = weighted(soil.layers, 'clay', 30), s = weighted(soil.layers, 'sand', 30);
  return c === null || s === null ? null : usdaClass(c, s);
}

export function stoniness(soil) {
  const v = weighted(soil.layers, 'cfvo', 60);
  return v === null ? 0 : Math.round(v);
}

/** 'hlinitá půda, v hloubce těžší, kamenitost 15 %' */
export function describeTexture(soil) {
  if (!soil.hasLayers) return 'půda bez údaje o zrnitosti';
  const top = topClass(soil);
  const parts = [plainTexture(top)];
  const deep = soil.layers[4].group ?? soil.layers[3].group;
  const g = textureGroup(top);
  if (g !== null && deep !== null) {
    if (deep - g >= 1) parts.push('v hloubce těžší');
    else if (g - deep >= 1) parts.push('v hloubce lehčí');
  }
  const st = stoniness(soil);
  if (st >= 5) parts.push(`kamenitost ${st} %`);
  return parts.join(', ');
}

/** The "Simulujeme: …" line. */
export function simulatedLine(st, manifest) {
  const soil = soilOf(st);
  const parts = [describeTexture(soil)];
  const q = manifest?.quaternary?.[st.quaternary];
  const tail = [];
  if (typeof q === 'string' && q) tail.push(`podloží: ${q}`);
  if (soil.bedrock !== null) tail.push(`mělká skála v ${Math.round(soil.bedrock)} cm`);
  if (soil.gw !== null) tail.push(`podzemní voda v ${Math.round(soil.gw)} cm`);
  if (soil.perched) tail.push('oglejení');
  return [...parts, ...tail].join(', ');
}

/** What the soil map says: {known, name, wrb, src}. */
export function mapSoil(st, manifest) {
  const src = st.soil_src ?? 0;
  const t = st.soil_type === null || st.soil_type === undefined ? null : manifest?.soil_types?.[st.soil_type];
  if (!src || !t) return { known: false };
  return { known: true, name: t.tksp ?? t.group ?? '', wrb: t.wrb ?? null, src: SOIL_SRC[src] ?? 'ČGS půdní mapa' };
}

export function mapSoilLine(st, manifest) {
  const m = mapSoil(st, manifest);
  if (!m.known) return 'Půdní mapa zde nemá údaj';
  return `Podle půdní mapy: ${m.name}${m.wrb ? ` (${m.wrb})` : ''} – zdroj: ${m.src}`;
}

// ---------- options ----------
export const COVER_OPTION = ['pole', 'louka', 'les'];

export function optionLabel(o, manifest) {
  if (o.kind === 'cover') return `Jako ${COVER_OPTION[o.cover] ?? COVER[o.cover] ?? 'jiný porost'}`;
  const t = manifest?.soil_types?.[o.soil_type];
  return t?.tksp ?? t?.group ?? 'Jiná půda';
}

/** Option daily arrays (components × days) → the decoded shape {label: [days]}. */
export function optionDaily(daily, dailyFormat) {
  const out = {};
  for (const f of dailyFormat ?? []) {
    let arr = daily?.[f.name];
    if (!arr) continue;
    if (typeof arr[0] === 'number' || arr[0] === null) arr = [arr];
    const count = f.count ?? 1;
    const comps = {};
    for (let k = 0; k < Math.min(count, arr.length); k++) comps[f.components?.[k] ?? (count === 1 ? 'value' : String(k))] = arr[k];
    out[f.name] = comps;
  }
  return out;
}

/**
 * Cell as the panel should show it for option `o` (null = default estimate):
 * soil/cover related static fields and the daily series come from the option,
 * everything else (elevation, precipitation, confidence) from the cell.
 */
export function applyOption(cell, o, dailyFormat) {
  if (!o) return cell;
  const st = { ...cell.static };
  for (const k of ['clay', 'sand', 'cfvo', 'bedrock', 'gw', 'perched', 'fc10', 'awc10', 'fc40', 'awc40', 'fc100', 'awc100']) if (o[k] !== undefined) st[k] = o[k];
  if (o.cover !== undefined) st.cover = o.cover;
  if (o.kind === 'soil') {
    st.soil_type = o.soil_type ?? null;
    st.soil_src = o.src ?? 0;
  }
  const soil = soilOf(st);
  if (soil.hasLayers) st.texture = topClass(soil) ?? st.texture;
  if (st.bedrock >= 300) st.bedrock = null;
  return { ...cell, static: st, daily: { ...cell.daily, ...optionDaily(o.daily, dailyFormat) } };
}

export function shareText(o) {
  return o.share === undefined || o.share === null ? '' : `${Math.round(o.share * 100)} % okolí do 10 km`;
}

// ---------- remembered choice ----------
const KEY = 'soilcast.options.v1';
export const placeKey = (lat, lng) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

export function savedOption(lat, lng) {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')[placeKey(lat, lng)] ?? null;
  } catch {
    return null;
  }
}

export function saveOption(lat, lng, id) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (id) all[placeKey(lat, lng)] = id;
    else delete all[placeKey(lat, lng)];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}
