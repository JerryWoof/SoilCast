// English wording for generic labels that come from the data pipeline in Czech (manifest.json).
// Proper names (station names, okres names, specific Czech soil subtypes, rock names) are kept as they are.
// Anything missing here falls back to the Czech text.

export const QUATERNARY_EN = {
  'bez kvartérního pokryvu (skalní podklad)': 'no Quaternary cover (bedrock)',
  'fluviální a glacifluviální písky a štěrky': 'fluvial and glaciofluvial sands and gravels',
  'nivní a fluviální sedimenty': 'floodplain and fluvial sediments',
  'spraše a sprašové hlíny': 'loess and loess loams',
  'váté písky': 'aeolian (wind-blown) sands',
  'svahové sedimenty (deluvia, sutě)': 'slope sediments (colluvium, scree)',
  'organické sedimenty (rašeliny, slatiny)': 'organic sediments (peat, fen peat)',
  'antropogenní uloženiny (navážky, výsypky)': 'anthropogenic deposits (fill, spoil heaps)',
  'glacigenní sedimenty': 'glacigenic sediments',
  'jezerní jíly': 'lake clays',
  'jezerní a proluviální jíly a písky': 'lake and proluvial clays and sands',
  'sladkovodní vápence (travertin)': 'freshwater limestones (travertine)',
};

// Czech soil groups (TKSP) with the nearest international name; used when the data has no WRB name.
export const SOIL_GROUP_EN = {
  antropozem: 'Anthrosol',
  fluvizem: 'Fluvisol',
  glej: 'Gleysol',
  hnědozem: 'Luvisol (brown earth)',
  kambizem: 'Cambisol',
  koluvizem: 'Colluvial soil',
  kryptopodzol: 'Cryptopodzol',
  litozem: 'Lithosol (Leptosol)',
  luvizem: 'Luvisol',
  organozem: 'Histosol',
  pararendzina: 'Pararendzina',
  pelozem: 'Pelosol',
  podzol: 'Podzol',
  pseudoglej: 'Pseudogley (Stagnosol)',
  ranker: 'Ranker',
  regozem: 'Regosol',
  rendzina: 'Rendzina',
  smonice: 'Smonitza (Vertisol)',
  stagnoglej: 'Stagnogley',
  vodní: 'water',
  černice: 'Černice (Gleyic Chernozem)',
  černozem: 'Chernozem',
  šedozem: 'Greyzem',
};

// Geological periods, longest first so that compound names are replaced whole.
const ERA_EN = [
  ['spodní paleozoikum', 'Lower Palaeozoic'],
  ['neoproterozoikum', 'Neoproterozoic'],
  ['paleogén', 'Paleogene'],
  ['neogén', 'Neogene'],
  ['kambrium', 'Cambrian'],
  ['ordovik', 'Ordovician'],
  ['silur', 'Silurian'],
  ['devon', 'Devonian'],
  ['karbon', 'Carboniferous'],
  ['perm', 'Permian'],
  ['trias', 'Triassic'],
  ['jura', 'Jurassic'],
  ['křída', 'Cretaceous'],
  ['terciér', 'Tertiary'],
  ['kvartér', 'Quaternary'],
];

export function eraEn(s) {
  let out = String(s);
  for (const [cs, en] of ERA_EN) out = out.split(cs).join(en);
  return out;
}

// Names of the baseline estimate as published in skill.json.
export const BASELINE_EN = {
  'Jednoduchý odhad z teploty vzduchu': 'simple estimate from air temperature',
};
