import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficialComplexProgress, officialComplexProgressModel } from '../js/controllers/official-complex-progress.js';
import { createCandidateReview, candidateOfficialFacilitySummary } from '../js/controllers/candidate-review.js';

class Element extends EventTarget {
  constructor(tag) {
    super(); this.tagName = tag.toUpperCase(); this.children = []; this.attributes = new Map(); this.dataset = {};
    this.ownText = ''; this.hidden = false; this.disabled = false; this.className = '';
    this.classList = { add: value => { this.className = `${this.className} ${value}`.trim(); } };
  }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.ownText = ''; this.children = nodes; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  all(tag) { return this.children.flatMap(child => [...(child.tagName === tag.toUpperCase() ? [child] : []), ...child.all(tag)]); }
  classed(name) { return this.children.flatMap(child => [...(child.className.split(' ').includes(name) ? [child] : []), ...child.classed(name)]); }
}
function fixture(t) {
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const page = new Element('main');
  const stored = new Map();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: tag => new Element(tag), getElementById: id => id === 'candidateReviewPage' ? page : null,
  } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)),
  } });
  t.after(() => {
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else delete globalThis.document;
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else delete globalThis.localStorage;
  });
  return { page, stored };
}
const snapshot = (overrides = {}) => ({ total: 900, completed: 120, matched: 100, partial: 10, unmatched: 5,
  failed: 5, pending: 780, running: true, paused: false, reason: '', ...overrides });
const info = (overrides = {}) => ({ provider: 'kapt', status: 'matched', catalogId: 'house', kaptCode: 'A1234',
  complexMatchConfirmed: true, heatingType: '지역난방', elevatorCount: 0, ...overrides });
const candidate = (overrides = {}) => ({ catalogId: 'house', name: '시험 아파트', households: 300,
  builtYear: 2005, bestArea: { averagePriceManWon: 60000, areaM2: 59, count: 10 }, officialComplexInfo: info(), ...overrides });
const settle = () => new Promise(resolve => setImmediate(resolve));

test('progress reports apartment counts without treating failed checks as confirmed properties', () => {
  const model = officialComplexProgressModel(snapshot());
  assert.equal(model.progressLabel, '120 / 900곳 조회');
  assert.match(model.countsLabel, /정보 확인 100곳.*일부 확인 10곳.*단지 대조 미확인 5곳.*조회 실패 5곳.*대기 780곳/);
  assert.doesNotMatch(model.progressLabel + model.countsLabel, /\d+\s*회|API|통근 충족/);
  assert.equal(model.canRetry, false);
  assert.equal(model.canPause, true);
});

test('partial and failed properties offer an explicit retry after processing stops', () => {
  const model = officialComplexProgressModel(snapshot({ completed: 900, pending: 0, running: false }));
  assert.equal(model.canRetry, true);
  assert.equal(model.retryCount, 15);
  assert.equal(model.canPause, false);
});

test('progress does not show a false 100 percent or leak arbitrary reason text', () => {
  const model = officialComplexProgressModel(snapshot({ completed: 7, pending: 893, reason: 'secret upstream URL' }));
  assert.equal(model.completed, 7);
  assert.equal(model.reason, '');
  assert.equal(officialComplexProgressModel(snapshot({ completed: Infinity })).completed, 0);
});

test('quota exhaustion preserves completed and pending counts with an actionable message', () => {
  const model = officialComplexProgressModel(snapshot({ paused: true, running: false, reason: 'QUOTA_EXCEEDED' }));
  assert.equal(model.completed, 120);
  assert.equal(model.pending, 780);
  assert.match(model.reason, /한도.*미완료.*이어서/);
  assert.equal(model.canPause, true);
});

test('queued initial work can be paused before the first request starts', async t => {
  fixture(t); const root = new Element('section'); const pauses = [];
  const view = createOfficialComplexProgress(root, { onPause: paused => pauses.push(paused) });
  view.render(snapshot({ completed: 0, matched: 0, partial: 0, unmatched: 0, failed: 0, pending: 900, running: false }));
  const pause = root.all('button')[0];
  assert.equal(pause.hidden, false);
  assert.equal(pause.textContent, '일시정지');
  pause.dispatchEvent(new Event('click')); await settle();
  assert.deepEqual(pauses, [true]);
});

test('queue pause codes explain user pause and consecutive failures without losing prior progress', () => {
  const user = officialComplexProgressModel(snapshot({ paused: true, running: false, reason: 'USER_PAUSED' }));
  assert.match(user.reason, /잠시 멈췄.*계속 볼/);
  const failed = officialComplexProgressModel(snapshot({ paused: true, running: false, reason: 'CONSECUTIVE_FAILURES' }));
  assert.match(failed.reason, /연속 조회에 실패.*연결 상태.*이어서|연속 조회에 실패.*이어 확인/);
  assert.equal(failed.completed, 120);
  assert.equal(failed.pending, 780);
  assert.equal(failed.canPause, true);
});

