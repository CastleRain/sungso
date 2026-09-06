import { decisionKey, decisionPrice, DECISION_KINDS, pruneDecisionKeys, regionalCoverage, searchBottleneck } from '../decision-core.mjs';
import { formatPriceManwon, formatAreaPair } from '../display-format.mjs';
import { renderDistrictList } from './location-discovery.js?v=4.2.0';

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const button = (label, action, cls = 'dw-button') => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', action); return b; };
const money = (n) => n == null ? '자료 없음' : formatPriceManwon(n);
const address = (r) => r.address || (r.locations || []).map((l) => l.address).filter(Boolean).join(' / ') || [r.regionName, r.dong].filter(Boolean).join(' · ');
const KEY = 'homehunt_decision_keys_v1';
export function createDecisionWorkspace(api) {
  const panel = document.querySelector('#recommendationResultPanel');
  const today = document.querySelector('#decisionToday');
  const regions = document.querySelector('#decisionRegions');
  let tab = 'today', selected = null, keys = [], lastCoverage = null, currentCoverage = null;
  try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); keys = Array.isArray(value) ? value.filter((x) => typeof x === 'string').slice(0, 3) : []; } catch { /* optional preference */ }
  const entries = () => {
    const s = api.state();
    const candidates = [...new Map([...s.shortlist, ...s.results].map((r) => [decisionKey('candidate', r), r])).values()];
    return [...candidates.map((record) => ({ kind: 'candidate', record })), ...s.visits.map((record) => ({ kind: 'visit', record })), ...s.notices.map((record) => ({ kind: 'supply', record }))];
  };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(keys)); } catch { api.toast('비교 선택을 저장하지 못했습니다.'); } };
  function visitChange(record) {
    const entry = api.state().visitBenchmarks?.get(String(record.id));
    const fingerprint = JSON.stringify([record.id, record.visitDate, record.dealType, Number(record.areaM2), record.name, record.address]);
    if (!entry || entry.visitFingerprint !== fingerprint || !entry.benchmark?.marketChange?.available) return null;
    const change = entry.benchmark.marketChange;
    return `${change.percent >= 0 ? '+' : ''}${change.percent.toFixed(1)}% · 방문 전후 같은 면적 평균 · ${entry.latest || '기준일 확인'}${change.confidence === 'low' ? ' · 표본 적음' : ''}`;
  }
  function setTab(value) {
    tab = ['today', 'candidates', 'regions'].includes(value) ? value : 'today';
    panel.dataset.decisionTab = tab;
    today.hidden = tab !== 'today'; regions.hidden = tab !== 'regions';
    document.querySelectorAll('[data-decision-tab]').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.decisionTab === tab)); b.tabIndex = b.dataset.decisionTab === tab ? 0 : -1; });
    api.showResults();
  }
  function toggle(kind, record) {
    const key = decisionKey(kind, record);
    if (keys.includes(key)) keys = keys.filter((k) => k !== key);
    else if (keys.length >= 3) return api.toast('비교 보드에서 한 곳을 빼면 새 후보를 담을 수 있어요.');
    else keys.push(key);
    persist(); render();
    if (selected) renderDetail();
    if (!document.querySelector('#decisionCompareModal').hidden) renderCompare();
  }
  function row(kind, record) {
    const p = decisionPrice(kind, record);
    const r = button('', () => openDetail(kind, record), 'dw-recent');
    r.append(el('span', 'dw-source', DECISION_KINDS[kind]), el('strong', '', record.name || record.title), el('small', '', address(record)), el('small', '', `${p.label} · ${money(p.value)}`));
    if (kind === 'visit' && visitChange(record)) r.append(el('small', 'dw-change', visitChange(record)));
    return r;
  }
  function actionCard(title, copy, label, action) {
    const n = el('section', 'dw-action'); n.append(el('h3', '', title), el('p', '', copy), button(label, action)); return n;
  }
  function render() {
    const s = api.state();
    const issue = searchBottleneck({ meta: s.meta, results: s.results, destinations: s.destinations, verifiedCount: s.verifiedCount });
    const actions = { filters: api.filters, connections: () => api.view('connections'), candidates: () => setTab('candidates'), compare: openCompare };
    const lead = actionCard(issue.title, issue.detail, { filters: '조건 설정하기', connections: '연결 상태 확인', candidates: '가격 후보 보기', compare: '판단 보드 열기' }[issue.action], actions[issue.action]);
    const dest = el('div', 'dw-destinations');
    dest.append(el('span', '', `우리의 목적지 ${s.destinations.length}/4`));
    s.destinations.forEach((d, i) => dest.append(button(`${String.fromCharCode(65 + i)} ${d.label || '목적지'} · ${d.maxMinutes || d.commuteMaxMinutes || '—'}분`, () => api.destination(d.id), 'dw-destination')));
    if (s.destinations.length < 4) dest.append(button('+ 목적지', () => api.destination(), 'dw-destination'));
    const recent = el('section', 'dw-recent-section');
    recent.append(el('h3', '', '이어서 검토할 집'));
    const saved = [...s.shortlist.slice(0, 3).map((record) => ({ kind: 'candidate', record })), ...s.visits.slice().sort((a, b) => String(b.visitDate).localeCompare(String(a.visitDate))).slice(0, 2).map((record) => ({ kind: 'visit', record }))];
    if (saved.length) recent.append(...saved.map(({ kind, record }) => row(kind, record)));
    else recent.append(el('p', 'dw-muted', '관심 후보를 저장하거나 방문 기록을 남기면 여기에서 다음 검토를 이어갈 수 있어요.'));
    const supply = el('section', 'dw-recent-section'); supply.append(el('h3', '', '새로 확인할 분양 기회'));
    const notices = s.notices.filter((n) => api.actionableNotice(n)).slice(0, 2);
    if (notices.length) supply.append(...notices.map((n) => row('supply', n)));
    else supply.append(el('p', 'dw-muted', s.supplyLoaded ? '현재 수집된 접수·예정 공고가 없습니다. 공급원 상태와 공식 공고를 확인하세요.' : '공식 공고를 확인하고 있습니다. 공급원별 연결 상태는 분양·청약에서 볼 수 있어요.'));
    supply.append(button('분양·청약 확인 →', () => api.view('supply'), 'dw-text-button'));
    today.replaceChildren(lead, dest, recent, supply);
    renderRegions(s);
    document.querySelectorAll('[data-open-decision-compare]').forEach((b) => b.textContent = `판단 보드 ${keys.length}/3`);
  }
  function renderRegions(s) {
    if (api.selectRegion) { renderDistrictList(regions, s.results, api.selectRegion); return; }
    const groups = regionalCoverage(s.results);
    const signature = JSON.stringify(s.searchSnapshot || null);
    if (s.meta && currentCoverage?.signature !== signature) { lastCoverage = currentCoverage; currentCoverage = { signature, count: s.results.length, regions: groups.length }; }
    const header = el('div', 'dw-region-intro');
    header.append(el('h3', '', '내 예산이 닿는 지역'), el('p', '', '같은 전용면적의 실거래 평균이 조건을 통과한 범위입니다. 현재 판매 가능한 매물 수가 아닙니다.'));
    if (groups.length) header.append(el('p', 'dw-coverage', `조건 후보 ${s.results.length} · 평균가 확인 ${groups.reduce((n, g) => n + g.verified, 0)} · 좌표 확인 ${groups.reduce((n, g) => n + g.mapped, 0)} · 좌표 미확인 ${groups.reduce((n, g) => n + g.unmapped, 0)}`));
    if (lastCoverage && currentCoverage && lastCoverage.signature !== signature) header.append(el('small', '', `직전 검색 대비 후보 ${currentCoverage.count - lastCoverage.count >= 0 ? '+' : ''}${currentCoverage.count - lastCoverage.count}곳 · 지역 ${currentCoverage.regions - lastCoverage.regions >= 0 ? '+' : ''}${currentCoverage.regions - lastCoverage.regions}곳 (조회기간·자료 범위도 달라질 수 있음)`));
    if (!groups.length) header.append(button('조건을 설정하고 조회하기', api.filters));
    const rows = groups.map((g) => {
      const n = el('section', 'dw-region');
      n.append(el('strong', '', g.label), el('b', '', `${g.count}개 조건 후보`), el('p', '', `${g.verified}개 평균가 확인 · 지도 ${g.mapped}개 · 좌표 미확인 ${g.unmapped}개`), el('small', '', `${money(g.minPrice)} – ${money(g.maxPrice)} · 최근 변화는 단지별 확인`), button('이 지역을 지도에서 보기', () => api.region(g.candidates)));
      return n;
    });
    regions.replaceChildren(header, ...rows);
  }
  async function renderDetail() {
    if (!selected) return;
    const { kind, record } = selected;
    const renderSelection = selected;
    const root = document.querySelector('#decisionDetailBody');
    document.querySelector('#decisionDetailTitle').textContent = record.name || record.title || '후보 상세';
    const p = decisionPrice(kind, record);
    const intro = el('div', 'dw-detail-price'); intro.append(el('span', 'dw-source', `${DECISION_KINDS[kind]} · ${p.label}`), el('strong', '', money(p.value)), el('small', '', [typeof p.source === 'string' ? p.source : '공식 모집공고', p.date || '기준일 미확인', record.bestArea?.areaM2 ? formatAreaPair(record.bestArea.areaM2) : record.areaM2 ? formatAreaPair(record.areaM2) : ''].filter(Boolean).join(' · ')));
    const actions = el('div', 'dw-detail-actions');
    actions.append(button(keys.includes(decisionKey(kind, record)) ? '비교에서 빼기' : '비교에 담기', () => toggle(kind, record)), button('실거래 확인', () => { api.close('decisionDetailModal'); api.market(record, kind); }));
    if (kind === 'candidate') actions.append(button('관심 저장 / 해제', () => api.shortlist(record)), button('지도에서 보기', () => { api.close('decisionDetailModal'); api.mapCandidate(record); }), button('방문 기록', () => { api.close('decisionDetailModal'); api.visitCandidate(record); }));
    if (kind === 'visit') actions.append(button('방문 기록 수정', () => { api.close('decisionDetailModal'); api.editVisit(record); }));
    if (kind === 'supply') actions.append(button('공고·신청 준비 확인', () => { api.close('decisionDetailModal'); api.supply(record); }));
    const context = el('div', 'dw-detail-context');
    if (kind === 'candidate' && api.locationScore) context.append(api.locationScore(record));
    if (kind === 'candidate') {
      const status = api.verification(record);
      const balance = status.stage === 'screening' ? record.commuteScreening?.balance : record.commuteBalance;
      const route = el('section', 'dw-route'); route.append(el('h3', '', '목적지별 통근'), el('p', '', status.stale ? '목적지 조건 변경 · 이전 경로 재검증 필요' : status.final ? '실제 경로 확인 결과' : status.stage === 'screening' ? 'Kakao 1차 선별 · 최종 경로 확인 전' : '실제 경로 확인 전'));
      for (const e of balance?.evaluations || []) route.append(el('p', '', `${e.destination?.label || '목적지'} · ${e.verified ? `${e.durationMinutes}분 · 도보 ${e.walkingMinutes ?? '미확인'}분 · 환승 ${e.transferCount ?? '미확인'}회` : '미확인'}`));
      if (status.final && !status.stale) route.append(el('small', '', `가중 평균 ${balance?.weightedMeanMinutes ?? '—'}분 · 모든 필수 목적지 ${balance?.requiredFullyVerified ? '확인' : '일부 미확인'}`));
      route.append(button(`이 후보 실제 통근 확인 · 목적지 ${api.state().destinations.length}곳`, async () => { await api.verify(record); if (selected === renderSelection) { selected = { kind, record: api.latestCandidate(record) }; renderDetail(); } }));
      context.append(route);
    }
    intro.append(el('small', '', address(record)));
    const financial = el('section', 'dw-finance-entry');
    financial.append(el('div', '', '자금 계획 · WeCost 연결 필요'), button('이 후보로 자금 계획 보기', async () => {
      try {
        const module = await import('../financial-plan.js?v=4.0.1');
        api.close('decisionDetailModal');
        module.openFinancialPlan({ id: decisionKey(kind, record), name: record.name || record.title, priceManWon: p.value, priceSource: p.label, priceObservedAt: p.date, dealType: record.dealType || '매매' });
      } catch { api.toast('자금 계획을 열지 못했습니다. 잠시 후 다시 시도해주세요.'); }
    }));
    const evidence = el('div', 'dw-detail-evidence'); evidence.textContent = '출처와 단지 근거를 정리하고 있어요.';
    root.replaceChildren(intro, actions, context, financial, evidence);
    try {
      const module = await import('./evidence-detail.js?v=4.0.1');
      if (selected !== renderSelection) return;
      if (kind === 'supply') module.mountSupplyDecisionSupport(evidence, record);
      else evidence.innerHTML = module.renderCandidateEvidence(record, { catalogMeta: api.state().catalogMeta, personalRecord: kind === 'visit' ? record : null });
    } catch { evidence.textContent = '상세 근거를 읽지 못했습니다. 실거래 화면과 공식 공고에서 확인해주세요.'; }
  }
  function openDetail(kind, record) { selected = { kind, record }; renderDetail(); api.open('decisionDetailModal'); }
  function renderCompare() {
    const all = entries();
    const chosen = keys.map((key) => all.find(({ kind, record }) => decisionKey(kind, record) === key)).filter(Boolean);
    const root = document.querySelector('#decisionCompareBody');
    const picker = el('div', 'dw-compare-picker'); picker.append(el('h3', '', '함께 판단할 집 · 최대 3곳'));
    const searchLabel = el('label', 'dw-compare-search', '후보·기록·공고 검색');
    const search = el('input'); search.type = 'search'; search.placeholder = '단지명 또는 주소'; searchLabel.append(search);
    const choices = el('div', 'dw-compare-choices');
    const renderChoices = () => {
      const query = search.value.trim().toLocaleLowerCase();
      const filtered = all.filter(({ record }) => !query || `${record.name || record.title} ${address(record)}`.toLocaleLowerCase().includes(query));
      choices.replaceChildren(...filtered.slice(0, 40).map(({ kind, record }) => {
        const key = decisionKey(kind, record), b = button(`${keys.includes(key) ? '✓ ' : '+ '}${DECISION_KINDS[kind]} · ${record.name || record.title} · ${address(record)}`, () => toggle(kind, record), 'dw-choice'); b.setAttribute('aria-pressed', String(keys.includes(key))); return b;
      }));
      if (filtered.length > 40) choices.append(el('small', '', `${filtered.length}곳 중 40곳 표시 · 검색어로 좁혀주세요.`));
      if (!filtered.length) choices.append(el('p', '', '후보를 검색하거나 관심 저장·방문 기록을 추가해주세요.'));
    };
    search.addEventListener('input', renderChoices); renderChoices(); picker.append(searchLabel, choices);
    const scroll = el('div', 'dw-comparison-scroll'); scroll.tabIndex = 0; scroll.setAttribute('aria-label', '출처별 집 비교표 · 가로 스크롤');
    const table = el('table', 'dw-comparison'); const head = el('thead'), hr = el('tr'); hr.append(el('th', '', '판단 근거'));
    chosen.forEach(({ kind, record }) => { const th = el('th'); th.scope = 'col'; th.append(el('span', 'dw-source', DECISION_KINDS[kind]), el('strong', '', record.name || record.title), button('선택 해제', () => toggle(kind, record), 'dw-text-button')); hr.append(th); });
    head.append(hr); table.append(head);
    const body = el('tbody');
    const rows = [
      ['가격의 종류', (k, r) => decisionPrice(k, r).label],
      ['기준 가격', (k, r) => money(decisionPrice(k, r).value)],
      ['출처 · 시점', (k, r) => `${k === 'visit' ? '개인 기록' : k === 'candidate' ? '국토부 실거래' : '공식 공고'} · ${decisionPrice(k, r).date || '시점 미확인'}`],
      ['주소', (k, r) => address(r) || '미확인'],
      ['전용면적', (k, r) => k === 'supply' ? `${formatAreaPair(r.minAreaM2)} – ${formatAreaPair(r.maxAreaM2)} · 주택형별 공고 확인` : formatAreaPair(r.bestArea?.areaM2 || r.areaM2)],
      ['세대수 · 준공', (k, r) => `${(k === 'supply' ? r.totalUnits : r.households) || '미확인'}세대 · ${r.builtYear || '미확인'}년`],
      ['실제 통근', (k, r) => k === 'candidate' ? (api.verification(r).stale ? '조건 변경 · 재검증 필요' : api.verification(r).final ? `가중 평균 ${r.commuteBalance?.weightedMeanMinutes ?? '—'}분 · ${api.verification(r).decision === 'matched' ? '충족' : '미충족/일부 확인'}` : '최종 경로 미확인') : '후보 상세에서 경로 확인 필요'],
      ['방문 당시 → 현재 실거래', (k, r) => k === 'visit' ? visitChange(r) || '같은 면적·방문일 전후 거래 조회 필요' : '방문 기록과 연결 필요'],
      ['역 접근성', (k, r) => k === 'visit' && r.walkMinutes ? `개인 기록 도보 ${r.walkMinutes}분` : '역 출입구 보행경로 미확인'],
      ['장점', (k, r) => r.pros || '기록 없음'], ['단점', (k, r) => r.cons || '기록 없음'], ['메모', (k, r) => r.memo || '기록 없음'],
      ['자금 계획', () => 'WeCost 연결 / 개인 시나리오 입력 필요'],
    ];
    for (const [label, value] of rows) { const tr = el('tr'), th = el('th', '', label); th.scope = 'row'; tr.append(th); chosen.forEach(({ kind, record }) => tr.append(el('td', '', value(kind, record)))); body.append(tr); }
    const actionRow = el('tr'); actionRow.append(el('th', '', '다음 확인')); chosen.forEach(({ kind, record }) => { const td = el('td'); td.append(button('상세·자금 계획', () => { api.close('decisionCompareModal'); openDetail(kind, record); })); actionRow.append(td); }); body.append(actionRow);
    table.append(body); scroll.append(table);
    root.replaceChildren(el('p', 'dw-compare-note', '실거래 평균·방문 호가·분양가는 서로 다른 기준입니다. 확인되지 않은 항목은 가격이나 통근 우위로 계산하지 않습니다.'), picker);
    if (chosen.length) root.append(scroll);
    if (keys.length > chosen.length) root.append(button('현재 자료에 없는 선택 정리', () => { keys = pruneDecisionKeys(keys, all); persist(); renderCompare(); render(); }));
    const plans = el('div'); root.append(plans);
    import('../financial-plan.js?v=4.0.1').then((module) => { if (plans.isConnected) plans.append(module.renderFinancialComparison()); }).catch(() => {});
  }
  function openCompare() { renderCompare(); api.open('decisionCompareModal'); }
  document.querySelectorAll('[data-decision-tab]').forEach((b) => {
    b.addEventListener('click', () => setTab(b.dataset.decisionTab));
    b.addEventListener('keydown', (e) => { const values = ['today', 'candidates', 'regions']; let index = values.indexOf(tab); if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return; e.preventDefault(); index = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (index + (e.key === 'ArrowRight' ? 1 : 2)) % 3; setTab(values[index]); document.querySelector(`[data-decision-tab="${values[index]}"]`).focus(); });
  });
  document.querySelectorAll('[data-open-decision-compare]').forEach((b) => b.addEventListener('click', openCompare));
  document.querySelectorAll('[data-close-decision]').forEach((b) => b.addEventListener('click', () => api.close(b.dataset.closeDecision)));
  for (const id of ['decisionDetailModal', 'decisionCompareModal']) document.querySelector(`#${id}`).addEventListener('click', (e) => { if (e.target.id === id) api.close(id); });
  document.addEventListener('homehunt:viewchange', render);
  window.addEventListener('homehunt:financial-scenarios-changed', () => { if (!document.querySelector('#decisionCompareModal').hidden) renderCompare(); });
  panel.dataset.decisionTab = 'today';
  render();
  return { render, openDetail, openCompare, toggle, setTab, has: (kind, record) => keys.includes(decisionKey(kind, record)) };
}
