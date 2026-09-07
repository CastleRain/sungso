import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeParkingEvidence, normalizeOfficialParkingEvidence, OFFICIAL_PARKING_SOURCE } from '../js/parking-evidence-core.mjs';

test('absent parking and missing numeric values remain unknown rather than zero', () => {
  for (const value of [undefined, null, '', ' ', false, -1, Infinity, 'unknown']) {
    const result = normalizeParkingEvidence({ sourceType: 'field', spacesPerHousehold: value, totalSpaces: value });
    assert.equal(result.spacesPerHousehold, null);
    assert.equal(result.totalSpaces, null);
    assert.equal(result.status, 'unknown');
  }
  assert.equal(normalizeParkingEvidence().sourceType, 'unknown');
  assert.equal(normalizeParkingEvidence({ spacesPerHousehold: 1.5 }).spacesPerHousehold, null);
});

test('a directly observed ratio preserves a real zero and its personal provenance', () => {
  const result = normalizeParkingEvidence({ sourceType: 'field', spacesPerHousehold: 0, observedAt: '2026-09-06', note: '주차장 없음' });
  assert.equal(result.spacesPerHousehold, 0);
  assert.equal(result.status, 'provided');
  assert.equal(result.sourceName, '현장 확인');
  assert.equal(result.observedAt, '2026-09-06');
  assert.equal(result.note, '주차장 없음');
  assert.equal(result.complexMatchConfirmed, false);
});

test('capacity divides by positive households without rounding across a filter boundary', () => {
  const result = normalizeParkingEvidence({ sourceType: 'field', totalSpaces: '1,199' }, { households: 1000 });
  assert.equal(result.spacesPerHousehold, 1.199);
  assert.ok(result.spacesPerHousehold < 1.2);
  assert.equal(result.status, 'calculated');
  assert.equal(result.ratioBasis, 'total-divided-by-households');
  for (const households of [0, null, '', 1.5, -1]) {
    assert.equal(normalizeParkingEvidence({ sourceType: 'field', totalSpaces: 1200, households }, { households: 1000 }).spacesPerHousehold, null);
  }
  assert.equal(normalizeParkingEvidence({ sourceType: 'field', totalSpaces: 0, households: 1000 }).spacesPerHousehold, 0);
});

test('official ratios need both public source evidence and an explicit same-complex match', () => {
  const input = { sourceType: 'official', spacesPerHousehold: 1.4 };
  assert.equal(normalizeParkingEvidence(input).spacesPerHousehold, null);
  assert.equal(normalizeParkingEvidence({ ...input, sourceUrl: OFFICIAL_PARKING_SOURCE.url }).spacesPerHousehold, null);
  assert.equal(normalizeParkingEvidence({ ...input, complexMatchConfirmed: true }).spacesPerHousehold, null);
  const result = normalizeParkingEvidence({ ...input, sourceUrl: OFFICIAL_PARKING_SOURCE.url, complexMatchConfirmed: true });
  assert.equal(result.spacesPerHousehold, 1.4);
  assert.equal(result.sourceType, 'official');
});

test('K-apt adapter joins two parking components and household denominator only by the same explicit code', () => {
  const input = { complexId: 'A1', householdComplexId: 'A1', aboveGroundSpaces: 0, belowGroundSpaces: 1200, households: 1000, observedAt: '2026-09-01' };
  const result = normalizeOfficialParkingEvidence(input, { expectedComplexId: 'A1' });
  assert.equal(result.totalSpaces, 1200);
  assert.equal(result.spacesPerHousehold, 1.2);
  assert.equal(result.complexMatchConfirmed, true);
  assert.equal(result.sourceUrl, OFFICIAL_PARKING_SOURCE.url);
  for (const changed of [{ householdComplexId: 'A2' }, { complexId: 'A2' }, { active: false }]) {
    assert.equal(normalizeOfficialParkingEvidence({ ...input, ...changed }, { expectedComplexId: 'A1' }).spacesPerHousehold, null);
  }
  assert.equal(normalizeOfficialParkingEvidence(input).spacesPerHousehold, null);
  assert.equal(normalizeOfficialParkingEvidence({ ...input, belowGroundSpaces: null }, { expectedComplexId: 'A1' }).totalSpaces, null);
});

test('normalization retains conflicting observation and warns instead of silently replacing it', () => {
  const input = { sourceType: 'field', spacesPerHousehold: 1.1, totalSpaces: 1500, households: 1000, observedAt: '2026-02-30' };
  const before = structuredClone(input);
  const result = normalizeParkingEvidence(input);
  assert.equal(result.spacesPerHousehold, 1.1);
  assert.equal(result.observedAt, null);
  assert.ok(result.limitations.includes('입력 비율과 총 주차대수·세대수 계산값이 다릅니다.'));
  assert.ok(result.limitations.includes('확인일 미기록'));
  assert.ok(result.limitations.some(text => text.includes('야간 혼잡도')));
  assert.deepEqual(input, before);
});

test('public source links remove query credentials and reject unsafe protocols or embedded credentials', () => {
  assert.equal(normalizeParkingEvidence({ sourceType: 'field', sourceUrl: 'https://www.data.go.kr/info?serviceKey=fixture-only#detail' }).sourceUrl, 'https://www.data.go.kr/info');
  for (const sourceUrl of ['javascript:alert(1)', 'http://example.com', 'https://user:password@example.com']) {
    assert.equal(normalizeParkingEvidence({ sourceType: 'field', sourceUrl }).sourceUrl, null);
  }
});
