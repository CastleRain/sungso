import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedCommuteProvider, planCommuteVerification, commuteAttemptKey, recentCommuteAttempt,
  orderCommuteVerificationCandidates } from '../js/recommendation-verification-core.mjs';

const candidates = Array.from({ length: 100 }, (_, id) => ({ id: String(id), lat: 37.5 + id / 1000, lng: 127 }));
const companies = n => Array.from({ length: n }, (_, id) => ({ id: `company-${id}`, lat: 37.4 + id / 100, lng: 127,
  modes: ['transit'], weightPercent: 100 / n, departureTime: '08:00' }));

test('explicit providers and auto plus Kakao never become an implicit hybrid', () => {
  const config = { providers: { kakaoTransitConfigured: true, tmapTransitConfigured: true }, transitProvider: 'tmap' };
  assert.equal(selectedCommuteProvider({ ...config, transitProviderPreference: 'kakao' }), 'kakao');
  assert.equal(selectedCommuteProvider({ ...config, transitProviderPreference: 'auto' }), 'kakao');
  assert.equal(selectedCommuteProvider({ ...config, transitProviderPreference: 'tmap' }), 'tmap');
  assert.equal(selectedCommuteProvider({ ...config, transitProviderPreference: 'auto', providers: { tmapTransitConfigured: true } }), 'tmap');
});

test('a full company matrix fits both ten candidates and thirty maximum calls without quota guesses', () => {
  for (const [companyCount, remaining, count, calls] of [[1,1000,10,10],[3,1000,10,30],[4,1000,7,28],[3,5,1,3],[3,2,0,0],[31,1000,0,0],[3,null,0,0]]) {
    const plan = planCommuteVerification(candidates, companies(companyCount), { remainingDailyQuota: remaining });
    assert.equal(plan.candidateCount, count, `${companyCount} companies / ${remaining} quota`);
    assert.equal(plan.maxNewTransitCalls, calls);
    assert.equal(plan.candidates.length, count);
  }
  const carOnly = companies(4).map(d => ({ ...d, modes: ['car'] }));
  assert.equal(planCommuteVerification(candidates, carOnly, { remainingDailyQuota: 0 }).candidateCount, 10);
  assert.equal(planCommuteVerification(candidates, carOnly).maxNewTransitCalls, 0);
});

test('attempt cooldown is provider, origin and route-context bound and expires; it contains no route results', () => {
  const now = Date.parse('2026-09-07T07:00:00Z');
  const targets = companies(3), candidate = candidates[0];
  const entry = { checkedAt: new Date(now).toISOString() };
  const attempts = new Map([[commuteAttemptKey(candidate, targets, 'kakao'), entry]]);
  assert.equal(recentCommuteAttempt(candidate, targets, 'kakao', attempts, { now: now + 1 }), entry);
  assert.equal(recentCommuteAttempt(candidate, targets, 'kakao', attempts, { now: now + 8 * 3600000 }), null);
  assert.equal(recentCommuteAttempt(candidate, targets, 'tmap', attempts, { now }), null);
  assert.equal(recentCommuteAttempt({ ...candidate, lat: 37.6 }, targets, 'kakao', attempts, { now }), null);
  assert.equal(recentCommuteAttempt(candidate, targets.map((d,i) => i ? d : { ...d, lat: 37.8 }), 'kakao', attempts, { now }), null);
  assert.equal(commuteAttemptKey(candidate, targets, 'kakao'), commuteAttemptKey(candidate, targets.map(d => ({ ...d, departureTime: '10:00', maxMinutes: 20, weightPercent: 10 })), 'kakao'));
  assert.notEqual(commuteAttemptKey(candidate, targets, 'tmap'), commuteAttemptKey(candidate, targets.map(d => ({ ...d, departureTime: '10:00' })), 'tmap'));
  assert.deepEqual(Object.keys(entry), ['checkedAt']);
});

test('query priority uses the weighted company geography and known features without inventing a commute verdict', () => {
  const targets = [{ ...companies(1)[0], id: 'north', lat: 37.8, weightPercent: 10 },
    { ...companies(1)[0], id: 'south', lat: 37.4, weightPercent: 90 }];
  const rows = [{ id: 'cheap-north', lat: 37.8, lng: 127, bestArea: { averagePriceManWon: 10000 } },
    { id: 'south-b', lat: 37.4, lng: 127, personalizedRecommendation: { referenceScore: 5 } },
    { id: 'south-a', lat: 37.4, lng: 127, personalizedRecommendation: { referenceScore: 20 } },
    { id: 'missing', lat: null, lng: null, personalizedRecommendation: { referenceScore: 50 } }];
  const ordered = orderCommuteVerificationCandidates(rows, targets);
  assert.deepEqual(ordered.map(c => c.id), ['south-a', 'south-b', 'cheap-north', 'missing']);
  assert.ok(rows.every(row => !Object.hasOwn(row, 'commuteBalance') && !Object.hasOwn(row, 'commuteVerification')));
  assert.equal(rows[0].id, 'cheap-north');
});
