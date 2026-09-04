import test from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateVerificationStatus,
  destinationFingerprint,
  historyWindowForVisit,
  reconcileShortlistFingerprints,
} from '../js/recommendation-verification-core.mjs';

const destinations = [
  { id: 'office-a', label: '회사 A', lat: 37.5, lng: 127.1, modes: ['transit'], maxMinutes: 60, departureTime: '08:00', daysPerWeek: 5 },
  { id: 'office-b', label: '회사 B', lat: 37.4, lng: 126.9, modes: ['transit'], maxMinutes: 50, departureTime: '08:30', daysPerWeek: 2 },
];

const matchedBalance = {
  decision: 'matched', matched: true, requiredFullyVerified: true,
  balanceScore: 84, evaluations: [],
};

test('destination fingerprint is order- and label-insensitive but changes with routing intent', () => {
  const fingerprint = destinationFingerprint(destinations);
  assert.equal(destinationFingerprint([
    { ...destinations[1], label: '이름만 변경' },
    { ...destinations[0], label: '다른 별칭' },
  ]), fingerprint);
  assert.notEqual(destinationFingerprint([{ ...destinations[0], maxMinutes: 55 }, destinations[1]]), fingerprint);
  assert.notEqual(destinationFingerprint([{ ...destinations[0], lat: 37.51 }, destinations[1]]), fingerprint);
  assert.notEqual(destinationFingerprint([{ ...destinations[0], departureTime: '09:00' }, destinations[1]]), fingerprint);
});

test('Kakao screening never becomes a hybrid final match', () => {
  const fingerprint = destinationFingerprint(destinations);
  const status = candidateVerificationStatus({
    commuteScreening: {
      provider: 'kakao', destinationFingerprint: fingerprint, balance: matchedBalance,
    },
  }, { destinationFingerprint: fingerprint, requireTmapFinal: true });
  assert.equal(status.decision, 'pending');
  assert.equal(status.stage, 'screening');
  assert.equal(status.screeningDecision, 'matched');
});

test('Kakao is a valid final provider when used alone, while hybrid requires TMAP', () => {
  const fingerprint = destinationFingerprint(destinations);
  const candidate = {
    commuteBalance: matchedBalance,
    commuteVerification: { stage: 'final', provider: 'kakao-transit', destinationFingerprint: fingerprint },
  };
  assert.deepEqual(
    candidateVerificationStatus(candidate, { destinationFingerprint: fingerprint, requireTmapFinal: false }),
    {
      decision: 'matched', final: true, stale: false, stage: 'final', provider: 'kakao',
      reason: null, screeningDecision: null,
    },
  );
  const hybrid = candidateVerificationStatus(candidate, { destinationFingerprint: fingerprint, requireTmapFinal: true });
  assert.equal(hybrid.decision, 'pending');
  assert.equal(hybrid.reason, 'tmap-final-required');
});

test('destination changes expire a final shortlist verdict until it is reverified', () => {
  const oldFingerprint = destinationFingerprint(destinations);
  const newFingerprint = destinationFingerprint([{ ...destinations[0], lat: 37.6 }, destinations[1]]);
  const candidate = {
    catalogId: 'apt-1', commuteBalance: matchedBalance,
    commuteVerification: { stage: 'final', provider: 'tmap', destinationFingerprint: oldFingerprint },
  };
  const reconciled = reconcileShortlistFingerprints([candidate], newFingerprint);
  assert.equal(reconciled.changed, true);
  assert.equal(reconciled.items[0].commuteVerification.stale, true);
  const status = candidateVerificationStatus(reconciled.items[0], {
    destinationFingerprint: newFingerprint, requireTmapFinal: true,
  });
  assert.equal(status.decision, 'pending');
  assert.equal(status.stale, true);

  const refreshed = {
    ...reconciled.items[0],
    commuteVerification: { stage: 'final', provider: 'tmap', destinationFingerprint: newFingerprint, stale: false },
  };
  assert.equal(candidateVerificationStatus(refreshed, {
    destinationFingerprint: newFingerprint, requireTmapFinal: true,
  }).decision, 'matched');
});

test('legacy shortlist commute verdict without a fingerprint is explicitly stale', () => {
  const reconciled = reconcileShortlistFingerprints([{ catalogId: 'legacy', commuteBalance: matchedBalance }], destinationFingerprint(destinations));
  assert.equal(reconciled.changed, true);
  assert.equal(reconciled.items[0].commuteVerification.staleReason, 'missing-destination-fingerprint');
});

test('visit history expands to the next 1/3/5-year step and caps at five years', () => {
  assert.deepEqual(historyWindowForVisit('2024-08-15', { currentMonths: 12, endMonth: '2026-09' }), {
    months: 36, requiredMonths: 26, includesVisit: true, capped: false, reason: null,
  });
  assert.deepEqual(historyWindowForVisit('2022-11-01', { currentMonths: 36, endMonth: '2026-09' }), {
    months: 60, requiredMonths: 47, includesVisit: true, capped: false, reason: null,
  });
  const capped = historyWindowForVisit('2020-01-01', { currentMonths: 12, endMonth: '2026-09' });
  assert.equal(capped.months, 60);
  assert.equal(capped.includesVisit, false);
  assert.equal(capped.capped, true);
});
