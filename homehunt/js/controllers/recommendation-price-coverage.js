import { normalizePriceCoverage } from '../price-coverage-core.mjs?v=4.6.1';

const size = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const count = value => size(value).toLocaleString('ko-KR');
const items = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
const month = value => /^\d{4}(0[1-9]|1[0-2])$/.test(String(value || ''))
  ? `${String(value).slice(0, 4)}.${String(value).slice(4)}` : '월 미확인';
const element = (tag, className = '', text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (text, className, action) => {
  const node = element('button', className, text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
};

/** Presents partial official price evidence without turning an unknown price into a match. */
export function createRecommendationPriceCoverage(api) {
  let ui;
  let pending = [];
  let query = '';
  let limit = 30;
  let actionRunning = false;
  let lastState = null;
  let previousJobId = null;

  function status(text) {
    if (!ui) return;
    ui.status.textContent = text;
    ui.status.hidden = !text;
  }

  async function retry() {
    const state = api.getState();
    if (actionRunning || state.running || state.retrying || !state.meta?.retryAvailable) return;
    actionRunning = true;
    status('');
    render();
    try {
      await api.retry();
    } catch (_) {
      status('미완료 자료를 다시 조회하지 못했습니다. 현재 후보는 유지됩니다. 잠시 후 다시 시도해주세요.');
    } finally {
      actionRunning = false;
      render();
    }
  }

  function mount() {
    if (ui) return true;
    const root = document.getElementById('recommendationPriceCoverage');
    if (!root) return false;
    root.classList.add('recommendation-price-coverage');
    root.setAttribute('aria-label', '가격 자료 확인 범위');
    const heading = element('h3', 'price-coverage-heading');
    const metrics = element('p', 'price-coverage-metrics');
    const explanation = element('p', 'price-coverage-explanation');
    const actions = element('div', 'price-coverage-actions');
    const retryButton = button('', 'price-coverage-retry', retry);
    retryButton.id = 'retryRecommendationPrices';
    const showPrices = button('', 'price-coverage-show-prices', () => api.showPrices());
    actions.append(retryButton, showPrices);
    const preservation = element('p', 'price-coverage-preservation');
    const statusNode = element('p', 'price-coverage-status');
    statusNode.setAttribute('role', 'status');
    statusNode.setAttribute('aria-live', 'polite');
    statusNode.hidden = true;

    const failures = element('details', 'price-coverage-failures');
    const failureSummary = element('summary');
    const failureList = element('ul');
    failures.append(failureSummary, failureList);

    const details = element('details', 'price-coverage-pending');
    const summary = element('summary');
    const note = element('p', 'price-coverage-pending-note',
      '규모·연식 조건은 맞지만 가격 자료가 부족한 단지입니다. 예산에 맞는지는 아직 확인되지 않았습니다.');
    const searchLabel = element('label', 'price-coverage-search', '대기 단지·주소·지역 검색');
    const search = element('input');
    search.type = 'search';
    search.placeholder = '단지명, 주소 또는 시군구';
    search.autocomplete = 'off';
    search.addEventListener('input', () => {
      query = search.value.trim().toLocaleLowerCase('ko-KR');
      limit = 30;
      renderPendingList();
    });
    searchLabel.append(search);
    const listCount = element('p', 'price-coverage-list-count');
    listCount.setAttribute('role', 'status');
    const list = element('div', 'price-coverage-pending-list');
    const more = button('30곳 더 보기', 'price-coverage-more', () => {
      limit += 30;
      renderPendingList();
    });
    details.append(summary, note, searchLabel, listCount, list, more);
    root.replaceChildren(heading, metrics, explanation, actions, preservation, statusNode, failures, details);
    ui = { root, heading, metrics, explanation, retryButton, showPrices, preservation,
      status: statusNode, failures, failureSummary, failureList, details, summary, search,
      listCount, list, more };
    return true;
  }

  function pendingCard(candidate) {
    const card = element('article', 'price-coverage-pending-card');
    card.append(element('strong', 'price-coverage-pending-name', candidate.name || candidate.aptName || '단지명 미확인'),
      element('p', 'price-coverage-pending-address', candidate.address || candidate.regionName || '주소 미확인'));
    const facts = [];
    facts.push(size(candidate.households) ? `${count(candidate.households)}세대` : '세대수 미확인');
    const builtYear = size(candidate.builtYear);
    facts.push(builtYear >= 1800 && builtYear <= new Date().getFullYear()
      ? `${builtYear}년 준공 · ${new Date().getFullYear() - builtYear}년차` : '준공 연도 미확인');
    card.append(element('p', 'price-coverage-pending-facts', facts.join(' · ')),
      element('span', 'price-coverage-pending-badge', '가격 확인 대기'));
    const coverage = normalizePriceCoverage(candidate.priceCoverage);
    const period = coverage.totalMonthCount
      ? `요청한 ${count(coverage.totalMonthCount)}개월 중 ${count(coverage.completedMonthCount)}개월 확인`
      : '가격 조회 기간 미확인';
    card.append(element('p', 'price-coverage-pending-period', period));
    if (coverage.missingMonths.length) card.append(element('p', 'price-coverage-pending-months',
      `미확인 월: ${coverage.missingMonths.map(month).join(', ')}`));
    if (coverage.staleMonths.length) card.append(element('p', 'price-coverage-pending-months',
      `갱신 대기 월: ${coverage.staleMonths.map(month).join(', ')}`));
    card.append(button('단지 실거래 보기', 'price-coverage-market', async () => {
      try { await api.market(candidate); }
      catch (_) { status('이 단지의 실거래 화면을 열지 못했습니다. 잠시 후 다시 시도해주세요.'); }
    }));
    return card;
  }

  function renderPendingList() {
    if (!ui) return;
    const words = query.split(/\s+/).filter(Boolean);
    const filtered = pending.filter(candidate => {
      const searchable = [candidate.name, candidate.aptName, candidate.address, candidate.regionName, candidate.dong]
        .filter(Boolean).join(' ').toLocaleLowerCase('ko-KR');
      return words.every(word => searchable.includes(word));
    });
    const visible = filtered.slice(0, limit);
    ui.listCount.textContent = `${count(filtered.length)}곳 중 ${count(visible.length)}곳 표시`;
    ui.list.replaceChildren(...(visible.length ? visible.map(pendingCard)
      : [element('p', 'price-coverage-empty', query ? '검색한 단지·지역의 대기 항목이 없습니다.' : '가격 확인 대기 단지가 없습니다.')]));
    ui.more.hidden = visible.length >= filtered.length;
    ui.more.textContent = `${count(Math.min(30, filtered.length - visible.length))}곳 더 보기`;
  }

  function renderFailures(meta, results) {
    const failures = items(meta.failedRequests);
    ui.failures.hidden = !failures.length;
    ui.failureSummary.textContent = `미완료 지역·월 ${count(meta.failedRequestCount || failures.length)}건 상세`;
    const regionNames = new Map([...results, ...pending]
      .filter(candidate => candidate.regionCode && candidate.regionName)
      .map(candidate => [String(candidate.regionCode), candidate.regionName]));
    const groups = new Map();
    failures.forEach(failure => {
      const code = String(failure.lawdCd || '');
      const type = failure.type === 'rent' ? '전월세' : '매매';
      const key = `${code}|${type}`;
      if (!groups.has(key)) groups.set(key, { region: regionNames.get(code) || `시군구 ${code || '미확인'}`, type, months: new Set() });
      groups.get(key).months.add(month(failure.dealYmd));
    });
    ui.failureList.replaceChildren(...[...groups.values()].map(group => element('li', '',
      `${group.region} · ${group.type} · ${[...group.months].sort().join(', ')}`)));
  }

  function render() {
    if (!mount()) return;
    const latest = api.getState();
    const state = latest.retrying && !latest.meta && lastState ? { ...lastState, ...latest, meta: lastState.meta,
      results: lastState.results } : latest;
    const meta = state.meta;
    if (!meta) {
      ui.root.hidden = true;
      lastState = null;
      previousJobId = null;
      pending = [];
      query = '';
      limit = 30;
      ui.search.value = '';
      ui.details.open = false;
      status('');
      return;
    }
    if (meta.jobId && previousJobId && meta.jobId !== previousJobId) {
      query = '';
      limit = 30;
      ui.search.value = '';
      ui.details.open = false;
      status('');
    }
    previousJobId = meta.jobId || previousJobId;
    lastState = state;
    pending = items(meta.pendingPriceCandidates);
    const results = items(state.results);
    const failed = size(meta.failedRequestCount);
    const stale = size(meta.staleRequestCount);
    const partial = size(meta.partialPriceCandidateCount);
    const total = Math.max(results.length, size(meta.totalResultCount), size(meta.resultCount));
    const waiting = Math.max(pending.length, size(meta.pendingPriceCandidateCount));
    const retrying = actionRunning || state.retrying;
    ui.root.hidden = !(failed || stale || partial || waiting || retrying);
    if (ui.root.hidden) return;
    ui.root.setAttribute('aria-busy', retrying ? 'true' : 'false');
    ui.heading.textContent = total ? `확인한 자료에서 가격 후보 ${count(total)}곳` : '가격 자료가 도착한 범위부터 보여드려요';
    ui.metrics.textContent = `전체 기간 확인 ${count(Math.max(0, total - partial))}곳 · 잠정 가격 ${count(partial)}곳 · 가격 확인 대기 ${count(waiting)}곳`;
    ui.explanation.textContent = failed
      ? `미완료 ${count(failed)}건은 시군구별 월 자료 조회 건수입니다. 단지 ${count(failed)}곳이 실패한 것이 아닙니다.${stale ? ` 이 중 ${count(stale)}건은 이전 자료를 참고했습니다.` : ''}`
      : stale ? `이전 월 자료 ${count(stale)}건을 참고했습니다. 잠정 가격은 갱신된 자료에 따라 달라질 수 있습니다.`
        : '일부 기간의 자료로 확인한 가격은 잠정으로 표시합니다. 미확인 가격을 조건 충족으로 계산하지 않습니다.';
    ui.retryButton.hidden = !meta.retryAvailable && !retrying;
    ui.retryButton.disabled = Boolean(state.running || retrying);
    ui.retryButton.textContent = retrying ? '미완료 자료 다시 조회 중…' : `미완료 ${count(failed || stale)}건만 다시 조회`;
    ui.showPrices.hidden = !total;
    ui.showPrices.textContent = `현재 가격 후보 ${count(total)}곳 보기`;
    ui.preservation.textContent = retrying
      ? '현재 후보를 유지하며 미완료 자료만 다시 확인하고 있습니다. 아래 목록은 계속 볼 수 있습니다.'
      : '현재 후보는 그대로 볼 수 있습니다. 미완료 자료만 다시 조회하면 잠정 가격과 대기 단지를 갱신합니다.';
    ui.details.hidden = !waiting;
    ui.summary.textContent = `가격 확인 대기 ${count(waiting)}곳 보기`;
    renderFailures(meta, results);
    renderPendingList();
  }

  return { render };
}
