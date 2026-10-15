// Public pages (landing, pricing, sign-up, log-in, join, booking): always the light theme, and in
// the visitor's language: Spanish when their phone or browser is set to Spanish, English
// otherwise, with an EN | ES switch in the top bar to change it.
import { startTranslation, langSwitchHtml, wireLangSwitch } from '../shared/i18n.js';

document.documentElement.dataset.theme = 'light';
startTranslation();

function addSwitch() {
  if (document.querySelector('.lang-switch')) return;
  const holder = document.querySelector('.pub-nav .row') || document.querySelector('.pub-nav') || document.querySelector('header');
  const wrap = document.createElement('div');
  wrap.innerHTML = langSwitchHtml();
  const sw = wrap.firstElementChild;
  if (holder) holder.prepend(sw);
  else { sw.style.cssText = 'position:fixed;top:12px;right:12px;z-index:50;background:var(--surface)'; document.body.appendChild(sw); }
  wireLangSwitch(sw);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addSwitch); else addSwitch();
