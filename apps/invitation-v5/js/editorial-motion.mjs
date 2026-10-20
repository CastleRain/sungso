// Progressive enhancement: the unenhanced document remains fully readable.
export function setupEditorialMotion({ enabled = true } = {}) {
  const root = document.documentElement;
  const replay = document.querySelector('#ink-replay');
  const lettering = document.querySelector('.hero-handwriting');
  let inkAnimations = [];
  let frame = 0;
  let active = enabled;
  let openingTimer;
  const scenes = [...document.querySelectorAll('[data-scroll-photo], [data-scroll-ending]')];
  const visibleScenes = new Set();

  document.querySelectorAll('.section-title h2, .story-section > h2').forEach(heading => {
    const text = heading.textContent;
    heading.setAttribute('aria-label', text);
    const visual = document.createElement('span');
    visual.className = 'lettering';
    visual.setAttribute('aria-hidden', 'true');
    [...text].forEach((letter, index) => {
      const span = document.createElement('span');
      span.className = 'reveal-letter';
      span.textContent = letter === ' ' ? '\u00a0' : letter;
      span.style.setProperty('--letter-delay', `${Math.min(index, 28) * 25}ms`);
      visual.append(span);
    });
    heading.replaceChildren(visual);
  });

  document.querySelectorAll('[data-reveal-lines]').forEach(paragraph => {
    const lines = paragraph.innerHTML.split(/<br\s*\/?>/i);
    // These paragraphs are static plain text; never interpret content as markup.
    paragraph.replaceChildren(...lines.map((text, index) => {
      const line = document.createElement('span');
      line.className = 'reveal-line';
      line.textContent = text;
      line.style.setProperty('--line-delay', `${index * 170}ms`);
      return line;
    }));
  });

  function settleInk() {
    inkAnimations.forEach(animation => animation.cancel());
    inkAnimations = [];
  }

  function writeInk({ opening = false } = {}) {
    settleInk();
    if (!active || document.hidden || !lettering?.animate) return;
    let duration = 0;
    lettering.querySelectorAll('.ink-trace').forEach(trace => {
      const style = getComputedStyle(trace);
      duration = Math.max(duration, parseFloat(style.getPropertyValue('--ink-end')));
      inkAnimations.push(trace.animate(
        [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
        { duration: parseFloat(style.getPropertyValue('--ink-duration')),
          delay: parseFloat(style.getPropertyValue('--ink-delay')),
          easing: 'ease-in-out', fill: 'both' }
      ));
    });
    lettering.querySelectorAll('.ink-seal').forEach(seal => {
      inkAnimations.push(seal.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 90, delay: parseFloat(getComputedStyle(seal).getPropertyValue('--ink-end')), fill: 'both' }
      ));
    });
    if (opening) openingTimer = setTimeout(() => window.sungsoIntro?.finish(), duration + 140);
  }

  function renderScroll() {
    frame = 0;
    if (!active || document.hidden) return;
    const height = window.innerHeight;
    visibleScenes.forEach(scene => {
      const rect = scene.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (height - rect.top) / (height + rect.height)));
      const centered = progress - .5;
      scene.style.setProperty('--scene-y', `${(centered * 44).toFixed(2)}px`);
    });
  }

  function queueScroll() {
    if (active && !frame && !document.hidden) frame = requestAnimationFrame(renderScroll);
  }

  if ('IntersectionObserver' in window) {
    root.classList.add('js-motion');
    const reveals = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          reveals.unobserve(entry.target);
        }
      });
    }, { threshold: .08, rootMargin: '0px 0px -20px 0px' });
    document.querySelectorAll('.reveal').forEach(element => reveals.observe(element));
    const sceneObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visibleScenes.add(entry.target) : visibleScenes.delete(entry.target));
      queueScroll();
    }, { rootMargin: '100px' });
    scenes.forEach(scene => sceneObserver.observe(scene));
  } else {
    scenes.forEach(scene => visibleScenes.add(scene));
  }

  function setEnabled(value) {
    active = value;
    replay.hidden = !active;
    root.classList.toggle('editorial-motion', active);
    if (!active) {
      window.sungsoIntro?.finish();
      settleInk();
      cancelAnimationFrame(frame);
      frame = 0;
      scenes.forEach(scene => {
        scene.style.removeProperty('--scene-y');
      });
    } else queueScroll();
  }
  replay.addEventListener('click', () => writeInk());
  document.querySelector('#intro-skip').addEventListener('click', () => window.sungsoIntro?.finish());
  document.addEventListener('sungso:intro-finished', () => {
    clearTimeout(openingTimer);
    settleInk();
    if (document.activeElement?.id === 'intro-skip') replay.focus({ preventScroll: true });
  });
  document.addEventListener('focusin', event => {
    if (root.classList.contains('intro-locked') &&
      !event.target.closest?.('.hero, #sound-dock')) window.sungsoIntro?.finish();
  });
  addEventListener('scroll', queueScroll, { passive: true });
  addEventListener('resize', queueScroll, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      settleInk();
      cancelAnimationFrame(frame);
      frame = 0;
    } else queueScroll();
  });
  setEnabled(enabled);
  requestAnimationFrame(() => {
    const opening = root.classList.contains('intro-locked');
    if (opening) {
      root.classList.remove('intro-pending');
      root.classList.add('intro-running');
    }
    // A direct section link or restored page should not replay the opening.
    if (opening) writeInk({ opening: true });
  });
  return { setEnabled };
}
