// Light/dark switch shared by all pages: auto (system) → light → dark.
import { loadSettings, saveSettings } from './settings.js';

const ICONS = {
  auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="currentColor"/></svg>',
};
const NAMES = { auto: 'podle systému', light: 'světlý', dark: 'tmavý' };
const listeners = [];

export function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function onThemeChange(fn) {
  listeners.push(fn);
}

export function initTheme(button) {
  let mode = loadSettings().theme;
  const apply = () => {
    if (mode === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = mode;
    if (button) {
      button.innerHTML = ICONS[mode];
      button.title = `Barevný režim: ${NAMES[mode]}`;
      button.setAttribute('aria-label', button.title);
    }
    listeners.forEach((fn) => fn(isDark()));
  };
  button?.addEventListener('click', () => {
    mode = { auto: 'light', light: 'dark', dark: 'auto' }[mode];
    saveSettings({ theme: mode });
    apply();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => mode === 'auto' && apply());
  apply();
}
