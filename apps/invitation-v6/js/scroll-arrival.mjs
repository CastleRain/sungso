// Scroll owns the arrival progress; it never owns the visitor's scroll position.
export function arrivalProgress(top, viewportHeight) {
  const raw = Math.max(0, Math.min(1, (viewportHeight * .96 - top) / (viewportHeight * .34)));
  return raw * raw * (3 - 2 * raw);
}

export function setupScrollArrival({ enabled = true, doc = document, win = window } = {}) {
  const root = doc.documentElement;
  const states = [...doc.querySelectorAll('main .reveal')]
    .filter(element => !element.parentElement.closest('.reveal'))
    .map(element => ({ element, y: 0, settled: false }));
  const hero = doc.querySelector('.hero');
  let active = false, frame = 0;

  function settle(state) {
    state.settled = true;
    state.y = 0;
    state.element.classList.add('is-visible');
    state.element.classList.remove('arrival-pending');
    state.element.style.removeProperty('--arrival-y');
    state.element.style.removeProperty('--arrival-scale');
    state.element.style.removeProperty('--arrival-opacity');
  }

  function render() {
    frame = 0;
    if (!active || doc.hidden || doc.querySelector('dialog[open]')) return;
    const height = win.innerHeight;
    // Read geometry before writing. Top-origin scaling does not move this anchor.
    const measures = states.filter(state => !state.settled).map(state => ({
      state, rect: state.element.getBoundingClientRect(),
    }));
    const heroRect = hero?.getBoundingClientRect();
    for (const { state, rect } of measures) {
      if (!rect.width || !rect.height) continue; // Account/gallery data may still be hidden.
      const progress = arrivalProgress(rect.top - state.y, height);
      if (progress >= 1 || state.element.contains(doc.activeElement)) { settle(state); continue; }
      state.y = (1 - progress) * 46;
      if (progress > .015) state.element.classList.add('is-visible');
      state.element.style.setProperty('--arrival-y', `${state.y.toFixed(2)}px`);
      state.element.style.setProperty('--arrival-scale', (1 - (1 - progress) * .035).toFixed(4));
      state.element.style.setProperty('--arrival-opacity', (.12 + progress * .88).toFixed(4));
    }
    if (heroRect && root.classList.contains('intro-complete')) {
      const progress = Math.max(0, Math.min(1, -heroRect.top / heroRect.height));
      hero.style.setProperty('--hero-drift', `${(progress * 34).toFixed(2)}px`);
      hero.style.setProperty('--hero-scale', (1 + progress * .045).toFixed(4));
    }
  }

  function queue() {
    if (active && !frame && !doc.hidden) frame = win.requestAnimationFrame(render);
  }
  function setEnabled(value) {
    active = value;
    win.cancelAnimationFrame(frame); frame = 0;
    root.classList.toggle('scroll-arrivals', active);
    if (active) {
      states.forEach(state => {
        if (!state.settled) {
          // Start at identity so our first measurement has no CSS displacement.
          state.element.style.setProperty('--arrival-y', '0px');
          state.element.classList.add('arrival-pending');
          state.y = 0;
        }
      });
      render();
    } else {
      states.forEach(state => {
        state.y = 0;
        state.element.classList.remove('arrival-pending');
        state.element.classList.add('is-visible');
      });
      hero?.style.removeProperty('--hero-drift');
      hero?.style.removeProperty('--hero-scale');
    }
  }
  win.addEventListener('scroll', queue, { passive: true });
  win.addEventListener('resize', queue, { passive: true });
  win.addEventListener('pageshow', queue);
  doc.addEventListener('sungso:intro-finished', queue);
  doc.addEventListener('close', queue, true);
  doc.addEventListener('focusin', event => {
    const state = states.find(state => state.element.contains(event.target));
    if (state) settle(state);
  });
  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden) { win.cancelAnimationFrame(frame); frame = 0; }
    else queue();
  });
  setEnabled(enabled);
  return { setEnabled };
}
