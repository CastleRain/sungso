import { formatAreaPair, formatPriceManwon } from '../display-format.mjs';
import { priceCoverageLabel } from '../price-coverage-core.mjs?v=4.6.1';
import { matchedOfficialComplexInfo } from '../../providers/official/complex.mjs?v=4.10.0';
import { parkingForCandidate } from './personalized-recommendation-ui.js?v=4.10.0';
import { officialComplexMatchNote } from '../official-complex-match-note.mjs?v=4.11.0';

const MODES = ['matched', 'verified', 'saved'];
const count = value => Number(value || 0).toLocaleString('ko-KR');
const key = candidate => String(candidate?.catalogId || candidate?.id || candidate?.aptSeq || '');
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const decimal = value => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const balance = candidate => candidate?.personalizedRecommendation?.commuteBalance || candidate?.commuteBalance;
const price = candidate => finite(candidate?.bestArea?.averagePriceManWon) ? Number(candidate.bestArea.averagePriceManWon) : Infinity;
const stamp = value => {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
};
const element = (tag, className = '', text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (text, className, onClick) => {
  const node = element('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
};

export function candidateOfficialFacilitySummary(candidate) {
  const info = matchedOfficialComplexInfo(candidate);
  const status = info?.status || candidate.officialComplexInfo?.status || 'pending';
  const labels = { matched: '공식 정보 확인', partial: '공식 정보 일부 확인', unmatched: '공식 단지 대조 미확인',
    ambiguous: '동일 단지 대조 필요', unavailable: '공식 정보 재확인 대기', pending: '공식 정보 확인 대기' };
  const elevator = info?.elevatorCount;
  return { status: info ? status : ['unmatched', 'ambiguous', 'unavailable'].includes(status) ? status : 'pending',
    label: candidate.officialComplexInfo?.matchIssue === 'combined-complex' ? '통합 단지 자료 · 개별 확인 필요'
      : info ? labels[status] : labels[['unmatched', 'ambiguous', 'unavailable'].includes(status) ? status : 'pending'],
    heating: typeof info?.heatingType === 'string' && info.heatingType.trim() ? info.heatingType : '미확인',
    elevator: finite(elevator) && Number(elevator) >= 0 ? `${count(elevator)}대` : '미확인',
  };
}

/** This view owns presentation only. Persistence and route requests stay with the app. */
export function createCandidateReview(api) {
  let mode = 'matched';
  let query = '';
  let sort = 'commute';
  let busy = false;
  let mounted = false;
  let ui;
  let visible = [];

  function message(text) { if (ui) ui.status.textContent = text; }

  async function mutate(action, success) {
    if (busy) return;
    busy = true;
    render();
    try {
      await action();
      message(typeof success === 'function' ? success() : success);
    } catch (_) {
      message('기록을 변경하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해주세요.');
    } finally {
      busy = false;
      render();
    }
  }

  function selectMode(next) {
    mode = MODES.includes(next) ? next : 'matched';
    render();
  }

  function mount() {
    if (mounted) return true;
    const root = document.getElementById('candidateReviewPage');
    if (!root) return false;
    root.classList.add('candidate-review-page');
    const shell = element('div', 'candidate-review-shell');
    const header = element('header', 'candidate-review-header');
    const heading = element('div');
    heading.append(element('span', 'candidate-review-eyebrow', 'OUR HOME CANDIDATES'),
      element('h1', '', '확인한 후보'), element('p', '', '확인 결과를 모아 보고, 다시 볼 집을 저장하세요.'));
    header.append(heading, button('지도에서 더 찾기', 'candidate-review-button', () => api.findMore()));
    const ledger = element('section', 'candidate-review-ledger');
    ledger.setAttribute('aria-label', '통근 조회 사용량');
    const officialProgress = element('section'); officialProgress.id = 'candidateReviewOfficialProgress';
    officialProgress.hidden = true;
    const metrics = element('div', 'candidate-review-metrics');
    const tabs = element('div', 'candidate-review-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', '후보 모아보기');
    const tabButtons = {};
    MODES.forEach((value, index) => {
      const tab = button('', '', () => selectMode(value));
      tab.id = `candidateReviewTab-${value}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', 'candidateReviewResults');
      tab.addEventListener('keydown', event => {
        const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? MODES.length - 1
          : offset ? (index + offset + MODES.length) % MODES.length : null;
        if (target === null) return;
        event.preventDefault();
        selectMode(MODES[target]);
        tabButtons[MODES[target]].focus();
      });
      tabButtons[value] = tab;
      tabs.append(tab);
    });
    const panel = element('section', 'candidate-review-panel');
    panel.id = 'candidateReviewResults';
    panel.setAttribute('role', 'tabpanel');
    const note = element('p', 'candidate-review-note');
    const filters = element('div', 'candidate-review-filters');
    const searchLabel = element('label', 'candidate-review-search', '단지·지역 검색');
    const search = element('input');
    search.type = 'search';
    search.placeholder = '단지명, 시군구 또는 동';
    search.autocomplete = 'off';
    search.addEventListener('input', () => { query = search.value.trim().toLocaleLowerCase('ko-KR'); renderList(); });
    searchLabel.append(search);
    const sortLabel = element('label', 'candidate-review-sort', '정렬');
    const order = element('select');
    [['commute', '통근 평균 짧은 순'], ['price', '평균 가격 낮은 순'], ['saved', '최근 저장한 순']].forEach(([value, label]) => {
      const option = element('option', '', label); option.value = value; order.append(option);
    });
    order.addEventListener('change', () => { sort = order.value; renderList(); });
    sortLabel.append(order);
    filters.append(searchLabel, sortLabel);
    const listBar = element('div', 'candidate-review-list-bar');
    const resultCount = element('p');
    const saveAll = button('이 목록 관심 저장', 'candidate-review-button', () => {
      const state = api.state();
      const savedIds = new Set((state.shortlist || []).map(key));
      const chosen = visible.filter(row => !savedIds.has(key(row.candidate))).map(row => row.candidate);
      const before = (state.shortlist || []).length;
      mutate(() => api.saveMany(chosen), () => {
        const added = Math.max(0, (api.state().shortlist || []).length - before);
        return added ? `${count(added)}곳을 관심 후보로 저장했습니다. 저장한 후보 탭에서 다시 볼 수 있습니다.`
          : '추가로 저장된 후보가 없습니다. 저장한 후보 수와 저장 한도를 확인해주세요.';
      });
    });
    listBar.append(resultCount, saveAll);
    const status = element('p', 'candidate-review-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const list = element('div', 'candidate-review-list');
    panel.append(note, filters, listBar, status, list);
    shell.append(header, officialProgress, ledger, metrics, tabs, panel);
    root.replaceChildren(shell);
    ui = { root, officialProgress, ledger, metrics, tabs, tabButtons, panel, note, search, order, resultCount, saveAll, status, list };
    mounted = true;
    return true;
  }

  function summaryMetric(label, value, tone) {
    const node = element('div', `candidate-review-metric ${tone || ''}`);
    node.append(element('span', '', label), element('strong', '', `${count(value)}곳`));
    return node;
  }

  function renderLedger(state) {
    const { lastBatch: batch, quota, running } = state;
    const row = element('div', 'candidate-review-ledger-row');
    const provider = String(quota?.provider || batch?.provider || '').toLowerCase();
    const providerLabel = provider.includes('kakao') ? 'Kakao' : provider.includes('tmap') ? 'TMAP' : '대중교통';
    row.append(element('strong', '', running ? '통근 확인 중' : batch ? '최근 통근 조회' : '조회한 결과를 여기서 모아봅니다'));
    if (quota && finite(quota.remaining)) row.append(element('span', 'candidate-review-quota',
      `${providerLabel} 오늘 ${count(quota.remaining)}회 남음${finite(quota.limit) ? ` / ${count(quota.limit)}회` : ''}`));
    ui.ledger.replaceChildren(row);
    if (batch) {
      const last = element('p', 'candidate-review-last-batch');
      const pairs = finite(batch.destinationCount) && Number(batch.destinationCount) > 0
        ? `${count(batch.candidateCount)}곳 × 대중교통 목적지 ${count(batch.destinationCount)}곳`
        : `후보 ${count(batch.candidateCount)}곳`;
      last.append(element('span', '', pairs), element('strong', '', finite(batch.actualTransitCalls)
        ? `실제 신규 호출 ${count(batch.actualTransitCalls)}회` : '실제 신규 호출 집계 확인 중'));
      const results = [finite(batch.matched) ? `충족 ${count(batch.matched)}곳` : '',
        finite(batch.excluded) ? `제외 ${count(batch.excluded)}곳` : '',
        finite(batch.pending) && Number(batch.pending) > 0 ? `미확인 ${count(batch.pending)}곳` : '', stamp(batch.finishedAt)]
        .filter(Boolean).join(' · ');
      if (results) last.append(element('span', '', results));
      ui.ledger.append(last);
    }
    ui.ledger.append(element('p', 'candidate-review-call-note',
      '집 10곳 × 회사 3곳이면 최대 30회입니다. 목록·상세 보기와 관심 저장은 경로 호출 0회입니다.'));
  }

  function currentRows(state) {
    const results = state.results || [];
    const saved = state.shortlist || [];
    const liveById = new Map(results.map(candidate => [key(candidate), candidate]));
    const savedById = new Map(saved.map(candidate => [key(candidate), candidate]));
    if (mode === 'saved') return saved.map(bookmark => ({
      candidate: liveById.get(key(bookmark)) || bookmark, bookmark,
      live: liveById.has(key(bookmark)),
    }));
    return results.filter(candidate => mode === 'matched' ? api.decision(candidate) === 'matched'
      : ['matched', 'excluded'].includes(api.decision(candidate)))
      .map(candidate => ({ candidate, bookmark: savedById.get(key(candidate)), live: true }));
  }

  function renderCard(row) {
    const { candidate, bookmark, live } = row;
    const card = element('article', 'candidate-review-card');
    card.dataset.candidateId = key(candidate);
    const verification = live ? api.verification(candidate) : null;
    const decision = live ? api.decision(candidate) : 'pending';
    const fresh = live && verification?.final === true && !verification.stale;
    const top = element('div', 'candidate-review-card-top');
    const status = element('span', `candidate-review-badge ${decision}`,
      decision === 'matched' ? '현재 통근 조건 충족' : decision === 'excluded' ? '현재 통근 조건 제외'
        : bookmark ? '저장한 후보 · 통근 재확인 필요' : '통근 미확인');
    top.append(status);
    const official = candidateOfficialFacilitySummary(candidate);
    top.append(element('span', `candidate-review-badge candidate-review-official-status ${official.status}`, official.label));
    if (bookmark) top.append(element('span', 'candidate-review-saved-mark', '관심 저장됨'));
    const title = element('h2', '', candidate.name || '단지 이름 확인 필요');
    const region = [candidate.regionName, candidate.dong].filter(Boolean).join(' ');
    const address = element('p', 'candidate-review-address', candidate.address || region || '주소 확인 필요');
    address.title = address.textContent;
    const area = candidate.bestArea || {};
    const amount = element('div', 'candidate-review-price');
    amount.append(element('span', '', live ? '조회기간 평균 매매가' : '저장 당시 평균 매매가'),
      element('strong', '', Number.isFinite(price(candidate)) ? formatPriceManwon(price(candidate)) : '평균 가격 재확인 필요'));
    const sample = [formatAreaPair(area.areaM2), finite(area.count) ? `${count(area.count)}건 거래` : '거래건수 미확인',
      area.latestMonth ? `최근 거래월 ${area.latestMonth}` : ''].filter(Boolean).join(' · ');
    const facts = element('dl', 'candidate-review-card-facts');
    const b = fresh ? balance(candidate) : null;
    const commute = b?.timeCoverageComplete === false ? '일부 회사 확인 · 평균 보류'
      : b && finite(b.weightedMeanMinutes) ? `${decimal(b.weightedMeanMinutes)}분` : '재확인 필요';
    facts.append(element('dt', '', '회사 비중 평균'), element('dd', 'candidate-review-commute', commute));
    if (b && b.timeCoverageComplete !== false && finite(b.weightedMeanTransfers)) {
      facts.append(element('dt', '', '비중 평균 환승'), element('dd', '', `${decimal(b.weightedMeanTransfers)}회`));
    }
    const parking = candidate.personalizedRecommendation?.dimensions?.parking;
    const parkingEvidence = parkingForCandidate(candidate);
    const ratio = parkingEvidence.spacesPerHousehold;
    const ratioLabel = finite(ratio) ? `세대당 ${Number(ratio).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}대` : '미확인';
    const parkingLabel = parkingEvidence.sourceType === 'field' && finite(ratio) ? `${ratioLabel} · 사용자 확인`
      : parking && parking.status !== 'unknown' && parking.label ? parking.label : ratioLabel;
    facts.append(element('dt', '', '주차'), element('dd', parkingLabel === '미확인' ? 'candidate-review-unknown' : '', parkingLabel));
    facts.append(element('dt', '', '난방'), element('dd', official.heating === '미확인' ? 'candidate-review-unknown' : '', official.heating),
      element('dt', '', '승강기'), element('dd', official.elevator === '미확인' ? 'candidate-review-unknown' : '', official.elevator));
    const building = [finite(candidate.households) && Number(candidate.households) > 0 ? `${count(candidate.households)}세대` : '세대수 미확인',
      finite(candidate.builtYear) && Number(candidate.builtYear) > 0 ? `${candidate.builtYear}년 준공` : '준공연도 미확인'].join(' · ');
    card.append(top, title, address, amount, element('p', 'candidate-review-sample', sample), facts,
      element('p', 'candidate-review-building', building));
    card.append(element('p', 'candidate-review-unknown', priceCoverageLabel(candidate)));
    const matchNote = officialComplexMatchNote(candidate.officialComplexInfo);
    if (matchNote) card.append(element('p', 'candidate-review-unknown', matchNote));
    if (bookmark) {
      const condition = api.conditions(bookmark);
      const context = element('p', `candidate-review-saved-context ${condition}`,
        `${condition === 'same' ? '저장 때와 같은 검색 조건' : condition === 'changed' ? '저장 뒤 검색 조건이 바뀌었습니다' : '저장 당시 조건 비교 불가'}${stamp(bookmark.savedAt) ? ` · ${stamp(bookmark.savedAt)} 저장` : ''}`);
      card.append(context);
    }
    if (fresh && String(verification?.provider || '').includes('kakao')) {
      card.append(element('small', 'candidate-review-provider-note', 'Kakao 제공 기준 · 입력한 출발시각 미반영'));
    }
    const actions = element('div', 'candidate-review-card-actions');
    actions.append(button('가격·통근 상세', 'candidate-review-button primary', () => api.detail(candidate)));
    const save = button(bookmark ? '관심 해제' : '관심 저장', 'candidate-review-button', () => {
      if (bookmark) mutate(() => api.remove(bookmark), '관심 후보에서 해제했습니다.');
      else mutate(() => api.save(candidate), () => (api.state().shortlist || []).some(item => key(item) === key(candidate))
        ? '관심 후보에 저장했습니다. 저장한 후보 탭에서 다시 볼 수 있습니다.' : '저장되지 않았습니다. 저장 한도를 확인해주세요.');
    });
    save.disabled = busy;
    actions.append(save);
    card.append(actions);
    return card;
  }

  function renderList() {
    if (!mounted) return;
    const state = api.state();
    const source = currentRows(state);
    visible = source.filter(({ candidate }) => !query || [candidate.name, candidate.address, candidate.regionName, candidate.dong]
      .filter(Boolean).join(' ').toLocaleLowerCase('ko-KR').includes(query));
    visible.sort((a, b) => {
      if (sort === 'saved') {
        const newer = (Date.parse(b.bookmark?.savedAt || '') || 0) - (Date.parse(a.bookmark?.savedAt || '') || 0);
        if (newer) return newer;
      }
      if (sort === 'commute') {
        const minutes = row => {
          const status = row.live ? api.verification(row.candidate) : null;
          const b = balance(row.candidate);
          const value = status?.final && !status.stale && b?.timeCoverageComplete !== false ? b?.weightedMeanMinutes : null;
          return finite(value) ? Number(value) : Infinity;
        };
        const shorter = minutes(a) - minutes(b);
        if (shorter) return shorter;
      }
      return price(a.candidate) - price(b.candidate)
        || String(a.candidate.name || '').localeCompare(String(b.candidate.name || ''), 'ko');
    });
    ui.resultCount.textContent = `${query ? '검색 결과' : '전체 지역'} ${count(visible.length)}곳${query ? ` / ${count(source.length)}곳` : ''}`;
    const newCount = visible.filter(row => !row.bookmark).length;
    ui.saveAll.hidden = mode === 'saved';
    ui.saveAll.disabled = busy || !newCount || typeof api.saveMany !== 'function';
    ui.saveAll.textContent = newCount ? `이 목록 관심 저장 · ${count(newCount)}곳` : '이 목록은 모두 저장됨';
    ui.list.replaceChildren();
    if (visible.length) visible.forEach(row => ui.list.append(renderCard(row)));
    else {
      const empty = element('div', 'candidate-review-empty');
      empty.append(element('h2', '', query ? '검색어에 맞는 후보가 없습니다'
        : mode === 'saved' ? '다시 볼 집을 관심 후보로 저장하세요'
          : mode === 'verified' ? '통근 확인을 마친 후보가 아직 없습니다' : '현재 통근 조건을 충족한 후보가 없습니다'),
      element('p', '', query ? '단지 이름이나 지역 이름을 짧게 입력해보세요.'
        : mode === 'saved' ? '후보 카드의 관심 저장을 누르면 새로고침 후에도 집과 저장 당시 가격·검색 조건을 다시 볼 수 있습니다.'
          : '지도에서 후보의 통근을 확인하면 이곳에 모입니다. 이전에 관심 저장한 집은 저장한 후보 탭에서 확인할 수 있습니다.'));
      empty.append(button(query ? '검색어 지우기' : mode === 'saved' ? '통근 충족 후보 보기' : '지도에서 통근 확인', 'candidate-review-button primary', () => {
        if (query) { query = ''; ui.search.value = ''; renderList(); }
        else if (mode === 'saved') selectMode('matched');
        else api.findMore();
      }));
      ui.list.append(empty);
    }
  }

  function render() {
    if (!mount()) return;
    const state = api.state();
    const results = state.results || [];
    const matched = results.filter(candidate => api.decision(candidate) === 'matched').length;
    const excluded = results.filter(candidate => api.decision(candidate) === 'excluded').length;
    const saved = (state.shortlist || []).length;
    api.renderOfficialProgress?.(ui.officialProgress);
    renderLedger(state);
    ui.metrics.hidden = !results.length;
    ui.metrics.replaceChildren(summaryMetric('통근 조건 충족', matched, 'matched'),
      summaryMetric('통근 조건 제외', excluded, 'excluded'),
      summaryMetric('통근 미확인', Math.max(0, results.length - matched - excluded), 'pending'));
    const labels = { matched: `통근 충족 ${count(matched)}`, verified: `확인 완료 ${count(matched + excluded)}`, saved: `저장한 후보 ${count(saved)}` };
    MODES.forEach(value => {
      ui.tabButtons[value].textContent = labels[value];
      ui.tabButtons[value].setAttribute('aria-selected', String(value === mode));
      ui.tabButtons[value].tabIndex = value === mode ? 0 : -1;
    });
    ui.panel.setAttribute('aria-labelledby', `candidateReviewTab-${mode}`);
    ui.note.textContent = mode === 'saved'
      ? '집·가격·검색 조건은 저장됩니다. 통근 판정은 현재 화면에서만 유지되며, 새로고침 후 재확인이 필요합니다.'
      : mode === 'verified'
        ? '이번 검색에서 통근 충족 또는 제외 판정이 나온 집입니다. 지도에서 선택한 지역과 관계없이 모두 표시합니다. 다시 볼 집은 관심 저장을 눌러주세요.'
        : '이번 검색에서 실제 경로가 통근 조건을 충족한 집입니다. 주차·난방·승강기는 공식 자료로 차례로 보강합니다. 다시 볼 집은 관심 저장을 눌러주세요.';
    renderList();
  }

  return { render, open(nextMode = 'matched') { selectMode(nextMode); } };
}
