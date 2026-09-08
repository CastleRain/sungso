import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { formatPriceManwon, formatAreaPair, formatCompactPrice } from '../js/display-format.mjs';
import { PYEONG_TO_M2 } from '../js/recommendation-core.mjs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const actualFunction = name => {
  const match = app.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Actual app function ${name} exists`);
  return match[0];
};

function harness() {
  const summary = { children: [], replaceChildren(...children) { this.children = children; } };
  const sandbox = {
    $: selector => selector === '#recommendationActiveFilters' ? summary : null,
    formatPriceManwon, formatAreaPair, formatCompactPrice, PYEONG_TO_M2,
    createElement(tagName, className, textContent = '') {
      return { tagName, className, textContent, children: [], dataset: {}, attributes: {},
        append(...children) { this.children.push(...children); },
        setAttribute(name, value) { this.attributes[name] = value; },
      };
    },
    setRecommendationPanel() { assert.fail('Reading conditions must not open a filter or run a search'); },
    fetch() { assert.fail('Reading conditions must not invoke an API'); },
    wecostTargetState: { status: 'available' },
    recommendationQuickFilters: null,
  };
  vm.createContext(sandbox);
  vm.runInContext(actualFunction('recommendationChipLabels'), sandbox);
  vm.runInContext(actualFunction('renderRecommendationActiveFilters'), sandbox);
  return { sandbox, summary };
}

const filters = {
  regions: ['seoul', 'gyeonggi'], minHouseholds: 159, householdsOperator: 'gt',
  targetPriceManWon: 60000, maxOverBudgetPct: 10, budgetSource: 'wecost',
  minAreaM2: 51.2, areaOperator: 'gte', maxAgeYears: 30, commuteMaxMinutes: 60,
  destinations: [{ id: 'company-a' }, { id: 'company-b' }, { id: 'company-c' }],
};

test('seven quick-filter buttons retain complete conditions in their accessible name and title', () => {
  const { sandbox, summary } = harness();
  sandbox.renderRecommendationActiveFilters(filters);
  assert.equal(summary.children.length, 7);
  assert.deepEqual(summary.children.map(item => item.dataset.quickFilter),
    ['region', 'price', 'area', 'households', 'age', 'commute', 'parking']);
  const full = {
    region: ['지역', '서울 · 경기'],
    price: ['목표 예산', 'WeCost 목표 6억원 · +10% 허용'],
    area: ['전용면적', '전용 51.2㎡ · 약 15.5평 이상'],
    households: ['단지 규모', '159세대 초과'],
    age: ['준공 연식', '30년 이내'],
    commute: ['통근 목적지', '회사 3곳 · 비중·개별시간 적용'],
    parking: ['주차', '세대당 1대 선호 · 주차 불가 제외 · 미확인은 점수 보류'],
  };
  for (const item of summary.children) {
    const [title, value] = full[item.dataset.quickFilter];
    assert.equal(item.tagName, 'button');
    assert.equal(item.type, 'button');
    assert.equal(item.attributes['aria-haspopup'], 'dialog');
    assert.equal(item.attributes['aria-controls'], 'recommendationQuickFilter');
    assert.equal(item.attributes['aria-expanded'], 'false');
    assert.equal(item.attributes['aria-label'], `${title} 조건 수정: ${value}`);
    assert.equal(item.title, `${title} · ${value}`);
    assert.deepEqual(item.children.map(child => child.tagName), ['span', 'span']);
  }
  const compact = Object.fromEntries(summary.children.map(item => [item.dataset.quickFilter, item.children[0].textContent]));
  assert.equal(compact.price, 'WeCost 6억 +10%');
  assert.equal(compact.area, '전용 15.5평 이상');
  assert.equal(compact.commute, '통근 3곳');
  assert.equal(compact.parking, '주차 1대↑');
});

test('changing conditions replaces every displayed value, including pending WeCost and Gangnam fallback', () => {
  const { sandbox, summary } = harness();
  sandbox.renderRecommendationActiveFilters(filters);
  sandbox.wecostTargetState.status = 'loading';
  sandbox.renderRecommendationActiveFilters({ ...filters,
    regions: [], targetPriceManWon: 0, maxAgeYears: 0,
    destinations: [{ id: 'default-gangnam' }],
  });
  const text = summary.children.map(item => item.title).join(' ');
  assert.match(text, /지역 선택 필요/);
  assert.match(text, /WeCost 금액 확인 중/);
  assert.match(text, /준공 연식 · 0년 이내/);
  assert.match(text, /강남역 100% · 허용 60분/);
  assert.doesNotMatch(text, /6억원|회사 3곳|30년 이내/);
  const commute = summary.children.find(item => item.dataset.quickFilter === 'commute');
  assert.equal(commute.children[0].textContent, '통근 강남역');
});

test('parking condition explains its preference and no-parking inclusion without claiming unknowns qualify', () => {
  const { sandbox, summary } = harness();
  sandbox.renderRecommendationActiveFilters({ ...filters, minParkingRatio: 1.5, requireParking: false });
  const parking = summary.children.find(item => item.dataset.quickFilter === 'parking');
  assert.equal(parking.children[0].textContent, '주차 1.5대↑');
  assert.match(parking.title, /세대당 1\.5대 선호 · 주차 불가도 포함 · 미확인은 점수 보류/);
});
