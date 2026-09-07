import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalizedScoreCard, createParkingEditor, parkingForCandidate } from '../js/controllers/personalized-recommendation-ui.js';
import { rankPersonalizedCandidates } from '../js/personalized-ranking-core.mjs';
import { normalizeKakaoPublicTransit } from '../scripts/commute-provider.mjs';

// Only the DOM operations used by the renderer are modeled. The recommendation
// states and input event handlers are the production implementations.
class Element extends EventTarget {
  constructor(tag) {
    super(); this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {};
    this.attributes = new Map(); this.value = ''; this.ownText = '';
  }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  all(tag) { return this.children.flatMap(child => [...(child.tagName === tag.toUpperCase() ? [child] : []), ...child.all(tag)]); }
}

function browserFixture(t) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const stored = new Map();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: tag => new Element(tag) } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)),
  } });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage); else delete globalThis.localStorage;
  });
  return stored;
}

const destinations = [{ id: 'office', label: '회사', lat: 37.55, lng: 127, weightPercent: 100, maxMinutes: 180 }];
const options = { destinations, targetPriceManWon: 70000, maxOverBudgetPct: 10, currentYear: 2026 };
const house = () => ({ catalogId: 'house', name: '시험 단지', address: '서울특별시 서초구',
  households: 1000, builtYear: 2020, bestArea: { averagePriceManWon: 70000, count: 3 } });
const route = (durationMinutes, extras = {}) => ({ mode: 'transit', verified: true, durationMinutes,
  walkingMinutes: 0, transferCount: 0, transitComposition: 'subway', ...extras });
const ranked = (candidate, overrides = {}) => rankPersonalizedCandidates([candidate], { ...options, ...overrides })[0];
function displayedDimensions(card) {
  const nodes = card.all('dl')[0].children;
  return Object.fromEntries(nodes.filter((_, index) => index % 2 === 0).map((label, index) => [label.ownText, nodes[index * 2 + 1]]));
}

test('missing commute, station and parking evidence renders held scores instead of numerical zero', t => {
  browserFixture(t);
  const candidate = ranked(house());
  assert.equal(candidate.personalizedRecommendation.score, null);
  const card = createPersonalizedScoreCard(candidate);
  const dimensions = displayedDimensions(card);
  for (const key of ['회사 통근', '역 접근', '주차']) {
    assert.equal(dimensions[key].textContent, '미확인 · 점수 보류');
    assert.equal(dimensions[key].dataset.status, 'unknown');
    assert.doesNotMatch(dimensions[key].textContent, /0\.0|0점/);
  }
  assert.equal(card.all('strong')[0].textContent, '추천 총점 보류');
  assert.match(card.children[0].textContent, /통근 미반영 · 생활·예산 참고 [\d.]+ \/ 45점/);
  assert.match(dimensions['단지 규모'].textContent, /^4\.5 \/ 5점$/);
});

test('verified zero-point commute, distant station and explicit zero parking remain numerical scores', t => {
  browserFixture(t);
  const candidate = ranked({ ...house(), lat: 37.5, lng: 127, routesByDestination: { office: route(120) },
    parkingEvidence: { sourceType: 'field', status: 'provided', spacesPerHousehold: 0 } },
  { stations: [{ id: 'station', name: '공식 역', lat: 37.53, lng: 127 }], requireParking: false });
  assert.equal(candidate.personalizedRecommendation.decision, 'matched');
  const dimensions = displayedDimensions(createPersonalizedScoreCard(candidate));
  for (const [key, max] of [['회사 통근', 55], ['역 접근', 10], ['주차', 10]]) {
    assert.equal(dimensions[key].textContent, `0.0 / ${max}점`);
    assert.equal(dimensions[key].dataset.status, 'known');
  }
});

test('a price-only pending reason does not falsely say that the observed commute is unverified', t => {
  browserFixture(t);
  const candidate = house();
  delete candidate.bestArea;
  candidate.routesByDestination = { office: route(40) };
  const card = createPersonalizedScoreCard(ranked(candidate));
  assert.equal(card.all('strong')[0].textContent, '추천 총점 보류');
  assert.doesNotMatch(card.all('strong')[0].textContent, /통근 확인 전/);
  assert.equal(displayedDimensions(card)['회사 통근'].dataset.status, 'known');
  assert.equal(displayedDimensions(card)['목표가격'].dataset.status, 'unknown');
});

test('when all noncommute facts are unknown even the reference zero is withheld', t => {
  browserFixture(t);
  const candidate = ranked({ catalogId: 'empty', name: '근거 없는 단지' });
  assert.equal(candidate.personalizedRecommendation.referenceScore, 0);
  const card = createPersonalizedScoreCard(candidate);
  assert.match(card.children[0].textContent, /통근 미반영 · 생활·예산 근거 확인 전/);
  assert.doesNotMatch(card.children[0].textContent, /0\.0|0점/);
  assert.ok(Object.values(displayedDimensions(card)).every(node => node.dataset.status === 'unknown'));
});

