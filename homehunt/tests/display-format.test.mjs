import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatAreaPair,
  formatCompactPrice,
  formatPriceManwon,
} from '../js/display-format.mjs';

test('formats won prices expressed in manwon with Korean eok units', () => {
  assert.equal(formatPriceManwon(0), '가격 미정');
  assert.equal(formatPriceManwon(9999), '9,999만원');
  assert.equal(formatPriceManwon(10000), '1억원');
  assert.equal(formatPriceManwon(11000), '1억 1,000만원');
  assert.equal(formatPriceManwon(120000), '12억원');
});

test('formats compact map and chart prices without losing the eok scale', () => {
  assert.equal(formatCompactPrice(0), '가격 미정');
  assert.equal(formatCompactPrice(9999), '9,999만');
  assert.equal(formatCompactPrice(10000), '1억');
  assert.equal(formatCompactPrice(11000), '1.1억');
  assert.equal(formatCompactPrice(120000), '12억');
});

test('shows exclusive square metres together with an approximate pyeong value', () => {
  assert.equal(formatAreaPair(84.9), '전용 84.9㎡ · 약 25.7평');
  assert.equal(formatAreaPair(0), '전용면적 미정');
});
