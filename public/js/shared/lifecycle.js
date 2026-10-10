// Calls fn once when an element leaves the page (navigation, a closed modal or a re-render), so
// the microphone never keeps listening for a screen that's gone.
export function onRemoved(el, fn) {
  if (!el || typeof MutationObserver === 'undefined') return () => {};
  let done = false;
  const obs = new MutationObserver(() => { if (!done && !document.contains(el)) { done = true; obs.disconnect(); fn(); } });
  obs.observe(document.body, { childList: true, subtree: true });
  return () => { done = true; obs.disconnect(); };
}
