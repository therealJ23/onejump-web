// Public pages (landing, pricing, sign-up, log-in, join, booking): always the light theme, and in
// the visitor's language: Spanish when their phone or browser is set to Spanish, English
// otherwise. Coaches change the language in Settings once they're signed in.
import { startTranslation } from '../shared/i18n.js';

document.documentElement.dataset.theme = 'light';
startTranslation();
