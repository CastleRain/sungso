import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionKey, decisionPrice, pruneDecisionKeys, regionalCoverage, searchBottleneck } from '../js/decision-core.mjs';

test('comparison identities preserve different sources with the same numeric id', () => {
  const entries = ['candidate', 'visit', 'supply'].map((kind) => ({ kind, record: { id: '123' } }));
  assert.deepEqual(pruneDecisionKeys(['candidate:123', 'visit:123', 'supply:123', 'visit:123', 'visit:deleted'], entries), ['candidate:123', 'visit:123', 'supply:123']);
  assert.equal(decisionKey('unknown', { id: 1 }), '');
});
test('legacy median and asking prices never become a real trade average', () => {
  assert.equal(decisionPrice('candidate', { askingPrice: 60000, bestArea: { medianPriceManWon: 50000 } }).value, null);
  assert.equal(decisionPrice('candidate', { bestArea: { averagePriceManWon: null } }).value, null);
  assert.equal(decisionPrice('candidate', { bestArea: { averagePriceManWon: 0 } }).value, null);
  assert.equal(decisionPrice('visit', { askingPrice: 70000, bestArea: { averagePriceManWon: 60000 } }).value, 70000);
});
test('saved trade snapshots keep their period and saved label', () => {
  const result = decisionPrice('candidate', { savedAt: '2026-09-01', bestArea: { averagePriceManWon: 93000, latestMonth: '2026-08' } });
  assert.equal(result.value, 93000); assert.match(result.label, /저장 당시/); assert.equal(result.date, '2026-08');
});
test('regional price and coordinate coverage count independent evidence', () => {
  const groups = regionalCoverage([
    { regionCode: '41171', regionName: '안양시 만안구', dong: '안양동', bestArea: { averagePriceManWon: 60000 }, lat: 37.4, lng: 126.9 },
    { regionCode: '41171', regionName: '안양시 만안구', dong: '안양동', bestArea: { averagePriceManWon: 70000 } },
    { regionCode: '41171', regionName: '안양시 만안구', dong: '안양동', bestArea: { medianPriceManWon: 50000 }, lat: 0, lng: 0 },
  ]);
  assert.equal(groups.length, 1); assert.equal(groups[0].count, 3); assert.equal(groups[0].verified, 2);
  assert.equal(groups[0].mapped, 1); assert.equal(groups[0].unmapped, 2);
  assert.equal(groups[0].minPrice, 60000); assert.equal(groups[0].maxPrice, 70000);
});
test('same dong names in different districts remain separate regions', () => {
  assert.equal(regionalCoverage([{ regionCode: '11110', dong: '중앙동' }, { regionCode: '41170', dong: '중앙동' }]).length, 2);
});
test('incomplete official responses take precedence over relaxing price conditions', () => {
  const result = searchBottleneck({ meta: { failedRequestCount: 3, baseCandidateCount: 0 } });
  assert.equal(result.action, 'connections'); assert.match(result.title, /누락/);
});
test('empty-state diagnostics distinguish catalog gates and combined price/area gates', () => {
  assert.match(searchBottleneck({ meta: { baseCandidateCount: 0 } }).title, /지역·세대수·연식/);
  assert.match(searchBottleneck({ meta: { baseCandidateCount: 30 } }).title, /면적·가격/);
});
test('unverified commute prompts verification without inventing a failure or pass', () => {
  const result = searchBottleneck({ meta: {}, results: [{}, {}], destinations: [{}], verifiedCount: 0 });
  assert.equal(result.action, 'candidates'); assert.match(result.detail, /2곳은 최종 경로 확인/);
});
