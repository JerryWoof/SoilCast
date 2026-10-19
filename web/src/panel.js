// The point panel: profile, 7-day charts and decision cards for one grid cell.

import { bandChart, barChart, soilPitChart, seriesChart, attachTooltips } from './charts.js';
import { soilOf, mapSoil, simulatedLine, applyOption, optionLabel, describeTexture, shareText, COVER_OPTION, TEXTURE_COLORS } from './soil.js';
import {
  CROPS, RAIN_DEFAULT, COVER, CONFIDENCE, TEXTURE, STATUS, FLAG, has, fmtNum, vvkWord, anomWord,
  sowingDay, winter, trafficability, nConditions, irrigation, dayRain, rain48,
} from './cards.js';
import { loadSettings, saveSettings } from './settings.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const deg = (v) => (v === null || v === undefined ? '—' : `${fmtNum(v)} °C`);
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)} %`);
const NVZ_URL = 'https://www.zakonyprolidi.cz/cs/2012-262';
const ICON = { ok: '✓', border: '!', bad: '✕' };
const openDetails = new Set();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function pill(status, text) {
  return `<span class="pill ${status}"><i aria-hidden="true">${ICON[status]}</i>${esc(text)}</span>`;
}

function coords(lat, lng) {
  return `${fmtNum(lat, 4)}° s. š. · ${fmtNum(lng, 4)}° v. d.`;
}

function header(state, extra = '') {
  const { lat, lng } = state.point;
  return `<div class="phead">
      <div><h2>Půda v tomto místě</h2><p class="coords">${coords(lat, lng)}${extra}</p></div>
      <button class="close" type="button" data-act="close" aria-label="Zavřít panel">×</button>
    </div>`;
}

function message(state, title, text) {
  return `${header(state)}<div class="pmsg"><h3>${esc(title)}</h3><p>${text}</p></div>`;
}

export function renderPanel(el, state) {
  const scroll = el.scrollTop;
  el.innerHTML = panelHtml(state);
  el.scrollTop = scroll;
  el.querySelectorAll('details[data-id]').forEach((d) => {
    if (openDetails.has(d.dataset.id)) d.open = true;
  });
}

function panelHtml(state) {
  const P = state.point;
  if (!P.inside) return message(state, 'Mimo Česko', 'SoilCast počítá jen pro území Česka.');
  if (!state.status.hasData)
    return message(state, 'Zatím bez dat', 'Předpověď ještě nevychází. Jako první spustíme teplotu půdy u stanic ČHMÚ, potom celou mapu a vlhkost.');
  if (P.loading) return `${header(state)}<div class="pmsg loading"><span class="spinner" aria-hidden="true"></span>Načítám data pro toto místo…</div>`;
  if (P.error) return message(state, 'Data se nepodařilo načíst', `Zkuste to prosím znovu za chvíli. <span class="muted">(${esc(P.error)})</span>`);
  if (P.noData) {
    const synth = state.status.synthetic ? ' Ukázková data pokrývají jen okolí Prahy a Brna.' : '';
    return message(state, 'Pro toto místo nejsou data', `Vodní plocha nebo místo mimo modelovanou půdu.${synth}`);
  }

  const opt = selectedOption(P);
  const p = applyOption(P.cell, opt, state.manifest?.blocks?.format?.daily);
  const s = p.static;
  const d = state.day;
  const lab = state.labels[d];
  const settings = loadSettings();
  const elev = s.elev !== null ? ` · ${Math.round(s.elev)} m n. m.` : '';
  const tex = TEXTURE[s.texture];

  const chips = [
    `<span class="chip" title="Krajinný pokryv, pro který je půda modelovaná">Modelováno pro: <b>${COVER[s.cover] ?? '—'}</b> (${opt ? 'vaše volba' : 'odhad'})</span>`,
    tex ? `<span class="chip" title="Zrnitost svrchní vrstvy 0–30 cm (třída USDA)">Půda: <b>${tex[0]}</b> · ${tex[1]}</span>` : '',
    s.awc100 !== null ? `<span class="chip" title="Využitelná vodní kapacita (voda dostupná rostlinám při plném nasycení na polní kapacitu)">VVK: <b>${Math.round(s.awc40)} mm</b> v 0–40 cm · ${Math.round(s.awc100)} mm v 0–100 cm</span>` : '',
    s.confidence !== null ? `<span class="badge conf${s.confidence}" title="Spolehlivost pro toto místo: podle přesnosti u stanic, zdroje půdních dat a jistoty krajinného pokryvu. Dál do budoucnosti je předpověď méně jistá.">Spolehlivost: <b>${CONFIDENCE[s.confidence]}</b></span>` : '',
  ].join('');

  const dayNav = `<div class="daynav">
      <button type="button" data-day="${d - 1}" ${d === 0 ? 'disabled' : ''} aria-label="Předchozí den">‹</button>
      <div><strong>${lab.rel ? `${lab.rel} · ${esc(lab.long)}` : esc(cap(lab.long))}</strong>${d > 0 ? `<span class="muted"> · předpověď na ${d}. den</span>` : ''}</div>
      <button type="button" data-day="${d + 1}" ${d >= state.labels.length - 1 ? 'disabled' : ''} aria-label="Další den">›</button>
    </div>`;

  return `${header(state, elev)}
    ${optBanner(P, opt, state)}
    <div class="chips">${chips}</div>
    ${dayNav}
    ${heroTiles(p, d)}
    ${profileSection(p, d, settings, state, opt)}
    ${weekSection(p, state, settings)}
    <h3 class="sec">Rozhodování</h3>
    ${sowingCard(p, state, settings)}
    ${winterCard(p, state)}
    ${trafficCard(p, state, settings)}
    ${nCard(p, state, settings)}
    ${irrigationCard(p, state, settings)}
    ${stationSection(state)}
    <footer class="pfoot">
      <p><span class="beta">beta</span> Vlhkost je zatím beta – ověřujeme ji měřením. Pro srovnání: <a href="https://www.intersucho.cz/cz/" target="_blank" rel="noopener">Intersucho</a>, <a href="https://agropocasi.cz/" target="_blank" rel="noopener">Agropočasí</a>.</p>
      <p>Půdní mapa: © <a href="https://www.geology.cz/" target="_blank" rel="noopener">Česká geologická služba</a> (půdní mapa ČR 1 : 50 000 a 1 : 1 000 000).</p>
      <p>Modelový odhad, ne měření. Nejde o oficiální předpověď ani výstrahu.</p>
    </footer>`;
}

// ---------- hero ----------
function heroTiles(p, d) {
  const t = p.daily.t;
  const v40 = p.daily.vvk?.['0-40']?.[d];
  const lo = p.daily.vvk_lo?.['0-40']?.[d];
  const hi = p.daily.vvk_hi?.['0-40']?.[d];
  const f = p.daily.flags?.value?.[d];
  const frozen = has(f, FLAG.FROZEN);
  const rain = dayRain(p, d);
  const r48 = rain48(p, d);
  const rainTile = rain === null || rain === undefined ? '' : `<div class="tile rain">
      <span class="tl">Srážky za den</span>
      <span class="tv">${fmtNum(rain, 1)}<small> mm</small></span>
      <span class="ts">${r48 !== null ? `dnes a zítra ${fmtNum(r48, 1)} mm` : ''}</span>
    </div>`;
  return `<div class="tiles">
    <div class="tile temp">
      <span class="tl">Teplota v 5 cm</span>
      <span class="tv">${fmtNum(t.t5_min[d])}<small> až </small>${fmtNum(t.t5_max[d])}<small> °C</small></span>
      <span class="ts">ráno minimum · přes den maximum${frozen ? ' · <b>povrch zamrzlý</b>' : ''}</span>
    </div>
    <div class="tile moist">
      <span class="tl">Vlhkost 0–40 cm <span class="beta">beta</span></span>
      <span class="tv">${v40 === null || v40 === undefined ? '—' : Math.round(v40)}<small> % VVK</small></span>
      <span class="ts">${vvkWord(v40)}${lo !== null && lo !== undefined ? ` · rozpětí ${Math.round(lo)}–${Math.round(hi)} %` : ''}</span>
    </div>
    ${rainTile}
  </div>`;
}

// ---------- profile ----------
const DEPTH_ROWS = [
  { z: 2, min: 't2_min', max: 't2_max', theta: '2', note: 'povrchová vrstva' },
  { z: 5, min: 't5_min', max: 't5_max', theta: '5' },
  { z: 10, min: 't10_min', max: 't10_max', theta: '10' },
  { z: 20, mean: 't20', theta: '20' },
  { z: 30, mean: 't30', theta: '30', interp: true },
  { z: 50, mean: 't50', theta: '50' },
  { z: 75, mean: 't75', theta: '75', interp: true },
  { z: 100, mean: 't100', theta: '100' },
];

function profileSection(p, d, settings, state, opt) {
  const t = p.daily.t;
  const th = p.daily.theta ?? {};
  const rows = DEPTH_ROWS.map((r) => {
    const min = r.min ? t[r.min]?.[d] ?? null : null;
    const max = r.max ? t[r.max]?.[d] ?? null : null;
    const mean = r.mean ? t[r.mean]?.[d] ?? null : min !== null && max !== null ? (min + max) / 2 : null;
    return { z: r.z, interp: r.interp, min, max, mean, th: th[r.theta]?.[d] ?? null };
  });
  const deep = [150, 200].map((z) => ({ z, mean: t[`t${z}`]?.[d] ?? null, anom: p.daily.deep_anom?.[String(z)]?.[d] ?? null }));
  const vv = (L) => p.daily.vvk?.[L]?.[d] ?? null;
  const vvk = [{ z: 10, label: '0–10 cm', v: vv('0-10') }, { z: 30, label: '0–40 cm', v: vv('0-40') }, { z: 75, label: '0–100 cm', v: vv('0-100') }];
  const soil = soilOf(p.static);
  const pit = soilPitChart({ soil, depths: [...rows, ...deep], vvk, title: `Půdní profil 0–200 cm: ${describeTexture(soil)}` });
  const layers = ['0-10', '0-40', '0-100']
    .map((L) => {
      const v = p.daily.vvk?.[L]?.[d] ?? null;
      const lo = p.daily.vvk_lo?.[L]?.[d] ?? null;
      const hi = p.daily.vvk_hi?.[L]?.[d] ?? null;
      const mm = p.daily.avail_mm?.[L]?.[d] ?? null;
      const scale = (x) => Math.max(0, Math.min(100, (x / 130) * 100));
      const name = { '0-10': 'seťové lůžko', '0-40': 'kořenová zóna', '0-100': 'celý metr' }[L];
      return `<div class="vbar" title="${L} cm: ${pct(v)} VVK (rozpětí ${pct(lo)}–${pct(hi)})${mm !== null ? `, ${Math.round(mm)} mm k dispozici` : ''}">
        <div class="vlab"><b>${L.replace('-', '–')} cm</b> <span class="muted">${name}</span></div>
        <div class="vtrack">
          <span class="vfill${v > 100 ? ' over' : ''}" style="width:${scale(v ?? 0)}%"></span>
          ${lo !== null && hi !== null ? `<span class="vrange" style="left:${scale(lo)}%;width:${scale(hi) - scale(lo)}%"></span>` : ''}
          <span class="vfc" style="left:${scale(100)}%" title="polní kapacita"></span>
        </div>
        <div class="vval"><b>${v === null ? '—' : v > 100 ? 'nad PK' : `${Math.round(v)} %`}</b><span class="muted">${v > 100 ? `${Math.round(v)} %` : vvkWord(v)}${mm !== null ? ` · ${Math.round(mm)} mm` : ''}</span></div>
      </div>`;
    })
    .join('');
  const legend = `<div class="pitlegend">
      <span class="lg-scale" title="Barva vrstvy podle zrnitosti"><span>písek</span><i>${TEXTURE_COLORS.map((c) => `<b style="background:${c}"></b>`).join('')}</i><span>jíl</span></span>
      <span><i class="lg lg-stone"></i>kameny</span>
      ${soil.bedrock !== null ? '<span><i class="lg lg-rock"></i>skála</span>' : ''}
      ${soil.gw !== null ? '<span><i class="lg lg-gw"></i>podzemní voda</span>' : ''}
      ${soil.perched ? '<span><i class="lg lg-perch"></i>oglejení – voda se drží</span>' : ''}
    </div>`;
  return `<section class="psec">
    <h3>Profil půdy</h3>
    ${soilLines(state, p, opt)}
    ${picker(state, opt)}
    <div class="pitwrap">${pit}</div>
    ${legend}
    <p class="fine">Vrstvy mají stejnou výšku, hloubky jsou popsané vlevo. Teplota: na 2, 5 a 10 cm ranní minimum / denní maximum, hlouběji denní průměr. * hloubka, kterou stanice ČHMÚ neměří. Pod 1 m nejsou otevřená měření, proto je tam spolehlivost nižší a vlhkost je jen srovnání s obvyklým stavem (od roku 2018).</p>
    <h4>Vlhkost vrstev <span class="muted">% využitelné vodní kapacity (VVK)</span></h4>
    <div class="vbars">${layers}</div>
    <p class="fine">Tmavý pruh = odhad, světlé pozadí = rozpětí podle nejistoty půdních vlastností, svislá čárka = polní kapacita (PK). Nad PK je půda přemokřená.</p>
  </section>`;
}

// ---------- soil map vs. simulated soil, options ----------
function selectedOption(P) {
  return P.optId ? P.options?.list?.find((o) => o.id === P.optId) ?? null : null;
}

function soilLines(state, p, opt) {
  const base = state.point.cell.static;
  if (!('soil_src' in base) && !('clay' in base)) return '';
  const m = mapSoil(base, state.manifest);
  const map = m.known
    ? `<b>Podle půdní mapy:</b> ${esc(m.name)}${m.wrb ? ` (${esc(m.wrb)})` : ''} – zdroj: ${esc(m.src)}`
    : '<b>Půdní mapa zde nemá údaj</b>';
  const g = Number.isFinite(base.geology) ? state.manifest?.geology?.[base.geology] : null;
  const geo = g ? `<p class="sline geo"><b>Geologie (ČGS 1 : 50 000):</b> ${esc(g.name)}${g.era ? ` <span class="muted">· ${esc(g.era)}</span>` : ''}</p>` : '';
  return `<div class="soillines"><p class="sline map">${map}</p>${geo}<p class="sline sim"><b>Simulujeme:</b> ${esc(simulatedLine(p.static, state.manifest))}${opt ? ' <span class="muted">(vaše volba)</span>' : ''}</p></div>`;
}

let pickerPref = null;
export function resetPanelState() {
  pickerPref = null;
}

function optBanner(P, opt, state) {
  if (!opt) return '';
  return `<div class="optbanner" role="status"><span>Zobrazujete: <b>${esc(optionLabel(opt, state.manifest))}</b> (místo výchozího odhadu pro toto místo)</span><button type="button" class="btn" data-act="opt-reset">Vrátit výchozí odhad</button></div>`;
}

function picker(state, opt) {
  const P = state.point;
  const base = P.cell.static;
  const noMap = 'soil_src' in base && !base.soil_src;
  const o = P.options;
  const open = pickerPref ?? (noMap && !opt);
  let body;
  if (!o || o.status === 'loading') body = '<p class="fine"><span class="spinner" aria-hidden="true"></span> Načítám možnosti…</p>';
  else if (o.status === 'none' || !o.list?.length) body = '<p class="fine">Pro toto místo zatím nenabízíme jiné půdy ani porosty.</p>';
  else {
    const soils = o.list.filter((x) => x.kind === 'soil');
    const covers = o.list.filter((x) => x.kind === 'cover');
    const mapName = mapSoil(base, state.manifest);
    const item = (id, name, desc, share, on) =>
      `<button type="button" class="opt" data-opt="${esc(id)}" aria-pressed="${on}"><span class="on" aria-hidden="true">${on ? '●' : '○'}</span><span class="otxt"><b>${esc(name)}</b>${desc ? `<span class="muted">${esc(desc)}</span>` : ''}${share ? `<span class="share">${esc(share)}</span>` : ''}</span></button>`;
    body = `<div class="optlist">${item('', 'Výchozí odhad', mapName.known ? `podle půdní mapy: ${mapName.name}` : 'nejpravděpodobnější půda pro toto místo', '', !opt)}
      ${soils.map((x) => item(x.id, optionLabel(x, state.manifest), describeTexture(soilOf(x)), shareText(x), opt?.id === x.id)).join('')}</div>
      ${covers.length ? `<h4>Jiný porost</h4><div class="covers">${covers.map((x) => `<button type="button" class="cov" data-opt="${esc(x.id)}" aria-pressed="${opt?.id === x.id}">${esc(COVER_OPTION[x.cover] ?? 'jiný')}</button>`).join('')}</div>` : ''}`;
  }
  const note = noMap ? '<p class="picknote">Půdní mapa zde nemá údaj. Vyberte prosím půdu, která odpovídá vašemu pozemku.</p>' : '';
  return `<details class="picker${noMap ? ' nomap' : ''}" data-id="picker" ${open ? 'open' : ''}>
    <summary>Máte jinou půdu?</summary>
    ${note}
    <p class="fine">Vyberte půdu nebo porost z okolí (do 10 km). Celý panel se přepočítá pro vaši volbu.</p>
    ${body}
  </details>`;
}

// ---------- week ----------
function weekSection(p, state, settings) {
  const labels = state.labels.map((l) => l.rel ?? l.weekday);
  const t = p.daily.t;
  const mid = t.t5_min.map((v, k) => (v === null || t.t5_max[k] === null ? null : (v + t.t5_max[k]) / 2));
  const tChart = bandChart({
    labels,
    lo: t.t5_min,
    hi: t.t5_max,
    mid,
    unit: '°C',
    color: 'var(--temp)',
    selected: state.day,
    refs: [{ v: 0, label: '0 °C', cls: 'zero' }],
    tip: (k) => `${state.labels[k].long}: ${deg(t.t5_min[k])} až ${deg(t.t5_max[k])}`,
    title: 'Teplota půdy v 5 cm na 6 dní, minimum až maximum',
  });
  const v = p.daily.vvk?.['0-40'] ?? [];
  const lo = p.daily.vvk_lo?.['0-40'] ?? v;
  const hi = p.daily.vvk_hi?.['0-40'] ?? v;
  const trig = settings.irrigation.trigger;
  const vChart = bandChart({
    labels,
    lo,
    hi,
    mid: v,
    unit: '% VVK',
    color: 'var(--moist)',
    selected: state.day,
    refs: [{ v: 100, label: 'PK', cls: 'fc' }, { v: trig, label: `závlaha ${trig} %`, cls: 'trig' }],
    domain: [Math.max(0, Math.min(...lo.filter((x) => x !== null), trig) - 10), Math.max(...hi.filter((x) => x !== null), 100) + 8],
    tip: (k) => `${state.labels[k].long}: ${pct(v[k])} VVK (rozpětí ${pct(lo[k])}–${pct(hi[k])})`,
    title: 'Vlhkost 0–40 cm na 6 dní v % VVK s rozpětím',
  });
  const pr = p.daily.precip?.mm ?? p.daily.precip?.value;
  const rainChart = pr
    ? barChart({
        labels,
        values: pr,
        unit: 'mm',
        color: 'var(--moist)',
        selected: state.day,
        tip: (k) => `${state.labels[k].long}: ${pr[k] === null ? '—' : `${fmtNum(pr[k], 1)} mm`}`,
        title: 'Denní úhrn srážek na 6 dní v mm',
      })
    : '';
  return `<section class="psec">
    <h3>Dnes a 5 dní dopředu</h3>
    <div class="mini"><div class="minihead"><span class="key temp"></span>Teplota v 5 cm <span class="muted">ráno minimum – den maximum</span></div>${tChart}</div>
    <div class="mini"><div class="minihead"><span class="key moist"></span>Vlhkost 0–40 cm <span class="beta">beta</span> <span class="muted">odhad a rozpětí</span></div>${vChart}</div>
    ${rainChart ? `<div class="mini"><div class="minihead"><span class="key rain"></span>Srážky <span class="muted">denní úhrn</span></div>${rainChart}</div>` : ''}
  </section>`;
}

// ---------- cards ----------
function strip(state, fn) {
  return `<div class="strip" role="group" aria-label="Výhled po dnech">${state.labels
    .map((l, k) => {
      const st = fn(k);
      return `<button type="button" class="sd ${st.status}${k === state.day ? ' on' : ''}" data-day="${k}" title="${esc(`${l.long}: ${st.text}`)}"><span>${esc(l.weekday)}</span><i aria-hidden="true">${ICON[st.status]}</i></button>`;
    })
    .join('')}</div>`;
}

function card({ id, title, status, statusText, body, why, settingsHtml, stripHtml }) {
  return `<article class="card ${status}" id="card-${id}">
    <header><h4>${title}</h4>${pill(status, statusText)}</header>
    ${body}
    ${stripHtml ?? ''}
    ${why ? `<p class="why"><b>Proč:</b> ${why}</p>` : ''}
    ${settingsHtml ? `<details data-id="${id}"><summary>Upravit prahy</summary>${settingsHtml}</details>` : ''}
  </article>`;
}

const SOW_TEXT = { ok: 'vhodné', border: 'hraniční', bad: 'nevhodné' };

function sowingCard(p, state, settings) {
  const crop = CROPS.find((c) => c.id === settings.crop) ?? CROPS[0];
  const th = { temp: crop.temp, days: crop.days, ...(settings.cropThresholds[crop.id] ?? {}) };
  const r = sowingDay(p, state.day, crop, th);
  const options = CROPS.map((c) => `<option value="${c.id}" ${c.id === crop.id ? 'selected' : ''}>${c.name}</option>`).join('');
  const details = [...r.reasons, ...r.notes];
  const body = `<div class="cardrow"><label class="sel">Plodina <select data-set="crop">${options}</select></label></div>
    <p class="verdict">${SOW_TEXT[r.status][0].toUpperCase() + SOW_TEXT[r.status].slice(1)} pro setí${details.length ? `: ${esc(details.join(', '))}` : ''}.</p>`;
  const srcs = crop.sources.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${n}</a>`).join(', ');
  const settingsHtml = `<div class="form">
      <label>Teplota v ${crop.depth} cm aspoň <span class="inp"><input type="number" step="0.5" min="-5" max="25" value="${th.temp}" data-set="crop-temp"/> °C</span></label>
      <label>po sobě dní <span class="inp"><input type="number" step="1" min="1" max="7" value="${th.days}" data-set="crop-days"/></span></label>
      <label>Srážky za 48 h od <span class="inp"><input type="number" step="1" min="1" max="60" value="${th.rain ?? RAIN_DEFAULT.border}" data-set="crop-rain"/> mm</span></label>
      <button type="button" class="linkbtn" data-act="crop-reset">Výchozí</button>
    </div>
    <p class="fine">Hraniční od zadaných mm (dnes + zítra), nevhodné od 2,5násobku. Výchozí prahy ověřujeme s odborníky (ČZU, VÚRV, ÚKZÚZ).</p>`;
  return card({
    id: 'sow',
    title: 'Setí',
    status: r.status,
    statusText: SOW_TEXT[r.status],
    body,
    stripHtml: strip(state, (k) => {
      const x = sowingDay(p, k, crop, th);
      return { status: x.status, text: SOW_TEXT[x.status] };
    }),
    why: `${esc(crop.why)}${crop.unresolved ? ' <span class="warnword">Práh nejistý.</span>' : ''} Zdroje: ${srcs}.`,
    settingsHtml,
  });
}

