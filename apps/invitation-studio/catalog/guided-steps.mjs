/** Editor-only guidance. Never saves a choice or modifies the invitation itself. */
const DEFAULT_GLOBAL_KEYS = Object.freeze(['palette', 'font', 'textSize', 'lineSpace', 'photoTone', 'motion', 'spacing', 'divider']);
const DEFAULT_SECTION_KEYS = Object.freeze({
  invitation: 'intro', 'wedding-day': 'date', location: 'arrival', 'our-story': 'story',
  gallery: 'album', accounts: 'gifting', guestbook: 'wishes', 'day-pass': 'dayPass',
  'guest-guide': 'guestGuide', 'day-checklist': 'checklist', keepsake: 'keepsake',
  promises: 'promiseStyle', 'couple-notes': 'noteStyle', 'thank-you': 'thanksStyle',
});
const DEFAULT_DETAILS = Object.freeze({ cover: ['coverFocus'], date: ['calendarMark'], album: ['albumColumns', 'albumRatio'] });
const OPTIONAL_IDS = new Set(['day-pass', 'guest-guide', 'day-checklist', 'keepsake', 'promises', 'couple-notes', 'thank-you']);

/**
 * Follow the actual reading order, not the option catalogue's declaration order.
 * Pass the catalogue's own maps so future choices can join without duplicating them.
 * extraSteps are editor-owned destinations (for example content), never URL input.
 */
export function resolveGuidedSteps(composition = {}, {
  globalKeys = DEFAULT_GLOBAL_KEYS, sectionKeys = DEFAULT_SECTION_KEYS,
  detailChildren = DEFAULT_DETAILS, extraSteps = [], allowedKeys,
} = {}) {
  const steps = [], seen = new Set(), extras = new Set(Array.isArray(composition.extras) ? composition.extras : []);
  const allow = allowedKeys ? new Set(allowedKeys) : null;
  function add(key, tab) {
    if (typeof key !== 'string' || !key || seen.has(key) || (allow && !allow.has(key))) return;
    seen.add(key); steps.push({ key, tab });
  }
  function scene(key) {
    add(key, 'scenes');
    for (const child of detailChildren[key] || []) {
      if (['albumColumns', 'albumRatio'].includes(child) && !['grid', 'masonry'].includes(composition.album)) continue;
      add(child, 'scenes');
    }
  }
  for (const key of globalKeys) add(key, 'style');
  scene('cover'); scene('opening');
  for (const id of Array.isArray(composition.order) ? composition.order : []) {
    if (OPTIONAL_IDS.has(id) && !extras.has(id)) continue;
    if (Object.hasOwn(sectionKeys, id)) scene(sectionKeys[id]);
  }
  scene('ending'); scene('navigation');
  for (const step of extraSteps) if (step && typeof step.tab === 'string' && step.tab) add(step.key, step.tab);
  return steps;
}

/** Pure button state; switching tabs never leaves a hidden item as the current step. */
export function guidedPosition(steps, { tab, key } = {}) {
  const index = steps.findIndex(step => step.tab === tab && step.key === key);
  if (index >= 0) return {
    index, total: steps.length, current: steps[index], previous: steps[index - 1] || null,
    next: steps[index + 1] || null, finish: index === steps.length - 1,
  };
  const first = steps.findIndex(step => step.tab === tab);
  return {
    index: -1, total: steps.length, current: null,
    previous: first > 0 ? steps[first - 1] : null,
    next: first >= 0 ? steps[first] : null, finish: false,
  };
}

/**
 * Persistent native buttons: the host opens rows and moves its own scroll container.
 * refresh() only updates this small navigation, preserving all text/photo form drafts.
 */
export function mountGuidedSteps({ container, readState, onOpen, onFinish, labels = {}, config = {} }) {
  if (!container || typeof readState !== 'function' || typeof onOpen !== 'function') throw new TypeError('Guided steps require a container, state reader, and opening callback.');
  const doc = container.ownerDocument, group = doc.createElement('nav');
  group.className = 'guided-steps'; group.setAttribute('aria-label', '차례대로 설정하기');
  const copy = doc.createElement('div'); copy.className = 'guided-copy';
  const progress = doc.createElement('span'); progress.className = 'guided-progress';
  const title = doc.createElement('strong'); title.className = 'guided-title';
  const hint = doc.createElement('span'); hint.className = 'guided-hint';
  hint.textContent = '선택은 바로 보여요. 다음을 누르면 이어서 골라요.';
  copy.append(progress, title, hint);
  const actions = doc.createElement('div'); actions.className = 'guided-actions';
  const previous = doc.createElement('button'), next = doc.createElement('button');
  previous.type = next.type = 'button'; previous.className = 'guided-previous'; next.className = 'guided-next';
  previous.textContent = '← 이전';
  const status = doc.createElement('span'); status.className = 'guided-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  actions.append(previous, next); group.append(copy, actions, status); container.append(group);
  let disposed = false;
  const label = step => labels[step?.key] || step?.key || '';
  function position() {
    const state = readState() || {};
    const options = typeof config === 'function' ? config(state) : config;
    return guidedPosition(resolveGuidedSteps(state.composition, options), state);
  }
  function refresh() {
    if (disposed) return;
    const value = position();
    group.hidden = !value.current && !value.next;
    progress.textContent = value.current ? `${value.index + 1} / ${value.total}` : '하나씩 골라 보기';
    title.textContent = value.current ? label(value.current) : value.next ? `${label(value.next)}부터 시작해요` : '';
    previous.disabled = !value.previous;
    previous.setAttribute('aria-label', value.previous ? `이전 항목: ${label(value.previous)}` : '이전 항목 없음');
    next.disabled = !value.next && !(value.finish && typeof onFinish === 'function');
    next.textContent = value.finish ? '조합 보관하기 ＋' : value.current ? '다음 →' : '시작하기 →';
    next.setAttribute('aria-label', value.finish ? '이 조합을 보관할 이름과 메모 작성하기' : value.next ? `다음 항목: ${label(value.next)}` : '다음 항목 없음');
    next.title = value.finish ? '이름과 메모를 적고 직접 저장해요.' : value.next ? `다음 · ${label(value.next)}` : '';
  }
  function move(direction) {
    if (disposed) return;
    const value = position(), target = direction === 'previous' ? value.previous : value.next;
    if (target) {
      onOpen({ ...target });
      status.textContent = `${label(target)} 항목으로 이동했어요.`;
    } else if (direction === 'next' && value.finish && typeof onFinish === 'function') {
      onFinish(); status.textContent = '이름과 메모를 남기고 조합을 보관해 주세요.';
    }
    refresh();
  }
  const back = () => move('previous'), forward = () => move('next');
  previous.addEventListener('click', back); next.addEventListener('click', forward);
  refresh();
  return {
    refresh,
    destroy() { if (disposed) return; disposed = true; previous.removeEventListener('click', back); next.removeEventListener('click', forward); group.remove(); },
  };
}
