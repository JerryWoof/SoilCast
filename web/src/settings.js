// Per-visitor preferences in localStorage. Every access is guarded: storage
// can be missing or throw (private mode, blocked site data).

const KEY = 'soilcast.settings.v1';

export const DEFAULTS = {
  layer: 't5',
  stations: true,
  theme: 'auto', // auto | light | dark
  crop: 'kukurice',
  cropThresholds: {}, // {cropId: {temp, days}}
  irrigation: { trigger: 60, layer: '0-40' },
  traffic: { fc: 90 }, // topsoil (0–10 cm) water as % of field capacity
  nvz: 'nevim', // ano | ne | nevim
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
