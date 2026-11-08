# Půdoměr

**Soil temperature and moisture for any point in Czechia, now and for the next 5 days.**

👉 **https://pudomer.cz**

> Out of test since 2026-10-20 (the "test version" tag is gone). This is still a model estimate, not an official forecast or warning.

## What it shows

- Click anywhere in Czechia to get a 250 × 250 m square with its own soil, terrain, land cover and weather.
- Soil temperature at 2, 5, 10, 20, 30, 50, 75 and 100 cm, with the morning minimum and daily maximum near the surface.
- Soil moisture as % of plant-available water (% VVK) for 0–10, 0–40 and 0–100 cm, and in mm.
- "Vs normal" map layers: moisture 0–40 cm as a percentile of 1991–2020 (same time of year, ±15 days), the soil-temperature departure at 5 cm and, April–October, drought classes S0–S4 from moisture 0–100 cm. The normal is the ERA5-Land reanalysis mapped to the model.
- Erosion on arable land: the long-term water-erosion hazard from the official VÚMOP erosion layers and a daily erosion risk from the rainfall forecast and soil moisture (map layer and location panel).
- A deeper section at 150 and 200 cm, marked lower confidence. Moisture there is shown only as drier or wetter than usual.
- A soil profile to 200 cm, with soil type and geology from the ČGS maps and the layered soil the model uses.
- "Máte jinou půdu?": switch to another soil or land cover found within ~10 km and see the forecast for it.
- Decision cards: sowing, frost and winter, trafficability, conditions for nitrogen fertilising (advisory only) and irrigation.
- An accuracy page comparing the model with ČHMÚ soil-temperature stations.
- Updated 4× a day.

## Data sources

- ČHMÚ open data: stations, ALADIN forecast and radar (CC BY 4.0)
- MeteoVerdict forecast (CC BY-SA 4.0), built on Open-Meteo.com and national weather services
- Copernicus: Sentinel-1 surface soil moisture (CLMS), Copernicus DEM, ESA WorldCover
- Copernicus Climate Change Service: ERA5-Land reanalysis (CC BY 4.0, doi:10.24381/cds.e2161bac), modified (quantile-mapped to the model)
- VÚMOP, v. v. i. (a MZe): erosion layers R, K, LS, C, soil loss and permissible loss, DZES 5 (2025, CC BY-SA 4.0), modified
- MZe LPIS: erosion-threatened farmland (DZES 5)
- ISRIC SoilGrids (CC BY 4.0)
- ČGS soil map 1 : 50 000 and 1 : 1 000 000, geological map 1 : 50 000 (© Česká geologická služba, CC BY-SA 4.0)
- SPÚ, 2026 – bonitované půdně ekologické jednotky (BPEJ), open data (CC BY 4.0)
- ZVHS/MZe – data meliorací (2016), drained land
- ČÚZK boundaries (CC BY 4.0)
- Neither the European Commission nor ECMWF is responsible for any use that may be made of the Copernicus information or data it contains.
- Base map © OpenFreeMap, OpenMapTiles and OpenStreetMap contributors

## Languages

The site is available in Czech and English. A Czech system language selects Czech, anything else English; the CS | EN switch in the header overrides this and is remembered in the browser (`?lang=cs|en` in a link also works).

- Strings live in `web/src/lang/cs.js` and `web/src/lang/en.js` (same keys in both; `npm test` checks this). Use `t('key', {param})` and `tp('key', n)` from `web/src/i18n.js`.
- The long text page (`jak-to-funguje.html`) has one block per language (`data-l="cs"` / `data-l="en"`).
- Proper names and rock names from the data stay as published; generic labels are translated in `web/src/lang/data-en.js`.

## Licence

- The published data (`data/` on the site) are CC BY-SA 4.0.
- The website code in this repository is MIT licensed.
- The model and data processing are not part of this repository.

## Repository

- `web/`: the website (Vite and MapLibre).
- `.github/workflows/`: deployment to GitHub Pages and a freshness watchdog.
