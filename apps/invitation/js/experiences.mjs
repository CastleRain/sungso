// These interactions are a temporary part of viewing an example. They never
// change a design draft, its export, or the couple's saved selection.
export const EXPERIENCE_IDS = Object.freeze(['envelope', 'camera', 'ticket', 'constellation', 'storybook', 'curtain']);

const TOGGLE_ACTIONS = Object.freeze({ envelope: 'open', ticket: 'stamp', storybook: 'unfold', curtain: 'curtain' });
const LABELS = Object.freeze({
  envelope: ['봉투 열기', '봉투 다시 닫기'],
  camera: ['찰칵', '다음 사진 찍기'],
  ticket: ['탑승 확인', '한 번 더'],
  constellation: ['별자리 한 번에 잇기', '별자리 다시 그리기'],
  storybook: ['우리의 이야기 펼치기', '이야기 다시 접기'],
  curtain: ['우리의 첫 장면 열기', '커튼 다시 닫기'],
});

export function initialExperienceState(id) {
  return EXPERIENCE_IDS.includes(id) ? { active: false, shot: 0, stars: [] } : null;
}

/** Pure progression, shared by pointer and native keyboard button activation. */
export function transitionExperience(id, previous, action, detail = {}) {
  const state = previous || initialExperienceState(id);
  if (!state || !EXPERIENCE_IDS.includes(id)) return state;
  if (Object.hasOwn(TOGGLE_ACTIONS, id) && action === TOGGLE_ACTIONS[id]) {
    return { ...state, active: !state.active };
  }
  if (id === 'camera' && action === 'shutter') {
    return { ...state, active: true, shot: state.active ? (state.shot + 1) % (Number.isSafeInteger(detail.photoCount) && detail.photoCount > 0 ? detail.photoCount : 3) : 0 };
  }
  if (id === 'constellation') {
    if (action === 'constellation') return { ...state, active: !state.active, stars: state.active ? [] : [0, 1, 2, 3, 4] };
    if (action === 'star') {
      const index = detail.star;
      if (!Number.isInteger(index) || index < 0 || index > 4 || state.stars.includes(index)) return state;
      const stars = [...state.stars, index].sort((left, right) => left - right);
      return { ...state, stars, active: stars.length === 5 };
    }
  }
  return state;
}

function statusText(id, state) {
  switch (id) {
    case 'envelope': return state.active ? '봉투를 열었어요. 두 사람의 초대장을 만나보세요.' : '봉인을 눌러 두 사람의 초대를 펼쳐보세요.';
    case 'camera': return state.active ? `${state.shot + 1}번째 사진을 꺼냈어요. 다시 누르면 다음 사진이 나와요.` : '셔터를 누르면 두 사람의 순간이 사진으로 나와요.';
    case 'ticket': return state.active ? '탑승 도장을 찍었어요. 함께할 여정에 초대합니다.' : '티켓을 눌러 우리의 다음 여정을 확인해보세요.';
    case 'constellation': return state.active ? '다섯 개의 별이 만나 우리의 별자리가 되었어요.' : state.stars.length ? `다섯 개 중 ${state.stars.length}개의 별을 이었어요. 남은 별도 눌러보세요.` : '별을 하나씩 눌러 두 사람의 별자리를 이어보세요.';
    case 'storybook': return state.active ? '두 사람의 이야기가 펼쳐졌어요. 다음 장도 천천히 내려보세요.' : '책을 펼쳐 두 사람이 함께 쓰는 이야기를 만나보세요.';
    case 'curtain': return state.active ? '커튼이 열렸어요. 두 사람의 첫 장면에 함께해주세요.' : '커튼을 열어 두 사람의 첫 장면을 만나보세요.';
    default: return '';
  }
}

