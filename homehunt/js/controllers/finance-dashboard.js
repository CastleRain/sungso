import { calculateMortgage, createFinanceCalculatorState, editFinanceCalculator, financeDateLabel,
  financeNumber, financeSeriesState, safeFinanceSourceUrl, synchronizeFinanceDefaults } from '../finance-dashboard-core.mjs?v=4.19.0';
import { FINANCE_INDICATOR_GUIDE, FINANCE_RELATIONSHIP_SCENARIOS } from '../finance-indicator-guide.mjs?v=4.19.0';
import { FINANCE_MARKET_BANDS } from '../finance-market-context.mjs?v=4.19.0';
import { formatPriceManwon } from '../display-format.mjs';

const number = (value, digits = 0) => Number(value).toLocaleString('ko-KR', { maximumFractionDigits: digits });
const money = value => value === 0 ? '0원' : formatPriceManwon(value);
const node = (tag, className = '', text) => {
  const value = document.createElement(tag); value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
};
const button = (label, action, className = '') => {
  const value = node('button', `finance-button ${className}`, label); value.type = 'button';
  value.addEventListener('click', action); return value;
};
function sourceLink(label, href) {
  const url = safeFinanceSourceUrl(href);
  if (!url) return node('span', 'finance-source', label || '출처 확인 필요');
  const link = node('a', 'finance-source', `${label || '공식 원문'} ↗`);
  link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `${label || '공식 원문'} (새 탭)`); return link;
}
function sectionTitle(title, subtitle) {
  const heading = node('div', 'finance-section-heading');
  heading.append(node('h2', '', title));
  if (subtitle) heading.append(node('p', '', subtitle));
  return heading;
}
function factList(items, className = '') {
  const list = node('dl', `finance-facts ${className}`);
  items.forEach(([label, value]) => { list.append(node('dt', '', label), node('dd', '', value)); });
  return list;
}

/** Translate the shared public-market model without requesting or mutating any source. */
export function adaptFinanceDashboardContext(raw = {}) {
  if (!raw.market || Array.isArray(raw.market)) return raw;
  const data = raw.market;
  const sourceName = data.sourceType === 'imported' ? '가져온 실거래 CSV' : '국토교통부 실거래 공개자료';
  const shared = { status: data.status, sourceName, sourceUrl: 'https://rt.molit.go.kr/',
    observationDate: data.comparisonMonth, checkedAt: data.generatedAt };
  const delta = (value, label) => financeNumber(value) === null ? `${label} 비교 보류`
    : `${label} ${value > 0 ? '+' : ''}${number(value, 1)}%`;
  const metrics = [{ ...shared, label: '수집된 매매 계약 건수', value: data.volume?.count ?? null, unit: '건',
    description: `${data.regionName || '선택 지역'} · 모든 전용면적 · 계약일 기준. ${delta(data.volume?.momPct, '전월 대비')} · ${delta(data.volume?.yoyPct, '전년 동월 대비')}` }];
  [['sale', '매매 평균 총가격'], ['jeonse', '전세 평균 보증금']].forEach(([key, label]) => {
    const series = data[key];
    metrics.push({ ...shared, label, value: series ? money(series.amountManWon) : null, unit: '',
      description: series ? `${data.bandLabel} · ${number(series.count)}건. 3.3㎡당 평균 ${number(series.priceP33)}만원 · ${delta(series.momPct, '전월 거래평균 차이')}`
        : `${data.bandLabel || '선택 면적'}의 비교 가능한 거래 5건 이상이 필요합니다.` });
  });
  return { ...raw, availableRegions: data.regions || [], regionCode: data.regionCode,
    market: metrics, marketNote: `${data.coverageLabel || ''} · ${data.bandLabel || ''}. ${data.notes?.[0] || ''}`,
    marketDetailNotes: (data.notes || []).filter(value => !value.includes('전세/매매 비율')),
    supply: raw.supply ? { activeCount: raw.supply.openCount, totalCount: raw.supply.noticeCount,
      checkedAt: raw.supply.generatedAt, status: raw.supply.status,
      description: `${raw.supply.scopeLabel || ''}. ${raw.supply.note || ''}` } : null };
}

