import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficialComplexPanel, officialComplexPanelModel } from '../js/controllers/official-complex-panel.js';
import { matchedOfficialComplexInfo, officialComplexEvidence } from '../providers/official/complex.mjs';
import { createParkingEditor, parkingForCandidate } from '../js/controllers/personalized-recommendation-ui.js';
import { normalizeOfficialComplexInfo } from '../js/official-complex-client.mjs';
import { createCandidateReview } from '../js/controllers/candidate-review.js';

const candidate = () => ({ catalogId: 'REB-test', households: 300, name: '시험 단지' });
const detail = (overrides = {}) => ({
  schemaVersion: 1, provider: 'kapt', status: 'matched', catalogId: 'REB-test',
  kaptCode: 'A-test', complexMatchConfirmed: true, observedAt: '2026-09-08T00:00:00Z',
  households: 300, buildingCount: 4, heatingType: '지역난방', elevatorCount: 0,
  highestFloor: 25, approvalDate: '2001-06-01',
  parking: { aboveGroundSpaces: 100, belowGroundSpaces: 282, totalSpaces: 382, spacesPerHousehold: 382 / 300 },
  parkingEvidence: { sourceType: 'official', complexMatchConfirmed: true,
    totalSpaces: 382, households: 300, sourceUrl: 'https://www.data.go.kr/data/15058453/openapi.do',
    observedAt: '2026-09-08T00:00:00Z' },
  errors: [], cache: { hit: false }, ...overrides,
});

class Element extends EventTarget {
  constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = new Map(); this.ownText = '';
    this.className = ''; this.classList = { add: value => { this.className = `${this.className} ${value}`.trim(); } };
  }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.ownText = ''; this.children = nodes; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  all(tag) { return this.children.flatMap(child => [...(child.tagName === tag.toUpperCase() ? [child] : []), ...child.all(tag)]); }
}
function browserFixture(t) {
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const stored = new Map();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: tag => new Element(tag) } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)),
  } });
  t.after(() => {
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else delete globalThis.document;
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else delete globalThis.localStorage;
  });
  return stored;
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('official detail presents an actual zero elevator count and a rounded calculated parking ratio', () => {
  const model = officialComplexPanelModel(candidate(), detail());
  assert.equal(model.headline, '세대당 1.27대');
  const fields = Object.fromEntries(model.fields);
  assert.equal(fields['전체 주차'], '382대');
  assert.equal(fields['지상 / 지하'], '100대 / 282대');
  assert.equal(fields['승강기'], '0대');
  assert.equal(fields['난방'], '지역난방');
});

test('partial detail does not coerce missing parking or elevator data to zero', () => {
  const info = detail({ status: 'partial', elevatorCount: null, parking: { aboveGroundSpaces: null, belowGroundSpaces: 0 } });
  const model = officialComplexPanelModel(candidate(), info);
  const fields = Object.fromEntries(model.fields);
  assert.equal(model.status, 'partial');
  assert.equal(model.headline, '세대당 주차 미확인');
  assert.equal(fields['전체 주차'], '미제공');
  assert.equal(fields['지상 / 지하'], '미제공 / 0대');
  assert.equal(fields['승강기'], '미제공');
  assert.equal(fields['난방'], '지역난방');
});

test('reported zero spaces in both parking areas stays a known zero', () => {
  const model = officialComplexPanelModel(candidate(), detail({ parking: { aboveGroundSpaces: 0, belowGroundSpaces: 0 } }));
  assert.equal(model.headline, '세대당 0대');
  assert.equal(model.parkingTotal, '0대');
});

test('unknown household count prevents a parking ratio even when spaces exist', () => {
  const model = officialComplexPanelModel(candidate(), detail({ households: null }));
  assert.equal(model.headline, '세대당 주차 미확인');
  assert.equal(model.parkingTotal, '382대');
});

