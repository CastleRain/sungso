import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearSubscriptionProfile,
  loadSubscriptionProfile,
  loadSupplyPreferences,
  saveSubscriptionProfile,
  saveSupplyPreferences,
} from '../js/storage.js';

function withStorage(run) {
  const values = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  try { return run(); }
  finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
}

test('분양 맞춤 조건은 숫자·동네·미공개 포함 선택을 정규화해 로컬 저장한다', () => withStorage(() => {
  const saved = saveSupplyPreferences({
    regions: ['서울', '경기'], districts: ['성남', '성남', ' 하남 '], maxPriceManWon: 60000,
    minAreaM2: 66.1156, maxAreaM2: 112.3965, minSupplyUnits: 500,
    includeUnknownPrice: false, includeUnknownArea: false, includeUnknownUnits: true,
  });
  assert.deepEqual(saved.districts, ['성남', '하남']);
  assert.equal(saved.maxPriceManWon, 60000);
  assert.equal(saved.minSupplyUnits, 500);
  assert.equal(saved.includeUnknownPrice, false);
  assert.deepEqual(loadSupplyPreferences(), saved);
}));

test('청약 프로필은 별도 로컬 키로 저장하고 완전히 지울 수 있다', () => withStorage(() => {
  saveSubscriptionProfile({ relationshipStatus: 'married', people: { seongwoo: { accountMonths: 72 } } });
  assert.equal(loadSubscriptionProfile().relationshipStatus, 'married');
  clearSubscriptionProfile();
  assert.equal(loadSubscriptionProfile(), null);
}));
