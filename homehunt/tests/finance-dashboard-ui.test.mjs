import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptFinanceDashboardContext, createFinanceDashboard } from '../js/controllers/finance-dashboard.js';

class Element extends EventTarget {
  constructor(tag) {
    super(); this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = new Map();
    this.className = ''; this.ownText = ''; this.value = ''; this.classList = { add: value => { this.className += ` ${value}`; } };
  }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.ownText = ''; this.children = nodes; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  all(tag) { return this.children.flatMap(child => [...(child.tagName === tag.toUpperCase() ? [child] : []), ...child.all(tag)]); }
  findClass(name) { return this.children.flatMap(child => [child, ...child.descendants()]).find(child => child.className.split(' ').includes(name)); }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
}
const now = () => new Date('2026-09-10T01:00:00.000Z');
const row = overrides => ({ id: 'mortgage_new', label: '신규 주담대 평균', value: 4.48, unit: '%', kind: 'average', frequency: 'monthly',
  observationDate: '2026-07', publishedAt: '2026-08-26', checkedAt: '2026-09-09T16:00:00Z',
  sourceName: '한국은행', sourceUrl: 'https://www.bok.or.kr/', status: 'ok', ...overrides });
const snapshot = overrides => ({ schemaVersion: 1, generatedAt: '2026-09-09T16:00:00Z', series: [row()], ...overrides });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function fixture(t, options = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: tag => new Element(tag) } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document);
  const container = new Element('section');
  const dashboard = createFinanceDashboard({ container, now,
    getContext: () => ({ targetPriceManWon: 60000, targetPriceSource: 'wecost' }),
    fetchSnapshot: async () => snapshot(), ...options });
  const input = key => container.all('input').find(value => value.name === key);
  const edit = (key, value) => { input(key).value = value; input(key).dispatchEvent(new Event('input')); };
  return { container, dashboard, input, edit };
}

test('activation loads once, seeds verified values, and preserves edited inputs across navigation', async t => {
  let count = 0;
  const app = fixture(t, { fetchSnapshot: async () => { count++; return snapshot(); } });
  await app.dashboard.activate();
  assert.equal(app.input('annualRatePct').value, '4.48'); assert.equal(app.input('principalManWon').value, '30000');
  app.edit('principalManWon', '24000'); app.edit('annualRatePct', '3.8');
  await app.dashboard.activate();
  assert.equal(count, 1); assert.equal(app.input('principalManWon').value, '24000'); assert.equal(app.input('annualRatePct').value, '3.8');
  assert.match(app.container.textContent, /매수대금 자기자금/);
  assert.match(app.container.textContent, /금리가 1%p/);
});

test('a late initial snapshot never overwrites a rate edited while loading', async t => {
  const pending = deferred(); let calls = 0;
  const app = fixture(t, { fetchSnapshot: () => { calls++; return pending.promise; } });
  const activation = app.dashboard.activate();
  app.edit('annualRatePct', '2.9');
  const repeated = app.dashboard.activate();
  pending.resolve(snapshot()); await Promise.all([activation, repeated]);
  assert.equal(calls, 1); assert.equal(app.input('annualRatePct').value, '2.9');
});

test('failed refresh retains prior value as stale and clears only the untouched auto-rate', async t => {
  let failing = false;
  const app = fixture(t, { fetchSnapshot: async () => { if (failing) throw new Error('offline'); return snapshot(); } });
  await app.dashboard.activate(); app.edit('principalManWon', '25000'); failing = true;
  await app.dashboard.refresh();
  assert.match(app.container.textContent, /4\.48/); assert.match(app.container.textContent, /갱신 확인 필요/);
  assert.equal(app.input('annualRatePct').value, ''); assert.equal(app.input('principalManWon').value, '25000');
});