function winterCard(p, state) {
  const w = winter(p, state.day);
  const statusText = w.frostDepth >= 10 ? `promrzlá ${w.frostDepth} cm` : w.frozenMorning ? 'ráno zamrzlá' : 'nezamrzlá';
  const lines = [
    `Povrch (0–5 cm) ráno: <b>${w.frozenMorning ? 'zamrzlý' : 'nezamrzlý'}</b>${w.frozenMorning ? (w.thaws ? ', přes den rozmrzne' : ', přes den nerozmrzne') : ''}.`,
    `Hloubka promrznutí: <b>${w.frostDepth ? `${w.frostDepth} cm` : 'nepromrzlé'}</b>.`,
    `Střídání mrazu a tání u povrchu bez sněhu v příštích 7 dnech: <b>${w.cycles}×</b>${w.cycles >= 3 ? ' – riziko vytahování ozimů' : ''}.`,
    `Sníh v modelu: <b>${w.snow ? `${w.snow} cm` : 'bez sněhu'}</b>.`,
  ];
  return card({
    id: 'winter',
    title: 'Zima a promrzání',
    status: w.status,
    statusText,
    body: `<ul class="facts">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`,
    stripHtml: strip(state, (k) => {
      const x = winter(p, k);
      return { status: x.status, text: x.frostDepth ? `promrzlé ${x.frostDepth} cm` : x.frozenMorning ? 'ráno zamrzlé' : 'nezamrzlé' };
    }),
    why: 'Promrznutí = hloubka, kam podle modelu sahá 0 °C. Výpočtová hloubka promrzání pro stavby se řídí normami, ne touto mapou.',
  });
}

