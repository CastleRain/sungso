import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessNewlywedReadiness,
  calculateGeneralSubscriptionScore,
  normalizeSubscriptionProfile,
} from '../js/subscription-readiness-core.mjs';

test('민영주택 일반공급 가점의 세 항목과 84점 상한을 계산한다', () => {
  assert.deepEqual(calculateGeneralSubscriptionScore({ noHomeYears: 15, dependents: 6, accountMonths: 180 }), {
    complete: true,
    total: 84,
    maximum: 84,
    noHomePoints: 32,
    dependentPoints: 35,
    accountPoints: 17,
  });
});

test('가입기간의 6개월·1년 경계와 빈 입력을 구분한다', () => {
  assert.equal(calculateGeneralSubscriptionScore({ noHomeYears: 0, dependents: 0, accountMonths: 5 }).accountPoints, 1);
  assert.equal(calculateGeneralSubscriptionScore({ noHomeYears: 0, dependents: 0, accountMonths: 6 }).accountPoints, 2);
  assert.equal(calculateGeneralSubscriptionScore({ noHomeYears: 0, dependents: 0, accountMonths: 12 }).accountPoints, 3);
  assert.equal(calculateGeneralSubscriptionScore({ noHomeYears: '', dependents: 0, accountMonths: 12 }).complete, false);
});

test('프로필 숫자와 enum을 안전한 범위로 정규화한다', () => {
  const profile = normalizeSubscriptionProfile({
    relationshipStatus: 'INVALID',
    childrenCount: 99,
    people: { seongwoo: { accountMonths: -4 }, sohee: { dependents: 2 } },
  });
  assert.equal(profile.relationshipStatus, 'unknown');
  assert.equal(profile.childrenCount, 20);
  assert.equal(profile.people.seongwoo.accountMonths, null);
  assert.equal(profile.people.sohee.dependents, 2);
});

test('신혼 준비도는 확률 대신 차단·확인·강점 근거를 돌려준다', () => {
  const result = assessNewlywedReadiness({
    relationshipStatus: 'engaged',
    homelessStatus: 'yes',
    specialSupplyUsed: 'no',
    incomeStatus: 'unknown',
    assetStatus: 'within',
    childrenCount: 0,
    newbornStatus: 'no',
    people: {
      seongwoo: { noHomeYears: 5, dependents: 1, accountMonths: 72, paymentCount: 30 },
      sohee: { noHomeYears: 3, dependents: 0, accountMonths: 24, paymentCount: 12 },
    },
  });
  assert.equal(result.probabilityAvailable, false);
  assert.equal(result.blockers.length, 0);
  assert.match(result.checks.join(' '), /예비신혼/);
  assert.match(result.checks.join(' '), /소득/);
  assert.equal(result.suggestedApplicant, 'seongwoo');
});

test('유주택·기준초과 입력은 합격으로 포장하지 않는다', () => {
  const result = assessNewlywedReadiness({
    relationshipStatus: 'married',
    homelessStatus: 'no',
    specialSupplyUsed: 'yes',
    incomeStatus: 'over',
    assetStatus: 'over',
  });
  assert.equal(result.tone, 'warning');
  assert.equal(result.label, '우선 자격 확인');
  assert.equal(result.blockers.length, 4);
});

test('혼인 7년 초과와 공고일 기준 지역 거주를 별도 확인한다', () => {
  const result = assessNewlywedReadiness({ relationshipStatus: 'married', marriageYears: 8 });
  assert.match(result.blockers.join(' '), /7년/);
  assert.match(result.checks.join(' '), /지역 거주기간/);
});
