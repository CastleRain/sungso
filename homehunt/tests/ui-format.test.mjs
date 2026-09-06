import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEvidenceViewModel,
  formatArea,
  formatPrice,
  renderValue,
  renderValueText,
} from '../js/ui-format.js';

test('만원 가격과 전용면적·평 환산은 기존 표시 계약을 유지한다', () => {
  assert.equal(formatPrice(9_500), '9,500만원');
  assert.equal(formatPrice(11_000), '1억 1,000만원');
  assert.equal(formatPrice(30_000), '3억원');
  assert.equal(formatPrice(0), '가격 미정');
  assert.equal(formatArea(84.9), '전용 84.9㎡ · 약 25.7평');
  assert.equal(formatArea(null), '전용면적 미정');
});

test('증거 모델은 출처·파생·신선도·판정·관측시점을 서로 섞지 않는다', () => {
  const evidence = createEvidenceViewModel(11_000, {
    tier: 'verified',
    sourceKind: 'molit-trade',
    derivation: 'arithmetic-mean',
    freshness: 'fresh',
    decisionStatus: 'eligible',
    observedAt: '2026-08-31',
  });

  assert.deepEqual(evidence, {
    value: 11_000,
    tier: 'verified',
    sourceKind: 'molit-trade',
    derivation: 'arithmetic-mean',
    freshness: 'fresh',
    decisionStatus: 'eligible',
    observedAt: '2026-08-31',
    reason: '',
  });
  assert.ok(Object.isFrozen(evidence));
});

test('unknown 등급은 전달된 숫자를 폐기하고 사유만 렌더한다', () => {
  const evidence = createEvidenceViewModel(99_999, {
    tier: 'unknown',
    sourceKind: 'supply-notice',
    reason: '분양가 미공개 · 공고문 확인',
  });
  const html = renderValue(evidence, { format: 'price' });

  assert.equal(evidence.value, null);
  assert.match(html, /미확인/);
  assert.match(html, /분양가 미공개/);
  assert.doesNotMatch(html, /99,999|9억/);
});

test('estimated 등급은 호출자가 생략해도 예상 또는 약 접두어를 강제한다', () => {
  assert.match(renderValueText(11_000, 'estimated', { format: 'price' }), /예상 1억 1,000만원/);
  assert.match(
    renderValueText(25, 'estimated', { format: 'number', estimatedPrefix: '약' }),
    /약 25/,
  );
  assert.doesNotMatch(
    renderValueText('예상 52분', 'estimated', { format: 'text' }),
    /예상 예상/,
  );
});

test('HTML 렌더는 값·메타데이터·추가 class의 삽입을 안전하게 막는다', () => {
  const html = renderValue('<img src=x onerror=alert(1)>', 'personal', {
    format: 'text',
    sourceKind: 'visit" onclick="bad',
    derivation: '<script>bad</script>',
    freshness: 'fresh',
    decisionStatus: 'saved',
    className: 'safe-class bad\"onclick=evil',
    meta: '<b>성우 메모</b>',
  });

  assert.doesNotMatch(html, /<img|<script>|<b>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /data-source-kind="visit&quot; onclick=&quot;bad"/);
  assert.match(html, /class="hh-value hh-value--personal safe-class"/);
  assert.match(html, /&lt;b&gt;성우 메모&lt;\/b&gt;/);
});
