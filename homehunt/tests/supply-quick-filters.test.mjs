import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildSupplyQuickFilterView, SUPPLY_QUICK_FILTER_LABELS, summarizeSupplyNotices } from '../js/supply-core.mjs';

const now = new Date('2026-09-08T15:00:00Z'); // September 9 in Korea.
const active = { regions: ['서울', '경기'], statuses: ['open', 'upcoming', 'unknown'], excludeClosed: true };
function notice(id, { start = '2026-09-09', end = start, ...extras } = {}) {
  return {
    id, source: 'test', title: `테스트 ${id}`, program: 'public-sale', tenure: 'sale',
    locations: [{ regionKey: 'gyeonggi', sidoCode: '41', sido: '경기도', district: '용인시', address: '경기도 용인시 상갈동' }],
    schedules: [{ kind: 'application', label: '접수', startDate: start, endDate: end }],
    announcementDate: '2026-09-01', totalUnits: 300, maxPriceManWon: 50000,
    homes: [{ modelNo: '01', houseType: '59A', areaM2: 59, maxPriceManWon: 50000 }],
    ...extras,
  };
}
const feed = [
  notice('open', { newlywedSupplyAvailable: true }),
  notice('soon', { start: '2026-09-16' }),
  notice('later', { start: '2026-09-17' }),
  notice('closed', { start: '2026-09-07', newlywedSupplyAvailable: true }),
  notice('unknown', { schedules: [] }),
];
const options = { now, unreadIds: ['closed', 'unknown', 'removed'] };

test('each summary count equals its click result, including closed new and newlywed notices', () => {
  const ordinary = buildSupplyQuickFilterView(feed, active, options);
  assert.deepEqual(ordinary.counts, { new: 2, open: 1, soon: 1, newlywed: 2 });
  assert.equal(ordinary.notices.length, 4);
  for (const key of Object.keys(SUPPLY_QUICK_FILTER_LABELS)) {
    const result = buildSupplyQuickFilterView(feed, active, { ...options, quickFilter: key });
    assert.equal(result.notices.length, ordinary.counts[key]);
  }
  assert.deepEqual(buildSupplyQuickFilterView(feed, active, { ...options, quickFilter: 'new' }).notices.map(({ id }) => id), ['closed', 'unknown']);
  assert.deepEqual(buildSupplyQuickFilterView(feed, active, { ...options, quickFilter: 'newlywed' }).notices.map(({ id }) => id), ['open', 'closed']);
});

test('summary scope preserves region, query, favorites, price, area and minimum supply', () => {
  const values = [
    notice('keep'), notice('other-price', { maxPriceManWon: 80000 }),
    notice('other-area', { homes: [{ areaM2: 32 }] }), notice('other-units', { totalUnits: 10 }),
    notice('other-region', { locations: [{ regionKey: 'seoul', sidoCode: '11', address: '서울특별시 강남구' }] }),
    notice('not-favorite'), notice('other-query', { title: '다른 단지' }),
  ];
  const preferences = { ...active, regions: ['경기'], query: '테스트', favoritesOnly: true,
    favoriteIds: values.filter(({ id }) => id !== 'not-favorite').map(({ id }) => id),
    maxPriceManWon: 60000, minAreaM2: 50, minSupplyUnits: 100 };
  const result = buildSupplyQuickFilterView(values, preferences, { now, quickFilter: 'open' });
  assert.equal(result.counts.open, 1);
  assert.deepEqual(result.notices.map(({ id }) => id), ['keep']);
});

test('quick view overrides only status and preserves an explicit program constraint', () => {
  const values = [notice('public'), notice('private', { program: 'private-sale' })];
  const preferences = { statuses: ['closed'], programs: ['private-sale'] };
  assert.equal(buildSupplyQuickFilterView(values, preferences, { now }).notices.length, 0);
  const result = buildSupplyQuickFilterView(values, preferences, { now, quickFilter: 'open' });
  assert.deepEqual(result.notices.map(({ id }) => id), ['private']);
  assert.deepEqual(preferences, { statuses: ['closed'], programs: ['private-sale'] });
});