test('known travel time with missing walking and transfers keeps those facts and the commute score unknown', t => {
  browserFixture(t);
  const candidate = ranked({ ...house(), routesByDestination: { office: {
    mode: 'transit', verified: true, durationMinutes: 40, transitComposition: 'subway',
  } } });
  const card = createPersonalizedScoreCard(candidate, { detailed: true });
  assert.equal(displayedDimensions(card)['회사 통근'].textContent, '미확인 · 점수 보류');
  const row = card.children.find(node => node.className === 'personalized-route-row');
  assert.match(row.textContent, /40분 \/ 180분 제한 · 초과 시 제외/);
  assert.match(row.textContent, /환승 미확인 · 도보 미확인/);
  assert.doesNotMatch(row.textContent, /환승 0회|도보 0분/);
});

test('Kakao omitted walking steps remain unknown from provider parsing through ranking and detailed UI', t => {
  browserFixture(t);
  const normalized = normalizeKakaoPublicTransit({ status: 'OK', routes: [{
    properties: { totalTime: 3180, transfers: 0, type: 'BUS' },
    steps: [{ properties: { type: 'BUS', time: 1860, distance: 12000 } }],
  }] });
  const candidate = ranked({ ...house(), routesByDestination: { office: normalized } });
  const ranking = candidate.personalizedRecommendation;
  assert.equal(ranking.commuteBalance.decision, 'matched', 'Known journey time still satisfies its time limit');
  assert.equal(ranking.commuteBalance.weightedMeanMinutes, 53);
  assert.equal(ranking.commuteBalance.weightedMeanWalkingMinutes, null);
  assert.equal(ranking.commuteBalance.costCoverageComplete, false);
  assert.equal(ranking.weightedCostMinutes, null);
  assert.equal(ranking.decision, 'pending');
  assert.equal(ranking.confirmed, false);
  assert.equal(ranking.score, null);
  assert.ok(ranking.unknowns.some(text => text.includes('도보시간 미확인')));
  const card = createPersonalizedScoreCard(candidate, { detailed: true });
  assert.equal(card.all('strong')[0].textContent, '추천 총점 보류');
  assert.equal(displayedDimensions(card)['회사 통근'].textContent, '미확인 · 점수 보류');
  assert.match(card.children[0].textContent, /통근 미반영 · 생활·예산 참고/);
  const row = card.children.find(node => node.className === 'personalized-route-row');
  assert.match(row.textContent, /53분.*환승 0회 · 도보 미확인/);
  assert.match(row.textContent, /버스 31분/);
  assert.doesNotMatch(row.textContent, /도보 0분|도보 22분/);
});

test('explicit Kakao zero walking remains a confirmed fact through ranking and the UI', t => {
  browserFixture(t);
  const normalized = normalizeKakaoPublicTransit({ status: 'OK', routes: [{
    properties: { totalTime: 1860, transfers: 0, type: 'BUS' },
    steps: [{ properties: { type: 'BUS', time: 1860, distance: 12000 } },
      { properties: { type: 'WALKING', time: 0, distance: 0 } }],
  }] });
  const candidate = ranked({ ...house(), routesByDestination: { office: normalized } });
  const ranking = candidate.personalizedRecommendation;
  assert.equal(ranking.decision, 'matched');
  assert.equal(ranking.commuteBalance.costCoverageComplete, true);
  assert.equal(ranking.commuteBalance.weightedMeanWalkingMinutes, 0);
  assert.equal(ranking.weightedCostMinutes, 38.75, 'Bus preference penalty remains distinct from the 31-minute journey');
  assert.ok(Number.isFinite(ranking.score));
  const card = createPersonalizedScoreCard(candidate, { detailed: true });
  assert.equal(displayedDimensions(card)['회사 통근'].dataset.status, 'known');
  const row = card.children.find(node => node.className === 'personalized-route-row');
  assert.match(row.textContent, /31분.*환승 0회 · 도보 0분/);
});

const mixedTimeConditions = [
  { id: 'bundang', label: '분당', weightPercent: 50, required: true },
  { id: 'pangyo', label: '판교', weightPercent: 40, required: true },
  { id: 'gwanghwamun', label: '광화문', weightPercent: 10, required: false },
].map(destination => ({ ...destination, lat: 37.55, lng: 127, maxMinutes: 60, modes: ['transit'] }));
const mixedRoutes = () => ({ bundang: route(30), pangyo: route(20), gwanghwamun: route(90) });

