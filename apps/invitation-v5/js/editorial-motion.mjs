// Progressive enhancement: the unenhanced document remains fully readable.
export function setupEditorialMotion({ enabled = true } = {}) {
  const root = document.documentElement;
  let frame = 0;
  let active = enabled;
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
    root.classList.toggle('editorial-motion', active);
    if (!active) {
      window.sungsoIntro?.finish();
      cancelAnimationFrame(frame);
      frame = 0;
      scenes.forEach(scene => {
        scene.style.removeProperty('--scene-y');
      });
    } else queueScroll();
  }
  addEventListener('scroll', queueScroll, { passive: true });
  addEventListener('resize', queueScroll, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else queueScroll();
  });
  setEnabled(enabled);
  return { setEnabled };
}
