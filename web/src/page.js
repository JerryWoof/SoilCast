import './style.css';
import { loadAnalytics } from './analytics.js';
import { initTheme } from './theme.js';
import { initPage } from './i18n.js';

initTheme(document.getElementById('theme'));
loadAnalytics();
initPage();
