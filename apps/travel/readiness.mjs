import { DECISIONS, PREPARATIONS, READINESS_SOURCES } from '../../shared/travel/trip-data.mjs';

const STATUS_LABELS = { pending: '미정', candidate: '후보 있음', confirmed: '확인 완료' };
const GUIDE_URL = 'https://disneycruise.disney.go.com/en-nz/ships/adventure/disney-adventure-pre-arrival/';



function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(label, href) {
  const node = element('a', 'readiness-link', `${label} ${href.startsWith('#') ? '→' : '↗'}`);
  node.href = href;
  if (!href.startsWith('#')) {
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  }
  return node;
}

export function initReadiness() {
  const host = document.getElementById('readiness-content');
  if (!host || host.dataset.initialized === 'true') return;
  host.dataset.initialized = 'true';

  const introduction = element('div', 'readiness-intro');
  const lead = element('div', 'readiness-lead');
  lead.append(element('p', '', '관광 일정은 충분해요. 예약 기한·서류·이동 준비를 마무리해요.'));
  const connection = element('p', 'readiness-connection', '공동 준비 상태를 불러오는 중…');
  connection.setAttribute('role', 'status');
  lead.append(connection);
  const count = element('p', 'readiness-count');
  count.setAttribute('aria-live', 'polite');
  introduction.append(lead, count);

  const grid = element('div', 'readiness-grid');
  const cards = new Map();
  for (const item of PREPARATIONS) {
    const card = element('article', 'readiness-card');
    card.id = `readiness-${item.id}`;
    const heading = element('div', 'readiness-card-heading');
    const icon = element('span', 'readiness-icon', item.icon);
    icon.setAttribute('aria-hidden', 'true');
    const badge = element('span', 'readiness-badge');
    heading.append(icon, badge);
    const title = element('h3', '', item.title);
    title.id = `readiness-title-${item.id}`;
    card.setAttribute('aria-labelledby', title.id);
    const when = element('p', 'readiness-when', item.when);
    const action = element('p', 'readiness-action', item.action);
    const note = element('p', 'readiness-note', item.note);
    const links = element('div', 'readiness-links');
    for (const [label, href] of item.links) links.append(link(label, href));
    const edit = element('button', 'readiness-edit', '상태·메모 정리');
    edit.type = 'button';
    edit.setAttribute('aria-label', `${item.title} 상태와 메모 정리`);
    edit.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('travel:edit-decision', { detail: { id: item.id } }));
    });
    card.append(heading, title, when, action, note, links, edit);
    grid.append(card);
    cards.set(item.id, { card, badge });
  }

  const budget = element('div', 'readiness-budget-note');
  const budgetCopy = element('div');
  budgetCopy.append(
    element('strong', '', '작은 비용까지 합쳐 두기'),
    element('p', '', '팁·이동·보험·통신·공항 대기 비용과 예비비도 챙겨요. 숙박이나 크루즈에 포함된 항목은 다시 더하지 않아요.')
  );
  budget.append(budgetCopy, link('여행 비용에서 정리', '#budget'));

  const sources = element('details', 'readiness-sources');
  sources.append(element('summary', '', '참고 안내 · 출발 전 재확인'));
  const sourceList = element('ul');
  const explanations = READINESS_SOURCES;
  for (const [text, label, href] of explanations) {
    const item = element('li');
    item.append(element('p', '', text), link(label, href));
    sourceList.append(item);
  }
  sources.append(sourceList);
  host.append(introduction, grid, budget, sources);

  function renderState(snapshot) {
    let confirmed = 0;
    for (const [id, view] of cards) {
      const status = snapshot.data?.decisions?.[id]?.status || DECISIONS.find(item => item.id === id)?.status || 'pending';
      const safeStatus = Object.hasOwn(STATUS_LABELS, status) ? status : 'pending';
      view.badge.textContent = STATUS_LABELS[safeStatus];
      view.badge.dataset.status = safeStatus;
      view.card.classList.toggle('is-confirmed', safeStatus === 'confirmed');
      if (safeStatus === 'confirmed') confirmed += 1;
    }
    count.textContent = `${confirmed} / ${PREPARATIONS.length}개 확인 완료`;
    connection.textContent = snapshot.connection === 'live'
      ? '두 사람이 함께 보는 준비 상태예요.'
      : snapshot.connection === 'loading'
        ? '공동 준비 상태를 불러오는 중…'
        : '공동 연결을 확인해주세요. 저장은 연결된 뒤 할 수 있어요.';
  }

  renderState({ connection: 'loading' });
  import('../../shared/travel/trip-store.mjs').then(store => {
    store.subscribeTrip(renderState);
  }).catch(() => {
    connection.textContent = '준비 안내를 먼저 볼 수 있어요. 공동 상태는 연결 후 확인해주세요.';
  });
}

initReadiness();