test('unconfirmed, ambiguous and mismatched catalog identities cannot show official property values', () => {
  for (const info of [detail({ complexMatchConfirmed: false }), detail({ status: 'ambiguous' }), detail({ catalogId: 'other' }), detail({ kaptCode: '' }), detail({ provider: 'other' })]) {
    assert.equal(matchedOfficialComplexInfo({ ...candidate(), officialComplexInfo: info }), null);
    assert.equal(officialComplexPanelModel(candidate(), info).matched, false);
    assert.deepEqual(officialComplexPanelModel(candidate(), info).fields, []);
    const fields = officialComplexEvidence({ ...candidate(), officialComplexInfo: info });
    for (const id of ['parking', 'heating', 'elevators']) assert.equal(fields.find(field => field.id === id).value, null);
  }
});

test('combined-phase official data render an explanation without parking or elevator quantities', t => {
  browserFixture(t);
  const raw = detail({ status: 'unmatched', complexMatchConfirmed: false, matchIssue: 'combined-complex',
    relatedComplex: { kaptCode: 'A1234567', name: '가상그린빌1,2단지', scope: 'combined-phases', phases: [1, 2],
      parking: { totalSpaces: 99999, spacesPerHousehold: 99 }, elevatorCount: 99999 },
  });
  const info = normalizeOfficialComplexInfo(raw, candidate().catalogId);
  const record = { ...candidate(), officialComplexInfo: info };
  const model = officialComplexPanelModel(record);
  assert.equal(model.matched, false); assert.deepEqual(model.fields, []);
  assert.match(model.title, /여러 단지가 통합 등록/);
  assert.match(model.explanation, /이 단지만의 주차·승강기로 사용하지 않았/);
  assert.match(model.explanation, /공식 목록 이름: 가상그린빌1,2단지/);
  const panel = createOfficialComplexPanel(record);
  assert.equal(panel.all('dl').length, 0);
  assert.doesNotMatch(panel.textContent, /99999|세대당 99|승강기0대/);
  assert.match(panel.textContent, /통합 등록/);
  for (const field of officialComplexEvidence(record).filter(field => ['parking', 'heating', 'elevators'].includes(field.id))) {
    assert.equal(field.tier, 'unknown'); assert.equal(field.value, null);
  }
});

test('candidate cards display combined-match reasons while keeping facilities unknown and personal parking intact', t => {
  const stored = browserFixture(t);
  const page = new Element('main');
  document.getElementById = id => id === 'candidateReviewPage' ? page : null;
  const info = normalizeOfficialComplexInfo(detail({ status: 'unmatched', complexMatchConfirmed: false, matchIssue: 'combined-complex',
    relatedComplex: { kaptCode: 'A1234567', name: '가상그린빌1,2단지', scope: 'combined-phases', phases: [1, 2] },
  }), candidate().catalogId);
  const house = { ...candidate(), officialComplexInfo: info, parkingEvidence: info.parkingEvidence,
    bestArea: { averagePriceManWon: 60000, count: 3, areaM2: 59 } };
  const view = createCandidateReview({ state: () => ({ results: [], shortlist: [house] }),
    decision: () => 'pending', verification: () => null, conditions: () => 'same', findMore() {} });
  view.open('saved');
  let card = page.all('article')[0];
  assert.match(card.textContent, /통합 단지 자료 · 개별 확인 필요/);
  assert.match(card.textContent, /여러 단지가 합쳐진 공식 자료.*주차·승강기로 사용하지 않았/);
  assert.match(card.textContent, /주차미확인난방미확인승강기미확인/);
  stored.set('homehunt_parking_observations_v1', JSON.stringify({ 'REB-test': { sourceType: 'field', spacesPerHousehold: 1.25 } }));
  view.render(); card = page.all('article')[0];
  assert.match(card.textContent, /주차세대당 1.25대 · 사용자 확인/);
  assert.match(card.textContent, /난방미확인승강기미확인/);
  assert.match(card.textContent, /여러 단지가 합쳐진 공식 자료/);
});

