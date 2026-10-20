import './style.css';
import { initTheme } from './theme.js';
import { initPage } from './i18n.js';

initTheme(document.getElementById('theme'));
initPage();