/** UI-only state: navigating here never changes HomeHunt conditions or WeCost data. */
export function createFinanceDashboard({ container, getContext = () => ({}), fetchSnapshot,
  now = () => new Date(), onNavigate = () => {} } = {}) {
  let ui, snapshot = null, context = {}, calculator = createFinanceCalculatorState();
  let loading = null, loaded = false, destroyed = false, loadFailed = false, selectedRegion = '', selectedBand = '60_85';
  const settings = () => ({ now: now() });

  function mount() {
    if (ui) return true;
    if (!container || destroyed) return false;
    container.classList.add('finance-dashboard');
    const shell = node('div', 'finance-shell');
    const header = node('header', 'finance-header');
    const intro = node('div');
    intro.append(node('span', 'finance-eyebrow', '집을 사기 전, 숫자 읽기'), node('h1', '', '금리·부동산 대시보드'),
      node('p', '', '금리와 월 상환액을 살펴보고, 거래·공급 신호를 함께 읽어보세요.'));
    const reload = button('자료 다시 확인', () => refresh());
    header.append(intro, reload);
    const status = node('p', 'finance-load-status'); status.setAttribute('role', 'status');
    const ratesSection = node('section', 'finance-rate-section');
    ratesSection.setAttribute('aria-label', '공식 금리');
    ratesSection.append(sectionTitle('먼저 보는 세 가지 금리', '같은 금리처럼 보여도 의미가 다릅니다. 평균·정책·상품 금리를 구분해 보세요.'));
    const rates = node('div', 'finance-rate-grid'); ratesSection.append(rates);
    const workspace = node('div', 'finance-workspace');
    const calcPanel = node('section', 'finance-card finance-calculator');
    calcPanel.append(sectionTitle('우리 집, 매달 얼마가 필요할까', '원리금균등 · 고정 연 금리 가정'));
    const budgetNote = node('p', 'finance-budget-note');
    const form = node('form', 'finance-input-grid'); form.noValidate = true;
    form.addEventListener('submit', event => event.preventDefault());
    const fields = {};
    [['housePriceManWon', '살 집의 가격', '만원', 0, 100000000, 100],
      ['principalManWon', '빌릴 금액', '만원', 0, 100000000, 100],
      ['annualRatePct', '계산에 쓸 연 금리', '%', 0, 100, 0.01],
      ['termYears', '상환기간', '년', 1, 50, 1]].forEach(([key, label, unit, min, max, step]) => {
      const wrapper = node('div', 'finance-field');
      const inputLabel = node('label', '', label); inputLabel.htmlFor = `finance-${key}`;
      const control = node('div', 'finance-input-wrap');
      const input = node('input'); input.id = `finance-${key}`; input.name = key; input.type = 'number';
      input.min = String(min); input.max = String(max); input.step = String(step); input.inputMode = 'decimal';
      input.autocomplete = 'off'; input.required = true;
      input.placeholder = key === 'annualRatePct' ? '연 금리 입력' : key === 'termYears' ? '30' : '금액 입력';
      const helper = node('span', 'finance-field-help'); helper.id = `finance-${key}-help`;
      input.setAttribute('aria-describedby', helper.id);
      input.addEventListener('input', () => {
        calculator = editFinanceCalculator(calculator, key, input.value);
        updateCalculation();
      });
      control.append(input, node('span', 'finance-input-unit', unit));
      wrapper.append(inputLabel, control, helper); form.append(wrapper); fields[key] = { input, helper };
    });
    const rateNote = node('p', 'finance-rate-note');
    const calculation = node('div', 'finance-calculation'); calculation.setAttribute('aria-live', 'polite');
    const method = node('details', 'finance-method');
    method.append(node('summary', '', '계산 가정과 포함되지 않은 비용'));
    method.append(node('p', '', '매월 같은 금액을 내는 원리금균등 방식입니다. 입력한 금리가 전체 기간 유지된다고 가정합니다. 거치기간·중도상환·금리 변동·수수료는 반영하지 않았습니다.'));
    method.append(node('p', '', '집값에서 대출금을 뺀 금액은 매수대금에 필요한 자기자금입니다. 취득세·중개보수·수리비·이사비는 별도로 더해야 합니다. 실제 대출 한도와 상품 자격, LTV·DSR 심사는 은행에서 확인하세요.'));
    calcPanel.append(budgetNote, form, rateNote, calculation, method);
    const marketPanel = node('section', 'finance-card finance-market');
    const marketHeading = sectionTitle('거래·공급도 함께 보기', '집을 찾는 지역의 실제 자료를 확인하세요.');
    const regionLabel = node('label', 'finance-region-label', '비교할 지역');
    const regions = node('select'); regions.setAttribute('aria-label', '부동산 지표 지역');
    regions.addEventListener('change', () => { selectedRegion = regions.value; renderContext(); });
    regionLabel.append(regions);
    const bandLabel = node('label', 'finance-region-label', '가격을 비교할 전용면적');
    const bands = node('select'); bands.setAttribute('aria-label', '부동산 지표 전용면적');
    FINANCE_MARKET_BANDS.forEach(band => { const option = node('option', '', band.label); option.value = band.value; bands.append(option); });
    bands.value = selectedBand;
    bands.addEventListener('change', () => { selectedBand = bands.value; renderContext(); });
    bandLabel.append(bands);
    const selectors = node('div', 'finance-market-selectors'); selectors.append(regionLabel, bandLabel);
    const market = node('div', 'finance-market-content');
    marketPanel.append(marketHeading, selectors, market); workspace.append(calcPanel, marketPanel);
    const housing = node('section', 'finance-housing'); housing.hidden = true;
    const guideSection = buildGuide();
    shell.append(header, status, ratesSection, workspace, housing, guideSection);
    container.replaceChildren(shell);
    ui = { shell, reload, status, rates, budgetNote, fields, rateNote, calculation, market, regions, regionLabel, bands, bandLabel, housing };
    return true;
  }

  function buildGuide() {
    const section = node('section', 'finance-guide');
    section.append(sectionTitle('숫자를 연결하면, 시장이 조금 더 보입니다', '처음이라면 질문을 눌러 읽어보세요. 지표 하나로 집값의 방향을 단정하기는 어렵습니다.'));
    const cards = node('div', 'finance-guide-grid');
    FINANCE_INDICATOR_GUIDE.forEach((guide, index) => {
      const details = node('details', 'finance-guide-card');
      const summary = node('summary');
      summary.append(node('span', 'finance-guide-number', String(index + 1).padStart(2, '0')),
        node('span', 'finance-guide-topic', guide.title), node('strong', '', guide.question),
        node('span', 'finance-guide-toggle', '읽어보기'));
      details.append(summary);
      const body = node('div', 'finance-guide-body');
      [['어떤 숫자인가요', guide.meaning], ['오를 때', guide.rising], ['내릴 때', guide.falling],
        ['함께 확인할 것', guide.crossCheck]].forEach(([title, text]) => {
        body.append(node('h3', '', title), node('p', '', text));
      });
      body.append(node('p', 'finance-small-note', guide.caveat));
      guide.sources.forEach(source => body.append(sourceLink(source.name, source.url)));
      details.append(body); cards.append(details);
    });
    const scenarios = node('div', 'finance-scenarios');
    scenarios.append(sectionTitle('두 가지 신호를 같이 읽는 연습', '아래는 일반적인 작동 원리입니다. 현재 시장의 판정이나 집값 예측은 아닙니다.'));
    const rows = node('div', 'finance-scenario-grid');
    FINANCE_RELATIONSHIP_SCENARIOS.forEach(scenario => {
      const card = node('article', 'finance-scenario');
      card.append(node('h3', '', scenario.title), node('p', '', scenario.interpretation),
        node('span', '', `다음 확인: ${scenario.check}`)); rows.append(card);
    });
    scenarios.append(rows); section.append(cards, scenarios); return section;
  }

  function renderRates() {
    if (!ui) return;
    ui.rates.replaceChildren();
    const rows = snapshot?.series || snapshot?.rates || [];
    if (!Array.isArray(rows) || !rows.length) {
      const empty = node('div', 'finance-rate-empty');
      empty.append(node('strong', '', loading ? '공식 금리 자료를 확인하고 있습니다.' : '확인된 금리 자료가 아직 없습니다.'),
        node('p', '', '아래 계산기에 직접 확인한 연 금리를 입력해 월 상환액을 비교할 수 있습니다.'));
      ui.rates.append(empty); return;
    }
    rows.slice(0, 6).forEach(row => {
      const evidence = financeSeriesState(row, settings());
      const primary = row.id === 'mortgage_new';
      const card = node('article', `finance-rate-card ${primary ? 'finance-rate-primary' : ''}`);
      const top = node('div', 'finance-rate-card-top');
      top.append(node('span', 'finance-kind', { average: '평균 금리', policy: '정책 금리', product: '상품 금리' }[row.kind] || '금리 자료'),
        node('span', `finance-badge ${evidence.status}`, evidence.label));
      const value = node('div', 'finance-rate-value');
      value.append(node('strong', '', evidence.value === null ? '—' : number(evidence.value, 2)), node('span', '', '연 %'));
      card.append(top, node('h3', '', row.label || '공식 금리'), value);
      const observations = (Array.isArray(row.history) ? row.history : [])
        .filter(point => financeNumber(point?.value) !== null && financeDateLabel(point?.date) !== '미확인'
          && String(point.date).slice(0, Math.min(String(point.date).length, String(row.observationDate).length))
            < String(row.observationDate).slice(0, Math.min(String(point.date).length, String(row.observationDate).length)))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const prior = observations.at(-1);
      if (prior && evidence.value !== null) {
        const delta = evidence.value - Number(prior.value);
        card.append(node('p', `finance-rate-delta ${delta > 0 ? 'rise' : delta < 0 ? 'fall' : ''}`,
          `${financeDateLabel(prior.date)} 대비 ${delta > 0 ? '+' : ''}${number(delta, 2)}%p`));
      }
      card.append(node('p', 'finance-rate-description', row.description || '공식 출처에서 적용 범위를 확인하세요.'));
      card.append(factList([
        [row.kind === 'average' ? '통계 기준' : row.kind === 'policy' ? '결정·적용일' : '적용 기준일', financeDateLabel(row.observationDate)],
        ['공표일', financeDateLabel(row.publishedAt)], ['원문 확인', financeDateLabel(row.checkedAt, { time: true })],
      ], 'finance-rate-dates'));
      if (row.publicationNote) card.append(node('p', 'finance-small-note', row.publicationNote));
      if (evidence.reason) card.append(node('p', 'finance-evidence-warning', evidence.reason));
      card.append(sourceLink(row.sourceName, row.sourceUrl)); ui.rates.append(card);
    });
  }

  function readContext() {
    try { return adaptFinanceDashboardContext(getContext({ regionCode: selectedRegion, band: selectedBand }) || {}); } catch { return {}; }
  }

  function renderHousing() {
    if (!ui) return;
    const data = snapshot?.housing;
    ui.housing.replaceChildren();
    ui.housing.hidden = !data || !Array.isArray(data.indicators) || !data.indicators.length;
    if (ui.housing.hidden) return;
    const ageDays = (new Date(now()).getTime() - Date.parse(data.checkedAt)) / 86_400_000;
    const dated = financeDateLabel(data.observationDate) !== '미확인'
      && financeDateLabel(data.checkedAt) !== '미확인' && safeFinanceSourceUrl(data.sourceUrl);
    const stale = !dated || ageDays > 45 || ageDays < -1 || snapshot.housingLoadFailed;
    ui.housing.append(sectionTitle('주택 공급 참고지표',
      `${financeDateLabel(data.observationDate)} · 수동 확인 자료 · 자동 갱신 미연결${stale ? ' · 갱신 확인 필요' : ''}`));
    const cards = node('div', 'finance-housing-grid');
    data.indicators.slice(0, 6).forEach(metric => {
      const card = node('article', 'finance-card finance-housing-card');
      const top = node('div', 'finance-rate-card-top');
      top.append(node('span', 'finance-kind', metric.scope || '범위 확인 필요'),
        node('span', `finance-badge ${stale ? 'stale' : ''}`, stale ? '이전 자료 · 확인 필요' : '수동 확인 자료'));
      const valid = dated && financeNumber(metric.value) !== null;
      const value = node('p', 'finance-market-value');
      value.append(node('strong', '', valid ? number(metric.value) : '미확인'), node('span', '', valid ? metric.unit || '' : ''));
      card.append(top, node('h3', '', metric.label), value);
      if (valid && financeNumber(metric.changePct) !== null) card.append(node('p', 'finance-housing-change',
        `${metric.changeLabel || '변화'} ${metric.changePct > 0 ? '+' : ''}${number(metric.changePct, 1)}%`));
      card.append(node('p', 'finance-small-note', metric.description || '기준월과 지역 범위를 확인해 비교하세요.'));
      cards.append(card);
    });
    ui.housing.append(cards, node('p', 'finance-small-note',
      `공표 ${financeDateLabel(data.publishedAt)} · 원문 확인 ${financeDateLabel(data.checkedAt, { time: true })} · 전국·수도권 통계이며 선택한 동네의 물량과 다릅니다.`),
      sourceLink(data.sourceName, data.sourceUrl));
  }

  function renderContext() {
    if (!ui) return;
    context = readContext();
    const available = Array.isArray(context.availableRegions) ? context.availableRegions : [];
    const signature = JSON.stringify(available);
    if (ui.regions.dataset.signature !== signature) {
      ui.regions.replaceChildren();
      available.forEach(region => {
        const option = node('option', '', region.label || region.name || region.code);
        option.value = String(region.code || region.regionCode || ''); ui.regions.append(option);
      });
      ui.regions.dataset.signature = signature;
    }
    if (available.length) ui.regions.value = selectedRegion || context.regionCode || String(available[0].code || available[0].regionCode || '');
    ui.regionLabel.hidden = !available.length;
    ui.bandLabel.hidden = !available.length;
    ui.bands.value = selectedBand;
    ui.market.replaceChildren();
    const market = Array.isArray(context.market) ? context.market : [];
    if (context.marketNote) ui.market.append(node('p', 'finance-small-note', context.marketNote));
    market.forEach(metric => {
      const item = node('article', 'finance-market-metric');
      item.append(node('h3', '', metric.label));
      const valid = metric.value !== null && metric.value !== undefined && metric.value !== '' && metric.status !== 'unavailable';
      const value = node('p', 'finance-market-value');
      value.append(node('strong', '', valid ? typeof metric.value === 'number' ? number(metric.value, metric.digits ?? 1) : String(metric.value) : '미확인'),
        node('span', '', valid ? metric.unit || '' : ''));
      item.append(value);
      if (metric.description) item.append(node('p', 'finance-small-note', metric.description));
      if (metric.observationDate) item.append(node('p', 'finance-observation', `기준 ${financeDateLabel(metric.observationDate)}`));
      if (metric.checkedAt) item.append(node('p', 'finance-observation', `수집 ${financeDateLabel(metric.checkedAt, { time: true })}`));
      if (metric.status === 'stale' || metric.status === 'partial') item.append(node('span', 'finance-badge stale', metric.status === 'partial' ? '일부 자료' : '이전 자료 · 갱신 확인 필요'));
      if (metric.sourceName) item.append(sourceLink(metric.sourceName, metric.sourceUrl));
      ui.market.append(item);
    });
    if (!market.length) {
      const empty = node('div', 'finance-market-empty');
      empty.append(node('h3', '', '지역 실거래 자료를 먼저 확인하세요'),
        node('p', '', '같은 지역과 전용면적의 가격·거래량을 함께 살펴보면 평균가격의 착시를 줄일 수 있습니다.'),
        button('실거래 보기', () => onNavigate('market'))); ui.market.append(empty);
    }
    const supply = context.supply;
    if (supply) {
      const section = node('article', 'finance-market-metric finance-market-supply');
      section.append(node('h3', '', '지금 접수 중인 분양·청약'));
      const value = node('p', 'finance-market-value');
      const count = financeNumber(supply.activeCount);
      value.append(node('strong', '', count === null ? '미확인' : number(count)), node('span', '', count === null ? '' : '건'));
      section.append(value, node('p', 'finance-small-note', supply.description || '서울·경기 수집 공고 기준. 공고 수는 입주 세대수가 아닙니다.'));
      if (supply.status === 'stale' || supply.status === 'partial') section.append(node('span', 'finance-badge stale',
        supply.status === 'partial' ? '일부 공급원 자료' : '이전 수집 자료'));
      if (supply.checkedAt) section.append(node('p', 'finance-observation', `수집 ${financeDateLabel(supply.checkedAt, { time: true })}`));
      section.append(button('분양·청약 보기', () => onNavigate('supply'), 'finance-text-button'));
      ui.market.append(section);
    }
    const note = node('p', 'finance-small-note finance-market-footnote', '지역 평균은 공식 가격지수와 다릅니다. 최근월은 신고가 진행 중일 수 있으며, 거래된 집의 구성이 달라져 평균이 움직일 수 있습니다.');
    ui.market.append(note);
    if (context.marketDetailNotes?.length) {
      const details = node('details', 'finance-method'); details.append(node('summary', '', '거래 자료의 비교 기준'));
      context.marketDetailNotes.forEach(text => details.append(node('p', '', text))); ui.market.append(details);
    }
    calculator = synchronizeFinanceDefaults(calculator, context, snapshot, settings());
    updateCalculation(true);
  }

  function updateCalculation(syncInputs = false) {
    if (!ui) return;
    if (syncInputs) Object.entries(ui.fields).forEach(([key, field]) => { field.input.value = calculator[key]; });
    ui.budgetNote.textContent = calculator.amountDefaultSource
      ? `${calculator.amountDefaultSource}${calculator.defaultPrincipal ? ' · 첫 계산은 집값의 50%를 빌리는 예시입니다.' : ''}`
      : '집값과 대출금액을 입력해 나의 계획을 계산해보세요.';
    ui.rateNote.textContent = calculator.rateDefaultSource || '적용할 연 금리를 직접 입력해주세요.';
    const result = calculateMortgage(calculator);
    Object.entries(ui.fields).forEach(([key, field]) => {
      const error = result.errors[key];
      field.input.setAttribute('aria-invalid', String(Boolean(error && calculator.edited[key])));
      const raw = financeNumber(calculator[key]);
      field.helper.textContent = error && calculator.edited[key] ? error
        : key.includes('ManWon') && raw !== null && raw >= 0 ? money(raw) : key === 'termYears' ? '1~50년 · 30년 기본 가정' : '';
      field.helper.className = `finance-field-help${error && calculator.edited[key] ? ' invalid' : ''}`;
    });
    ui.calculation.replaceChildren();
    if (!result.ok) {
      const empty = node('div', 'finance-calculation-empty');
      empty.append(node('span', '', '예상 월 상환액'), node('strong', '', '입력 후 계산'),
        node('p', '', Object.values(result.errors).join(' '))); ui.calculation.append(empty); return;
    }
    const hero = node('div', 'finance-payment');
    hero.append(node('span', '', '예상 월 상환액'));
    const value = node('p'); value.append(node('strong', '', number(result.monthlyPaymentManWon, 1)), node('span', '', '만원 / 월'));
    hero.append(value, node('small', '', `${number(result.principalManWon)}만원 · 연 ${number(result.annualRatePct, 2)}% · ${result.termYears}년`));
    const facts = factList([['매수대금 자기자금', money(result.ownFundsManWon)],
      ['기간 전체 이자', money(result.totalInterestManWon)], ['원금 + 이자 합계', money(result.totalRepaymentManWon)]]);
    const sensitivity = node('div', 'finance-sensitivity');
    sensitivity.append(node('h3', '', '금리가 1%p 바뀐다면'), node('p', '', '대출금·상환기간을 그대로 두고 비교한 월 상환액입니다.'));
    const table = node('table');
    const caption = node('caption', 'finance-sr-only', '금리가 1%포인트 하락·유지·상승할 때 예상 월 상환액'); table.append(caption);
    const head = node('thead'), heading = node('tr');
    ['연 금리', '월 상환액', '현재 가정 대비'].forEach(label => { const cell = node('th', '', label); cell.scope = 'col'; heading.append(cell); });
    head.append(heading); table.append(head);
    const body = node('tbody');
    result.sensitivity.forEach(scenario => {
      const row = node('tr', scenario.delta === 0 ? 'finance-current-scenario' : '');
      const label = node('th', '', `${number(scenario.annualRatePct, 2)}%${scenario.delta === 0 ? ' · 기준' : scenario.clipped ? ' · 하한/상한' : ''}`); label.scope = 'row';
      row.append(label, node('td', '', `${number(scenario.monthlyPaymentManWon, 1)}만원`),
        node('td', scenario.differenceManWon > 0 ? 'rise' : scenario.differenceManWon < 0 ? 'fall' : '', scenario.delta === 0 ? '—'
          : `${scenario.differenceManWon > 0 ? '+' : ''}${number(scenario.differenceManWon, 1)}만원`));
      body.append(row);
    });
    table.append(body); sensitivity.append(table); ui.calculation.append(hero, facts, sensitivity);
  }

  function renderStatus() {
    if (!ui) return;
    ui.reload.disabled = Boolean(loading);
    ui.status.textContent = loading ? '공식 자료 확인 중…'
      : loadFailed ? '자료를 새로 확인하지 못했습니다. 표시된 이전 자료의 확인일을 확인해주세요.'
        : snapshot ? `자료 묶음 생성 ${financeDateLabel(snapshot.generatedAt, { time: true })} · 각 금리의 기준일은 아래에 표시합니다.`
          : '공식 금리 수치를 확인하지 못했습니다. 원문 확인 후 직접 입력할 수 있습니다.';
  }

  function render() {
    if (!mount()) return;
    renderStatus(); renderRates(); renderContext(); renderHousing();
  }

  async function refresh() {
    if (!mount() || destroyed) return;
    if (loading) return loading;
    loadFailed = false;
    const pending = Promise.resolve().then(() => {
      if (typeof fetchSnapshot !== 'function') throw new Error('No snapshot loader');
      return fetchSnapshot();
    }).then(value => {
      if (destroyed) return;
      if (!value || value.schemaVersion !== 1 || !Array.isArray(value.series || value.rates)) throw new Error('Invalid snapshot');
      const previous = snapshot;
      const failedRates = Boolean(value.financeLoadFailed);
      const failedHousing = Boolean(value.housingLoadFailed);
      snapshot = { ...value,
        ...(failedRates ? {
          generatedAt: previous?.generatedAt || value.generatedAt,
          series: (previous?.series || previous?.rates || []).map(row => ({ ...row, status: row.value === null ? 'unavailable' : 'stale' })),
        } : {}),
        ...(failedHousing && previous?.housing ? { housing: previous.housing } : {}),
      };
      loadFailed = failedRates || failedHousing; loaded = true;
    }).catch(() => {
      if (destroyed) return;
      loadFailed = true; loaded = true;
      if (snapshot) {
        snapshot = { ...snapshot, housingLoadFailed: true, series: (snapshot.series || snapshot.rates || []).map(row => ({ ...row, status: row.value === null ? 'unavailable' : 'stale' })) };
      }
    }).finally(() => {
      if (destroyed) return;
      loading = null; render();
    });
    loading = pending; render(); return pending;
  }

  async function activate() {
    render();
    if (!loaded && !loading && !destroyed) await refresh();
    else if (loading) await loading;
  }

  function destroy() { destroyed = true; container?.replaceChildren(); ui = null; }
  return { activate, render, refresh, destroy };
}
