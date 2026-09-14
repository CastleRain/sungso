import { buildStoryTrack, getStoryFrame, storyDistanceAt } from './scroll-story-core.mjs?v=20260914-reference-samples';
import { collectStoryNodes, storySceneKey as sceneKey, STORY_LABELS as LABELS } from './scroll-designs.mjs?v=20260914-reference-samples';
import { storyMotion } from './scroll-motion.mjs?v=20260914-reference-samples';

export { supportsScrollStory } from './scroll-designs.mjs?v=20260914-reference-samples';

/** Document scrolling drives an existing invitation; no second scroll surface or stored state. */
export function createScrollStory() {
  let main, layout, stage, canvas, article, controls, scenes = [], originals = [];
  let track, frame, observer, raf = 0, resizePending = false, savedPosition = null;
  let enabled = false, running = false, media;
  let designId = 'magazine';
  let pinTop = 0, anchor = 0, viewport = 0, lastWidth = 0, lastLabel = -1;

  function capture() {
    if (!running) {
      const nodes = collectStoryNodes(main?.querySelector('#preview-canvas > .invitation'));
      if (!nodes.length) return null;
      const found = nodes.findIndex(node => node.getBoundingClientRect().bottom > pinTop + 20);
      const index = found < 0 ? nodes.length - 1 : found;
      return { key: sceneKey(nodes[index], index), index, fraction: 0, pinned: nodes[0].getBoundingClientRect().top <= pinTop + 2 && nodes.at(-1).getBoundingClientRect().bottom >= pinTop };
    }
    if (!frame || frame.index < 0) return null;
    const segment = track.segments[frame.index];
    return { key: scenes[frame.index].key, index: frame.index, fraction: frame.local / segment.duration, pinned: window.scrollY >= anchor - 2 && window.scrollY <= anchor + track.distance + 2 };
  }
  function positionIndex(position) {
    const index = scenes.findIndex(scene => scene.key === position?.key);
    return index < 0 ? Math.min(position?.index || 0, scenes.length - 1) : index;
  }
  function schedule(measure = false) {
    if (!running) return;
    resizePending ||= measure;
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0;
      if (!running || !main?.isConnected) return;
      if (resizePending) { resizePending = false; measureTrack(); }
      paint();
    });
  }
  function onScroll() { schedule(); }
  function onResize() { if (!savedPosition) savedPosition = capture(); schedule(true); }

  function measureTrack() {
    const toolbar = main.querySelector('.preview-device-toolbar');
    const bottom = main.querySelector('.mobile-preview-actions');
    const availableHeight = Math.min(window.innerHeight, window.visualViewport?.height || window.innerHeight);
    pinTop = parseFloat(getComputedStyle(toolbar).top) + toolbar.offsetHeight + 8;
    const bottomSpace = getComputedStyle(bottom).display === 'none' ? 12 : bottom.offsetHeight + 26;
    const frameStyle = getComputedStyle(stage);
    const chrome = ['.device-statusbar', '.device-homebar'].reduce((height, selector) => height + stage.querySelector(selector).offsetHeight, controls.offsetHeight)
      + parseFloat(frameStyle.paddingTop) + parseFloat(frameStyle.paddingBottom);
    viewport = Math.max(160, Math.min(canvas.clientWidth * 1.85, availableHeight - pinTop - bottomSpace - chrome));
    main.style.setProperty('--story-pin-top', `${pinTop}px`);
    main.style.setProperty('--story-screen-height', `${viewport}px`);
    const heights = scenes.map(scene => scene.node.offsetHeight);
    const holds = scenes.map(({ node }) => {
      const value = node.dataset.storyHold?.trim();
      return value && /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) ? Number(value) : undefined;
    });
    track = buildStoryTrack(heights, viewport, holds);
    main.style.setProperty('--story-track-height', `${track.distance + viewport + chrome}px`);
    anchor = layout.getBoundingClientRect().top + window.scrollY - pinTop;
    lastWidth = canvas.clientWidth;
    if (savedPosition?.pinned) {
      window.scrollTo({ top: Math.max(0, anchor + storyDistanceAt(track, positionIndex(savedPosition), savedPosition.fraction)), behavior: 'instant' });
    }
    savedPosition = null;
  }
  function showScene(scene, shown, interactive) {
    scene.node.style.visibility = shown ? 'visible' : 'hidden';
    scene.node.inert = !interactive;
    scene.node.setAttribute('aria-hidden', String(!interactive));
    if (shown) scene.node.querySelectorAll('img[loading="lazy"]').forEach(image => { image.loading = 'eager'; });
  }
  function paint() {
    if (!track?.segments.length) return;
    frame = getStoryFrame(track, window.scrollY - anchor);
    const selected = frame.transition >= .5 && frame.nextIndex !== null ? frame.nextIndex : frame.index;
    const focused = document.activeElement;
    let retireFocus = false;
    scenes.forEach((scene, index) => {
      const current = index === frame.index;
      const next = index === frame.nextIndex && frame.transition > 0;
      if (index !== selected && scene.node.contains(focused)) retireFocus = true;
      showScene(scene, current || next, index === selected);
      if (!current && !next) return;
      const values = storyMotion(designId, { current, transition: frame.transition, progress: current ? frame.sceneProgress : 0, panY: current ? frame.panY : 0, width: lastWidth, height: viewport });
      for (const [name, value] of Object.entries(values)) scene.node.style.setProperty(name, value);
      scene.node.style.zIndex = current ? '1' : '2';
    });
    controls.style.setProperty('--story-progress', `${frame.progress * 100}%`);
    if (selected !== lastLabel) {
      lastLabel = selected;
      controls.querySelector('[data-story-counter]').textContent = `${String(selected + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}`;
      controls.querySelector('[data-story-label]').textContent = LABELS[scenes[selected].key] || `이야기 ${selected + 1}`;
      controls.querySelector('[data-story-step="-1"]').disabled = selected === 0;
      controls.querySelector('[data-story-step="1"]').disabled = selected === scenes.length - 1;
    }
    if (retireFocus) controls.querySelector(`[data-story-step="${selected === scenes.length - 1 ? '-1' : '1'}"]`).focus({ preventScroll: true });
    main.dataset.storyScene = scenes[selected].key;
  }
  function revealFocus(event) {
    const index = scenes.findIndex(scene => scene.node.contains(event.target));
    if (index < 0 || !running) return;
    const scene = scenes[index].node, segment = track.segments[index];
    if (frame.transition) {
      // Page turns distort bounding rectangles. Settle the focused page before
      // measuring its control, retaining the outgoing page's reading offset.
      const pan = frame.index === index ? -frame.panY : 0;
      window.scrollTo({ top: Math.max(0, anchor + segment.start + segment.hold + pan), behavior: 'instant' });
      paint();
    }
    const scale = Number(scene.style.getPropertyValue('--scene-scale')) || 1;
    const sceneBox = scene.getBoundingClientRect(), focusBox = event.target.getBoundingClientRect();
    const top = (focusBox.top - sceneBox.top) / scale, bottom = (focusBox.bottom - sceneBox.top) / scale;
    const currentPan = frame.index === index ? -frame.panY : 0;
    if (top >= currentPan && bottom <= currentPan + viewport) return;
    const pan = Math.max(0, Math.min(segment.pan, top < currentPan ? top - 12 : bottom - viewport + 12));
    window.scrollTo({ top: Math.max(0, anchor + segment.start + segment.hold + pan), behavior: 'instant' });
    paint();
  }
  function step(event) {
    const button = event.target.closest('[data-story-step]');
    if (!button || !running) return;
    const next = Math.max(0, Math.min(scenes.length - 1, lastLabel + Number(button.dataset.storyStep)));
    window.scrollTo({ top: Math.max(0, anchor + storyDistanceAt(track, next)), behavior: 'instant' });
    schedule();
  }
  function mediaChanged() {
    const target = main, position = capture(), requested = enabled, templateId = designId;
    mount(target, { enabled: requested, restore: position, templateId });
  }
  function restoreLinear(position) {
    if (!position?.pinned) return;
    const target = main;
    requestAnimationFrame(() => {
      if (main !== target || !target.isConnected || running) return;
      const nodes = collectStoryNodes(target.querySelector('#preview-canvas > .invitation'));
      const node = nodes.find((item, index) => sceneKey(item, index) === position.key) || nodes[Math.min(position.index, nodes.length - 1)];
      if (node) window.scrollTo({ top: node.getBoundingClientRect().top + window.scrollY - pinTop, behavior: 'instant' });
    });
  }
  function mount(target, options = {}) {
    dispose();
    if (!target?.isConnected) return false;
    main = target; enabled = !!options.enabled; designId = options.templateId || 'magazine';
    main.dataset.storyDesign = designId;
    main.dataset.scrollStory = 'off';
    if (!enabled) { restoreLinear(options.restore); return false; }
    media = matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', mediaChanged);
    if (media.matches) { main.dataset.scrollStory = 'reduced'; restoreLinear(options.restore); return false; }
    layout = main.querySelector('.preview-layout'); stage = main.querySelector('.preview-stage');
    canvas = main.querySelector('#preview-canvas'); article = canvas?.querySelector(':scope > .invitation');
    if (!article || !layout || !stage) return false;
    scenes = collectStoryNodes(article).map((node, index) => ({ node, key: sceneKey(node, index) }));
    if (!scenes.length) return false;
    originals = scenes.map(({node}) => ({ style: node.getAttribute('style'), hidden: node.getAttribute('aria-hidden'), inert: node.inert }));
    scenes.forEach(({node,key}) => { node.classList.add('scroll-scene'); node.dataset.scrollScene = key; });
    article.querySelectorAll('.will-reveal').forEach(node => node.classList.remove('will-reveal'));
    controls = document.createElement('nav'); controls.className = 'story-controls'; controls.setAttribute('aria-label', '스크롤 이야기 장면 이동');
    controls.innerHTML = '<button type="button" data-story-step="-1" aria-label="이전 장면">←</button><div><span data-story-counter></span><span data-story-label aria-live="polite"></span></div><button type="button" data-story-step="1" aria-label="다음 장면">→</button><span class="story-progress" aria-hidden="true"><i></i></span>';
    stage.insertBefore(controls, stage.querySelector('.device-homebar'));
    controls.addEventListener('click', step);
    article.addEventListener('focusin', revealFocus);
    main.dataset.scrollStory = 'on'; running = true; savedPosition = options.restore || null;
    measureTrack(); paint();
    observer = new ResizeObserver(() => onResize());
    scenes.forEach(({node}) => observer.observe(node));
    observer.observe(main.querySelector('.preview-device-toolbar'));
    observer.observe(main.querySelector('.mobile-preview-actions'));
    observer.observe(canvas);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.visualViewport?.addEventListener('resize', onResize, { passive: true });
    document.fonts?.ready.then(() => { if (running && main === target) onResize(); });
    return true;
  }
  function dispose() {
    running = false;
    cancelAnimationFrame(raf); raf = 0; resizePending = false;
    observer?.disconnect(); observer = null;
    media?.removeEventListener('change', mediaChanged); media = null;
    window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize);
    window.visualViewport?.removeEventListener('resize', onResize);
    controls?.removeEventListener('click', step); controls?.remove(); controls = null;
    article?.removeEventListener('focusin', revealFocus);
    scenes.forEach(({node}, index) => {
      node.classList.remove('scroll-scene'); delete node.dataset.scrollScene;
      const original = originals[index];
      if (original.style === null) node.removeAttribute('style'); else node.setAttribute('style', original.style);
      if (original.hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', original.hidden);
      node.inert = original.inert;
    });
    if (main) {
      delete main.dataset.scrollStory; delete main.dataset.storyScene; delete main.dataset.storyDesign;
      ['--story-track-height','--story-pin-top','--story-screen-height'].forEach(name => main.style.removeProperty(name));
    }
    scenes = []; originals = []; main = null; track = null; frame = null; savedPosition = null; lastLabel = -1;
    layout = null; stage = null; canvas = null; article = null;
  }
  return { mount, dispose, capture, refresh: onResize, get active() { return running; } };
}