function trafficCard(p, state, settings) {
  const t = trafficability(p, state.day, settings.traffic);
  const until = t.ok ? 'Seťové lůžko (0–10 cm) je podle modelu dost suché a nezamrzlé.' : t.daysUntil ? `Sjízdné nejdřív za <b>${t.daysUntil} ${t.daysUntil === 1 ? 'den' : t.daysUntil < 5 ? 'dny' : 'dní'}</b> (${esc(state.labels[state.day + t.daysUntil].long)}).` : 'Do konce předpovědi se sjízdnost neobnoví.';
  return card({
    id: 'traffic',
    title: 'Sjízdnost',
    status: t.status,
    statusText: t.ok ? 'sjízdné' : 'nesjízdné',
    body: `<p class="verdict">${until}${!t.ok && t.reasons.length ? ` <span class="muted">Důvod: ${esc(t.reasons.join(', '))}.</span>` : ''}</p>
      <p class="fine">Vlhkost 0–10 cm: ${t.fcPct !== null ? `${pct(t.fcPct)} polní kapacity · ` : ''}${pct(t.vvk10)} VVK.</p>`,
    stripHtml: strip(state, (k) => {
      const x = trafficability(p, k, settings.traffic);
      return { status: x.status, text: x.ok ? 'sjízdné' : 'nesjízdné' };
    }),
    settingsHtml: `<div class="form">
        <label>Sjízdné do <span class="inp"><input type="number" min="50" max="130" step="1" value="${t.limit}" data-set="traffic-fc"/> % PK</span></label>
        <button type="button" class="linkbtn" data-act="traffic-reset">Výchozí</button>
      </div>
      <p class="fine">Podíl vody v 0–10 cm z polní kapacity (PK). Výchozí je 90 %; literatura uvádí 85 % (jíly) až 95 % (písky).</p>`,
    why: 'Sjízdné, když vlhkost 0–10 cm nepřesahuje práh (výchozí 90 % polní kapacity) a půda není zamrzlá. Rozsah prahů pochází z kalifornských půd (<a href="https://escholarship.org/uc/item/1590v33s" target="_blank" rel="noopener">Devine a kol. 2022</a>); na českých těžkých půdách je ověřujeme.',
  });
}