test('official evidence uses K-apt source and lookup time separately from catalogue publication date', () => {
  const info = detail();
  const fields = officialComplexEvidence({ ...candidate(), officialComplexInfo: info });
  const parking = fields.find(field => field.id === 'parking');
  assert.equal(parking.value, 382);
  assert.equal(parking.sourceKind, 'k-apt');
  assert.equal(parking.sourceUrl, 'https://www.data.go.kr/data/15058453/openapi.do');
  assert.equal(parking.fetchedAt, info.observedAt);
  assert.equal(parking.observedAt, null);
  assert.equal(fields.find(field => field.id === 'elevators').value, 0);
  assert.equal(fields.find(field => field.id === 'households').observedAt, null);
  assert.equal(fields.find(field => field.id === 'households').fetchedAt, info.observedAt);
});

test('available K-apt households, buildings and approval year replace dated catalog evidence independently', () => {
  const record = { ...candidate(), households: 200, buildings: 3, builtYear: 2000, officialComplexInfo: detail() };
  const fields = Object.fromEntries(officialComplexEvidence(record).map(field => [field.id, field]));
  assert.equal(fields.households.value, 300);
  assert.equal(fields.buildings.value, 4);
  assert.equal(fields.builtYear.value, 2001);
  for (const id of ['households', 'buildings', 'builtYear']) assert.equal(fields[id].sourceKind, 'k-apt');
  assert.equal(fields.builtYear.label, '사용승인연도');
  assert.match(fields.builtYear.note, /2001-06-01/);
  const partial = Object.fromEntries(officialComplexEvidence({ ...record,
    officialComplexInfo: detail({ status: 'partial', households: null, approvalDate: null }),
  }).map(field => [field.id, field]));
  assert.equal(partial.buildings.value, 4);
  assert.equal(partial.buildings.sourceKind, 'k-apt');
  assert.equal(partial.households.value, 200);
  assert.equal(partial.households.sourceKind, 'official-catalog');
  assert.equal(partial.builtYear.value, 2000);
  assert.equal(partial.builtYear.sourceKind, 'official-catalog');
  assert.equal(partial.builtYear.observedAt, '2025-09-18');
});

test('invalid official approval date does not overwrite a known catalog year', () => {
  const fields = officialComplexEvidence({ ...candidate(), builtYear: 2000, officialComplexInfo: detail({ approvalDate: '2001-02-31' }) });
  const year = fields.find(field => field.id === 'builtYear');
  assert.equal(year.value, 2000);
  assert.equal(year.sourceKind, 'official-catalog');
});

test('charger counts distinguish zero and missing while long facilities remain expandable text', t => {
  browserFixture(t);
  const info = detail({ groundEvChargers: 0, undergroundEvChargers: null, welfareFacilities: '관리사무소, 경로당, 어린이놀이터, 주민공동시설\n<script>text only</script>' });
  const model = officialComplexPanelModel(candidate(), info);
  const fields = Object.fromEntries(model.fields);
  assert.equal(fields['지상 전기차 충전기'], '0기');
  assert.equal(fields['지하 전기차 충전기'], '미제공');
  const root = createOfficialComplexPanel({ ...candidate(), officialComplexInfo: info });
  const facilities = root.all('details')[0];
  assert.equal(facilities.open, undefined);
  assert.equal(facilities.all('summary')[0].textContent, '공용시설 · 목록 보기');
  assert.equal(facilities.all('p')[0].textContent, info.welfareFacilities);
  assert.equal(root.all('script').length, 0);
});

test('authentication failure gives actionable approval guidance without exposing raw errors', () => {
  const model = officialComplexPanelModel(candidate(), { status: 'unavailable', errors: [{ code: 'KAPT_PERMISSION_DENIED', message: 'SECRET upstream URL' }] });
  assert.match(model.title, /활용승인·인증키/);
  assert.match(model.explanation, /기존 후보와 통근 결과는 유지/);
  assert.doesNotMatch(JSON.stringify(model), /SECRET/);
});

