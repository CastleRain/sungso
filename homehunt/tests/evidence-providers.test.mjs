import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evidenceField, safeHttpsLink } from '../providers/evidence.mjs';
import { officialComplexEvidence, officialTradeEvidence } from '../providers/official/complex.mjs';
import { PORTAL_POLICIES, portalComplexEvidence } from '../providers/portal/index.mjs';
import { supplySourceState, supplyPriceEvidence, officialApplicationLink, supplyApplicationChecklist } from '../providers/official/supply.mjs';
import { renderCandidateEvidence, renderEvidenceFields } from '../js/controllers/evidence-detail.js';
import { decisionPrice } from '../js/decision-core.mjs';

test('evidence has separate observed and fetched dates and never invents a date', () => {
  const missing = evidenceField('missing', '가격', undefined, { fetchedAt: 'invalid' });
  assert.equal(missing.tier, 'unknown');
  assert.equal(missing.value, null);
  assert.equal(missing.observedAt, null);
  assert.equal(missing.fetchedAt, null);
  const known = evidenceField('price', '가격', 123, { observedAt: '2026-08-01', fetchedAt: '2026-09-06' });
  assert.equal(known.observedAt, '2026-08-01');
  assert.equal(known.fetchedAt, '2026-09-06');
});

test('personal or unidentified candidate values cannot become official catalog facts', () => {
  const noIdentity = officialComplexEvidence({ households: 1000, builtYear: 2020 });
  assert.equal(noIdentity[0].value, null);
  const catalog = officialComplexEvidence({ catalogId: 'official', households: 1000, builtYear: 2020 });
  assert.equal(catalog[0].value, 1000);
  assert.equal(catalog[0].observedAt, '2025-09-18');
  assert.equal(catalog.find((field) => field.id === 'parking').tier, 'unknown');
});

test('legacy median candidate cannot be relabeled as mean or live listing price', () => {
  const legacy = officialTradeEvidence({ priceVerified: true, bestArea: { medianPriceManWon: 90000, count: 5 } });
  assert.equal(legacy[0].value, null);
  const current = officialTradeEvidence({ priceVerified: true, bestArea: { averagePriceManWon: 93000, latestPriceManWon: 94000, count: 5, areaM2: 84.9, latestMonth: '2026-08', latestDay: 14 } });
  assert.equal(current[0].value, 93000);
  assert.equal(current[0].derivation, 'arithmetic-mean');
  assert.equal(current[0].observedAt, '2026-08-14');
  assert.match(current[0].note, /현재 매물 가격을 뜻하지/);
});

test('portal enrichment stays inert even if callers pass enabled or fetch overrides', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls += 1; throw new Error('must not fetch'); };
  try {
    const rows = portalComplexEvidence({ enabled: true, name: '<script>alert(1)</script>' });
    assert.equal(rows.length, 3);
    assert.equal(calls, 0);
    assert.ok(rows.every((row) => row.enabled === false && row.method === 'official-link-only' && row.value === null && row.fetchedAt === null));
    assert.ok(PORTAL_POLICIES.every((row) => row.requestsPerDay === 0 && row.requestsPerMinute === 0));
  } finally { globalThis.fetch = originalFetch; }
});

test('portal detail links and application links reject lookalike hosts and active schemes', () => {
  assert.equal(safeHttpsLink('javascript:alert(1)'), '');
  const rows = portalComplexEvidence({ portalLinks: { naver: 'https://new.land.naver.com.evil.example/complexes/3', dabang: 'https://user:pass@www.dabangapp.com/' } });
  assert.equal(rows[0].href, 'https://land.naver.com/');
  assert.equal(rows[1].href, 'https://www.dabangapp.com/');
  assert.equal(officialApplicationLink({ source: 'sh', applicationUrl: 'https://evil.example/' }).href, 'https://www.i-sh.co.kr/app/');
  assert.equal(officialApplicationLink({ source: 'unknown', applicationUrl: 'https://evil.example/' }), null);
  assert.equal(officialApplicationLink({ source: 'lh', sourceUrl: 'https://apply.lh.or.kr/notice' }).direct, false);
});