function renderExperience(root, id, state) {
  root.classList.toggle('is-active', state.active);
  if (id === 'camera') {
    root.dataset.shot = String(state.shot);
    root.querySelectorAll('[data-camera-photo]').forEach(photo => { photo.hidden = Number(photo.dataset.cameraPhoto) !== state.shot; });
  }
  root.querySelectorAll('[data-star-line]').forEach(line => {
    const index = Number(line.dataset.starLine);
    line.classList.toggle('is-lit', state.stars.includes(index) && state.stars.includes(index + 1));
  });
  root.querySelectorAll('button[data-experience-action]').forEach(button => {
    if (button.dataset.experienceAction === 'star') {
      const lit = state.stars.includes(Number(button.dataset.star));
      button.classList.toggle('is-lit', lit);
      button.setAttribute('aria-pressed', String(lit));
      return;
    }
    button.setAttribute('aria-pressed', String(state.active));
    const label = state.active ? button.dataset.activeLabel || LABELS[id][1] : button.dataset.idleLabel || LABELS[id][0];
    button.setAttribute('aria-label', label);
    const labelNode = button.querySelector('[data-experience-label]') || button;
    if (labelNode.textContent !== label) labelNode.textContent = label;
  });
  root.querySelectorAll('[data-experience-status]').forEach(status => {
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    const text = statusText(id, state);
    if (status.textContent !== text) status.textContent = text;
  });
}

/**
 * One controller per app instance. mount() replaces listeners and restores the
 * current template's cosmetic state after option rendering. dispose() releases
 * DOM references and timers; state remains available for a later mount().
 */
export function createExperiences({
  reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = timer => clearTimeout(timer),
} = {}) {
  const states = new Map(), roots = new Map(), timers = new Map();
  let container = null, generation = 0;

  function stopFlash(root) {
    if (timers.has(root)) clearTimer(timers.get(root));
    timers.delete(root);
    root.classList.remove('is-flashing');
  }
  function dispose() {
    generation++;
    container?.removeEventListener('click', handleClick);
    for (const root of roots.keys()) stopFlash(root);
    roots.clear();
    container = null;
  }
  function handleClick(event) {
    const button = event.target?.closest?.('button[data-experience-action]') || event.target?.parentElement?.closest?.('button[data-experience-action]');
    if (!button || button.disabled || !container?.contains(button)) return;
    const root = button.closest('[data-experience]'), id = roots.get(root);
    if (!id) return;
    const previous = states.get(id), action = button.dataset.experienceAction;
    // A missing or blank star index must not silently light the first star.
    const rawStar = button.dataset.star;
    const star = rawStar === undefined || rawStar.trim() === '' ? NaN : Number(rawStar);
    const next = transitionExperience(id, previous, action, { star, photoCount: root.querySelectorAll('[data-camera-photo]').length });
    if (next === previous) return;
    states.set(id, next);
    for (const [target, targetId] of roots) {
      if (targetId !== id) continue;
      renderExperience(target, id, next);
      if (id !== 'camera') continue;
      stopFlash(target);
      if (reducedMotion()) continue;
      // Restart the paper animation even when the shutter is pressed rapidly.
      void target.offsetWidth;
      target.classList.add('is-flashing');
      const mountedGeneration = generation;
      const timer = setTimer(() => {
        if (mountedGeneration !== generation || timers.get(target) !== timer) return;
        timers.delete(target);
        if (roots.has(target) && target.isConnected !== false) target.classList.remove('is-flashing');
      }, 1000);
      timers.set(target, timer);
    }
  }
  function mount(nextContainer) {
    dispose();
    if (!nextContainer) return;
    container = nextContainer;
    const candidates = [...container.querySelectorAll('[data-experience]')];
    if (container.matches?.('[data-experience]')) candidates.unshift(container);
    for (const root of candidates) {
      const id = root.dataset.experience;
      if (!EXPERIENCE_IDS.includes(id)) continue;
      if (!states.has(id)) states.set(id, initialExperienceState(id));
      roots.set(root, id);
      if(id === 'camera'){const count=root.querySelectorAll('[data-camera-photo]').length;states.set(id,{...states.get(id),shot:count?states.get(id).shot%count:0});}
      renderExperience(root, id, states.get(id));
    }
    container.addEventListener('click', handleClick);
  }
  return { mount, dispose };
}