test('external labels are text and invalid source URLs never become active links', async t => {
  const attack = '<img src=x onerror=alert(1)>';
  const app = fixture(t, { fetchSnapshot: async () => snapshot({ series: [row({ label: attack, sourceUrl: 'javascript:alert(1)' })] }) });
  await app.dashboard.activate();
  assert.match(app.container.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(app.container.all('img').length, 0);
  assert.ok(app.container.all('a').every(link => link.href.startsWith('https://')));
  assert.equal(app.input('annualRatePct').value, '');
});

test('a monthly history point matching the product effective month is not a previous observation', async t => {
  const app = fixture(t, { fetchSnapshot: async () => snapshot({ series: [row({ id: 'hf_bogeumjari_30', kind: 'product',
    observationDate: '2026-09-01', value: 5.1, history: [{ date: '2026-08', value: 5.0 }, { date: '2026-09', value: 5.1 }] })] }) });
  await app.dashboard.activate();
  assert.match(app.container.textContent, /2026년 8월 대비 \+0\.1%p/);
  assert.doesNotMatch(app.container.textContent, /2026년 9월 대비/);
});

test('raw context adapter separates district contracts, price mixtures and collected notices', () => {
  const result = adaptFinanceDashboardContext({ targetPriceManWon: 60000, market: { regionName: '테스트구', regionCode: '11111',
    regions: [{ code: '11111', name: '테스트구' }], status: 'ready', sourceType: 'official', bandLabel: '60~85㎡ 미만',
    comparisonMonth: '2026-06', volume: { count: 100, momPct: -10, yoyPct: null },
    sale: { amountManWon: 61000, priceP33: 2900, count: 23, momPct: 2 }, jeonse: null,
    jeonseToSalePct: 60, notes: ['최근 2개월 제외', '전세/매매 비율은 서로 다른 거래 집단'] },
    supply: { openCount: 0, status: 'partial', scopeLabel: '수집한 서울·경기', note: '일부 공급원' } });
  assert.equal(result.market[0].value, 100); assert.match(result.market[0].label, /수집된.*계약/);
  assert.equal(result.market[1].value, '6억 1,000만원'); assert.match(result.market[1].description, /3.3㎡당 평균 2,900만원/);
  assert.match(result.market[1].description, /전월 거래평균 차이/); assert.equal(result.market[2].value, null);
  assert.equal(result.supply.activeCount, 0); assert.equal(result.supply.status, 'partial');
  assert.ok(result.marketDetailNotes.every(note => !note.includes('전세/매매 비율')));
});

test('region selector asks for local context and preserves the edited budget', async t => {
  const seen = [];
  const app = fixture(t, { getContext: ({ regionCode }) => {
    seen.push(regionCode);
    return { targetPriceManWon: 60000, availableRegions: [{ code: 'a', name: 'A 지역' }, { code: 'b', name: 'B 지역' }],
      regionCode: regionCode || 'a', market: [{ label: '계약', value: regionCode === 'b' ? 20 : 10, unit: '건' }] };
  } });
  await app.dashboard.activate(); app.edit('housePriceManWon', '70000');
  const select = app.container.all('select')[0]; select.value = 'b'; select.dispatchEvent(new Event('change'));
  assert.equal(seen.at(-1), 'b'); assert.equal(app.input('housePriceManWon').value, '70000');
  assert.match(app.container.findClass('finance-market-content').textContent, /20건/);
});

test('manual housing values expose observation and check dates and stale status', async t => {
  const app = fixture(t, { fetchSnapshot: async () => snapshot({ housing: { observationDate: '2026-07', publishedAt: '2026-08-31',
    checkedAt: '2026-07-01T00:00:00Z', sourceName: '공식 주택통계', sourceUrl: 'https://stat.molit.go.kr/',
    indicators: [{ label: '미분양', scope: '전국', value: 10000, unit: '호', changePct: 1, changeLabel: '전월 대비' }] } }) });
  await app.dashboard.activate();
  const housing = app.container.findClass('finance-housing');
  assert.equal(housing.hidden, false); assert.match(housing.textContent, /수동 확인 자료/);
  assert.match(housing.textContent, /자동 갱신 미연결/); assert.match(housing.textContent, /갱신 확인 필요/);
  assert.match(housing.textContent, /전국/); assert.match(housing.textContent, /10,000호/);
});

test('area selection is a local read-only context choice preserved across activation', async t => {
  const seen = [];
  const app = fixture(t, { getContext: options => {
    seen.push(options);
    return { availableRegions: [{ code: 'a', name: 'A 지역' }], regionCode: 'a',
      market: [{ label: '면적 구간', value: options.band, unit: '' }] };
  } });
  await app.dashboard.activate();
  const bands = app.container.all('select')[1]; bands.value = '40_60'; bands.dispatchEvent(new Event('change'));
  await app.dashboard.activate();
  assert.equal(seen.at(-1).band, '40_60'); assert.equal(bands.value, '40_60');
  assert.match(app.container.findClass('finance-market-content').textContent, /40_60/);
});

test('partial source failures retain only the failed source with its original evidence dates', async t => {
  let next = snapshot({ housing: { observationDate: '2026-07', publishedAt: '2026-08-31', checkedAt: '2026-09-09T00:00:00Z',
    sourceName: '공식 주택통계', sourceUrl: 'https://stat.molit.go.kr/', indicators: [{ label: '미분양', scope: '전국', value: 10000, unit: '호' }] } });
  const app = fixture(t, { fetchSnapshot: async () => next });
  await app.dashboard.activate(); app.edit('annualRatePct', '3.9');
  next = snapshot({ series: [], financeLoadFailed: true, housing: { ...next.housing, indicators: [{ label: '미분양', value: 12000, unit: '호' }] } });
  await app.dashboard.refresh();
  assert.match(app.container.findClass('finance-rate-grid').textContent, /4\.48/);
  assert.match(app.container.findClass('finance-rate-grid').textContent, /갱신 확인 필요/);
  assert.match(app.container.findClass('finance-housing').textContent, /12,000호/);
  assert.equal(app.input('annualRatePct').value, '3.9');
  next = snapshot({ series: [row({ value: 4.5 })], housingLoadFailed: true });
  await app.dashboard.refresh();
  assert.match(app.container.findClass('finance-rate-grid').textContent, /4\.5/);
  assert.match(app.container.findClass('finance-housing').textContent, /12,000호/);
  assert.match(app.container.findClass('finance-housing').textContent, /갱신 확인 필요/);
  assert.match(app.container.findClass('finance-housing').textContent, /2026\. 09\. 09\./);
});

test('destroy prevents a delayed request from reattaching the dashboard', async t => {
  const pending = deferred(); const app = fixture(t, { fetchSnapshot: () => pending.promise });
  const running = app.dashboard.activate(); app.dashboard.destroy(); pending.resolve(snapshot()); await running;
  assert.equal(app.container.children.length, 0);
});