test('seven-day start filter uses Korean date and the same boundaries as the existing summary', () => {
  const values = [notice('today'), notice('tomorrow', { start: '2026-09-10' }),
    notice('day7', { start: '2026-09-16' }), notice('day8', { start: '2026-09-17' }),
    notice('already-open', { schedules: [
      { kind: 'application', startDate: '2026-09-09', endDate: '2026-09-09' },
      { kind: 'application', startDate: '2026-09-10', endDate: '2026-09-10' },
    ] }),
  ];
  const result = buildSupplyQuickFilterView(values, active, { now, quickFilter: 'soon' });
  assert.deepEqual(result.notices.map(({ id }) => id), ['tomorrow', 'day7']);
  assert.equal(result.counts.soon, summarizeSupplyNotices(values, now).openingWithin7Days);
  const yesterday = new Date('2026-09-08T14:59:59Z');
  assert.equal(buildSupplyQuickFilterView([notice('today')], active, { now: yesterday, quickFilter: 'soon' }).notices.length, 1);
});

test('new summary ignores removed IDs, deduplicates notices and keeps unread state on repeated views', () => {
  const unreadIds = ['open', 'open', 'removed'];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = buildSupplyQuickFilterView([feed[0], feed[0]], active, { now, unreadIds, quickFilter: 'new' });
    assert.equal(result.counts.new, 1);
    assert.equal(result.notices.length, 1);
  }
  assert.deepEqual(unreadIds, ['open', 'open', 'removed']);
  assert.equal(buildSupplyQuickFilterView(feed, active, { now, unreadIds: [], quickFilter: 'new' }).notices.length, 0);
});

test('unknown filters and clearing return to the original status scope', () => {
  for (const quickFilter of ['', 'invalid', 'toString']) {
    const result = buildSupplyQuickFilterView(feed, { ...active, statuses: ['closed'] }, { ...options, quickFilter });
    assert.equal(result.quickFilter, '');
    assert.deepEqual(result.notices.map(({ id }) => id), ['closed']);
  }
});

const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
function appFunction(name, nextName) {
  return app.slice(app.indexOf(`function ${name}(`), app.indexOf(`function ${nextName}(`));
}

test('actual app card toggle preserves previous status and unread IDs until explicit acknowledgement', () => {
  const state = { supplyFilters: { status: 'closed', quickFilter: '', query: '용인' }, supplySeen: { unreadIds: ['open'] } };
  let renders = 0;
  const context = vm.createContext({ state, SUPPLY_QUICK_FILTER_LABELS, renderSupply: () => { renders += 1; } });
  vm.runInContext(appFunction('selectSupplyQuickFilter', 'markAllSupplySeen'), context);
  context.selectSupplyQuickFilter('new');
  assert.equal(state.supplyFilters.quickFilter, 'new');
  context.selectSupplyQuickFilter('open');
  assert.equal(state.supplyFilters.quickFilter, 'open');
  context.selectSupplyQuickFilter('open');
  assert.equal(state.supplyFilters.quickFilter, '');
  context.selectSupplyQuickFilter('soon');
  context.selectSupplyQuickFilter('');
  assert.equal(state.supplyFilters.quickFilter, '');
  assert.equal(state.supplyFilters.status, 'closed');
  assert.equal(state.supplyFilters.query, '용인');
  assert.deepEqual(state.supplySeen.unreadIds, ['open']);
  assert.equal(renders, 5);
});

