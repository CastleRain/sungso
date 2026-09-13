import { DECISIONS } from '../../shared/travel/trip-data.mjs';

const STATUS_LABELS = { pending: '미정', candidate: '후보 있음', confirmed: '확인 완료' };
const GUIDE_URL = 'https://disneycruise.disney.go.com/en-nz/ships/adventure/disney-adventure-pre-arrival/';

const PREPARATIONS = [
  {
    id: 'documents',
    icon: '▤',
    title: '여권·입국 신고',
    when: '지금 여권 확인 · 3월 입국 전 신고',
    action: '두 사람의 여권 유효기간과 예약 영문 이름을 대조해요. 싱가포르 입국·크루즈 하선 후 재입국 신고를 챙기고, 몰디브 IMUGA는 3/11 하선 후 작성할 계획을 세워요.',
    note: '항공·숙소·크루즈 확인서는 두 사람 기기에 오프라인 보관해요.',
    links: [
      ['싱가포르 입국 안내', 'https://www.ica.gov.sg/enter-transit-depart/entering-singapore'],
      ['몰디브 입국 안내', 'https://www.immigration.gov.mv/visa/tourist-visa']
    ]
  },
  {
    id: 'cruise',
    icon: '≈',
    title: '크루즈 예약·준비 기한',
    when: '12/8 잔금 · 12/23 활동 · 2/6 체크인 기준',
    action: '예약 후 잔금 기한과 취소 조건을 확인해요. 첫 디즈니 크루즈 기준 활동 예약·온라인 체크인 개시일을 챙기고, 항구 도착 시간과 식사 배정을 확인해요.',
    note: '실제 결제 기한·개시 시각은 예약 확인서와 계정 안내를 따라요.',
    links: [['디즈니 공식 준비 안내', GUIDE_URL], ['우리 크루즈 후보', '#cruise']]
  },
  {
    id: 'transfers',
    icon: '☀',
    title: '몰디브 마지막 날',
    when: '리조트에 지금 문의 · 3/16 출발 전 확정',
    action: '23:30 국제선 시간을 리조트에 전달해요. 수상비행기 배정·공항 도착 시간, 퇴실 뒤 점심·샤워·짐 보관과 추가 비용을 확인해요.',
    note: '수상비행기·세금이 숙박 견적에 포함됐는지도 함께 대조해요.',
    links: [['리조트 공식 연락처', 'https://www.ananeamadivaru.com/contact-location'], ['우리 이동 계획', '#transfers']]
  },
  {
    id: 'flights',
    icon: '↗',
    title: '연결 수하물·환승 휴식',
    when: '항공 결제 전 · 3/17 환승 7시간 20분',
    action: '한 예약으로 연결 발권되는지, 몰디브에서 부친 짐이 인천까지 연결되는지 확인해요. 창이공항에서는 다음 탑승구와 식사·휴식할 곳을 정해요.',
    note: '라운지나 휴식 시설을 이용하면 이용 조건과 비용도 확인해요.',
    links: [['싱가포르항공 수하물·체크인', 'https://www.singaporeair.com/en_UK/bd/faq/check-in/checking-in/'], ['우리 항공 후보', '#flights']]
  },
  {
    id: 'insurance',
    icon: '♡',
    title: '여행자보험·비상 연락',
    when: '예약 후 비교 · 출국 전에 가입·보관',
    action: '3/7 출국부터 귀가까지 여행 기간을 맞추고, 크루즈·수상활동·항공 지연의 보장 범위를 보험사에 확인해요. 보험사와 숙소 연락처도 두 사람이 챙겨요.',
    note: '보험료는 여행 비용에, 필요한 상비약은 짐 목록에 더해요.',
    links: [['외교부 해외안전여행', 'https://www.0404.go.kr/main/mainPage']]
  },
  {
    id: 'connectivity',
    icon: '◎',
    title: '통신·해외결제·환전',
    when: '출발 전 준비 · 크루즈 승선 전 점검',
    action: '싱가포르·몰디브 데이터와 크루즈 인터넷을 따로 확인해요. 해외결제 카드, SGD·USD로 필요한 금액을 정하고 디즈니 Navigator 앱을 미리 준비해요.',
    note: '입국 신고에 쓸 통신도 챙겨요. 선내 결제는 USD 기준이에요.',
    links: [['디즈니 앱·선내 결제 안내', GUIDE_URL], ['여행 비용 확인', '#budget']]
  },
  {
    id: 'homebound',
    icon: '⌂',
    title: '인천 도착 후 집까지',
    when: '3/17 22:00 도착 · 출발 전 교통 재확인',
    action: '입국과 짐 찾기 시간을 더해 귀가편을 정해요. 공항철도·버스 막차와 택시 대안을 확인하고, 공항 왕복 교통비나 주차비를 예산에 넣어요.',
    note: '귀가 뒤 충분히 쉴 수 있도록 다음 날 일정도 가볍게 잡아요.',
    links: [['인천공항 교통 안내', 'https://www.airport.kr/ap_ko/984/subview.do']]
  }
];

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
  sources.append(element('summary', '', '2026.09 확인 안내 · 2027 출발 전 재확인'));
  const sourceList = element('ul');
  const explanations = [
    ['싱가포르: 현재 외국 여권 유효기간은 최소 6개월, SGAC는 도착일 포함 3일 이내 제출이에요. 3/7 입국은 3/5~7, 3/11 하선 후 재입국은 3/9~11에 준비해요. 3/17 입국 심사 없이 환승 구역에 머무르면 SGAC 예외예요.', 'ICA 입국 안내', 'https://www.ica.gov.sg/enter-transit-depart/entering-singapore'],
    ['몰디브: 현재 도착 전 96시간 이내 개인별 입국 신고가 필요해요. 3/11 하선 후 작성하면 3/12 도착 준비를 할 수 있어요.', '몰디브 입국 안내', 'https://www.immigration.gov.mv/visa/tourist-visa'],
    ['크루즈: 현재 일반 안내의 잔금은 출항 90일 전, 첫 이용객 활동 예약은 75일 전, 온라인 체크인은 30일 전이에요. 2027/3/8 출항 기준 2026/12/8·12/23·2027/2/6이며, 승선 당일 건강 설문도 확인해요.', '디즈니 공식 준비 안내', GUIDE_URL]
  ];
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
