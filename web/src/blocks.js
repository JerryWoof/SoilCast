// Decoder for block files (blocks/{br}_{bc}.bin). The layout is driven by the
// manifest's blocks.format, so new fields decode without code changes.

export const MAGIC = 'SCB1';
const HEADER = 16;
const DTYPES = {
  u8: { size: 1, get: (v, o) => v.getUint8(o) },
  i8: { size: 1, get: (v, o) => v.getInt8(o) },
  u16: { size: 2, get: (v, o) => v.getUint16(o, true) },
  i16: { size: 2, get: (v, o) => v.getInt16(o, true) },
};

export function isGzip(bytes) {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export async function gunzipIfNeeded(buffer) {
  const bytes = new Uint8Array(buffer);
  if (!isGzip(bytes)) return buffer;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

function physical(field, raw) {
  if (field.nodata !== undefined && field.nodata !== null && raw === field.nodata) return null;
  return raw * (field.scale ?? 1) + (field.offset ?? 0);
}

/**
 * Parses a (decompressed) block. Returns an object with header info and
 * `cell(i)`, which extracts every field for cell i as physical values:
 *   { static: {land: 1, ...}, daily: {t: {t2_min: [d0..dN], ...}, snow: {value: [...]}} }
 */
export function decodeBlock(buffer, format) {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== MAGIC) throw new Error(`not a SoilCast block (${magic})`);
  const h = {
    version: view.getUint16(4, true),
    ndays: view.getUint16(6, true),
    br: view.getUint16(8, true),
    bc: view.getUint16(10, true),
    nStatic: view.getUint16(12, true),
    nDaily: view.getUint16(14, true),
  };
  const staticFields = format.static ?? [];
  const dailyFields = format.daily ?? [];
  if (h.nStatic !== staticFields.length || h.nDaily !== dailyFields.length) {
    throw new Error(`block has ${h.nStatic}+${h.nDaily} fields, manifest lists ${staticFields.length}+${dailyFields.length}`);
  }
  const N = 1024;
  let offset = HEADER;
  const layout = [];
  for (const f of staticFields) {
    const dt = DTYPES[f.dtype];
    if (!dt) throw new Error(`unknown dtype ${f.dtype}`);
    // Static fields may have components (v1.1), stored [component][cell].
    const count = f.components?.length ?? f.count ?? 1;
    const multi = Boolean(f.components) || count > 1;
    layout.push({ f, kind: 'static', start: offset, dt, count, multi });
    offset += count * N * dt.size;
  }
  for (const f of dailyFields) {
    const dt = DTYPES[f.dtype];
    if (!dt) throw new Error(`unknown dtype ${f.dtype}`);
    const count = f.components?.length ?? f.count ?? 1;
    layout.push({ f, kind: 'daily', start: offset, dt, count });
    offset += count * h.ndays * N * dt.size;
  }
  if (offset > buffer.byteLength) throw new Error(`block truncated (${buffer.byteLength} < ${offset} bytes)`);

  function cell(i) {
    const out = { static: {}, daily: {} };
    for (const L of layout) {
      if (L.kind === 'static') {
        // Components decode to an array in component order; plain fields to a scalar.
        out.static[L.f.name] = L.multi
          ? Array.from({ length: L.count }, (_, k) => physical(L.f, L.dt.get(view, L.start + (k * N + i) * L.dt.size)))
          : physical(L.f, L.dt.get(view, L.start + i * L.dt.size));
      } else {
        const comps = {};
        for (let k = 0; k < L.count; k++) {
          const label = L.f.components?.[k] ?? (L.count === 1 ? 'value' : String(k));
          const series = [];
          for (let d = 0; d < h.ndays; d++) {
            const idx = (k * h.ndays + d) * N + i;
            series.push(physical(L.f, L.dt.get(view, L.start + idx * L.dt.size)));
          }
          comps[label] = series;
          if (L.count === 1) comps.value = series; // single-component fields are also readable as .value
        }
        out.daily[L.f.name] = comps;
      }
    }
    return out;
  }
  return { ...h, cell };
}

/** Test/dev helper: builds a block from physical values (inverse of decodeBlock). Static fields call values(name, null|component, null, i). */
export function encodeBlock({ ndays, br, bc }, format, values) {
  const N = 1024;
  const fields = [...(format.static ?? []).map((f) => ({ f, daily: false })), ...(format.daily ?? []).map((f) => ({ f, daily: true }))];
  let size = HEADER;
  const sCount = (f) => f.components?.length ?? f.count ?? 1;
  for (const { f, daily } of fields) size += DTYPES[f.dtype].size * N * (daily ? sCount(f) * ndays : sCount(f));
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  [...MAGIC].forEach((ch, k) => v.setUint8(k, ch.charCodeAt(0)));
  v.setUint16(4, 1, true);
  v.setUint16(6, ndays, true);
  v.setUint16(8, br, true);
  v.setUint16(10, bc, true);
  v.setUint16(12, (format.static ?? []).length, true);
  v.setUint16(14, (format.daily ?? []).length, true);
  const setters = { u8: 'setUint8', i8: 'setInt8', u16: 'setUint16', i16: 'setInt16' };
  const toRaw = (f, x) => (x === null || x === undefined ? f.nodata : Math.round((x - (f.offset ?? 0)) / (f.scale ?? 1)));
  let off = HEADER;
  for (const { f, daily } of fields) {
    const dt = DTYPES[f.dtype];
    const put = (o, x) => v[setters[f.dtype]](o, toRaw(f, x), true);
    if (!daily) {
      // Static: values(name, null, null, i), or values(name, k, null, i) per component.
      const multi = Boolean(f.components) || sCount(f) > 1;
      for (let k = 0; k < sCount(f); k++)
        for (let i = 0; i < N; i++) put(off + (k * N + i) * dt.size, values(f.name, multi ? k : null, null, i));
      off += sCount(f) * N * dt.size;
    } else {
      const count = sCount(f);
      for (let k = 0; k < count; k++)
        for (let d = 0; d < ndays; d++)
          for (let i = 0; i < N; i++) put(off + ((k * ndays + d) * N + i) * dt.size, values(f.name, k, d, i));
      off += count * ndays * N * dt.size;
    }
  }
  return buf;
}

const cache = new Map();

/** Fetches and decodes a block; resolves to null when the block does not exist (no land). */
export function loadBlock(base, manifest, br, bc) {
  const url = base + 'data/' + manifest.blocks.url.replace('{br}', br).replace('{bc}', bc);
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then(async (res) => {
          if (res.status === 404) return null;
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          // Dev servers answer missing files with the HTML app shell.
          if ((res.headers.get('content-type') ?? '').includes('text/html')) return null;
          return decodeBlock(await gunzipIfNeeded(await res.arrayBuffer()), manifest.blocks.format);
        })
        .catch((err) => {
          cache.delete(url);
          throw err;
        }),
    );
  }
  return cache.get(url);
}
