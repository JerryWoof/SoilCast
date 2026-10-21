// The v1 / v1.1 block formats as first published (manifest blocks.format). Used only by
// the synthetic data generator and the tests; the app reads the format from
// the manifest.

const T_COMPONENTS = ['t2_min', 't2_max', 't5_min', 't5_max', 't10_min', 't10_max', 't20', 't30', 't50', 't75', 't100', 't150', 't200', 't5_09'];
const THETA_DEPTHS = ['2', '5', '10', '20', '30', '50', '75', '100'];
const LAYERS = ['0-10', '0-40', '0-100'];

export const FORMAT_V1 = {
  static: [
    { name: 'land', dtype: 'u8', scale: 1, offset: 0 },
    { name: 'cover', dtype: 'u8', scale: 1, offset: 0, nodata: 255 },
    { name: 'elev', dtype: 'u16', scale: 1, offset: 0, nodata: 65535 },
    { name: 'texture', dtype: 'u8', scale: 1, offset: 0, nodata: 0 },
    { name: 'fc10', dtype: 'u8', scale: 0.5, offset: 0, nodata: 255 },
    { name: 'awc10', dtype: 'u8', scale: 0.5, offset: 0, nodata: 255 },
    { name: 'fc40', dtype: 'u8', scale: 1, offset: 0, nodata: 255 },
    { name: 'fc100', dtype: 'u16', scale: 1, offset: 0, nodata: 65535 },
    { name: 'awc40', dtype: 'u8', scale: 1, offset: 0, nodata: 255 },
    { name: 'awc100', dtype: 'u16', scale: 1, offset: 0, nodata: 65535 },
    { name: 'confidence', dtype: 'u8', scale: 1, offset: 0, nodata: 255 },
    { name: 'bottom', dtype: 'u8', scale: 1, offset: 0, nodata: 255 },
  ],
  daily: [
    { name: 't', dtype: 'u8', scale: 0.25, offset: -20, nodata: 255, count: 14, components: T_COMPONENTS },
    { name: 'theta', dtype: 'u8', scale: 0.004, offset: 0, nodata: 255, count: 8, components: THETA_DEPTHS },
    { name: 'vvk', dtype: 'u8', scale: 1, offset: 0, nodata: 255, count: 3, components: LAYERS },
    { name: 'vvk_lo', dtype: 'u8', scale: 1, offset: 0, nodata: 255, count: 3, components: LAYERS },
    { name: 'vvk_hi', dtype: 'u8', scale: 1, offset: 0, nodata: 255, count: 3, components: LAYERS },
    { name: 'avail_mm', dtype: 'u8', scale: 1, offset: 0, nodata: 255, count: 2, components: ['0-40', '0-100'] },
    { name: 'deep_anom', dtype: 'i8', scale: 1, offset: 0, nodata: -128, count: 2, components: ['150', '200'] },
    { name: 'snow', dtype: 'u8', scale: 1, offset: 0, nodata: 255, count: 1 },
    { name: 'frost_depth', dtype: 'u8', scale: 1, offset: 0, nodata: 255, count: 1 },
    { name: 'precip', dtype: 'u8', scale: 0.5, offset: 0, nodata: 255, count: 1, components: ['mm'] },
    { name: 'flags', dtype: 'u8', scale: 1, offset: 0, count: 1 },
  ],
};

// v1.1 additions: static fields with components.
export const SOIL_LAYERS = ['0-5', '5-15', '15-30', '30-60', '60-100', '100-200'];
export const FORMAT_V11 = {
  static: [
    ...FORMAT_V1.static,
    { name: 'soil_type', dtype: 'u16', scale: 1, offset: 0, nodata: 65535 },
    { name: 'soil_src', dtype: 'u8', scale: 1, offset: 0, labels: ['bez údaje', 'ČGS 1 : 50 000', 'ČGS 1 : 1 000 000', 'ČGS 1 : 50 000 (sken)'] },
    { name: 'clay', dtype: 'u8', scale: 1, offset: 0, nodata: 255, count: 6, components: SOIL_LAYERS },
    { name: 'sand', dtype: 'u8', scale: 1, offset: 0, nodata: 255, count: 6, components: SOIL_LAYERS },
    { name: 'cfvo', dtype: 'u8', scale: 1, offset: 0, nodata: 255, count: 6, components: SOIL_LAYERS },
    { name: 'bedrock', dtype: 'u8', scale: 2, offset: 0, nodata: 255 },
    { name: 'gw', dtype: 'u8', scale: 2, offset: 0, nodata: 255 },
    { name: 'perched', dtype: 'u8', scale: 1, offset: 0 },
    { name: 'quaternary', dtype: 'u8', scale: 1, offset: 0, nodata: 255 },
    { name: 'geology', dtype: 'u16', scale: 1, offset: 0, nodata: 65535 },
    { name: 'water', dtype: 'u8', scale: 1, offset: 0 },
  ],
  daily: FORMAT_V1.daily,
};