test('a 10-percent soft company above its target remains scored and each route distinguishes target from exclusion limit', t => {
  browserFixture(t);
  const candidate = ranked({ ...house(), routesByDestination: mixedRoutes() }, { destinations: mixedTimeConditions });
  const ranking = candidate.personalizedRecommendation;
  assert.equal(ranking.decision, 'matched');
  assert.equal(ranking.commuteBalance.weightedMeanMinutes, 32, 'The 90-minute company still contributes its full 10-percent weight');
  assert.ok(Number.isFinite(ranking.score));
  const card = createPersonalizedScoreCard(candidate, { detailed: true });
  const rows = card.children.filter(node => node.className === 'personalized-route-row');
  assert.match(rows[0].textContent, /분당 · 50\.0%.*30분 \/ 60분 제한 · 초과 시 제외/);
  assert.match(rows[1].textContent, /판교 · 40\.0%.*20분 \/ 60분 제한 · 초과 시 제외/);
  assert.match(rows[2].textContent, /광화문 · 10\.0%.*90분 \/ 60분 목표 · 초과는 점수에만 반영/);
  assert.doesNotMatch(rows[2].textContent, /초과 시 제외|60분 제한/);
  assert.match(card.textContent, /시간 초과로 제외하는 것은 제한을 설정한 회사뿐/);
  assert.equal(displayedDimensions(card)['회사 통근'].dataset.status, 'known');
});

test('changing the same 10-percent company to a required limit displays its actual exclusion', t => {
  browserFixture(t);
  const candidate = ranked({ ...house(), routesByDestination: mixedRoutes() }, {
    destinations: mixedTimeConditions.map(destination => ({ ...destination, required: true })),
  });
  assert.equal(candidate.personalizedRecommendation.decision, 'excluded');
  const card = createPersonalizedScoreCard(candidate, { detailed: true });
  assert.equal(card.all('strong')[0].textContent, '우리 조건에서 제외');
  const row = card.children.filter(node => node.className === 'personalized-route-row')[2];
  assert.match(row.textContent, /90분 \/ 60분 제한 · 초과 시 제외/);
  assert.doesNotMatch(row.textContent, /목표 · 초과는 점수에만 반영/);
});

test('an unmeasured soft company keeps its journey facts and score pending instead of inserting zero', t => {
  browserFixture(t);
  const routesByDestination = mixedRoutes();
  delete routesByDestination.gwanghwamun;
  const candidate = ranked({ ...house(), routesByDestination }, { destinations: mixedTimeConditions });
  assert.equal(candidate.personalizedRecommendation.decision, 'pending');
  assert.equal(candidate.personalizedRecommendation.score, null);
  const card = createPersonalizedScoreCard(candidate, { detailed: true });
  assert.equal(card.all('strong')[0].textContent, '추천 총점 보류');
  assert.equal(displayedDimensions(card)['회사 통근'].textContent, '미확인 · 점수 보류');
  const row = card.children.filter(node => node.className === 'personalized-route-row')[2];
  assert.match(row.textContent, /미확인 \/ 60분 목표 · 초과는 점수에만 반영/);
  assert.match(row.textContent, /환승 미확인 · 도보 미확인/);
  assert.match(row.textContent, /지하철 미확인 · 버스 미확인/);
  assert.doesNotMatch(row.textContent, /(?:^|[^\d])0분|환승 0회/);
  assert.doesNotMatch(card.textContent, /비중 반영 평균/);
});

test('parking starts blank, stores an explicitly entered zero as evidence, and returns to unknown after deletion', t => {
  browserFixture(t);
  const candidate = house(); let changed = 0;
  const editor = createParkingEditor(candidate, () => { changed += 1; });
  assert.equal(editor.all('input')[0].value, '');
  assert.match(editor.all('summary')[0].textContent, /주차 정보 미확인/);
  assert.match(editor.textContent, /공식 주차정보 자동 연결 전.*직접 확인한 값/);
  editor.all('input')[0].value = '0'; editor.all('input')[1].value = '2025-01-01';
  editor.all('form')[0].dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(changed, 1);
  assert.equal(parkingForCandidate(candidate).spacesPerHousehold, 0);
  const saved = createParkingEditor(candidate, () => { changed += 1; });
  assert.match(saved.all('summary')[0].textContent, /세대당 0대 · 사용자 확인/);
  assert.equal(saved.all('input')[0].value, '0');
  saved.all('button').find(node => node.type === 'button').dispatchEvent(new Event('click'));
  assert.equal(changed, 2);
  assert.equal(parkingForCandidate(candidate).spacesPerHousehold, null);
  assert.match(createParkingEditor(candidate, () => {}).all('summary')[0].textContent, /주차 정보 미확인/);
});

test('blank parking input cannot silently become a saved zero-parking fact', t => {
  browserFixture(t);
  let changed = 0;
  const candidate = house();
  const editor = createParkingEditor(candidate, () => { changed += 1; });
  editor.all('input')[1].value = '2025-01-01';
  editor.all('form')[0].dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(changed, 0);
  assert.equal(parkingForCandidate(candidate).spacesPerHousehold, null);
  assert.match(editor.textContent, /주차대수를 0 이상의 숫자로 입력/);
});
