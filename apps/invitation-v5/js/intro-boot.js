// Start before the first paint. This lock always expires, even if modules fail.
(() => {
  const root = document.documentElement;
  let disabled = false;
  try { disabled = localStorage.getItem('sungso_invitation_v5_motion') === 'off'; } catch {}
  const restored = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  if (disabled || matchMedia('(prefers-reduced-motion: reduce)').matches ||
      restored || (location.hash && location.hash !== '#top')) return;
  const events = new AbortController();
  let timer;
  function finish() {
    clearTimeout(timer);
    events.abort();
    const wasLocked = root.classList.contains('intro-locked');
    root.classList.remove('intro-pending', 'intro-running', 'intro-locked');
    root.classList.add('intro-complete');
    if (wasLocked) document.dispatchEvent(new Event('sungso:intro-finished'));
  }
  window.sungsoIntro = { finish };
  root.classList.add('intro-pending', 'intro-locked');
  timer = setTimeout(finish, 4500);
  const options = { signal: events.signal };
  addEventListener('hashchange', finish, options);
  addEventListener('pagehide', finish, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); }, options);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') finish();
    else if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key) &&
      !event.target.closest?.('button, a, input, textarea')) event.preventDefault();
  }, options);
  document.addEventListener('touchmove', event => {
    if (event.cancelable) event.preventDefault();
  }, { ...options, passive: false });
})();
