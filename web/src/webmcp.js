// WebMCP: the map's own actions as tools for AI agents in the browser (Chromium early preview, behind a flag).
// Without document.modelContext nothing happens. The data are public; the tools only drive this page.
const CZ = { latMin: 48.55, latMax: 51.06, lngMin: 12.09, lngMax: 18.86 };
const fail = (error, more = {}) => ({ error, ...more });

export function registerAgentTools({ state, layerIds, layerName, openPoint, pickLayer, setDay, panel }) {
  const mc = document.modelContext;
  if (!mc?.registerTool || !state.status?.hasData) return;
  const controller = new AbortController();
  addEventListener('pagehide', () => controller.abort(), { once: true });
  const opts = { signal: controller.signal };
  const days = () => state.labels.map((l, k) => ({ index: k, date: state.manifest.days[k], label: l.long }));
  const layers = () => layerIds().map((id) => ({ id, name: layerName(state.manifest.maps.layers.find((L) => L.id === id)) }));
  const reg = (tool) => mc.registerTool(tool, opts).catch(() => {});

  reg({
    name: 'get_map_state',
    description: 'Describes what the Půdoměr soil map shows now: the data time, the selected layer and day, and the layers and forecast days it can show. Use it before changing the layer or day.',
    inputSchema: { type: 'object', properties: {} },
    execute() {
      return { analysisTime: state.status.analysisTime, layer: state.layer, day: state.day, layers: layers(), days: days(), placeOpen: state.point ? { lat: state.point.lat, lng: state.point.lng } : null };
    },
    annotations: { readOnlyHint: true },
  });

  reg({
    name: 'get_soil_at_place',
    description: 'Opens the soil panel for a place in Czechia and returns its text: soil temperature and moisture today and for the coming days, the soil profile, and advice on sowing, field work, irrigation and erosion. Use it when the user asks about the soil at a town, field or coordinates in Czechia.',
    inputSchema: {
      type: 'object',
      properties: {
        lat: { type: 'number', minimum: CZ.latMin, maximum: CZ.latMax, description: 'Latitude of the place in degrees (WGS84).' },
        lng: { type: 'number', minimum: CZ.lngMin, maximum: CZ.lngMax, description: 'Longitude of the place in degrees (WGS84).' },
      },
      required: ['lat', 'lng'],
    },
    async execute({ lat, lng } = {}) {
      lat = Number(lat);
      lng = Number(lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail('Pass the latitude and longitude as numbers.');
      if (lat < CZ.latMin || lat > CZ.latMax || lng < CZ.lngMin || lng > CZ.lngMax) return fail('The place is outside Czechia; Půdoměr covers only Czechia.', { bounds: CZ });
      await openPoint(lat, lng, { fly: true });
      const P = state.point;
      return { lat, lng, inside: Boolean(P?.inside), day: state.labels[state.day]?.long, text: panel.innerText.replace(/\n{3,}/g, '\n\n').slice(0, 6000) };
    },
  });

  reg({
    name: 'show_map_layer',
    description: 'Switches the map to another quantity or depth, for example soil moisture 0–40 cm, soil temperature at 5 cm, rainfall, frost depth, the comparison with the long-term normal, or erosion risk.',
    inputSchema: { type: 'object', properties: { layer: { type: 'string', enum: layerIds(), description: 'The layer id from get_map_state.' } }, required: ['layer'] },
    execute({ layer } = {}) {
      if (!layerIds().includes(layer)) return fail('Unknown layer.', { layers: layers() });
      pickLayer(layer);
      return { layer, name: layers().find((l) => l.id === layer)?.name };
    },
  });

  reg({
    name: 'show_forecast_day',
    description: 'Shows another day of the forecast on the map and in the open soil panel.',
    inputSchema: { type: 'object', properties: { day: { type: 'integer', minimum: 0, maximum: state.labels.length - 1, description: 'Day index from get_map_state; 0 is the first day of the forecast.' } }, required: ['day'] },
    execute({ day } = {}) {
      day = Number(day);
      if (!Number.isInteger(day) || day < 0 || day >= state.labels.length) return fail('Pass a day index from get_map_state.', { days: days() });
      setDay(day);
      return { day, label: state.labels[day]?.long };
    },
  });
}
