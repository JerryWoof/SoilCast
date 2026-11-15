// Per-visitor preferences in localStorage. Every access is guarded: storage
// can be missing or throw (private mode, blocked site data).

const KEY = 'soilcast.settings.v1';

export const DEFAULTS = {
  layer: 'vvk40', // soil moisture 0–40 cm is the first map visitors see
  stations: false, // ČHMÚ station markers off by default; the layer panel checkbox turns them on
  scheme: 'auto', // auto (follows the device) | light | dark; replaces the old 'theme' key, whose stored 'light' was only the old default
  crop: 'kukurice',
  cropThresholds: {}, // {cropId: {temp, days}}
  irrigation: { trigger: 50, layer: '0-40' },
  traffic: { fc: 90 }, // topsoil (0–10 cm) water as % of field capacity
  nvz: 'nevim', // ano | ne | nevim
  nkr: 'auto', // climate region for the N calendar: auto | 0–9
  ntype: 'min', // min | fast | slow
  ngentle: false, // slope up to 5° and a crop on the land
  showTheta: false,
};

// Stored values end up in the page's HTML: keep only the types the defaults have (numbers stay numbers, short plain strings).
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);
const word = (v, d) => (typeof v === 'string' && /^[\w-]{0,24}$/.test(v) ? v : d);
function clean(s) {
  const out = { ...s };
  for (const [k, d] of Object.entries(DEFAULTS)) {
    if (typeof d === 'number') out[k] = num(s[k], d);
    else if (typeof d === 'string') out[k] = word(s[k], d);
    else if (typeof d === 'boolean') out[k] = typeof s[k] === 'boolean' ? s[k] : d;
  }
  out.irrigation = { trigger: num(s.irrigation?.trigger, DEFAULTS.irrigation.trigger), layer: word(s.irrigation?.layer, DEFAULTS.irrigation.layer) };
  out.traffic = { fc: num(s.traffic?.fc, DEFAULTS.traffic.fc) };
  const ct = {};
  for (const [id, v] of Object.entries(s.cropThresholds && typeof s.cropThresholds === 'object' ? s.cropThresholds : {})) {
    if (!/^[\w-]{1,24}$/.test(id) || !v || typeof v !== 'object') continue;
    ct[id] = Object.fromEntries(['temp', 'days', 'rain'].filter((k) => v[k] !== undefined && Number.isFinite(Number(v[k]))).map((k) => [k, Number(v[k])]));
  }
  out.cropThresholds = ct;
  return out;
}

let cached = null;

export function loadSettings() {
  if (cached) return cached;
  let stored = {};
  try {
    stored = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') ?? {};
  } catch {
    stored = {};
  }
  cached = clean({ ...DEFAULTS, ...stored, irrigation: { ...DEFAULTS.irrigation, ...(stored.irrigation ?? {}) }, traffic: { ...DEFAULTS.traffic, ...(stored.traffic ?? {}) } });
  return cached;
}

export function saveSettings(patch) {
  cached = { ...loadSettings(), ...patch };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(cached));
  } catch {
    /* storage unavailable: keep settings for this visit only */
  }
  return cached;
}
