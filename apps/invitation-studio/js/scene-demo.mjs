import { CHOICES, CHOICE_KEYS, SECTION_IDS } from './composition.mjs';
import { normalizeMotionValue } from './scroll-effects.mjs';

const names = Object.freeze({ palette: '색감', font: '글씨체', motion: '공통 스크롤', spacing: '장면 사이 여백', divider: '장면 구분', cover: '첫 화면', opening: '첫 손글씨', intro: '초대글 · 가족 소개', date: '예식 날짜', story: '우리의 이야기', album: '사진첩', arrival: '오시는 길', gifting: '마음 전하실 곳', wishes: '축하의 편지', navigation: '빠른 메뉴', guestGuide: '하객 안내', checklist: '당일 체크리스트', keepsake: '간직하는 초대', promiseStyle: '우리의 약속', noteStyle: '우리의 한 문장', thanksStyle: '감사 인사' });
const interactions = new Set(['album', 'arrival', 'gifting', 'wishes']);
const interactionTargets = Object.freeze({ album: '.album-feature', arrival: '.journey', gifting: '.account-panel-frame', wishes: '#guestbook-write' });
const finite = value => Number.isFinite(value) ? value : 0;
const clamp = (value, end) => Math.max(0, Math.min(Math.max(0, finite(end)), finite(value)));

/** Stable scene coordinates, independent of the selected effect and its transforms. */
export function demoRoute({ key, top = 0, height = 0, nextTop, interactionTop, viewport = 800, maxScroll = Infinity, speed = 1 } = {}) {
  const limit = Number.isFinite(maxScroll) ? maxScroll : Number.MAX_SAFE_INTEGER;
  const at = value => clamp(value, limit), view = Math.max(1, finite(viewport));
  const resting = at(top - 20);
  if (['palette', 'font', 'spacing', 'divider'].includes(key)) return { start: resting, end: resting, duration: 0, interactionAt: null };
  if (key === 'opening') return { start: at(top), end: at(top), duration: 3000, interactionAt: null };
  if (key === 'cover') return { start: at(top), end: at(top + Math.min(Math.max(height, view) * .65, view * .65)), duration: 2600, interactionAt: null };
  if (key === 'motion') return { start: at(top - view * .82), end: at((Number.isFinite(nextTop) ? nextTop : top + height) - 20), duration: 2600 / normalizeMotionValue(speed), interactionAt: null };
  if (key === 'navigation') return { start: resting, end: at((Number.isFinite(nextTop) ? nextTop : top + height) - 20), duration: 2600, interactionAt: null };
  return {
    start: at(top - view * .78),
    end: interactions.has(key) && Number.isFinite(interactionTop) ? at(Math.max(top - 20, interactionTop - Math.min(view * .28, 150))) : resting,
    duration: interactions.has(key) ? 2900 : 2400,
    interactionAt: interactions.has(key) ? 1600 : null,
  };
}

export function validDemoRequest(request) {
  return Boolean(request && Number.isSafeInteger(request.requestId) && request.requestId >= 0 && CHOICE_KEYS.includes(request.key));
}

/**
 * Editor-only director. It moves only its own viewport and calls narrow controller
 * preview hooks; it never clicks a control, opens a form, touches storage or media.
 * Every request owns a generation so late fonts, queued RAFs and older requests
 * cannot resume after cancellation. Capture-phase cancellation restores demo state
 * before the real user gesture chooses a new value.
 */
