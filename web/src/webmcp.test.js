import { test } from 'node:test';
import assert from 'node:assert/strict';

test('agent tools register and validate input', async () => {
  const tools = {};
  globalThis.document = { modelContext: { registerTool: async (t) => (tools[t.name] = t) } };
  globalThis.addEventListener = () => {};
  const { registerAgentTools } = await import('./webmcp.js');
  const state = { status: { hasData: true, analysisTime: 'x' }, layer: 'vvk40', day: 0, labels: [{ long: 'pondělí' }, { long: 'úterý' }], manifest: { days: ['2026-11-16', '2026-11-17'], maps: { layers: [{ id: 'vvk40' }, { id: 't5' }] } } };
  const calls = [];
  registerAgentTools({ state, layerIds: () => ['vvk40', 't5'], layerName: (L) => L.id, openPoint: async () => calls.push('open'), pickLayer: (id) => calls.push(id), setDay: (d) => calls.push(d), panel: { innerText: 'x' } });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(Object.keys(tools).sort(), ['get_map_state', 'get_soil_at_place', 'show_forecast_day', 'show_map_layer']);
  assert.ok(tools.show_map_layer.execute({ layer: 'nope' }).error);
  assert.equal(tools.show_map_layer.execute({ layer: 't5' }).layer, 't5');
  assert.ok(tools.show_forecast_day.execute({ day: 5 }).error);
  assert.ok((await tools.get_soil_at_place.execute({ lat: 40, lng: 15 })).error);
  assert.deepEqual(calls, ['t5']);
});
