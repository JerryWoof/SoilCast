// Keep only stations and depths that have at least one ČHMÚ measurement in stations.json
// (a probe out of service or a closed station would otherwise show an empty chart).
export function withMeasurements(data) {
  if (!data?.stations) return data;
  const has = (s, z) => (s.series?.measured?.[z] ?? []).some((v) => v !== null);
  const stations = data.stations
    .map((s) => ({ ...s, depths: (s.depths ?? []).filter((z) => has(s, z)) }))
    .filter((s) => s.depths.length);
  return { ...data, stations };
}
