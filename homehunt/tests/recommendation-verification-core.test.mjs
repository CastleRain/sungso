import test from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateVerificationStatus,
  destinationFingerprint,
  historyWindowForVisit,
  reconcileShortlistFingerprints,
  routeRequestFingerprint,
  originFingerprint,
  commuteEvidenceFreshness,
} from '../js/recommendation-verification-core.mjs';
import { evaluateCommuteBalance } from '../js/commute-balance-core.mjs';

const destinations = [
  { id: 'office-a', label: '회사 A', lat: 37.5, lng: 127.1, modes: ['transit'], maxMinutes: 60, departureTime: '08:00', daysPerWeek: 5 },
  { id: 'office-b', label: '회사 B', lat: 37.4, lng: 126.9, modes: ['transit'], maxMinutes: 50, departureTime: '08:30', daysPerWeek: 2 },
];

const matchedBalance = {
  decision: 'matched', matched: true, requiredFullyVerified: true,
  balanceScore: 84, evaluations: [],
};

const origin = { lat: 37.5, lng: 127 };
const verifiedAt = new Date(Date.now() - 60000).toISOString();
const routeEvidence = () => ({ ...origin, routesByDestination: Object.fromEntries(destinations.map(d => [d.id,
  { verified: true, mode: 'transit', durationMinutes: 30, queriedAt: verifiedAt }])) });
const verification = (provider, fingerprint) => ({ stage: 'final', provider, destinationFingerprint: fingerprint,
  originFingerprint: originFingerprint(origin), verifiedAt, transitCacheHours: 8 });

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

test('the old decision contract cannot restore a soft-company match with missing route evidence', () => {
  const offices = destinations.map((destination, index) => ({ ...destination, required: index === 0, weightPercent: index === 0 ? 90 : 10 }));
  const fingerprint = destinationFingerprint(offices);
  const candidate = { ...routeEvidence(), commuteBalance: matchedBalance,
    commuteVerification: verification('tmap', fingerprint.replace('destinations-v3:', 'destinations-v2:')) };
  delete candidate.routesByDestination[offices[1].id];
  const status = candidateVerificationStatus(candidate, { destinationFingerprint: fingerprint });
  assert.equal(status.decision, 'pending');
  assert.equal(status.stale, true);
  assert.equal(reconcileShortlistFingerprints([candidate], fingerprint).items[0].commuteVerification.stale, true);
});

test('route request identity survives preference edits while decision identity changes', () => {
  const before = [{ id: 'a', lat: 37.5, lng: 127, modes: ['transit'], maxMinutes: 60, weightPercent: 10, departureTime: '08:00' },
    { id: 'b', lat: 37.6, lng: 127.1, modes: ['transit'], maxMinutes: 60, weightPercent: 90 }];
  const after = [{ ...before[0], maxMinutes: 45, weightPercent: 80, preferSubway: true }, { ...before[1], weightPercent: 20 }];
  assert.equal(routeRequestFingerprint(after), routeRequestFingerprint(before));
  assert.notEqual(destinationFingerprint(after), destinationFingerprint(before));
  assert.notEqual(routeRequestFingerprint([{ ...before[0], departureTime: '09:00' }, before[1]]), routeRequestFingerprint(before));
  assert.notEqual(routeRequestFingerprint([{ ...before[0], lat: 37.51 }, before[1]]), routeRequestFingerprint(before));
  assert.notEqual(routeRequestFingerprint([before[0]]), routeRequestFingerprint(before));
});

test('Kakao screening never becomes a hybrid final match', () => {
  const fingerprint = destinationFingerprint(destinations);
  const status = candidateVerificationStatus({
    ...origin,
    commuteScreening: {
      ...verification('kakao', fingerprint), stage: 'screening', balance: matchedBalance,
      routesByDestination: routeEvidence().routesByDestination,
    },
  }, { destinationFingerprint: fingerprint, requireTmapFinal: true });
  assert.equal(status.decision, 'pending');
  assert.equal(status.stage, 'screening');
  assert.equal(status.screeningDecision, 'matched');
});

