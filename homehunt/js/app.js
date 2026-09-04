import { APP_CONFIG, REGIONS } from './config.js?v=2.5.0';
import {
  loadVisits, saveVisits, downloadJson, loadImportedMarket, saveImportedMarket,
  clearImportedMarket, loadRecentComplexes, rememberComplex, loadComplexHistory, saveComplexHistory,
  loadCompareIds, saveCompareIds, loadShortlist, saveShortlist,
  loadRecommendationFilters, saveRecommendationFilters, loadGeocodeResult, saveGeocodeResult,
  loadSupplyPreferences, saveSupplyPreferences, loadSupplyFavorites, saveSupplyFavorites,
  loadSupplySeen, saveSupplySeen, loadSubscriptionProfile, saveSubscriptionProfile, clearSubscriptionProfile,
} from './storage.js?v=2.5.0';
import { HomeMap } from './naver-map.js?v=2.5.0';
import { formatAreaPair, formatCompactPrice, formatPriceManwon } from './display-format.mjs?v=2.5.0';
import {
  commuteDecision, commuteRank, haversineKm, isGeoPoint,
} from './transport-core.mjs?v=2.5.0';
import {
  evaluateCommuteBalance, expectedTransitProviderCalls, normalizeDestinations,
  quotaAwareCandidateCap,
} from './commute-balance-core.mjs?v=2.5.0';
import { buildVisitBenchmark } from './visit-benchmark-core.mjs?v=2.5.0';
import {
  parseMolitCsv, buildMarketSummary, validateMarketSummary,
  getRegion, getSeries, withChanges, latestRegionComparison, getRecentTransactions,
  fitDampedForecast, monthLabel, normalizeTransaction, bandFor,
} from './market-core.mjs?v=2.5.0';
import {
  MAX_COMPARE, pricePerP33, pruneCompareIds, buildComparisonHighlights,
} from './comparison-core.mjs?v=2.5.0';
import {
  normalizeApartmentSearchText, searchApartmentCatalog, findRelatedApartments,
} from './apartment-search-core.mjs?v=2.5.0';
import {
  classifyComplexFailure, describeComplexAvailability,
} from './complex-availability-core.mjs?v=2.5.0';
import {
  PYEONG_TO_M2, parseRecommendationQuery, filterCatalogForRecommendation,
} from './recommendation-core.mjs?v=2.5.0';
import {
  companySearchStepMessage, decideCompanySearchNextStep,
} from './company-search-core.mjs?v=2.5.0';
import {
  candidateVerificationStatus, destinationFingerprint, historyWindowForVisit,
  reconcileShortlistFingerprints,
} from './recommendation-verification-core.mjs?v=2.5.0';
import {
  filterSupplyNotices, matchesAlertPreferences, noticeStatusAtKst,
  normalizeSupplyNotice, sortSupplyNotices, summarizeSupplyNotices,
} from './supply-core.mjs?v=2.5.0';
import {
  assessNewlywedReadiness, normalizeSubscriptionProfile,
} from './subscription-readiness-core.mjs?v=2.5.0';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const storedVisits = loadVisits();
const initialVisits = storedVisits === null ? [] : storedVisits;
const state = {
  visits: initialVisits,
  compareIds: pruneCompareIds(loadCompareIds(), initialVisits),
  filteredVisits: [],
  selectedVisitId: null,
  resultSort: 'visit-desc',
  currentView: 'recommend',
  marketSummary: null,
  complexRecords: [],
  complexMeta: null,
  complexErrorCode: '',
  complexDemoMode: false,
  complexHistoryMonths: 60,
  charts: { trend: null, forecast: null, complex: null },
  formDraft: null,
  formDraftIsNew: false,
  marketIntentToken: 0,
  complexRequestToken: 0,
  complexAbortController: null,
  complexLoadingStage: '',
  complexLoadingCandidate: null,
  pendingComplexPreference: null,
  marketContextVisit: null,
  transactionsExpanded: false,
  marketPanel: 'summary',
  recommendationResults: [],
  recommendationJobId: '',
  recommendationPollTimer: null,
  recommendationRunning: false,
  recommendationMeta: null,
  recommendationShowingShortlist: false,
  recommendationCommuteScopeTouched: false,
  recommendationCommuteBlockedReason: '',
  recommendationVisibleCount: 50,
  recommendationRunSnapshot: null,
  shortlist: loadShortlist(),
  localMarketConnected: false,
  localMarketKeyConfigured: false,
  localMarketVersion: '',
  localMarketOutdated: false,
  localHistoryMonthsMax: 60,
  localCommuteCandidateLimit: 10,
  transportConfig: {
    transitConfigured: false,
    carConfigured: false,
    transitProvider: '',
    transitProviderPreference: '',
    providers: { kakaoTransitConfigured: false, tmapTransitConfigured: false, naverDirectionsConfigured: false },
  },
  placeSearchConfigured: false,
  companyLocation: null,
  workplaces: [],
  activeWorkplaceId: null,
  commuteQuota: null,
  commuteVerificationRunning: false,
  companyPickerMapReady: false,
  companyPickerSelection: null,
  recommendationMapReady: false,
  recommendationCatalogPreview: [],
  recommendationCatalogPreviewReady: false,
  recommendationCommuteEnriched: false,
  recommendationGeocodeToken: 0,
  supplyFeed: null,
  supplyLoading: false,
  supplyLoadPromise: null,
  supplyMapLocationsReady: false,
  supplySelectedId: '',
  supplyFavorites: loadSupplyFavorites(),
  supplyPreferences: loadSupplyPreferences(),
  supplySeen: loadSupplySeen(),
  subscriptionProfile: normalizeSubscriptionProfile(loadSubscriptionProfile() || {}),
  supplyFilters: { query: '', region: 'all', status: 'active', program: 'all', favoritesOnly: false, sort: 'deadline' },
};

const homeMap = new HomeMap(APP_CONFIG.naverMapClientId);
const recommendationMap = new HomeMap(APP_CONFIG.naverMapClientId);
const companyPickerMap = new HomeMap(APP_CONFIG.naverMapClientId);
let staticApartmentHistoryPromise;
let lawDistrictsPromise;
let apartmentCatalogPromise;
let complexSuggestionTimer;
let complexSuggestionToken = 0;
let mapSearchToken = 0;
let visitAddressSearchToken = 0;
let companyGeocodeToken = 0;
let companyPickerSearchToken = 0;
let companyPickerClickToken = 0;
let companyPickerMapInitPromise = null;
let companyPostcodeScriptPromise = null;
let companyPostcodeOpener = null;
let recommendationRunToken = 0;
let recommendationCatalogPreviewPromise = null;
let supplyMapGeocodePromise = null;
const MAX_RECOMMENDATION_MAP_CANDIDATES = 600;
// This is deliberately tiny: these are orientation pins, not verified search results.
const MAX_RECOMMENDATION_CATALOG_PREVIEW = 12;
// Keep the map readable while still locating every currently actionable notice in ordinary feeds.
const MAX_RECOMMENDATION_SUPPLY_MARKERS = 24;
const MAX_KAKAO_SCREENING_CANDIDATES = 50;
const KAKAO_PUBLIC_TRANSIT_DAILY_BUDGET = 1000;
const RECOMMENDATION_LAYER_CONTROLS = Object.freeze({
  apartments: 'recommendationLayerApartments',
  supply: 'recommendationLayerSupply',
  visits: 'recommendationLayerVisits',
  shortlist: 'recommendationLayerShortlist',
  workplaces: 'recommendationLayerWorkplaces',
});

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function tablerIconName(value, tone = '') {
  const normalized = String(value || '').trim();
  if (normalized === '↻' || tone === 'loading') return 'loader-2';
  if (normalized === '↔') return 'switch-horizontal';
  if (normalized === '✓' || tone === 'success') return 'circle-check';
  if (tone === 'error') return 'alert-circle';
  if (normalized === '!' || tone === 'warning') return 'alert-triangle';
  if (normalized === '⌂' || tone === 'choice') return 'home-search';
  return 'info-circle';
}

function setTablerIcon(container, name) {
  const icon = createElement('i', `ti ti-${name}`);
  icon.setAttribute('aria-hidden', 'true');
  container.replaceChildren(icon);
  return container;
}

function numberValue(value) {
  const parsed = Number(String(value || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function versionIsOlder(current, required) {
  const parts = (value) => String(value || '').split('.').map((item) => Number.parseInt(item, 10) || 0);
  const left = parts(current);
  const right = parts(required);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) < (right[index] || 0);
  }
  return false;
}

function freeSearchTokens(value) {
  return [...new Set(String(value || '').normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/gu)
    .map(normalizeApartmentSearchText)
    .filter(Boolean))];
}

function matchesFreeSearch(searchable, query) {
  const haystack = normalizeApartmentSearchText(searchable);
  const tokens = freeSearchTokens(query);
  return !tokens.length || tokens.every((token) => haystack.includes(token));
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatDate(value) {
  if (!value) return '날짜 미정';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

const formatPrice = formatPriceManwon;

function formatP33(amount) {
  if (!Number.isFinite(Number(amount))) return '—';
  return `평당 ${formatPriceManwon(amount)}`;
}

function statusClass(status) {
  return status === '재방문' ? 'revisit' : status === '보류' ? 'hold' : status === '제외' ? 'rejected' : 'interested';
}

function naverLandUrl(name) {
  const cleaned = String(name || '').replace(/^예시\s*·\s*/, '').trim();
  return `https://m.land.naver.com/search/result/${encodeURIComponent(cleaned)}`;
}

let toastTimer;
const modalOpeners = new Map();
const MODAL_IDS = ['visitModal', 'compareModal', 'apiGuideModal', 'localKeyModal', 'companyLocationModal', 'supplyAlertModal', 'supplyMatchModal'];

function setModalBackgroundInert(inert) {
  ['.portal-header', '.portal-main', '#compareTray'].forEach((selector) => {
    const element = $(selector);
    if (element) element.toggleAttribute('inert', inert);
  });
}

function openModalShell(modalId, focusSelector) {
  const modal = $(`#${modalId}`);
  if (!modal) return;
  modalOpeners.set(modalId, document.activeElement instanceof HTMLElement ? document.activeElement : null);
  modal.hidden = false;
  setModalBackgroundInert(true);
  document.body.style.overflow = 'hidden';
  window.setTimeout(() => {
    if (modal.hidden) return;
    const focusTarget = focusSelector ? $(focusSelector, modal) : null;
    const fallback = $('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', modal);
    (focusTarget || fallback)?.focus();
  }, 30);
}

function closeModalShell(modalId) {
  const modal = $(`#${modalId}`);
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  const anotherModalOpen = MODAL_IDS.some((id) => id !== modalId && !$(`#${id}`).hidden);
  if (!anotherModalOpen) {
    setModalBackgroundInert(false);
    document.body.style.overflow = '';
    const opener = modalOpeners.get(modalId);
    const focusTarget = opener?.isConnected && opener.getClientRects().length ? opener : $('.portal-nav-item.active');
    focusTarget?.focus();
  }
  modalOpeners.delete(modalId);
}
function showToast(message, type = 'info') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', type === 'error');
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
}

function selectedCompareVisits() {
  const visitsById = new Map(state.visits.map((visit) => [String(visit.id), visit]));
  return state.compareIds.map((id) => visitsById.get(String(id))).filter(Boolean);
}

function persistCompareSelection() {
  state.compareIds = pruneCompareIds(state.compareIds, state.visits);
  saveCompareIds(state.compareIds);
}

function toggleCompare(visitId) {
  const id = String(visitId);
  if (state.compareIds.includes(id)) {
    state.compareIds = state.compareIds.filter((item) => item !== id);
    persistCompareSelection();
    renderAllVisits();
    showToast('비교함에서 뺐어요.');
    return;
  }
  if (state.compareIds.length >= MAX_COMPARE) {
    showToast(`후보는 최대 ${MAX_COMPARE}곳까지 비교할 수 있어요.`, 'error');
    return;
  }
  state.compareIds.push(id);
  persistCompareSelection();
  renderAllVisits();
  showToast('후보 비교함에 담았어요.');
}

function clearCompareSelection() {
  state.compareIds = [];
  persistCompareSelection();
  renderAllVisits();
  showToast('후보 비교함을 비웠어요.');
}

function appendCompareRow(body, label, visits, renderer, className = '') {
  const row = document.createElement('tr');
  if (className) row.className = className;
  const heading = createElement('th', '', label);
  heading.scope = 'row';
  row.appendChild(heading);
  visits.forEach((visit) => {
    const cell = document.createElement('td');
    const rendered = renderer(visit);
    if (rendered instanceof Node) cell.appendChild(rendered);
    else cell.textContent = rendered || '—';
    row.appendChild(cell);
  });
  body.appendChild(row);
}

function renderCompareInsights(visits) {
  const root = $('#compareInsights');
  const warning = $('#compareWarning');
  root.replaceChildren();
  warning.hidden = true;
  warning.textContent = '';
  if (visits.length < 2) {
    const tip = createElement('div', 'compare-insight compare-insight-tip');
    tip.append(createElement('span', '', 'NEXT STEP'), createElement('strong', '', '한 곳을 더 담으면 차이가 보여요.'), createElement('p', '', '가격·면적·역 거리·준공연도를 사실 기준으로 표시합니다.'));
    root.appendChild(tip);
    return;
  }
  const highlights = buildComparisonHighlights(visits);
  const visitMap = new Map(visits.map((visit) => [String(visit.id), visit]));
  const definitions = [
    ['price', '확인 총액이 낮음', (value) => formatPrice(value)],
    ['priceP33', '3.3㎡ 환산이 낮음', (value) => formatPriceManwon(value)],
    ['area', '전용면적이 넓음', (value) => formatAreaPair(value)],
    ['walk', '역까지 가까움', (value) => `${value.toLocaleString('ko-KR')}분`],
    ['builtYear', '준공연도가 최근', (value) => `${value}년`],
  ];
  definitions.forEach(([key, label, formatter]) => {
    const highlight = highlights[key];
    if (!highlight?.visitIds?.length) return;
    const names = highlight.visitIds.map((id) => visitMap.get(id)?.name).filter(Boolean).join(' · ');
    const card = createElement('article', 'compare-insight');
    card.append(createElement('span', '', label), createElement('strong', '', names), createElement('p', '', formatter(highlight.value)));
    root.appendChild(card);
  });
  const reason = highlights.price?.reason;
  if (reason) {
    warning.hidden = false;
    warning.textContent = reason === 'mixed-deal-type'
      ? '매매와 전세가 섞여 있어 가격 우열은 표시하지 않았습니다. 면적·역 거리·연식은 그대로 비교할 수 있어요.'
      : reason === 'monthly-rent-not-comparable'
        ? '월세는 보증금과 월세를 분리하지 않은 확인 가격만으로 직접 비교할 수 없어 가격 우열을 표시하지 않았습니다.'
        : '거래 유형이 비어 있거나 지원 범위 밖인 후보가 있어 가격 우열을 표시하지 않았습니다.';
  }
}

function renderCompareTable(visits) {
  const head = $('#compareTableHead');
  const body = $('#compareTableBody');
  const headRow = document.createElement('tr');
  const labelHead = createElement('th', 'compare-row-label', '비교 항목');
  labelHead.scope = 'col';
  headRow.appendChild(labelHead);
  visits.forEach((visit) => {
    const cell = document.createElement('th');
    cell.scope = 'col';
    const top = createElement('div', 'compare-home-head');
    const status = createElement('span', `property-status ${statusClass(visit.status)}`, visit.status);
    const remove = createElement('button', '', '비교 해제');
    remove.type = 'button';
    remove.addEventListener('click', () => toggleCompare(visit.id));
    top.append(status, remove);
    cell.append(top, createElement('strong', 'compare-home-name', visit.name), createElement('small', 'compare-home-address', visit.address));
    headRow.appendChild(cell);
  });
  head.replaceChildren(headRow);
  body.replaceChildren();

  appendCompareRow(body, '거래·확인 가격', visits, (visit) => {
    const value = createElement('div', 'compare-price');
    value.append(createElement('small', '', visit.dealType || '거래 유형 미정'), createElement('strong', '', formatPrice(visit.askingPrice)));
    return value;
  });
  appendCompareRow(body, '전용면적·환산', visits, (visit) => {
    const value = createElement('div', 'compare-stack');
    value.append(createElement('strong', '', visit.areaM2 ? formatAreaPair(visit.areaM2) : '면적 미정'));
    const supportsPricePerArea = ['매매', '전세'].includes(visit.dealType);
    const p33 = supportsPricePerArea ? pricePerP33(visit) : null;
    value.append(createElement('small', '', p33
      ? `확인가 3.3㎡당 ${formatPriceManwon(p33)}`
      : supportsPricePerArea ? '3.3㎡ 환산 불가' : '월세 가격 구조상 3.3㎡ 환산 제외'));
    return value;
  });
  appendCompareRow(body, '층·준공', visits, (visit) => [visit.floor ? `${visit.floor}층` : '', visit.builtYear ? `${visit.builtYear}년 준공` : ''].filter(Boolean).join(' · '));
  appendCompareRow(body, '단지·교통', visits, (visit) => [visit.households ? `${Number(visit.households).toLocaleString('ko-KR')}세대` : '', visit.walkMinutes ? `역 도보 ${visit.walkMinutes}분` : ''].filter(Boolean).join(' · '));
  appendCompareRow(body, '방향·방문', visits, (visit) => {
    const value = createElement('div', 'compare-stack');
    value.append(createElement('strong', '', visit.direction || '방향 미정'));
    value.append(createElement('small', '', `${formatDate(visit.visitDate)} · ${(visit.visitedBy || []).join('·') || '방문자 미정'}`));
    return value;
  });
  appendCompareRow(body, '좋았던 점', visits, (visit) => visit.pros || '기록 없음', 'compare-note-row positive');
  appendCompareRow(body, '걱정되는 점', visits, (visit) => visit.cons || '기록 없음', 'compare-note-row negative');
  appendCompareRow(body, '현장 메모', visits, (visit) => visit.memo || '기록 없음', 'compare-note-row');
  appendCompareRow(body, '바로 확인', visits, (visit) => {
    const actions = createElement('div', 'compare-cell-actions');
    const map = createElement('button', '', '지도');
    map.type = 'button';
    map.addEventListener('click', () => {
      closeCompareModal();
      setView('map');
      window.setTimeout(() => selectVisit(visit.id, true), 70);
    });
    const market = createElement('button', '', '면적 맞춤 실거래');
    market.type = 'button';
    market.dataset.openMarketComplex = `context:visit:${visit.id}`;
    market.dataset.marketBound = 'true';
    market.addEventListener('click', () => {
      closeCompareModal();
      openMarketForVisit(visit);
    });
    const edit = createElement('button', '', '기록 수정');
    edit.type = 'button';
    edit.addEventListener('click', () => {
      closeCompareModal();
      openVisitModal(visit);
    });
    actions.append(map, market, edit);
    return actions;
  }, 'compare-actions-row');
}

function renderCompareModalContent() {
  const visits = selectedCompareVisits();
  $('#compareEmpty').hidden = visits.length > 0;
  $('#compareContent').hidden = visits.length === 0;
  if (!visits.length) return;
  renderCompareInsights(visits);
  renderCompareTable(visits);
}

function renderCompareUi() {
  const visits = selectedCompareVisits();
  const tray = $('#compareTray');
  const modalOpen = !$('#compareModal').hidden;
  const focusedInsideModal = modalOpen && $('#compareModal').contains(document.activeElement);
  $('#compareTrayCount').textContent = visits.length;
  $('#archiveCompareCount').textContent = visits.length;
  $('#openCompareFromArchive').disabled = visits.length === 0;
  tray.hidden = visits.length === 0;
  document.body.classList.toggle('has-compare-tray', visits.length > 0);
  const chips = $('#compareTrayChips');
  chips.replaceChildren(...visits.map((visit) => {
    const button = createElement('button', '', visit.name);
    button.type = 'button';
    button.title = `${visit.name} 비교함에서 빼기`;
    button.addEventListener('click', () => toggleCompare(visit.id));
    return button;
  }));
  $$('[data-compare-id]').forEach((button) => {
    const active = state.compareIds.includes(String(button.dataset.compareId));
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? '비교 해제' : '비교';
  });
  if (modalOpen) {
    renderCompareModalContent();
    if (focusedInsideModal && !$('#compareModal').contains(document.activeElement)) $('#closeCompareModal').focus();
  }
}

function openCompareModal() {
  if (!state.compareIds.length) return showToast('비교할 후보를 먼저 담아주세요.', 'error');
  renderCompareModalContent();
  openModalShell('compareModal', '#closeCompareModal');
}

function closeCompareModal() {
  closeModalShell('compareModal');
}

function populateRegionControls() {
  const datalist = $('#districtSuggestions');
  const values = [...new Set(REGIONS.flatMap((region) => [region.name, region.district]).filter(Boolean))];
  datalist.replaceChildren(...values.map((value) => {
    const option = document.createElement('option');
    option.value = value;
    return option;
  }));
}

function getMapFilters() {
  const dealType = $('.choice-chip.active[data-filter-deal]')?.dataset.filterDeal || '매매';
  const area = $('.choice-chip.active[data-filter-area]')?.dataset.filterArea || 'all';
  const statuses = new Set($$('[data-status-filter]:checked').map((input) => input.value));
  return {
    dealType,
    area,
    district: $('#filterDistrict').value,
    minPrice: numberValue($('#filterPriceMin').value),
    maxPrice: numberValue($('#filterPriceMax').value),
    statuses,
    both: $('#visitedByBoth').checked,
  };
}

function filterVisits(visits, filters) {
  return visits.filter((visit) => {
    if (visit.dealType !== filters.dealType) return false;
    if (filters.district) {
      const searchable = [
        visit.name, visit.address, ...(visit.tags || []), visit.memo,
      ].filter(Boolean).join(' ');
      if (!matchesFreeSearch(searchable, filters.district)) return false;
    }
    if (filters.minPrice && Number(visit.askingPrice) < filters.minPrice) return false;
    if (filters.maxPrice && Number(visit.askingPrice) > filters.maxPrice) return false;
    if (!filters.statuses.has(visit.status)) return false;
    const area = Number(visit.areaM2) || 0;
    if (filters.area === 'lt60' && area >= 60) return false;
    if (filters.area === '60_85' && (area < 60 || area >= 85)) return false;
    if (filters.area === 'gte85' && area < 85) return false;
    if (filters.both && (!(visit.visitedBy || []).includes('성우') || !(visit.visitedBy || []).includes('소희'))) return false;
    return true;
  });
}

function sortVisits(visits, sort = state.resultSort) {
  return [...visits].sort((a, b) => {
    if (sort === 'price-asc') return Number(a.askingPrice || Infinity) - Number(b.askingPrice || Infinity);
    if (sort === 'price-desc') return Number(b.askingPrice || 0) - Number(a.askingPrice || 0);
    if (sort === 'area-desc') return Number(b.areaM2 || 0) - Number(a.areaM2 || 0);
    return String(b.visitDate || '').localeCompare(String(a.visitDate || ''));
  });
}

function makePropertyCard(visit) {
  const article = createElement('article', `property-card${visit.id === state.selectedVisitId ? ' selected' : ''}`);
  article.dataset.visitId = visit.id;
  const main = createElement('button', 'property-card-button');
  main.type = 'button';
  main.addEventListener('click', () => selectVisit(visit.id, true));

  const top = createElement('div', 'property-card-top');
  top.append(createElement('span', `property-status ${statusClass(visit.status)}`, visit.status));
  top.append(createElement('span', 'property-visit-date', formatDate(visit.visitDate)));
  main.append(top, createElement('h3', '', visit.name), createElement('p', 'property-address', visit.address));

  const price = createElement('div', 'property-price', formatPrice(visit.askingPrice));
  price.append(createElement('small', '', visit.dealType));
  main.appendChild(price);

  const specs = createElement('div', 'property-specs');
  if (visit.areaM2) specs.append(createElement('span', '', formatAreaPair(visit.areaM2)));
  if (visit.floor) specs.append(createElement('span', '', `${visit.floor}층`));
  if (visit.builtYear) specs.append(createElement('span', '', `${visit.builtYear}년`));
  if (visit.walkMinutes) specs.append(createElement('span', '', `역 도보 ${visit.walkMinutes}분`));
  main.appendChild(specs);

  const tags = createElement('div', 'property-tags');
  (visit.tags || []).slice(0, 4).forEach((tag) => tags.append(createElement('span', '', `#${tag}`)));
  main.appendChild(tags);
  article.appendChild(main);

  const foot = createElement('div', 'property-card-foot');
  const edit = createElement('button', '', '수정');
  edit.type = 'button';
  edit.addEventListener('click', () => openVisitModal(visit));
  const market = createElement('button', '', '실거래');
  market.type = 'button';
  market.dataset.openMarketComplex = `context:visit:${visit.id}`;
  market.dataset.marketBound = 'true';
  market.addEventListener('click', () => openMarketForVisit(visit));
  const compare = createElement('button', 'compare-toggle', state.compareIds.includes(String(visit.id)) ? '비교 해제' : '비교');
  compare.type = 'button';
  compare.dataset.compareId = visit.id;
  compare.setAttribute('aria-pressed', String(state.compareIds.includes(String(visit.id))));
  compare.addEventListener('click', () => toggleCompare(visit.id));
  const land = createElement('a', '', '네이버');
  land.href = naverLandUrl(visit.name);
  land.target = '_blank';
  land.rel = 'noopener noreferrer';
  foot.append(edit, market, compare, land);
  article.appendChild(foot);
  return article;
}

function renderPropertyList() {
  const filters = getMapFilters();
  state.filteredVisits = sortVisits(filterVisits(state.visits, filters));
  $('#resultCount').textContent = state.filteredVisits.length;
  $('#mapResultToggleCount').textContent = state.filteredVisits.length.toLocaleString('ko-KR');
  const list = $('#propertyList');
  list.replaceChildren(...state.filteredVisits.map(makePropertyCard));
  $('#propertyEmpty').hidden = state.filteredVisits.length > 0;
  list.hidden = state.filteredVisits.length === 0;
  homeMap.setRecords(state.filteredVisits);
  renderMapActiveFilters(filters);
}

function renderMapActiveFilters(filters = getMapFilters()) {
  const root = $('#mapActiveFilterChips');
  if (!root) return;
  const areaLabels = { all: '면적 전체', lt60: '60㎡ 미만', '60_85': '60–85㎡', gte85: '85㎡ 이상' };
  const clauses = [filters.dealType, filters.district || '지역 전체'];
  if (filters.minPrice || filters.maxPrice) {
    const minimum = filters.minPrice ? formatPrice(filters.minPrice) : '0원';
    const maximum = filters.maxPrice ? formatPrice(filters.maxPrice) : '제한 없음';
    clauses.push(`${minimum}–${maximum}`);
  }
  clauses.push(areaLabels[filters.area] || '면적 전체');
  if (filters.both) clauses.push('둘이 본 집');
  const selectedStatuses = [...filters.statuses];
  if (selectedStatuses.length && selectedStatuses.length < 4) clauses.push(selectedStatuses.join('·'));
  root.replaceChildren(...clauses.map((label) => {
    const button = createElement('button', 'map-filter-chip', label);
    button.type = 'button';
    button.addEventListener('click', () => setMapPanel('filters'));
    return button;
  }));
}

function makeArchiveRow(visit) {
  const row = document.createElement('tr');
  const homeCell = document.createElement('td');
  homeCell.append(createElement('strong', '', visit.name), createElement('small', '', visit.address));
  const dateCell = createElement('td', '', formatDate(visit.visitDate));
  const priceCell = document.createElement('td');
  priceCell.append(createElement('div', 'table-price', formatPrice(visit.askingPrice)), createElement('small', '', visit.dealType));
  const specCell = createElement('td', '', `${visit.areaM2 ? formatAreaPair(visit.areaM2) : '면적 미정'} · ${visit.floor || '—'}층`);
  const statusCell = document.createElement('td');
  statusCell.append(createElement('span', `property-status ${statusClass(visit.status)}`, visit.status));
  const actionsCell = createElement('td', 'table-actions');
  const view = createElement('button', '', '지도');
  view.type = 'button';
  view.addEventListener('click', () => { setView('map'); window.setTimeout(() => selectVisit(visit.id, true), 50); });
  const edit = createElement('button', '', '수정');
  edit.type = 'button';
  edit.addEventListener('click', () => openVisitModal(visit));
  const market = createElement('button', '', '실거래');
  market.type = 'button';
  market.dataset.openMarketComplex = `context:visit:${visit.id}`;
  market.dataset.marketBound = 'true';
  market.addEventListener('click', () => openMarketForVisit(visit));
  const compare = createElement('button', 'compare-toggle', state.compareIds.includes(String(visit.id)) ? '비교 해제' : '비교');
  compare.type = 'button';
  compare.dataset.compareId = visit.id;
  compare.setAttribute('aria-pressed', String(state.compareIds.includes(String(visit.id))));
  compare.addEventListener('click', () => toggleCompare(visit.id));
  actionsCell.append(view, edit, market, compare);
  row.append(homeCell, dateCell, priceCell, specCell, statusCell, actionsCell);
  return row;
}

function renderArchive() {
  const query = $('#archiveSearch').value.trim();
  const status = $('#archiveStatus').value;
  const sort = $('#archiveSort').value;
  const rows = sortVisits(state.visits.filter((visit) => {
    if (status && visit.status !== status) return false;
    if (!query) return true;
    const searchable = [
      visit.name, visit.address, visit.dealType, visit.status, visit.direction,
      visit.memo, visit.pros, visit.cons, ...(visit.tags || []), ...(visit.visitedBy || []),
    ].join(' ');
    return matchesFreeSearch(searchable, query);
  }), sort);
  $('#archiveTableBody').replaceChildren(...rows.map(makeArchiveRow));
  const empty = $('#archiveEmpty');
  const hasSavedVisits = state.visits.length > 0;
  empty.hidden = rows.length > 0;
  $('strong', empty).textContent = hasSavedVisits ? '검색 조건에 맞는 기록이 없어요.' : '아직 저장한 집이 없어요.';
  $('p', empty).textContent = hasSavedVisits ? '검색어·상태 조건을 바꾸거나 모두 지워보세요.' : '지도에서 위치를 찾고 첫 방문 기록을 남겨보세요.';
  $('#resetArchiveFilters').hidden = !hasSavedVisits || rows.length > 0;
  $('.archive-table').hidden = rows.length === 0;
}

function renderAllVisits() {
  renderPropertyList();
  renderArchive();
  renderCompareUi();
  if (state.recommendationMapReady) void refreshRecommendationMapLayers();
}

let mapPanelOpener = null;
let recommendationPanelOpener = null;

function setMapPanel(panel = '', { restoreFocus = false } = {}) {
  const workspace = $('.property-workspace');
  const filterPanel = $('#mapFilterPanel');
  const resultPanel = $('#mapResultPanel');
  const next = panel === 'filters' || panel === 'results' ? panel : '';
  if (next) mapPanelOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  workspace?.classList.toggle('filters-open', next === 'filters');
  workspace?.classList.toggle('results-open', next === 'results');
  filterPanel?.classList.toggle('mobile-open', next === 'filters');
  filterPanel?.setAttribute('aria-hidden', String(next !== 'filters'));
  resultPanel?.setAttribute('aria-hidden', String(next !== 'results'));
  if (filterPanel) filterPanel.inert = next !== 'filters';
  if (resultPanel) resultPanel.inert = next !== 'results';
  $('#toggleMobileFilters')?.setAttribute('aria-expanded', String(next === 'filters'));
  $('#toggleMapResults')?.setAttribute('aria-expanded', String(next === 'results'));
  $('#mobileFilterBackdrop').hidden = !next;
  window.requestAnimationFrame(() => homeMap.resize());
  if (!next && restoreFocus && mapPanelOpener?.isConnected) mapPanelOpener.focus();
  if (!next) mapPanelOpener = null;
}

function setMobileFilters(open) {
  setMapPanel(open ? 'filters' : '');
}

function setRecommendationPanel(panel = '', { restoreFocus = false } = {}) {
  const page = $('.recommendation-page');
  const filterPanel = $('#recommendationFilterPanel');
  const resultPanel = $('#recommendationResultPanel');
  const next = panel === 'filters' || panel === 'results' ? panel : '';
  if (next) recommendationPanelOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  page?.classList.toggle('filters-open', next === 'filters');
  page?.classList.toggle('results-open', next === 'results');
  filterPanel?.setAttribute('aria-hidden', String(next !== 'filters'));
  resultPanel?.setAttribute('aria-hidden', String(next !== 'results'));
  if (filterPanel) filterPanel.inert = next !== 'filters';
  if (resultPanel) resultPanel.inert = next !== 'results';
  $('#toggleRecommendationFilters')?.setAttribute('aria-expanded', String(next === 'filters'));
  $('#toggleRecommendationResults')?.setAttribute('aria-expanded', String(next === 'results'));
  $('#recommendationPanelBackdrop').hidden = !next;
  window.requestAnimationFrame(() => recommendationMap.resize());
  if (!next && restoreFocus && recommendationPanelOpener?.isConnected) recommendationPanelOpener.focus();
  if (!next) recommendationPanelOpener = null;
}

function selectVisit(id, focusMap = false) {
  state.selectedVisitId = id;
  $$('.property-card').forEach((card) => card.classList.toggle('selected', card.dataset.visitId === id));
  if (focusMap) homeMap.focus(id);
  if (state.currentView === 'map') setMapPanel('results');
}

function safeExternalUrl(value, fallback = '') {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
  } catch (_) {
    return fallback;
  }
}

function supplyRegionLabel(notice) {
  const location = Array.isArray(notice?.locations) ? notice.locations[0] : null;
  const value = String(notice?.region || notice?.province || notice?.sido || notice?.regionName || location?.sido || location?.regionKey || '');
  if (value.includes('서울')) return '서울';
  if (value.includes('경기') || value === 'gyeonggi') return '경기';
  if (value === 'seoul') return '서울';
  return value || '지역 확인';
}

function supplyLocation(notice) {
  const location = Array.isArray(notice?.locations) ? notice.locations[0] || {} : {};
  return {
    district: String(notice?.district || location.district || ''),
    address: String(notice?.address || location.address || ''),
  };
}

function supplyNewlywedUnits(notice) {
  const value = Number(notice?.newlywedUnits ?? notice?.specialSupply?.newlywedUnits);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function supplyIsNewlywed(notice) {
  return Boolean(notice?.isNewlywedTown || notice?.program === 'newlywed-town' || notice?.newlywedSupplyAvailable === true || Number(supplyNewlywedUnits(notice)) > 0
    || (notice?.targetGroups || []).some((group) => /신혼/.test(String(group))));
}

function supplyPrice(notice) {
  const direct = Number(notice?.maxPriceManWon);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const values = (notice?.homes || []).map((home) => Number(home.maxPriceManWon)).filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : null;
}

function supplyAreaRange(notice) {
  const values = [notice?.minAreaM2, notice?.maxAreaM2, ...(notice?.homes || []).flatMap((home) => [home.areaM2, home.minAreaM2, home.maxAreaM2])]
    .map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return '주택형 공고문 확인';
  const min = Math.min(...values);
  const max = Math.max(...values);
  return Math.abs(max - min) < .1
    ? formatAreaPair(min)
    : `${min.toFixed(0)}–${max.toFixed(0)}㎡ · 약 ${(min / 3.3).toFixed(1)}–${(max / 3.3).toFixed(1)}평`;
}

function supplySchedules(notice) {
  const source = Array.isArray(notice?.schedules) ? notice.schedules : [];
  return source.map((schedule) => ({
    ...schedule,
    kind: String(schedule.kind || schedule.type || 'general'),
    label: String(schedule.label || (/special|newlywed/i.test(schedule.kind || '') ? '특별공급' : '일반공급')),
    startDate: String(schedule.startDate || schedule.start || ''),
    endDate: String(schedule.endDate || schedule.end || schedule.startDate || schedule.start || ''),
  })).filter((schedule) => schedule.startDate || schedule.endDate);
}

function supplyDateValue(value) {
  const normalized = String(value || '').replace(/\./g, '-').replace(/\//g, '-').slice(0, 10);
  const date = new Date(`${normalized}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function supplyShortDate(value) {
  const date = supplyDateValue(value);
  return date ? date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' }) : '일정 확인';
}

function supplyPrimarySchedule(notice) {
  const now = new Date();
  const allSchedules = supplySchedules(notice);
  const applicationSchedules = allSchedules.filter((schedule) => schedule.kind === 'application');
  const schedules = (applicationSchedules.length ? applicationSchedules : allSchedules).map((schedule) => ({
    ...schedule,
    start: supplyDateValue(schedule.startDate),
    end: supplyDateValue(schedule.endDate || schedule.startDate),
  }));
  const active = schedules.filter((schedule) => schedule.end && schedule.end.getTime() + 86400000 > now.getTime())
    .sort((a, b) => (a.start?.getTime() || Infinity) - (b.start?.getTime() || Infinity));
  return active[0] || schedules.sort((a, b) => (b.end?.getTime() || 0) - (a.end?.getTime() || 0))[0] || null;
}

function supplyDDay(schedule) {
  if (!schedule) return '일정 확인';
  const now = new Date();
  const today = new Date(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) + 'T00:00:00+09:00');
  const start = schedule.start || supplyDateValue(schedule.startDate);
  const end = schedule.end || supplyDateValue(schedule.endDate || schedule.startDate);
  if (!start || !end) return '일정 확인';
  const startDiff = Math.ceil((start - today) / 86400000);
  const endDiff = Math.ceil((end - today) / 86400000);
  const isNoticeWindow = schedule.kind === 'notice-window';
  if (startDiff > 0) return `D-${startDiff}`;
  if (endDiff >= 0) return endDiff === 0 ? (isNoticeWindow ? '오늘 공고 종료' : '오늘 마감') : `${isNoticeWindow ? '공고' : '마감'} D-${endDiff}`;
  return isNoticeWindow ? '공고 종료' : '접수 마감';
}

function supplyStatusMeta(notice) {
  const status = noticeStatusAtKst(notice, new Date());
  if (status === 'open') return { status, label: '접수 중', className: 'open' };
  if (status === 'upcoming') return { status, label: '접수 예정', className: 'upcoming' };
  if (status === 'closed') return { status, label: '접수 마감', className: '' };
  return { status, label: '일정 확인', className: '' };
}

function supplyProgramLabel(notice) {
  if (notice?.isNewlywedTown || notice?.program === 'newlywed-town') return '신혼희망타운';
  const program = String(notice?.program || notice?.category || notice?.housingType || '');
  if (/잔여|무순위|remaining/i.test(program)) return '잔여세대';
  if (/임의|optional/i.test(program)) return '임의공급';
  if (/임대|rent/i.test(program)) return '공공임대';
  if (/공공|국민|public-sale/i.test(program)) return '공공분양';
  if (/민영|민간|private-sale/i.test(program)) return '민간분양';
  return program && !/^(apt|sale)$/i.test(program) ? program : '아파트 분양';
}

function renderSupplyUnreadBadge() {
  const count = state.supplySeen?.unreadIds?.length || 0;
  const badge = $('#supplyNavBadge');
  badge.hidden = count === 0;
  badge.textContent = count > 99 ? '99+' : String(count);
  $('#supplyNewCount').textContent = count.toLocaleString('ko-KR');
}

function setSupplyConnection(payload, error = null) {
  const sources = Array.isArray(payload?.sources) ? payload.sources : [];
  const successful = sources.filter((source) => ['ok', 'live', 'success'].includes(String(source.status || '').toLowerCase()));
  const partial = Boolean(error) || payload?.fallbackReason || !sources.length || successful.length < sources.length
    || payload?.complete === false || payload?.coverage?.complete === false || payload?.coverage?.status === 'partial';
  const stateElement = $('#supplyConnectionState');
  stateElement.className = `service-state ${error ? 'failed' : partial ? 'partial' : 'connected'}`;
  stateElement.textContent = error ? '연결 확인 필요' : partial ? '일부 연결' : '공식 공고 연결';
  const sourceFor = (pattern) => sources.find((source) => pattern.test(String(source.id || source.name || source.label || '')));
  const line = (selector, source, label) => {
    const element = $(selector);
    if (!element) return;
    if (!source) element.textContent = `${label}: 아직 수집 기록 없음`;
    else {
      const sourceCount = Number.isFinite(Number(source.count))
        ? Number(source.count)
        : (payload?.notices || []).filter((notice) => String(notice.source || '').toLowerCase() === String(source.id || '').toLowerCase()).length;
      element.textContent = `${label}: ${['ok', 'live', 'success'].includes(String(source.status || '').toLowerCase()) ? `${sourceCount.toLocaleString('ko-KR')}건 수집` : source.message || '재확인 필요'}`;
    }
  };
  line('#supplyApplyhomeCheck', sourceFor(/apply|청약홈/i), '청약홈');
  line('#supplyLhCheck', sourceFor(/(^|[^a-z])lh([^a-z]|$)|청약플러스/i), 'LH');
  line('#supplyShCheck', sourceFor(/(^|[^a-z])sh([^a-z]|$)|서울주택/i), 'SH 공식 RSS');
}

function supplySourceSummary(payload, error = null) {
  const strip = $('#supplySourceStrip');
  const dot = $('.supply-live-dot', strip);
  const sources = Array.isArray(payload?.sources) ? payload.sources : [];
  const ok = sources.filter((source) => ['ok', 'live', 'success'].includes(String(source.status || '').toLowerCase()));
  const total = Number(payload?.notices?.length || 0);
  const fallback = String(payload?.fallbackReason || '');
  const partial = Boolean(error) || Boolean(fallback) || !sources.length || ok.length < sources.length
    || payload?.complete === false || payload?.coverage?.complete === false || payload?.coverage?.status === 'partial';
  const sourceName = (source) => source.label || source.name || source.id;
  const sourceStatusLabel = (source) => `${sourceName(source)} ${['ok', 'live', 'success'].includes(String(source.status || '').toLowerCase()) ? '연결' : '확인 필요'}`;
  dot.className = `supply-live-dot ${error ? 'error' : partial ? 'partial' : 'live'}`;
  $('#supplySourceTitle').textContent = error
    ? '공식 공고를 불러오지 못했어요'
    : fallback ? `${total.toLocaleString('ko-KR')}개 저장 공고 표시 중 · 로컬 즉시조회 확인 필요`
      : total ? `${total.toLocaleString('ko-KR')}개 공식 공고 · ${partial ? '일부 소스 확인 필요' : '수집 정상'}`
        : partial && ok.length ? `${ok.map(sourceName).join(' · ')} 연결 · 나머지 공급원 확인 필요`
          : '공고 파일은 연결됐지만 아직 수집된 공고가 없어요';
  const generated = payload?.generatedAt ? new Date(payload.generatedAt) : null;
  $('#supplySourceMeta').textContent = error
    ? String(error.message || '키 승인과 로컬 서버 또는 배포 파일을 확인해주세요.')
    : `${fallback ? `${fallback} · ` : ''}${sources.map(sourceStatusLabel).filter(Boolean).join(' · ') || '청약홈·LH·SH 수집 대기'}${generated && !Number.isNaN(generated.getTime()) ? ` · ${generated.toLocaleString('ko-KR')} 갱신` : ''}`;
  setSupplyConnection(payload, error);
}

function reconcileSupplySeen(notices, payload = {}) {
  const currentIds = notices.map((notice) => String(notice.id)).filter(Boolean);
  const now = new Date().toISOString();
  if (!state.supplySeen) {
    if (!currentIds.length) return [];
    state.supplySeen = saveSupplySeen({ knownIds: currentIds, unreadIds: [], notifiedIds: [], alertKeys: [], initializedAt: now });
    renderSupplyUnreadBadge();
    return [];
  }
  const known = new Set(state.supplySeen.knownIds || []);
  const unread = new Set(state.supplySeen.unreadIds || []);
  const newlyFound = currentIds.filter((id) => !known.has(id));
  const suppressedSources = new Set(payload?.changes?.suppressedSources || []);
  const noticeById = new Map(notices.map((notice) => [String(notice.id), notice]));
  const newForAlert = newlyFound.filter((id) => {
    const notice = noticeById.get(id);
    return notice?.notificationEligible !== false && notice?.dataStatus !== 'stale'
      && noticeStatusAtKst(notice, new Date()) !== 'closed' && !suppressedSources.has(notice?.source);
  });
  newlyFound.forEach((id) => known.add(id));
  newForAlert.forEach((id) => unread.add(id));
  if (!payload?.changes?.baselineRun) {
    (payload?.changes?.updated || []).forEach(({ id }) => {
      const notice = noticeById.get(String(id));
      if (notice?.notificationEligible !== false && notice?.dataStatus !== 'stale') unread.add(String(id));
    });
  }
  state.supplySeen = saveSupplySeen({ ...state.supplySeen, knownIds: [...known], unreadIds: [...unread] });
  renderSupplyUnreadBadge();
  return notices.filter((notice) => newForAlert.includes(String(notice.id)));
}

function notifySupplyNotices(payload, newNotices) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const notices = Array.isArray(payload?.notices) ? payload.notices : [];
  const byId = new Map(notices.map((notice) => [String(notice.id), notice]));
  const alertKeys = new Set(state.supplySeen?.alertKeys || []);
  const alertPreferences = {
    ...state.supplyPreferences,
    newlywedOnly: state.supplyPreferences.newlywedMode === 'only',
    excludeClosed: true,
  };
  const alerts = [];
  if (state.supplyPreferences.notifyNew) {
    newNotices.forEach((notice) => alerts.push({ key: `new:${notice.id}`, notice, label: '새 공고' }));
  }
  if (state.supplyPreferences.notifyChanged && !payload?.changes?.baselineRun) {
    (payload?.changes?.updated || []).forEach((change) => {
      const notice = byId.get(String(change.id));
      if (notice) alerts.push({ key: `changed:${payload.generatedAt || 'snapshot'}:${notice.id}`, notice, label: '공고 변경' });
    });
  }
  if (state.supplyPreferences.notifyDeadline) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    notices.forEach((notice) => {
      const dday = supplyDDay(supplyPrimarySchedule(notice));
      if (['D-3', 'D-1', '마감 D-3', '마감 D-1'].includes(dday)) alerts.push({ key: `deadline:${today}:${notice.id}:${dday}`, notice, label: dday });
    });
  }
  const matches = alerts.filter(({ key, notice }) => !alertKeys.has(key) && matchesAlertPreferences(notice, alertPreferences, new Date()));
  if (!matches.length) return;
  const first = matches[0];
  try {
    const notification = new Notification(`분양 알림 ${matches.length}건`, {
      body: matches.length === 1 ? `[${first.label}] ${first.notice.title}` : `[${first.label}] ${first.notice.title} 외 ${matches.length - 1}건`,
      tag: 'homehunt-supply-alert',
      icon: './assets/og-homehunt.png',
    });
    notification.onclick = () => { window.focus(); setView('supply'); };
    matches.forEach(({ key }) => alertKeys.add(key));
    state.supplySeen = saveSupplySeen({ ...state.supplySeen, alertKeys: [...alertKeys] });
  } catch (_) {}
}

function normalizeSupplyPayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.notices)) throw new Error('분양 공고 파일 형식을 확인해주세요.');
  const notices = payload.notices.map((notice) => {
    try { return normalizeSupplyNotice(notice); }
    catch (_) { return null; }
  }).filter((notice) => notice?.id && ['서울', '경기'].includes(supplyRegionLabel(notice)));
  return { ...payload, notices };
}

async function fetchSupplyPayload(force = false) {
  const separator = APP_CONFIG.supplyFeedUrl.includes('?') ? '&' : '?';
  const primaryUrl = `${APP_CONFIG.supplyFeedUrl}${separator}${force ? 'refresh=1&' : ''}_=${Date.now()}`;
  try {
    const response = await fetch(primaryUrl, { cache: 'no-store', signal: AbortSignal.timeout(force ? 120000 : 90000) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || payload?.message || `공고 서버 응답 ${response.status}`);
    return normalizeSupplyPayload(payload);
  } catch (primaryError) {
    if (!APP_CONFIG.localMarketEnabled || APP_CONFIG.supplyFeedUrl === APP_CONFIG.supplyStaticUrl) throw primaryError;
    try {
      const response = await fetch(`${APP_CONFIG.supplyStaticUrl}?_=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw primaryError;
      const fallback = normalizeSupplyPayload(await response.json());
      return { ...fallback, fallbackReason: primaryError.message || '로컬 API 연결 실패' };
    } catch (_) {
      throw primaryError;
    }
  }
}

async function ensureSupplyFeed(force = false) {
  if (state.supplyLoadPromise && !force) return state.supplyLoadPromise;
  state.supplyLoading = true;
  $('#supplyFeed').setAttribute('aria-busy', 'true');
  if (!state.supplyFeed || force) {
    $('#supplyFeed').replaceChildren($('#supplyLoading') || (() => {
      const loading = createElement('div', 'supply-loading');
      loading.append(createElement('strong', '', '공식 공고를 불러오고 있어요'));
      return loading;
    })());
  }
  state.supplyLoadPromise = fetchSupplyPayload(force).then((payload) => {
    state.supplyFeed = payload;
    state.supplyMapLocationsReady = false;
    if (!state.supplySelectedId || !payload.notices.some((notice) => String(notice.id) === state.supplySelectedId)) state.supplySelectedId = payload.notices[0]?.id ? String(payload.notices[0].id) : '';
    const newNotices = reconcileSupplySeen(payload.notices, payload);
    supplySourceSummary(payload);
    notifySupplyNotices(payload, newNotices);
    renderSupply();
    if (state.recommendationMapReady) void refreshRecommendationMapLayers();
    return payload;
  }).catch((error) => {
    state.supplyFeed = { schemaVersion: 1, generatedAt: '', sources: [], notices: [], loadError: error.message || '공고를 불러오지 못했습니다.' };
    state.supplyMapLocationsReady = false;
    supplySourceSummary(state.supplyFeed, error);
    renderSupply();
    if (state.recommendationMapReady) void refreshRecommendationMapLayers();
    return state.supplyFeed;
  }).finally(() => {
    state.supplyLoading = false;
    state.supplyLoadPromise = null;
    $('#supplyFeed').setAttribute('aria-busy', 'false');
  });
  return state.supplyLoadPromise;
}

function makeSupplyBadge(text, className = '') {
  return createElement('span', `supply-badge ${className}`.trim(), text);
}

function toggleSupplyFavorite(id) {
  const value = String(id || '');
  const ids = new Set(state.supplyFavorites);
  if (ids.has(value)) ids.delete(value); else ids.add(value);
  state.supplyFavorites = saveSupplyFavorites([...ids]);
  renderSupply();
}

function makeSupplyCard(notice) {
  const id = String(notice.id);
  const status = supplyStatusMeta(notice);
  const schedule = supplyPrimarySchedule(notice);
  const isUnread = (state.supplySeen?.unreadIds || []).includes(id);
  const favorite = state.supplyFavorites.includes(id);
  const newlywedUnits = supplyNewlywedUnits(notice);
  const location = supplyLocation(notice);
  const card = createElement('article', `supply-card${state.supplySelectedId === id ? ' selected' : ''}`);
  card.dataset.supplyId = id;
  const top = createElement('div', 'supply-card-top');
  const badges = createElement('div', 'supply-card-badges');
  if (isUnread) badges.append(makeSupplyBadge('NEW', 'new'));
  badges.append(makeSupplyBadge(status.label, status.className), makeSupplyBadge(notice.sourceLabel || notice.source || '공식', 'source'));
  if (notice.isNewlywedTown || notice.program === 'newlywed-town') badges.append(makeSupplyBadge('신혼희망타운', 'newlywed'));
  else if (newlywedUnits > 0) badges.append(makeSupplyBadge(`신혼 ${newlywedUnits.toLocaleString('ko-KR')}세대`, 'newlywed'));
  const favoriteButton = createElement('button', `supply-card-bookmark${favorite ? ' active' : ''}`);
  favoriteButton.type = 'button';
  favoriteButton.setAttribute('aria-label', favorite ? '관심 공고 해제' : '관심 공고 저장');
  favoriteButton.setAttribute('aria-pressed', String(favorite));
  favoriteButton.append(createElement('i', `ti ti-bookmark${favorite ? '-filled' : ''}`));
  favoriteButton.addEventListener('click', (event) => { event.stopPropagation(); toggleSupplyFavorite(id); });
  top.append(badges);
  const main = createElement('button', 'supply-card-main');
  main.type = 'button';
  main.addEventListener('click', () => {
    state.supplySelectedId = id;
    renderSupply();
    if (window.matchMedia('(max-width: 900px)').matches) {
      window.requestAnimationFrame(() => $('#supplyDetail')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      }));
    }
  });
  main.append(top, createElement('h2', '', notice.title || '이름 없는 공식 공고'), createElement('p', 'supply-card-address', `${supplyRegionLabel(notice)}${location.district ? ` ${location.district}` : ''} · ${location.address || '공급 위치 공고문 확인'}`));
  const scheduleRow = createElement('div', 'supply-card-schedule');
  scheduleRow.append(createElement('span', '', schedule?.label || '접수 일정'), createElement('strong', '', schedule ? `${supplyShortDate(schedule.startDate)} ~ ${supplyShortDate(schedule.endDate || schedule.startDate)}` : '공고문에서 일정 확인'), createElement('em', '', supplyDDay(schedule)));
  main.appendChild(scheduleRow);
  const facts = createElement('div', 'supply-card-facts');
  const maxPrice = supplyPrice(notice);
  facts.append(
    createElement('span', '', `공급 ${Number(notice.totalUnits) > 0 ? `${Number(notice.totalUnits).toLocaleString('ko-KR')}세대` : '세대수 확인'}`),
    createElement('span', '', supplyAreaRange(notice)),
    createElement('span', '', maxPrice ? `최고 ${formatPriceManwon(maxPrice)}` : '가격 공고문 확인'),
  );
  main.appendChild(facts);
  const foot = createElement('div', 'supply-card-foot');
  foot.append(createElement('small', '', `${supplyProgramLabel(notice)} · 공고 ${supplyShortDate(notice.announcementDate)}`), createElement('span', '', '상세 보기 →'));
  main.appendChild(foot);
  card.append(main, favoriteButton);
  return card;
}

function supplyScheduleRow(schedule) {
  const row = createElement('div', 'supply-schedule-row');
  row.append(createElement('span', '', schedule.label || '접수'), createElement('strong', '', `${supplyShortDate(schedule.startDate)} ~ ${supplyShortDate(schedule.endDate || schedule.startDate)}`), createElement('em', '', supplyDDay(schedule)));
  return row;
}

function supplyHomeRow(home) {
  const row = createElement('div', 'supply-home-row');
  const area = Number(home.areaM2 || home.supplyAreaM2);
  const price = Number(home.maxPriceManWon);
  const newlywedUnits = Number(home.newlywedUnits ?? home.specialSupply?.newlywedUnits);
  const supplyUnits = Number(home.totalUnits ?? home.supplyUnits ?? ((Number(home.generalUnits) || 0) + (Number(home.specialUnits) || 0)));
  row.append(createElement('span', '', home.type || home.houseType || (area ? `${area.toFixed(1)}㎡` : '주택형')), createElement('strong', '', price > 0 ? formatPriceManwon(price) : '가격 확인'), createElement('em', '', newlywedUnits > 0 ? `신혼 ${newlywedUnits.toLocaleString('ko-KR')}세대` : supplyUnits > 0 ? `${supplyUnits.toLocaleString('ko-KR')}세대` : '공고문 확인'));
  return row;
}

function downloadSupplyCalendar(notice) {
  const schedules = supplySchedules(notice);
  if (!schedules.length) return showToast('내보낼 접수 일정이 없어요.', 'error');
  const dateStamp = (value, addDay = false) => {
    const date = supplyDateValue(value);
    if (!date) return '';
    if (addDay) date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  };
  const escapeIcs = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
  const events = schedules.map((schedule, index) => [
    'BEGIN:VEVENT',
    `UID:${escapeIcs(notice.id)}-${index}@homehunt`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${dateStamp(schedule.startDate)}`,
    `DTEND;VALUE=DATE:${dateStamp(schedule.endDate || schedule.startDate, true)}`,
    `SUMMARY:${escapeIcs(`[${schedule.label}] ${notice.title}`)}`,
    `DESCRIPTION:${escapeIcs('공식 모집공고에서 자격과 시간을 다시 확인하세요.')}`,
    `URL:${escapeIcs(safeExternalUrl(notice.officialUrl || notice.sourceUrl))}`,
    'END:VEVENT',
  ].join('\r\n')).join('\r\n');
  const blob = new Blob([`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//HomeHunt//Supply//KO\r\n${events}\r\nEND:VCALENDAR\r\n`], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `분양일정-${String(notice.title || '공고').replace(/[\\/:*?"<>|]/g, '-').slice(0, 50)}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function openSupplyOnRecommendationMap(notice, trigger = null) {
  if (!notice) return;
  const originalLabel = trigger?.textContent || '';
  if (trigger) {
    trigger.disabled = true;
    trigger.textContent = '지도 위치 확인 중…';
  }
  try {
    let point = supplyGeoPoint(notice);
    if (!point) {
      // A missing feed coordinate is resolved only after this explicit, single-notice action.
      const location = supplyLocation(notice);
      const query = location.address || [supplyRegionLabel(notice), location.district, notice.title].filter(Boolean).join(' ');
      if (!query) throw new Error('공고에 지도에서 찾을 주소가 없습니다.');
      const result = await geocodeLocally(query);
      if (!result) throw new Error('이 공고의 공급 위치를 지도에서 찾지 못했습니다. 공식 공고 주소를 확인해주세요.');
      point = { lat: Number(result.lat), lng: Number(result.lng) };
      state.supplyFeed = {
        ...state.supplyFeed,
        notices: (state.supplyFeed?.notices || []).map((item) => String(item.id) === String(notice.id)
          ? { ...item, ...point, mapCoordinateSource: 'naver-geocode-local' }
          : item),
      };
    }
    activateRecommendationLayer('supply');
    setView('recommend');
    const map = await refreshRecommendationMapLayers();
    if (!map) throw new Error('집 찾기 지도를 불러오지 못했습니다.');
    map.moveTo(point.lat, point.lng, 15);
    map.selectContext(`context:supply:${notice.id}`, true);
    setRecommendationPanel('');
    showToast(`${notice.title || '분양 공고'} 주변을 지도에서 열었어요.`);
  } catch (error) {
    showToast(error.message || '분양 위치를 지도에서 열지 못했습니다.', 'error');
  } finally {
    if (trigger?.isConnected) {
      trigger.disabled = false;
      trigger.textContent = originalLabel;
    }
  }
}

function renderSupplyDetail(notice) {
  const root = $('#supplyDetail');
  if (!notice) {
    const empty = createElement('div', 'supply-detail-empty');
    const icon = createElement('span'); icon.append(createElement('i', 'ti ti-building-community'));
    empty.append(icon, createElement('strong', '', '공고를 선택해보세요'), createElement('p', '', '특별공급 일정, 주택형, 분양가와 공식 공고 링크를 한눈에 볼 수 있어요.'));
    root.replaceChildren(empty);
    return;
  }
  const status = supplyStatusMeta(notice);
  const schedule = supplyPrimarySchedule(notice);
  const location = supplyLocation(notice);
  const newlywedUnits = supplyNewlywedUnits(notice);
  const content = createElement('div', 'supply-detail-content');
  const kicker = createElement('div', 'supply-detail-kicker');
  kicker.append(createElement('span', '', `${notice.sourceLabel || notice.source || '공식'} · ${supplyProgramLabel(notice)}`));
  const bookmark = createElement('button', state.supplyFavorites.includes(String(notice.id)) ? 'active' : '');
  bookmark.type = 'button'; bookmark.setAttribute('aria-label', '관심 공고 저장'); bookmark.append(createElement('i', `ti ti-bookmark${state.supplyFavorites.includes(String(notice.id)) ? '-filled' : ''}`));
  bookmark.addEventListener('click', () => toggleSupplyFavorite(notice.id));
  kicker.appendChild(bookmark);
  content.append(kicker, createElement('h2', '', notice.title), createElement('p', 'supply-detail-address', location.address || `${supplyRegionLabel(notice)} ${location.district}`));
  const badges = createElement('div', 'supply-detail-badges');
  badges.append(makeSupplyBadge(status.label, status.className), makeSupplyBadge(supplyProgramLabel(notice), 'source'));
  if (notice.isNewlywedTown || notice.program === 'newlywed-town') badges.append(makeSupplyBadge('신혼희망타운 · 공식 코드', 'newlywed'));
  else if (newlywedUnits > 0) badges.append(makeSupplyBadge(`신혼부부 특별공급 ${newlywedUnits.toLocaleString('ko-KR')}세대`, 'newlywed'));
  else if (supplySchedules(notice).some((item) => /특별/.test(item.label))) badges.append(makeSupplyBadge('특별공급 자격 확인 필요', 'upcoming'));
  content.appendChild(badges);
  const deadline = createElement('div', 'supply-deadline');
  deadline.append(createElement('span', '', supplyDDay(schedule)), (() => { const div = createElement('div'); div.append(createElement('small', '', schedule?.label || '접수 일정'), createElement('strong', '', schedule ? `${supplyShortDate(schedule.startDate)} ~ ${supplyShortDate(schedule.endDate || schedule.startDate)}` : '공고문에서 확인해주세요')); return div; })());
  content.appendChild(deadline);
  const schedulesSection = createElement('section', 'supply-detail-section');
  const scheduleHeading = createElement('h3'); scheduleHeading.append(createElement('i', 'ti ti-calendar-event'), document.createTextNode(' 공고·접수·발표 일정'));
  const scheduleList = createElement('div', 'supply-schedule-list');
  const rows = supplySchedules(notice);
  scheduleList.replaceChildren(...(rows.length ? rows.map(supplyScheduleRow) : [createElement('p', 'supply-card-address', '구조화된 일정이 없어 공식 공고문에서 확인해주세요.') ]));
  schedulesSection.append(scheduleHeading, scheduleList);
  content.appendChild(schedulesSection);
  const homes = Array.isArray(notice.homes) ? notice.homes : [];
  const homesSection = createElement('section', 'supply-detail-section');
  const homesHeading = createElement('h3'); homesHeading.append(createElement('i', 'ti ti-ruler-measure'), document.createTextNode(' 주택형·분양가'));
  const homeList = createElement('div', 'supply-home-list');
  homeList.replaceChildren(...(homes.length ? homes.slice(0, 8).map(supplyHomeRow) : [createElement('p', 'supply-card-address', '주택형별 가격은 공식 공고문에서 확인해주세요.') ]));
  homesSection.append(homesHeading, homeList);
  content.appendChild(homesSection);
  const factsSection = createElement('section', 'supply-detail-section');
  const factsHeading = createElement('h3'); factsHeading.append(createElement('i', 'ti ti-list-details'), document.createTextNode(' 공고 요약'));
  const facts = createElement('div', 'supply-detail-facts');
  [[ '총 공급', Number(notice.totalUnits) > 0 ? `${Number(notice.totalUnits).toLocaleString('ko-KR')}세대` : '공고문 확인' ], [ '최고 분양가', supplyPrice(notice) ? formatPriceManwon(supplyPrice(notice)) : '공고문 확인' ], [ '주택형', supplyAreaRange(notice) ], [ '입주 예정', notice.moveInMonth || notice.moveIn || notice.moveInPlanned || notice.moveInExpected || '공고문 확인' ]].forEach(([label, value]) => { const item = createElement('div'); item.append(createElement('span', '', label), createElement('strong', '', value)); facts.appendChild(item); });
  factsSection.append(factsHeading, facts);
  content.appendChild(factsSection);
  const eligibility = createElement('section', 'supply-detail-section supply-eligibility-note');
  eligibility.append(createElement('i', 'ti ti-alert-circle'), createElement('span', '', supplyIsNewlywed(notice) ? '신혼 대상 물량이 공식 데이터에서 확인됐어요. 다만 혼인기간·소득·자산·무주택·거주지 기준은 공고마다 다르므로 신청 전 원문을 확인하세요.' : '특별공급 일정만으로 신혼부부 신청 가능 여부를 추측하지 않습니다. 공식 모집공고의 공급대상과 자격을 확인하세요.'));
  content.appendChild(eligibility);
  const readiness = assessNewlywedReadiness(state.subscriptionProfile);
  const readinessSection = createElement('section', `supply-detail-section supply-readiness-mini ${readiness.tone}`);
  const readinessCopy = createElement('div');
  readinessCopy.append(
    createElement('small', '', '우리 청약 준비도 · 공고별 재확인'),
    createElement('strong', '', state.subscriptionProfile.updatedAt ? readiness.label : '두 사람의 정보를 먼저 입력해보세요'),
    createElement('p', '', state.subscriptionProfile.updatedAt
      ? `자가입력 기준 확인할 항목 ${readiness.blockers.length + readiness.checks.length}개 · 숫자 당첨 확률은 계산하지 않아요.`
      : '민영 기본 가점과 신혼 공급의 무주택·소득·자산·통장 확인 항목을 정리해드려요.'),
  );
  const readinessButton = createElement('button'); readinessButton.type = 'button'; readinessButton.textContent = state.subscriptionProfile.updatedAt ? '다시 확인' : '정보 입력';
  readinessButton.addEventListener('click', () => goToGuideAnchor('guideSubscriptionProfile'));
  readinessSection.append(readinessCopy, readinessButton);
  content.appendChild(readinessSection);
  const actions = createElement('div', 'supply-detail-actions');
  const official = document.createElement('a'); official.className = 'primary'; official.href = safeExternalUrl(notice.officialUrl || notice.sourceUrl, notice.source === 'lh' ? 'https://apply.lh.or.kr/lhapply/apply/sc/list.do' : 'https://www.applyhome.co.kr/'); official.target = '_blank'; official.rel = 'noopener noreferrer'; official.append(createElement('i', 'ti ti-external-link'), document.createTextNode(' 공식 공고 보기'));
  const calendar = createElement('button'); calendar.type = 'button'; calendar.append(createElement('i', 'ti ti-calendar-down'), document.createTextNode(' 일정 저장')); calendar.addEventListener('click', () => downloadSupplyCalendar(notice));
  const market = createElement('button'); market.type = 'button'; market.append(createElement('i', 'ti ti-chart-line'), document.createTextNode(' 단지 실거래')); bindOpenMarketButton(market, notice, 'supply');
  const nearby = createElement('button'); nearby.type = 'button'; nearby.append(createElement('i', 'ti ti-map-pin'), document.createTextNode(' 집 찾기에서 주변 보기')); nearby.addEventListener('click', () => openSupplyOnRecommendationMap(notice, nearby));
  actions.append(official, calendar, market, nearby);
  content.appendChild(actions);
  root.replaceChildren(content);
}

function supplyFilterInput() {
  const status = state.supplyFilters.status;
  const statuses = status === 'active' ? ['open', 'upcoming', 'unknown'] : status === 'recent' ? [] : [status];
  const program = state.supplyFilters.program;
  const programs = program === 'sale' ? ['private-sale', 'public-sale', 'apartment-sale']
    : program === 'newlywed-town' ? ['newlywed-town']
      : program === 'remaining' ? ['remaining', 'remaining-supply', 'optional-supply'] : [];
  return {
    query: state.supplyFilters.query,
    regions: state.supplyFilters.region === 'all' ? ['서울', '경기'] : [state.supplyFilters.region],
    statuses,
    programs,
    excludeClosed: status !== 'recent' && status !== 'closed',
    districts: state.supplyPreferences.districts,
    maxPriceManWon: state.supplyPreferences.maxPriceManWon,
    minAreaM2: state.supplyPreferences.minAreaM2,
    maxAreaM2: state.supplyPreferences.maxAreaM2,
    minSupplyUnits: state.supplyPreferences.minSupplyUnits,
    includeUnknownPrice: state.supplyPreferences.includeUnknownPrice,
    includeUnknownArea: state.supplyPreferences.includeUnknownArea,
    includeUnknownUnits: state.supplyPreferences.includeUnknownUnits,
    favoriteIds: state.supplyFavorites,
    favoritesOnly: state.supplyFilters.favoritesOnly,
    newlywedOnly: program === 'newlywed',
  };
}

function renderSupply() {
  const root = $('#supplyFeed');
  const notices = state.supplyFeed?.notices || [];
  let filtered = filterSupplyNotices(notices, supplyFilterInput(), new Date());
  if (state.supplyFilters.favoritesOnly) filtered = filtered.filter((notice) => state.supplyFavorites.includes(String(notice.id)));
  filtered = sortSupplyNotices(filtered, state.supplyFilters.sort, new Date());
  const summary = summarizeSupplyNotices(notices, new Date());
  $('#supplyOpenCount').textContent = Number(summary.open ?? notices.filter((notice) => supplyStatusMeta(notice).status === 'open').length).toLocaleString('ko-KR');
  $('#supplySoonCount').textContent = Number(summary.soon ?? summary.upcomingWithin7 ?? summary.openingWithin7Days ?? notices.filter((notice) => supplyStatusMeta(notice).status === 'upcoming' && /^D-[1-7]$/.test(supplyDDay(supplyPrimarySchedule(notice)))).length).toLocaleString('ko-KR');
  $('#supplyNewlywedCount').textContent = Number(summary.newlywed ?? notices.filter(supplyIsNewlywed).length).toLocaleString('ko-KR');
  $('#supplyResultCount').textContent = filtered.length.toLocaleString('ko-KR');
  $('#supplyResultDescription').textContent = `${state.supplyFilters.region === 'all' ? '서울·경기' : state.supplyFilters.region} · ${$('#supplyStatusFilter').selectedOptions[0]?.textContent || '공고'}${state.supplyFilters.program !== 'all' ? ` · ${$('#supplyProgramFilter').selectedOptions[0]?.textContent}` : ''}`;
  renderSupplyMatchSummary();
  if (!filtered.length) {
    const shConnected = (state.supplyFeed?.sources || []).some((source) => String(source.id || '').toLowerCase() === 'sh' && ['ok', 'live', 'success'].includes(String(source.status || '').toLowerCase()));
    const noNoticeMessage = shConnected
      ? 'SH 공식 RSS에는 현재 확정된 주택분양 모집공고가 없어요. 청약홈·LH 활용신청이 승인되면 민간·공공분양, 잔여공급과 신혼희망타운도 함께 표시합니다.'
      : '공공데이터포털에서 청약홈과 LH API를 각각 활용신청한 뒤 수집을 실행하면 실제 공고가 표시됩니다.';
    const empty = createElement('div', 'supply-empty');
    const icon = createElement('span'); icon.append(createElement('i', `ti ${state.supplyFeed?.loadError ? 'ti-plug-connected-x' : 'ti-home-search'}`));
    empty.append(icon, createElement('strong', '', state.supplyFeed?.loadError ? '공식 공고 연결을 확인해주세요' : notices.length ? '조건에 맞는 공고가 없어요' : '아직 수집된 공식 공고가 없어요'), createElement('p', '', state.supplyFeed?.loadError || (notices.length ? '접수 상태나 지역·유형 조건을 바꿔보세요.' : noNoticeMessage)));
    const actions = createElement('div', 'supply-empty-actions');
    const apply = document.createElement('a'); apply.href = 'https://www.data.go.kr/data/15098547/openapi.do'; apply.target = '_blank'; apply.rel = 'noopener noreferrer'; apply.textContent = '청약홈 API 신청';
    const lh = document.createElement('a'); lh.href = 'https://www.data.go.kr/data/15058530/openapi.do'; lh.target = '_blank'; lh.rel = 'noopener noreferrer'; lh.textContent = 'LH API 신청';
    actions.append(apply, lh); empty.appendChild(actions); root.replaceChildren(empty);
    renderSupplyDetail(null);
  } else {
    if (!filtered.some((notice) => String(notice.id) === state.supplySelectedId)) state.supplySelectedId = String(filtered[0].id);
    root.replaceChildren(...filtered.map(makeSupplyCard));
    renderSupplyDetail(filtered.find((notice) => String(notice.id) === state.supplySelectedId) || filtered[0]);
  }
  renderSupplyUnreadBadge();
}

function markAllSupplySeen() {
  if (!state.supplySeen) return;
  state.supplySeen = saveSupplySeen({ ...state.supplySeen, unreadIds: [], acknowledgedAt: new Date().toISOString() });
  renderSupply();
  showToast('현재 새 분양 공고를 모두 확인했어요.');
}

function renderSupplyNotificationStatus() {
  const root = $('#supplyNotificationStatus');
  const supported = 'Notification' in window;
  const permission = supported ? Notification.permission : 'unsupported';
  const title = $('strong', root); const message = $('p', root); const button = $('#enableSupplyNotifications');
  title.textContent = permission === 'granted' ? '브라우저 알림 켜짐' : permission === 'denied' ? '브라우저에서 알림이 차단됐어요' : permission === 'unsupported' ? '이 브라우저는 알림을 지원하지 않아요' : '브라우저 알림 꺼짐';
  message.textContent = permission === 'granted' ? '사이트를 열어 새 공고를 확인할 때 알려드립니다.' : permission === 'denied' ? '브라우저 사이트 설정에서 직접 허용해주세요.' : permission === 'unsupported' ? '사이트 안의 새 공고 배지는 계속 사용할 수 있어요.' : '버튼을 눌러야만 권한을 요청합니다.';
  button.disabled = ['granted', 'denied', 'unsupported'].includes(permission);
  button.textContent = permission === 'granted' ? '허용됨' : permission === 'denied' ? '차단됨' : permission === 'unsupported' ? '미지원' : '브라우저 알림 켜기';
}

function openSupplyAlertModal() {
  const preferences = state.supplyPreferences;
  $('#supplyAlertSeoul').checked = preferences.regions.includes('서울');
  $('#supplyAlertGyeonggi').checked = preferences.regions.includes('경기');
  $('#supplyAlertNew').checked = preferences.notifyNew;
  $('#supplyAlertChanged').checked = preferences.notifyChanged;
  $('#supplyAlertDeadline').checked = preferences.notifyDeadline;
  $('#supplyAlertNewlywed').value = preferences.newlywedMode;
  $('#supplyAlertMaxPrice').value = preferences.maxPriceManWon ? preferences.maxPriceManWon / 10000 : '';
  renderSupplyNotificationStatus();
  openModalShell('supplyAlertModal', '[data-close-supply-alert]');
}

function closeSupplyAlertModal() {
  closeModalShell('supplyAlertModal');
}

async function enableSupplyNotifications() {
  if (!('Notification' in window)) return renderSupplyNotificationStatus();
  try {
    const permission = await Notification.requestPermission();
    renderSupplyNotificationStatus();
    showToast(permission === 'granted' ? '브라우저 알림을 켰어요.' : '알림 권한이 허용되지 않았어요.', permission === 'granted' ? 'info' : 'error');
  } catch (_) {
    showToast('브라우저 알림 권한을 요청하지 못했어요.', 'error');
  }
}

function saveSupplyAlertForm(event) {
  event.preventDefault();
  const regions = [$('#supplyAlertSeoul').checked ? '서울' : '', $('#supplyAlertGyeonggi').checked ? '경기' : ''].filter(Boolean);
  if (!regions.length) return showToast('서울 또는 경기를 하나 이상 선택해주세요.', 'error');
  const maxEok = numberValue($('#supplyAlertMaxPrice').value);
  state.supplyPreferences = saveSupplyPreferences({
    ...state.supplyPreferences,
    regions,
    newlywedMode: $('#supplyAlertNewlywed').value,
    maxPriceManWon: maxEok > 0 ? maxEok * 10000 : null,
    notifyNew: $('#supplyAlertNew').checked,
    notifyChanged: $('#supplyAlertChanged').checked,
    notifyDeadline: $('#supplyAlertDeadline').checked,
  });
  closeSupplyAlertModal();
  renderSupply();
  showToast('분양 알림 조건을 이 브라우저에 저장했어요.');
}

function supplyMatchTags(preferences = state.supplyPreferences) {
  const tags = [];
  if (preferences.districts?.length) tags.push(`동네 ${preferences.districts.join('·')}`);
  if (Number(preferences.maxPriceManWon) > 0) tags.push(`${Number(preferences.maxPriceManWon / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억원 이하`);
  const minPyeong = Number(preferences.minAreaM2) > 0 ? Number(preferences.minAreaM2) / PYEONG_TO_M2 : null;
  const maxPyeong = Number(preferences.maxAreaM2) > 0 ? Number(preferences.maxAreaM2) / PYEONG_TO_M2 : null;
  if (minPyeong || maxPyeong) tags.push(`${minPyeong ? minPyeong.toFixed(1) : '0'}~${maxPyeong ? maxPyeong.toFixed(1) : '제한 없음'}평`);
  if (Number(preferences.minSupplyUnits) > 0) tags.push(`${Number(preferences.minSupplyUnits).toLocaleString('ko-KR')}세대 이상`);
  return tags;
}

function renderSupplyMatchSummary() {
  const root = $('#supplyMatchSummary');
  if (!root) return;
  const tags = supplyMatchTags();
  const title = $('strong', root); const detail = $('small', root); const button = $('#openSupplyMatchSettings');
  title.textContent = tags.length ? `내 조건 ${tags.length}개 적용 중` : '추가 조건 없음';
  detail.textContent = tags.length ? tags.join(' · ') : '동네·가격·면적·공급세대 조건을 설정하면 맞는 공고만 남겨요.';
  button?.classList.toggle('active', tags.length > 0);
}

function populateSupplyMatchForm() {
  const preferences = state.supplyPreferences;
  $('#supplyMatchDistricts').value = (preferences.districts || []).join(', ');
  $('#supplyMatchMaxPrice').value = preferences.maxPriceManWon ? preferences.maxPriceManWon / 10000 : '';
  $('#supplyMatchMinPyeong').value = preferences.minAreaM2 ? (preferences.minAreaM2 / PYEONG_TO_M2).toFixed(1) : '';
  $('#supplyMatchMaxPyeong').value = preferences.maxAreaM2 ? (preferences.maxAreaM2 / PYEONG_TO_M2).toFixed(1) : '';
  $('#supplyMatchMinUnits').value = preferences.minSupplyUnits || '';
  $('#supplyMatchUnknownPrice').checked = preferences.includeUnknownPrice !== false;
  $('#supplyMatchUnknownArea').checked = preferences.includeUnknownArea !== false;
  $('#supplyMatchUnknownUnits').checked = preferences.includeUnknownUnits !== false;
}

function openSupplyMatchModal() {
  populateSupplyMatchForm();
  openModalShell('supplyMatchModal', '[data-close-supply-match]');
}

function closeSupplyMatchModal() {
  closeModalShell('supplyMatchModal');
}

function resetSupplyMatchForm() {
  $('#supplyMatchDistricts').value = '';
  $('#supplyMatchMaxPrice').value = '';
  $('#supplyMatchMinPyeong').value = '';
  $('#supplyMatchMaxPyeong').value = '';
  $('#supplyMatchMinUnits').value = '';
  $('#supplyMatchUnknownPrice').checked = true;
  $('#supplyMatchUnknownArea').checked = true;
  $('#supplyMatchUnknownUnits').checked = true;
}

function saveSupplyMatchForm(event) {
  event.preventDefault();
  const minPyeong = numberValue($('#supplyMatchMinPyeong').value) || null;
  const maxPyeong = numberValue($('#supplyMatchMaxPyeong').value) || null;
  if (minPyeong && maxPyeong && minPyeong > maxPyeong) return showToast('최소 평수를 최대 평수보다 작게 입력해주세요.', 'error');
  const maxEok = numberValue($('#supplyMatchMaxPrice').value) || null;
  const districts = [...new Set($('#supplyMatchDistricts').value.split(/[,，]/).map((item) => item.trim()).filter(Boolean))].slice(0, 12);
  state.supplyPreferences = saveSupplyPreferences({
    ...state.supplyPreferences,
    districts,
    maxPriceManWon: maxEok ? maxEok * 10000 : null,
    minAreaM2: minPyeong ? minPyeong * PYEONG_TO_M2 : null,
    maxAreaM2: maxPyeong ? maxPyeong * PYEONG_TO_M2 : null,
    minSupplyUnits: numberValue($('#supplyMatchMinUnits').value) || null,
    includeUnknownPrice: $('#supplyMatchUnknownPrice').checked,
    includeUnknownArea: $('#supplyMatchUnknownArea').checked,
    includeUnknownUnits: $('#supplyMatchUnknownUnits').checked,
  });
  closeSupplyMatchModal();
  renderSupply();
  showToast('내 분양 조건을 이 브라우저에 저장하고 적용했어요.');
}

function optionalProfileNumber(id) {
  const raw = $(`#${id}`).value.trim();
  return raw === '' ? null : numberValue(raw);
}

function populateSubscriptionProfileForm(profile = state.subscriptionProfile) {
  $('#subscriptionRelationship').value = profile.relationshipStatus;
  $('#subscriptionMarriageYears').value = profile.marriageYears ?? '';
  $('#subscriptionHomeless').value = profile.homelessStatus;
  $('#subscriptionSpecialUsed').value = profile.specialSupplyUsed;
  $('#subscriptionIncome').value = profile.incomeStatus;
  $('#subscriptionAsset').value = profile.assetStatus;
  $('#subscriptionChildren').value = profile.childrenCount || '';
  $('#subscriptionNewborn').value = profile.newbornStatus;
  const people = [['Seongwoo', profile.people.seongwoo], ['Sohee', profile.people.sohee]];
  people.forEach(([prefix, person]) => {
    $(`#subscription${prefix}NoHome`).value = person.noHomeYears ?? '';
    $(`#subscription${prefix}Dependents`).value = person.dependents ?? '';
    $(`#subscription${prefix}Account`).value = person.accountMonths ?? '';
    $(`#subscription${prefix}Payments`).value = person.paymentCount ?? '';
  });
}

function readSubscriptionProfileForm() {
  return normalizeSubscriptionProfile({
    relationshipStatus: $('#subscriptionRelationship').value,
    marriageYears: optionalProfileNumber('subscriptionMarriageYears'),
    homelessStatus: $('#subscriptionHomeless').value,
    specialSupplyUsed: $('#subscriptionSpecialUsed').value,
    incomeStatus: $('#subscriptionIncome').value,
    assetStatus: $('#subscriptionAsset').value,
    childrenCount: optionalProfileNumber('subscriptionChildren') ?? 0,
    newbornStatus: $('#subscriptionNewborn').value,
    people: {
      seongwoo: {
        name: '성우', noHomeYears: optionalProfileNumber('subscriptionSeongwooNoHome'),
        dependents: optionalProfileNumber('subscriptionSeongwooDependents'), accountMonths: optionalProfileNumber('subscriptionSeongwooAccount'),
        paymentCount: optionalProfileNumber('subscriptionSeongwooPayments'),
      },
      sohee: {
        name: '소희', noHomeYears: optionalProfileNumber('subscriptionSoheeNoHome'),
        dependents: optionalProfileNumber('subscriptionSoheeDependents'), accountMonths: optionalProfileNumber('subscriptionSoheeAccount'),
        paymentCount: optionalProfileNumber('subscriptionSoheePayments'),
      },
    },
    updatedAt: new Date().toISOString(),
  });
}

function subscriptionResultList(title, items) {
  if (!items.length) return null;
  const section = createElement('section', 'subscription-result-group');
  section.append(createElement('h3', '', title));
  const list = createElement('ul');
  items.forEach((item) => list.append(createElement('li', '', item)));
  section.append(list);
  return section;
}

function renderSubscriptionProfile() {
  const root = $('#subscriptionResult');
  if (!root) return;
  if (!state.subscriptionProfile.updatedAt) {
    const empty = createElement('div', 'subscription-result-empty'); const icon = createElement('span');
    icon.append(createElement('i', 'ti ti-user-question'));
    empty.append(icon, createElement('strong', '', '아직 계산 전이에요'), createElement('p', '', '두 사람의 현재 상태와 청약통장 정보를 넣으면 기본 가점과 공고에서 확인할 항목을 정리합니다.'));
    root.replaceChildren(empty);
    return;
  }
  const readiness = assessNewlywedReadiness(state.subscriptionProfile);
  const status = createElement('div', `subscription-result-status ${readiness.tone}`);
  status.append(createElement('i', `ti ${readiness.tone === 'warning' ? 'ti-alert-triangle' : readiness.tone === 'ready' ? 'ti-circle-check' : 'ti-list-check'}`));
  const statusCopy = createElement('div'); statusCopy.append(createElement('strong', '', readiness.label), createElement('small', '', '신혼 공급 자격 사전점검 · 최종 판단은 모집공고 기준'));
  status.append(statusCopy);
  const scoreGrid = createElement('div', 'subscription-score-grid');
  [['seongwoo', '성우'], ['sohee', '소희']].forEach(([key, name]) => {
    const score = readiness.scores[key]; const card = createElement('article', 'subscription-score-card');
    card.append(createElement('span', '', `${name} · 민영 기본 가점`));
    const total = createElement('strong'); total.append(document.createTextNode(score.complete ? String(score.total) : '입력 필요'), createElement('em', '', score.complete ? ' / 84점' : ''));
    card.append(total, createElement('small', '', `무주택 ${score.noHomePoints ?? '—'} · 부양가족 ${score.dependentPoints ?? '—'} · 본인 통장 ${score.accountPoints ?? '—'}`));
    scoreGrid.append(card);
  });
  const nodes = [status, scoreGrid];
  if (readiness.suggestedApplicant) {
    const name = readiness.suggestedApplicant === 'seongwoo' ? '성우' : '소희';
    nodes.push(subscriptionResultList('기본 가점 비교', [`현재 자가입력 3항목은 ${name} 쪽이 높아요. 배우자 통장 가점과 공고별 자격을 더한 최종 점수는 공식 계산기로 확인하세요.`]));
  }
  const attention = subscriptionResultList('먼저 확인할 것', [...readiness.blockers, ...readiness.checks]); if (attention) nodes.push(attention);
  const strengths = subscriptionResultList('입력상 확인된 것', readiness.strengths); if (strengths) nodes.push(strengths);
  nodes.push(createElement('p', 'subscription-no-probability', readiness.probabilityReason));
  root.replaceChildren(...nodes.filter(Boolean));
}

function saveSubscriptionProfileForm(event) {
  event.preventDefault();
  state.subscriptionProfile = readSubscriptionProfileForm();
  saveSubscriptionProfile(state.subscriptionProfile);
  renderSubscriptionProfile();
  if (state.supplySelectedId && state.currentView === 'supply') renderSupply();
  showToast('청약 준비 정보를 이 브라우저에만 저장했어요.');
}

function resetSubscriptionProfile() {
  clearSubscriptionProfile();
  state.subscriptionProfile = normalizeSubscriptionProfile({});
  populateSubscriptionProfileForm();
  renderSubscriptionProfile();
  showToast('이 브라우저의 청약 준비 정보를 지웠어요.');
}

function goToGuideAnchor(anchorId) {
  MODAL_IDS.forEach((id) => closeModalShell(id));
  setView('guide');
  window.setTimeout(() => document.getElementById(anchorId)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 60);
}

function setView(view, persist = true) {
  const valid = ['map', 'recommend', 'visits', 'supply', 'market', 'connections', 'guide'].includes(view) ? view : 'recommend';
  const changed = state.currentView !== valid;
  state.currentView = valid;
  $$('.portal-nav-item').forEach((button) => {
    const active = button.dataset.viewTarget === valid;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $$('.app-view').forEach((section) => {
    const active = section.dataset.view === valid;
    section.classList.toggle('active', active);
    section.hidden = !active;
  });
  if (persist) localStorage.setItem('homehunt_view_v1', valid);
  if (valid !== 'map') setMapPanel('');
  if (valid !== 'recommend') setRecommendationPanel('');
  if (valid === 'map') window.setTimeout(() => homeMap.resize(), 60);
  if (valid === 'market') window.setTimeout(renderMarket, 20);
  if (valid === 'supply') window.setTimeout(() => ensureSupplyFeed(), 20);
  if (valid === 'guide') window.setTimeout(renderSubscriptionProfile, 20);
  if (valid === 'recommend') window.setTimeout(async () => {
    updateRecommendationPreview();
    const map = await refreshRecommendationMapLayers();
    map?.resize();
  }, 20);
  if (valid === 'visits') renderArchive();
  if (changed) window.scrollTo({ top: 0, behavior: 'auto' });
}

function resetVisitForm() {
  visitAddressSearchToken += 1;
  $('#visitForm').reset();
  $('#visitId').value = '';
  $('#visitLat').value = '';
  $('#visitLng').value = '';
  $('#visitDate').value = todayString();
  $('#visitedSungwoo').checked = true;
  $('#visitedSohee').checked = true;
  $('#deleteVisit').hidden = true;
  $('#coordinateStatus').textContent = '지도에서 직접 찍어도 됩니다.';
  $('#visitAddressResults').hidden = true;
  $('#visitAddressResults').replaceChildren();
}

function fillVisitForm(visit) {
  $('#visitId').value = visit.id || '';
  $('#visitName').value = visit.name || '';
  $('#visitDate').value = visit.visitDate || todayString();
  $('#visitAddress').value = visit.address || '';
  $('#visitDealType').value = visit.dealType || '매매';
  $('#visitPrice').value = visit.askingPrice || '';
  $('#visitArea').value = visit.areaM2 || '';
  $('#visitFloor').value = visit.floor || '';
  $('#visitBuiltYear').value = visit.builtYear || '';
  $('#visitHouseholds').value = visit.households || '';
  $('#visitWalkMinutes').value = visit.walkMinutes || '';
  $('#visitStatus').value = visit.status || '관심';
  $('#visitDirection').value = visit.direction || '';
  $('#visitPros').value = visit.pros || '';
  $('#visitCons').value = visit.cons || '';
  $('#visitMemo').value = visit.memo || '';
  $('#visitTags').value = (visit.tags || []).join(', ');
  $('#visitLat').value = visit.lat ?? '';
  $('#visitLng').value = visit.lng ?? '';
  $('#visitedSungwoo').checked = (visit.visitedBy || []).includes('성우');
  $('#visitedSohee').checked = (visit.visitedBy || []).includes('소희');
  $('#deleteVisit').hidden = !visit.id;
  $('#coordinateStatus').textContent = visit.lat && visit.lng ? `위치 저장됨 · ${Number(visit.lat).toFixed(5)}, ${Number(visit.lng).toFixed(5)}` : '지도에서 직접 찍어도 됩니다.';
}

function readVisitForm() {
  return {
    id: $('#visitId').value || (crypto.randomUUID?.() || `visit-${Date.now()}`),
    name: $('#visitName').value.trim(),
    visitDate: $('#visitDate').value,
    address: $('#visitAddress').value.trim(),
    dealType: $('#visitDealType').value,
    askingPrice: numberValue($('#visitPrice').value),
    areaM2: numberValue($('#visitArea').value),
    floor: numberValue($('#visitFloor').value),
    builtYear: numberValue($('#visitBuiltYear').value),
    households: numberValue($('#visitHouseholds').value),
    walkMinutes: numberValue($('#visitWalkMinutes').value),
    status: $('#visitStatus').value,
    direction: $('#visitDirection').value.trim(),
    pros: $('#visitPros').value.trim(),
    cons: $('#visitCons').value.trim(),
    memo: $('#visitMemo').value.trim(),
    tags: $('#visitTags').value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
    lat: numberValue($('#visitLat').value),
    lng: numberValue($('#visitLng').value),
    visitedBy: [$('#visitedSungwoo').checked ? '성우' : null, $('#visitedSohee').checked ? '소희' : null].filter(Boolean),
    updatedAt: new Date().toISOString(),
  };
}

function openVisitModal(visit = null, coords = null, address = '', isDraft = false) {
  resetVisitForm();
  if (visit) fillVisitForm(visit);
  if (coords) {
    $('#visitLat').value = coords.lat;
    $('#visitLng').value = coords.lng;
    if (address) $('#visitAddress').value = address;
    $('#coordinateStatus').textContent = `위치 지정됨 · ${Number(coords.lat).toFixed(5)}, ${Number(coords.lng).toFixed(5)}`;
  }
  if (isDraft) $('#deleteVisit').hidden = true;
  $('#visitModalTitle').textContent = visit && !isDraft ? '다녀온 집 기록 수정' : '다녀온 집 기록';
  openModalShell('visitModal', '#visitName');
}

function closeVisitModal() {
  closeModalShell('visitModal');
}

async function openAtMapCenter() {
  const center = homeMap.getCenter();
  if (!center) return showToast('지도가 연결된 뒤 이용해주세요.', 'error');
  const address = await homeMap.reverse(center.lat, center.lng);
  openVisitModal(null, center, address);
}

function applyGeocodeToVisit(result, fallbackAddress = '') {
  $('#visitLat').value = result.lat;
  $('#visitLng').value = result.lng;
  $('#visitAddress').value = result.roadAddress || result.jibunAddress || fallbackAddress;
  $('#coordinateStatus').textContent = `위치 저장됨 · ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}`;
  $('#visitAddressResults').hidden = true;
  $('#visitAddressResults').replaceChildren();
  homeMap.showSearchLocation(result.lat, result.lng, $('#visitName').value.trim() || '기록할 집', 17);
}

async function applyCatalogAddressToVisit(candidate, requestToken = ++visitAddressSearchToken) {
  $('#visitAddress').value = candidate.address || candidate.regionName || candidate.name;
  if (!$('#visitName').value.trim()) $('#visitName').value = candidate.name || '';
  if (!$('#visitBuiltYear').value && Number(candidate.builtYear) > 0) $('#visitBuiltYear').value = candidate.builtYear;
  if (!$('#visitHouseholds').value && Number(candidate.households) > 0) $('#visitHouseholds').value = candidate.households;
  $('#coordinateStatus').textContent = '공식 단지를 골랐어요. 정확한 지도 위치를 확인하고 있어요…';
  try {
    const results = await homeMap.search(candidate.address || `${candidate.regionName || ''} ${candidate.dong || ''}`.trim());
    if (requestToken !== visitAddressSearchToken) return;
    if (results[0]) {
      applyGeocodeToVisit(results[0], candidate.address);
      return;
    }
  } catch (_) {}
  if (requestToken !== visitAddressSearchToken) return;
  $('#visitAddressResults').hidden = true;
  $('#coordinateStatus').textContent = '공식 주소를 입력했지만 좌표를 찾지 못했어요. 지도에서 위치를 직접 찍어주세요.';
}

function showVisitAddressCandidates(candidates, requestToken) {
  if (requestToken !== visitAddressSearchToken) return;
  const root = $('#visitAddressResults');
  root.replaceChildren(...candidates.map((candidate) => makeCatalogCandidateButton(candidate, () => {
    const selectionToken = ++visitAddressSearchToken;
    applyCatalogAddressToVisit(candidate, selectionToken);
  })));
  root.hidden = false;
  $('#coordinateStatus').textContent = `${candidates.length}개의 공식 단지를 찾았어요. 정확한 단지를 선택해주세요.`;
}

async function geocodeIntoVisitForm() {
  const query = $('#visitAddress').value.trim();
  if (!query) return showToast('주소를 먼저 입력해주세요.', 'error');
  const requestToken = ++visitAddressSearchToken;
  $('#visitAddressResults').hidden = true;
  $('#visitAddressResults').replaceChildren();
  $('#coordinateStatus').textContent = '주소와 서울·경기 공식 단지를 함께 찾고 있어요…';
  const [results, payload] = await Promise.all([
    homeMap.search(query).catch(() => []),
    loadApartmentCatalog(),
  ]);
  if (requestToken !== visitAddressSearchToken) return;
  const candidates = searchApartmentCatalog(payload.apartments, query, { limit: 8 });
  if (candidates.length === 1 && candidates[0].matchTier === 'exact') return applyCatalogAddressToVisit(candidates[0], requestToken);
  const looksLikeStreetAddress = /\d/u.test(query) && /(대로|로|길|동|가|읍|면|리)/u.test(query);
  if (candidates.length && (!results[0] || !looksLikeStreetAddress)) return showVisitAddressCandidates(candidates, requestToken);
  if (results[0]) return applyGeocodeToVisit(results[0], query);
  if (candidates.length) return showVisitAddressCandidates(candidates, requestToken);
  $('#coordinateStatus').textContent = '주소나 단지를 찾지 못했어요. 검색어를 바꾸거나 지도에서 위치를 직접 찍어주세요.';
}

function persistVisits() {
  persistCompareSelection();
  if (state.marketContextVisit) {
    const currentVisit = state.visits.find((visit) => String(visit.id) === String(state.marketContextVisit.id));
    state.marketContextVisit = currentVisit || null;
    if (!currentVisit) {
      state.pendingComplexPreference = null;
      $('#visitDealGap').hidden = true;
    }
  }
  saveVisits(state.visits);
  renderAllVisits();
  if (state.currentView === 'market' && state.marketContextVisit && state.complexRecords.length) renderComplexHistory();
}

function saveVisitFromForm(event) {
  event.preventDefault();
  const visit = readVisitForm();
  if (!visit.name || !visit.visitDate || !visit.address) return showToast('단지명·방문일·주소는 꼭 입력해주세요.', 'error');
  if (!visit.lat || !visit.lng) return showToast('주소로 위치를 찾거나 지도에서 위치를 찍어주세요.', 'error');
  const index = state.visits.findIndex((item) => item.id === visit.id);
  if (index >= 0) state.visits[index] = visit;
  else state.visits.unshift(visit);
  persistVisits();
  closeVisitModal();
  state.selectedVisitId = visit.id;
  setView('map');
  window.setTimeout(() => selectVisit(visit.id, true), 70);
  showToast('방문 기록을 저장했어요.');
}

function deleteCurrentVisit() {
  const id = $('#visitId').value;
  if (!id || !window.confirm('이 방문 기록을 삭제할까요?')) return;
  state.visits = state.visits.filter((visit) => visit.id !== id);
  persistVisits();
  closeVisitModal();
  showToast('방문 기록을 삭제했어요.');
}

async function startPinMode() {
  state.formDraftIsNew = !$('#visitId').value;
  state.formDraft = readVisitForm();
  if (state.formDraftIsNew) state.formDraft.id = '';
  closeVisitModal();
  $('#pinModeBanner').hidden = false;
  homeMap.startPinMode(async (coords) => {
    $('#pinModeBanner').hidden = true;
    const address = await homeMap.reverse(coords.lat, coords.lng);
    const draft = { ...state.formDraft, ...coords, address: address || state.formDraft.address };
    openVisitModal(draft, null, '', state.formDraftIsNew);
    $('#coordinateStatus').textContent = `위치 지정됨 · ${Number(coords.lat).toFixed(5)}, ${Number(coords.lng).toFixed(5)}`;
  });
  showToast('지도에서 집 위치를 클릭하세요.');
}

function cancelPinMode() {
  homeMap.cancelPinMode();
  $('#pinModeBanner').hidden = true;
  if (state.formDraft) openVisitModal(state.formDraft, null, '', state.formDraftIsNew);
}

async function searchMap(event) {
  event.preventDefault();
  const query = $('#mapSearchInput').value.trim();
  if (!query) return;
  const requestToken = ++mapSearchToken;
  const resultsEl = $('#mapSearchResults');
  resultsEl.classList.add('show');
  resultsEl.replaceChildren(createElement('div', 'map-search-message', '주소와 서울·경기 공식 단지를 함께 찾는 중…'));
  try {
    const [results, catalogPayload] = await Promise.all([
      homeMap.search(query).catch(() => []),
      loadApartmentCatalog(),
    ]);
    if (requestToken !== mapSearchToken) return;
    const catalogMatches = searchApartmentCatalog(catalogPayload.apartments, query, { limit: 7 });
    if (!results.length && !catalogMatches.length) {
      resultsEl.replaceChildren(createElement('div', 'map-search-message', '검색 결과가 없어요. 지역명·단지명 또는 자세한 주소로 다시 검색해보세요.'));
      return;
    }
    const catalogButtons = catalogMatches.map((candidate) => {
      const button = createElement('button', 'map-search-result');
      button.type = 'button';
      button.append(
        createElement('small', 'search-result-badge', catalogMatchBadge(candidate)),
        createElement('strong', '', candidate.name),
        createElement('small', '', candidateMeta(candidate) || candidate.address),
      );
      button.addEventListener('click', async () => {
        const selectionToken = ++mapSearchToken;
        resultsEl.replaceChildren(createElement('div', 'map-search-message', `${candidate.name}의 지도 위치를 확인하고 있어요…`));
        const mapped = await homeMap.search(candidate.address || `${candidate.regionName || ''} ${candidate.dong || ''}`.trim()).catch(() => []);
        if (selectionToken !== mapSearchToken) return;
        if (mapped[0]) {
          homeMap.showSearchLocation(mapped[0].lat, mapped[0].lng, candidate.name, 17);
          $('#mapSearchInput').value = candidate.name;
          resultsEl.classList.remove('show');
        } else {
          resultsEl.replaceChildren(createElement('div', 'map-search-message', `공식 단지는 찾았지만 지도 좌표를 확인하지 못했어요. 주소: ${candidate.address || '미제공'}`));
        }
      });
      return button;
    });
    const addressButtons = results.slice(0, Math.max(0, 7 - catalogButtons.length)).map((result) => {
      const button = createElement('button', 'map-search-result');
      button.type = 'button';
      button.append(
        createElement('small', 'search-result-badge', '주소'),
        createElement('strong', '', result.roadAddress || result.jibunAddress),
        createElement('small', '', result.jibunAddress || result.roadAddress),
      );
      button.addEventListener('click', () => {
        mapSearchToken += 1;
        homeMap.showSearchLocation(result.lat, result.lng, result.roadAddress || result.jibunAddress || '검색 위치', 17);
        resultsEl.classList.remove('show');
      });
      return button;
    });
    resultsEl.replaceChildren(...catalogButtons, ...addressButtons);
  } catch (_) {
    if (requestToken !== mapSearchToken) return;
    resultsEl.replaceChildren(createElement('div', 'map-search-message', '검색 연결을 확인해주세요.'));
  }
}

function moveToCurrentLocation() {
  if (!navigator.geolocation) return showToast('이 브라우저는 위치 기능을 지원하지 않아요.', 'error');
  navigator.geolocation.getCurrentPosition(
    (position) => homeMap.moveTo(position.coords.latitude, position.coords.longitude, 17),
    () => showToast('위치 권한을 허용하면 현재 위치로 이동할 수 있어요.', 'error'),
    { enableHighAccuracy: true, timeout: 8000 },
  );
}

function setMapConnection(connected, message = '') {
  const card = $('#mapStatusCard');
  const pill = $('#mapConnectionPill');
  const dot = $('.connection-dot', pill);
  card.classList.toggle('connected', connected);
  card.classList.toggle('error', !connected);
  $('strong', card).textContent = connected ? '네이버 지도 연결됨' : '네이버 지도 연결 오류';
  $('small', card).textContent = connected ? '주소 검색과 방문 마커를 사용할 수 있어요.' : (message || 'Dynamic Map과 등록 URL을 확인해주세요.');
  dot.classList.remove('waiting', 'connected', 'error');
  dot.classList.add(connected ? 'connected' : 'error');
  $('span:last-child', pill).textContent = connected ? '네이버 지도 연결됨' : '지도 연결 확인';
  $('#naverMapState').textContent = connected ? '정상 연결' : '연결 오류';
  $('#naverMapState').className = `service-state ${connected ? 'connected' : 'demo'}`;
  $('#naverSdkCheck').textContent = connected ? 'Dynamic Map SDK 정상 로드' : 'Dynamic Map SDK 로드 실패';
  $('#naverDomainCheck').textContent = location.hostname === 'localhost' ? '개발 URL localhost 등록 확인' : '현재 도메인 인증 상태 확인 필요';
}

async function checkNaverReverseConnection() {
  const element = $('#naverReverseCheck');
  try {
    const region = await homeMap.resolveRegion(37.56661, 126.97839);
    element.classList.toggle('connection-warning', !region?.code);
    element.textContent = region?.code ? `Reverse Geocoding 정상 · ${region.code}` : 'Reverse Geocoding 선택 시 지도 중심 주소 자동입력';
  } catch (_) {
    element.classList.add('connection-warning');
    element.textContent = 'Reverse Geocoding 선택 시 지도 중심 주소 자동입력';
  }
}

function destroyChart(name) {
  state.charts[name]?.destroy?.();
  state.charts[name] = null;
}

function chartDefaults() {
  if (!window.Chart) return;
  Chart.defaults.font.family = 'Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif';
  Chart.defaults.color = '#6f7d78';
}

async function loadMarketSummary(forceStatic = false) {
  const imported = forceStatic ? null : await loadImportedMarket();
  let deployed = null;
  try {
    const response = await fetch(`${APP_CONFIG.marketSummaryUrl}?v=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) {
      const remote = await response.json();
      if (validateMarketSummary(remote)) deployed = remote;
    }
  } catch (_) {}
  let summary = null;
  if (validateMarketSummary(imported) && validateMarketSummary(deployed)) {
    const importedAt = Date.parse(imported.generatedAt || '') || 0;
    const deployedAt = Date.parse(deployed.generatedAt || '') || 0;
    summary = deployedAt > importedAt ? deployed : imported;
  } else if (validateMarketSummary(imported)) summary = imported;
  else if (validateMarketSummary(deployed)) summary = deployed;
  if (!validateMarketSummary(summary)) {
    summary = {
      version: 1,
      source: '단지 검색 전',
      sourceType: 'empty',
      generatedAt: null,
      provisionalMonths: 2,
      regions: [],
    };
  }
  state.marketSummary = summary;
  populateMarketRegions();
  renderMarket();
  updateMarketConnection();
}

function populateMarketRegions() {
  const select = $('#marketRegion');
  const current = select.value;
  const regions = state.marketSummary?.regions || [];
  select.disabled = !regions.length;
  if (!regions.length) {
    const option = createElement('option', '', '단지 검색 후 표시');
    option.value = '';
    select.replaceChildren(option);
    return;
  }
  select.replaceChildren(...regions.map((region) => {
    const option = createElement('option', '', region.name);
    option.value = region.code;
    return option;
  }));
  if ([...select.options].some((option) => option.value === current)) select.value = current;
  else if ([...select.options].some((option) => option.value === '11680')) select.value = '11680';
}

function updateMarketConnection() {
  const summary = state.marketSummary;
  const demo = summary?.sourceType === 'demo';
  const imported = summary?.sourceType === 'imported';
  const empty = summary?.sourceType === 'empty';
  const chip = $('#marketSourceChip');
  chip.classList.toggle('official', !demo && !imported && !empty);
  $('strong', chip).textContent = summary?.source || '데이터 없음';
  $('#marketUpdatedAt').textContent = summary?.generatedAt ? new Date(summary.generatedAt).toLocaleString('ko-KR') : '—';
  if (!APP_CONFIG.localMarketEnabled) {
    state.placeSearchConfigured = false;
    $('#molitState').textContent = demo
      ? '지역 집계 샘플'
      : imported ? '브라우저 CSV' : '배포 공식 집계';
    $('#molitState').className = `service-state ${demo ? 'demo' : imported ? 'partial' : 'connected'}`;
  }
  const historyCheck = $('#apartmentHistoryApiCheck');
  if (historyCheck && !APP_CONFIG.localMarketEnabled) {
    historyCheck.textContent = APP_CONFIG.apartmentHistoryEnabled
      ? '단지 이력 API 사용 설정됨'
      : '단지 이력 API 미배포 · 검색과 가격 연결은 분리 표시';
    historyCheck.classList.toggle('connection-warning', !APP_CONFIG.apartmentHistoryEnabled);
  }
}

function renderTrendChart(series, unit, provisionalMonths = 0) {
  if (!window.Chart) return;
  destroyChart('trend');
  const values = series.map((item) => unit === 'total' ? item.averageTotal : item.averageP33);
  const provisional = Math.max(0, Number(provisionalMonths) || 0);
  state.charts.trend = new Chart($('#marketTrendChart'), {
    type: 'line',
    data: {
      labels: series.map((item) => monthLabel(item.month)),
      datasets: [{
        label: unit === 'total' ? '평균 거래가격(만원)' : '평균 평당가격(만원)',
        data: values,
        borderColor: '#0f4c3a', backgroundColor: 'rgba(15,76,58,.08)', fill: true,
        borderWidth: 2, tension: .28, pointRadius: series.map((_, index) => index >= series.length - provisional ? 3 : 1.5),
        pointBackgroundColor: series.map((_, index) => index >= series.length - provisional ? '#e68c37' : '#0f4c3a'),
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => unit === 'total' ? formatPrice(context.parsed.y) : formatP33(context.parsed.y) } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 9 } } },
        y: { border: { display: false }, grid: { color: '#edf0ee' }, ticks: { font: { size: 8 }, callback: (value) => unit === 'total' ? formatCompactPrice(value) : `${Math.round(value).toLocaleString('ko-KR')}만` } },
      },
    },
  });
}

function renderForecastChart(series, forecast) {
  if (!window.Chart) return;
  destroyChart('forecast');
  const actual = series.slice(-18);
  const forecastPoints = forecast.eligible ? forecast.points : [];
  const labels = [...actual.map((item) => monthLabel(item.month)), ...forecastPoints.map((item) => monthLabel(item.month))];
  const actualValues = [...actual.map((item) => item.averageP33), ...forecastPoints.map(() => null)];
  const bridge = actual.at(-1)?.averageP33 ?? null;
  const predicted = [...actual.slice(0, -1).map(() => null), bridge, ...forecastPoints.map((item) => item.point)];
  const lower = [...actual.slice(0, -1).map(() => null), bridge, ...forecastPoints.map((item) => item.lower)];
  const upper = [...actual.slice(0, -1).map(() => null), bridge, ...forecastPoints.map((item) => item.upper)];
  state.charts.forecast = new Chart($('#forecastChart'), {
    type: 'line', data: { labels, datasets: [
      { data: actualValues, borderColor: '#0f4c3a', borderWidth: 2, pointRadius: 1.5, tension: .25 },
      { data: lower, borderColor: 'transparent', pointRadius: 0, fill: false },
      { data: upper, borderColor: 'transparent', backgroundColor: 'rgba(49,120,198,.13)', pointRadius: 0, fill: '-1' },
      { data: predicted, borderColor: '#3178c6', borderDash: [5,4], borderWidth: 2, pointRadius: 2, tension: .2 },
    ] }, options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => context.parsed.y ? formatP33(context.parsed.y) : '' } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 9, font: { size: 8 } } }, y: { border: { display: false }, grid: { color: '#edf0ee' }, ticks: { font: { size: 8 }, callback: (value) => formatCompactPrice(value) } } },
    },
  });
}

function renderRegionRanking(summary, dealType, band) {
  const ranking = latestRegionComparison(summary, dealType, band).slice(0, 8);
  const root = $('#regionRanking');
  root.replaceChildren(...ranking.map((item, index) => {
    const row = createElement('div', 'region-rank-row');
    row.append(createElement('span', '', String(index + 1).padStart(2, '0')));
    const copy = createElement('div');
    copy.append(createElement('strong', '', item.name), createElement('small', '', `${item.month} · ${item.count.toLocaleString('ko-KR')}건`));
    row.append(copy, createElement('em', '', formatP33(item.averageP33)));
    return row;
  }));
  if (!ranking.length) root.replaceChildren(createElement('div', 'map-search-message', '현재 집계 파일에 같은 조건의 지역 비교 데이터가 없어요.'));
}

function renderTransactionRecords(allRecords = []) {
  const records = state.transactionsExpanded ? allRecords : allRecords.slice(0, 10);
  const root = $('#transactionList');
  root.replaceChildren(...records.map((record) => {
    const row = createElement('div', 'transaction-row');
    const left = createElement('div');
    left.append(createElement('strong', '', record.apartmentName), createElement('p', '', `${record.dong || record.regionName} · ${formatAreaPair(record.areaM2)} · ${record.floor || '—'}층`));
    const right = createElement('div');
    right.append(createElement('em', '', formatPrice(record.amountManWon)), createElement('small', '', `${record.month}.${String(record.day || '').padStart(2, '0')}`));
    row.append(left, right);
    return row;
  }));
  if (!records.length) root.replaceChildren(createElement('div', 'map-search-message', '선택 조건의 최근 거래가 없어요.'));
  const toggle = $('#showAllTransactions');
  toggle.hidden = allRecords.length <= 10;
  toggle.textContent = state.transactionsExpanded ? '접기' : `더 보기 (${allRecords.length - 10})`;
}

function renderTransactions(summary, regionCode, dealType, band) {
  renderTransactionRecords(getRecentTransactions(summary, regionCode, dealType, band));
}

function renderForecastExplain(forecast, contextLabel = '', areaM2 = null) {
  const root = $('#forecastExplain');
  root.replaceChildren();
  if (!forecast.eligible) {
    const friendlyReasons = (forecast.reasons || []).map((reason) => {
      if (reason.includes('시계열 백테스트 원점')) return '과거 자료로 같은 기간 뒤의 가격을 되짚어 확인할 수 있는 구간이 충분하지 않아요.';
      if (reason.includes('무변화 기준') || reason.includes('백테스트 MAE')) return '지금 가격이 그대로라고 보는 단순 계산보다 뚜렷하게 잘 맞지 않았어요.';
      if (reason.includes('시간순 백테스트 평균 오차')) return '과거에 예상한 값과 실제 거래가격의 차이가 너무 컸어요.';
      if (reason.includes('불확실성 구간 표본')) return '예상가격의 위아래 범위를 정할 만큼 과거 사례가 충분하지 않아요.';
      if (reason.includes('유효한 월별 표본')) return '거래가 있었던 달이 아직 충분하지 않아요.';
      if (reason.includes('관측 기간')) return '가격 흐름을 판단할 만큼 조회 기간이 길지 않아요.';
      if (reason.includes('전체 거래 표본')) return '같은 면적의 실제 거래 건수가 아직 충분하지 않아요.';
      if (reason.includes('마지막 유효 거래월')) return '최근 실제 거래가 너무 오래됐어요.';
      return reason;
    });
    root.append(createElement('strong', '', '지금은 예상가격을 보여드리지 않아요'), createElement('p', '', [...new Set(friendlyReasons)].join(' ')));
    const held = document.createElement('dl');
    [['사용 가능한 월', `${forecast.observations || 0}개월`], ['사용 거래', `${Number(forecast.transactionCount || 0).toLocaleString('ko-KR')}건`], ['마지막 거래 경과', forecast.staleMonths === null ? '자료 없음' : `${forecast.staleMonths}개월`]].forEach(([term, desc]) => held.append(createElement('dt', '', term), createElement('dd', '', desc)));
    root.appendChild(held);
    return;
  }
  const last = forecast.points.at(-1);
  const exactArea = Number(areaM2);
  const hasExactArea = Number.isFinite(exactArea) && exactArea > 0;
  const estimatedTotal = hasExactArea ? last.point * exactArea / 3.3 : null;
  const estimatedLow = hasExactArea ? last.lower * exactArea / 3.3 : null;
  const estimatedHigh = hasExactArea ? last.upper * exactArea / 3.3 : null;
  root.append(
    createElement('strong', '', `${last.month} 예상 ${hasExactArea ? '평균 거래가격' : '평균 평당가격'}`),
    createElement('div', 'forecast-number', hasExactArea ? formatPrice(estimatedTotal) : formatP33(last.point)),
  );
  const description = forecast.monthlyTrendPct >= 0 ? `최근 추세는 월 ${forecast.monthlyTrendPct.toFixed(2)}% 상승 방향입니다.` : `최근 추세는 월 ${Math.abs(forecast.monthlyTrendPct).toFixed(2)}% 하락 방향입니다.`;
  root.append(createElement('p', '', `${hasExactArea ? `${formatAreaPair(exactArea)} · ${formatP33(last.point)}. ` : ''}${contextLabel ? `${contextLabel}의 ` : ''}실제 거래가격을 1평(3.3㎡) 기준으로 환산해 평균낸 흐름입니다. ${description} 아직 신고가 끝나지 않은 최근 2개월은 계산에서 뺐습니다.`));
  const list = document.createElement('dl');
  const backtestLabel = Number.isFinite(forecast.backtestMapePct)
    ? `과거 ${forecast.backtestSamples}번 확인 · 평균 ${forecast.backtestMapePct.toFixed(1)}% 차이`
    : `${forecast.backtestSamples || 0}회 · 표본 부족`;
  const coverageLabel = Number.isFinite(forecast.referenceRangeEmpiricalCoveragePct)
    ? `과거 ${forecast.referenceRangeEmpiricalCoveragePct.toFixed(0)}%가 범위 안 · 6개월 뒤 기준`
    : '검증 표본 부족';
  const skillLabel = Number.isFinite(forecast.baselineSkillPct)
    ? `그대로 유지된다고 볼 때보다 ${forecast.baselineSkillPct.toFixed(1)}% 더 정확`
    : '무변화 기준 비교 불가';
  [['예상 가능 범위', hasExactArea ? `${formatPrice(estimatedLow)} – ${formatPrice(estimatedHigh)}` : `${formatP33(last.lower)} – ${formatP33(last.upper)}`], ['평당으로 보면', `${formatP33(last.point)} · 1평≈3.3㎡`], ['과거 결과로 다시 확인', backtestLabel], ['가격 유지 가정과 비교', skillLabel], ['예상 범위 적중 기록', coverageLabel], ['거래가 있었던 달', `${forecast.observations}/${forecast.calendarSpanMonths}개월 · ${forecast.coveragePct.toFixed(0)}%`], ['계산에 사용한 거래', `${forecast.transactionCount.toLocaleString('ko-KR')}건`], ['신고 진행 중인 달 제외', `최근 ${forecast.incompleteMonths || 0}개월 · ${forecast.excludedIncompleteObservations || 0}개 관측 제외`], ['월별 가격 흔들림', `${forecast.residualVolatilityPct.toFixed(1)}%`], ['최근 6개월 거래량', `${forecast.recentVolume}건${Number.isFinite(forecast.volumeChangePct) ? ` · 이전 대비 ${forecast.volumeChangePct >= 0 ? '+' : ''}${forecast.volumeChangePct.toFixed(0)}%` : ''}`]].forEach(([term, desc]) => {
    list.append(createElement('dt', '', term), createElement('dd', '', desc));
  });
  root.append(list, createElement('p', '', '예상 범위는 과거에 틀렸던 폭을 이용한 참고값이며 미래 가격을 보장하지 않습니다. 거래 건수와 최근 개별 거래도 함께 확인하세요.'));
}

function selectedComplexMarketContext() {
  if (!state.complexRecords.length || !state.complexMeta || state.complexLoadingStage) return null;
  const dealType = $('#complexDealType')?.value || '매매';
  const area = Number($('#complexAreaBand')?.value);
  if (!Number.isFinite(area)) return null;
  const requestedMonths = Math.max(12, Math.min(60, Number(state.complexHistoryMonths) || 60));
  const responseRange = historyRangeFromPayload(state.complexMeta)
    || buildHistoryRange(Number(state.complexMeta?.effectiveHistoryMonths) || requestedMonths);
  const startMonthIndex = historyMonthIndex(responseRange.rangeStart);
  const endMonthIndex = historyMonthIndex(responseRange.rangeEnd);
  const inRange = (record) => Number(record.monthIndex) >= startMonthIndex && Number(record.monthIndex) <= endMonthIndex;
  const dealRecords = state.complexRecords.filter((record) => record.dealType === dealType && inRange(record));
  const records = dealRecords.filter((record) => Math.round(Number(record.areaM2) * 10) / 10 === area);
  const summary = buildMarketSummary(records, {
    source: state.complexMeta.demo ? '필터 동작 체험' : state.complexMeta.sourceLabel || '국토부 단지 실거래',
    sourceType: state.complexMeta.demo ? 'demo' : 'complex',
    provisionalMonths: state.complexMeta.demo ? 0 : 2,
  });
  const regionCode = summary.regions[0]?.code || '';
  return {
    mode: 'complex', summary, regionCode, dealType, band: 'all', area,
    records: [...records].sort((a, b) => b.monthIndex - a.monthIndex || b.day - a.day),
    dealRecords, requestedMonths, responseRange, endMonthIndex,
  };
}

function setMarketControlsForContext(complexMode) {
  ['.market-region-control', '.market-deal-control', '.market-area-control'].forEach((selector) => {
    const control = $(selector);
    if (control) control.hidden = complexMode;
  });
  $('.market-filter-bar')?.classList.toggle('is-complex-context', complexMode);
}

function renderComplexAreaRanking(context) {
  const root = $('#regionRanking');
  const groups = new Map();
  context.dealRecords.forEach((record) => {
    const area = (Math.round(Number(record.areaM2) * 10) / 10).toFixed(1);
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push(record);
  });
  const rows = [...groups.entries()].map(([area, records]) => ({
    area: Number(area),
    count: records.length,
    average: records.reduce((sum, record) => sum + Number(record.amountManWon || 0), 0) / Math.max(1, records.length),
    latestMonth: [...records].sort((a, b) => b.monthIndex - a.monthIndex || b.day - a.day)[0]?.month || '—',
  })).sort((a, b) => a.area - b.area).slice(0, 10);
  root.replaceChildren(...rows.map((item, index) => {
    const row = createElement('div', `region-rank-row${Math.abs(item.area - context.area) < .05 ? ' selected' : ''}`);
    row.append(createElement('span', '', String(index + 1).padStart(2, '0')));
    const copy = createElement('div');
    copy.append(createElement('strong', '', formatAreaPair(item.area)), createElement('small', '', `${item.latestMonth} · ${item.count.toLocaleString('ko-KR')}건`));
    row.append(copy, createElement('em', '', `평균 ${formatPrice(item.average)}`));
    return row;
  }));
  if (!rows.length) root.replaceChildren(createElement('div', 'map-search-message', '선택한 거래유형의 면적별 실거래가 없어요.'));
}

function renderMarketEmpty() {
  setMarketControlsForContext(false);
  $('#marketContextBanner').textContent = '단지를 검색하면 단지·거래유형·정확한 전용면적에 맞춰 요약·차트·예측이 함께 바뀝니다.';
  $('#kpiAverageTotal').textContent = '—';
  $('#kpiAverageP33').textContent = '—';
  $('#kpiAverageMonth').textContent = '단지 검색 전';
  $('#kpiMom').textContent = '—';
  $('#kpiMom').style.color = '';
  $('#kpiMomNote').textContent = '단지를 먼저 검색해주세요';
  $('#kpiCount').textContent = '—';
  $('#kpiQuality').textContent = '표본 확인 전';
  $('#transactionTitle').textContent = '최근 개별 거래';
  $('#marketTrendTitle').textContent = '월별 평균 실거래가격';
  $('#regionComparisonTitle').textContent = '선택 단지 면적별 평균';
  $('#forecastTitle').textContent = '6개월 평균 평당가 참고 전망';
  const chip = $('#marketSourceChip');
  chip.classList.remove('official');
  $('strong', chip).textContent = '실제 단지를 검색해 주세요';
  $('#marketUpdatedAt').textContent = '샘플 가격을 자동 표시하지 않습니다';
  destroyChart('trend');
  destroyChart('forecast');
  $('#transactionList').replaceChildren(createElement('div', 'map-search-message', '위에서 서울·경기 아파트를 검색하면 실제 계약 목록이 표시됩니다.'));
  $('#regionRanking').replaceChildren(createElement('div', 'map-search-message', '단지를 검색하면 같은 단지의 면적별 평균가격을 비교합니다.'));
  $('#forecastExplain').replaceChildren(createElement('strong', '', '단지 검색 후 계산합니다'), createElement('p', '', '선택한 전용면적의 실제 거래가 충분할 때만 예상가격을 보여드립니다.'));
  $('#showAllTransactions').hidden = true;
}

function renderMarket() {
  if (!state.marketSummary || state.currentView !== 'market') return;
  const complexContext = selectedComplexMarketContext();
  const hasRegionalData = validateMarketSummary(state.marketSummary);
  if (!complexContext && !hasRegionalData) {
    renderMarketEmpty();
    return;
  }
  const context = complexContext || {
    mode: 'region',
    summary: state.marketSummary,
    regionCode: $('#marketRegion').value,
    dealType: $('#marketDealType').value,
    band: $('#marketAreaBand').value,
    records: null,
  };
  const isComplex = context.mode === 'complex';
  setMarketControlsForContext(isComplex);
  const unit = $('#marketUnit').value;
  const series = withChanges(getSeries(context.summary, context.regionCode, context.dealType, context.band));
  const latest = series.at(-1);
  const contextName = isComplex ? `${state.complexMeta.query} · ${context.dealType} · ${formatAreaPair(context.area)}` : '선택 지역·면적대';
  $('#marketContextBanner').textContent = isComplex
    ? `${contextName}의 실제 거래를 기준으로 아래 모든 숫자와 그래프가 함께 바뀌었습니다.`
    : '아래 값은 선택한 지역·거래유형·면적대의 실제 거래를 평균낸 결과입니다.';
  $('#kpiAverageTotal').textContent = latest ? formatPrice(latest.averageTotal) : '—';
  $('#kpiAverageP33').textContent = latest ? formatP33(latest.averageP33) : '—';
  $('#kpiAverageMonth').textContent = latest ? `${latest.month}${context.summary.provisionalMonths ? ' · 최근월 잠정' : ''}` : '데이터 없음';
  $('#kpiMom').textContent = latest?.mom ? `${latest.mom.pct >= 0 ? '+' : ''}${latest.mom.pct.toFixed(1)}%` : '—';
  $('#kpiMom').style.color = latest?.mom?.pct > 0 ? '#e85d4a' : latest?.mom?.pct < 0 ? '#3178c6' : '';
  $('#kpiMomNote').textContent = latest?.mom ? '직전 달 평균 평당가격과 비교' : '직전 달 거래 표본 없음';
  $('#kpiCount').textContent = latest ? `${latest.count.toLocaleString('ko-KR')}건` : '—';
  $('#kpiQuality').textContent = latest
    ? isComplex ? `선택 면적 · 전체 ${context.records.length.toLocaleString('ko-KR')}건` : `표본 ${latest.quality === 'high' ? '충분' : latest.quality === 'medium' ? '보통' : '적음'} · ${latest.complexCount}개 단지`
    : '표본 없음';
  $('#transactionTitle').textContent = isComplex ? `${state.complexMeta.query} 최근 계약` : '최근 개별 거래';
  $('#marketTrendTitle').textContent = isComplex ? `${formatAreaPair(context.area)} 월별 평균가격` : '월별 평균 실거래가격';
  $('#regionComparisonTitle').textContent = isComplex ? '같은 단지 면적별 평균가격' : '지역별 같은 면적대 평균 평당가';
  $('#forecastTitle').textContent = isComplex ? `${formatAreaPair(context.area)} 6개월 참고 전망` : '6개월 평균 평당가 참고 전망';
  const chip = $('#marketSourceChip');
  if (isComplex) {
    chip.classList.toggle('official', !state.complexMeta.demo);
    $('strong', chip).textContent = state.complexMeta.demo ? '필터 동작 체험' : state.complexMeta.sourceLabel || '국토부 단지 실거래';
    $('#marketUpdatedAt').textContent = `${context.records.length.toLocaleString('ko-KR')}건 · 검색 결과 연동`;
  } else {
    chip.classList.toggle('official', context.summary.sourceType !== 'demo' && context.summary.sourceType !== 'imported');
    $('strong', chip).textContent = context.summary.source || '지역 실거래';
    $('#marketUpdatedAt').textContent = context.summary.generatedAt ? new Date(context.summary.generatedAt).toLocaleString('ko-KR') : '—';
  }
  renderTrendChart(series, unit, context.summary.provisionalMonths);
  if (isComplex) renderComplexAreaRanking(context);
  else renderRegionRanking(context.summary, context.dealType, context.band);
  const forecast = state.complexMeta?.partial && isComplex
    ? { eligible: false, reasons: ['일부 월의 거래를 받지 못해 예상가격 계산을 보류했습니다.'], observations: series.length, transactionCount: context.records.length, staleMonths: null }
    : fitDampedForecast(series, isComplex ? {
      windowMonths: Math.min(60, context.responseRange.months), minMonthlyCount: 1, minObservations: 12,
      minSpanMonths: 18, minTransactions: 20, maxStaleMonths: 4, asOfMonthIndex: context.endMonthIndex,
    } : {});
  renderForecastChart(series, forecast);
  renderForecastExplain(forecast, contextName, isComplex ? context.area : null);
  if (isComplex) renderTransactionRecords(context.records);
  else renderTransactions(context.summary, context.regionCode, context.dealType, context.band);
}

async function importMarketCsv(file) {
  if (!file) return;
  try {
    showToast('CSV를 읽고 지역·면적별로 집계하고 있어요.');
    const text = await file.text();
    const records = parseMolitCsv(text);
    if (!records.length) throw new Error('유효한 매매·전월세 거래를 찾지 못했습니다.');
    const summary = buildMarketSummary(records, { source: `직접 가져온 국토부 CSV · ${file.name}`, sourceType: 'imported' });
    await saveImportedMarket(summary);
    state.marketSummary = summary;
    populateMarketRegions();
    renderMarket();
    updateMarketConnection();
    showToast(`${records.length.toLocaleString('ko-KR')}건을 이 브라우저에 저장했어요.`);
  } catch (error) {
    showToast(error.message || 'CSV를 읽지 못했습니다.', 'error');
  }
}

async function loadApartmentCatalog() {
  if (!apartmentCatalogPromise) {
    apartmentCatalogPromise = fetch(APP_CONFIG.apartmentCatalogUrl, { cache: 'force-cache' })
      .then(async (response) => {
        if (!response.ok) throw new Error('서울·경기 단지 목록을 읽지 못했습니다.');
        const payload = await response.json();
        if (!Array.isArray(payload.apartments)) throw new Error('서울·경기 단지 목록 형식이 올바르지 않습니다.');
        updateApartmentCatalogConnection(payload);
        return payload;
      })
      .catch(() => {
        apartmentCatalogPromise = null;
        const unavailable = { schemaVersion: 1, source: { status: 'unavailable' }, apartments: [] };
        updateApartmentCatalogConnection(unavailable);
        return unavailable;
      });
  }
  return apartmentCatalogPromise;
}

function updateApartmentCatalogConnection(payload) {
  const stateElement = $('#apartmentCatalogState');
  const checkElement = $('#apartmentCatalogCheck');
  const publishedElement = $('#apartmentCatalogPublished');
  if (!stateElement || !checkElement) return;
  const count = Number(payload?.source?.catalogCount) || Number(payload?.apartments?.length) || 0;
  const connected = count > 0;
  stateElement.textContent = connected ? `${count.toLocaleString('ko-KR')}개` : '읽기 실패';
  stateElement.className = `service-state ${connected ? 'connected' : 'demo'}`;
  checkElement.classList.toggle('connection-warning', !connected);
  checkElement.textContent = connected
    ? `서울·경기 공식 단지 ${count.toLocaleString('ko-KR')}개 검색 가능`
    : '서울·경기 단지 목록을 읽지 못함 · 다음 검색에서 다시 시도';
  if (publishedElement) publishedElement.textContent = payload?.source?.publishedDate
    ? `공식 목록 기준 ${String(payload.source.publishedDate).replaceAll('-', '.')}`
    : '공식 목록 기준일을 읽지 못함';
}

async function loadApartmentCatalogMeta() {
  try {
    const response = await fetch(APP_CONFIG.apartmentCatalogMetaUrl, { cache: 'force-cache' });
    if (!response.ok) throw new Error('catalog metadata unavailable');
    updateApartmentCatalogConnection(await response.json());
  } catch (_) {
    updateApartmentCatalogConnection({ source: { status: 'unavailable' }, apartments: [] });
  }
}

function catalogMatchBadge(candidate) {
  if (candidate.matchTier === 'exact') return '정확히 일치';
  if (candidate.matchTier === 'fuzzy') return '비슷한 이름';
  if (candidate.relationTier === 'same-region-brand') return '같은 지역·브랜드';
  if (candidate.relationTier === 'same-region') return '같은 지역';
  if (candidate.relationTier === 'same-brand') return '같은 브랜드';
  return '공식 단지';
}

function candidateMeta(candidate) {
  return [
    candidate.regionName,
    candidate.dong,
    Number(candidate.builtYear) > 0 ? `${candidate.builtYear}년` : '',
    Number(candidate.households) > 0 ? `${Number(candidate.households).toLocaleString('ko-KR')}세대` : '',
  ].filter(Boolean).join(' · ');
}

function makeCatalogCandidateButton(candidate, onSelect) {
  const button = createElement('button', 'complex-candidate');
  button.type = 'button';
  button.setAttribute('role', 'option');
  button.append(
    createElement('strong', '', candidate.name || '이름 없는 단지'),
    createElement('em', '', catalogMatchBadge(candidate)),
    createElement('small', '', candidateMeta(candidate) || candidate.address || '공식 공동주택 목록'),
  );
  button.addEventListener('click', () => onSelect(candidate));
  return button;
}

function hideComplexSuggestions() {
  const panel = $('#complexSuggestionPanel');
  panel.hidden = true;
  panel.replaceChildren();
  $('#complexSearchInput').setAttribute('aria-expanded', 'false');
}

async function catalogMatchesFor(query, limit = 12) {
  const payload = await loadApartmentCatalog();
  const regionCode = $('#complexRegion').value;
  return searchApartmentCatalog(payload.apartments, query, {
    preferredRegionCode: regionCode,
    limit,
  });
}

function chooseCatalogComplex(candidate, runHistory = true) {
  if ([...$('#complexRegion').options].some((option) => option.value === String(candidate.regionCode || ''))) {
    $('#complexRegion').value = String(candidate.regionCode || '');
  }
  $('#complexSearchInput').value = candidate.name || '';
  hideComplexSuggestions();
  if (runHistory) searchComplexMarket(null, { ...candidate, aptSeq: '' });
}

async function showCatalogSuggestions(query, { announceEmpty = false, limit = 12 } = {}) {
  const requestToken = ++complexSuggestionToken;
  const matches = await catalogMatchesFor(query, limit);
  if (requestToken !== complexSuggestionToken) return [];
  const panel = $('#complexSuggestionPanel');
  if (!matches.length) {
    hideComplexSuggestions();
    if (announceEmpty) setComplexStatus('서울·경기 공식 단지 목록에서 결과를 찾지 못했어요. 단지명 철자나 지역명을 바꿔보세요.', true);
    return [];
  }
  const summary = createElement('div', 'complex-suggestion-summary');
  summary.append(
    createElement('strong', '', $('#complexRegion').value ? '선택 지역 우선 · 서울·경기 검색 결과' : '서울·경기 검색 결과'),
    createElement('small', '', `상위 ${matches.length}개 후보${/[래레]미안/u.test(query) ? ' · ‘래미안’ 표기와 비슷한 이름 포함' : ''}`),
  );
  panel.replaceChildren(summary, ...matches.map((candidate) => makeCatalogCandidateButton(candidate, chooseCatalogComplex)));
  panel.hidden = false;
  $('#complexSearchInput').setAttribute('aria-expanded', 'true');
  return matches;
}

async function renderRelatedComplexes(selected) {
  const root = $('#relatedComplexes');
  const payload = await loadApartmentCatalog();
  if (!payload.apartments.length || !selected) {
    root.hidden = true;
    root.replaceChildren();
    return;
  }
  const selectedCatalog = selected.catalogId
    ? selected
    : payload.apartments.find((candidate) => String(candidate.regionCode) === String(selected.regionCode)
      && normalizeComplexName(candidate.name) === normalizeComplexName(selected.name));
  const related = findRelatedApartments(selectedCatalog || selected, payload.apartments, 6);
  if (!related.length) {
    root.hidden = true;
    root.replaceChildren();
    return;
  }
  root.replaceChildren(createElement('strong', '', '비슷한 단지 더 보기'), ...related.map((candidate) => {
    const location = [candidate.dong || candidate.regionName, Number(candidate.builtYear) > 0 ? `${candidate.builtYear}년` : ''].filter(Boolean).join(' · ');
    const button = createElement('button', '', `${candidate.name} · ${location || '다른 지역'}`);
    button.type = 'button';
    button.title = catalogMatchBadge(candidate);
    button.addEventListener('click', () => chooseCatalogComplex(candidate));
    return button;
  }));
  root.hidden = false;
}

function renderRecentComplexes() {
  const root = $('#recentComplexes');
  const recent = loadRecentComplexes();
  root.replaceChildren(...recent.slice(0, 6).map((item) => {
    const button = createElement('button', '', `${item.regionName ? `${item.regionName} · ` : ''}${item.query}`);
    button.type = 'button';
    button.addEventListener('click', () => {
      state.marketIntentToken += 1;
      state.marketContextVisit = null;
      state.pendingComplexPreference = null;
      $('#complexSearchInput').value = item.query;
      if (item.regionCode) $('#complexRegion').value = item.regionCode;
      searchComplexMarket(new Event('submit'), item.aptSeq || item.dong ? item : null);
    });
    return button;
  }));
}

async function loadLawDistricts() {
  if (!lawDistrictsPromise) {
    lawDistrictsPromise = fetch(APP_CONFIG.lawDistrictsUrl, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('법정동 대조표를 읽지 못했습니다.');
        const payload = await response.json();
        if (!Array.isArray(payload.districts) || !payload.districts.length) throw new Error('법정동 대조표가 비어 있습니다.');
        return payload;
      })
      .catch(() => ({
        source: { districtCount: REGIONS.length },
        districts: REGIONS.map((region) => ({ code: region.code, sido: region.sido, sigungu: region.district, name: `${region.sido} ${region.district}` })),
        fallback: true,
      }));
  }
  return lawDistrictsPromise;
}

async function populateComplexRegions() {
  const payload = await loadLawDistricts();
  const select = $('#complexRegion');
  const current = select.value;
  const placeholder = createElement('option', '', '서울·경기 전체');
  placeholder.value = '';
  const scopedDistricts = payload.districts.filter((district) => ['서울특별시', '경기도'].includes(district.sido));
  const searchableDistricts = scopedDistricts.filter((district) => !scopedDistricts.some((other) => (
    other.sido === district.sido && other.sigungu.startsWith(`${district.sigungu} `)
  )));
  const groups = new Map();
  searchableDistricts.forEach((district) => {
    if (!groups.has(district.sido)) {
      const group = document.createElement('optgroup');
      group.label = district.sido;
      groups.set(district.sido, group);
    }
    const option = createElement('option', '', district.sigungu === district.sido ? district.name : district.sigungu);
    option.value = district.code;
    groups.get(district.sido).appendChild(option);
  });
  select.replaceChildren(placeholder, ...groups.values());
  if ([...select.options].some((option) => option.value === current)) select.value = current;
  const districtValues = [...new Set(searchableDistricts.flatMap((district) => [district.name, district.sigungu]).filter(Boolean))];
  $('#districtSuggestions').replaceChildren(...districtValues.map((value) => {
    const option = document.createElement('option');
    option.value = value;
    return option;
  }));
  const check = $('#lawDistrictCheck');
  check.classList.toggle('connection-warning', Boolean(payload.fallback));
  check.textContent = payload.fallback
    ? `서울·경기 대조표 갱신 전 · 기본 ${searchableDistricts.length}개 지역만 제공`
    : `서울·경기 법정동 대조표 정상 · ${searchableDistricts.length}개 시군구`;
}

function geocodeElement(result, type) {
  return (result?.elements || []).find((element) => (element.types || []).includes(type))?.longName || '';
}

async function mappedRegionFromGeocode(result) {
  if (!result) return null;
  const sido = geocodeElement(result, 'SIDO');
  const sigungu = [geocodeElement(result, 'SIGUGUN'), geocodeElement(result, 'SIGUGUN_ADDITIONAL')].filter(Boolean).join(' ');
  const payload = await loadLawDistricts();
  const match = payload.districts.find((district) => district.sido === sido && (
    district.sigungu === sigungu || (sido === '세종특별자치시' && district.sido === sido)
  ));
  if (!match) return null;
  return { code: match.code, sido: match.sido, district: match.sigungu, name: match.name, center: [result.lat, result.lng] };
}

async function regionFromSelection(code) {
  if (!code) return null;
  const payload = await loadLawDistricts();
  const match = payload.districts.find((district) => String(district.code) === String(code));
  return match ? { code: match.code, sido: match.sido, district: match.sigungu, name: match.name } : null;
}

async function regionForVisit(visit) {
  const address = String(visit?.address || '').replace(/\s+/g, ' ').trim();
  const payload = await loadLawDistricts();
  const matches = payload.districts.filter((district) => (
    address.includes(district.name)
    || (address.includes(district.sido) && address.includes(district.sigungu))
  )).sort((a, b) => b.sigungu.length - a.sigungu.length);
  if (matches[0]) {
    const district = matches[0];
    return { code: district.code, sido: district.sido, district: district.sigungu, name: district.name };
  }
  if (Number(visit?.lat) && Number(visit?.lng)) {
    try { return await homeMap.resolveRegion(visit.lat, visit.lng); } catch (_) {}
  }
  return null;
}

function applyPendingComplexPreference() {
  const preference = state.pendingComplexPreference;
  if (!preference) return;
  if (['매매', '전세'].includes(preference.dealType)) $('#complexDealType').value = preference.dealType;
  const options = [...$('#complexAreaBand').options]
    .map((option) => ({ option, area: Number(option.value) }))
    .filter((item) => Number.isFinite(item.area));
  if (options.length && Number(preference.areaM2) > 0) {
    options.sort((a, b) => Math.abs(a.area - Number(preference.areaM2)) - Math.abs(b.area - Number(preference.areaM2)));
    $('#complexAreaBand').value = options[0].option.value;
  }
  state.pendingComplexPreference = null;
}

async function openMarketForVisit(visit) {
  const intentToken = ++state.marketIntentToken;
  const isStaleIntent = () => intentToken !== state.marketIntentToken;
  state.complexRequestToken += 1;
  state.complexAbortController?.abort();
  state.complexAbortController = null;
  state.complexRecords = [];
  state.complexMeta = null;
  $('#complexHistoryCard').hidden = true;
  $('#visitDealGap').hidden = true;
  destroyChart('complex');
  setView('market');
  const visitHistoryWindow = historyWindowForVisit(visit?.visitDate, {
    currentMonths: state.complexHistoryMonths,
    endMonth: seoulCurrentMonth(),
    maxMonths: Math.min(60, Math.max(12, Number(state.localHistoryMonthsMax) || 60)),
  });
  state.complexHistoryMonths = visitHistoryWindow.months;
  $('#complexHistoryMonths').value = String(visitHistoryWindow.months);
  const cleanedName = String(visit?.name || '').replace(/^예시\s*·\s*/, '').trim();
  $('#complexSearchInput').value = cleanedName;
  if (visit?.dealType === '월세') {
    state.marketContextVisit = null;
    state.pendingComplexPreference = null;
    setComplexStatus('월세 기록은 보증금과 월세를 분리해야 정확히 비교할 수 있어요. 현재 단지 상세는 매매·전세 동일면적 비교를 지원합니다.', true);
    showToast('월세 동일면적 비교는 아직 지원하지 않아요.', 'error');
    return;
  }
  if (!state.marketSummary) {
    await loadMarketSummary();
    if (isStaleIntent()) return;
  }
  const region = await regionForVisit(visit);
  if (isStaleIntent()) return;
  if (!region || ![...$('#complexRegion').options].some((option) => option.value === String(region.code))) {
    state.marketContextVisit = null;
    state.pendingComplexPreference = null;
    setComplexStatus('주소에서 시군구를 찾지 못했어요. 지역을 선택한 뒤 시세 찾기를 눌러주세요.', true);
    showToast('실거래 지역을 자동으로 찾지 못했어요.', 'error');
    return;
  }
  const query = cleanedName;
  $('#complexRegion').value = String(region.code);
  $('#complexSearchInput').value = query;
  $('#complexDealType').value = visit.dealType;
  if ([...$('#marketRegion').options].some((option) => option.value === String(region.code))) {
    $('#marketRegion').value = String(region.code);
  }
  $('#marketDealType').value = visit.dealType;
  if (Number(visit.areaM2) > 0) $('#marketAreaBand').value = bandFor(Number(visit.areaM2));
  renderMarket();
  state.marketContextVisit = visit;
  state.pendingComplexPreference = { visitId: String(visit.id), areaM2: Number(visit.areaM2), dealType: visit.dealType };
  if (visitHistoryWindow.capped) {
    showToast('방문일이 5년보다 오래되어 제공 가능한 최대 5년 이력을 먼저 표시합니다.', 'error');
  }
  await searchComplexMarket(null);
  if (isStaleIntent()) return;
  if (!$('#complexHistoryCard').hidden) {
    $('#complexHistoryCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function setComplexStatus(message, error = false) {
  const element = $('#complexSearchStatus');
  const options = typeof message === 'object' && message !== null
    ? message
    : { message, tone: error ? 'error' : 'info' };
  element.hidden = !options.message && !options.title;
  if (element.hidden) {
    element.replaceChildren();
    element.className = 'complex-search-status';
    return;
  }
  const tone = options.tone || (error ? 'error' : 'info');
  element.className = `complex-search-status ${tone}`;
  const icon = setTablerIcon(createElement('span', 'complex-status-icon'), tablerIconName(options.icon, tone));
  icon.setAttribute('aria-hidden', 'true');
  const copy = createElement('div', 'complex-status-copy');
  if (options.title) copy.appendChild(createElement('strong', '', options.title));
  if (options.message) copy.appendChild(createElement('p', '', options.message));
  if (options.detail) copy.appendChild(createElement('small', '', options.detail));
  element.replaceChildren(icon, copy);
}

function setComplexSearchBusy(busy) {
  const button = $('#complexSearchSubmit');
  if (!button) return;
  button.disabled = Boolean(busy);
  button.classList.toggle('is-loading', Boolean(busy));
  button.setAttribute('aria-busy', String(Boolean(busy)));
  $('.complex-submit-label', button).textContent = busy ? '확인 중' : '검색';
}

const COMPLEX_LOADING_STAGES = {
  catalog: { index: 0, percent: 18, title: '공식 단지를 찾고 있어요', message: '서울·경기 단지명과 주소를 비교합니다.' },
  cache: { index: 1, percent: 42, title: '저장된 가격을 확인하고 있어요', message: '이 브라우저와 로컬 캐시에 같은 단지 이력이 있는지 확인합니다.' },
  remote: { index: 2, percent: 72, title: '국토부 실거래를 불러오고 있어요', message: '첫 조회는 선택 기간에 따라 잠시 걸릴 수 있습니다.' },
  render: { index: 3, percent: 94, title: '가격 흐름을 정리하고 있어요', message: '거래 유형과 실제 전용면적별로 결과를 다시 계산합니다.' },
};

function complexLoadingFilterLabel(extra = '') {
  const dealType = $('#complexDealType')?.value || '매매';
  const area = $('#complexAreaBand')?.value;
  const areaLabel = area && !$('#complexAreaBand')?.disabled
    ? ($('#complexAreaBand').selectedOptions[0]?.textContent || '선택 면적')
    : '전용면적은 거래 확인 후 선택';
  const period = historyPeriodLabel(Number($('#complexHistoryMonths')?.value) || state.complexHistoryMonths);
  return `${dealType} · ${areaLabel} · ${period}${extra ? ` · ${extra}` : ''}`;
}

function updateComplexLoading(stage = state.complexLoadingStage || 'catalog', overrides = {}) {
  const root = $('#complexLoadingState');
  const card = $('#complexHistoryCard');
  if (!root || !card) return;
  const config = COMPLEX_LOADING_STAGES[stage] || COMPLEX_LOADING_STAGES.catalog;
  state.complexLoadingStage = stage;
  card.hidden = false;
  card.classList.add('is-loading');
  card.setAttribute('aria-busy', 'true');
  root.hidden = false;
  root.dataset.stage = stage;
  $('#complexLoadingTitle').textContent = overrides.title || config.title;
  $('#complexLoadingMessage').textContent = overrides.message || config.message;
  $('#complexLoadingPercent').textContent = `${config.percent}%`;
  $('#complexLoadingBar').style.width = `${config.percent}%`;
  $('#complexLoadingFilterState').textContent = complexLoadingFilterLabel(overrides.filterNote || '조회 중 변경 사항도 결과에 반영됩니다');
  $$('[data-loading-step]', root).forEach((item, index) => {
    item.classList.toggle('is-complete', index < config.index);
    item.classList.toggle('is-active', index === config.index);
    if (index === config.index) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
}

function beginComplexLoading(query, candidate = null) {
  const dealType = $('#complexDealType').value;
  $('.complex-search-card')?.classList.remove('has-result');
  $('.complex-search-card')?.classList.add('is-searching');
  state.complexRecords = [];
  state.complexMeta = {
    query,
    address: '단지 위치 확인 중',
    region: null,
    cacheHit: false,
    sourceLabel: '',
    effectiveHistoryMonths: state.complexHistoryMonths,
    partial: false,
    missingRequests: [],
    catalogCandidate: candidate?.catalogId ? candidate : null,
  };
  state.complexLoadingStage = 'catalog';
  state.complexLoadingCandidate = candidate;
  $('#complexHistoryTitle').textContent = `${query} · ${dealType}`;
  $('#complexHistoryAddress').textContent = '공식 단지와 주소를 확인하고 있습니다.';
  $('#complexHistoryMeta').textContent = `${historyPeriodLabel(state.complexHistoryMonths)} 조회를 시작했습니다.`;
  $('#complexHistoryLayout').hidden = true;
  $('#complexEmptyState').hidden = true;
  $('#visitDealGap').hidden = true;
  $('#complexAreaBand').disabled = true;
  setComplexSourceBadge('조회 준비 중', 'loading');
  setMarketPanel('summary');
  renderMarketEmpty();
  $('#marketContextBanner').textContent = `${query}의 실제 거래를 확인하고 있어요. 완료되면 요약·가격 흐름·예측이 같은 결과로 함께 바뀝니다.`;
  updateComplexLoading('catalog');
}

function finishComplexLoading() {
  const root = $('#complexLoadingState');
  const card = $('#complexHistoryCard');
  if (root) root.hidden = true;
  if (card) {
    card.classList.remove('is-loading');
    card.setAttribute('aria-busy', 'false');
  }
  state.complexLoadingStage = '';
  state.complexLoadingCandidate = null;
  $('.complex-search-card')?.classList.remove('is-searching');
}

function setMarketPanel(panelName, { focus = false } = {}) {
  const names = ['summary', 'trend', 'forecast'];
  const selected = names.includes(panelName) ? panelName : 'summary';
  state.marketPanel = selected;
  $$('[data-market-tab]').forEach((button) => {
    const active = button.dataset.marketTab === selected;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  });
  $$('[data-market-panel]').forEach((panel) => {
    const active = panel.dataset.marketPanel === selected;
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
  });
  window.requestAnimationFrame(() => {
    if (selected === 'trend') state.charts.trend?.resize?.();
    if (selected === 'forecast') state.charts.forecast?.resize?.();
  });
}

function setComplexSourceBadge(label, tone = '') {
  const badge = $('#complexSourceBadge');
  badge.textContent = label;
  badge.className = `complex-source-badge${tone ? ` ${tone}` : ''}`;
}

function renderComplexUnavailable(code = 'unavailable') {
  const meta = state.complexMeta;
  if (!meta) return;
  const dealType = $('#complexDealType').value;
  const description = describeComplexAvailability(code);
  state.complexErrorCode = code;
  state.complexDemoMode = false;
  $('#complexHistoryCard').hidden = false;
  $('#complexHistoryCard').classList.toggle('is-jeonse', dealType === '전세');
  $('#complexHistoryLayout').hidden = true;
  $('#complexHistoryMeta').textContent = `${historyPeriodLabel(state.complexHistoryMonths)} 이력을 확인하고 있습니다.`;
  if (code === 'loading') {
    $('#complexEmptyState').hidden = true;
    $('#visitDealGap').hidden = true;
    $('#complexHistoryTitle').textContent = `${meta.query} · ${dealType}`;
    $('#complexHistoryAddress').textContent = `${meta.address} · 공식 단지 정보 확인 완료`;
    setComplexSourceBadge('저장 가격 확인 중', 'loading');
    const areaSelect = $('#complexAreaBand');
    const option = createElement('option', '', `${dealType} 거래 확인 후 면적 선택`);
    option.value = '';
    areaSelect.replaceChildren(option);
    areaSelect.disabled = true;
    updateComplexLoading('cache');
    setComplexStatus({
      tone: 'loading', icon: '↻', title: '공식 단지를 확인했어요',
      message: '저장된 가격이 있는지 먼저 확인한 뒤 필요한 경우 국토부 실거래를 요청합니다.',
      detail: `${meta.region?.name || '서울·경기'} · ${historyPeriodLabel(state.complexHistoryMonths)}`,
    });
    return;
  }
  finishComplexLoading();
  $('.complex-search-card')?.classList.remove('has-result');
  renderMarket();
  $('#complexEmptyState').hidden = false;
  $('#visitDealGap').hidden = true;
  $('#complexHistoryTitle').textContent = `${meta.query} · ${dealType}`;
  $('#complexHistoryAddress').textContent = `${meta.address} · 공식 단지 정보 확인 완료`;
  setComplexSourceBadge(code === 'loading' ? '저장본 확인 중' : '실거래 연결 대기', code === 'loading' ? 'loading' : 'waiting');
  setTablerIcon($('#complexEmptyIcon'), tablerIconName(description.icon, description.tone));
  $('#complexEmptyEyebrow').textContent = description.eyebrow;
  $('#complexEmptyTitle').textContent = description.title;
  $('#complexEmptyMessage').textContent = description.message;
  const facts = [
    meta.region?.name,
    meta.catalogCandidate?.dong,
    Number(meta.catalogCandidate?.builtYear) ? `${meta.catalogCandidate.builtYear}년 준공` : '',
    Number(meta.catalogCandidate?.households) ? `${Number(meta.catalogCandidate.households).toLocaleString('ko-KR')}세대` : '',
  ].filter(Boolean);
  $('#complexEmptyFacts').replaceChildren(...facts.map((fact) => createElement('span', '', fact)));
  const areaSelect = $('#complexAreaBand');
  const option = createElement('option', '', `${dealType} 실거래 연결 후 면적 표시`);
  option.value = '';
  areaSelect.replaceChildren(option);
  areaSelect.disabled = true;
  $('#complexRetrySearch').hidden = code === 'loading';
  $('#complexTryDemo').hidden = code === 'loading';
  setComplexStatus({
    tone: description.tone,
    icon: description.icon,
    title: description.title,
    message: description.message,
    detail: code === 'not-deployed'
      ? '공식 단지 검색 정상 · 단지별 가격 서버 미배포'
      : code === 'key-required' ? '로컬 서버 정상 · 키는 .env 또는 실행 메모리로 연결' : '공식 단지 선택 정보는 유지했습니다.',
  });
}

function buildComplexInteractionDemo() {
  const records = [];
  const now = new Date();
  now.setDate(1);
  for (let offset = 17; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const month = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    [
      { dealType: '매매', areaM2: 59.9, base: 92000, step: 460 },
      { dealType: '매매', areaM2: 84.9, base: 127000, step: 620 },
      { dealType: '전세', areaM2: 59.9, base: 51000, step: 220 },
      { dealType: '전세', areaM2: 84.9, base: 71000, step: 280 },
    ].forEach((preset, presetIndex) => {
      [4, 16, 25].forEach((day, sampleIndex) => {
        const amount = preset.base + (17 - offset) * preset.step + (sampleIndex - 1) * (430 + presetIndex * 90);
        records.push(normalizeTransaction({
          id: `complex-ui-demo-${preset.dealType}-${preset.areaM2}-${month}-${day}`,
          aptSeq: 'UI-DEMO', dealType: preset.dealType, regionCode: 'ui-demo', regionName: 'UI 동작 예시',
          dong: '가상동', apartmentName: 'UI 예시 · 래미안 가상단지', month, day,
          areaM2: preset.areaM2, amountManWon: preset.dealType === '매매' ? amount : 0,
          depositManWon: preset.dealType === '전세' ? amount : 0, floor: 8 + sampleIndex, builtYear: 2018,
        }));
      });
    });
  }
  return records.filter(Boolean);
}

function startComplexInteractionDemo() {
  state.complexRecords = buildComplexInteractionDemo();
  state.complexMeta = {
    query: 'UI 예시 · 래미안 가상단지',
    address: '필터 동작 확인용 가상 데이터 · 실제 시세 아님',
    region: { code: 'ui-demo', name: 'UI 동작 예시' },
    sourceLabel: 'UI 동작 예시', demo: true, cacheHit: false, partial: false, missingRequests: [],
    catalogCandidate: null,
  };
  state.complexErrorCode = '';
  state.complexDemoMode = true;
  $('#complexDealType').value = '매매';
  populateComplexAreas();
  renderComplexHistory();
  setComplexStatus({
    tone: 'success', icon: '↔', title: '필터가 실제로 바뀌는지 확인해보세요',
    message: '매매↔전세와 전용 59.9㎡↔84.9㎡를 바꾸면 가격·거래량·차트가 즉시 다시 계산됩니다.',
    detail: 'UI 동작 예시 · 실제 단지 시세가 아니며 저장되지 않습니다.',
  });
}

function normalizeComplexName(value) {
  return normalizeApartmentSearchText(value);
}

function historyMonthIndex(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return Number.NaN;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

function seoulCurrentMonth(now = new Date()) {
  const seoul = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return monthFromIndexValue(seoul.getUTCFullYear() * 12 + seoul.getUTCMonth());
}

function historyPeriodLabel(months) {
  const normalized = Math.max(1, Math.min(60, Math.trunc(Number(months) || 60)));
  if (normalized === 12) return '최근 1년';
  if (normalized === 36) return '최근 3년';
  if (normalized === 60) return '최근 5년';
  return `최근 ${normalized}개월`;
}

function buildHistoryRange(months, endMonth = seoulCurrentMonth()) {
  const normalizedMonths = Math.max(1, Math.min(60, Math.trunc(Number(months) || 60)));
  const endIndex = historyMonthIndex(endMonth);
  if (!Number.isInteger(endIndex)) return null;
  return {
    months: normalizedMonths,
    endMonth,
    rangeStart: monthFromIndexValue(endIndex - normalizedMonths + 1),
    rangeEnd: endMonth,
    includesCurrentMonth: endMonth === seoulCurrentMonth(),
  };
}

function historyRangeFromPayload(payload) {
  const months = Math.trunc(Number(payload?.months));
  const rangeEnd = String(payload?.rangeEnd || '');
  const expected = buildHistoryRange(months, rangeEnd);
  if (!expected
      || months < 1 || months > 60
      || payload?.endMonth !== rangeEnd
      || payload?.rangeStart !== expected.rangeStart
      || typeof payload?.includesCurrentMonth !== 'boolean'
      || payload.includesCurrentMonth !== expected.includesCurrentMonth) return null;
  return { ...expected, includesCurrentMonth: payload.includesCurrentMonth };
}

function selectComplexMatch(records, query, candidate = null) {
  const groups = new Map();
  records.forEach((record) => {
    const name = String(record.apartmentName || '');
    const aptSeq = String(record.aptSeq || '');
    const dong = String(record.dong || '');
    const key = aptSeq || `${dong}|${normalizeComplexName(name)}`;
    if (!groups.has(key)) groups.set(key, { key, aptSeq, name, dong, builtYear: record.builtYear || 0, records: [] });
    groups.get(key).records.push(record);
  });
  let matches = [...groups.values()];
  if (candidate?.aptSeq) matches = matches.filter((group) => group.aptSeq === String(candidate.aptSeq));
  else if (candidate?.dong) matches = matches.filter((group) => group.dong === candidate.dong && normalizeComplexName(group.name) === normalizeComplexName(candidate.name || query));
  else {
    const target = normalizeComplexName(query);
    const exact = matches.filter((group) => normalizeComplexName(group.name) === target);
    matches = exact.length ? exact : matches.filter((group) => {
      const name = normalizeComplexName(group.name);
      return name.includes(target) || target.includes(name);
    });
  }
  if (matches.length === 1) return { records: matches[0].records, candidates: [], selected: matches[0] };
  return {
    records: [],
    candidates: matches.slice(0, 12).map((group) => ({ aptSeq: group.aptSeq, name: group.name, dong: group.dong, builtYear: group.builtYear, count: group.records.length })),
    selected: null,
  };
}

function matchingLocalComplex(query, regionCode, candidate = null) {
  const region = getRegion(state.marketSummary, regionCode);
  return selectComplexMatch(region?.recentTransactions || [], query, candidate);
}

async function loadStaticApartmentHistory() {
  if (!staticApartmentHistoryPromise) {
    staticApartmentHistoryPromise = fetch(APP_CONFIG.apartmentHistoryStaticUrl, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : { apartments: [] })
      .catch(() => ({ apartments: [] }));
  }
  return staticApartmentHistoryPromise;
}

async function matchingStaticApartment(query, regionCode, candidate = null, requestedMonths = 60) {
  const normalized = normalizeComplexName(query);
  const payload = await loadStaticApartmentHistory();
  const apartments = (payload.apartments || []).filter((item) => {
    const name = normalizeComplexName(item.name);
    return String(item.lawdCd) === String(regionCode) && (
      candidate?.aptSeq ? String(item.aptSeq || '') === String(candidate.aptSeq) : name === normalized
    );
  });
  if (apartments.length !== 1) return { records: [], candidates: [] };
  const coveredMonths = Number(apartments[0].coveredMonths ?? payload.coveredMonths ?? 0);
  if (!Number.isFinite(coveredMonths) || coveredMonths < requestedMonths) return { records: [], candidates: [] };
  const records = (apartments[0].transactions || []).map(normalizeTransaction).filter(Boolean);
  let range = historyRangeFromPayload(apartments[0]) || historyRangeFromPayload(payload);
  if (!range) {
    const generatedAt = new Date(apartments[0].updatedAt || payload.generatedAt || '');
    const generatedMonthIndex = Number.isFinite(generatedAt.getTime())
      ? historyMonthIndex(seoulCurrentMonth(generatedAt)) - 1
      : Number.NaN;
    const latestRecordIndex = records.reduce((latest, record) => Math.max(latest, Number(record.monthIndex)), Number.NEGATIVE_INFINITY);
    const fallbackEnd = Number.isInteger(generatedMonthIndex)
      ? monthFromIndexValue(generatedMonthIndex)
      : Number.isFinite(latestRecordIndex)
        ? monthFromIndexValue(latestRecordIndex)
        : monthFromIndexValue(historyMonthIndex(seoulCurrentMonth()) - 1);
    range = buildHistoryRange(coveredMonths, fallbackEnd);
  }
  range = buildHistoryRange(requestedMonths, range.rangeEnd);
  return {
    records,
    candidates: [],
    selected: { aptSeq: apartments[0].aptSeq || '', name: apartments[0].name, dong: apartments[0].dong || '' },
    range,
  };
}

function showComplexCandidates(candidates, region) {
  finishComplexLoading();
  $('#complexHistoryCard').hidden = true;
  const element = $('#complexSearchStatus');
  element.hidden = false;
  element.className = 'complex-search-status choice';
  const heading = createElement('div', 'complex-status-copy');
  heading.append(createElement('strong', '', '같은 검색어의 단지가 여러 곳이에요.'), createElement('p', '', '지역과 주소를 보고 정확한 단지를 골라주세요.'));
  element.replaceChildren(setTablerIcon(createElement('span', 'complex-status-icon'), 'home-search'), heading);
  const list = createElement('div', 'complex-candidates');
  candidates.forEach((candidate) => {
    const detail = [candidate.regionName, candidate.dong, candidate.builtYear ? `${candidate.builtYear}년` : ''].filter(Boolean).join(' · ');
    const button = createElement('button', '', `${candidate.name}${detail ? ` · ${detail}` : ''}`);
    button.type = 'button';
    button.addEventListener('click', () => {
      const candidateRegionCode = String(candidate.regionCode || region?.code || '');
      if ([...$('#complexRegion').options].some((option) => option.value === candidateRegionCode)) {
        $('#complexRegion').value = candidateRegionCode;
      }
      $('#complexSearchInput').value = candidate.name;
      searchComplexMarket(null, candidate);
    });
    list.appendChild(button);
  });
  element.appendChild(list);
}

async function searchComplexMarket(event, candidate = null) {
  event?.preventDefault?.();
  window.clearTimeout(complexSuggestionTimer);
  complexSuggestionTimer = null;
  complexSuggestionToken += 1;
  hideComplexSuggestions();
  let query = (candidate?.name || $('#complexSearchInput').value).trim();
  if (!query) return showToast('정확한 단지명을 입력해주세요.', 'error');
  const requestToken = ++state.complexRequestToken;
  state.complexAbortController?.abort();
  state.complexAbortController = null;
  const isStaleRequest = () => requestToken !== state.complexRequestToken;
  setComplexSearchBusy(true);
  try {
  destroyChart('complex');
  beginComplexLoading(query, candidate);
  setComplexStatus({ tone: 'loading', icon: '↻', title: '서울·경기 공식 단지에서 찾는 중', message: '지역을 몰라도 단지명과 주소를 함께 비교해 가장 가까운 후보를 찾습니다.' });

  if (!candidate) {
    const catalogMatches = await showCatalogSuggestions(query, { announceEmpty: false, limit: 12 });
    if (isStaleRequest()) return;
    const exactMatches = catalogMatches.filter((item) => item.matchTier === 'exact');
    if (exactMatches.length === 1) {
      [candidate] = exactMatches;
      query = candidate.name;
      state.complexMeta.catalogCandidate = candidate;
      state.complexLoadingCandidate = candidate;
      $('#complexSearchInput').value = query;
      hideComplexSuggestions();
      $('#complexHistoryTitle').textContent = `${query} · ${$('#complexDealType').value}`;
      updateComplexLoading('catalog', { message: '공식 단지를 찾았습니다. 지역과 주소를 확인합니다.' });
    } else if (catalogMatches.length) {
      finishComplexLoading();
      $('#complexHistoryCard').hidden = true;
      setComplexStatus(`공식 단지 후보 상위 ${catalogMatches.length}개를 찾았어요. 지역과 단지 정보를 보고 하나를 선택해주세요.`);
      return;
    }
  } else {
    query = candidate.name || query;
    state.complexLoadingCandidate = candidate;
    if (candidate?.catalogId) state.complexMeta.catalogCandidate = candidate;
    $('#complexSearchInput').value = query;
    hideComplexSuggestions();
    $('#complexHistoryTitle').textContent = `${query} · ${$('#complexDealType').value}`;
    updateComplexLoading('catalog', { message: '선택한 공식 단지의 지역과 주소를 확인합니다.' });
  }

  let region = candidate?.regionCode
    ? await regionFromSelection(candidate.regionCode)
    : await regionFromSelection($('#complexRegion').value);
  if (isStaleRequest()) return;
  let geo = [];
  if (!region) {
    try { geo = await homeMap.search(query); } catch (_) {}
    if (isStaleRequest()) return;
    if (geo[0]) {
      try { region = await homeMap.resolveRegion(geo[0].lat, geo[0].lng); } catch (_) {}
      if (isStaleRequest()) return;
      region ||= await mappedRegionFromGeocode(geo[0]);
      if (isStaleRequest()) return;
    }
  }
  const address = candidate?.address || geo[0]?.roadAddress || geo[0]?.jibunAddress || region?.name || query;
  if (!region) {
    finishComplexLoading();
    $('#complexHistoryCard').hidden = true;
    setComplexStatus('공식 목록에서 단지를 찾지 못했어요. “시군구 + 단지명”처럼 조금 더 구체적으로 입력하거나 후보에서 골라주세요.', true);
    return;
  }
  $('#complexRegion').value = region.code;
  const historyMonths = Math.max(12, Math.min(60, Number(state.complexHistoryMonths) || 60));
  const effectiveHistoryMonths = APP_CONFIG.localMarketEnabled
    ? Math.min(historyMonths, Math.max(12, Number(state.localHistoryMonthsMax) || historyMonths))
    : historyMonths;
  const requestRange = buildHistoryRange(effectiveHistoryMonths);
  const cacheIdentity = {
    aptSeq: candidate?.aptSeq || '',
    dong: candidate?.aptSeq ? '' : (candidate?.dong || ''),
    months: effectiveHistoryMonths,
    endMonth: requestRange.endMonth,
  };
  const identityKey = cacheIdentity.aptSeq || cacheIdentity.dong;
  const complex = {
    key: `${region.code}:${identityKey}:${normalizeComplexName(query)}`,
    query,
    address,
    regionCode: region.code,
    regionName: region.name,
    aptSeq: candidate?.aptSeq || '',
    dong: candidate?.dong || '',
    catalogId: candidate?.catalogId || '',
  };
  if (candidate?.catalogId || candidate?.aptSeq || candidate?.dong) {
    rememberComplex(complex);
    renderRecentComplexes();
  }
  void renderRelatedComplexes(candidate || complex);
  state.complexRecords = [];
  state.complexMeta = {
    query, address, region, cacheHit: false, sourceLabel: '', effectiveHistoryMonths, ...requestRange,
    aptSeq: candidate?.aptSeq || '', dong: candidate?.dong || '', partial: false, missingRequests: [],
    catalogCandidate: candidate?.catalogId ? candidate : null,
  };
  renderComplexUnavailable('loading');

  let match = await matchingStaticApartment(query, region.code, candidate, effectiveHistoryMonths);
  if (isStaleRequest()) return;
  let records = match.records;
  let needsRemote = !records.length
    || !match.range
    || match.range.months !== requestRange.months
    || match.range.rangeEnd !== requestRange.rangeEnd;
  let cacheHit = false;
  let partial = false;
  let missingRequests = [];
  let remoteErrorMessage = '';
  let remoteErrorCode = '';
  let cacheSaveFailed = false;
  let authoritativeEmpty = false;
  let sourceLabel = records.length ? '정적 JSON' : '';
  let actualName = match.selected?.name || query;
  let actualAptSeq = match.selected?.aptSeq || candidate?.aptSeq || '';
  let actualDong = match.selected?.dong || candidate?.dong || '';
  let activeHistoryRange = match.range || requestRange;
  {
    const browserCache = await loadComplexHistory(region.code, query, cacheIdentity);
    if (isStaleRequest()) return;
    const browserRange = historyRangeFromPayload(browserCache);
    if (browserRange && Array.isArray(browserCache?.records) && browserCache.partial !== true) {
      records = browserCache.records.map(normalizeTransaction).filter(Boolean);
      actualName = browserCache.aptName || query;
      actualAptSeq = browserCache.aptSeq || actualAptSeq;
      actualDong = browserCache.dong || actualDong;
      partial = Boolean(browserCache.partial);
      missingRequests = Array.isArray(browserCache.missingRequests) ? browserCache.missingRequests : [];
      sourceLabel = '이 브라우저 저장본';
      cacheHit = true;
      activeHistoryRange = browserRange;
      const cachedAt = Date.parse(browserCache.cachedAt || '');
      needsRemote = !Number.isFinite(cachedAt) || Date.now() - cachedAt >= 24 * 60 * 60 * 1000;
      authoritativeEmpty = records.length === 0;
      if (needsRemote) {
        state.complexRecords = records;
        state.complexMeta = {
          query: actualName, address, region, cacheHit, sourceLabel,
          effectiveHistoryMonths: activeHistoryRange.months, ...activeHistoryRange,
          aptSeq: actualAptSeq, dong: actualDong, partial, missingRequests,
          catalogCandidate: candidate?.catalogId ? candidate : null,
        };
        populateComplexAreas();
        applyPendingComplexPreference();
        renderComplexHistory();
        setComplexStatus('이 브라우저 저장본을 먼저 표시했습니다. 최신 실거래를 확인하고 있어요.');
      }
    }
  }
  if (records.length && needsRemote && sourceLabel === '정적 JSON') {
    state.complexRecords = records;
    state.complexMeta = {
      query: actualName, address, region, cacheHit, sourceLabel,
      effectiveHistoryMonths: activeHistoryRange.months, ...activeHistoryRange,
      aptSeq: actualAptSeq, dong: actualDong, partial: false, missingRequests: [],
      catalogCandidate: candidate?.catalogId ? candidate : null,
    };
    populateComplexAreas();
    applyPendingComplexPreference();
    renderComplexHistory();
    setComplexStatus(`완료된 월까지의 정적 저장본(${activeHistoryRange.rangeEnd})을 먼저 표시했습니다. 이번 달 실거래를 확인하고 있어요.`);
  }
  if (!records.length && !authoritativeEmpty && state.marketSummary?.sourceType === 'demo') {
    match = matchingLocalComplex(query, region.code, candidate);
    if (match.candidates.length > 1) return showComplexCandidates(match.candidates, region);
    records = match.records;
    actualName = match.selected?.name || actualName;
    actualAptSeq = match.selected?.aptSeq || actualAptSeq;
    actualDong = match.selected?.dong || actualDong;
    sourceLabel = records.length ? '화면 검증용 예시' : '';
    needsRemote = !records.length;
  }
  if (needsRemote && !APP_CONFIG.apartmentHistoryEnabled) {
    needsRemote = false;
    remoteErrorCode = classifyComplexFailure({ apiEnabled: false });
    remoteErrorMessage = '단지별 실거래 서버가 아직 배포되지 않아 새 가격 이력은 요청하지 않았습니다.';
  }
  if (needsRemote) {
    if (!records.length) {
      updateComplexLoading('remote', {
        message: APP_CONFIG.localMarketEnabled
          ? '서울·경기 실제 매매·전월세를 확인합니다. 첫 조회 뒤에는 로컬 캐시를 사용합니다.'
          : '첫 조회는 20–60초 걸릴 수 있습니다. 완료되면 다음부터 저장본을 먼저 표시합니다.',
      });
      setComplexSourceBadge('국토부 조회 중', 'loading');
      setComplexStatus(APP_CONFIG.localMarketEnabled
        ? '서울·경기 실제 매매·전월세를 확인하고 있어요. 첫 조회 뒤에는 로컬 캐시를 사용합니다.'
        : '첫 조회는 20–60초 걸릴 수 있어요. 조회가 끝나면 다음부터 캐시를 사용합니다.');
    }
    let timeout;
    try {
      const controller = new AbortController();
      state.complexAbortController = controller;
      const timeoutMs = APP_CONFIG.localMarketEnabled
        ? Math.min(240000, Math.max(125000, effectiveHistoryMonths * 3500))
        : Math.min(120000, Math.max(65000, effectiveHistoryMonths * 2000));
      timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      const url = new URL(APP_CONFIG.apartmentHistoryUrl);
      url.searchParams.set('lawdCd', region.code);
      url.searchParams.set('aptName', query);
      url.searchParams.set('months', String(effectiveHistoryMonths));
      url.searchParams.set('endMonth', requestRange.endMonth);
      if (candidate?.aptSeq) url.searchParams.set('aptSeq', candidate.aptSeq);
      else if (candidate?.dong) url.searchParams.set('dong', candidate.dong);
      const response = await fetch(url, { signal: controller.signal });
      if (isStaleRequest()) return;
      if (response.ok) {
        const payload = await response.json();
        if (isStaleRequest()) return;
        const remoteRecords = (payload.records || []).map(normalizeTransaction).filter(Boolean);
        const payloadRange = historyRangeFromPayload(payload);
        if (!payloadRange || payloadRange.rangeEnd !== requestRange.rangeEnd) {
          remoteErrorCode = 'outdated-client';
          remoteErrorMessage = '실거래 서버의 조회 기간 정보가 현재 화면과 맞지 않습니다. 로컬 서버를 재시작하거나 배포 버전을 확인해주세요.';
        } else if (payload.partial) {
          const payloadMissingRequests = Array.isArray(payload.missingRequests) ? payload.missingRequests : [];
          remoteErrorCode = 'partial';
          remoteErrorMessage = `이번 조회에서 ${payloadMissingRequests.length || '일부'}개 월·유형을 받지 못해 완전한 저장본으로 교체하지 않았습니다.`;
          if (!records.length && remoteRecords.length) {
            records = remoteRecords;
            authoritativeEmpty = false;
            cacheHit = Boolean(payload.cacheHit);
            actualName = payload.aptName || actualName;
            actualAptSeq = payload.aptSeq || actualAptSeq;
            actualDong = payload.dong || actualDong;
            partial = true;
            missingRequests = payloadMissingRequests;
            activeHistoryRange = payloadRange;
            sourceLabel = '국토부 실거래 · 일부 응답';
          }
        } else {
          records = remoteRecords;
          authoritativeEmpty = remoteRecords.length === 0;
          cacheHit = Boolean(payload.cacheHit);
          actualName = payload.aptName || actualName;
          actualAptSeq = payload.aptSeq || actualAptSeq;
          actualDong = payload.dong || actualDong;
          partial = false;
          missingRequests = [];
          activeHistoryRange = payloadRange;
          sourceLabel = payload.source === 'molit-live'
            ? '국토부 실거래 · 로컬 직접 조회'
            : payload.source?.includes?.('local') || APP_CONFIG.localMarketEnabled
              ? '국토부 실거래 · 로컬 캐시'
              : cacheHit ? '파이어베이스 캐시' : '국토부 실거래';
          try {
            await saveComplexHistory(region.code, query, {
              records, aptName: actualName, aptSeq: actualAptSeq, dong: actualDong, partial, missingRequests,
              ...payloadRange,
            }, { ...cacheIdentity, months: payloadRange.months, endMonth: payloadRange.endMonth });
          } catch (_) {
            cacheSaveFailed = true;
          }
          if (authoritativeEmpty) {
            remoteErrorCode = 'empty';
            remoteErrorMessage = '서버 응답은 정상이나 선택한 범위에 신고된 매매·전세 이력이 없습니다.';
          }
        }
        if (isStaleRequest()) return;
      } else if (response.status === 409) {
        const payload = await response.json().catch(() => ({}));
        if (isStaleRequest()) return;
        if (Array.isArray(payload.candidates) && payload.candidates.length) return showComplexCandidates(payload.candidates, region);
      } else if (response.status === 503 && APP_CONFIG.localMarketEnabled) {
        const payload = await response.json().catch(() => ({}));
        remoteErrorCode = 'key-required';
        remoteErrorMessage = payload.error || '로컬 실거래 서버에 국토부 서비스키를 연결해주세요.';
        openLocalKeyModal();
      } else if (response.status === 404) {
        remoteErrorCode = classifyComplexFailure({ status: response.status });
        remoteErrorMessage = '단지 실거래 조회 API가 아직 배포되지 않았어요. 연결 상태에서 설정을 확인해주세요.';
      } else if (response.status === 429) {
        remoteErrorCode = classifyComplexFailure({ status: response.status });
        remoteErrorMessage = '단지 실거래 조회가 잠시 제한됐어요. 잠시 뒤 다시 시도해주세요.';
      } else {
        remoteErrorCode = classifyComplexFailure({ status: response.status });
        remoteErrorMessage = `단지 실거래 연결이 응답하지 않아요. 잠시 뒤 다시 시도해주세요. (${response.status})`;
      }
    } catch (error) {
      // A valid browser cache remains visible when refresh fails.
      remoteErrorCode = classifyComplexFailure({
        errorName: error?.name || '',
        online: navigator.onLine !== false,
      });
      remoteErrorMessage = error?.name === 'AbortError'
        ? '단지 실거래 조회 시간이 초과됐어요. 저장된 결과가 있으면 먼저 표시합니다.'
        : navigator.onLine === false
          ? '현재 오프라인입니다. 저장된 결과가 있으면 먼저 표시합니다.'
          : '단지 실거래 서버가 응답하지 않아요. 저장된 결과가 있으면 먼저 표시합니다.';
    } finally {
      window.clearTimeout(timeout);
      if (!isStaleRequest()) state.complexAbortController = null;
    }
  }

  if (isStaleRequest()) return;
  if (!records.length && !authoritativeEmpty) {
    match = matchingLocalComplex(query, region.code, candidate);
    if (match.candidates.length > 1) return showComplexCandidates(match.candidates, region);
    records = match.records;
    actualName = match.selected?.name || actualName;
    actualAptSeq = match.selected?.aptSeq || actualAptSeq;
    actualDong = match.selected?.dong || actualDong;
    sourceLabel = records.length ? '지역 요약 캐시' : '';
  }
  if (isStaleRequest()) return;
  if (!$('#complexLoadingState').hidden) updateComplexLoading('render');
  if (!records.length) {
    state.complexRecords = [];
    state.pendingComplexPreference = null;
    state.complexMeta = {
      query: actualName, address, region, cacheHit, sourceLabel,
      effectiveHistoryMonths: activeHistoryRange.months, ...activeHistoryRange,
      aptSeq: actualAptSeq, dong: actualDong, partial, missingRequests,
      catalogCandidate: candidate?.catalogId ? candidate : null,
    };
    renderComplexUnavailable(remoteErrorCode || 'empty');
    return;
  }
  state.complexRecords = records;
  state.complexErrorCode = '';
  state.complexDemoMode = false;
  state.complexMeta = {
    query: actualName, address, region, cacheHit, sourceLabel,
    effectiveHistoryMonths: activeHistoryRange.months, ...activeHistoryRange,
    aptSeq: actualAptSeq, dong: actualDong, partial, missingRequests,
    catalogCandidate: candidate?.catalogId ? candidate : null,
  };
  rememberComplex({
    key: `${region.code}:${actualAptSeq || actualDong}:${normalizeComplexName(actualName)}`,
    query: actualName, address, regionCode: region.code, regionName: region.name, aptSeq: actualAptSeq, dong: actualDong,
  });
  renderRecentComplexes();
  void renderRelatedComplexes(candidate || state.complexMeta);
  setComplexStatus({
    tone: remoteErrorMessage || partial || cacheSaveFailed ? 'warning' : 'success',
    icon: remoteErrorMessage || partial || cacheSaveFailed ? '!' : '✓',
    title: `${sourceLabel} ${records.length.toLocaleString('ko-KR')}건 · ${historyPeriodLabel(historyMonths)} 요청`,
    message: activeHistoryRange.months < historyMonths
      ? `현재 응답은 최근 ${activeHistoryRange.months}개월 범위입니다. 서버를 재시작하거나 다시 조회하면 선택한 기간 전체를 읽습니다.`
      : remoteErrorMessage || (partial
      ? `${missingRequests.length}개 월·유형 요청은 누락되거나 이전 캐시를 사용했습니다.`
      : cacheSaveFailed ? '가격은 정상 표시했지만 이 브라우저 저장본 갱신은 실패했습니다.' : '거래유형과 전용면적을 바꾸면 즉시 다시 계산됩니다.'),
  });
  populateComplexAreas();
  applyPendingComplexPreference();
  renderComplexHistory();
  } catch (error) {
    if (!isStaleRequest()) {
      state.complexErrorCode = 'unavailable';
      renderComplexUnavailable('unavailable');
      setComplexStatus({
        tone: 'error', icon: '!', title: '실거래 조회를 마치지 못했어요',
        message: '단지 정보는 유지했습니다. 연결 상태를 확인한 뒤 다시 시도해주세요.',
        detail: error?.message || '예상하지 못한 조회 오류',
      });
    }
  } finally {
    if (!isStaleRequest()) setComplexSearchBusy(false);
  }
}

function populateComplexAreas() {
  const select = $('#complexAreaBand');
  select.disabled = false;
  const dealType = $('#complexDealType').value;
  const current = select.value;
  const counts = new Map();
  const range = historyRangeFromPayload(state.complexMeta)
    || buildHistoryRange(Number(state.complexMeta?.effectiveHistoryMonths) || state.complexHistoryMonths);
  const startMonthIndex = historyMonthIndex(range.rangeStart);
  const endMonthIndex = historyMonthIndex(range.rangeEnd);
  state.complexRecords.filter((record) => record.dealType === dealType
    && Number(record.monthIndex) >= startMonthIndex
    && Number(record.monthIndex) <= endMonthIndex).forEach((record) => {
    const area = (Math.round(Number(record.areaM2) * 10) / 10).toFixed(1);
    counts.set(area, (counts.get(area) || 0) + 1);
  });
  const areas = [...counts.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  if (!areas.length) {
    const option = createElement('option', '', `${dealType} 거래 없음`);
    option.value = '';
    select.replaceChildren(option);
    return;
  }
  select.replaceChildren(...areas.map(([area, count]) => {
    const option = createElement('option', '', `${formatAreaPair(area)} · ${count}건`);
    option.value = area;
    return option;
  }));
  if (areas.some(([area]) => area === current)) select.value = current;
  else if (areas.length) select.value = [...areas].sort((a, b) => b[1] - a[1] || Math.abs(Number(a[0]) - 84) - Math.abs(Number(b[0]) - 84))[0][0];
}

function renderVisitDealGap(exactRecords, area, dealType) {
  const root = $('#visitDealGap');
  const visit = state.marketContextVisit;
  root.replaceChildren();
  root.hidden = !visit;
  if (!visit) return;
  const head = createElement('div', 'visit-deal-gap-head');
  head.append(createElement('span', '', 'VISIT-TO-NOW BENCHMARK'), createElement('strong', '', `${visit.name} · 방문 당시 시장과 현재 동일면적 실거래`));
  root.appendChild(head);
  if (visit.dealType !== dealType) {
    root.append(createElement('p', 'visit-deal-gap-empty', `방문 기록은 ${visit.dealType}, 현재 화면은 ${dealType}입니다. 거래 유형을 맞추면 가격 차이를 계산할 수 있어요.`));
    return;
  }
  const askingPrice = Number(visit.askingPrice);
  const visitArea = Number(visit.areaM2);
  const areaDifference = Number.isFinite(area) && visitArea > 0 ? Math.abs(area - visitArea) : Number.POSITIVE_INFINITY;
  if (areaDifference > 1) {
    root.append(createElement('p', 'visit-deal-gap-empty', `방문 기록은 ${formatAreaPair(visitArea)}, 현재 선택은 ${formatAreaPair(area)}입니다. 가장 가까운 전용면적을 선택하면 방문 당시와 현재 시장을 비교할 수 있어요.`));
    return;
  }
  const benchmark = buildVisitBenchmark(exactRecords, visit, {
    areaM2: area,
    dealType,
    windowDays: 90,
    minSamples: 3,
    currentWindowMonths: 3,
    minCurrentSamples: 3,
    latestN: 3,
  });
  const baseline = benchmark.visitActualBaseline;
  const current = benchmark.currentActualReference;
  if (!Number.isFinite(area) || !baseline.available || !current.available) {
    root.append(createElement('p', 'visit-deal-gap-empty', '방문일 전후와 최근에 동일 전용면적 실거래가 있어야 시장 변화를 계산할 수 있어요. 현장 확인가는 별도 사실로만 보관합니다.'));
    return;
  }
  const metrics = createElement('div', 'visit-deal-gap-metrics');
  const visitMarket = createElement('article');
  visitMarket.append(createElement('span', '', '방문 당시 평균 실거래'), createElement('strong', '', formatPrice(baseline.averageManWon)), createElement('small', '', `${baseline.startDate}–${baseline.endDate} · ${baseline.sampleSize}건${baseline.method === 'symmetric-window-fallback' ? ' · ±90일 보완' : ''}`));
  const currentMarket = createElement('article');
  const currentConfidence = current.sparse || current.confidence === 'low'
    ? ' · 표본 적음 · 낮은 신뢰도'
    : '';
  currentMarket.append(createElement('span', '', '현재 평균 실거래'), createElement('strong', '', formatPrice(current.averageManWon)), createElement('small', '', `${current.startDate}–${current.endDate} · ${current.sampleSize}건${currentConfidence}`));
  const change = benchmark.marketChange;
  const marketChange = createElement('article', `deal-gap-result ${change.direction === 'up' ? 'higher' : change.direction === 'down' ? 'lower' : 'same'}`);
  marketChange.append(
    createElement('span', '', change.available ? '동일조건 시장 변화' : '방문 후 새 거래 없음'),
    createElement('strong', '', change.available ? (change.amountManWon === 0 ? '변화 없음' : `${change.amountManWon > 0 ? '+' : '−'}${formatPrice(Math.abs(change.amountManWon))}`) : '계산 보류'),
    createElement('small', '', change.available
      ? `${change.percent > 0 ? '+' : ''}${change.percent.toFixed(1)}%${change.sparse || change.confidence === 'low' ? ' · 표본 적음/낮은 신뢰도' : ''}`
      : '당시 확인가로 상승률을 대신 계산하지 않음'),
  );
  const asking = createElement('article', 'asking-gap');
  const askingGap = benchmark.askingVsVisitMarket;
  asking.append(
    createElement('span', '', '방문 당시 확인가'),
    createElement('strong', '', askingPrice > 0 ? formatPrice(askingPrice) : '미입력'),
    createElement('small', '', askingGap.available ? `당시 실거래 대비 ${askingGap.percent > 0 ? '+' : ''}${askingGap.percent.toFixed(1)}% · 시장 변화와 별개` : `${visit.dealType} · ${formatAreaPair(visit.areaM2)}`),
  );
  metrics.append(visitMarket, currentMarket, marketChange, asking);
  const areaNote = areaDifference > .15 ? `전용면적 ${areaDifference.toFixed(1)}㎡ 차이 · ` : '';
  root.append(metrics, createElement('p', 'visit-deal-gap-note', `${areaNote}실거래 변화는 방문 당시와 방문 후의 동일 전용면적 평균가격만 비교했습니다. 현장 호가·층·동·향·수리 상태, 이후 정정·해제 가능성은 별도입니다.`));
}

function monthFromIndexValue(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function renderComplexHistory() {
  if (!state.complexRecords.length) {
    if (state.complexMeta) renderComplexUnavailable(state.complexErrorCode || 'empty');
    return;
  }
  finishComplexLoading();
  $('.complex-search-card')?.classList.add('has-result');
  const dealType = $('#complexDealType').value;
  const areaValue = $('#complexAreaBand').value;
  const area = areaValue ? Number(areaValue) : Number.NaN;
  const requestedMonths = Math.max(12, Math.min(60, Number(state.complexHistoryMonths) || 60));
  const responseRange = historyRangeFromPayload(state.complexMeta)
    || buildHistoryRange(Number(state.complexMeta?.effectiveHistoryMonths) || requestedMonths);
  const effectiveHistoryMonths = responseRange.months;
  const startMonthIndex = historyMonthIndex(responseRange.rangeStart);
  const endMonthIndex = historyMonthIndex(responseRange.rangeEnd);
  const exactRecords = state.complexRecords.filter((record) => record.dealType === dealType
    && Number.isFinite(area)
    && Math.round(Number(record.areaM2) * 10) / 10 === area
    && Number(record.monthIndex) >= startMonthIndex
    && Number(record.monthIndex) <= endMonthIndex);
  const summary = buildMarketSummary(exactRecords, { source: '단지 캐시', sourceType: 'cache' });
  const regionCode = summary.regions[0]?.code;
  const series = regionCode ? getSeries(summary, regionCode, dealType, 'all') : [];
  $('#complexHistoryCard').hidden = false;
  $('#complexHistoryCard').classList.toggle('is-jeonse', dealType === '전세');
  // The detailed chart now lives under the dedicated "가격 흐름" submenu.
  // Keep this card as a compact search context header instead of repeating the same report twice.
  $('#complexHistoryLayout').hidden = true;
  $('#complexEmptyState').hidden = true;
  $('#complexAreaBand').disabled = false;
  $('#complexHistoryTitle').textContent = `${state.complexMeta.query} · ${dealType}${Number.isFinite(area) ? ` · ${formatAreaPair(area)}` : ''}`;
  $('#complexHistoryAddress').textContent = state.complexMeta.demo
    ? `${state.complexMeta.address} · 매매·전세와 면적 필터 동작만 확인`
    : `${state.complexMeta.address} · 실제 전용면적을 0.1㎡ 단위로 분리`;
  setComplexSourceBadge(state.complexMeta.demo ? 'UI 예시 · 실제 시세 아님' : state.complexMeta.sourceLabel || '단지 실거래', state.complexMeta.demo ? 'demo' : 'ready');
  renderVisitDealGap(exactRecords, area, dealType);
  const records = [...exactRecords].sort((a, b) => b.monthIndex - a.monthIndex || b.day - a.day);
  const transactionMonths = new Set(exactRecords.map((record) => record.month)).size;
  const rangeLabel = historyPeriodLabel(requestedMonths);
  const latestRecord = records[0];
  const expectedRange = buildHistoryRange(requestedMonths);
  const serverRangeNote = effectiveHistoryMonths !== requestedMonths || responseRange.rangeEnd !== expectedRange.rangeEnd
    ? ` · 실제 응답 ${responseRange.rangeStart}–${responseRange.rangeEnd}`
    : '';
  $('#complexHistoryMeta').textContent = `${rangeLabel} 요청${serverRangeNote} · 거래가 있었던 ${transactionMonths.toLocaleString('ko-KR')}개월 · ${exactRecords.length.toLocaleString('ko-KR')}건${latestRecord ? ` · 마지막 계약 ${latestRecord.month}.${String(latestRecord.day || '').padStart(2, '0')}` : ''} · 아래 메뉴에서 요약·가격 흐름·예측 확인`;
  renderMarket();
  destroyChart('complex');
}

const DEFAULT_RECOMMENDATION_QUERY = '서울·경기에서 500세대가 넘고, 회사까지 대중교통으로 1시간 안, 6억 미만, 전용 20평 이상, 20년 이내 아파트';
let recommendationPreviewTimer;

function readRecommendationForm() {
  const commuteMode = $('#recommendCommuteMode').value;
  const regions = [];
  if ($('#recommendSeoul').checked) regions.push('seoul');
  if ($('#recommendGyeonggi').checked) regions.push('gyeonggi');
  const commuteModes = commuteMode === 'both' ? ['car', 'transit'] : [commuteMode];
  const commuteMaxMinutes = Math.max(0, Number($('#recommendCommuteMax').value) || 0);
  const commuteDepartureTime = /^\d{2}:\d{2}$/.test($('#recommendDepartureTime').value) ? $('#recommendDepartureTime').value : '08:00';
  const destinations = normalizeDestinations(state.workplaces.map((workplace) => ({
    ...workplace,
    label: workplace.label || workplace.name,
    modes: commuteModes,
    maxMinutes: commuteMaxMinutes || 60,
    departureTime: commuteDepartureTime,
  })));
  return {
    queryText: $('#recommendQuery').value.trim(),
    regions,
    minHouseholds: Math.max(0, Number($('#recommendHouseholds').value) || 0),
    householdsOperator: $('#recommendHouseholdsOperator').value === 'gt' ? 'gt' : 'gte',
    maxPriceManWon: Math.max(0, Number($('#recommendMaxPrice').value) || 0) * 10000,
    priceOperator: $('#recommendPriceOperator').value === 'lte' ? 'lte' : 'lt',
    minAreaM2: Math.max(0, Number($('#recommendMinArea').value) || 0) * PYEONG_TO_M2,
    areaOperator: $('#recommendAreaOperator').value === 'gt' ? 'gt' : 'gte',
    areaBasis: 'exclusive',
    maxAgeYears: Math.max(0, Number($('#recommendMaxAge').value) || 0),
    minBuiltYear: new Date().getFullYear() - Math.max(0, Number($('#recommendMaxAge').value) || 0),
    stationWalkMin: Math.max(0, Number($('#recommendStationMin').value) || 0),
    stationWalkMax: Math.max(0, Number($('#recommendStationMax').value) || 0),
    destinations,
    companyAddress: destinations[0]?.address || destinations[0]?.label || '',
    commuteMaxMinutes,
    commuteModes,
    commuteDepartureTime,
    months: Math.max(1, Number($('#recommendMonths').value) || 3),
  };
}

function writeRecommendationForm(filters = {}) {
  if (typeof filters.queryText === 'string') $('#recommendQuery').value = filters.queryText;
  const regions = filters.regions || ['seoul', 'gyeonggi'];
  $('#recommendSeoul').checked = regions.includes('seoul');
  $('#recommendGyeonggi').checked = regions.includes('gyeonggi');
  if (Number(filters.minHouseholds) >= 0) $('#recommendHouseholds').value = filters.minHouseholds ?? 500;
  $('#recommendHouseholdsOperator').value = filters.householdsOperator === 'gte' ? 'gte' : 'gt';
  if (Number(filters.maxPriceManWon) > 0) $('#recommendMaxPrice').value = Number(filters.maxPriceManWon) / 10000;
  $('#recommendPriceOperator').value = filters.priceOperator === 'lte' ? 'lte' : 'lt';
  if (Number(filters.minAreaM2) > 0) $('#recommendMinArea').value = (Number(filters.minAreaM2) / PYEONG_TO_M2).toFixed(1).replace(/\.0$/, '');
  $('#recommendAreaOperator').value = filters.areaOperator === 'gt' ? 'gt' : 'gte';
  if (Number(filters.maxAgeYears) > 0) $('#recommendMaxAge').value = filters.maxAgeYears;
  if (Number(filters.stationWalkMin) >= 0) $('#recommendStationMin').value = filters.stationWalkMin ?? 10;
  if (Number(filters.stationWalkMax) > 0) $('#recommendStationMax').value = filters.stationWalkMax;
  if (Number(filters.commuteMaxMinutes) > 0) $('#recommendCommuteMax').value = filters.commuteMaxMinutes;
  if (Array.isArray(filters.commuteModes)) {
    $('#recommendCommuteMode').value = filters.commuteModes.includes('car') && filters.commuteModes.includes('transit')
      ? 'both' : filters.commuteModes[0] || 'both';
  }
  if (/^\d{2}:\d{2}$/.test(String(filters.commuteDepartureTime || ''))) $('#recommendDepartureTime').value = filters.commuteDepartureTime;
  if ([1, 3, 6].includes(Number(filters.months))) $('#recommendMonths').value = String(filters.months);
  const legacyCompany = filters.companyAddress ? loadGeocodeResult(filters.companyAddress) : null;
  const rawDestinations = Array.isArray(filters.destinations) && filters.destinations.length
    ? filters.destinations
    : legacyCompany
      ? [{ ...legacyCompany, label: legacyCompany.name || filters.companyAddress, address: legacyCompany.roadAddress || legacyCompany.jibunAddress || filters.companyAddress, daysPerWeek: 5 }]
      : [];
  state.workplaces = normalizeDestinations(rawDestinations, {
    defaults: {
      modes: Array.isArray(filters.commuteModes) ? filters.commuteModes : ['transit'],
      maxMinutes: Number(filters.commuteMaxMinutes) || 60,
      departureTime: filters.commuteDepartureTime || '08:00',
      daysPerWeek: 5,
    },
  }).map((destination, index) => ({
    ...rawDestinations[index],
    ...destination,
    name: destination.label,
    query: destination.label,
  }));
  state.companyLocation = state.workplaces[0] || null;
  renderWorkplaces();
  updateRecommendationAreaMetric();
  syncRecommendationRanges();
  renderRecommendationActiveFilters();
}

function updateRecommendationAreaMetric() {
  const pyeong = Math.max(0, Number($('#recommendMinArea').value) || 0);
  $('#recommendAreaMetric').textContent = formatAreaPair(pyeong * PYEONG_TO_M2);
}

function renderRecommendationChips(clauses = []) {
  const root = $('#recommendationChips');
  if (!clauses.length) {
    root.replaceChildren(createElement('span', 'needs-confirmation', '문장에서 읽은 조건이 없어요 · 아래 항목을 직접 입력해주세요'));
    return;
  }
  root.replaceChildren(...clauses.map((clause) => {
    const unsupportedStation = String(clause.label || '').includes('역 도보');
    return createElement(
      'span',
      clause.needsConfirmation || unsupportedStation ? 'needs-confirmation' : '',
      unsupportedStation ? '역 접근 조건 → 실제 대중교통 경로의 총 도보로 확인' : clause.label,
    );
  }));
}

const RECOMMENDATION_RANGE_PAIRS = [
  ['recommendMaxPrice', 'recommendMaxPriceRange'],
  ['recommendMinArea', 'recommendMinAreaRange'],
  ['recommendCommuteMax', 'recommendCommuteMaxRange'],
  ['recommendHouseholds', 'recommendHouseholdsRange'],
  ['recommendMaxAge', 'recommendMaxAgeRange'],
];

function updateRangeVisual(range) {
  if (!range) return;
  const minimum = Number(range.min) || 0;
  const maximum = Number(range.max) || 100;
  const value = Math.min(maximum, Math.max(minimum, Number(range.value) || minimum));
  range.style.setProperty('--range-progress', `${maximum > minimum ? (value - minimum) / (maximum - minimum) * 100 : 0}%`);
}

function syncRecommendationRanges() {
  RECOMMENDATION_RANGE_PAIRS.forEach(([numberId, rangeId]) => {
    const number = $(`#${numberId}`);
    const range = $(`#${rangeId}`);
    if (!number || !range) return;
    const value = Number(number.value);
    const minimum = Number(range.min);
    const maximum = Number(range.max);
    if (Number.isFinite(value)) range.value = String(Math.min(maximum, Math.max(minimum, value)));
    updateRangeVisual(range);
  });
}

function bindRecommendationRanges() {
  RECOMMENDATION_RANGE_PAIRS.forEach(([numberId, rangeId]) => {
    const number = $(`#${numberId}`);
    const range = $(`#${rangeId}`);
    if (!number || !range) return;
    range.addEventListener('input', () => {
      number.value = range.value;
      updateRangeVisual(range);
      number.dispatchEvent(new Event('input', { bubbles: true }));
    });
    number.addEventListener('input', () => {
      const value = Number(number.value);
      if (Number.isFinite(value)) range.value = String(Math.min(Number(range.max), Math.max(Number(range.min), value)));
      updateRangeVisual(range);
    });
    updateRangeVisual(range);
  });
}

function renderRecommendationActiveFilters(filters = readRecommendationForm()) {
  const root = $('#recommendationActiveFilters');
  if (!root) return;
  const clauses = recommendationChipLabels(filters);
  root.replaceChildren(...clauses.map((clause) => {
    const button = createElement('button', `map-filter-chip${clause.needsConfirmation ? ' needs-confirmation' : ''}`, clause.label);
    button.type = 'button';
    button.addEventListener('click', () => setRecommendationPanel('filters'));
    return button;
  }));
}

async function parseRecommendationInput(showMessage = true) {
  const parsed = parseRecommendationQuery($('#recommendQuery').value, new Date().getFullYear());
  const current = readRecommendationForm();
  const next = { ...current, ...parsed.filters, companyAddress: current.companyAddress, months: current.months };
  if (!parsed.filters.regions.length) next.regions = current.regions;
  if (!parsed.filters.minHouseholds) {
    next.minHouseholds = current.minHouseholds;
    next.householdsOperator = current.householdsOperator;
  }
  if (!parsed.filters.maxPriceManWon) next.maxPriceManWon = current.maxPriceManWon;
  if (!parsed.filters.minAreaM2) next.minAreaM2 = current.minAreaM2;
  if (!parsed.filters.maxAgeYears) {
    next.maxAgeYears = current.maxAgeYears;
    next.minBuiltYear = current.minBuiltYear;
  }
  if (!parsed.filters.stationWalkMax) {
    next.stationWalkMin = current.stationWalkMin;
    next.stationWalkMax = current.stationWalkMax;
  }
  if (!parsed.filters.commuteMaxMinutes) next.commuteMaxMinutes = current.commuteMaxMinutes;
  if (!parsed.filters.commuteModes.length) next.commuteModes = current.commuteModes;
  writeRecommendationForm(next);
  const shortlistChanged = refreshShortlistCommuteFreshness();
  if (state.recommendationShowingShortlist && shortlistChanged) renderRecommendationResults();
  renderRecommendationChips(parsed.clauses);
  await updateRecommendationPreview();
  if (showMessage) showToast(`${parsed.clauses.length}개 조건을 읽었어요. 아래 숫자를 확인해주세요.`);
}

function recommendationChipLabels(filters) {
  const labels = [];
  labels.push({ label: filters.regions.map((item) => item === 'seoul' ? '서울' : '경기').join(' · ') || '지역 선택 필요' });
  labels.push({ label: `${Number(filters.minHouseholds).toLocaleString('ko-KR')}세대 ${filters.householdsOperator === 'gt' ? '초과' : '이상'}` });
  labels.push({ label: `${(filters.maxPriceManWon / 10000).toLocaleString('ko-KR')}억원 ${filters.priceOperator === 'lte' ? '이하' : '미만'}` });
  labels.push({ label: `${formatAreaPair(filters.minAreaM2)} ${filters.areaOperator === 'gt' ? '초과' : '이상'}` });
  labels.push({ label: `${filters.maxAgeYears}년 이내` });
  if (filters.commuteMaxMinutes) labels.push({ label: `목적지 ${filters.destinations?.length || 0}곳 · 각 ${filters.commuteMaxMinutes}분 미만`, needsConfirmation: true });
  return labels;
}

function recommendationSentence(filters) {
  const region = filters.regions.map((item) => item === 'seoul' ? '서울' : '경기').join('·') || '서울·경기';
  const priceEok = Number(filters.maxPriceManWon || 0) / 10000;
  const areaPyeong = Number(filters.minAreaM2 || 0) / PYEONG_TO_M2;
  const commuteMode = filters.commuteModes.includes('car') && filters.commuteModes.includes('transit')
    ? '자동차 또는 대중교통'
    : filters.commuteModes.includes('transit') ? '버스·지하철' : '자동차';
  return `${region}에서 ${Number(filters.minHouseholds || 0).toLocaleString('ko-KR')}세대 ${filters.householdsOperator === 'gt' ? '초과' : '이상'}, 회사까지 ${commuteMode} ${filters.commuteMaxMinutes}분 미만, ${priceEok.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억 ${filters.priceOperator === 'lte' ? '이하' : '미만'}, 전용 ${areaPyeong.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}평 ${filters.areaOperator === 'gt' ? '초과' : '이상'}, ${filters.maxAgeYears}년 이내 아파트`;
}

async function updateRecommendationPreview() {
  window.clearTimeout(recommendationPreviewTimer);
  const filters = readRecommendationForm();
  saveRecommendationFilters(filters);
  updateRecommendationAreaMetric();
  renderRecommendationActiveFilters(filters);
  if (!filters.regions.length) {
    $('#recommendCatalogCount').textContent = '서울 또는 경기를 선택해주세요';
    return;
  }
  const payload = await loadApartmentCatalog();
  const candidates = filterCatalogForRecommendation(payload.apartments, filters, new Date().getFullYear());
  $('#recommendCatalogCount').textContent = `${payload.apartments.length.toLocaleString('ko-KR')}개 → ${candidates.length.toLocaleString('ko-KR')}개`;
  $('#recommendStepCatalog').classList.add('ready');
}

function scheduleRecommendationPreview() {
  window.clearTimeout(recommendationPreviewTimer);
  const filters = readRecommendationForm();
  $('#recommendQuery').value = recommendationSentence(filters);
  renderRecommendationActiveFilters(filters);
  recommendationPreviewTimer = window.setTimeout(updateRecommendationPreview, 180);
}

function handleRecommendationCriteriaChanged() {
  scheduleRecommendationPreview();
  const changed = refreshShortlistCommuteFreshness();
  if (state.recommendationShowingShortlist && changed) renderRecommendationResults();
}

async function geocodeLocally(query) {
  const normalized = String(query || '').trim();
  if (!normalized) return null;
  const cached = loadGeocodeResult(normalized);
  if (cached) return cached;
  const [result] = await homeMap.search(normalized);
  if (!result) return null;
  return saveGeocodeResult(normalized, result) || result;
}

function setCompanyLocationStatus(kind, message) {
  const status = $('#recommendCompanyStatus');
  status.classList.remove('confirmed', 'error');
  if (kind) status.classList.add(kind);
  status.textContent = message;
  const connection = $('#companyGeocodeCheck');
  if (connection) {
    connection.textContent = message;
    connection.classList.toggle('connection-warning', kind === 'error');
  }
}

function companyLocationLabel(location) {
  return String(location?.placeName || location?.displayName || location?.name || location?.roadAddress || location?.jibunAddress || '').trim();
}

function companyLocationAddress(location) {
  return String(location?.address || location?.roadAddress || location?.jibunAddress || '').trim();
}

function workplaceId() {
  if (globalThis.crypto?.randomUUID) return `workplace-${globalThis.crypto.randomUUID()}`;
  return `workplace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderWorkplaces() {
  const root = $('#workplaceList');
  if (!root) return;
  const colors = ['#116a4d', '#3975a8', '#b36b22', '#8b5ea7'];
  const normalized = normalizeDestinations(state.workplaces, {
    defaults: {
      modes: readSelectedCommuteModes(),
      maxMinutes: Math.max(1, Number($('#recommendCommuteMax')?.value) || 60),
      departureTime: $('#recommendDepartureTime')?.value || '08:00',
      daysPerWeek: 5,
    },
  });
  state.workplaces = normalized.map((destination, index) => ({
    ...state.workplaces[index],
    ...destination,
    name: destination.label,
    query: destination.label,
  }));
  if (!state.workplaces.length) {
    root.replaceChildren(createElement('span', 'workplace-empty', '회사·학교·자주 가는 곳을 추가하면 여러 목적지 사이의 균형을 계산합니다.'));
    $('#recommendCompany').value = '';
    setCompanyLocationStatus('', '목적지가 없어요 · 최대 4곳을 추가할 수 있습니다.');
  } else {
    root.replaceChildren(...state.workplaces.map((workplace, index) => {
      const chip = createElement('div', 'workplace-chip');
      chip.style.setProperty('--workplace-color', colors[index % colors.length]);
      const letter = createElement('span', 'workplace-chip-index', String.fromCharCode(65 + index));
      const main = createElement('button', 'workplace-chip-main');
      main.type = 'button';
      main.setAttribute('aria-label', `${workplace.label} 목적지 수정`);
      main.append(createElement('strong', '', workplace.label), createElement('small', '', `주 ${workplace.daysPerWeek || 1}일 · ${companyLocationAddress(workplace) || '지도 좌표'}`));
      main.addEventListener('click', () => openCompanyLocationModal(workplace.id));
      const remove = createElement('button', 'workplace-chip-remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `${workplace.label} 삭제`);
      remove.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
      remove.addEventListener('click', () => {
        state.workplaces = state.workplaces.filter((item) => item.id !== workplace.id);
        state.companyLocation = state.workplaces[0] || null;
        renderWorkplaces();
        handleRecommendationCriteriaChanged();
      });
      chip.append(letter, main, remove);
      return chip;
    }));
    $('#recommendCompany').value = state.workplaces[0]?.label || '';
    setCompanyLocationStatus('confirmed', `${state.workplaces.length}개 목적지 확인됨 · 정밀 검증은 후보 × 목적지 수만큼 계산합니다.`);
  }
  const addButton = $('#confirmCompanyLocation');
  if (addButton) {
    addButton.disabled = state.workplaces.length >= 4 || state.recommendationRunning;
    $('span', addButton).textContent = state.workplaces.length >= 4 ? '최대 4곳' : '목적지 추가';
  }
  if (state.recommendationMapReady) void refreshRecommendationMapLayers();
}

function readSelectedCommuteModes() {
  const mode = $('#recommendCommuteMode')?.value || 'transit';
  return mode === 'both' ? ['car', 'transit'] : [mode];
}

function renderCompanyPickerSelection() {
  const selected = state.companyPickerSelection;
  const title = $('#companyPickerSelectionTitle');
  const address = $('#companyPickerSelectionAddress');
  const coordinates = $('#companyPickerCoordinates');
  const apply = $('#applyCompanyLocation');
  if (!selected || !isGeoPoint(selected)) {
    title.textContent = '아직 선택하지 않았어요';
    address.textContent = '검색 결과 또는 지도 위 건물을 선택해주세요.';
    coordinates.textContent = '좌표를 선택해야 실제 통근 경로를 계산합니다.';
    apply.disabled = true;
    return;
  }
  const primary = companyLocationLabel(selected) || '지도에서 선택한 회사 위치';
  const officialAddress = companyLocationAddress(selected);
  const secondary = (selected.placeName || selected.displayName) && officialAddress
    ? `${officialAddress}${selected.category ? ` · ${selected.category}` : ''}`
    : selected.roadAddress && selected.jibunAddress && selected.roadAddress !== selected.jibunAddress
      ? `지번 ${selected.jibunAddress}`
      : '선택한 좌표를 통근 도착지로 사용합니다.';
  title.textContent = primary;
  address.textContent = secondary;
  coordinates.textContent = `위도 ${Number(selected.lat).toFixed(6)} · 경도 ${Number(selected.lng).toFixed(6)}`;
  apply.disabled = false;
}

function selectCompanyPickerLocation(location) {
  if (!isGeoPoint(location)) return;
  state.companyPickerSelection = {
    ...location,
    lat: Number(location.lat),
    lng: Number(location.lng),
    name: companyLocationLabel(location) || '지도에서 선택한 회사 위치',
  };
  renderCompanyPickerSelection();
  $$('.company-location-result', $('#companyLocationSearchResults')).forEach((button) => {
    const selected = Number(button.dataset.lat) === Number(location.lat) && Number(button.dataset.lng) === Number(location.lng);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  companyPickerMap.showSearchLocation(location.lat, location.lng, companyLocationLabel(location) || '선택한 회사 위치', 17);
}

function armCompanyPickerMap() {
  if (!state.companyPickerMapReady || $('#companyLocationModal').hidden || !$('#companyPostcodePanel').hidden) return;
  companyPickerMap.startPinMode(async (coords) => {
    companyPickerSearchToken += 1;
    const token = ++companyPickerClickToken;
    $('#companyLocationSearchResults').hidden = true;
    $('#companyPickerSelectionTitle').textContent = '지도 좌표의 주소를 확인하는 중…';
    $('#companyPickerSelectionAddress').textContent = '잠시만 기다려주세요.';
    $('#applyCompanyLocation').disabled = true;
    const resolvedAddress = await companyPickerMap.reverse(coords.lat, coords.lng).catch(() => '');
    if (token !== companyPickerClickToken || $('#companyLocationModal').hidden) return;
    selectCompanyPickerLocation({
      ...coords,
      name: resolvedAddress || '지도에서 선택한 회사 위치',
      roadAddress: resolvedAddress || '',
      jibunAddress: '',
    });
    armCompanyPickerMap();
  });
}

async function ensureCompanyPickerMap() {
  if (state.companyPickerMapReady) {
    companyPickerMap.resize();
    armCompanyPickerMap();
    return companyPickerMap;
  }
  if (companyPickerMapInitPromise) {
    try { return await companyPickerMapInitPromise; }
    catch (_) { return null; }
  }
  companyPickerMapInitPromise = (async () => {
    await companyPickerMap.init($('#companyLocationMap'), {
      onReady: () => {
        state.companyPickerMapReady = true;
        armCompanyPickerMap();
      },
    });
    state.companyPickerMapReady = true;
    return companyPickerMap;
  })();
  try {
    return await companyPickerMapInitPromise;
  } catch (_) {
    $('#companyLocationMap').replaceChildren(createElement('div', 'map-search-message', '네이버 지도를 불러오지 못했어요. 연결 상태에서 Dynamic Map과 개발 URL을 확인해주세요.'));
    return null;
  } finally {
    companyPickerMapInitPromise = null;
  }
}

function updateCompanySearchCapability() {
  const root = $('#companySearchCapability');
  const label = $('#companySearchCapabilityText');
  const button = $('#openPlaceSearchSettings');
  if (!root || !label || !button) return;
  const available = APP_CONFIG.localMarketEnabled && state.localMarketConnected && !state.localMarketOutdated && state.placeSearchConfigured;
  root.classList.toggle('connected', available);
  if (available) {
    label.textContent = '네이버 상호·지점 검색 연결됨 · 공식 건물명 주소 검색도 가능';
    button.hidden = true;
    return;
  }
  button.hidden = false;
  if (!APP_CONFIG.localMarketEnabled) {
    label.textContent = '공식 건물명·주소 검색 가능 · 배포용 상호·지점 API는 준비 중';
  } else if (!state.localMarketConnected) {
    label.textContent = '공식 건물명·주소 검색 가능 · 서버를 켜면 입점 상호 API 연결 가능';
  } else if (state.localMarketOutdated) {
    label.textContent = '공식 건물명·주소 검색 가능 · 서버 재시작 후 입점 상호 API 연결 가능';
  } else {
    label.textContent = '공식 건물명·법인명 검색 가능 · 입점 상호·지점 API는 미연결';
  }
}

function companyResultSource(result) {
  if (result.source === 'naver-api-hub-local') return '네이버 장소 검색';
  if (result.source === 'kakao-postcode') return '공식 주소 DB 건물명';
  if (result.source === 'official-apartment-catalog') return '공식 공동주택';
  return '네이버 주소 검색';
}

function mergeCompanyLocationResults(...groups) {
  const seen = new Set();
  return groups.flat().filter((result) => {
    if (!isGeoPoint(result)) return false;
    const key = `${Number(result.lat).toFixed(6)}|${Number(result.lng).toFixed(6)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchCompanyPlaceResults(query) {
  if (!APP_CONFIG.placeSearchUrl || !state.placeSearchConfigured || state.localMarketOutdated) {
    return { status: 'not-configured', items: [] };
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 9000);
  try {
    const url = new URL(APP_CONFIG.placeSearchUrl);
    url.searchParams.set('query', query);
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 503) {
        state.placeSearchConfigured = false;
        updateCompanySearchCapability();
      }
      return { status: response.status === 503 ? 'not-configured' : 'error', items: [] };
    }
    return {
      status: 'ok',
      items: Array.isArray(payload.items) ? payload.items.filter(isGeoPoint).slice(0, 5) : [],
    };
  } catch (_) {
    return { status: 'error', items: [] };
  } finally {
    window.clearTimeout(timeout);
  }
}

function loadCompanyPostcodeScript() {
  if (window.daum?.Postcode) return Promise.resolve(window.daum.Postcode);
  if (companyPostcodeScriptPromise) return companyPostcodeScriptPromise;
  companyPostcodeScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => reject(new Error('공식 주소 검색 모듈 응답이 늦어지고 있어요.')), 12000);
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    script.dataset.companyPostcode = 'true';
    script.addEventListener('load', () => {
      window.clearTimeout(timeout);
      if (window.daum?.Postcode) resolve(window.daum.Postcode);
      else reject(new Error('공식 주소 검색 모듈을 초기화하지 못했어요.'));
    }, { once: true });
    script.addEventListener('error', () => {
      window.clearTimeout(timeout);
      reject(new Error('공식 주소 검색 모듈을 불러오지 못했어요.'));
    }, { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    companyPostcodeScriptPromise = null;
    throw error;
  });
  return companyPostcodeScriptPromise;
}

function setCompanyPostcodeBackgroundInert(inert) {
  [
    '.company-location-modal > .modal-head',
    '.company-location-help',
    '#companyLocationSearchForm',
    '#companySearchCapability',
    '#companyLocationSearchResults',
    '#companyLocationMap',
    '.company-picker-tip',
    '.company-picker-selection',
    '.company-location-limit',
    '.company-location-actions',
  ].forEach((selector) => {
    const element = $(selector, $('#companyLocationModal'));
    if (element) element.toggleAttribute('inert', inert);
  });
}

function closeCompanyPostcodeSearch({ rearm = true, restoreFocus = true } = {}) {
  const panel = $('#companyPostcodePanel');
  if (!panel) return;
  const wasOpen = !panel.hidden;
  panel.hidden = true;
  panel.setAttribute('aria-busy', 'false');
  $('.company-picker-map-wrap')?.classList.remove('postcode-open');
  $('#companyPostcodeEmbed').replaceChildren();
  $('#companyPostcodeStatus').textContent = '공식 주소 DB에서 검색합니다.';
  setCompanyPostcodeBackgroundInert(false);
  if (rearm) armCompanyPickerMap();
  if (wasOpen && restoreFocus && !$('#companyLocationModal').hidden) {
    const target = companyPostcodeOpener?.isConnected && companyPostcodeOpener.getClientRects().length
      ? companyPostcodeOpener
      : $('#useCompanyPostcodeSearch');
    window.setTimeout(() => {
      if (!$('#companyLocationModal').hidden) target?.focus();
    }, 0);
  }
  companyPostcodeOpener = null;
}

async function selectCompanyPostcodeAddress(data, fallbackName, expectedToken) {
  if ($('#companyLocationModal').hidden || $('#companyPostcodePanel').hidden
    || expectedToken !== companyPickerSearchToken) return;
  const roadAddress = String(data?.roadAddress || '').trim();
  const jibunAddress = String(data?.jibunAddress || data?.autoJibunAddress || '').trim();
  const selectedAddress = roadAddress || jibunAddress || String(data?.address || '').trim();
  if (!selectedAddress) {
    $('#companyPostcodeStatus').textContent = '선택한 결과에서 주소를 읽지 못했어요.';
    return;
  }
  companyPickerSearchToken += 1;
  const token = ++companyPickerClickToken;
  closeCompanyPostcodeSearch({ rearm: false });
  $('#companyLocationSearchResults').hidden = false;
  $('#companyLocationSearchResults').replaceChildren(createElement('p', 'company-location-search-empty', `${selectedAddress}의 네이버 지도 좌표를 확인하고 있어요…`));
  $('#companyPickerSelectionTitle').textContent = '선택한 건물의 위치를 확인하는 중…';
  $('#companyPickerSelectionAddress').textContent = selectedAddress;
  $('#companyPickerCoordinates').textContent = '네이버 지도에서 좌표를 찾고 있습니다.';
  $('#applyCompanyLocation').disabled = true;
  const queries = [...new Set([roadAddress, jibunAddress, selectedAddress].filter(Boolean))];
  let mapped = null;
  for (const query of queries) {
    const [candidate] = await companyPickerMap.search(query).catch(() => []);
    if (token !== companyPickerClickToken || $('#companyLocationModal').hidden) return;
    if (candidate) {
      mapped = candidate;
      break;
    }
  }
  if (!mapped) {
    $('#companyPickerSelectionTitle').textContent = '네이버 지도 좌표를 찾지 못했어요';
    $('#companyPickerSelectionAddress').textContent = '다른 주소 결과를 고르거나 지도에서 건물을 직접 선택해주세요.';
    $('#companyPickerCoordinates').textContent = '좌표가 확정되지 않았습니다.';
    armCompanyPickerMap();
    return;
  }
  const placeName = String(data?.buildingName || fallbackName || '').trim() || selectedAddress;
  const location = {
    ...mapped,
    source: 'kakao-postcode',
    placeName,
    category: '공식 주소 DB 건물명',
    roadAddress: roadAddress || mapped.roadAddress || selectedAddress,
    jibunAddress: jibunAddress || mapped.jibunAddress || '',
  };
  renderCompanyLocationSearchResults([location]);
  armCompanyPickerMap();
}

async function openCompanyPostcodeSearch(queryValue = '', expectedToken = null) {
  const query = String(queryValue || $('#companyLocationSearch').value || '').normalize('NFKC').trim();
  if (query.length < 2) {
    renderCompanyLocationSearchResults([], '건물명이나 주소를 두 글자 이상 입력해주세요.');
    return false;
  }
  const panel = $('#companyPostcodePanel');
  const root = $('#companyPostcodeEmbed');
  const status = $('#companyPostcodeStatus');
  const sessionToken = expectedToken ?? companyPickerSearchToken;
  companyPostcodeOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  companyPickerMap.cancelPinMode();
  panel.hidden = false;
  panel.setAttribute('aria-busy', 'true');
  $('.company-picker-map-wrap')?.classList.add('postcode-open');
  setCompanyPostcodeBackgroundInert(true);
  status.textContent = `공식 주소 DB에서 ‘${query}’ 검색 중…`;
  root.replaceChildren(createElement('p', 'company-location-search-empty', '건물명·도로명 주소 검색을 불러오고 있어요…'));
  window.setTimeout(() => $('#closeCompanyPostcode')?.focus(), 0);
  try {
    const Postcode = await loadCompanyPostcodeScript();
    if ($('#companyLocationModal').hidden || panel.hidden
      || sessionToken !== companyPickerSearchToken) return false;
    root.replaceChildren();
    status.textContent = `‘${query}’ 건물명·주소 후보에서 하나를 선택하세요.`;
    panel.setAttribute('aria-busy', 'false');
    const postcode = new Postcode({
      width: '100%',
      height: '100%',
      oncomplete: (data) => { void selectCompanyPostcodeAddress(data, query, sessionToken); },
    });
    postcode.embed(root, { q: query, autoClose: false });
    return true;
  } catch (_) {
    closeCompanyPostcodeSearch({ rearm: true });
    renderCompanyLocationSearchResults([], '공식 주소 검색을 불러오지 못했어요. 네트워크를 확인하거나 지도에서 건물을 직접 선택해주세요.');
    return false;
  }
}

function renderCompanyLocationSearchResults(results, message = '') {
  const root = $('#companyLocationSearchResults');
  if (!results.length) {
    companyPickerMap.clearSearchLocation();
    root.hidden = false;
    root.replaceChildren(createElement('p', 'company-location-search-empty', message || '일치하는 주소가 없어요. 주소 일부를 바꾸거나 지도에서 직접 선택해주세요.'));
    return;
  }
  const fragment = document.createDocumentFragment();
  results.slice(0, 8).forEach((result) => {
    const button = createElement('button', 'company-location-result');
    button.type = 'button';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.dataset.lat = String(result.lat);
    button.dataset.lng = String(result.lng);
    const icon = createElement('span', 'company-location-result-icon');
    setTablerIcon(icon, result.source === 'naver-api-hub-local' ? 'building-store' : 'map-pin');
    const copy = createElement('span', 'company-location-result-copy');
    const primary = companyLocationLabel(result) || companyLocationAddress(result) || '이름 없는 위치';
    const address = companyLocationAddress(result);
    const details = [...new Set([companyResultSource(result), result.category].filter(Boolean))];
    if (address && address !== primary) details.push(address);
    else if (result.roadAddress && result.jibunAddress && result.roadAddress !== result.jibunAddress) details.push(`지번 ${result.jibunAddress}`);
    copy.append(
      createElement('strong', '', primary),
      createElement('small', '', details.join(' · ')),
    );
    const chevron = createElement('i', 'ti ti-chevron-right');
    chevron.setAttribute('aria-hidden', 'true');
    button.append(icon, copy, chevron);
    button.addEventListener('click', () => selectCompanyPickerLocation(result));
    fragment.appendChild(button);
  });
  root.replaceChildren(fragment);
  root.hidden = false;
  if (results.length === 1) selectCompanyPickerLocation(results[0]);
}

async function searchCompanyLocations(event = null) {
  event?.preventDefault();
  const query = $('#companyLocationSearch').value.trim();
  companyPickerClickToken += 1;
  const token = ++companyPickerSearchToken;
  closeCompanyPostcodeSearch({ rearm: false, restoreFocus: false });
  if (!query) {
    renderCompanyLocationSearchResults([], '회사·건물·상가·오피스텔 이름이나 주소를 2자 이상 입력해주세요. 지도에서 직접 선택해도 됩니다.');
    return [];
  }
  if (query.normalize('NFKC').length < 2) {
    renderCompanyLocationSearchResults([], '두 글자 이상 입력하면 이름 일부만으로도 후보를 찾습니다.');
    return [];
  }
  const map = await ensureCompanyPickerMap();
  if (!map || token !== companyPickerSearchToken) return [];
  const root = $('#companyLocationSearchResults');
  root.hidden = false;
  root.replaceChildren(createElement('p', 'company-location-search-empty', state.placeSearchConfigured
    ? '네이버에서 회사·건물명과 주소 후보를 함께 찾고 있어요…'
    : '네이버 주소를 확인하고 있어요. 회사·건물명은 장소 검색 키를 연결해야 합니다…'));
  const [addressOutcome, placeOutcome] = await Promise.all([
    map.search(query)
      .then((items) => ({ status: 'ok', items: items.map((item) => ({ ...item, source: 'naver-address' })) }))
      .catch(() => ({ status: 'error', items: [] })),
    fetchCompanyPlaceResults(query),
  ]);
  if (token !== companyPickerSearchToken || $('#companyLocationModal').hidden) return [];
  const results = mergeCompanyLocationResults(placeOutcome.items, addressOutcome.items);
  if (results.length) {
    renderCompanyLocationSearchResults(results);
    if (results.length > 1) {
      map.showSearchLocation(results[0].lat, results[0].lng, companyLocationLabel(results[0]) || '검색 후보', 15);
      armCompanyPickerMap();
    }
    return results;
  }
  const nextStep = decideCompanySearchNextStep({
    query,
    placeStatus: placeOutcome.status,
    addressStatus: addressOutcome.status,
    placeResultsCount: placeOutcome.items.length,
    addressResultsCount: addressOutcome.items.length,
  });
  const postcodeOpened = await openCompanyPostcodeSearch(query, token);
  if (token !== companyPickerSearchToken || $('#companyLocationModal').hidden) return [];
  const emptyMessage = postcodeOpened
    ? `공식 주소 DB에서 ‘${query}’ 건물명·법인명 후보를 열었어요. 지도 영역에서 사용할 주소를 선택해주세요.`
    : companySearchStepMessage(nextStep, query)
    || `‘${query}’에 해당하는 회사·건물·주소 후보를 찾지 못했어요. 동네나 역 이름을 함께 입력하거나 지도에서 선택해주세요.`;
  renderCompanyLocationSearchResults([], emptyMessage);
  armCompanyPickerMap();
  return [];
}

async function openCompanyLocationModal(workplaceIdToEdit = null) {
  const editing = state.workplaces.find((item) => item.id === workplaceIdToEdit) || null;
  if (!editing && state.workplaces.length >= 4) {
    showToast('출근 목적지는 최대 4곳까지 저장할 수 있어요.', 'error');
    return;
  }
  state.activeWorkplaceId = editing?.id || null;
  const query = editing?.label || '';
  updateCompanySearchCapability();
  $('#companyLocationTitle').textContent = editing ? '출근 목적지 수정' : '출근 목적지 추가';
  $('span', $('#applyCompanyLocation')).textContent = editing ? '목적지 수정' : '목적지에 추가';
  $('#companyDaysPerWeek').value = String(editing?.daysPerWeek || 5);
  $('#companyLocationSearch').value = query;
  $('#companyLocationSearchResults').hidden = true;
  $('#companyLocationSearchResults').replaceChildren();
  state.companyPickerSelection = editing ? { ...editing } : null;
  if (!state.companyPickerSelection) companyPickerMap.clearSearchLocation();
  renderCompanyPickerSelection();
  openModalShell('companyLocationModal', '#companyLocationSearch');
  const map = await ensureCompanyPickerMap();
  if (!map || $('#companyLocationModal').hidden) return;
  if (state.companyPickerSelection) {
    selectCompanyPickerLocation(state.companyPickerSelection);
    armCompanyPickerMap();
  } else if (query) {
    await searchCompanyLocations();
  } else {
    armCompanyPickerMap();
  }
}

function closeCompanyLocationModal() {
  companyPickerSearchToken += 1;
  companyPickerClickToken += 1;
  companyPickerMap.cancelPinMode();
  closeCompanyPostcodeSearch({ rearm: false, restoreFocus: false });
  closeModalShell('companyLocationModal');
}

function applyCompanyPickerLocation() {
  const selected = state.companyPickerSelection;
  if (!selected || !isGeoPoint(selected)) return;
  const query = companyLocationLabel(selected) || `지도 선택 ${Number(selected.lat).toFixed(6)}, ${Number(selected.lng).toFixed(6)}`;
  const saved = saveGeocodeResult(query, { ...selected, name: query }) || selected;
  const next = normalizeDestinations([{
    ...selected,
    ...saved,
    id: state.activeWorkplaceId || workplaceId(),
    label: query,
    name: query,
    query,
    address: companyLocationAddress(selected) || companyLocationAddress(saved) || query,
    daysPerWeek: Number($('#companyDaysPerWeek').value) || 5,
    modes: readSelectedCommuteModes(),
    maxMinutes: Math.max(1, Number($('#recommendCommuteMax').value) || 60),
    departureTime: $('#recommendDepartureTime').value || '08:00',
  }])[0];
  const workplace = { ...selected, ...saved, ...next, name: query, query, label: query };
  const existingIndex = state.workplaces.findIndex((item) => item.id === state.activeWorkplaceId);
  if (existingIndex >= 0) state.workplaces.splice(existingIndex, 1, workplace);
  else state.workplaces.push(workplace);
  state.companyLocation = state.workplaces[0] || null;
  state.activeWorkplaceId = null;
  renderWorkplaces();
  handleRecommendationCriteriaChanged();
  closeCompanyLocationModal();
  showToast(`${query} 목적지를 저장했어요.`);
}

async function confirmCompanyLocation({ announce = true } = {}) {
  if (state.workplaces.length) return state.workplaces[0];
  const query = $('#recommendCompany').value.trim();
  const requestToken = ++companyGeocodeToken;
  if (!query) {
    state.companyLocation = null;
    setCompanyLocationStatus('error', '회사 주소를 검색하거나 지도에서 건물을 선택해주세요.');
    return null;
  }
  if (state.companyLocation?.query === query) return state.companyLocation;
  setCompanyLocationStatus('', '네이버 지도에서 회사 위치 좌표를 확인하고 있어요.');
  $('#confirmCompanyLocation').disabled = true;
  try {
    const result = await geocodeLocally(query);
    if (requestToken !== companyGeocodeToken || $('#recommendCompany').value.trim() !== query) return null;
    if (!result) throw new Error('주소 좌표를 찾지 못했어요. 찾기에서 주소 후보를 고르거나 지도에서 건물을 선택해주세요.');
    state.companyLocation = { ...result, query, name: result.roadAddress || result.jibunAddress || result.name || query };
    setCompanyLocationStatus('confirmed', `확인됨 · ${state.companyLocation.name}`);
    if (announce) showToast('회사 위치를 지도 좌표로 확인했어요.');
    return state.companyLocation;
  } catch (error) {
    if (requestToken !== companyGeocodeToken || $('#recommendCompany').value.trim() !== query) return null;
    state.companyLocation = null;
    setCompanyLocationStatus('error', error.message || '회사 위치를 찾지 못했어요.');
    return null;
  } finally {
    if (requestToken === companyGeocodeToken) $('#confirmCompanyLocation').disabled = state.recommendationRunning;
  }
}

function recommendationLayerControl(layer) {
  const id = RECOMMENDATION_LAYER_CONTROLS[layer];
  const root = (id && document.getElementById(id)) || $(`[data-recommendation-layer="${layer}"]`);
  if (!root) return null;
  return root.matches?.('input[type="checkbox"], input[type="radio"]')
    ? root
    : $('input[type="checkbox"], input[type="radio"]', root) || root;
}

function recommendationLayerState() {
  return Object.fromEntries(Object.keys(RECOMMENDATION_LAYER_CONTROLS).map((layer) => {
    const control = recommendationLayerControl(layer);
    if (!control) return [layer, true];
    if (control.matches?.('input[type="checkbox"], input[type="radio"]')) return [layer, control.checked];
    return [layer, control.getAttribute('aria-pressed') !== 'false'];
  }));
}

function activateRecommendationLayer(layer) {
  const control = recommendationLayerControl(layer);
  if (!control) return;
  if (control.matches?.('input[type="checkbox"], input[type="radio"]')) control.checked = true;
  else control.setAttribute('aria-pressed', 'true');
  control.classList?.add('active', 'is-active');
  control.closest?.('[data-recommendation-layer]')?.classList.add('active', 'is-active');
}

function sampleEvenly(items, count) {
  if (items.length <= count) return [...items];
  if (count <= 1) return items.slice(0, Math.max(0, count));
  return Array.from({ length: count }, (_, index) => items[Math.round(index * (items.length - 1) / (count - 1))]);
}

function selectRecommendationCatalogPreview(apartments = []) {
  const bestByDistrict = new Map();
  apartments.forEach((apartment) => {
    const regionCode = String(apartment.regionCode || '');
    if (!regionCode.startsWith('11') && !regionCode.startsWith('41')) return;
    if (!apartment.address || !apartment.name || /^[\d\s()\-]+$/.test(String(apartment.name))) return;
    const current = bestByDistrict.get(regionCode);
    const rank = Number(apartment.households || 0) * 10000 + Number(apartment.builtYear || 0);
    const currentRank = current ? Number(current.households || 0) * 10000 + Number(current.builtYear || 0) : -1;
    if (!current || rank > currentRank) bestByDistrict.set(regionCode, apartment);
  });
  const seoul = [...bestByDistrict.values()].filter((item) => String(item.regionCode).startsWith('11')).sort((a, b) => String(a.regionCode).localeCompare(String(b.regionCode)));
  const gyeonggi = [...bestByDistrict.values()].filter((item) => String(item.regionCode).startsWith('41')).sort((a, b) => String(a.regionCode).localeCompare(String(b.regionCode)));
  const perRegion = Math.floor(MAX_RECOMMENDATION_CATALOG_PREVIEW / 2);
  return [...sampleEvenly(seoul, perRegion), ...sampleEvenly(gyeonggi, MAX_RECOMMENDATION_CATALOG_PREVIEW - perRegion)];
}

async function ensureRecommendationCatalogPreview() {
  if (state.recommendationCatalogPreviewReady) return state.recommendationCatalogPreview;
  if (recommendationCatalogPreviewPromise) return recommendationCatalogPreviewPromise;
  recommendationCatalogPreviewPromise = (async () => {
    const payload = await loadApartmentCatalog();
    const selected = selectRecommendationCatalogPreview(payload.apartments || []);
    const mapped = await mapPool(selected, 3, async (apartment) => {
      const result = await geocodeLocally(apartment.address);
      return result ? {
        ...apartment,
        lat: result.lat,
        lng: result.lng,
        mapLayer: 'apartments',
        mapRecordId: `context:apartment:${apartment.catalogId}`,
        mapContextOnly: true,
      } : apartment;
    });
    state.recommendationCatalogPreview = mapped.filter(isGeoPoint);
    state.recommendationCatalogPreviewReady = true;
    return state.recommendationCatalogPreview;
  })().catch(() => {
    state.recommendationCatalogPreviewReady = true;
    state.recommendationCatalogPreview = [];
    return [];
  }).finally(() => { recommendationCatalogPreviewPromise = null; });
  return recommendationCatalogPreviewPromise;
}

function supplyGeoPoint(notice) {
  const candidates = [notice, ...(Array.isArray(notice?.locations) ? notice.locations : [])];
  for (const candidate of candidates) {
    const point = {
      lat: candidate?.lat ?? candidate?.latitude ?? candidate?.y,
      lng: candidate?.lng ?? candidate?.longitude ?? candidate?.x,
    };
    if (isGeoPoint(point)) return { lat: Number(point.lat), lng: Number(point.lng) };
  }
  return null;
}

function supplyMapRecord(notice) {
  const point = supplyGeoPoint(notice);
  if (!point) return null;
  const location = supplyLocation(notice);
  return {
    ...notice,
    ...point,
    name: notice.title || '공식 분양 공고',
    address: location.address || [supplyRegionLabel(notice), location.district].filter(Boolean).join(' '),
    regionName: supplyRegionLabel(notice),
    mapLayer: 'supply',
    mapRecordId: `context:supply:${notice.id}`,
  };
}

async function ensureSupplyMapLocations() {
  if (state.supplyMapLocationsReady) return state.supplyFeed?.notices || [];
  if (supplyMapGeocodePromise) return supplyMapGeocodePromise;
  supplyMapGeocodePromise = (async () => {
    const notices = state.supplyFeed?.notices || [];
    if (!notices.length) {
      state.supplyMapLocationsReady = true;
      return notices;
    }
    const actionable = sortSupplyNotices(
      notices.filter((notice) => noticeStatusAtKst(notice, new Date()) !== 'closed'),
      'deadline',
      new Date(),
    ).filter((notice) => supplyGeoPoint(notice) || supplyLocation(notice).address)
      .slice(0, MAX_RECOMMENDATION_SUPPLY_MARKERS);
    const located = await mapPool(actionable, 3, async (notice) => {
      const existing = supplyGeoPoint(notice);
      if (existing) return [String(notice.id), existing];
      const location = supplyLocation(notice);
      const query = location.address || [supplyRegionLabel(notice), location.district, notice.title].filter(Boolean).join(' ');
      const result = query ? await geocodeLocally(query) : null;
      return [String(notice.id), result && isGeoPoint(result) ? { lat: Number(result.lat), lng: Number(result.lng) } : null];
    });
    const points = new Map(located.filter((entry) => entry?.[1]));
    state.supplyFeed = {
      ...state.supplyFeed,
      notices: notices.map((notice) => {
        const point = points.get(String(notice.id));
        return point ? { ...notice, ...point, mapCoordinateSource: 'naver-geocode-local' } : notice;
      }),
    };
    state.supplyMapLocationsReady = true;
    return state.supplyFeed.notices;
  })().catch(() => {
    state.supplyMapLocationsReady = true;
    return state.supplyFeed?.notices || [];
  }).finally(() => { supplyMapGeocodePromise = null; });
  return supplyMapGeocodePromise;
}

function recommendationResultRecords() {
  return sortedRecommendationResults().filter(isGeoPoint);
}

function recommendationMapContextRecords(layers, candidateRecords = []) {
  const records = [];
  const candidateIds = new Set(candidateRecords.map(recommendationCandidateId));
  const hasSearchResults = state.recommendationRunning || Boolean(state.recommendationMeta) || state.recommendationResults.length > 0;
  if (layers.apartments && !hasSearchResults) records.push(...state.recommendationCatalogPreview);
  if (layers.supply) records.push(...(state.supplyFeed?.notices || []).map(supplyMapRecord).filter(Boolean));
  if (layers.visits) records.push(...state.visits.filter(isGeoPoint).map((visit) => ({
    ...visit, mapLayer: 'visits', mapRecordId: `context:visit:${visit.id}`,
  })));
  if (layers.shortlist) records.push(...state.shortlist.filter(isGeoPoint).filter((candidate) => !candidateIds.has(recommendationCandidateId(candidate))).map((candidate) => ({
    ...candidate, mapLayer: 'shortlist', mapRecordId: `context:shortlist:${recommendationCandidateId(candidate)}`,
  })));
  return records;
}

async function refreshRecommendationMapLayers({ fit = false, candidateOverride = null } = {}) {
  const map = await ensureRecommendationMap();
  if (!map) return null;
  let layers = recommendationLayerState();
  const hasSearchResults = state.recommendationRunning || Boolean(state.recommendationMeta) || state.recommendationResults.length > 0;
  if (layers.apartments && !hasSearchResults) await ensureRecommendationCatalogPreview();
  if (layers.supply) await ensureSupplyMapLocations();
  layers = recommendationLayerState();
  const rawCandidates = candidateOverride || recommendationResultRecords();
  const candidateRecords = layers.apartments
    ? recommendationMapCandidates(rawCandidates).map((candidate) => ({ ...candidate, isShortlisted: layers.shortlist && shortlistHas(candidate) }))
    : [];
  const contextRecords = recommendationMapContextRecords(layers, candidateRecords);
  const destinations = layers.workplaces
    ? normalizeDestinations(state.recommendationRunSnapshot?.destinations || state.workplaces)
    : [];
  map.setCandidateRecords(candidateRecords);
  map.setContextRecords(contextRecords);
  map.setDestinations(destinations, { fit: false });
  if (fit) map.fitCandidateRecords(candidateRecords.length ? destinations : [...contextRecords, ...destinations]);
  return map;
}

async function ensureRecommendationMap() {
  if (state.recommendationMapReady) {
    recommendationMap.resize();
    return recommendationMap;
  }
  const container = $('#recommendationMap');
  if (!container || container.offsetParent === null) return null;
  try {
    await recommendationMap.init(container, {
      cluster: true,
      onCandidateSelect: (candidate) => {
        setRecommendationPanel('results');
        const id = CSS.escape(String(candidate.catalogId || candidate.id));
        const ordered = sortedRecommendationResults();
        const resultIndex = ordered.findIndex((item) => String(item.catalogId || item.id) === String(candidate.catalogId || candidate.id));
        if (resultIndex >= state.recommendationVisibleCount) {
          state.recommendationVisibleCount = Math.ceil((resultIndex + 1) / 50) * 50;
          renderRecommendationResults();
        }
        $$('.recommendation-card').forEach((card) => card.classList.toggle('is-map-selected', card.dataset.candidateId === String(candidate.catalogId || candidate.id)));
        window.requestAnimationFrame(() => $(`.recommendation-card[data-candidate-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
      },
      onContextSelect: (record) => {
        if (record.mapLayer === 'visits') state.selectedVisitId = record.id;
      },
    });
    state.recommendationMapReady = true;
    return recommendationMap;
  } catch (_) {
    const status = $('#recommendationMapStatus');
    if (status) {
      $('strong', status).textContent = '추천 지도를 불러오지 못했어요';
      $('small', status).textContent = '네이버 지도 연결 상태를 확인해주세요.';
    }
    return null;
  }
}

async function mapPool(items, concurrency, worker, onProgress = null) {
  const results = new Array(items.length);
  let cursor = 0;
  let completed = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = await worker(items[index], index); }
      catch (_) { results[index] = items[index]; }
      completed += 1;
      onProgress?.(results, completed, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function geocodeRecommendationCandidates(candidates, token, destinations = [], onProgress = null) {
  const destinationList = normalizeDestinations(destinations);
  return mapPool(candidates, 5, async (candidate) => {
    if (token !== state.recommendationGeocodeToken) return candidate;
    const query = candidate.address || `${candidate.regionName || ''} ${candidate.dong || ''} ${candidate.name || ''}`.trim();
    const result = await geocodeLocally(query);
    if (!result) return candidate;
    const distanceKmByDestination = Object.fromEntries(destinationList.map((destination) => [
      destination.id,
      haversineKm(result, destination),
    ]));
    const weightedDistanceEntries = destinationList.map((destination) => ({
      distance: Number(distanceKmByDestination[destination.id]),
      weight: Math.max(0, Number(destination.weight) || 0),
    })).filter((item) => Number.isFinite(item.distance));
    const totalWeight = weightedDistanceEntries.reduce((sum, item) => sum + item.weight, 0);
    const weightedDistanceKm = weightedDistanceEntries.length
      ? weightedDistanceEntries.reduce((sum, item) => sum + item.distance * (totalWeight ? item.weight : 1), 0) / (totalWeight || weightedDistanceEntries.length)
      : null;
    const maxDistanceKm = weightedDistanceEntries.length ? Math.max(...weightedDistanceEntries.map((item) => item.distance)) : null;
    return {
      ...candidate,
      lat: result.lat,
      lng: result.lng,
      resolvedAddress: result.roadAddress || result.jibunAddress || result.name || query,
      distanceKmByDestination,
      weightedDistanceKm,
      maxDistanceKm,
      distanceKm: weightedDistanceKm,
    };
  }, onProgress);
}

async function fetchCommuteQuota() {
  if (!APP_CONFIG.commuteQuotaUrl) return null;
  try {
    const response = await fetch(APP_CONFIG.commuteQuotaUrl, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    state.commuteQuota = payload;
    renderRecommendationDecisionBar();
    return payload;
  } catch (_) {
    return null;
  }
}

function recommendationCandidateId(candidate) {
  return String(candidate?.catalogId || candidate?.id || '');
}

async function requestCommuteMatrix(selectedCandidates, filters, destinations, token, { transitProvider = '' } = {}) {
  const configuredModes = filters.commuteModes.filter((mode) => mode === 'transit'
    ? state.transportConfig.transitConfigured
    : mode === 'car' && state.transportConfig.carConfigured);
  if (!configuredModes.length || !destinations.length) return [];
  const normalizedDestinations = normalizeDestinations(destinations.map((destination) => ({
    ...destination,
    modes: configuredModes,
    maxMinutes: filters.commuteMaxMinutes,
    departureTime: filters.commuteDepartureTime,
  })));
  if (APP_CONFIG.commuteBatchUrl) {
    const items = [];
    // The local server deliberately accepts bounded origin batches. Chunking
    // keeps Kakao's 20–50-candidate screening compatible with that contract.
    const batchSize = Math.max(1, Math.min(50, Math.trunc(Number(state.localCommuteCandidateLimit) || 10)));
    for (let offset = 0; offset < selectedCandidates.length; offset += batchSize) {
      if (token !== state.recommendationGeocodeToken) break;
      const batch = selectedCandidates.slice(offset, offset + batchSize);
      const origins = batch.map((candidate) => ({ id: recommendationCandidateId(candidate), lat: candidate.lat, lng: candidate.lng }));
      const response = await fetch(APP_CONFIG.commuteBatchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origins,
          destinations: normalizedDestinations,
          maxTransitCalls: expectedTransitProviderCalls(normalizedDestinations, origins),
          ...(transitProvider ? { transitProvider } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.message || '정밀 통근 경로를 확인하지 못했습니다.');
      state.commuteQuota = payload.quota ? { ...payload.quota, provider: payload.provider || payload.quota.provider } : state.commuteQuota;
      if (Array.isArray(payload.items)) items.push(...payload.items);
    }
    return items;
  }
  const items = [];
  await mapPool(selectedCandidates.flatMap((candidate) => normalizedDestinations.map((destination) => ({ candidate, destination }))), 2, async ({ candidate, destination }) => {
    if (token !== state.recommendationGeocodeToken) return;
    const response = await fetch(APP_CONFIG.commuteUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        origin: { lat: candidate.lat, lng: candidate.lng }, destination,
        modes: destination.modes, departureTime: destination.departureTime || '08:00',
        ...(transitProvider ? { transitProvider } : {}),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    items.push({ originId: recommendationCandidateId(candidate), destinationId: destination.id, routes: payload.routes || [] });
  });
  return items;
}

async function verifyRecommendationCommutes(candidates, filters, token, destinations, options = {}) {
  if (!candidates.length) return state.recommendationResults;
  const items = await requestCommuteMatrix(candidates, filters, destinations, token, options);
  const routesByCandidate = new Map();
  items.forEach((item) => {
    const originId = String(item.originId || '');
    if (!routesByCandidate.has(originId)) routesByCandidate.set(originId, {});
    routesByCandidate.get(originId)[String(item.destinationId)] = item.routes || [];
  });
  const selectedIds = new Set(candidates.map(recommendationCandidateId));
  const fingerprint = destinationFingerprint(destinations);
  const verificationStage = options.verificationStage === 'screening' ? 'screening' : 'final';
  const provider = String(options.transitProvider || state.transportConfig.transitProvider || (filters.commuteModes.includes('car') ? 'naver' : 'unknown'));
  const checkedAt = new Date().toISOString();
  const updateCandidate = (candidate) => {
    const id = recommendationCandidateId(candidate);
    if (!selectedIds.has(id)) return candidate;
    const routesByDestination = routesByCandidate.get(id) || {};
    const commuteBalance = evaluateCommuteBalance({ id, routesByDestination }, destinations);
    if (verificationStage === 'screening') {
      return {
        ...candidate,
        commuteScreening: {
          stage: 'screening', provider, destinationFingerprint: fingerprint, checkedAt,
          routesByDestination, balance: commuteBalance,
        },
      };
    }
    return {
      ...candidate,
      routesByDestination,
      commuteBalance,
      commuteProvider: provider,
      destinationFingerprint: fingerprint,
      commuteVerification: {
        stage: 'final', provider, destinationFingerprint: fingerprint, verifiedAt: checkedAt,
        stale: false, staleReason: '',
      },
    };
  };
  state.recommendationResults = state.recommendationResults.map(updateCandidate);
  let shortlistChanged = false;
  state.shortlist = state.shortlist.map((candidate) => {
    if (!selectedIds.has(recommendationCandidateId(candidate))) return candidate;
    shortlistChanged = true;
    return updateCandidate(candidate);
  });
  if (shortlistChanged) saveShortlist(state.shortlist);
  return state.recommendationResults;
}

function balancedProxyCandidates(candidates, limit) {
  const ordered = [...candidates].filter(isGeoPoint).sort((a, b) => Number(a.maxDistanceKm ?? Infinity) - Number(b.maxDistanceKm ?? Infinity)
    || Number(a.weightedDistanceKm ?? Infinity) - Number(b.weightedDistanceKm ?? Infinity)
    || candidateAveragePrice(a) - candidateAveragePrice(b));
  const selected = [];
  const zones = new Set();
  ordered.forEach((candidate) => {
    if (selected.length >= limit) return;
    const zone = `${Number(candidate.lat).toFixed(2)}:${Number(candidate.lng).toFixed(2)}`;
    if (zones.has(zone)) return;
    zones.add(zone);
    selected.push(candidate);
  });
  if (selected.length < limit) ordered.forEach((candidate) => {
    if (selected.length < limit && !selected.includes(candidate)) selected.push(candidate);
  });
  return selected;
}

function candidateScreeningRank(candidate) {
  const balance = candidate?.commuteScreening?.balance;
  if (!balance) return [3, Number(candidate?.maxDistanceKm ?? Infinity), Number(candidate?.weightedDistanceKm ?? Infinity)];
  const rank = balance.decision === 'matched' ? 0 : balance.decision === 'pending' ? 1 : 2;
  return [
    rank,
    Number.isFinite(balance.worstRatio) ? balance.worstRatio : Number.POSITIVE_INFINITY,
    Number.isFinite(balance.weightedMeanMinutes) ? balance.weightedMeanMinutes : Number.POSITIVE_INFINITY,
  ];
}

async function verifyTopRecommendationCommutes() {
  if (state.commuteVerificationRunning || state.recommendationRunning) return;
  const snapshot = state.recommendationRunSnapshot;
  const filters = snapshot?.filters || readRecommendationForm();
  const destinations = normalizeDestinations(snapshot?.destinations || filters.destinations || []);
  const candidates = state.recommendationResults.filter(isGeoPoint);
  if (!destinations.length || !candidates.length) return showToast('먼저 목적지를 추가하고 예산 후보를 찾아주세요.', 'error');
  const quota = await fetchCommuteQuota();
  const provider = String(quota?.provider || quota?.transitProvider || '').toLowerCase();
  const tmapQuota = quota?.tmap || quota;
  const carOnly = !destinations.some((destination) => destination.modes.includes('transit'));
  const providers = state.transportConfig.providers || {};
  const hybrid = !carOnly && providers.kakaoTransitConfigured && providers.tmapTransitConfigured;
  const remainingTmap = Math.max(0, Number(tmapQuota?.remaining ?? 10));
  const reserveTmap = Math.min(2, remainingTmap);
  const tmapCap = quotaAwareCandidateCap(destinations, Math.max(0, remainingTmap - reserveTmap), { requestedCandidates: 2 }).candidateCap || 0;
  const selectedProvider = provider.includes('kakao') ? 'kakao' : 'tmap';
  const kakaoRemaining = Math.max(0, Number(quota?.kakao?.remaining ?? KAKAO_PUBLIC_TRANSIT_DAILY_BUDGET));
  const kakaoBudget = Math.min(KAKAO_PUBLIC_TRANSIT_DAILY_BUDGET, kakaoRemaining);
  const kakaoCandidateCap = quotaAwareCandidateCap(destinations, kakaoBudget, {
    requestedCandidates: MAX_KAKAO_SCREENING_CANDIDATES,
  }).candidateCap || 0;
  const providerQuota = selectedProvider === 'kakao' ? kakaoBudget : Math.max(0, remainingTmap - reserveTmap);
  const singleProviderCap = quotaAwareCandidateCap(destinations, providerQuota, {
    requestedCandidates: selectedProvider === 'kakao' ? MAX_KAKAO_SCREENING_CANDIDATES : 2,
  }).candidateCap || 0;
  const candidateCap = carOnly
    ? Math.min(10, candidates.length)
    : hybrid
      ? Math.min(candidates.length, kakaoCandidateCap)
      : Math.min(candidates.length, singleProviderCap);
  if (!candidateCap) return showToast('오늘 남은 대중교통 호출량으로는 모든 목적지를 함께 검증할 수 없어요.', 'error');
  const selected = balancedProxyCandidates(candidates, candidateCap);
  state.commuteVerificationRunning = true;
  const button = $('#verifyTopCommutes');
  button.disabled = true;
  $('span', button).textContent = hybrid
    ? `Kakao ${selected.length}곳 선별 중`
    : `${selected.length}곳 × ${destinations.length}목적지 확인 중`;
  const status = $('#recommendationMapStatus');
  if (status) {
    status.hidden = false;
    $('strong', status).textContent = hybrid ? `Kakao로 상위 ${selected.length}곳을 넓게 선별 중` : `상위 ${selected.length}개 후보의 실제 통근 행렬 확인 중`;
    $('small', status).textContent = hybrid ? `이후 최대 ${tmapCap}곳만 같은 출근시각으로 TMAP 확인합니다.` : '모든 목적지가 제한 시간 안일 때만 충족으로 표시합니다.';
  }
  try {
    if (hybrid) {
      state.recommendationResults = await verifyRecommendationCommutes(
        selected, filters, state.recommendationGeocodeToken, destinations, {
          transitProvider: 'kakao', verificationStage: 'screening',
        },
      );
      const broadIds = new Set(selected.map((candidate) => String(candidate.catalogId || candidate.id)));
      const broadResults = state.recommendationResults.filter((candidate) => broadIds.has(String(candidate.catalogId || candidate.id)));
      const finalCandidates = [...broadResults]
        .sort((a, b) => {
          const ar = candidateScreeningRank(a);
          const br = candidateScreeningRank(b);
          return ar[0] - br[0] || ar[1] - br[1] || ar[2] - br[2];
        })
        .slice(0, tmapCap);
      if (finalCandidates.length) {
        $('span', button).textContent = `TMAP ${finalCandidates.length}곳 정밀 확인 중`;
        if (status) {
          $('strong', status).textContent = `${finalCandidates.length}곳을 평일 ${filters.commuteDepartureTime} 기준으로 재확인 중`;
          $('small', status).textContent = `TMAP ${finalCandidates.length * destinations.filter((item) => item.modes.includes('transit')).length}회 이내 · 2회 예비 보존`;
        }
        state.recommendationResults = await verifyRecommendationCommutes(
          finalCandidates, filters, state.recommendationGeocodeToken, destinations, {
            transitProvider: 'tmap', verificationStage: 'final',
          },
        );
      }
    } else {
      state.recommendationResults = await verifyRecommendationCommutes(
        selected, filters, state.recommendationGeocodeToken, destinations,
        carOnly
          ? { verificationStage: 'final' }
          : { transitProvider: selectedProvider, verificationStage: 'final' },
      );
    }
    state.recommendationCommuteEnriched = true;
    const matched = state.recommendationResults.filter((candidate) => candidateCommuteDecision(candidate) === 'matched').length;
    $('#recommendationCommuteScope').value = matched ? 'matched' : 'all';
    renderRecommendationResults();
    showToast(hybrid
      ? `Kakao ${selected.length}곳을 1차 선별하고 TMAP ${Math.min(tmapCap, selected.length)}곳만 최종 검증했어요.`
      : `${selected.length}개 후보 × ${destinations.length}개 목적지의 실제 통근을 확인했어요.`);
  } catch (error) {
    showToast(error.message || '정밀 통근 확인에 실패했습니다.', 'error');
  } finally {
    state.commuteVerificationRunning = false;
    button.disabled = false;
    $('span', button).textContent = '상위 후보 정밀 통근';
  }
}

async function verifySingleRecommendationCommute(candidate, trigger = null) {
  if (state.commuteVerificationRunning || !isGeoPoint(candidate)) return;
  const snapshot = state.recommendationRunSnapshot;
  const filters = state.recommendationShowingShortlist ? readRecommendationForm() : (snapshot?.filters || readRecommendationForm());
  const destinations = normalizeDestinations(state.recommendationShowingShortlist
    ? filters.destinations || []
    : snapshot?.destinations || filters.destinations || []);
  if (!destinations.length) return showToast('먼저 출근 목적지를 추가해주세요.', 'error');
  const needsTransit = destinations.some((destination) => destination.modes.includes('transit'));
  const transitProvider = needsTransit && state.transportConfig.providers?.tmapTransitConfigured
    ? 'tmap'
    : needsTransit ? state.transportConfig.transitProvider : '';
  state.commuteVerificationRunning = true;
  if (trigger) {
    trigger.disabled = true;
    trigger.textContent = `${destinations.length}개 목적지 확인 중…`;
  }
  try {
    state.recommendationResults = await verifyRecommendationCommutes(
      [candidate], filters, state.recommendationGeocodeToken, destinations,
      transitProvider ? { transitProvider, verificationStage: 'final' } : { verificationStage: 'final' },
    );
    state.recommendationCommuteEnriched = true;
    renderRecommendationResults();
    const refreshed = state.recommendationResults.find((item) => recommendationCandidateId(item) === recommendationCandidateId(candidate))
      || state.shortlist.find((item) => recommendationCandidateId(item) === recommendationCandidateId(candidate));
    const decision = candidateCommuteDecision(refreshed);
    showToast(decision === 'matched' ? '모든 목적지가 제한 시간 안에 들어옵니다.' : decision === 'excluded' ? '하나 이상의 목적지가 제한 시간을 넘습니다.' : '일부 경로를 확인하지 못했습니다.');
  } catch (error) {
    showToast(error.message || '이 집의 통근 경로를 확인하지 못했습니다.', 'error');
  } finally {
    state.commuteVerificationRunning = false;
    if (trigger?.isConnected) trigger.disabled = false;
  }
}

async function enrichRecommendationMapAndCommute(filters, destinations = []) {
  const token = ++state.recommendationGeocodeToken;
  state.recommendationCommuteBlockedReason = '';
  const status = $('#recommendationMapStatus');
  if (status) {
    status.hidden = false;
    $('strong', status).textContent = '후보 주소를 지도에 연결하는 중';
    $('small', status).textContent = '가격 후보를 여러 목적지까지의 가중·최악 직선거리로 1차 정렬합니다.';
  }
  const map = await ensureRecommendationMap();
  const total = state.recommendationResults.length;
  if (total > MAX_RECOMMENDATION_MAP_CANDIDATES) {
    state.recommendationCommuteBlockedReason = 'too-many';
    if (Number(filters.commuteMaxMinutes) > 0 && !state.recommendationCommuteScopeTouched) {
      $('#recommendationCommuteScope').value = 'all';
    }
    renderRecommendationResults();
    await refreshRecommendationMapLayers({ candidateOverride: [], fit: true });
    if (status) {
      status.hidden = false;
      $('strong', status).textContent = `${total.toLocaleString('ko-KR')}개 후보 · 지도를 그리기엔 범위가 넓어요`;
      $('small', status).textContent = `가격·면적·연식 또는 지역을 좁혀 ${MAX_RECOMMENDATION_MAP_CANDIDATES.toLocaleString('ko-KR')}개 이하로 만들면 전체 후보를 지도와 통근에 연결합니다.`;
    }
    return;
  }
  const progressStep = Math.max(10, Math.ceil(total / 12));
  let candidates = await geocodeRecommendationCandidates(state.recommendationResults, token, destinations, (partialResults, completed) => {
    if (token !== state.recommendationGeocodeToken || (completed % progressStep !== 0 && completed !== total)) return;
    const mappedSoFar = partialResults.filter(isGeoPoint);
    const currentScope = Number(filters.commuteMaxMinutes) > 0 ? $('#recommendationCommuteScope').value : 'all';
    const visibleMappedSoFar = Number(filters.commuteMaxMinutes) > 0
      ? filterRecommendationByCommute(mappedSoFar, currentScope)
      : mappedSoFar;
    void refreshRecommendationMapLayers({ candidateOverride: visibleMappedSoFar, fit: completed === total });
    if (status) {
      $('strong', status).textContent = `후보 위치 확인 ${completed.toLocaleString('ko-KR')}/${total.toLocaleString('ko-KR')}`;
      $('small', status).textContent = currentScope === 'matched'
        ? `${mappedSoFar.length.toLocaleString('ko-KR')}개 위치를 확인했습니다. 실제 경로가 시간 조건을 통과하기 전에는 지도에 표시하지 않습니다.`
        : `${visibleMappedSoFar.length.toLocaleString('ko-KR')}개를 현재 결과 범위에 맞춰 지도에 표시했습니다.`;
    }
  });
  if (token !== state.recommendationGeocodeToken) return;
  state.recommendationResults = candidates.map((candidate) => ({
    ...candidate,
    commuteBalance: evaluateCommuteBalance({ id: String(candidate.catalogId), routesByDestination: candidate.routesByDestination || {} }, destinations),
  }));
  state.recommendationCommuteEnriched = false;
  if (Number(filters.commuteMaxMinutes) > 0 && !state.recommendationCommuteScopeTouched) $('#recommendationCommuteScope').value = 'all';
  renderRecommendationResults();
  const mapped = sortedRecommendationResults().filter(isGeoPoint);
  await refreshRecommendationMapLayers({ candidateOverride: mapped, fit: true });
  await fetchCommuteQuota();
}

function setRecommendationStatus(kind, title, message, progress = null) {
  const root = $('#recommendationStatus');
  root.classList.remove('running', 'success', 'error');
  if (kind) root.classList.add(kind);
  $('#recommendationStatusTitle').textContent = title;
  $('#recommendationStatusMessage').textContent = message;
  const progressRoot = $('#recommendationProgress');
  progressRoot.hidden = !progress;
  if (progress) {
    const completed = Number(progress.completed || 0);
    const total = Math.max(1, Number(progress.total || 1));
    $('#recommendationProgressBar').style.width = `${Math.min(100, completed / total * 100)}%`;
    $('#recommendationProgressLabel').textContent = `${completed.toLocaleString('ko-KR')} / ${total.toLocaleString('ko-KR')}개 ${progress.label || '월·지역 조회'}`;
  }
  $('#cancelRecommendation').hidden = kind !== 'running';
  $('#runRecommendation').classList.toggle('is-loading', kind === 'running');
  $('#runRecommendation').disabled = kind === 'running';
  const composer = $('.recommendation-command-deck');
  if (composer) {
    $$('input, select, textarea, button', composer).forEach((control) => {
      if (control.classList.contains('sheet-close-button')) return;
      if (kind === 'running') {
        if (control.dataset.recommendationWasDisabled === undefined) control.dataset.recommendationWasDisabled = String(control.disabled);
        control.disabled = true;
      } else if (control.dataset.recommendationWasDisabled !== undefined) {
        control.disabled = control.dataset.recommendationWasDisabled === 'true';
        delete control.dataset.recommendationWasDisabled;
      }
    });
  }
  $('#runRecommendation').disabled = kind === 'running';
}

function updateLocalConnectionUi(health = null, error = null) {
  const serverCheck = $('#localMarketServerCheck');
  const historyCheck = $('#apartmentHistoryApiCheck');
  const stateBadge = $('#molitState');
  const commuteBadge = $('#commuteState');
  const transitCheck = $('#transitRouteCheck');
  const carCheck = $('#carRouteCheck');
  if (!APP_CONFIG.localMarketEnabled) {
    state.placeSearchConfigured = false;
    stateBadge.textContent = 'Firebase 전환 예정';
    stateBadge.className = 'service-state partial';
    serverCheck.textContent = '배포 화면 · 로컬 서버는 사용하지 않음';
    historyCheck.textContent = 'Firebase Function 배포 후 실제 조회 가능';
    if (commuteBadge) {
      commuteBadge.textContent = '서버 배포 필요';
      commuteBadge.className = 'service-state partial';
      transitCheck.textContent = 'TMAP 서버 함수 배포 필요';
      carCheck.textContent = 'NAVER Directions 서버 함수 배포 필요';
    }
    updateCompanySearchCapability();
    return;
  }
  if (error || !health?.ok) {
    state.localMarketConnected = false;
    state.localMarketKeyConfigured = false;
    state.localMarketVersion = '';
    state.localMarketOutdated = false;
    state.localHistoryMonthsMax = 60;
    stateBadge.textContent = '서버 꺼짐';
    stateBadge.className = 'service-state demo';
    serverCheck.textContent = '로컬 서버에 연결하지 못함 · 시작 명령 확인';
    serverCheck.classList.add('connection-warning');
    historyCheck.textContent = '서버가 켜지면 서울·경기 실제 가격 조회 가능';
    historyCheck.classList.add('connection-warning');
    state.transportConfig = {
      transitConfigured: false,
      carConfigured: false,
      transitProvider: '',
      transitProviderPreference: '',
      providers: { kakaoTransitConfigured: false, tmapTransitConfigured: false, naverDirectionsConfigured: false },
    };
    state.commuteQuota = null;
    state.placeSearchConfigured = false;
    if (commuteBadge) {
      commuteBadge.textContent = '서버 꺼짐';
      commuteBadge.className = 'service-state demo';
      transitCheck.textContent = '로컬 서버 연결 필요';
      carCheck.textContent = '로컬 서버 연결 필요';
    }
    updateCompanySearchCapability();
    return;
  }
  state.localMarketConnected = true;
  state.localMarketKeyConfigured = Boolean(health.keyConfigured);
  state.localMarketVersion = String(health.version || '');
  state.localMarketOutdated = !state.localMarketVersion || versionIsOlder(state.localMarketVersion, APP_CONFIG.appVersion);
  state.localHistoryMonthsMax = Number(health.limits?.historyMonthsMax) || (state.localMarketOutdated ? 24 : 60);
  state.localCommuteCandidateLimit = Number(health.limits?.commuteCandidatesPerSearch) || 10;
  stateBadge.textContent = state.localMarketOutdated ? '서버 재시작 필요' : health.keyConfigured ? '실거래 연결' : '키 연결 필요';
  stateBadge.className = `service-state ${health.keyConfigured && !state.localMarketOutdated ? 'connected' : 'partial'}`;
  serverCheck.textContent = state.localMarketOutdated
    ? `실행 중 ${state.localMarketVersion || '이전 버전'} → 화면 ${APP_CONFIG.appVersion} · 서버를 한 번 재시작해주세요`
    : `로컬 서버 정상 · ${Number(health.catalogCount || 0).toLocaleString('ko-KR')}개 서울·경기 단지`;
  serverCheck.classList.toggle('connection-warning', state.localMarketOutdated);
  const keyConnectionLabel = health.keySource === 'environment' ? '.env/환경변수 자동 연결' : '메모리 연결';
  historyCheck.textContent = health.keyConfigured
    ? `국토부 키 ${keyConnectionLabel} · 월 캐시 ${Number(health.cache?.months || 0).toLocaleString('ko-KR')}개${state.localMarketOutdated ? ` · 현재 최대 ${state.localHistoryMonthsMax / 12}년` : ' · 최대 5년'}`
    : '국토부 키를 연결하면 실제 매매·전월세 조회 가능';
  historyCheck.classList.toggle('connection-warning', !health.keyConfigured || state.localMarketOutdated);
  state.transportConfig = {
    transitConfigured: Boolean(health.commute?.transitConfigured),
    carConfigured: Boolean(health.commute?.carConfigured),
    transitProvider: String(health.commute?.transitProvider || ''),
    transitProviderPreference: String(health.commute?.transitProviderPreference || ''),
    providers: {
      kakaoTransitConfigured: Boolean(health.commute?.providers?.kakaoTransitConfigured),
      tmapTransitConfigured: Boolean(health.commute?.providers?.tmapTransitConfigured),
      naverDirectionsConfigured: Boolean(health.commute?.providers?.naverDirectionsConfigured),
    },
  };
  state.commuteQuota = health.commute?.tmapQuota ? {
    provider: state.transportConfig.transitProvider,
    transitConfigured: state.transportConfig.transitConfigured,
    tmap: health.commute.tmapQuota,
  } : state.commuteQuota;
  state.placeSearchConfigured = Boolean(health.placeSearch?.configured);
  if (commuteBadge) {
    const count = Number(state.transportConfig.transitConfigured) + Number(state.transportConfig.carConfigured);
    commuteBadge.textContent = count === 2 ? '2개 경로 연결' : count === 1 ? '1개 경로 연결' : '키 연결 필요';
    commuteBadge.className = `service-state ${count === 2 ? 'connected' : 'partial'}`;
    const transitProviderLabel = state.transportConfig.transitProvider === 'kakao' ? 'Kakao' : state.transportConfig.transitProvider === 'tmap' ? 'TMAP' : '대중교통';
    transitCheck.textContent = state.transportConfig.transitConfigured ? `${transitProviderLabel} 버스·지하철 실제 경로 연결` : 'Kakao REST 키 또는 TMAP appKey 필요 · 대중교통 미확인';
    carCheck.textContent = state.transportConfig.carConfigured ? 'NAVER Directions 5 자동차 연결' : 'NAVER Client ID·Secret 필요 · 자동차 미확인';
    transitCheck.classList.toggle('connection-warning', !state.transportConfig.transitConfigured);
    carCheck.classList.toggle('connection-warning', !state.transportConfig.carConfigured);
  }
  updateCompanySearchCapability();
}

async function checkLocalMarketConnection() {
  if (!APP_CONFIG.localMarketEnabled || !APP_CONFIG.localMarketHealthUrl) {
    updateLocalConnectionUi();
    return null;
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(APP_CONFIG.localMarketHealthUrl, { cache: 'no-store', signal: controller.signal });
    const health = response.ok ? await response.json() : null;
    updateLocalConnectionUi(health, response.ok ? null : new Error('health check failed'));
    if (health?.ok) await fetchCommuteQuota();
    return health;
  } catch (error) {
    updateLocalConnectionUi(null, error);
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function openLocalKeyModal(options = {}) {
  const focusSelector = options && typeof options === 'object' && typeof options.focusSelector === 'string'
    ? options.focusSelector
    : '#localServiceKey';
  $('#localKeyStatus').textContent = state.localMarketConnected
    ? state.localMarketKeyConfigured
      ? `국토부 키 연결됨 · 대중교통 ${state.transportConfig.transitConfigured ? '연결' : '미연결'} · 자동차 ${state.transportConfig.carConfigured ? '연결' : '미연결'} · 건물명 ${state.placeSearchConfigured ? '연결' : '미연결'}`
      : `로컬 서버는 켜져 있습니다. 필요한 실거래·통근·건물명 검색 키만 입력해주세요.${state.placeSearchConfigured ? ' 건물명 검색은 연결되어 있습니다.' : ''}`
    : '로컬 서버가 꺼져 있습니다. 아래 명령으로 먼저 시작해주세요.';
  $('#localKeyStatus').className = `local-key-status${state.localMarketConnected ? '' : ' error'}`;
  openModalShell('localKeyModal', focusSelector);
}

function closeLocalKeyModal() {
  closeModalShell('localKeyModal');
  $('#localServiceKey').value = '';
  $('#localTmapKey').value = '';
  $('#localKakaoRestKey').value = '';
  $('#localTransitProvider').value = '';
  $('#localNaverClientSecret').value = '';
  $('#localNaverPlaceClientId').value = '';
  $('#localNaverPlaceClientSecret').value = '';
}

async function connectLocalMarketKey(event) {
  event.preventDefault();
  const key = $('#localServiceKey').value.trim();
  const tmapAppKey = $('#localTmapKey').value.trim();
  const kakaoRestApiKey = $('#localKakaoRestKey').value.trim();
  const transitProvider = $('#localTransitProvider').value;
  const naverClientId = $('#localNaverClientId').value.trim();
  const naverClientSecret = $('#localNaverClientSecret').value.trim();
  const naverLocalClientId = $('#localNaverPlaceClientId').value.trim();
  const naverLocalClientSecret = $('#localNaverPlaceClientSecret').value.trim();
  if ((naverLocalClientId && !naverLocalClientSecret) || (!naverLocalClientId && naverLocalClientSecret)) {
    $('#localKeyStatus').textContent = '회사·건물명 검색용 NAVER API HUB Client ID와 Secret을 함께 입력해주세요.';
    $('#localKeyStatus').className = 'local-key-status error';
    return;
  }
  if (!key && !tmapAppKey && !kakaoRestApiKey && !transitProvider && !naverClientSecret && !naverLocalClientId) {
    $('#localKeyStatus').textContent = '실거래, 통근 경로, 또는 회사·건물명 검색 키 중 하나를 입력해주세요.';
    $('#localKeyStatus').className = 'local-key-status error';
    return;
  }
  const button = $('#submitLocalKey');
  button.disabled = true;
  $('#localKeyStatus').textContent = '키를 로컬 서버 메모리에 연결하고 있어요.';
  $('#localKeyStatus').className = 'local-key-status';
  try {
    const response = await fetch(APP_CONFIG.localMarketConfigUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        ...(key ? { serviceKey: key } : {}),
        ...(tmapAppKey ? { tmapAppKey } : {}),
        ...(kakaoRestApiKey ? { kakaoRestApiKey } : {}),
        ...(transitProvider ? { transitProvider } : {}),
        ...(naverClientSecret ? { naverClientId, naverClientSecret } : {}),
        ...(naverLocalClientId ? { naverLocalClientId, naverLocalClientSecret } : {}),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || '키를 연결하지 못했습니다.');
    $('#localServiceKey').value = '';
    $('#localTmapKey').value = '';
    $('#localKakaoRestKey').value = '';
    $('#localTransitProvider').value = '';
    $('#localNaverClientSecret').value = '';
    $('#localNaverPlaceClientId').value = '';
    $('#localNaverPlaceClientSecret').value = '';
    $('#localKeyStatus').textContent = '연결되었습니다. 이 화면에 입력한 값은 서버를 끌 때까지 메모리에만 유지됩니다.';
    $('#localKeyStatus').className = 'local-key-status success';
    await checkLocalMarketConnection();
    showToast('입력한 데이터·경로·장소 검색 키를 로컬 메모리에 연결했어요.');
    window.setTimeout(closeLocalKeyModal, 650);
  } catch (error) {
    $('#localKeyStatus').textContent = error.message || '로컬 서버 연결을 확인해주세요.';
    $('#localKeyStatus').className = 'local-key-status error';
  } finally {
    button.disabled = false;
  }
}

function recommendationJobUrl(jobId) {
  return `${APP_CONFIG.recommendationUrl}/${encodeURIComponent(jobId)}`;
}

async function pollRecommendationJob(jobId) {
  if (!jobId || state.recommendationJobId !== jobId) return;
  try {
    const response = await fetch(recommendationJobUrl(jobId), { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || '추천 진행 상태를 읽지 못했습니다.');
    if (state.recommendationJobId !== jobId) return;
    const progress = payload.progress || { completed: 0, total: 1 };
    const isRetrying = payload.stage === 'retrying';
    const visibleProgress = isRetrying
      ? { completed: progress.retryCompleted, total: progress.retryTotal, label: '일시 실패 요청 재시도' }
      : progress;
    $('#recommendStepPrice').classList.toggle('active', payload.status === 'running');
    $('small', $('#recommendStepPrice')).textContent = payload.status === 'running'
      ? isRetrying
        ? `${progress.retryCompleted}/${progress.retryTotal}개 · 실패 요청만 천천히 재시도 중`
        : `${progress.completed}/${progress.total}개 요청 · 실제 신고 거래 확인 중`
      : '실거래 확인 완료';
    if (payload.status === 'running') {
      setRecommendationStatus(
        'running',
        isRetrying ? '일시 실패한 지역만 다시 확인하고 있어요' : '서울·경기 실제 거래를 확인하고 있어요',
        isRetrying
          ? '국토부의 순간 호출 제한을 피하도록 실패한 월·지역만 간격을 두고 다시 요청합니다.'
          : `${Number(payload.baseCandidateCount || 0).toLocaleString('ko-KR')}개 1차 후보가 있는 지역의 월 자료를 조회합니다. 같은 월은 로컬 캐시를 재사용해요.`,
        visibleProgress,
      );
      state.recommendationPollTimer = window.setTimeout(() => pollRecommendationJob(jobId), 900);
      return;
    }
    state.recommendationRunning = false;
    if (payload.status === 'cancelled') {
      setRecommendationStatus('', '추천 조회를 취소했어요', '입력한 조건은 그대로 남아 있습니다.');
      return;
    }
    if (payload.status === 'error') throw new Error(payload.error || '추천 조회에 실패했습니다.');
    state.recommendationResults = Array.isArray(payload.results) ? payload.results : [];
    $('#recommendStepPrice').classList.remove('active');
    $('#recommendStepPrice').classList.add('complete');
    renderRecommendationResults(payload);
    const snapshot = state.recommendationRunSnapshot;
    void enrichRecommendationMapAndCommute(snapshot?.filters || readRecommendationForm(), snapshot?.destinations || []);
    const failedCount = Number(payload.failedRequestCount || 0);
    const failureReason = payload.failureSummary?.[0]?.reason || '국토부 일시 응답 오류';
    setRecommendationStatus(
      'success',
      failedCount
        ? `${state.recommendationResults.length.toLocaleString('ko-KR')}개 후보 · 일부 지역은 재확인 필요`
        : `${state.recommendationResults.length.toLocaleString('ko-KR')}개 가격·기본조건 후보를 찾았어요`,
      failedCount
        ? `실패 요청을 다시 시도했지만 ${failedCount.toLocaleString('ko-KR')}건은 ${failureReason}로 빠졌습니다. 표시된 후보의 가격·면적은 실제 거래로 확인됐고, 다시 찾기를 누르면 누락분만 재조회합니다.`
        : '규모·연식·전용면적·평균 실거래가격은 확인했습니다. 위치를 지도에 놓은 뒤, 상위 후보만 정밀 통근 버튼으로 검증할 수 있습니다.',
    );
  } catch (error) {
    if (state.recommendationJobId !== jobId) return;
    state.recommendationRunning = false;
    $('#recommendStepPrice').classList.remove('active');
    setRecommendationStatus('error', '실거래 후보를 찾지 못했어요', error.message || '로컬 실거래 서버를 확인해주세요.');
  }
}

async function runRecommendation() {
  if (state.recommendationRunning) return;
  const filters = readRecommendationForm();
  const runToken = ++recommendationRunToken;
  window.clearTimeout(state.recommendationPollTimer);
  state.recommendationJobId = '';
  state.recommendationGeocodeToken += 1;
  state.recommendationRunSnapshot = null;
  state.recommendationResults = [];
  state.recommendationMeta = null;
  state.recommendationShowingShortlist = false;
  state.recommendationCommuteScopeTouched = false;
  state.recommendationCommuteBlockedReason = '';
  state.recommendationCommuteEnriched = false;
  state.recommendationVisibleCount = 50;
  $('#recommendationCommuteScope').value = 'all';
  $('#recommendationResults').replaceChildren();
  setRecommendationPanel('');
  recommendationMap.clearCandidateMarkers();
  if (!filters.regions.length) {
    setRecommendationPanel('filters');
    return setRecommendationStatus('error', '지역을 선택해주세요', '서울 또는 경기 중 한 곳 이상을 선택해야 합니다.');
  }
  if (!filters.maxPriceManWon || !filters.minAreaM2) {
    setRecommendationPanel('filters');
    return setRecommendationStatus('error', '가격과 면적을 확인해주세요', '실거래 예산과 최소 전용면적이 있어야 정확히 판정할 수 있습니다.');
  }
  if (filters.commuteMaxMinutes && !filters.destinations.length) {
    setRecommendationPanel('filters');
    return setRecommendationStatus('error', '출근 목적지를 추가해주세요', '회사·학교 등 실제 목적지를 1~4곳 추가한 뒤 후보를 찾아주세요.');
  }
  if (filters.destinations.some((destination) => !isGeoPoint(destination))) {
    setRecommendationPanel('filters');
    return setRecommendationStatus('error', '목적지 좌표를 다시 확인해주세요', '각 목적지 카드를 열어 검색 결과를 고르거나 지도에서 건물을 선택해주세요.');
  }
  state.recommendationRunning = true;
  void refreshRecommendationMapLayers();
  setRecommendationStatus('running', '회사 위치와 연결 상태를 확인하고 있어요', '검색을 시작한 조건은 완료될 때까지 고정합니다.', { completed: 0, total: 1, label: '사전 확인' });
  const confirmedDestinations = filters.commuteMaxMinutes ? normalizeDestinations(filters.destinations) : [];
  if (runToken !== recommendationRunToken) return;
  saveRecommendationFilters(filters);
  renderRecommendationChips(recommendationChipLabels(filters));
  const health = await checkLocalMarketConnection();
  if (runToken !== recommendationRunToken) return;
  if (!health?.ok || !health.keyConfigured) {
    state.recommendationRunning = false;
    setRecommendationStatus('error', health?.ok ? '국토부 키 연결이 필요해요' : '로컬 실거래 서버를 켜주세요', health?.ok ? 'homehunt/.env의 MOLIT_SERVICE_KEY를 채우고 서버를 재시작하거나, 키 연결 창에서 이번 실행에만 연결해주세요.' : 'homehunt/scripts/start-local-market.ps1을 실행하면 Git에서 제외된 homehunt/.env를 자동으로 읽습니다.');
    openLocalKeyModal();
    return;
  }
  if (state.localMarketOutdated) {
    state.recommendationRunning = false;
    setRecommendationStatus(
      'error',
      '화면 업데이트 적용을 위해 서버를 한 번 다시 켜주세요',
      `브라우저 새로고침만으로는 바뀌지 않습니다. 기존 서버 창에서 Ctrl+C를 누른 뒤 homehunt/scripts/start-local-market.ps1을 다시 실행하세요. homehunt/.env에 둔 키는 자동으로 다시 읽고, 화면에서만 연결했던 키는 다시 입력해야 합니다. ${APP_CONFIG.appVersion} 기준으로 찾습니다.`,
    );
    return;
  }
  state.recommendationRunSnapshot = {
    filters: structuredClone(filters),
    destinations: structuredClone(confirmedDestinations),
  };
  $('#recommendStepPrice').classList.add('active');
  setRecommendationStatus('running', '추천 조회를 준비하고 있어요', '공식 단지를 먼저 줄인 뒤 국토부 월별 매매 실거래를 확인합니다.', { completed: 0, total: 1 });
  try {
    const { companyAddress, destinations, ...serverFilters } = filters;
    const response = await fetch(APP_CONFIG.recommendationUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serverFilters),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || '추천 조회를 시작하지 못했습니다.');
    state.recommendationJobId = payload.jobId;
    pollRecommendationJob(payload.jobId);
  } catch (error) {
    state.recommendationRunning = false;
    state.recommendationRunSnapshot = null;
    $('#recommendStepPrice').classList.remove('active');
    setRecommendationStatus('error', '추천 조회를 시작하지 못했어요', error.message || '로컬 실거래 서버를 확인해주세요.');
  }
}

async function cancelRecommendation(announce = true) {
  recommendationRunToken += 1;
  window.clearTimeout(state.recommendationPollTimer);
  const jobId = state.recommendationJobId;
  state.recommendationJobId = '';
  state.recommendationRunning = false;
  state.recommendationRunSnapshot = null;
  $('#recommendStepPrice').classList.remove('active');
  setRecommendationStatus('', announce ? '추천 조회를 취소했어요' : '새 조건으로 다시 시작합니다', '입력한 조건은 이 기기에 그대로 저장됩니다.');
  if (jobId) fetch(recommendationJobUrl(jobId), { method: 'DELETE' }).catch(() => {});
}

function activeRecommendationDestinations({ shortlist = state.recommendationShowingShortlist } = {}) {
  if (shortlist) return normalizeDestinations(readRecommendationForm().destinations || state.workplaces);
  return normalizeDestinations(state.recommendationRunSnapshot?.destinations || state.workplaces);
}

function requiresTmapFinal(destinations = activeRecommendationDestinations()) {
  return destinations.some((destination) => destination.modes.includes('transit'))
    && state.transportConfig.providers?.kakaoTransitConfigured
    && state.transportConfig.providers?.tmapTransitConfigured;
}

function recommendationVerificationStatus(candidate, options = {}) {
  const destinations = options.destinations || activeRecommendationDestinations(options);
  return candidateVerificationStatus(candidate, {
    destinationFingerprint: destinationFingerprint(destinations),
    requireTmapFinal: options.requireTmapFinal ?? requiresTmapFinal(destinations),
  });
}

function refreshShortlistCommuteFreshness({ persist = true } = {}) {
  const fingerprint = destinationFingerprint(activeRecommendationDestinations({ shortlist: true }));
  const reconciled = reconcileShortlistFingerprints(state.shortlist, fingerprint);
  if (!reconciled.changed) return false;
  state.shortlist = reconciled.items;
  if (persist) saveShortlist(state.shortlist);
  return true;
}

function candidateCommuteDecision(candidate) {
  const status = recommendationVerificationStatus(candidate);
  if (status.stage !== 'pending' || candidate?.commuteVerification || candidate?.commuteScreening) return status.decision;
  return candidate?.commuteBalance?.decision ? 'pending' : commuteDecision(candidate);
}

function recommendationMapCandidates(candidates = []) {
  return candidates.map((candidate) => {
    const status = recommendationVerificationStatus(candidate);
    if (!candidate.commuteBalance || status.final) return { ...candidate, isShortlisted: shortlistHas(candidate) };
    return {
      ...candidate,
      isShortlisted: shortlistHas(candidate),
      commuteBalance: {
        ...candidate.commuteBalance,
        decision: 'pending', matched: false, requiredFullyVerified: false,
      },
    };
  });
}

function filterRecommendationByCommute(candidates = [], scope = 'all') {
  if (scope === 'matched') return candidates.filter((candidate) => candidateCommuteDecision(candidate) === 'matched');
  if (scope === 'pending') return candidates.filter((candidate) => candidateCommuteDecision(candidate) === 'pending');
  return [...candidates];
}

function candidateCommuteRank(candidate) {
  const verification = recommendationVerificationStatus(candidate);
  const balance = candidate?.commuteBalance;
  if (balance) {
    const decisionRank = verification.decision === 'matched' ? 0 : verification.decision === 'pending' ? 1 : 2;
    const proxyWorst = Number(candidate.maxDistanceKm);
    const proxyMean = Number(candidate.weightedDistanceKm);
    return [
      decisionRank,
      Number.isFinite(balance.worstRatio) ? balance.worstRatio : Number.isFinite(proxyWorst) ? proxyWorst : Number.POSITIVE_INFINITY,
      Number.isFinite(balance.weightedMeanMinutes) ? balance.weightedMeanMinutes : Number.isFinite(proxyMean) ? proxyMean : Number.POSITIVE_INFINITY,
    ];
  }
  const legacy = commuteRank(candidate);
  return [legacy[0], legacy[1], legacy[1]];
}

function renderRecommendationDecisionBar() {
  const results = state.recommendationShowingShortlist ? state.shortlist : (state.recommendationResults || []);
  const verified = results.filter((candidate) => recommendationVerificationStatus(candidate).final);
  const matched = results.filter((candidate) => candidateCommuteDecision(candidate) === 'matched');
  const best = [...matched].sort((a, b) => {
    const ar = candidateCommuteRank(a);
    const br = candidateCommuteRank(b);
    return ar[1] - br[1] || ar[2] - br[2];
  })[0];
  const affordable = $('#decisionAffordableCount');
  if (!affordable) return;
  $('#decisionCandidateLabel').textContent = state.recommendationShowingShortlist ? '저장 후보' : '예산 후보';
  $('#decisionCandidateDetail').textContent = state.recommendationShowingShortlist ? '저장 당시 조건 기준' : '실거래·면적 확인';
  affordable.textContent = results.length.toLocaleString('ko-KR');
  $('#decisionVerifiedCount').textContent = verified.length.toLocaleString('ko-KR');
  $('#decisionVerifiedDetail').textContent = matched.length ? `모든 목적지 충족 ${matched.length}곳` : verified.length ? '검증했지만 시간 조건 초과' : '버튼을 눌러 실제 경로 확인';
  $('#decisionBestBalance').textContent = best ? `${best.commuteBalance.balanceScore}점` : '—';
  const worst = best?.commuteBalance?.evaluations?.filter((item) => item.verified).sort((a, b) => Number(b.ratio) - Number(a.ratio))[0];
  $('#decisionWorstCommute').textContent = worst ? `가장 불리한 곳 ${worst.destination.label} ${worst.durationMinutes}분` : '모든 목적지를 확인해야 계산';
  const quota = state.commuteQuota || {};
  const provider = String(quota.provider || quota.transitProvider || '').toLowerCase();
  const tmap = quota.tmap || quota;
  const kakao = quota.kakao || {};
  if (provider.includes('kakao')) {
    $('#decisionTransitQuota').textContent = Number.isFinite(Number(kakao.remaining))
      ? `${Number(kakao.remaining).toLocaleString('ko-KR')}건 남음`
      : '기본 1,000건/일';
    $('#decisionTransitProvider').textContent = Number.isFinite(Number(kakao.used))
      ? `Kakao ${Number(kakao.used).toLocaleString('ko-KR')}/${Number(kakao.limit || 1000).toLocaleString('ko-KR')} · TMAP ${Number(tmap.remaining ?? 0).toLocaleString('ko-KR')}건 최종용`
      : 'Kakao 광역 검증 · 사용량은 콘솔 확인';
  } else if (Number.isFinite(Number(tmap.remaining))) {
    $('#decisionTransitQuota').textContent = `${Number(tmap.remaining).toLocaleString('ko-KR')}건 남음`;
    $('#decisionTransitProvider').textContent = `TMAP ${Number(tmap.used || 0)}/${Number(tmap.limit || 10)} · 출발시각 반영`;
  } else {
    $('#decisionTransitQuota').textContent = state.transportConfig.transitConfigured ? '연결됨' : '키 필요';
    $('#decisionTransitProvider').textContent = state.transportConfig.transitConfigured ? '쿼터 정보를 불러오는 중' : '설정에서 대중교통 키 연결';
  }
  const destinations = normalizeDestinations(state.recommendationRunSnapshot?.destinations || state.workplaces);
  const hybrid = destinations.some((destination) => destination.modes.includes('transit'))
    && state.transportConfig.providers?.kakaoTransitConfigured
    && state.transportConfig.providers?.tmapTransitConfigured;
  const tmapRemainingForPlan = Math.max(0, Number(tmap.remaining ?? 10) - Math.min(2, Number(tmap.remaining ?? 10)));
  const tmapCandidatePlan = quotaAwareCandidateCap(destinations, tmapRemainingForPlan, { requestedCandidates: 2 }).candidateCap || 0;
  const kakaoPlanningBudget = Math.max(0, Number(kakao.remaining ?? KAKAO_PUBLIC_TRANSIT_DAILY_BUDGET));
  const kakaoCandidatePlan = quotaAwareCandidateCap(destinations, kakaoPlanningBudget, {
    requestedCandidates: MAX_KAKAO_SCREENING_CANDIDATES,
  }).candidateCap || 0;
  const plannedCandidates = provider.includes('kakao') ? kakaoCandidatePlan : tmapCandidatePlan;
  const expected = expectedTransitProviderCalls(destinations, Math.min(plannedCandidates, results.filter(isGeoPoint).length));
  const verifyButton = $('#verifyTopCommutes');
  if (verifyButton && !state.commuteVerificationRunning) {
    const buttonLabel = $('span', verifyButton);
    if (buttonLabel) buttonLabel.textContent = state.recommendationShowingShortlist
      ? '검색 결과에서 통근 확인'
      : hybrid
        ? `Kakao 최대 ${Math.min(kakaoCandidatePlan, results.length)}곳 선별 → TMAP ${Math.min(tmapCandidatePlan, results.length)}곳 최종`
        : expected ? `상위 후보 정밀 통근 · 약 ${expected}회` : '상위 후보 정밀 통근';
    verifyButton.disabled = state.recommendationShowingShortlist || !results.some(isGeoPoint) || !destinations.length || state.recommendationRunning;
  }
}

function compositionRow(label, count, total, tone = '') {
  const row = createElement('div', `composition-row ${tone}`.trim());
  const copy = createElement('span', '', label);
  copy.title = label;
  const track = createElement('span', 'composition-track');
  const fill = createElement('i');
  fill.style.width = `${count ? Math.max(4, count / Math.max(1, total) * 100) : 0}%`;
  track.append(fill);
  row.append(copy, track, createElement('strong', '', `${count.toLocaleString('ko-KR')}곳`));
  return row;
}

function areaAveragePrice(area) {
  return Number(area?.averagePriceManWon ?? area?.medianPriceManWon ?? Number.POSITIVE_INFINITY);
}

function candidateAveragePrice(candidate) {
  return areaAveragePrice(candidate?.bestArea);
}

function hasArithmeticAverage(area) {
  return Number.isFinite(Number(area?.averagePriceManWon));
}

function renderRecommendationComposition(results = []) {
  const regionRoot = $('#recommendationRegionMix');
  const priceRoot = $('#recommendationPriceMix');
  const basis = $('#recommendationPriceMixBasis');
  if (!regionRoot || !priceRoot) return;
  const candidates = (results || []).filter((candidate) => candidate && candidate.bestArea);
  if (basis) {
    basis.textContent = candidates.some((candidate) => !hasArithmeticAverage(candidate.bestArea))
      ? '일부 이전 저장가격 · 다시 검색하면 평균으로 갱신'
      : '후보별 선택 평형 평균가';
  }
  if (!candidates.length) {
    regionRoot.replaceChildren(createElement('p', 'composition-empty', '예산 후보를 찾으면 지역 구성이 나타납니다.'));
    priceRoot.replaceChildren(createElement('p', 'composition-empty', '동일 면적 실거래가 확인된 후보만 집계합니다.'));
    return;
  }
  const regionCounts = new Map();
  candidates.forEach((candidate) => {
    const label = String(candidate.regionName || candidate.district || '지역 미상').replace(/^(서울특별시|경기도)\s*/, '');
    regionCounts.set(label, (regionCounts.get(label) || 0) + 1);
  });
  const orderedRegions = [...regionCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
  const visibleRegions = orderedRegions.slice(0, 4);
  const otherCount = orderedRegions.slice(4).reduce((sum, [, count]) => sum + count, 0);
  if (otherCount) visibleRegions.push(['그 외 지역', otherCount]);
  regionRoot.replaceChildren(...visibleRegions.map(([label, count]) => compositionRow(label, count, candidates.length)));

  const prices = candidates.map(candidateAveragePrice).filter((price) => Number.isFinite(price) && price > 0).sort((a, b) => a - b);
  if (!prices.length) {
    priceRoot.replaceChildren(createElement('p', 'composition-empty', '표시할 실거래 평균가격이 없습니다.'));
    return;
  }
  const minPrice = prices[0];
  const maxPrice = prices.at(-1);
  if (maxPrice === minPrice) {
    priceRoot.replaceChildren(compositionRow(formatPrice(minPrice), prices.length, prices.length, 'price'));
    return;
  }
  const bucketCount = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(prices.length))));
  const width = (maxPrice - minPrice) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    lower: minPrice + width * index,
    upper: index === bucketCount - 1 ? maxPrice : minPrice + width * (index + 1),
    count: 0,
  }));
  prices.forEach((price) => {
    const index = Math.min(bucketCount - 1, Math.floor((price - minPrice) / width));
    buckets[index].count += 1;
  });
  priceRoot.replaceChildren(...buckets.map((bucket, index) => {
    const bracket = index === bucketCount - 1 ? '이하' : '미만';
    return compositionRow(`${formatCompactPrice(bucket.lower)}–${formatCompactPrice(bucket.upper)} ${bracket}`, bucket.count, prices.length, 'price');
  }));
}

function sortedRecommendationResults() {
  const sort = $('#recommendationSort').value;
  const commuteRequired = !state.recommendationShowingShortlist
    && Number(state.recommendationRunSnapshot?.filters?.commuteMaxMinutes || 0) > 0;
  const rawSource = state.recommendationShowingShortlist ? state.shortlist : state.recommendationResults;
  const scope = commuteRequired ? $('#recommendationCommuteScope').value : 'all';
  const source = commuteRequired ? filterRecommendationByCommute(rawSource, scope) : rawSource;
  return [...source].sort((a, b) => {
    if (commuteRequired && scope === 'all') {
      const aDecision = candidateCommuteDecision(a);
      const bDecision = candidateCommuteDecision(b);
      const ranks = { matched: 0, pending: 1, excluded: 2 };
      if (ranks[aDecision] !== ranks[bDecision]) return ranks[aDecision] - ranks[bDecision];
    }
    if (sort === 'commute') {
      const aRank = candidateCommuteRank(a);
      const bRank = candidateCommuteRank(b);
      return aRank[0] - bRank[0] || aRank[1] - bRank[1] || aRank[2] - bRank[2] || candidateAveragePrice(a) - candidateAveragePrice(b);
    }
    if (sort === 'recent') return Number(b.builtYear || 0) - Number(a.builtYear || 0) || candidateAveragePrice(a) - candidateAveragePrice(b);
    if (sort === 'households') return Number(b.households || 0) - Number(a.households || 0) || candidateAveragePrice(a) - candidateAveragePrice(b);
    return candidateAveragePrice(a) - candidateAveragePrice(b);
  });
}

function shortlistHas(candidate) {
  return state.shortlist.some((item) => String(item.catalogId) === String(candidate.catalogId));
}

function toggleRecommendationShortlist(candidate) {
  if (shortlistHas(candidate)) state.shortlist = state.shortlist.filter((item) => String(item.catalogId) !== String(candidate.catalogId));
  else {
    const { commute, distanceKm, ...safeCandidate } = candidate;
    const fingerprint = destinationFingerprint(activeRecommendationDestinations({ shortlist: false }));
    state.shortlist = [{
      ...safeCandidate,
      pricingBasis: 'arithmetic-mean-v1',
      destinationFingerprint: fingerprint,
      savedAt: new Date().toISOString(),
      status: '검토',
    }, ...state.shortlist].slice(0, 60);
  }
  saveShortlist(state.shortlist);
  renderRecommendationResults();
  showToast(shortlistHas(candidate) ? '관심 후보에 저장했어요.' : '관심 후보에서 뺐어요.');
}

async function showRecommendationOnMap(candidate) {
  try {
    let mappedCandidate = candidate;
    if (!isGeoPoint(mappedCandidate)) {
      const result = await geocodeLocally(candidate.address || `${candidate.regionName} ${candidate.name}`);
      if (!result) throw new Error('주소 좌표를 찾지 못했습니다.');
      mappedCandidate = { ...candidate, lat: result.lat, lng: result.lng };
      state.recommendationResults = state.recommendationResults.map((item) => String(item.catalogId) === String(candidate.catalogId) ? mappedCandidate : item);
      const shortlistIndex = state.shortlist.findIndex((item) => String(item.catalogId) === String(candidate.catalogId));
      if (shortlistIndex >= 0) {
        state.shortlist[shortlistIndex] = { ...state.shortlist[shortlistIndex], lat: result.lat, lng: result.lng };
        saveShortlist(state.shortlist);
      }
    }
    const map = await ensureRecommendationMap();
    if (!map) throw new Error('추천 지도를 불러오지 못했습니다.');
    const source = sortedRecommendationResults();
    const mappedSource = source.filter(isGeoPoint);
    if (!mappedSource.some((item) => String(item.catalogId) === String(mappedCandidate.catalogId))) mappedSource.push(mappedCandidate);
    activateRecommendationLayer('apartments');
    await refreshRecommendationMapLayers({ candidateOverride: mappedSource });
    map.focusCandidate(mappedCandidate);
    setRecommendationPanel('');
    showToast(`${candidate.name} 후보를 추천 지도에서 찾았어요.`);
  } catch (error) {
    showToast(error.message || '지도에서 위치를 찾지 못했습니다.', 'error');
  }
}

function showRecommendationMarket(candidate) {
  setView('market');
  state.complexHistoryMonths = 60;
  $('#complexHistoryMonths').value = '60';
  $('#complexRegion').value = String(candidate.regionCode || '');
  $('#complexSearchInput').value = candidate.name || '';
  state.marketIntentToken += 1;
  const preferred = candidate.bestArea?.areaM2;
  state.pendingComplexPreference = preferred ? { dealType: '매매', areaM2: preferred } : null;
  searchComplexMarket(null, candidate);
}

function showSupplyMarket(notice) {
  const rawName = String(notice?.name || notice?.houseName || notice?.complexName || notice?.title || '').trim();
  const query = rawName
    .replace(/\s*(?:입주자\s*)?모집공고(?:문)?(?:\s.*)?$/u, '')
    .replace(/\s*(?:공공|민간)?분양주택$/u, '')
    .trim() || rawName;
  if (!query) return showToast('공고에서 단지명을 확인하지 못했어요. 공식 공고에서 단지명을 확인해주세요.', 'error');
  setView('market');
  state.complexHistoryMonths = 60;
  $('#complexHistoryMonths').value = '60';
  $('#complexRegion').value = '';
  $('#complexSearchInput').value = query;
  state.marketIntentToken += 1;
  const preferredArea = Number(notice?.homes?.[0]?.areaM2 || notice?.minAreaM2 || 0);
  state.pendingComplexPreference = preferredArea > 0 ? { dealType: '매매', areaM2: preferredArea } : null;
  searchComplexMarket(null);
}

function marketMapRecord(id) {
  const value = String(id || '');
  if (!value) return null;
  if (value.startsWith('context:visit:')) {
    const visitId = value.slice('context:visit:'.length);
    return { record: state.visits.find((item) => String(item.id) === visitId), kind: 'visit' };
  }
  if (value.startsWith('supply:') || value.startsWith('context:supply:')) {
    const noticeId = value.replace(/^context:supply:/, '').replace(/^supply:/, '');
    return { record: (state.supplyFeed?.notices || []).find((item) => String(item.id) === noticeId), kind: 'supply' };
  }
  const prefixes = ['context:shortlist:', 'context:apartment:', 'candidate:'];
  const prefix = prefixes.find((item) => value.startsWith(item));
  const catalogId = prefix ? value.slice(prefix.length) : value.replace(/^candidate:/, '');
  const candidate = [...state.recommendationResults, ...state.shortlist, ...state.recommendationCatalogPreview]
    .find((item) => recommendationCandidateId(item) === catalogId);
  return candidate ? { record: candidate, kind: 'candidate' } : null;
}

function openMarketForRecord(record, kind = 'candidate') {
  if (!record) return;
  if (kind === 'visit') void openMarketForVisit(record);
  else if (kind === 'supply') showSupplyMarket(record);
  else showRecommendationMarket(record);
}

function bindOpenMarketButton(button, record, kind = 'candidate') {
  const id = kind === 'visit' ? `context:visit:${record.id}`
    : kind === 'supply' ? `supply:${record.id}` : `candidate:${recommendationCandidateId(record)}`;
  button.dataset.openMarketComplex = id;
  if (kind === 'supply') button.dataset.openMarketSupply = String(record.id || '');
  button.dataset.marketBound = 'true';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    openMarketForRecord(record, kind);
  });
}

function makeRecommendationCard(candidate, index) {
  const card = createElement('article', 'recommendation-card');
  card.dataset.candidateId = String(candidate.catalogId || candidate.id || '');
  card.style.animationDelay = `${Math.min(index, 12) * 22}ms`;
  const top = createElement('div', 'recommendation-card-top');
  const title = createElement('div');
  title.append(createElement('span', 'recommendation-card-location', [candidate.regionName, candidate.dong].filter(Boolean).join(' · ')), createElement('h3', '', candidate.name));
  const commute = candidate.commute?.best || null;
  const verification = recommendationVerificationStatus(candidate);
  const balance = verification.stage === 'screening'
    ? candidate.commuteScreening?.balance || candidate.commuteBalance || null
    : candidate.commuteBalance || null;
  const routeFullyChecked = Boolean(verification.final || candidate.commute?.allRequestedModesChecked);
  const decision = verification.decision;
  const providerLabel = verification.provider === 'tmap' ? 'TMAP' : verification.provider === 'kakao' ? 'Kakao' : '공식 경로';
  const badgeText = verification.stale
    ? '목적지 변경 · 통근 재검증 필요'
    : verification.stage === 'screening'
      ? verification.screeningDecision === 'matched'
        ? `${providerLabel} 1차 통과 · TMAP 최종 미검증`
        : verification.screeningDecision === 'excluded'
          ? `${providerLabel} 1차 시간 초과 · TMAP 최종 미검증`
          : `${providerLabel} 1차 일부 미확인`
      : decision === 'matched'
        ? `${providerLabel} 최종 충족 · 균형 ${balance?.balanceScore ?? '—'}점`
        : decision === 'excluded' ? `${providerLabel} 최종 확인 · 시간 초과 있음` : '정밀 통근 미확인';
  const badgeClass = decision === 'matched' ? '' : decision === 'excluded' ? 'over-limit' : 'estimated';
  top.append(title, createElement('span', `verification-badge ${badgeClass}`, badgeText));
  const price = createElement('div', 'recommendation-price');
  const area = candidate.bestArea || {};
  const savedContext = state.recommendationShowingShortlist;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const latestMonthLabel = area.latestMonth
    ? `${area.latestMonth}${area.latestMonth === currentMonth ? ' · 신고 진행 중' : ''}`
    : '기준월 없음';
  const averageAvailable = hasArithmeticAverage(area);
  const priceBasisLabel = averageAvailable
    ? `${savedContext ? '저장 당시' : '조회기간'} 평균 매매가`
    : '이전 계산 기준 가격 · 다시 검색하면 평균으로 갱신';
  price.append(
    createElement('span', '', `${formatAreaPair(area.areaM2)} · ${priceBasisLabel}`),
    createElement('strong', '', formatPrice(areaAveragePrice(area))),
    createElement('small', '', `${latestMonthLabel} · 평균을 낸 거래 ${Number(area.count || 0)}건 · 가장 최근 ${formatPrice(area.latestPriceManWon)}`),
  );
  const facts = createElement('div', 'recommendation-facts');
  const age = Math.max(0, new Date().getFullYear() - Number(candidate.builtYear || 0));
  const transitDetail = commute?.mode === 'transit'
    ? `${Number.isFinite(commute.walkMinutes) ? ` · 도보 ${commute.walkMinutes}분` : ''}${Number.isFinite(commute.transferCount) ? ` · 환승 ${commute.transferCount}회` : ''}`
    : '';
  const worstDestination = balance?.evaluations?.filter((item) => item.verified).sort((a, b) => Number(b.ratio) - Number(a.ratio))[0];
  const commuteFact = verification.stale
    ? '저장 후 목적지가 바뀌어 이전 통근시간은 판정에 사용하지 않음'
    : verification.stage === 'screening'
      ? `Kakao 1차 ${balance?.decision === 'matched' ? '통과' : balance?.decision === 'excluded' ? '시간 초과' : '일부 미확인'} · TMAP 출발시각 최종 검증 전`
    : verification.final && balance?.requiredFullyVerified
    ? `가중 평균 ${balance.weightedMeanMinutes}분 · 최악 ${worstDestination?.destination?.label || '목적지'} ${worstDestination?.durationMinutes || '—'}분`
    : commute?.verified
    ? `${commute.mode === 'transit' ? '버스·지하철' : '자동차'} ${commute.durationMinutes}분${transitDetail} · ${commute.withinLimit ? '조건 충족' : routeFullyChecked ? '조건 초과' : '다른 수단 미확인'}`
    : Number.isFinite(Number(candidate.weightedDistanceKm)) ? `가중 직선거리 ${Number(candidate.weightedDistanceKm).toFixed(1)}km · 실제 시간 아님` : '목적지 경로 확인 필요';
  facts.append(
    createElement('span', '', `${Number(candidate.households || 0).toLocaleString('ko-KR')}세대`),
    createElement('span', '', `${candidate.builtYear || '연도 미상'}년 · ${candidate.builtYear ? `${age}년차` : '확인 필요'}`),
    createElement('span', '', `${savedContext ? '저장 당시 예산 안' : '예산 내'} 실제 평형 ${(candidate.qualifyingAreas || []).length}개`),
    createElement('span', decision === 'matched' ? 'commute-ok' : decision === 'excluded' ? 'commute-over' : 'unknown', commuteFact),
  );
  const commuteMatrix = createElement('div', 'recommendation-commute-matrix');
  const evaluations = balance?.evaluations || activeRecommendationDestinations().map((destination) => ({ destination, verified: false, withinLimit: false }));
  evaluations.forEach((evaluation, destinationIndex) => {
    const currentFinal = verification.final && !verification.stale;
    const cell = createElement('div', `recommendation-commute-cell ${currentFinal && evaluation.verified ? (evaluation.withinLimit ? 'pass' : 'fail') : 'pending'}`);
    const label = evaluation.destination?.label || `목적지 ${String.fromCharCode(65 + destinationIndex)}`;
    const routeDetail = evaluation.verified
      ? `${evaluation.durationMinutes}분${Number.isFinite(evaluation.walkingMinutes) ? ` · 도보 ${evaluation.walkingMinutes}분` : ''}${Number.isFinite(evaluation.transferCount) ? ` · 환승 ${evaluation.transferCount}회` : ''}`
      : '아직 실제 경로 미확인';
    const detail = verification.stale
      ? `이전 조건 ${routeDetail} · 재검증 필요`
      : verification.stage === 'screening' ? `Kakao 1차 ${routeDetail} · 최종 아님` : routeDetail;
    cell.append(createElement('strong', '', `${String.fromCharCode(65 + destinationIndex)} · ${label}`), createElement('small', '', detail));
    commuteMatrix.append(cell);
  });
  const areas = createElement('div', 'recommendation-areas');
  const areaText = (candidate.qualifyingAreas || []).slice(0, 4).map((item) => `${formatAreaPair(item.areaM2)} 평균 ${formatPrice(areaAveragePrice(item))}(${item.count}건)`).join(' · ');
  areas.append(createElement('strong', '', `${savedContext ? '저장 당시 예산 안의' : '예산 안의'} 실제 거래 평형 ${(candidate.qualifyingAreas || []).length}개`), createElement('p', '', areaText || '해당 평형 정보 없음'));
  const actions = createElement('div', 'recommendation-card-actions');
  const mapButton = createElement('button', '', '지도에서 보기');
  mapButton.type = 'button';
  mapButton.addEventListener('click', () => showRecommendationOnMap(candidate));
  const marketButton = createElement('button', '', '5년 실거래');
  marketButton.type = 'button';
  bindOpenMarketButton(marketButton, candidate);
  const shortlistButton = createElement('button', shortlistHas(candidate) ? 'shortlisted' : '', shortlistHas(candidate) ? '관심 후보 저장됨' : '관심 후보 저장');
  shortlistButton.type = 'button';
  shortlistButton.addEventListener('click', () => toggleRecommendationShortlist(candidate));
  const landLink = createElement('a', '', '네이버 부동산');
  landLink.href = naverLandUrl(candidate.name);
  landLink.target = '_blank';
  landLink.rel = 'noopener noreferrer';
  const commuteButton = createElement('button', 'candidate-commute-button', verification.final ? '통근 다시 확인' : `이 집 통근 확인 · ${evaluations.length}회`);
  commuteButton.type = 'button';
  commuteButton.addEventListener('click', () => verifySingleRecommendationCommute(candidate, commuteButton));
  actions.append(mapButton, marketButton, commuteButton, shortlistButton, landLink);
  card.append(top, price, facts, commuteMatrix, areas, actions);
  return card;
}

function renderRecommendationResults(meta = null) {
  if (meta) state.recommendationMeta = meta;
  if (state.recommendationShowingShortlist) refreshShortlistCommuteFreshness();
  const displayMeta = meta || state.recommendationMeta;
  const rawResults = state.recommendationShowingShortlist ? state.shortlist : state.recommendationResults;
  const commuteRequired = !state.recommendationShowingShortlist
    && Number(state.recommendationRunSnapshot?.filters?.commuteMaxMinutes || 0) > 0;
  const commuteScope = $('#recommendationCommuteScope');
  commuteScope.hidden = !commuteRequired;
  const matchedCount = rawResults.filter((candidate) => candidateCommuteDecision(candidate) === 'matched').length;
  const pendingCount = rawResults.filter((candidate) => candidateCommuteDecision(candidate) === 'pending').length;
  const excludedCount = rawResults.filter((candidate) => candidateCommuteDecision(candidate) === 'excluded').length;
  const verifiedCount = rawResults.filter((candidate) => recommendationVerificationStatus(candidate).final).length;
  if (commuteRequired) {
    commuteScope.querySelector('[value="matched"]').textContent = `모든 목적지 충족 ${matchedCount.toLocaleString('ko-KR')}`;
    commuteScope.querySelector('[value="pending"]').textContent = `경로 미확인 ${pendingCount.toLocaleString('ko-KR')}`;
    commuteScope.querySelector('[value="all"]').textContent = `가격조건 전체 ${rawResults.length.toLocaleString('ko-KR')}`;
  }
  const results = sortedRecommendationResults();
  const visibleResults = results.slice(0, state.recommendationVisibleCount);
  $('.recommendation-page').classList.add('results-active');
  $('#recommendationResultCount').textContent = results.length.toLocaleString('ko-KR');
  $('#recommendationToolbarCount').textContent = results.length.toLocaleString('ko-KR');
  if (meta) setRecommendationPanel('results');
  const activeScope = commuteRequired ? commuteScope.value : 'all';
  $('#recommendationResultLabel').textContent = state.recommendationShowingShortlist
    ? '개 관심 후보'
    : activeScope === 'matched' ? '개 모든 목적지 충족 후보'
      : activeScope === 'pending' ? '개 통근 판정 대기 후보' : '개 가격·기본조건 후보';
  $('#recommendationShortlistCount').textContent = state.shortlist.length.toLocaleString('ko-KR');
  const shortlistButton = $('#showRecommendationShortlist');
  shortlistButton.classList.toggle('active', state.recommendationShowingShortlist);
  shortlistButton.setAttribute('aria-pressed', String(state.recommendationShowingShortlist));
  $('.shortlist-action', shortlistButton).textContent = state.recommendationShowingShortlist ? '검색 결과' : '보기';
  const failedCount = Number(displayMeta?.failedRequestCount || 0);
  const totalResultCount = Number(displayMeta?.totalResultCount || results.length);
  $('#recommendationResultSummary').textContent = state.recommendationShowingShortlist
    ? '이 브라우저에 저장한 후보입니다. 목적지가 바뀐 과거 통근 판정은 재검증 전까지 대기로 표시합니다.'
    : displayMeta
    ? `규모·연식 1차 ${Number(displayMeta.baseCandidateCount || 0).toLocaleString('ko-KR')}개 → 실제 면적·가격 ${rawResults.length.toLocaleString('ko-KR')}개${commuteRequired ? ` · 모든 목적지 충족 ${matchedCount}개 · 경로 미확인 ${pendingCount}개 · 시간 초과 ${excludedCount}개` : ''}${displayMeta.truncated ? ` · 총 ${totalResultCount.toLocaleString('ko-KR')}개 중 일부 표시` : ''}${failedCount ? ` · 미반영 ${failedCount.toLocaleString('ko-KR')}건` : ''}`
    : '현재 결과를 선택한 기준으로 다시 정렬했습니다.';
  $('#recommendationResults').replaceChildren(...visibleResults.map(makeRecommendationCard));
  renderRecommendationDecisionBar();
  renderRecommendationComposition(rawResults);
  $('#recommendationResults').hidden = results.length === 0;
  const loadMore = $('#recommendationLoadMore');
  const remaining = Math.max(0, results.length - visibleResults.length);
  loadMore.hidden = remaining === 0;
  loadMore.textContent = remaining ? `후보 ${Math.min(50, remaining)}개 더 보기 · ${visibleResults.length}/${results.length}` : '후보 더 보기';
  $('#recommendationEmpty').hidden = results.length > 0;
  $('#recommendationEmptyTitle').textContent = state.recommendationShowingShortlist
    ? '저장한 관심 후보가 없어요'
    : activeScope === 'matched' && state.recommendationCommuteBlockedReason === 'too-many' ? '통근 검증 전에 조건을 조금 좁혀주세요'
      : activeScope === 'matched' && !state.recommendationCommuteEnriched ? '아직 정밀 통근을 실행하지 않았어요'
        : activeScope === 'matched' ? '실제 통근 조건을 충족한 후보가 아직 없어요'
      : activeScope === 'pending' ? '경로 확인을 기다리는 후보가 없어요' : '실제 거래로 확인된 후보가 없어요';
  $('#recommendationEmptyMessage').textContent = state.recommendationShowingShortlist
    ? '검색 결과에서 관심 후보 저장을 누르면 다음에 다시 열어볼 수 있습니다.'
    : activeScope === 'matched' && state.recommendationCommuteBlockedReason === 'too-many'
      ? `가격 후보가 ${rawResults.length.toLocaleString('ko-KR')}개라 전체 위치·경로 검증을 시작하지 않았습니다. 지역·가격·면적 조건을 좁히거나 “가격조건 전체”에서 참고 후보만 확인해주세요.`
      : activeScope === 'matched' && !state.recommendationCommuteEnriched
        ? '가격 후보는 준비됐습니다. “상위 후보 정밀 통근”을 눌러 목적지별 실제 이동시간을 확인해주세요.'
        : activeScope === 'matched' && !(state.transportConfig.transitConfigured || state.transportConfig.carConfigured)
          ? '연결 상태에서 경로 키를 연결해주세요. 지금은 위 결과 범위를 “가격조건 전체”로 바꿔 가격 후보만 참고할 수 있습니다.'
          : activeScope === 'matched'
            ? `실제 경로 확인 결과 시간 안에 든 곳이 없습니다. “경로 미확인” ${pendingCount}개는 충족 후보로 단정하지 않고 따로 볼 수 있습니다.`
            : activeScope === 'pending'
              ? '모든 후보의 통근 경로가 확인됐습니다. “가격조건 전체”에서 시간 초과 후보까지 볼 수 있습니다.'
              : '조건을 몰래 완화하지 않았습니다. 기간을 늘리거나 예산·연식 조건을 하나씩 바꿔보세요.';
  window.requestAnimationFrame(async () => {
    const mapped = results.filter(isGeoPoint);
    await refreshRecommendationMapLayers({ candidateOverride: mapped });
  });
  if (commuteRequired && state.recommendationCommuteEnriched) {
    const mapStatus = $('#recommendationMapStatus');
    mapStatus.hidden = false;
    const mapStatusTitle = $('strong', mapStatus);
    const mapStatusDetail = $('small', mapStatus);
    if (activeScope === 'matched') {
      mapStatusTitle.textContent = `${matchedCount.toLocaleString('ko-KR')}개 모든 목적지 충족 · ${verifiedCount.toLocaleString('ko-KR')}개 후보 검증`;
      mapStatusDetail.textContent = verifiedCount
        ? `모든 필수 목적지가 제한 시간 안인 곳만 표시합니다. 미확인 ${pendingCount}개와 초과 ${excludedCount}개는 결과 범위에서 따로 볼 수 있습니다.`
        : '경로 키가 없어 기본 지도는 비어 있습니다. “경로 미확인만” 또는 “가격조건 전체”로 바꾸면 참고 후보를 볼 수 있습니다.';
    } else if (activeScope === 'pending') {
      mapStatusTitle.textContent = `${pendingCount.toLocaleString('ko-KR')}개 경로 미확인 · 충족 판정 아님`;
      mapStatusDetail.textContent = '가중·최악 직선거리는 실제 이동시간이 아닙니다. 정밀 통근 버튼을 누른 후보만 판정합니다.';
    } else {
      mapStatusTitle.textContent = `${rawResults.length.toLocaleString('ko-KR')}개 가격조건 전체 · 모든 목적지 충족 ${matchedCount.toLocaleString('ko-KR')}개`;
      mapStatusDetail.textContent = `초록만 실제 시간 충족입니다. 노랑 ${pendingCount}개는 미확인, 빨강 ${excludedCount}개는 시간 초과입니다.`;
    }
  }
}

function resetRecommendationForm() {
  if (state.recommendationRunning) void cancelRecommendation(false);
  companyGeocodeToken += 1;
  state.recommendationGeocodeToken += 1;
  state.recommendationResults = [];
  state.recommendationMeta = null;
  state.recommendationRunSnapshot = null;
  state.recommendationShowingShortlist = false;
  state.recommendationCommuteScopeTouched = false;
  state.recommendationCommuteBlockedReason = '';
  state.recommendationCommuteEnriched = false;
  state.recommendationVisibleCount = 50;
  $('#recommendationCommuteScope').value = 'all';
  $('#recommendationResults').replaceChildren();
  $('#recommendationToolbarCount').textContent = '0';
  setRecommendationPanel('');
  recommendationMap.clearCandidateMarkers();
  $('#recommendQuery').value = DEFAULT_RECOMMENDATION_QUERY;
  writeRecommendationForm({
    regions: ['seoul', 'gyeonggi'], minHouseholds: 500, householdsOperator: 'gt',
    maxPriceManWon: 60000, minAreaM2: 20 * PYEONG_TO_M2, maxAgeYears: 20,
    stationWalkMin: 0, stationWalkMax: 0, commuteMaxMinutes: 60,
    commuteModes: ['transit'], commuteDepartureTime: '08:00', months: 3, companyAddress: '', destinations: [],
  });
  state.workplaces = [];
  state.companyLocation = null;
  renderWorkplaces();
  if (state.recommendationMapReady) void refreshRecommendationMapLayers({ fit: true });
  $('.recommendation-page').classList.remove('results-active');
  parseRecommendationInput(false);
}

function restoreRecommendationForm() {
  const saved = loadRecommendationFilters();
  if (saved) {
    writeRecommendationForm(saved);
    const restored = readRecommendationForm();
    state.companyLocation = state.workplaces[0] || null;
    renderWorkplaces();
    $('#recommendQuery').value = recommendationSentence(restored);
    renderRecommendationChips(recommendationChipLabels(restored));
    return;
  }
  resetRecommendationForm();
}

function openApiGuide() {
  openModalShell('apiGuideModal', '[data-close-api-guide]');
}

function closeApiGuide() {
  closeModalShell('apiGuideModal');
}

function backupVisits() {
  downloadJson(`homehunt-visits-${todayString()}.json`, { version: 2, exportedAt: new Date().toISOString(), visits: state.visits, compareIds: state.compareIds });
}

async function restoreVisits(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const visits = Array.isArray(data) ? data : data.visits;
    if (!Array.isArray(visits)) throw new Error('방문 기록 형식이 아닙니다.');
    const validVisit = (visit) => visit && typeof visit === 'object'
      && typeof visit.id === 'string' && visit.id.length <= 120
      && typeof visit.name === 'string' && visit.name.length <= 120
      && typeof visit.address === 'string' && visit.address.length <= 300
      && (!visit.tags || (Array.isArray(visit.tags) && visit.tags.every((tag) => typeof tag === 'string')))
      && (!visit.visitedBy || (Array.isArray(visit.visitedBy) && visit.visitedBy.every((name) => typeof name === 'string')));
    const restoredIds = new Set();
    const nextVisits = visits.filter(validVisit).filter((visit) => {
      if (restoredIds.has(visit.id)) return false;
      restoredIds.add(visit.id);
      return true;
    }).map((visit) => ({
      ...visit,
      tags: (visit.tags || []).slice(0, 12),
      visitedBy: (visit.visitedBy || []).filter((name) => ['성우', '소희'].includes(name)),
    }));
    if (!nextVisits.length && visits.length) throw new Error('올바른 방문 기록이 없습니다.');
    const restoredCompareIds = Array.isArray(data) ? [] : data.compareIds;
    const nextCompareIds = pruneCompareIds(restoredCompareIds, nextVisits);
    state.visits = nextVisits;
    state.compareIds = nextCompareIds;
    state.marketContextVisit = null;
    state.pendingComplexPreference = null;
    $('#visitDealGap').hidden = true;
    persistVisits();
    showToast(`${state.visits.length}개의 기록을 복원했어요.`);
  } catch (error) {
    showToast(error.message || '기록 파일을 읽지 못했습니다.', 'error');
  }
}

function trapModalFocus(event, modal) {
  const focusable = $$('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])', modal)
    .filter((element) => element.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!modal.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function bindEvents() {
  bindRecommendationRanges();
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-open-market-complex]');
    if (!button || button.dataset.marketBound === 'true') return;
    const target = marketMapRecord(button.dataset.openMarketComplex);
    if (!target?.record) return showToast('선택한 단지 정보를 다시 불러온 뒤 시도해주세요.', 'error');
    event.preventDefault();
    openMarketForRecord(target.record, target.kind);
  }, true);
  new Set(Object.keys(RECOMMENDATION_LAYER_CONTROLS).map(recommendationLayerControl).filter(Boolean)).forEach((control) => {
    if (control.matches?.('input[type="checkbox"], input[type="radio"]')) {
      control.addEventListener('change', () => void refreshRecommendationMapLayers());
      return;
    }
    control.addEventListener('click', () => {
      const active = control.getAttribute('aria-pressed') !== 'false';
      control.setAttribute('aria-pressed', String(!active));
      control.classList.toggle('active', !active);
      control.classList.toggle('is-active', !active);
      void refreshRecommendationMapLayers();
    });
  });
  $$('[data-view-target]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.viewTarget)));
  $('#supplySearch').addEventListener('input', (event) => { state.supplyFilters.query = event.target.value.trim(); renderSupply(); });
  $$('[data-supply-region]').forEach((button) => button.addEventListener('click', () => {
    state.supplyFilters.region = button.dataset.supplyRegion || 'all';
    $$('[data-supply-region]').forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    renderSupply();
  }));
  $('#supplyStatusFilter').addEventListener('change', (event) => { state.supplyFilters.status = event.target.value; renderSupply(); });
  $('#supplyProgramFilter').addEventListener('change', (event) => { state.supplyFilters.program = event.target.value; renderSupply(); });
  $('#supplySort').addEventListener('change', (event) => { state.supplyFilters.sort = event.target.value; renderSupply(); });
  $('#supplyFavoriteFilter').addEventListener('click', (event) => {
    state.supplyFilters.favoritesOnly = !state.supplyFilters.favoritesOnly;
    event.currentTarget.setAttribute('aria-pressed', String(state.supplyFilters.favoritesOnly));
    renderSupply();
  });
  $('#refreshSupplyFeed').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const label = $('span', button); const previous = label.textContent;
    label.textContent = '확인 중';
    await ensureSupplyFeed(true);
    label.textContent = previous;
    button.disabled = false;
  });
  $('#markSupplySeen').addEventListener('click', markAllSupplySeen);
  $('#openSupplyAlertSettings').addEventListener('click', openSupplyAlertModal);
  $$('[data-open-supply-alert]').forEach((button) => button.addEventListener('click', openSupplyAlertModal));
  $$('[data-close-supply-alert]').forEach((button) => button.addEventListener('click', closeSupplyAlertModal));
  $('#supplyAlertModal').addEventListener('click', (event) => { if (event.target === $('#supplyAlertModal')) closeSupplyAlertModal(); });
  $('#enableSupplyNotifications').addEventListener('click', enableSupplyNotifications);
  $('#supplyAlertForm').addEventListener('submit', saveSupplyAlertForm);
  $$('#openSupplyMatchSettings, [data-open-supply-match]').forEach((button) => button.addEventListener('click', openSupplyMatchModal));
  $$('[data-close-supply-match]').forEach((button) => button.addEventListener('click', closeSupplyMatchModal));
  $('#supplyMatchModal').addEventListener('click', (event) => { if (event.target === $('#supplyMatchModal')) closeSupplyMatchModal(); });
  $('#supplyMatchForm').addEventListener('submit', saveSupplyMatchForm);
  $('#resetSupplyMatch').addEventListener('click', resetSupplyMatchForm);
  $$('[data-guide-anchor]').forEach((button) => button.addEventListener('click', () => goToGuideAnchor(button.dataset.guideAnchor)));
  $('#subscriptionProfileForm').addEventListener('submit', saveSubscriptionProfileForm);
  $('#clearSubscriptionProfile').addEventListener('click', resetSubscriptionProfile);
  $('#parseRecommendation').addEventListener('click', () => parseRecommendationInput());
  $('#confirmCompanyLocation').addEventListener('click', () => openCompanyLocationModal());
  $('#resetRecommendation').addEventListener('click', resetRecommendationForm);
  $('#runRecommendation').addEventListener('click', runRecommendation);
  $('#applyRecommendationFilters').addEventListener('click', () => {
    setRecommendationPanel('');
    runRecommendation();
  });
  $('#toggleRecommendationFilters').addEventListener('click', () => {
    setRecommendationPanel($('.recommendation-page').classList.contains('filters-open') ? '' : 'filters');
  });
  $('#closeRecommendationFilters').addEventListener('click', () => setRecommendationPanel('', { restoreFocus: true }));
  $('#toggleRecommendationResults').addEventListener('click', () => {
    setRecommendationPanel($('.recommendation-page').classList.contains('results-open') ? '' : 'results');
  });
  $('#closeRecommendationResults').addEventListener('click', () => setRecommendationPanel('', { restoreFocus: true }));
  $('#recommendationPanelBackdrop').addEventListener('click', () => setRecommendationPanel('', { restoreFocus: true }));
  $('#verifyTopCommutes').addEventListener('click', verifyTopRecommendationCommutes);
  $('#cancelRecommendation').addEventListener('click', () => cancelRecommendation());
  $('#recommendationCommuteScope').addEventListener('change', () => {
    state.recommendationCommuteScopeTouched = true;
    state.recommendationVisibleCount = 50;
    renderRecommendationResults();
  });
  $('#recommendationSort').addEventListener('change', () => renderRecommendationResults());
  $('#showRecommendationShortlist').addEventListener('click', () => {
    state.recommendationShowingShortlist = !state.recommendationShowingShortlist;
    state.recommendationVisibleCount = 50;
    renderRecommendationResults();
  });
  $('#recommendationLoadMore').addEventListener('click', () => {
    state.recommendationVisibleCount += 50;
    renderRecommendationResults();
  });
  $('#recommendQuery').addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      parseRecommendationInput();
    }
  });
  [
    'recommendSeoul', 'recommendGyeonggi', 'recommendHouseholds', 'recommendHouseholdsOperator',
    'recommendMaxPrice', 'recommendPriceOperator', 'recommendMinArea', 'recommendAreaOperator', 'recommendMaxAge', 'recommendStationMin',
    'recommendStationMax', 'recommendCommuteMode', 'recommendCommuteMax', 'recommendDepartureTime', 'recommendMonths',
  ].forEach((id) => $(`#${id}`).addEventListener(['SELECT', 'INPUT'].includes($(`#${id}`).tagName) ? 'input' : 'change', handleRecommendationCriteriaChanged));
  $$('[data-open-visit], #openVisitButton').forEach((button) => button.addEventListener('click', () => openVisitModal()));
  $$('.choice-chip[data-filter-deal]').forEach((button) => button.addEventListener('click', () => {
    $$('.choice-chip[data-filter-deal]').forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    renderPropertyList();
  }));
  $$('.choice-chip[data-filter-area]').forEach((button) => button.addEventListener('click', () => {
    $$('.choice-chip[data-filter-area]').forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    renderPropertyList();
  }));
  ['filterDistrict', 'filterPriceMin', 'filterPriceMax', 'visitedByBoth'].forEach((id) => $(`#${id}`).addEventListener('input', renderPropertyList));
  $$('[data-status-filter]').forEach((input) => input.addEventListener('change', renderPropertyList));
  $('#resetFilters').addEventListener('click', () => {
    $('#filterDistrict').value = '';
    $('#filterPriceMin').value = '';
    $('#filterPriceMax').value = '';
    $('#visitedByBoth').checked = false;
    $$('.choice-chip[data-filter-deal]').forEach((button) => {
      const active = button.dataset.filterDeal === '매매';
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $$('.choice-chip[data-filter-area]').forEach((button) => {
      const active = button.dataset.filterArea === 'all';
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $$('[data-status-filter]').forEach((input) => { input.checked = input.value !== '제외'; });
    renderPropertyList();
  });
  $('#toggleResultSort').addEventListener('click', () => {
    state.resultSort = state.resultSort === 'visit-desc' ? 'price-asc' : 'visit-desc';
    $('span', $('#toggleResultSort')).textContent = state.resultSort === 'visit-desc' ? '최근 방문순' : '가격 낮은순';
    renderPropertyList();
  });
  $('#archiveSearch').addEventListener('input', renderArchive);
  $('#archiveStatus').addEventListener('change', renderArchive);
  $('#archiveSort').addEventListener('change', renderArchive);
  $('#resetArchiveFilters').addEventListener('click', () => {
    $('#archiveSearch').value = '';
    $('#archiveStatus').value = '';
    $('#archiveSort').value = 'visit-desc';
    renderArchive();
  });
  $('#openCompareFromArchive').addEventListener('click', openCompareModal);
  $('#openCompare').addEventListener('click', openCompareModal);
  $('#clearCompare').addEventListener('click', clearCompareSelection);
  $('#closeCompareModal').addEventListener('click', closeCompareModal);
  $('#compareModal').addEventListener('click', (event) => { if (event.target === $('#compareModal')) closeCompareModal(); });
  $('#compareGoMap').addEventListener('click', () => { closeCompareModal(); setView('map'); });
  $('#exportVisits').addEventListener('click', backupVisits);
  $('#backupVisits').addEventListener('click', backupVisits);
  $('#restoreVisits').addEventListener('change', (event) => restoreVisits(event.target.files?.[0]));

  $('#closeVisitModal').addEventListener('click', closeVisitModal);
  $('#visitModal').addEventListener('click', (event) => { if (event.target === $('#visitModal')) closeVisitModal(); });
  $('#visitForm').addEventListener('submit', saveVisitFromForm);
  $('#deleteVisit').addEventListener('click', deleteCurrentVisit);
  $('#geocodeVisitAddress').addEventListener('click', geocodeIntoVisitForm);
  $('#visitAddress').addEventListener('input', () => {
    visitAddressSearchToken += 1;
    $('#visitAddressResults').hidden = true;
    $('#visitAddressResults').replaceChildren();
    if (!$('#visitLat').value || !$('#visitLng').value) return;
    $('#visitLat').value = '';
    $('#visitLng').value = '';
    $('#coordinateStatus').textContent = '주소가 바뀌었어요. 주소·단지 찾기 또는 지도에서 위치 지정을 해주세요.';
  });
  $('#visitAddress').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    geocodeIntoVisitForm();
  });
  $('#pickVisitOnMap').addEventListener('click', startPinMode);
  $('#cancelPinMode').addEventListener('click', cancelPinMode);
  $('#recordMapCenter').addEventListener('click', openAtMapCenter);
  $('#mapSearchForm').addEventListener('submit', searchMap);
  $('#mapSearchInput').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    searchMap(event);
  });
  $('#mapSearchInput').addEventListener('input', () => {
    mapSearchToken += 1;
    $('#mapSearchResults').classList.remove('show');
  });
  $('#toggleMobileFilters').addEventListener('click', () => {
    setMapPanel($('.property-workspace').classList.contains('filters-open') ? '' : 'filters');
  });
  $('#toggleMapResults').addEventListener('click', () => {
    setMapPanel($('.property-workspace').classList.contains('results-open') ? '' : 'results');
  });
  $('#closeMobileFilters').addEventListener('click', () => setMapPanel('', { restoreFocus: true }));
  $('#closeMapResults').addEventListener('click', () => setMapPanel('', { restoreFocus: true }));
  $('#mobileFilterBackdrop').addEventListener('click', () => setMapPanel('', { restoreFocus: true }));
  $('#moveCurrentLocation').addEventListener('click', moveToCurrentLocation);

  $$('[data-market-tab]').forEach((button, index, buttons) => {
    button.addEventListener('click', () => setMarketPanel(button.dataset.marketTab));
    button.addEventListener('keydown', (event) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      setMarketPanel(buttons[nextIndex].dataset.marketTab, { focus: true });
    });
  });
  setMarketPanel(state.marketPanel);
  ['marketRegion', 'marketDealType', 'marketAreaBand', 'marketUnit'].forEach((id) => $(`#${id}`).addEventListener('change', renderMarket));
  $('#marketCsvInput').addEventListener('change', (event) => importMarketCsv(event.target.files?.[0]));
  $('#refreshMarketFile').addEventListener('click', async () => {
    await clearImportedMarket();
    await loadMarketSummary(true);
    showToast('직접 가져온 CSV를 지우고 최신 배포 데이터를 읽었습니다.');
  });
  $('#complexSearchForm').addEventListener('submit', (event) => {
    state.marketIntentToken += 1;
    searchComplexMarket(event);
  });
  $('#complexSearchInput').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    state.marketIntentToken += 1;
    searchComplexMarket(event);
  });
  const invalidateComplexSearch = () => {
    window.clearTimeout(complexSuggestionTimer);
    complexSuggestionTimer = null;
    complexSuggestionToken += 1;
    state.marketIntentToken += 1;
    state.complexRequestToken += 1;
    state.complexAbortController?.abort();
    state.complexAbortController = null;
    state.pendingComplexPreference = null;
    state.marketContextVisit = null;
    state.complexErrorCode = '';
    state.complexDemoMode = false;
    state.complexRecords = [];
    state.complexMeta = null;
    finishComplexLoading();
    $('.complex-search-card')?.classList.remove('has-result', 'is-searching');
    $('#complexHistoryCard').hidden = true;
    $('#visitDealGap').hidden = true;
    destroyChart('complex');
    hideComplexSuggestions();
    $('#relatedComplexes').hidden = true;
    $('#relatedComplexes').replaceChildren();
    setComplexStatus('');
    renderMarket();
  };
  const previewComplexSuggestions = () => {
    const query = $('#complexSearchInput').value.trim();
    if (normalizeApartmentSearchText(query).length < 2) return;
    complexSuggestionTimer = window.setTimeout(() => {
      showCatalogSuggestions(query, { announceEmpty: false }).catch(() => {
        setComplexStatus('서울·경기 단지 목록을 읽지 못했어요. 잠시 후 다시 시도해주세요.', true);
      });
    }, 260);
  };
  $('#complexSearchInput').addEventListener('input', () => {
    invalidateComplexSearch();
    previewComplexSuggestions();
  });
  $('#complexRegion').addEventListener('change', () => {
    invalidateComplexSearch();
    previewComplexSuggestions();
  });
  $$('[data-complex-example]').forEach((button) => button.addEventListener('click', () => {
    $('#complexRegion').value = '';
    $('#complexSearchInput').value = button.dataset.complexExample || button.textContent.trim();
    invalidateComplexSearch();
    setComplexStatus('서울·경기 공식 단지 후보를 찾고 있어요.');
    showCatalogSuggestions($('#complexSearchInput').value, { announceEmpty: true }).then((matches) => {
      if (matches.length) setComplexStatus(`공식 단지 후보 상위 ${matches.length}개를 찾았어요. 원하는 단지를 선택해주세요.`);
    }).catch(() => setComplexStatus('서울·경기 단지 목록을 읽지 못했어요. 잠시 후 다시 시도해주세요.', true));
  }));
  $('#complexRetrySearch').addEventListener('click', () => {
    const meta = state.complexMeta;
    if (!meta) return;
    $('#complexSearchInput').value = meta.catalogCandidate?.name || meta.query || $('#complexSearchInput').value;
    const retryCandidate = meta.catalogCandidate || {
      name: meta.query, address: meta.address, regionCode: meta.region?.code || '', aptSeq: meta.aptSeq || '', dong: meta.dong || '',
    };
    searchComplexMarket(null, retryCandidate);
  });
  $('#complexTryDemo').addEventListener('click', startComplexInteractionDemo);
  $('#complexOpenConnections').addEventListener('click', () => {
    setView('connections');
    window.setTimeout(() => $('#molitConnectionCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  });
  $('#complexDealType').addEventListener('change', () => {
    if (!$('#complexLoadingState').hidden) {
      $('#complexHistoryTitle').textContent = `${state.complexMeta?.query || $('#complexSearchInput').value.trim()} · ${$('#complexDealType').value}`;
      updateComplexLoading(state.complexLoadingStage, { filterNote: '거래 유형 변경을 결과에 반영합니다' });
      return;
    }
    populateComplexAreas();
    renderComplexHistory();
  });
  $('#complexAreaBand').addEventListener('change', () => {
    if (!$('#complexLoadingState').hidden) {
      updateComplexLoading(state.complexLoadingStage, { filterNote: '면적 변경을 결과에 반영합니다' });
      return;
    }
    renderComplexHistory();
  });
  $('#complexHistoryMonths').addEventListener('change', () => {
    const selectedArea = Number($('#complexAreaBand').value);
    if (Number.isFinite(selectedArea) && selectedArea > 0) {
      state.pendingComplexPreference = {
        dealType: $('#complexDealType').value,
        areaM2: selectedArea,
      };
    }
    state.complexHistoryMonths = Math.max(12, Math.min(60, Number($('#complexHistoryMonths').value) || 60));
    const meta = state.complexMeta;
    if (!meta) return;
    if (!$('#complexLoadingState').hidden) {
      updateComplexLoading('catalog', {
        message: `${historyPeriodLabel(state.complexHistoryMonths)}로 바꾸고 조회를 다시 시작합니다.`,
        filterNote: '기간 변경으로 다시 조회 중',
      });
    }
    const candidate = state.complexLoadingCandidate || meta.catalogCandidate || (meta.region ? {
      name: meta.query, address: meta.address, regionCode: meta.region?.code || '', aptSeq: meta.aptSeq || '', dong: meta.dong || '',
    } : null);
    searchComplexMarket(null, candidate);
  });
  $('#showAllTransactions').addEventListener('click', () => {
    state.transactionsExpanded = !state.transactionsExpanded;
    renderMarket();
  });

  $('#openApiGuide').addEventListener('click', openApiGuide);
  $$('[data-close-api-guide]').forEach((button) => button.addEventListener('click', closeApiGuide));
  $('#apiGuideModal').addEventListener('click', (event) => { if (event.target === $('#apiGuideModal')) closeApiGuide(); });
  $('#openLocalKeySetup').addEventListener('click', openLocalKeyModal);
  $$('[data-open-local-key]').forEach((button) => button.addEventListener('click', openLocalKeyModal));
  $$('[data-close-local-key]').forEach((button) => button.addEventListener('click', closeLocalKeyModal));
  $('#localKeyModal').addEventListener('click', (event) => { if (event.target === $('#localKeyModal')) closeLocalKeyModal(); });
  $('#localKeyForm').addEventListener('submit', connectLocalMarketKey);
  $('#companyLocationSearchForm').addEventListener('submit', searchCompanyLocations);
  $('#companyLocationSearch').addEventListener('input', () => {
    companyPickerSearchToken += 1;
    companyPickerClickToken += 1;
    closeCompanyPostcodeSearch({ rearm: false, restoreFocus: false });
    $('#companyLocationSearchResults').hidden = true;
    state.companyPickerSelection = null;
    companyPickerMap.clearSearchLocation();
    renderCompanyPickerSelection();
    armCompanyPickerMap();
  });
  $$('[data-close-company-location]').forEach((button) => button.addEventListener('click', closeCompanyLocationModal));
  $('#companyLocationModal').addEventListener('click', (event) => { if (event.target === $('#companyLocationModal')) closeCompanyLocationModal(); });
  $('#useCompanyPostcodeSearch').addEventListener('click', async () => {
    companyPickerClickToken += 1;
    const token = ++companyPickerSearchToken;
    state.companyPickerSelection = null;
    renderCompanyPickerSelection();
    const opened = await openCompanyPostcodeSearch($('#companyLocationSearch').value, token);
    if (!opened && token === companyPickerSearchToken) armCompanyPickerMap();
  });
  $('#closeCompanyPostcode').addEventListener('click', () => closeCompanyPostcodeSearch());
  $('#openPlaceSearchSettings').addEventListener('click', () => {
    closeCompanyLocationModal();
    window.setTimeout(() => {
      openLocalKeyModal({ focusSelector: '#localNaverPlaceClientId' });
      $('#placeSearchKeyDetails').open = true;
    }, 80);
  });
  $('#applyCompanyLocation').addEventListener('click', applyCompanyPickerLocation);
  document.addEventListener('keydown', (event) => {
    const postcodePanel = $('#companyPostcodePanel');
    if (event.key === 'Tab' && postcodePanel && !postcodePanel.hidden) {
      trapModalFocus(event, postcodePanel);
      return;
    }
    if (event.key === 'Escape' && postcodePanel && !postcodePanel.hidden) {
      event.preventDefault();
      closeCompanyPostcodeSearch();
      return;
    }
    const openModal = MODAL_IDS.map((id) => $(`#${id}`)).find((modal) => modal && !modal.hidden);
    if (event.key === 'Tab' && openModal) {
      trapModalFocus(event, openModal);
      return;
    }
    if (event.key !== 'Escape') return;
    if (!$('#visitModal').hidden) closeVisitModal();
    if (!$('#compareModal').hidden) closeCompareModal();
    if (!$('#apiGuideModal').hidden) closeApiGuide();
    if (!$('#localKeyModal').hidden) closeLocalKeyModal();
    if (!$('#companyLocationModal').hidden) closeCompanyLocationModal();
    if (!$('#supplyAlertModal').hidden) closeSupplyAlertModal();
    if (!$('#supplyMatchModal').hidden) closeSupplyMatchModal();
    if (!$('#pinModeBanner').hidden) cancelPinMode();
    setMapPanel('', { restoreFocus: true });
    setRecommendationPanel('', { restoreFocus: true });
  });
}

async function init() {
  chartDefaults();
  setMapPanel('');
  setRecommendationPanel('');
  populateRegionControls();
  await populateComplexRegions();
  restoreRecommendationForm();
  renderAllVisits();
  renderRecentComplexes();
  renderSupplyUnreadBadge();
  populateSubscriptionProfileForm();
  renderSubscriptionProfile();
  renderSupplyMatchSummary();
  await checkLocalMarketConnection();
  refreshShortlistCommuteFreshness();
  if (state.shortlist.length) {
    state.recommendationShowingShortlist = true;
    renderRecommendationResults();
  }
  bindEvents();
  await loadMarketSummary();
  loadApartmentCatalogMeta();

  try {
    await homeMap.init($('#homeMap'), {
      onSelect: (id) => selectVisit(id, false),
      onReady: () => {
        setMapConnection(true);
        homeMap.setRecords(state.filteredVisits);
        checkNaverReverseConnection();
      },
      onError: (error) => setMapConnection(false, error.message),
    });
  } catch (error) {
    $('#homeMap').replaceChildren(createElement('div', 'map-search-message', '네이버 지도를 불러오지 못했습니다. Dynamic Map과 Web 서비스 URL을 확인해주세요.'));
  }

  const savedView = localStorage.getItem('homehunt_view_v1') || 'recommend';
  setView(savedView, false);
  if (savedView !== 'supply') window.setTimeout(() => ensureSupplyFeed(), 450);
}

init();