export function createSceneDemo({ doc = document, win = window, controller, onState = () => {}, finishOpening = () => {}, replayOpening = () => {} } = {}) {
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const listeners = [];
  let current = null, generation = 0, frame = 0, waitTimer = 0, noticeTimer = 0, disposed = false;
  const getController = typeof controller === 'function' ? controller : () => controller;
  const notice = doc.createElement('div'); notice.className = 'studio-demo-notice'; notice.hidden = true;
  notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite'); notice.setAttribute('aria-atomic', 'true');
  const caption = doc.createElement('small'), title = doc.createElement('span'); notice.append(caption, title); doc.body.append(notice);
  const listen = (target, type, callback, options) => { target?.addEventListener?.(type, callback, options); listeners.push(() => target?.removeEventListener?.(type, callback, options)); };
  const cannotMove = () => Boolean(reduced?.matches || doc.documentElement.classList.contains('motion-off'));
  const blocked = () => doc.hidden ? 'hidden' : doc.querySelector('dialog[open]') ? 'dialog' : null;
  function label(request) {
    const composition = getController()?.composition;
    const choice = CHOICES[request.key]?.find(item => item.id === composition?.[request.key]);
    return `${names[request.key]}${choice ? ` · ${choice.label}` : ''}${request.key === 'motion' ? ` · 속도 ${composition.motionSpeed}× · 강도 ${composition.motionStrength}×` : ''}`;
  }
  function emit(request, phase, reason) {
    if (!request) return;
    onState({ requestId: request.requestId, key: request.key, phase, ...(reason ? { reason } : {}) });
    win.clearTimeout(noticeTimer); noticeTimer = 0;
    if (phase === 'cancelled') { notice.hidden = true; return; }
    notice.hidden = false; title.textContent = label(request);
    caption.textContent = phase === 'preparing' ? '장면을 준비하고 있어요' : phase === 'playing' ? '선택한 효과를 보여드려요' : phase === 'blocked' ? '열린 창을 닫고 다시 보기 해주세요' : phase === 'static' ? '현재 모습 · 움직임 없이 확인' : '지금 고른 장면';
    if (!['preparing', 'playing'].includes(phase)) noticeTimer = win.setTimeout(() => { notice.hidden = true; noticeTimer = 0; }, 2200);
  }
  function clearSchedule() {
    if (frame) win.cancelAnimationFrame(frame); frame = 0;
    win.clearTimeout(waitTimer); waitTimer = 0;
  }
  function clean(request) {
    for (const cleanup of [request?.restoreInteraction, request?.restoreScene, request?.stopImageWait]) {
      try { cleanup?.(); } catch { /* One failed visual cleanup must not retain a scroll loop. */ }
    }
    if (request) { request.restoreInteraction = null; request.restoreScene = null; request.stopImageWait = null; }
  }
  function cancel(reason = 'stopped') {
    generation++; clearSchedule();
    const request = current; current = null;
    clean(request);
    if (request?.key === 'opening') finishOpening();
    if (request) emit(request, 'cancelled', reason);
  }
  function finish(request, phase = 'complete', reason) {
    if (current !== request) return;
    clearSchedule(); clean(request); current = null;
    if (request.key === 'opening') finishOpening();
    emit(request, phase, reason);
  }
  function move(top) { win.scrollTo({ top, left: win.scrollX || 0, behavior: 'instant' }); }
  function topOf(node) { return win.scrollY + node.getBoundingClientRect().top; }
  function schedule(request, fn) {
    frame = win.requestAnimationFrame(time => {
      frame = 0;
      if (disposed || current !== request || request.generation !== generation) return;
      const reason = blocked();
      if (reason) { cancel(reason); return; }
      if (cannotMove()) { finish(request, 'static', 'motion-reduced'); return; }
      try { fn(time); } catch { finish(request, 'blocked', 'unavailable'); }
    });
  }
  function whenVisibleImagesSettle(request, target, ready) {
    const images = [...(target.querySelectorAll?.('img') || [])].filter(image => {
      if (image.complete) return false;
      const bounds = image.getBoundingClientRect();
      return bounds.bottom > 0 && bounds.top < win.innerHeight;
    }).slice(0, 3);
    if (!images.length) { ready(); return; }
    let pending = images.length, settled = false;
    const removers = [];
    const cleanup = () => { removers.forEach(remove => remove()); win.clearTimeout(waitTimer); waitTimer = 0; };
    const finish = () => {
      if (settled) return;
      settled = true; cleanup(); request.stopImageWait = null;
      if (current === request && request.generation === generation) ready();
    };
    request.stopImageWait = () => { settled = true; cleanup(); };
    for (const image of images) {
      let finished = false;
      const done = () => { if (finished || settled) return; finished = true; if (--pending === 0) finish(); };
      image.addEventListener('load', done); image.addEventListener('error', done);
      removers.push(() => { image.removeEventListener('load', done); image.removeEventListener('error', done); });
      if (image.complete) done();
    }
    if (!settled) waitTimer = win.setTimeout(finish, 800);
  }
  function run(request, target) {
    if (disposed || current !== request) return;
    const reason = blocked();
    if (reason) { finish(request, 'blocked', reason); return; }
    const sibling = [...doc.querySelectorAll('main.paper > section[id]')].filter(node => !node.hidden);
    const next = sibling[sibling.indexOf(target) + 1];
    const interactionSelector = request.key === 'album' && getController()?.composition?.album === 'grid' ? '#gallery-grid' : interactionTargets[request.key];
    const interaction = interactionSelector ? target.querySelector(interactionSelector) : null;
    const interactionBounds = interaction?.getBoundingClientRect();
    const route = demoRoute({ key: request.key, top: topOf(target), height: target.getBoundingClientRect().height, nextTop: next ? topOf(next) : undefined, interactionTop: interactionBounds?.height > 0 ? topOf(interaction) : undefined, viewport: win.innerHeight, maxScroll: Math.max(0, doc.documentElement.scrollHeight - win.innerHeight), speed: getController()?.composition?.motionSpeed });
    const statically = cannotMove() || route.duration === 0;
    move(statically ? Math.max(0, topOf(target) - 20) : route.start);
    getController()?.refresh?.();
    if (statically) { finish(request, 'static', cannotMove() ? 'motion-reduced' : 'appearance'); return; }
    // Let native scroll listeners paint the destination before their monotonic
    // progress is reset. This prevents a previously read section skipping a demo.
    whenVisibleImagesSettle(request, target, () => schedule(request, () => {
      request.restoreScene = getController()?.prepareDemo?.(request.key);
      if (request.key === 'opening') replayOpening(getController()?.composition?.opening);
      emit(request, 'playing');
      const start = win.performance.now();
      const tick = () => {
        const elapsed = Math.max(0, win.performance.now() - start);
        const travelDuration = route.interactionAt === null ? route.duration : 1450;
        const progress = Math.min(1, elapsed / travelDuration);
        const eased = progress * progress * (3 - 2 * progress);
        if (request.key !== 'opening') move(route.start + (route.end - route.start) * eased);
        if (route.interactionAt !== null && elapsed >= route.interactionAt && !request.interacted) {
          request.interacted = true;
          request.restoreInteraction = getController()?.demoInteraction?.(request.key);
        }
        if (elapsed >= route.duration) { finish(request); return; }
        schedule(request, tick);
      };
      schedule(request, tick);
    }));
  }
  function start(input) {
    if (disposed || !validDemoRequest(input)) return false;
    cancel('superseded');
    const request = { requestId: input.requestId, key: input.key, generation };
    current = request;
    const reason = blocked();
    if (reason) { finish(request, 'blocked', reason); return true; }
    const target = doc.getElementById(SECTION_IDS[request.key]);
    if (!target || target.hidden || !getController()) { finish(request, 'blocked', 'unavailable'); return true; }
    finishOpening(); emit(request, 'preparing');
    let started = false;
    const ready = () => {
      if (started || disposed || current !== request || request.generation !== generation) return;
      started = true; win.clearTimeout(waitTimer); waitTimer = 0;
      run(request, target);
    };
    // Fonts expose their own bounded readiness, but guard unfamiliar controllers
    // too. A late completion can never restart a superseded or cancelled request.
    waitTimer = win.setTimeout(ready, 1800);
    Promise.resolve(getController()?.whenReady).then(ready, ready);
    return true;
  }
  const userInput = event => { if (event.isTrusted !== false) cancel('user-input'); };
  for (const type of ['wheel', 'pointerdown', 'touchstart', 'keydown']) listen(win, type, userInput, { capture: true, passive: true });
  listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel('hidden'); });
  listen(doc, 'lab:dialog-change', () => { if (doc.querySelector('dialog[open]')) cancel('dialog'); });
  listen(doc, 'lab:motion-change', () => { if (cannotMove()) cancel('motion-off'); });
  listen(reduced, 'change', () => { if (reduced.matches) cancel('motion-reduced'); });
  listen(win, 'pagehide', () => cancel('pagehide'));
  return {
    start, cancel,
    destroy() { if (disposed) return; cancel('destroyed'); disposed = true; win.clearTimeout(noticeTimer); noticeTimer = 0; listeners.forEach(fn => fn()); notice.remove(); },
  };
}
