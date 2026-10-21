// Tiny i18n layer: Czech (default for Czech systems) and English (everyone else).
// The language is fixed per page load; the switch stores the choice and reloads.
//
// Add strings to BOTH tables in lang/cs.js and lang/en.js (a test checks that the keys match).
// Plurals: tp('key', n) looks up 'key.one' / 'key.few' / 'key.many' / 'key.other' (CLDR categories).

import { cs } from './lang/cs.js';
import { en } from './lang/en.js';

export const LANGS = ['cs', 'en'];
export const STORAGE_KEY = 'soilcast.lang';
const TABLES = { cs, en };
const LOCALES = { cs: 'cs-CZ', en: 'en-GB' };

const norm = (v) => {
  const l = String(v ?? '').toLowerCase().split(/[-_]/)[0];
  return LANGS.includes(l) ? l : null;
};

/**
 * Choice order: ?lang= in the URL, then the saved choice, then the browser language:
 * Czech first language → Czech, anything else → English.
 * (The tiny inline script in each HTML page repeats this rule to set <html lang> before the first paint.)
 */
export function pickLang({ search = '', stored = null, languages = [] } = {}) {
  let q = null;
  try {
    q = new URLSearchParams(search).get('lang');
  } catch {
    q = null;
  }
  const forced = norm(q) ?? norm(stored);
  if (forced) return forced;
  const first = String(languages?.[0] ?? '').toLowerCase();
  return first.startsWith('cs') ? 'cs' : 'en';
}

function readStored() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function detect() {
  // No window (node tests): Czech, the language the strings were written in.
  if (typeof window === 'undefined') return 'cs';
  const nav = globalThis.navigator;
  const languages = nav?.languages?.length ? nav.languages : [nav?.language];
  return pickLang({ search: window.location?.search ?? '', stored: readStored(), languages });
}

let current = detect();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export const getLang = () => current;
export const locale = () => LOCALES[current];
/** For tests: switch the language without touching the page. */
export function setLangForTest(l) {
  current = LANGS.includes(l) ? l : 'cs';
}

/** Save the choice and reload (keeps the #hash with place, layer and day). */
export function chooseLang(l) {
  if (!LANGS.includes(l) || l === current) return;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, l);
  } catch {
    /* storage unavailable: the ?lang= parameter below still carries the choice for this visit */
  }
  const url = new URL(location.href);
  url.searchParams.set('lang', l);
  location.replace(url.toString());
}

const fill = (s, params) => (params ? s.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : String(params[k]))) : s);

export const has = (key) => key in TABLES[current];

/** Translate `key`; `{name}` placeholders come from `params`. Falls back to Czech, then to the key. */
export function t(key, params) {
  const s = TABLES[current][key] ?? TABLES.cs[key] ?? key;
  return fill(s, params);
}

/** Plural form for n: tp('days', 3) → 'days.few' in Czech, 'days.other' in English. */
export function tp(key, n, params) {
  const cat = new Intl.PluralRules(locale()).select(n);
  const tbl = TABLES[current];
  const k = [`${key}.${cat}`, `${key}.other`].find((x) => x in tbl) ?? `${key}.other`;
  return t(k, { n, ...params });
}

// ---------- number and date formatting ----------

export function fmtNum(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (Math.abs(v) < 0.5 * 10 ** -digits) v = 0;
  return v.toLocaleString(locale(), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).replace('-', '−');
}

/** Fixed number of decimals (tables). */
export function fmtFixed(v, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace('-', '−');
}

export const fmtInt = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toLocaleString(locale()));

/** '60 %' in Czech, '60%' in English. */
export function fmtPct(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return t('fmt.pct', { n: Math.round(v) });
}

const MONTHS_SHORT = {
  cs: null,
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** Day and month: '20. 10.' / '20 Oct'. */
export function fmtDM(day, month) {
  return current === 'cs' ? `${day}. ${month}.` : `${day} ${MONTHS_SHORT.en[month - 1]}`;
}

/** 'YYYY-MM-DD' → day and month. */
export function fmtDateDM(s) {
  const [, m, d] = s.split('-').map(Number);
  return fmtDM(d, m);
}

/** 'YYYY-MM-DD' → '20. 10. 2026' / '20 Oct 2026'. */
export function fmtDateFull(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return `${fmtDM(d, m)} ${y}`;
}

/** ISO timestamp → local Prague time, e.g. '19. 10. 06:00' / '19 Oct, 06:00'. */
export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString(locale(), {
    day: 'numeric',
    month: current === 'cs' ? 'numeric' : 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  });
}

// ---------- static page content ----------

/** Fill [data-i18n] (text), [data-i18n-html] (html) and [data-i18n-attr="attr:key;attr:key"] inside root. */
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((x) => x.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
  const page = document.body?.dataset.page;
  if (page) {
    document.title = t(`page.${page}.title`);
    const desc = t(`page.${page}.desc`);
    document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
    const og = (p, v) => document.querySelector(`meta[property="${p}"]`)?.setAttribute('content', v);
    og('og:title', document.title);
    og('og:description', desc);
    og('og:locale', current === 'cs' ? 'cs_CZ' : 'en_GB');
  }
}

/** Show the page again after the inline script in <head> hid it for the translation (English only). */
export function revealPage() {
  document.documentElement.classList.remove('i18n-pending');
}

/** The CS | EN switch in the header. */
export function initLangSwitch(host) {
  if (!host) return;
  host.className = 'langsw';
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', t('lang.label'));
  host.innerHTML = LANGS.map(
    (l) => `<button type="button" data-lang="${l}" aria-pressed="${l === current}" lang="${l}" title="${t(`lang.${l}`)}">${l.toUpperCase()}</button>`,
  ).join('');
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]');
    if (b) chooseLang(b.dataset.lang);
  });
}

/** Everything a page needs at start-up. */
export function initPage() {
  applyStatic();
  revealPage();
  initLangSwitch(document.getElementById('lang'));
}
