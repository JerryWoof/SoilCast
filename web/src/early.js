// Runs as soon as the small i18n tables are loaded (before the heavy page script, e.g. MapLibre):
// translates the static Czech HTML for English visitors and lifts the "hidden until translated" class.
import { applyStatic, revealPage } from './i18n.js';

applyStatic();
revealPage();
