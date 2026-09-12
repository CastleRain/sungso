import { DECISIONS } from './trip-data.mjs';

const SITE_ROOT = new URL('../', import.meta.url);
const STATUS_LABELS = { pending: '미정', candidate: '후보 있음', confirmed: '확인 완료' };
const PIN_KEY = 'sungso_pin_auth';
const PIN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const desktop = window.matchMedia('(min-width: 1280px)');

function hasValidPin() {
  try {
    const saved = JSON.parse(localStorage.getItem(PIN_KEY) || 'null');
    return Number.isFinite(saved?.ts) && Date.now() - saved.ts >= 0 && Date.now() - saved.ts < PIN_MAX_AGE;
  } catch { return false; }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function siteUrl(path) {
  return new URL(path.replace(/^\//, ''), SITE_ROOT).href;
}

function validStatus(value, fallback = 'pending') {
  return Object.hasOwn(STATUS_LABELS, value) ? value : fallback;
}

function startPanel() {
  if (document.getElementById('sg-decisions-host')) return;

  const host = element('aside', 'sg-decisions-host');
  host.id = 'sg-decisions-host';
  host.setAttribute('aria-label', '여행 준비 현황');
  const drawer = element('dialog', 'sg-decisions-dialog');
  drawer.id = 'sg-decisions-drawer';
  drawer.setAttribute('aria-labelledby', 'sg-decisions-heading');
  const toggle = element('button', 'sg-decisions-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-haspopup', 'dialog');
  toggle.setAttribute('aria-controls', drawer.id);
  toggle.setAttribute('aria-expanded', 'false');
  const toggleIcon = element('span', 'sg-toggle-icon', '☷');
  toggleIcon.setAttribute('aria-hidden', 'true');
  const toggleText = element('span', '', '남은 결정');
  const toggleCount = element('span', 'sg-toggle-count', String(DECISIONS.length));
  toggle.append(toggleIcon, toggleText, toggleCount);

  const panel = element('div', 'sg-decisions');
  const header = element('header', 'sg-decisions-header');
  const headingRow = element('div', 'sg-heading-row');
  const eyebrow = element('a', 'sg-eyebrow', 'OUR MARCH · 2027');
  eyebrow.href = siteUrl('travel/');
  const close = element('button', 'sg-decisions-close', '닫기 ×');
  close.type = 'button';
  close.setAttribute('aria-label', '남은 결정 목록 닫기');
  headingRow.append(eyebrow, close);
  const heading = element('h2', 'sg-decisions-heading', '지금 정할 것');
  heading.id = 'sg-decisions-heading';
  const summary = element('p', 'sg-decisions-summary');
  const summaryNumber = element('strong', 'sg-summary-number', String(DECISIONS.length));
  summary.append(summaryNumber, document.createTextNode('개 남았어요'));
  const progress = element('progress', 'sg-decisions-progress');
  progress.max = DECISIONS.length;
  progress.value = 0;
  progress.setAttribute('aria-label', '여행 준비 확인 완료');
  const lead = element('p', 'sg-decisions-lead', '항목을 누르면 정할 곳으로 바로 가요.');
  header.append(headingRow, heading, summary, progress, lead);

  const scroll = element('div', 'sg-decisions-scroll');
  const actorBox = element('div', 'sg-actor-box');
  const actorRow = element('div', 'sg-actor-row');
  const actorLabel = element('label', 'sg-actor-label', '기록할 사람');
  const actor = element('select', 'sg-actor-select');
  actor.id = 'sg-decision-actor';
  actorLabel.htmlFor = actor.id;
  actor.disabled = true;
  for (const name of ['미지정', '성우', '소희']) {
    const option = element('option', '', name);
    option.value = name;
    actor.append(option);
  }
  const actorHelp = element('p', 'sg-actor-help', '이 기기에서 쓸 이름이에요. 본인 인증은 아니에요.');
  actorHelp.id = 'sg-actor-help';
  actor.setAttribute('aria-describedby', actorHelp.id);
  const actorFeedback = element('p', 'sg-actor-feedback');
  actorFeedback.setAttribute('role', 'status');
  actorRow.append(actorLabel, actor);
  actorBox.append(actorRow, actorHelp, actorFeedback);
  scroll.append(actorBox);
  const cards = new Map();
  let current = { data: { decisions: {} }, connection: 'loading', saving: false };
  let saveDecision;

  function decisionValue(item) {
    const saved = current.data?.decisions?.[item.id] || {};
    return { status: validStatus(saved.status, validStatus(item.status)), note: typeof saved.note === 'string' ? saved.note : '' };
  }

  function refreshSaveState(card) {
    card.save.disabled = !saveDecision || current.connection !== 'live' || Boolean(current.saving) || card.busy || !card.dirty;
    card.fieldset.disabled = card.busy;
    card.cancel.disabled = card.busy;
  }

  function resetDraft(card) {
    const value = decisionValue(card.item);
    card.status.value = value.status;
    card.note.value = value.note;
    card.dirty = false;
    card.expectedDecision = null;
    refreshSaveState(card);
  }

  for (const [groupIndex, group] of [DECISIONS.slice(0, 3), DECISIONS.slice(3)].entries()) {
    const groupSection = element('section', 'sg-decision-group');
    const groupHeading = element('h3', 'sg-group-heading', groupIndex ? '함께 채울 것' : '먼저 예약할 것');
    groupHeading.id = `sg-decision-group-${groupIndex}`;
    groupSection.setAttribute('aria-labelledby', groupHeading.id);
    const list = element('ul', 'sg-decisions-list');
    groupSection.append(groupHeading, list);

    group.forEach((item, groupItemIndex) => {
      const row = element('li', 'sg-decision-card');
      const link = element('a', 'sg-decision-link');
      link.href = siteUrl(item.href || `travel/#${item.id}`);
      const number = element('span', 'sg-decision-number', String(groupIndex * 3 + groupItemIndex + 1).padStart(2, '0'));
      number.setAttribute('aria-hidden', 'true');
      const linkContent = element('span', 'sg-decision-link-content');
      const title = element('span', 'sg-decision-title', item.title);
      const detail = element('span', 'sg-decision-detail', item.detail);
      linkContent.append(title, detail);
      const arrow = element('span', 'sg-decision-arrow', '↗');
      arrow.setAttribute('aria-hidden', 'true');
      link.append(number, linkContent, arrow);

      const footer = element('div', 'sg-decision-footer');
      const badge = element('span', 'sg-decision-badge', STATUS_LABELS[validStatus(item.status)]);
      const editor = element('details', 'sg-decision-editor');
      const editToggle = element('summary', 'sg-decision-edit-toggle', '상태·메모');
      editToggle.setAttribute('aria-label', `${item.title} 상태와 메모 수정`);
      const form = element('form', 'sg-decision-form');
      const fieldset = element('fieldset', 'sg-decision-fields');
      const legend = element('legend', 'sg-sr-only', `${item.title} 기록`);
      const statusLabel = element('label', 'sg-field-label', '진행 상태');
      const status = element('select', 'sg-decision-select');
      status.id = `sg-status-${item.id}`;
      statusLabel.htmlFor = status.id;
      Object.entries(STATUS_LABELS).forEach(([value, label]) => {
        const option = element('option', '', label);
        option.value = value;
        status.append(option);
      });
      const noteLabel = element('label', 'sg-field-label', '같이 볼 메모');
      const note = element('textarea', 'sg-decision-note');
      note.id = `sg-note-${item.id}`;
      noteLabel.htmlFor = note.id;
      note.rows = 3;
      note.maxLength = 1000;
      note.placeholder = '다음에 확인할 내용이나 선택 이유';
      const help = element('p', 'sg-field-help', '예약번호·여권·결제 정보는 적지 마세요.');
      help.id = `sg-note-help-${item.id}`;
      note.setAttribute('aria-describedby', help.id);
      fieldset.append(legend, statusLabel, status, noteLabel, note, help);
      const actions = element('div', 'sg-decision-actions');
      const cancel = element('button', 'sg-decision-cancel', '취소');
      cancel.type = 'button';
      const save = element('button', 'sg-decision-save', '저장');
      save.type = 'submit';
      save.disabled = true;
      actions.append(cancel, save);
      const feedback = element('p', 'sg-decision-feedback');
      feedback.setAttribute('role', 'status');
      form.append(fieldset, actions, feedback);
      editor.append(editToggle, form);
      footer.append(badge, editor);
      const savedNote = element('p', 'sg-saved-note');
      savedNote.hidden = true;
      row.append(link, footer, savedNote);
      list.append(row);
      const card = { item, row, link, badge, editor, status, note, fieldset, cancel, save, feedback, savedNote, busy: false, dirty: false, expectedDecision: null };
      cards.set(item.id, card);

      function dirty() {
        const value = decisionValue(item);
        if (!card.dirty) card.expectedDecision = { ...value };
        const original = card.expectedDecision;
        card.dirty = status.value !== original.status || note.value !== original.note;
        if (!card.dirty) resetDraft(card);
        feedback.textContent = card.dirty ? '아직 저장하지 않은 내용이에요.' : '';
        refreshSaveState(card);
      }
      status.addEventListener('change', dirty);
      note.addEventListener('input', dirty);
      cancel.addEventListener('click', () => {
        resetDraft(card);
        feedback.textContent = '';
        editor.open = false;
        editToggle.focus();
      });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (save.disabled) return;
        card.busy = true;
        save.textContent = '저장 중…';
        feedback.textContent = '두 사람이 볼 목록에 저장하고 있어요.';
        refreshSaveState(card);
        try {
          await saveDecision(item.id, { status: status.value, note: note.value }, { ...card.expectedDecision });
          resetDraft(card);
          feedback.textContent = '저장했어요.';
        } catch (error) {
          const reason = error instanceof Error && error.message ? `${error.message} ` : '';
          feedback.textContent = `저장하지 못했어요. ${reason}입력한 내용은 그대로 있어요. 최신 내용을 확인한 뒤 다시 시도해 주세요.`;
        } finally {
          card.busy = false;
          save.textContent = '저장';
          refreshSaveState(card);
        }
      });
    });
    scroll.append(groupSection);
  }

  const connection = element('p', 'sg-decisions-connection', '함께 보는 목록을 불러오는 중…');
  connection.setAttribute('role', 'status');
  const foot = element('footer', 'sg-decisions-bottom');
  const footerLinks = element('nav', 'sg-footer-links');
  footerLinks.setAttribute('aria-label', '홈과 여행 변경 기록');
  const hub = element('a', 'sg-hub-link', '← 홈으로');
  hub.href = SITE_ROOT.href;
  const history = element('a', 'sg-history-link', '변경 기록 ↗');
  history.href = siteUrl('travel/#history');
  footerLinks.append(hub, history);
  foot.append(connection, footerLinks);
  panel.append(header, scroll, foot);
  document.body.append(host, drawer, toggle);
  document.body.classList.add('sg-has-decisions');

  function closeDrawer(restoreFocus = true) {
    if (drawer.open) drawer.close();
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('sg-decisions-open');
    if (restoreFocus && !desktop.matches) toggle.focus();
  }
  function arrangePanel() {
    closeDrawer(false);
    if (desktop.matches) {
      host.append(panel);
      host.hidden = false;
      toggle.hidden = true;
    } else {
      drawer.append(panel);
      host.hidden = true;
      toggle.hidden = false;
    }
  }
  toggle.addEventListener('click', () => {
    drawer.showModal();
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('sg-decisions-open');
    close.focus();
  });
  close.addEventListener('click', () => closeDrawer());
  drawer.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDrawer();
  });
  drawer.addEventListener('close', () => {
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('sg-decisions-open');
  });
  drawer.addEventListener('click', (event) => {
    if (event.target !== drawer) return;
    const bounds = drawer.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDrawer();
  });
  panel.addEventListener('click', (event) => {
    if (event.target.closest('a') && drawer.open) closeDrawer(false);
  });
  desktop.addEventListener('change', arrangePanel);
  arrangePanel();

  function render(state) {
    current = state;
    let completed = 0;
    cards.forEach((card) => {
      const value = decisionValue(card.item);
      const isDone = value.status === 'confirmed';
      if (isDone) completed += 1;
      card.badge.textContent = STATUS_LABELS[value.status];
      card.row.dataset.sgStatus = value.status;
      card.savedNote.textContent = value.note;
      card.savedNote.hidden = !value.note;
      if (!card.dirty && !card.busy) resetDraft(card);
      refreshSaveState(card);
    });
    const left = DECISIONS.length - completed;
    summaryNumber.textContent = String(left);
    toggleCount.textContent = String(left);
    toggle.setAttribute('aria-label', `여행 준비 남은 결정 ${left}개 열기`);
    progress.value = completed;
    progress.setAttribute('aria-valuetext', `전체 ${DECISIONS.length}개 중 ${completed}개 확인 완료`);
    connection.dataset.sgConnection = current.connection;
    connection.textContent = current.saving ? '변경한 내용을 저장하고 있어요…' : ({
      loading: '함께 보는 목록을 불러오는 중…',
      live: '저장하면 둘이 함께 보고 변경 기록도 남아요.',
      offline: '연결 끊김 · 다시 연결되면 저장할 수 있어요.',
      error: '목록을 연결하지 못했어요. 새로고침 후 확인해 주세요.'
    }[current.connection] || '함께 보는 목록을 불러오는 중…');
  }
  render(current);

  // The existing PIN guard does not reload the hub after authentication.
  // Delay all shared-store loading until that guard has been satisfied.
  import('./trip-store.mjs').then((store) => {
    saveDecision = store.saveDecision;
    const syncActor = () => {
      const savedActor = store.getActor();
      actor.value = ['성우', '소희'].includes(savedActor) ? savedActor : '미지정';
    };
    syncActor();
    actor.disabled = false;
    actor.addEventListener('change', () => {
      try {
        store.setActor(actor.value);
        syncActor();
        actorFeedback.textContent = `앞으로 '${actor.value}' 이름으로 기록해요.`;
      } catch {
        actorFeedback.textContent = '이름을 저장하지 못했어요. 다시 선택해 주세요.';
        syncActor();
      }
    });
    window.addEventListener('storage', syncActor);
    const unsubscribe = store.subscribeTrip(render);
    window.addEventListener('pagehide', (event) => {
      if (!event.persisted && typeof unsubscribe === 'function') unsubscribe();
    }, { once: true });
  }).catch(() => render({ ...current, connection: 'error' }));
}

function bootWhenUnlocked() {
  if (!hasValidPin()) return false;
  startPanel();
  return true;
}

if (!bootWhenUnlocked()) {
  const check = () => {
    if (!bootWhenUnlocked()) return;
    clearInterval(poll);
    window.removeEventListener('storage', onStorage);
  };
  const onStorage = (event) => { if (event.key === PIN_KEY) check(); };
  const poll = setInterval(check, 1000);
  window.addEventListener('storage', onStorage);
  window.addEventListener('pagehide', () => clearInterval(poll), { once: true });
}