test('component shows progress and lets the user pause and resume independently of candidate browsing', async t => {
  fixture(t); const root = new Element('section'); const pauses = [];
  const view = createOfficialComplexProgress(root, { onPause: paused => pauses.push(paused), onRetry() {} });
  assert.equal(root.hidden, true);
  view.render(snapshot());
  assert.equal(root.hidden, false);
  assert.equal(root.all('progress')[0].max, 900);
  assert.equal(root.all('progress')[0].value, 120);
  assert.match(root.textContent, /확인 중에도 후보를 열어볼/);
  root.all('button')[0].dispatchEvent(new Event('click')); await settle();
  assert.deepEqual(pauses, [true]);
  view.render(snapshot({ paused: true, running: false, reason: 'user' }));
  assert.equal(root.all('button')[0].textContent, '이어 확인');
  root.all('button')[0].dispatchEvent(new Event('click')); await settle();
  assert.deepEqual(pauses, [true, false]);
});

test('retry button triggers one queue action while an earlier click is pending', async t => {
  fixture(t); const root = new Element('section'); let calls = 0, resolve;
  const view = createOfficialComplexProgress(root, { onRetry: () => { calls += 1; return new Promise(done => { resolve = done; }); } });
  view.render(snapshot({ running: false, pending: 0, completed: 900 }));
  const retry = root.all('button')[1];
  assert.equal(retry.hidden, false);
  assert.equal(retry.textContent, '미완료 15곳 다시 확인');
  retry.dispatchEvent(new Event('click')); retry.dispatchEvent(new Event('click'));
  assert.equal(calls, 1); assert.equal(retry.disabled, true);
  resolve(); await settle(); assert.equal(retry.disabled, false);
});

test('completed successful batch does not offer unnecessary retries or pause controls', t => {
  fixture(t); const root = new Element('section');
  const view = createOfficialComplexProgress(root, { onRetry() {}, onPause() {} });
  view.render(snapshot({ total: 10, completed: 10, matched: 10, partial: 0, unmatched: 0, failed: 0, pending: 0, running: false }));
  assert.ok(root.all('button').every(button => button.hidden));
});

test('candidate facilities keep zero elevators distinct from missing data and require a matching identity', () => {
  assert.equal(candidateOfficialFacilitySummary(candidate()).elevator, '0대');
  assert.equal(candidateOfficialFacilitySummary(candidate()).heating, '지역난방');
  const partial = candidateOfficialFacilitySummary(candidate({ officialComplexInfo: info({ status: 'partial', elevatorCount: null }) }));
  assert.equal(partial.label, '공식 정보 일부 확인');
  assert.equal(partial.elevator, '미확인');
  assert.equal(partial.heating, '지역난방');
  const matchedMissing = candidateOfficialFacilitySummary(candidate({ officialComplexInfo: info({ heatingType: null, elevatorCount: null }) }));
  assert.equal(matchedMissing.label, '공식 정보 확인');
  assert.equal(matchedMissing.heating, '미확인');
  assert.equal(matchedMissing.elevator, '미확인');
  for (const invalid of [info({ catalogId: 'other' }), info({ complexMatchConfirmed: false }), info({ status: 'ambiguous' })]) {
    const row = candidateOfficialFacilitySummary(candidate({ officialComplexInfo: invalid }));
    assert.equal(row.elevator, '미확인'); assert.equal(row.heating, '미확인');
    assert.doesNotMatch(row.label, /^공식 정보 확인$/);
  }
});

test('candidate review mounts the shared progress hook and renders official facilities on saved cards', t => {
  const { page, stored } = fixture(t);
  const house = candidate({ parkingEvidence: { sourceType: 'official', complexMatchConfirmed: true,
    totalSpaces: 450, households: 300, sourceUrl: 'https://www.data.go.kr/data/15058453/openapi.do' },
    personalizedRecommendation: { dimensions: { parking: { status: 'known', label: '공식 세대당 1.5대' } } },
  });
  stored.set('homehunt_parking_observations_v1', JSON.stringify({ house: { sourceType: 'field', spacesPerHousehold: 0 } }));
  const mounts = [];
  const view = createCandidateReview({ state: () => ({ results: [], shortlist: [house] }),
    conditions: () => 'same', decision: () => 'pending', verification: () => null,
    findMore() {}, renderOfficialProgress: root => { mounts.push(root); },
  });
  view.open('saved');
  assert.equal(mounts[0].id, 'candidateReviewOfficialProgress');
  const card = page.classed('candidate-review-card')[0];
  assert.match(card.textContent, /공식 정보 확인/);
  assert.match(card.textContent, /주차세대당 0대 · 사용자 확인/);
  assert.match(card.textContent, /난방지역난방승강기0대/);
  assert.doesNotMatch(card.textContent, /공식 세대당 1.5대/);
  view.render(); assert.equal(mounts[1], mounts[0]);
});