function nCard(p, state, settings) {
  const n = nConditions(p, state.day);
  const nvz = settings.nvz;
  const verdict =
    n.status === STATUS.BAD
      ? `Půda je podle modelu <b>${esc(n.reasons.join(', '))}</b>. Na takovou půdu se dusíkatá hnojiva ve zranitelných oblastech nepoužívají.`
      : 'Půda podle modelu není promrzlá, přesycená vodou ani pokrytá sněhem.';
  const scope =
    nvz === 'ne'
      ? 'Uvedli jste, že pozemek neleží ve zranitelné oblasti – pravidla NV 262/2012 Sb. se na něj nevztahují, stav půdy uvádíme pro informaci.'
      : 'Zákaz hnojení na půdě zaplavené, přesycené vodou, promrzlé nebo pokryté sněhem stanoví NV 262/2012 Sb. a platí jen ve <b>zranitelných oblastech</b> (seznam katastrů v příloze 1).';
  const options = [['nevim', 'nevím'], ['ano', 'ano'], ['ne', 'ne']].map(([v, l]) => `<option value="${v}" ${v === nvz ? 'selected' : ''}>${l}</option>`).join('');
  return card({
    id: 'n',
    title: 'Podmínky pro hnojení N',
    status: n.status,
    statusText: n.status === STATUS.BAD ? 'nevhodné' : 'bez překážek v půdě',
    body: `<p class="verdict">${verdict}</p>
      <div class="cardrow"><label class="sel">Pozemek ve zranitelné oblasti? <select data-set="nvz">${options}</select></label></div>
      <p class="fine">${scope} Kalendářní zákazy, svažitost ani zaplavení karta nehodnotí. <b>Orientační informace, ne oficiální výstraha ani právní rada.</b> Závazný je <a href="${NVZ_URL}" target="_blank" rel="noopener">text nařízení</a>.</p>`,
    stripHtml: strip(state, (k) => {
      const x = nConditions(p, k);
      return { status: x.status, text: x.reasons.length ? x.reasons.join(', ') : 'bez překážek v půdě' };
    }),
  });
}