test('supply providers distinguish seven states and never label HTTP failure normal zero', () => {
  const cases = [
    [{ status: 'ok', count: 2 }, 'collected'],
    [{ status: 'ok', count: 0 }, 'empty'],
    [{ status: 'not_collected' }, 'baseline'],
    [{ status: 'approval_pending' }, 'approval-pending'],
    [{ status: 'error', coverage: { errors: [{ httpStatus: 401 }] } }, 'auth-failed'],
    [{ status: 'error', coverage: { errors: [{ code: 'SH_RSS_INVALID_XML' }] } }, 'format-changed'],
    [{ status: 'error', coverage: { errors: [{ code: 'TIMEOUT' }] } }, 'unavailable'],
  ];
  for (const [source, expected] of cases) assert.equal(supplySourceState({ id: 'sh', ...source }).state, expected);
  assert.equal(supplySourceState({ id: 'sh', status: 'ok', coverage: { errors: [{ httpStatus: 403 }] } }).state, 'auth-failed');
  assert.equal(supplySourceState({ id: 'lh', status: 'not_collected' }, { status: 'awaiting_api_access' }).state, 'approval-pending');
  assert.equal(supplySourceState({ id: 'sh', status: 'ok', count: 0 }, { notices: [{ source: 'sh', dataStatus: 'historical' }] }).state, 'empty');
});

test('supply price contexts keep official price and unsupported comparisons separate', () => {
  const notice = { source: 'applyhome', homes: [{ areaM2: 84.9, maxPriceManWon: 91000 }, { areaM2: 59.9, maxPriceManWon: 75000 }], announcementDate: '2026-08-20' };
  const guessed = { priceVerified: true, averagePriceManWon: 99000, count: 4, areaM2: 84.9, sourceKind: 'molit-trade', dealType: '전세', observedAt: '2026-08-01', matchBasis: 'catalog-and-area' };
  const contexts = supplyPriceEvidence(notice, { sameComplex: guessed, nearbyComparables: [guessed] });
  assert.equal(contexts[0].value, 91000);
  assert.equal(contexts[1].value, null);
  assert.equal(contexts[2].value, null);
  const exact = supplyPriceEvidence(notice, { sameComplex: { ...guessed, dealType: '매매' } });
  assert.equal(exact[1].value, 99000);
  assert.equal(exact[1].observedAt, '2026-08-01');
  assert.equal(supplyPriceEvidence({})[0].tier, 'unknown');
});

test('evidence rendering escapes source labels and values and checklist never asks for identity numbers', () => {
  const html = renderEvidenceFields([evidenceField('test', 'A <tag>', '<script>alert(1)</script>', { sourceLabel: '<img src=x onerror=alert(1)>', sourceUrl: 'javascript:alert(1)' })]);
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /&lt;script&gt;/);
  const candidateHtml = renderCandidateEvidence({ name: '성우아파트' });
  assert.match(candidateHtml, /기준일 미확인/);
  assert.match(candidateHtml, /자동 조회 0회/);
  assert.equal(supplyApplicationChecklist({}).length, 5);
  assert.doesNotMatch(JSON.stringify(supplyApplicationChecklist({})), /주민등록번호|통장번호/);
});

test('portal adapter contains no request or storage implementation', async () => {
  const source = await readFile(new URL('../providers/portal/index.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|localStorage|indexedDB/);
});

test('decision board does not call a minimum among type ceilings a minimum sale price', () => {
  const price = decisionPrice('supply', { sourceLabel: '청약홈', announcementDate: '2026-08-20', homes: [{ maxPriceManWon: 91000 }, { maxPriceManWon: 75000 }] });
  assert.equal(price.value, 91000);
  assert.equal(price.label, '공식 분양가 · 주택형별 최고');
  assert.equal(price.date, '2026-08-20');
  assert.equal(price.source, '청약홈');
});

test('visit evidence stays personal even with an official identity present', () => {
  const visit = { catalogId: 'known', name: '방문집', askingPrice: 93000, households: 999, walkMinutes: 15, pros: '직접 본 장점', visitDate: '2026-09-01' };
  const html = renderCandidateEvidence(visit, { personalRecord: visit });
  assert.match(html, /data-tier="personal"/);
  assert.match(html, /직접 본 장점/);
  assert.doesNotMatch(html, /data-tier="verified"/);
});