test('opening supported detail loads once and updates only its public-information panel', async t => {
  browserFixture(t);
  let calls = 0, applied = 0;
  const root = createOfficialComplexPanel(candidate(), { load: async (record, options) => {
    calls += 1; assert.equal(record.catalogId, 'REB-test'); assert.equal(options.refresh, false); return detail();
  }, onLoaded: () => { applied += 1; } });
  assert.equal(root.dataset.status, 'loading');
  await settle();
  assert.equal(calls, 1); assert.equal(applied, 1);
  assert.equal(root.dataset.status, 'matched');
  assert.match(root.textContent, /세대당 1.27대/);
  assert.match(root.textContent, /승강기0대/);
  assert.equal(root.all('button').length, 0);
});

test('already loaded official detail reuses its information without another lookup', t => {
  browserFixture(t);
  let calls = 0;
  const root = createOfficialComplexPanel({ ...candidate(), officialComplexInfo: detail({ cache: { hit: true } }) }, { load: () => { calls += 1; } });
  assert.equal(calls, 0);
  assert.match(root.textContent, /저장된 공식 자료 재사용/);
});

test('detail for an unidentified record or disconnected API does not issue requests', t => {
  browserFixture(t);
  let calls = 0;
  const root = createOfficialComplexPanel({ name: '개인 기록' }, { load: () => { calls += 1; } });
  assert.match(root.textContent, /식별정보가 있는 후보/);
  assert.equal(calls, 0);
  assert.match(createOfficialComplexPanel(candidate()).textContent, /조회 서버 연결/);
});

test('a late response cannot refresh another selected candidate or its score', async t => {
  browserFixture(t);
  let resolve, current = true, applied = 0;
  const root = createOfficialComplexPanel(candidate(), { load: () => new Promise(done => { resolve = done; }),
    isCurrent: () => current, onLoaded: () => { applied += 1; } });
  current = false;
  resolve(detail()); await settle();
  assert.equal(applied, 0);
  assert.equal(root.dataset.status, 'loading');
  assert.doesNotMatch(root.textContent, /1.27/);
});

test('failed lookup can retry explicitly and consecutive clicks do not duplicate the request', async t => {
  browserFixture(t);
  let calls = 0, resolve;
  const root = createOfficialComplexPanel(candidate(), { load: async (_, options) => {
    calls += 1;
    if (calls === 1) throw new Error('secret upstream URL');
    assert.equal(options.refresh, true);
    return new Promise(done => { resolve = done; });
  } });
  await settle();
  assert.equal(root.dataset.status, 'unavailable');
  assert.doesNotMatch(root.textContent, /secret/);
  const retry = root.all('button')[0];
  retry.dispatchEvent(new Event('click')); retry.dispatchEvent(new Event('click'));
  assert.equal(calls, 2);
  resolve(detail()); await settle();
  assert.equal(root.dataset.status, 'matched');
});

test('partial lookup keeps heating visible and offers explicit retry for missing fields', async t => {
  browserFixture(t);
  const root = createOfficialComplexPanel(candidate(), { load: async () => detail({ status: 'partial', parking: null, elevatorCount: null }) });
  await settle();
  assert.equal(root.dataset.status, 'partial');
  assert.match(root.textContent, /난방지역난방/);
  assert.match(root.textContent, /승강기미제공/);
  assert.equal(root.all('button')[0].textContent, '공식 정보 다시 확인');
});

test('personal parking has priority, and removing it restores official parking without rounding evidence', t => {
  const stored = browserFixture(t);
  const record = { ...candidate(), parkingEvidence: detail().parkingEvidence };
  assert.equal(parkingForCandidate(record).spacesPerHousehold, 382 / 300);
  assert.match(createParkingEditor(record, () => {}).all('summary')[0].textContent, /1.27대 · 공식 자료/);
  stored.set('homehunt_parking_observations_v1', JSON.stringify({ 'REB-test': { sourceType: 'field', spacesPerHousehold: 0, observedAt: '2026-09-01' } }));
  assert.equal(parkingForCandidate(record).spacesPerHousehold, 0);
  let changes = 0;
  const editor = createParkingEditor(record, () => { changes += 1; });
  editor.all('button').find(button => button.textContent === '사용자 확인값 지우기').dispatchEvent(new Event('click'));
  assert.equal(changes, 1);
  assert.equal(parkingForCandidate(record).spacesPerHousehold, 382 / 300);
});