test('actual app renders selected state, matching counts, clear action and restored status', () => {
  const nodes = new Map();
  const $ = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { textContent: '', value: '', hidden: false });
    return nodes.get(selector);
  };
  const buttons = Object.keys(SUPPLY_QUICK_FILTER_LABELS).map((key) => ({
    dataset: { supplyQuickFilter: key }, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
  }));
  const state = { supplyFilters: { status: 'closed' } };
  const context = vm.createContext({ $, $$: () => buttons, state, SUPPLY_QUICK_FILTER_LABELS });
  vm.runInContext(appFunction('renderSupplyQuickFilters', 'selectSupplyQuickFilter'), context);
  const selected = buildSupplyQuickFilterView(feed, active, { ...options, quickFilter: 'open' });
  context.renderSupplyQuickFilters(selected);
  assert.equal($('#supplyOpenCount').textContent, '1');
  assert.equal($('#supplyNewCount').textContent, '2');
  assert.equal($('#supplyQuickFilterStatus').hidden, false);
  assert.equal($('#supplyQuickFilterLabel').textContent, '지금 접수 중만 보기 · 1개');
  assert.equal($('#supplyStatusFilter').value, 'open');
  assert.equal(buttons.find(({ dataset }) => dataset.supplyQuickFilter === 'open').attributes['aria-pressed'], 'true');
  context.renderSupplyQuickFilters({ ...selected, quickFilter: '' });
  assert.equal($('#supplyQuickFilterStatus').hidden, true);
  assert.equal($('#supplyStatusFilter').value, 'closed');
  assert.ok(buttons.every(({ attributes }) => attributes['aria-pressed'] === 'false'));
});

test('summary controls use keyboard-accessible buttons and do not acknowledge new notices on selection', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const controls = [...html.matchAll(/<button\b[^>]*data-supply-quick-filter="([^"]+)"[^>]*>/g)];
  assert.deepEqual(controls.map((match) => match[1]), Object.keys(SUPPLY_QUICK_FILTER_LABELS));
  for (const [tag] of controls) {
    assert.match(tag, /type="button"/);
    assert.match(tag, /aria-pressed="false"/);
    assert.match(tag, /aria-controls="supplyFeed"/);
  }
  assert.match(html, /id="clearSupplyQuickFilter"/);
  assert.doesNotMatch(appFunction('selectSupplyQuickFilter', 'markAllSupplySeen'), /saveSupplySeen|markAllSupplySeen\(/);
});

test('actual empty quick view offers clearing the filter without falsely asking to activate APIs', () => {
  const makeNode = (tag, className = '', textContent = '') => ({
    tag, className, textContent, children: [], listeners: {},
    selectedOptions: [{ textContent: '최근 공고 전체' }],
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; },
    addEventListener(type, callback) { this.listeners[type] = callback; },
  });
  const nodes = new Map();
  const $ = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, makeNode('div'));
    return nodes.get(selector);
  };
  const state = { supplyFeed: { notices: feed }, supplySeen: { unreadIds: [] },
    supplyFilters: { quickFilter: 'new', status: 'active', region: 'all', program: 'all', sort: 'deadline' } };
  let clearCalls = 0;
  const context = vm.createContext({ $, state, SUPPLY_QUICK_FILTER_LABELS, buildSupplyQuickFilterView,
    supplyFilterInput: () => active, sortSupplyNotices: (values) => values,
    createElement: makeNode, document: { createElement: makeNode },
    renderSupplyQuickFilters() {}, renderSupplyMatchSummary() {}, renderSupplyDetail() {}, renderSupplyUnreadBadge() {},
    selectSupplyQuickFilter(key) { assert.equal(key, ''); clearCalls += 1; },
  });
  vm.runInContext(appFunction('renderSupply', 'renderSupplyQuickFilters'), context);
  context.renderSupply();
  const flatten = (node) => [node, ...node.children.flatMap(flatten)];
  const rendered = flatten($('#supplyFeed'));
  const words = rendered.map(({ textContent }) => textContent).join(' ');
  assert.match(words, /새로 올라온 공고에 해당하는 공고가 없어요/);
  assert.doesNotMatch(words, /API 신청/);
  const clear = rendered.find(({ tag, textContent }) => tag === 'button' && textContent === '빠른 보기 해제');
  assert.ok(clear);
  clear.listeners.click();
  assert.equal(clearCalls, 1);
});