function irrigationCard(p, state, settings) {
  const ir = irrigation(p, state.day, settings.irrigation);
  const statusText = { ok: 'není potřeba', border: 'brzy', bad: 'zalít' }[ir.status];
  const when =
    ir.vvk === null
      ? 'Vlhkost není k dispozici.'
      : ir.daysUntil === 0
        ? `Vlhkost ${ir.layer.replace('-', '–')} cm je <b>${pct(ir.vvk)} VVK</b>, pod prahem ${ir.trigger} %.`
        : ir.daysUntil
          ? `Práh ${ir.trigger} % VVK podle předpovědi klesne za <b>${ir.daysUntil} ${ir.daysUntil === 1 ? 'den' : ir.daysUntil < 5 ? 'dny' : 'dní'}</b>.`
          : `Vlhkost zůstane nad prahem ${ir.trigger} % VVK do konce předpovědi.`;
  const refill = ir.refill !== null && ir.status !== STATUS.OK ? ` Na doplnění na polní kapacitu chybí asi <b>${Math.round(ir.refill)} mm</b> (${Math.round(ir.refill)} l/m²).` : '';
  const layerOpts = [['0-40', '0–40 cm'], ['0-100', '0–100 cm']].map(([v, l]) => `<option value="${v}" ${v === ir.layer ? 'selected' : ''}>${l}</option>`).join('');
  return card({
    id: 'irr',
    title: 'Závlaha <span class="beta">beta</span>',
    status: ir.status,
    statusText,
    body: `<p class="verdict">${when}${refill}</p>`,
    stripHtml: strip(state, (k) => {
      const v = p.daily.vvk?.[ir.layer]?.[k];
      const st = v === null || v === undefined ? STATUS.BORDER : v < ir.trigger ? STATUS.BAD : STATUS.OK;
      return { status: st, text: `${pct(v)} VVK` };
    }),
    why: 'Výchozí práh 60 % VVK odpovídá zahradnické praxi. Model nezná vaši závlahu ani srážky, které už spadly mimo předpověď.',
    settingsHtml: `<div class="form">
        <label>Zalít pod <span class="inp"><input type="number" min="20" max="95" step="5" value="${ir.trigger}" data-set="irr-trigger"/> % VVK</span></label>
        <label>Vrstva <select data-set="irr-layer">${layerOpts}</select></label>
      </div>`,
  });
}

