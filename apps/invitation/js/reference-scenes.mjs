import { buildStoryTrack, getStoryFrame, storyDistanceAt } from './scroll-story-core.mjs?v=20260915-personal-invitation';
import { collectReferenceScenes, referenceSceneKey, referenceSceneMotion, referenceTreatment } from './reference-scenes-core.mjs?v=20260915-personal-invitation';

const properties = ['--reference-pin-top', '--reference-screen-height', '--reference-track-height'];
const labels = { cover: '초대의 시작', greeting: '소중한 분들께', quote: '우리의 약속', profiles: '두 사람의 소개', family: '함께하는 두 가족', date: '결혼하는 날', 'date-poster': '우리의 날짜', 'date-calendar': '그날의 약속', story: '우리의 이야기', about: '두 사람을 소개해요', timeline: '함께 걸어온 시간', gallery: '우리의 순간들', directions: '오시는 길', accounts: '감사의 마음', rsvp: '함께해 주세요', guestbook: '축하의 한마디', information: '당일 안내', ending: '오래도록, 함께', 'ending-photo': '함께한 순간', 'ending-copy': '오래도록, 함께' };
const number = value => Number.parseFloat(value) || 0;

/** One bounded stage follows native document scroll; every long scene is read in full. */
export function createReferenceScenes() {
  let main, article, layout, stage, canvas, controls, observer, onFrame;
  let scenes = [], groups = [], originals = [], decorations = [], savedMain;
  let track = null, frame = null, id = '', anchor = 0, pinTop = 0, contentTop = 0, viewport = 0;
  let running = false, raf = 0, generation = 0, pendingMeasure = false, position = null, lastSelected = -1, settledMount = false;

  function capture() {
    if (!running || !frame || !track) return null;
    const segment = track.segments[frame.index];
    return {
      referenceScenes: true, templateId: id, key: scenes[frame.index].key, index: frame.index,
      fraction: frame.local / segment.duration, readOffset: -frame.panY,
      phase: frame.transition > 0 ? 'transition' : frame.local <= segment.hold ? 'hold' : 'read',
      phaseFraction: frame.transition > 0 ? (frame.local - segment.hold - segment.pan) / segment.transition : frame.local / segment.hold,
      offset: contentTop + frame.panY, y: window.scrollY,
      pinned: window.scrollY >= anchor - 2 && window.scrollY <= anchor + track.distance + 2,
    };
  }
  function indexAt(saved) {
    const found = scenes.findIndex(scene => scene.key === saved?.key);
    return found >= 0 ? found : Math.max(0, Math.min(scenes.length - 1, saved?.index || 0));
  }
  function restore(saved) {
    if (!saved || saved.templateId && saved.templateId !== id) return;
    if (!saved.pinned) {
      if (Number.isFinite(saved.y)) window.scrollTo({ top: Math.max(0, saved.y), behavior: 'instant' });
      return;
    }
    const index = indexAt(saved), segment = track.segments[index];
    let local = 0;
    if (saved.referenceScenes) {
      if (saved.phase === 'transition') local = segment.hold + segment.pan + segment.transition * Math.max(0, Math.min(1, saved.phaseFraction || 0));
      else if (saved.phase === 'hold') local = segment.hold * Math.max(0, Math.min(1, saved.phaseFraction || 0));
      else local = segment.hold + Math.max(0, Math.min(segment.pan, saved.readOffset || 0));
    } else {
      local = segment.hold + Math.max(0, Math.min(segment.pan, contentTop - (saved.offset || 0)));
    }
    window.scrollTo({ top: Math.max(0, anchor + segment.start + local), behavior: 'instant' });
  }
  function measure() {
    const toolbar = main.querySelector('.preview-device-toolbar'), bottom = main.querySelector('.mobile-preview-actions');
    const available = Math.min(window.innerHeight, window.visualViewport?.height || window.innerHeight);
    pinTop = (toolbar ? number(getComputedStyle(toolbar).top) + toolbar.offsetHeight : 0) + 8;
    const bottomSpace = bottom && getComputedStyle(bottom).display !== 'none' ? bottom.offsetHeight + 26 : 12;
    const style = getComputedStyle(stage), padding = number(style.paddingTop) + number(style.paddingBottom);
    const statusHeight = stage.querySelector('.device-statusbar')?.offsetHeight || 0;
    const chrome = statusHeight + (stage.querySelector('.device-homebar')?.offsetHeight || 0) + controls.offsetHeight + padding;
    viewport = Math.max(160, Math.min(canvas.clientWidth * 1.85, available - pinTop - bottomSpace - chrome));
    contentTop = pinTop + statusHeight + number(style.paddingTop);
    main.style.setProperty('--reference-pin-top', `${pinTop}px`);
    main.style.setProperty('--reference-screen-height', `${viewport}px`);
    track = buildStoryTrack(scenes.map(scene => scene.node.offsetHeight), viewport, scenes.map((_, index) => index === 0 ? .7 : .32));
    main.style.setProperty('--reference-track-height', `${track.distance + viewport + chrome}px`);
    anchor = layout.getBoundingClientRect().top + window.scrollY - pinTop;
    restore(position); position = null;
  }
  function paint() {
    if (!track?.segments.length) return;
    frame = getStoryFrame(track, window.scrollY - anchor);
    if (frame.transition < 1e-9) frame.transition = 0;
    const selected = frame.transition >= .5 && frame.nextIndex !== null ? frame.nextIndex : frame.index;
    const focused = document.activeElement;
    let retireFocus = false;
    scenes.forEach((scene, index) => {
      const current = index === frame.index, next = index === frame.nextIndex && frame.transition > 0;
      const shown = current || next, interactive = index === selected;
      if (!interactive && scene.node.contains(focused)) retireFocus = true;
      scene.node.style.visibility = shown ? 'visible' : 'hidden';
      scene.node.inert = !interactive;
      scene.node.setAttribute('aria-hidden', String(!interactive));
      if (!shown) return;
      scene.node.querySelectorAll('img[loading="lazy"]').forEach(image => { image.loading = 'eager'; });
      const values = referenceSceneMotion(id, { current, transition: frame.transition, progress: current ? frame.sceneProgress : 0, panY: current ? frame.panY : 0, height: viewport });
      Object.entries(values).forEach(([name, value]) => scene.node.style.setProperty(name, value));
      scene.node.style.zIndex = current ? '1' : '2';
    });
    controls.style.setProperty('--story-progress', `${frame.progress * 100}%`);
    if (selected !== lastSelected) {
      lastSelected = selected;
      controls.querySelector('[data-story-counter]').textContent = `${String(selected + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}`;
      controls.querySelector('[data-story-label]').textContent = scenes[selected].label;
      controls.querySelector('[data-reference-step="-1"]').disabled = selected === 0;
      controls.querySelector('[data-reference-step="1"]').disabled = selected === scenes.length - 1;
    }
    main.dataset.referenceScene = scenes[selected].key;
    if (retireFocus) controls.querySelector(`[data-reference-step="${selected === scenes.length - 1 ? '-1' : '1'}"]`).focus({ preventScroll: true });
    if (settledMount) onFrame?.({ index: frame.index, key: scenes[selected].key, selected, coverPassed: frame.index > 0 || frame.transition > 0 });
  }
  function schedule(measureAgain = false) {
    if (!running) return;
    pendingMeasure ||= measureAgain;
    if (raf) return;
    const token = generation;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!running || token !== generation || !main?.isConnected) return;
      if (pendingMeasure) { pendingMeasure = false; measure(); }
      paint();
    });
  }
  function scroll() { settledMount = true; schedule(); }
  function refresh() { if (!position && settledMount) position = capture(); schedule(true); }
  function step(event) {
    const button = event.target.closest('[data-reference-step]');
    if (!button || !running || button.disabled) return;
    const delta = Number(button.dataset.referenceStep);
    if (delta !== -1 && delta !== 1) return;
    const index = Math.max(0, Math.min(scenes.length - 1, lastSelected + delta));
    settledMount = true;
    window.scrollTo({ top: Math.max(0, anchor + storyDistanceAt(track, index)), behavior: 'instant' });
    paint();
  }
  function focus(event) {
    if (!running) return;
    const index = scenes.findIndex(scene => scene.node.contains(event.target));
    if (index < 0) return;
    settledMount = true;
    const segment = track.segments[index];
    let pan = frame.index === index ? -frame.panY : 0;
    if (frame.transition > 0 || frame.index !== index) {
      window.scrollTo({ top: Math.max(0, anchor + segment.start + segment.hold + pan), behavior: 'instant' });
      paint();
    }
    const bounds = scenes[index].node.getBoundingClientRect(), target = event.target.getBoundingClientRect();
    const top = target.top - bounds.top, bottom = target.bottom - bounds.top;
    if (top >= pan && bottom <= pan + viewport) return;
    pan = Math.max(0, Math.min(segment.pan, top < pan ? top - 12 : bottom - viewport + 12));
    window.scrollTo({ top: Math.max(0, anchor + segment.start + segment.hold + pan), behavior: 'instant' });
    paint();
  }
  function mount(target, options = {}) {
    dispose();
    if (!target?.isConnected || typeof ResizeObserver !== 'function') return false;
    const content = target.querySelector('#preview-canvas > .invitation');
    const foundLayout = target.querySelector('.preview-layout'), foundStage = target.querySelector('.preview-stage'), foundCanvas = target.querySelector('#preview-canvas');
    if (!content || !foundLayout || !foundStage || !foundCanvas) return false;
    const collected = collectReferenceScenes(content);
    if (!collected.nodes.length) return false;
    main = target; article = content; layout = foundLayout; stage = foundStage; canvas = foundCanvas;
    id = options.templateId || 'reference'; onFrame = options.onFrame;
    savedMain = {
      datasets: Object.fromEntries(['referenceScenes', 'referenceScene', 'referenceTreatment', 'scrollStory'].map(key => [key, main.dataset[key]])),
      styles: properties.map(name => [name, main.style.getPropertyValue(name), main.style.getPropertyPriority(name)]),
    };
    groups = collected.groups.map(node => ({ node, grouped: node.classList.contains('ref-scene-group') }));
    groups.forEach(({ node }) => node.classList.add('ref-scene-group'));
    scenes = collected.nodes.map((node, index) => {
      const key = referenceSceneKey(node, index, id), shortKey = key.startsWith(`${id}-`) ? key.slice(id.length + 1) : node.dataset.section;
      const label = labels[shortKey] || labels[node.dataset.section] || node.querySelector('h2')?.textContent?.trim() || `이야기 ${index + 1}`;
      return { node, key, label };
    });
    originals = scenes.map(({ node }) => ({ style: node.getAttribute('style'), hidden: node.getAttribute('aria-hidden'), inert: node.inert, key: node.dataset.referenceScene, scene: node.classList.contains('ref-scene') }));
    scenes.forEach(({ node, key }) => {
      const background = getComputedStyle(node).backgroundColor;
      node.style.setProperty('--ref-scene-background', background && !['transparent', 'rgba(0, 0, 0, 0)'].includes(background) ? background : 'var(--paper)');
      node.classList.add('ref-scene'); node.dataset.referenceScene = key;
    });
    if (referenceTreatment(id) === 'story') scenes.filter(({ node, key }) => node.dataset.section === 'story' || /timeline/.test(key)).forEach(({ node }) => {
      const line = document.createElement('span'); line.className = 'ref-scene-guide'; line.setAttribute('aria-hidden', 'true'); line.innerHTML = '<i></i>'; node.append(line); decorations.push(line);
    });
    controls = document.createElement('nav'); controls.className = 'story-controls ref-scene-controls'; controls.setAttribute('aria-label', '청첩장 장면 이동');
    controls.innerHTML = '<button type="button" data-reference-step="-1" aria-label="이전 장면">←</button><div><span data-story-counter></span><span data-story-label aria-live="polite"></span></div><button type="button" data-reference-step="1" aria-label="다음 장면">→</button><span class="story-progress" aria-hidden="true"><i></i></span>';
    stage.insertBefore(controls, stage.querySelector('.device-homebar'));
    controls.addEventListener('click', step); article.addEventListener('focusin', focus);
    main.dataset.referenceScenes = 'on'; main.dataset.referenceTreatment = referenceTreatment(id); main.dataset.scrollStory = 'reference';
    running = true; position = options.restore || null; settledMount = Boolean(options.restore); measure(); paint();
    const token = generation;
    observer = new ResizeObserver(() => { if (running && token === generation) refresh(); });
    scenes.forEach(({ node }) => observer.observe(node));
    [canvas, main.querySelector('.preview-device-toolbar'), main.querySelector('.mobile-preview-actions')].filter(Boolean).forEach(node => observer.observe(node));
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', refresh, { passive: true });
    window.visualViewport?.addEventListener('resize', refresh, { passive: true });
    document.fonts?.ready.then(() => { if (running && token === generation) refresh(); });
    return true;
  }
  function dispose() {
    running = false; generation++;
    cancelAnimationFrame(raf); raf = 0; pendingMeasure = false;
    observer?.disconnect(); observer = null;
    window.removeEventListener('scroll', scroll); window.removeEventListener('resize', refresh);
    window.visualViewport?.removeEventListener('resize', refresh);
    article?.removeEventListener('focusin', focus); controls?.removeEventListener('click', step); controls?.remove(); controls = null;
    decorations.forEach(node => node.remove()); decorations = [];
    scenes.forEach(({ node }, index) => {
      const original = originals[index];
      if (!original.scene) node.classList.remove('ref-scene');
      if (original.key === undefined) delete node.dataset.referenceScene; else node.dataset.referenceScene = original.key;
      if (original.style === null) node.removeAttribute('style'); else node.setAttribute('style', original.style);
      if (original.hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', original.hidden);
      node.inert = original.inert;
    });
    groups.forEach(({ node, grouped }) => { if (!grouped) node.classList.remove('ref-scene-group'); });
    if (main && savedMain) {
      Object.entries(savedMain.datasets).forEach(([key, value]) => { if (value === undefined) delete main.dataset[key]; else main.dataset[key] = value; });
      savedMain.styles.forEach(([name, value, priority]) => { if (value) main.style.setProperty(name, value, priority); else main.style.removeProperty(name); });
    }
    main = null; article = null; layout = null; stage = null; canvas = null; onFrame = null;
    scenes = []; groups = []; originals = []; track = null; frame = null; position = null; savedMain = null; lastSelected = -1; settledMount = false;
  }
  return { mount, capture, dispose, refresh, get active() { return running; } };
}
