// The cover owns its opening: album/guestbook modules must not delay the ink.
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let disabled = false;
  try { disabled = localStorage.getItem('sungso_invitation_lab_motion') === 'off'; } catch {}
  const restored = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  if (disabled || reduced.matches ||
      restored || (location.hash && location.hash !== '#top')) return;
  const events = new AbortController();
  let timer, frame, started = false;
  const inkAnimations = [];
  function finish() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    inkAnimations.forEach(animation => animation.cancel());
    events.abort();
    const wasLocked = root.classList.contains('intro-locked');
    root.classList.remove('intro-pending', 'intro-running', 'intro-locked');
    root.classList.add('intro-complete');
    if (document.activeElement?.id === 'intro-skip') {
      document.querySelector('.hero-scroll')?.focus({ preventScroll: true });
    }
    if (wasLocked) document.dispatchEvent(new Event('sungso:intro-finished'));
  }
  window.sungsoIntro = { finish };
  root.classList.add('intro-pending', 'intro-locked');
  timer = setTimeout(finish, 4500);
  const options = { signal: events.signal };
  addEventListener('hashchange', finish, options);
  addEventListener('pagehide', finish, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); }, options);
  reduced.addEventListener('change', () => { if (reduced.matches) finish(); }, options);
  document.addEventListener('focusin', event => {
    if (!event.target.closest?.('.hero, #sound-dock')) finish();
  }, options);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') finish();
    else if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key) &&
      !event.target.closest?.('button, a, input, textarea')) event.preventDefault();
  }, options);
  document.addEventListener('touchmove', event => {
    if (event.cancelable) event.preventDefault();
  }, { ...options, passive: false });

  function start() {
    if (document.readyState === 'loading' || started || !root.classList.contains('intro-locked')) return;
    started = true;
    if (document.hidden) { finish(); return; }
    document.querySelector('#intro-skip')?.addEventListener('click', finish, options);
    frame = requestAnimationFrame(() => {
      const traces = [...document.querySelectorAll('.hero-handwriting .ink-trace')];
      if (!traces.length || !traces.every(trace => typeof trace.animate === 'function')) { finish(); return; }
      try {
        let duration = 0;
        const lead = 120;
        traces.forEach(trace => {
          const style = getComputedStyle(trace);
          duration = Math.max(duration, parseFloat(style.getPropertyValue('--ink-end')));
          inkAnimations.push(trace.animate(
            [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
            { duration: parseFloat(style.getPropertyValue('--ink-duration')),
              delay: lead + parseFloat(style.getPropertyValue('--ink-delay')),
              easing: 'ease-in-out', fill: 'both' }
          ));
        });
        document.querySelectorAll('.hero-handwriting .ink-seal').forEach(seal => {
          inkAnimations.push(seal.animate(
            [{ opacity: 0 }, { opacity: 1 }],
            { duration: 90, delay: lead + parseFloat(getComputedStyle(seal).getPropertyValue('--ink-end')), fill: 'both' }
          ));
        });
        root.classList.remove('intro-pending');
        root.classList.add('intro-running');
        clearTimeout(timer);
        timer = setTimeout(finish, Math.min(4500, lead + duration + 200));
      } catch { finish(); }
    });
  }
  // "interactive" fires before deferred module graphs finish loading.
  // DOMContentLoaded would still wait for every app dependency.
  document.addEventListener('readystatechange', start, options);
  start();
})();
