import { createReferenceScenes } from './reference-scenes.mjs?v=20260915-personal-invitation';

const REVEAL = '[data-reference-reveal]';

/** Ordinary document flow with one appearance per sample and content key. */
export function createReferenceFlow() {
  const scenes = createReferenceScenes();
  const seen = new Map(), introsSeen = new Map(), galleryPositions = new Map();
  let main = null, article = null, nodes = [], originals = [], galleries = [], intros = [];
  let media = null, observer = null, introObserver = null, raf = 0, generation = 0, templateId = '';
  let enabled = true, originalMain = null, pendingPosition = null;

  function history() {
    if (!seen.has(templateId)) seen.set(templateId, new Set());
    return seen.get(templateId);
  }
  function introHistory() {
    if (!introsSeen.has(templateId)) introsSeen.set(templateId, new Set());
    return introsSeen.get(templateId);
  }
  function finishIntro(intro) {
    introHistory().add(intro.key);
    intro.root.classList.add('ref-intro-seen');
    introObserver?.unobserve(intro.trigger);
  }
  function startIntro(intro) {
    if (!article?.contains(intro.root)) return;
    introHistory().add(intro.key);
    intro.root.classList.add('ref-intro-play');
    introObserver?.unobserve(intro.trigger);
  }
  function show(node, immediate = false) {
    if (!node || !article?.contains(node)) return;
    history().add(node.dataset.referenceKey);
    node.classList.add('ref-visible');
    if (immediate) node.classList.add('ref-seen');
    observer?.unobserve(node);
  }
  function revealFocus(event) {
    nodes.filter(node => node.contains(event.target)).forEach(node => show(node, true));
    intros.filter(intro => intro.root.contains(event.target)).forEach(finishIntro);
  }
  function capture() {
    if (!main?.isConnected || !article) return null;
    if (scenes.active) return scenes.capture();
    const index = nodes.findIndex(node => node.getBoundingClientRect().bottom > 0);
    const selected = index < 0 ? nodes.length - 1 : index;
    const node = nodes[selected], bounds = article.getBoundingClientRect();
    return {
      flow: true, templateId, key: node?.dataset.referenceKey, index: selected,
      offset: node?.getBoundingClientRect().top || 0, y: window.scrollY,
      pinned: bounds.bottom > 0 && bounds.top < window.innerHeight,
    };
  }
  function restorePosition(position) {
    if (!position || (position.templateId && position.templateId !== templateId)) return;
    let top = Number.isFinite(position.y) ? position.y : null;
    if (position.pinned) {
      const matched = Array.from(article.querySelectorAll('[data-reference-key]')).find(node => node.dataset.referenceKey === position.key);
      const fallback = nodes[Math.max(0, Math.min(nodes.length - 1, position.index || 0))];
      const node = matched || fallback;
      if (node) top = node.getBoundingClientRect().top + window.scrollY - (matched && Number.isFinite(position.offset) ? position.offset : 0);
    }
    if (Number.isFinite(top)) window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  }
  function coverHeight() {
    const height = Math.max(600, Math.min(900, Number(window.innerHeight) || 720));
    const value = `${height}px`;
    if (main.style.getPropertyValue('--reference-cover-height') !== value) main.style.setProperty('--reference-cover-height', value);
  }
  function galleryOffsets(gallery) {
    const start = gallery.items[0]?.offsetLeft || 0;
    return gallery.items.map(item => item.offsetLeft - start);
  }
  function galleryIndex(gallery) {
    const offsets = galleryOffsets(gallery);
    return offsets.reduce((closest, value, index) => Math.abs(value - gallery.row.scrollLeft) < Math.abs(offsets[closest] - gallery.row.scrollLeft) ? index : closest, 0);
  }
  function paintGallery(gallery, index) {
    gallery.index = index;
    galleryPositions.set(gallery.key, index);
    if (gallery.count) gallery.count.textContent = `${index + 1} / ${gallery.items.length}`;
    gallery.buttons.forEach(button => { button.disabled = Number(button.dataset.referenceGalleryStep) < 0 ? index === 0 : index === gallery.items.length - 1; });
  }
  function moveGallery(gallery, index, animate = false) {
    const selected = Math.max(0, Math.min(gallery.items.length - 1, index));
    paintGallery(gallery, selected);
    gallery.row.scrollTo({ left: galleryOffsets(gallery)[selected] || 0, behavior: animate && enabled && !media?.matches ? 'smooth' : 'instant' });
  }
  function mountGalleries() {
    galleries = Array.from(article.querySelectorAll('[data-reference-gallery-root]')).flatMap(root => {
      const row = root.querySelector('[data-reference-gallery]');
      const items = row ? Array.from(row.children) : [];
      if (!row || !items.length) return [];
      const buttons = Array.from(root.querySelectorAll('[data-reference-gallery-step]'));
      const count = root.querySelector('[data-reference-gallery-count]');
      const gallery = {
        root, row, items, buttons, count, key: `${templateId}:${root.dataset.referenceGalleryRoot}`,
        originalCount: count?.textContent, originalDisabled: buttons.map(button => button.disabled),
      };
      gallery.onScroll = () => { if (main?.isConnected && article.contains(root)) paintGallery(gallery, galleryIndex(gallery)); };
      gallery.onClick = event => {
        const button = event.target.closest('[data-reference-gallery-step]');
        if (!button || !root.contains(button) || button.disabled) return;
        const direction = Number(button.dataset.referenceGalleryStep);
        if (direction === -1 || direction === 1) moveGallery(gallery, galleryIndex(gallery) + direction, true);
      };
      row.addEventListener('scroll', gallery.onScroll, { passive: true });
      root.addEventListener('click', gallery.onClick);
      moveGallery(gallery, galleryPositions.get(gallery.key) || 0);
      return [gallery];
    });
  }
  function refresh() {
    if (!main) return;
    if (scenes.active) {
      coverHeight(); galleries.forEach(gallery => moveGallery(gallery, gallery.index)); scenes.refresh(); return;
    }
    pendingPosition ||= capture();
    const token = generation;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (token !== generation || !main?.isConnected) return;
      coverHeight();
      galleries.forEach(gallery => moveGallery(gallery, gallery.index));
      restorePosition(pendingPosition); pendingPosition = null;
    });
  }
  function mediaChanged() {
    const target = main, position = capture(), requested = enabled, id = templateId;
    mount(target, { enabled: requested, restore: position, templateId: id });
  }
  function mount(target, options = {}) {
    dispose();
    if (!target?.isConnected) return false;
    const content = target.querySelector('#preview-canvas > .invitation');
    if (!content) return false;
    main = target; article = content; enabled = options.enabled !== false;
    templateId = options.templateId || article.dataset.template || 'reference';
    nodes = Array.from(article.querySelectorAll(REVEAL)).filter(node => node.dataset.referenceKey);
    originals = nodes.map(node => ({
      visible: node.classList.contains('ref-visible'), seen: node.classList.contains('ref-seen'), reveal: node.classList.contains('ref-reveal'),
    }));
    intros = Array.from(article.querySelectorAll('[data-reference-intro]')).filter(root => root.dataset.referenceKey).map(root => ({
      root, key: root.dataset.referenceKey, trigger: root.querySelector('[data-reference-intro-trigger]') || root,
      play: root.classList.contains('ref-intro-play'), seen: root.classList.contains('ref-intro-seen'),
    }));
    originalMain = {
      referenceMotion: main.dataset.referenceMotion, scrollStory: main.dataset.scrollStory,
      height: main.style.getPropertyValue('--reference-cover-height'), priority: main.style.getPropertyPriority('--reference-cover-height'),
    };
    media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    media?.addEventListener('change', mediaChanged);
    const motion = enabled && !media?.matches && typeof IntersectionObserver === 'function';
    const mode = enabled && media?.matches ? 'reduced' : motion ? 'on' : 'off';
    main.dataset.referenceMotion = mode;
    main.dataset.scrollStory = motion ? 'flow' : mode;
    coverHeight();
    const known = history();
    nodes.forEach(node => {
      node.classList.add('ref-reveal');
      if (!motion || known.has(node.dataset.referenceKey)) show(node, true);
    });
    const staged = motion && scenes.mount(main, {
      templateId, restore: options.restore,
      onFrame: state => { if (state.coverPassed) intros.forEach(finishIntro); },
    });
    if (staged) nodes.forEach(node => show(node, true));
    if (motion && !staged) {
      const token = generation;
      observer = new IntersectionObserver(entries => {
        if (token !== generation || !main?.isConnected) return;
        entries.forEach(entry => { if (entry.isIntersecting && nodes.includes(entry.target)) show(entry.target); });
      }, { threshold: 0, rootMargin: '0px 0px -6% 0px' });
      nodes.filter(node => !known.has(node.dataset.referenceKey)).forEach(node => observer.observe(node));
    }
    const knownIntros = introHistory();
    intros.filter(intro => !motion || knownIntros.has(intro.key)).forEach(finishIntro);
    const pendingIntros = intros.filter(intro => motion && !knownIntros.has(intro.key));
    if (pendingIntros.length) {
      const token = generation;
      introObserver = new IntersectionObserver(entries => {
        if (token !== generation || !main?.isConnected) return;
        entries.forEach(entry => {
          const intro = pendingIntros.find(item => item.trigger === entry.target);
          if (intro && !intro.root.inert && entry.isIntersecting && entry.intersectionRatio >= .5) startIntro(intro);
        });
      }, { threshold: .5, rootMargin: '0px 0px -6% 0px' });
      pendingIntros.forEach(intro => introObserver.observe(intro.trigger));
    }
    article.addEventListener('focusin', revealFocus);
    mountGalleries();
    window.addEventListener('resize', refresh, { passive: true });
    window.visualViewport?.addEventListener('resize', refresh, { passive: true });
    pendingPosition = options.restore || null;
    const token = generation;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (token !== generation || !main?.isConnected) return;
      galleries.forEach(gallery => moveGallery(gallery, gallery.index));
      if (!scenes.active) restorePosition(pendingPosition);
      pendingPosition = null;
    });
    return true;
  }
  function dispose() {
    scenes.dispose();
    generation++;
    cancelAnimationFrame(raf); raf = 0;
    observer?.disconnect(); observer = null;
    introObserver?.disconnect(); introObserver = null;
    media?.removeEventListener('change', mediaChanged); media = null;
    window.removeEventListener('resize', refresh);
    window.visualViewport?.removeEventListener('resize', refresh);
    article?.removeEventListener('focusin', revealFocus);
    galleries.forEach(gallery => {
      gallery.row.removeEventListener('scroll', gallery.onScroll);
      gallery.root.removeEventListener('click', gallery.onClick);
      if (gallery.count) gallery.count.textContent = gallery.originalCount;
      gallery.buttons.forEach((button, index) => { button.disabled = gallery.originalDisabled[index]; });
    });
    nodes.forEach((node, index) => {
      const saved = originals[index];
      [['ref-reveal', saved.reveal], ['ref-visible', saved.visible], ['ref-seen', saved.seen]].forEach(([name, present]) => {
        if (present) node.classList.add(name); else node.classList.remove(name);
      });
    });
    intros.forEach(intro => {
      [['ref-intro-play', intro.play], ['ref-intro-seen', intro.seen]].forEach(([name, present]) => {
        if (present) intro.root.classList.add(name); else intro.root.classList.remove(name);
      });
    });
    if (main && originalMain) {
      for (const key of ['referenceMotion', 'scrollStory']) {
        if (originalMain[key] === undefined) delete main.dataset[key]; else main.dataset[key] = originalMain[key];
      }
      if (originalMain.height) main.style.setProperty('--reference-cover-height', originalMain.height, originalMain.priority);
      else main.style.removeProperty('--reference-cover-height');
    }
    main = null; article = null; nodes = []; originals = []; galleries = []; intros = []; originalMain = null; pendingPosition = null;
  }
  return { mount, capture, dispose, refresh, get active() { return Boolean(main && article); } };
}