test('Kakao is a valid final provider when used alone, while hybrid requires TMAP', () => {
  const fingerprint = destinationFingerprint(destinations);
  const candidate = {
    ...routeEvidence(),
    commuteBalance: matchedBalance,
    commuteVerification: verification('kakao-transit', fingerprint),
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
    ...routeEvidence(),
    catalogId: 'apt-1', commuteBalance: matchedBalance,
    commuteVerification: verification('tmap', oldFingerprint),
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
    commuteVerification: { ...verification('tmap', newFingerprint), stale: false },
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

const FIXED_NOW = Date.parse('2026-09-07T03:00:00.000Z');
const threeDestinations = [10, 50, 40].map((weightPercent, index) => ({
  id: `fixture-company-${index}`, label: `가상 회사 ${index}`, lat: 37.5 + index * .01, lng: 127,
  modes: ['transit'], maxMinutes: index === 2 ? 30 : 60, weightPercent, required: true, departureTime: '08:00',
}));
function measuredCandidate({ mode = 'transit', queriedAt = '2026-09-07T02:59:00.000Z' } = {}) {
  const routesByDestination = Object.fromEntries(threeDestinations.map((d, index) => [d.id, {
    mode, verified: true, durationMinutes: [20, 40, 25][index], walkingMinutes: 2, transferCount: 0, transitComposition: 'subway', queriedAt,
  }]));
  const targets = threeDestinations.map(d => ({ ...d, modes: [mode] }));
  const candidate = { ...origin, id: 'fixture-home', routesByDestination,
    commuteVerification: { ...verification('tmap', destinationFingerprint(targets)), verifiedAt: new Date(FIXED_NOW).toISOString() } };
  candidate.commuteBalance = evaluateCommuteBalance(candidate, targets);
  return { candidate, targets };
}
const verdict = (candidate, targets, now = FIXED_NOW) => candidateVerificationStatus(candidate, {
  destinationFingerprint: destinationFingerprint(targets), now,
});

test('three required measured routes match only with complete evidence inside every individual limit', () => {
  const { candidate, targets } = measuredCandidate();
  assert.equal(verdict(candidate, targets).decision, 'matched');
  const missing = structuredClone(candidate);
  delete missing.routesByDestination[targets[0].id];
  missing.commuteBalance = evaluateCommuteBalance(missing, targets);
  assert.equal(verdict(missing, targets).decision, 'pending');
  const over = structuredClone(candidate);
  over.routesByDestination[targets[2].id].durationMinutes = 31;
  over.commuteBalance = evaluateCommuteBalance(over, targets);
  assert.equal(verdict(over, targets).decision, 'excluded');
  assert.deepEqual(over.commuteBalance.blockingDestinationIds, [targets[2].id]);
});

test('apartment origin changes or missing origin provenance cannot keep an otherwise matching verdict', () => {
  const { candidate, targets } = measuredCandidate();
  assert.equal(verdict({ ...candidate, lat: 36.99 }, targets).reason, 'origin-coordinate-changed');
  const legacy = structuredClone(candidate);
  delete legacy.commuteVerification.originFingerprint;
  assert.equal(verdict(legacy, targets).reason, 'missing-origin-fingerprint');
  assert.equal(originFingerprint({ lat: null, lng: 127 }), '');
  assert.equal(originFingerprint({ lat: true, lng: 127 }), '');
  assert.equal(originFingerprint({ ...origin, name: '다른 별칭' }), originFingerprint(origin));
});

test('provider query age expires transit at 8 hours and car at 20 minutes even after a fresh UI verification', () => {
  for (const [mode, ttl] of [['transit', 8 * 60 * 60 * 1000], ['car', 20 * 60 * 1000]]) {
    const queriedAt = new Date(FIXED_NOW - ttl).toISOString();
    const { candidate, targets } = measuredCandidate({ mode, queriedAt });
    assert.equal(verdict(candidate, targets).reason, 'route-evidence-expired');
    assert.equal(verdict(candidate, targets, FIXED_NOW - 1).decision, 'matched');
    assert.equal(commuteEvidenceFreshness(candidate, { now: FIXED_NOW - 1 }).expiresAt, new Date(FIXED_NOW).toISOString());
  }
});

test('saved/current shorter cache policy and oldest matrix alternative control expiry', () => {
  const { candidate } = measuredCandidate({ queriedAt: new Date(FIXED_NOW - 2 * 60 * 60 * 1000).toISOString() });
  candidate.commuteVerification.transitCacheHours = 1;
  assert.equal(commuteEvidenceFreshness(candidate, { now: FIXED_NOW, transitCacheHours: 8 }).reason, 'route-evidence-expired');
  candidate.commuteVerification.transitCacheHours = 8;
  assert.equal(commuteEvidenceFreshness(candidate, { now: FIXED_NOW, transitCacheHours: 1 }).reason, 'route-evidence-expired');
  const fresh = measuredCandidate().candidate;
  const first = threeDestinations[0].id;
  fresh.routesByDestination[first] = [fresh.routesByDestination[first], {
    ...fresh.routesByDestination[first], mode: 'car', queriedAt: new Date(FIXED_NOW - 21 * 60 * 1000).toISOString(),
  }];
  assert.equal(commuteEvidenceFreshness(fresh, { now: FIXED_NOW }).reason, 'route-evidence-expired');
});

test('explicit stale status survives identical fingerprint refresh and can only be replaced by a new verification', () => {
  const { candidate, targets } = measuredCandidate();
  const stale = { ...candidate, commuteVerification: { ...candidate.commuteVerification, stale: true, staleReason: 'route-evidence-expired' } };
  const currentFingerprint = destinationFingerprint(targets);
  const first = reconcileShortlistFingerprints([stale], currentFingerprint, { now: FIXED_NOW });
  assert.equal(first.items[0].commuteVerification.stale, true);
  assert.equal(first.items[0].commuteVerification.staleReason, 'route-evidence-expired');
  assert.equal(verdict(first.items[0], targets).final, false);
  const second = reconcileShortlistFingerprints(first.items, currentFingerprint, { now: FIXED_NOW });
  assert.equal(second.changed, false);
  assert.equal(verdict(candidate, targets).final, true);
});

test('missing, invalid and future observation timestamps cannot establish freshness', () => {
  const { candidate, targets } = measuredCandidate();
  const missing = structuredClone(candidate);
  delete missing.commuteVerification.verifiedAt;
  for (const route of Object.values(missing.routesByDestination)) delete route.queriedAt;
  assert.equal(verdict(missing, targets).reason, 'missing-verification-timestamp');
  const invalid = structuredClone(candidate);
  invalid.routesByDestination[targets[0].id].queriedAt = '';
  assert.equal(verdict(invalid, targets).reason, 'invalid-route-timestamp');
  const future = structuredClone(candidate);
  future.commuteVerification.verifiedAt = new Date(FIXED_NOW + 2 * 60 * 1000).toISOString();
  assert.equal(verdict(future, targets).reason, 'future-verification-timestamp');
});

test('expired or displaced-origin screening does not advertise an old matched screening decision', () => {
  const { candidate, targets } = measuredCandidate();
  const screened = { ...origin, commuteScreening: { ...candidate.commuteVerification, stage: 'screening',
    routesByDestination: candidate.routesByDestination, balance: candidate.commuteBalance } };
  assert.equal(verdict(screened, targets).screeningDecision, 'matched');
  for (const [value, now, reason] of [[screened, FIXED_NOW + 8 * 60 * 60 * 1000, 'route-evidence-expired'],
    [{ ...screened, lat: 36.99 }, FIXED_NOW, 'origin-coordinate-changed']]) {
    const result = verdict(value, targets, now);
    assert.equal(result.stale, true);
    assert.equal(result.reason, reason);
    assert.equal(result.screeningDecision, null);
  }
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
