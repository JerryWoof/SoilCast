// Per-visitor preferences in localStorage. Every access is guarded: storage
// can be missing or throw (private mode, blocked site data).

const KEY = 'soilcast.settings.v1';

export const DEFAULTS = {
  layer: 'vvk40', // soil moisture 0–40 cm is the first map visitors see
  stations: false, // ČHMÚ station markers off by default; the layer panel checkbox turns them on
  theme: 'light', // light | dark (light is the default for everyone)
  crop: 'kukurice',
  cropThresholds: {}, // {cropId: {temp, days}}
  irrigation: { trigger: 60, layer: '0-40' },
  traffic: { fc: 90 }, // topsoil (0–10 cm) water as % of field capacity
  nvz: 'nevim', // ano | ne | nevim
  nkr: 'auto', // climate region for the N calendar: auto | 0–9
  ntype: 'min', // min | fast | slow
  ngentle: false, // slope up to 5° and a crop on the land
  showTheta: false,
};

let cached = null;

export function loadSettings() {
  if (cached) return cached;
  let stored = {};
  try {
    stored = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') ?? {};
  } catch {
    stored = {};
  }
  cached = { ...DEFAULTS, ...stored, irrigation: { ...DEFAULTS.irrigation, ...(stored.irrigation ?? {}) }, traffic: { ...DEFAULTS.traffic, ...(stored.traffic ?? {}) } };
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