// ---------- station ----------
function haversine(a, b) {
  const R = 6371;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function stationSection(state) {
  const list = state.stations?.stations;
  if (!list?.length) return '';
  const here = { lat: state.point.lat, lon: state.point.lng };
  const st = list.map((s) => ({ s, km: haversine(here, s) })).sort((a, b) => a.km - b.km)[0];
  const { s, km } = st;
  const depth = s.depths.includes(5) ? 5 : s.depths[0];
  const time = s.series.time;
  const meas = s.series.measured[depth] ?? [];
  const model = s.series.model[depth] ?? [];
  const split = meas.findLastIndex((v) => v !== null) + 1;
  const sk = s.skill?.[depth];
  const chart = seriesChart({
    time,
    split,
    unit: '°C',
    title: `Teplota v ${depth} cm na stanici ${s.name}: model a měření`,
    series: [
      { name: 'měřeno', values: meas, cls: 'meas' },
      { name: 'model', values: model, cls: 'model' },
    ],
  });
  return `<section class="psec station">
    <h3>Nejbližší stanice: ${esc(s.name)} <span class="muted">${fmtNum(km, 0)} km</span></h3>
    <p class="fine">Teplota v ${depth} cm za posledních 30 dní a předpověď. Ukazuje, jak model sedí na skutečnost.</p>
    <div class="legend2"><span><i class="k meas"></i>měřeno ČHMÚ</span><span><i class="k model"></i>SoilCast</span></div>
    ${chart}
    ${sk ? `<p class="fine">Průměrná odchylka ${fmtNum(sk.mae)} °C, systematická ${fmtNum(sk.bias)} °C (${sk.n} dní). <a href="presnost.html#${encodeURIComponent(s.wsi)}">Přesnost podrobně</a></p>` : ''}
  </section>`;
}

// ---------- events ----------
export function panelEvents(el, { close, setDay, redraw, setOption }) {
  attachTooltips(el);
  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') return close();
    if (act === 'opt-reset') return setOption(null);
    const pick = e.target.closest('[data-opt]');
    if (pick) return setOption(pick.dataset.opt || null);
    if (act === 'theta') {
      saveSettings({ showTheta: !loadSettings().showTheta });
      return redraw();
    }
    if (act === 'traffic-reset') {
      saveSettings({ traffic: { fc: 90 } });
      return redraw();
    }
    if (act === 'crop-reset') {
      const s = loadSettings();
      const t = { ...s.cropThresholds };
      delete t[s.crop];
      saveSettings({ cropThresholds: t });
      return redraw();
    }
    const day = e.target.closest('[data-day]');
    if (day && !day.disabled) setDay(Number(day.dataset.day));
  });
  el.addEventListener('toggle', (e) => {
    const id = e.target.dataset?.id;
    if (!id) return;
    if (id === 'picker') pickerPref = e.target.open;
    if (e.target.open) openDetails.add(id);
    else openDetails.delete(id);
  }, true);
  el.addEventListener('change', (e) => {
    const key = e.target.dataset.set;
    if (!key) return;
    const s = loadSettings();
    const v = e.target.value;
    const num = Number(v);
    if (key === 'crop') saveSettings({ crop: v });
    if (key === 'nvz') saveSettings({ nvz: v });
    if (key === 'traffic-fc' && Number.isFinite(num) && v !== '') saveSettings({ traffic: { fc: Math.max(50, Math.min(130, Math.round(num))) } });
    if ((key === 'crop-temp' || key === 'crop-days' || key === 'crop-rain') && Number.isFinite(num) && v !== '') {
      const cur = { ...(s.cropThresholds[s.crop] ?? {}) };
      if (key === 'crop-temp') cur.temp = Math.max(-5, Math.min(25, num));
      else if (key === 'crop-rain') cur.rain = Math.max(1, Math.min(60, num));
      else cur.days = Math.max(1, Math.min(7, Math.round(num)));
      saveSettings({ cropThresholds: { ...s.cropThresholds, [s.crop]: cur } });
    }
    if (key === 'irr-trigger' && Number.isFinite(num) && v !== '') saveSettings({ irrigation: { ...s.irrigation, trigger: Math.max(10, Math.min(100, Math.round(num))) } });
    if (key === 'irr-layer') saveSettings({ irrigation: { ...s.irrigation, layer: v } });
    redraw();
  });
}
