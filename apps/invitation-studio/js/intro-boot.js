// The cover owns its opening: album/guestbook modules must not delay the ink.
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const effects = new Set(['ink', 'flow', 'bloom', 'light']);
  const normalize = value => effects.has(value) ? value : 'ink';
  let effect = normalize(new URLSearchParams(location.search).get('opening'));
  let cycle = null;
  root.dataset.opening = effect;

  function enabled() {
    let disabled = root.classList.contains('motion-off');
    try { disabled ||= localStorage.getItem('sungso_invitation_studio_motion') === 'off'; } catch {}
    return !disabled && !reduced.matches && !document.hidden && !root.classList.contains('has-dialog');
  }

  function finish() {
    const wasOpening = Boolean(cycle) || root.classList.contains('intro-locked') || root.classList.contains('intro-preview');
    if (cycle) {
      clearTimeout(cycle.timer);
      cancelAnimationFrame(cycle.frame);
      cycle.animations.forEach(animation => animation.cancel());
      cycle.events.abort();
      cycle = null;
    }
    root.classList.remove('intro-pending', 'intro-running', 'intro-locked', 'intro-preview');
    root.classList.add('intro-complete');
    if (document.activeElement?.id === 'intro-skip') {
      document.querySelector('.hero-scroll')?.focus({ preventScroll: true });
    }
    if (wasOpening) document.dispatchEvent(new Event('sungso:intro-finished'));
  }

  // Two harmless wrappers keep the original glyph transforms, masks and paths intact.
  function lines(svg) {
    let groups = [...svg.querySelectorAll('.opening-line')];
    if (groups.length) return groups;
    const glyphs = [...svg.children].filter(node => node.tagName.toLowerCase() === 'g');
    groups = [0, 1].map(index => {
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', `opening-line opening-line-${index + 1}`);
      svg.append(group);
      return group;
    });
    glyphs.forEach((glyph, index) => groups[index < 5 ? 0 : 1].append(glyph));
    return groups;
  }

  function play(node, keyframes, timing, current) {
    const animation = node.animate(keyframes, { fill: 'both', easing: 'ease-in-out', ...timing });
    current.animations.push(animation);
  }

  function draw(current) {
    if (cycle !== current) return;
    if (!enabled()) { finish(); return; }
    const svg = document.querySelector('.hero-handwriting');
    const traces = [...document.querySelectorAll('.hero-handwriting .ink-trace')];
    const seals = [...document.querySelectorAll('.hero-handwriting .ink-seal')];
    if (!svg || !traces.length || !traces.every(trace => typeof trace.animate === 'function')) { finish(); return; }
    try {
      const lineGroups = lines(svg);
      const phrase = svg.parentElement;
      const lead = 120;
      let duration = 0;
      traces.forEach((trace, index) => {
        const style = getComputedStyle(trace);
        const originalDelay = parseFloat(style.getPropertyValue('--ink-delay')) || 0;
        const originalDuration = parseFloat(style.getPropertyValue('--ink-duration')) || 190;
        let delay = lead + originalDelay, length = originalDuration;
        if (effect === 'flow') {
          delay = lead + (index < 5 ? index * 90 : 650 + (index - 5) * 58);
          length = Math.max(180, originalDuration * 1.25);
        } else if (effect === 'bloom') {
          delay = lead + index * 28;
          length = 620;
        } else if (effect === 'light') {
          delay = lead + index * 18;
          length = 380;
        }
        duration = Math.max(duration, delay + length + 90);
        play(trace, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: length, delay }, current);
        if (seals[index]) play(seals[index], [{ opacity: 0 }, { opacity: 1 }], { duration: 90, delay: delay + length }, current);
      });

      if (effect === 'flow') {
        lineGroups.forEach((group, index) => play(group,
          [{ opacity: 0, transform: 'translateY(420px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 1000, delay: index * 540, easing: 'cubic-bezier(.19,1,.22,1)' }, current));
        duration = Math.max(duration, 1900);
      } else if (effect === 'bloom') {
        lineGroups.forEach((group, index) => play(group,
          [{ opacity: 0, filter: 'blur(100px)', transform: 'scale(1.055)' },
            { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' }],
          { duration: 1550, delay: index * 180, easing: 'cubic-bezier(.22,.61,.36,1)' }, current));
        duration = 1900;
      } else if (effect === 'light') {
        play(phrase, [
          { clipPath: 'inset(-20% 103% -25% -5%)', filter: 'drop-shadow(0 0 9px #dcefff)' },
          { clipPath: 'inset(-20% -5% -25% -5%)', filter: 'drop-shadow(0 0 0px transparent)' }
        ], { duration: 1900, delay: 160, easing: 'cubic-bezier(.32,.05,.2,1)' }, current);
        duration = 2200;
      }
      root.classList.remove('intro-pending');
      root.classList.add('intro-running');
      clearTimeout(current.timer);
      current.timer = setTimeout(finish, Math.min(4500, duration + 200));
    } catch { finish(); }
  }

  function replay(value = effect, settings = {}) {
    finish();
    effect = normalize(value);
    root.dataset.opening = effect;
    if (!enabled()) return false;
    // Only the explicit editor caller opts in. URL options never unlock an
    // ordinary guest opening, and preview uses exactly the same ink animations.
    const preview = settings?.preview === true;
    const current = { events: new AbortController(), animations: [], started: false, timer: null, frame: null };
    cycle = current;
    const options = { signal: current.events.signal };
    root.classList.remove('intro-complete');
    root.classList.add('intro-pending', preview ? 'intro-preview' : 'intro-locked');
    current.timer = setTimeout(finish, 4500);
    addEventListener('hashchange', finish, options);
    addEventListener('pagehide', finish, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); }, options);
    reduced.addEventListener('change', () => { if (reduced.matches) finish(); }, options);
    document.addEventListener('focusin', event => {
      if (!event.target.closest?.('.hero, #sound-dock')) finish();
    }, options);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') finish();
      else if (!preview && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key) &&
        !event.target.closest?.('button, a, input, textarea')) event.preventDefault();
    }, options);
    if (!preview) document.addEventListener('touchmove', event => {
      if (event.cancelable) event.preventDefault();
    }, { ...options, passive: false });
    function start() {
      if (document.readyState === 'loading' || current.started || cycle !== current) return;
      current.started = true;
      document.querySelector('#intro-skip')?.addEventListener('click', finish, options);
      current.frame = requestAnimationFrame(() => draw(current));
    }
    // "interactive" fires before deferred module graphs finish loading.
    document.addEventListener('readystatechange', start, options);
    start();
    return true;
  }

  window.sungsoIntro = { finish, replay, get effect() { return effect; }, get running() { return !!cycle; } };
  const restored = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  if (restored || (location.hash && location.hash !== '#top') || !enabled()) finish();
  else replay(effect);
})();
