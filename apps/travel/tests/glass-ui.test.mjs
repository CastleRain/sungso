import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../sohee/sales/package.json', import.meta.url));
const { JSDOM } = require('jsdom');

test('glass decision drawer moves the same dirty form and preserves the original comparison on save', async () => {
  const dom = new JSDOM('<html data-ss-surface="solid"><body></body></html>');
  const w = dom.window, writes = [];
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  const desktop = { matches: true, addEventListener() {} };
  w.matchMedia = () => desktop;
  let publish;
  const tripStore = {
    getActor: () => '성우',
    subscribeTrip: fn => { publish = fn; fn({ data: { decisions: { flights: { status: 'candidate', note: '원래 메모' } } }, connection: 'live' }); return () => {}; },
    saveDecision: async (...args) => writes.push(structuredClone(args)),
  };
  const source = readFileSync(new URL('../decision-panel.mjs', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace('import.meta.url', '"https://fixture.invalid/sungso/shared/decision-panel.mjs"')
    .replace("import('../../shared/travel/trip-store.mjs')", 'Promise.resolve(tripStore)');
  vm.runInNewContext(source, { document: w.document, window: w, URL, getMember: () => ({ name: '성우' }),
    DECISIONS: [{ id: 'flights', title: '항공 확인', status: 'pending' }], tripStore });
  await new Promise(resolve => setImmediate(resolve));
  const q = selector => w.document.querySelector(selector);
  const panel = q('.sg-decisions'), note = q('#sg-note-flights');
  assert.equal(panel.parentElement, q('#sg-decisions-host'));
  note.value = '입력 중인 내용'; note.dispatchEvent(new w.Event('input', { bubbles: true }));
  w.document.documentElement.dataset.ssSurface = 'glass';
  w.dispatchEvent(new w.CustomEvent('sungso:surface-change', { detail: { surface: 'glass' } }));
  assert.equal(panel.parentElement, q('#sg-decisions-drawer'));
  assert.equal(q('.sg-decisions-toggle').hidden, false);
  w.document.dispatchEvent(new w.CustomEvent('travel:edit-decision', { detail: { id: 'flights' } }));
  assert.equal(q('#sg-decisions-drawer').open, true);
  assert.equal(w.document.activeElement, q('#sg-status-flights'));
  publish({ data: { decisions: { flights: { status: 'confirmed', note: '상대가 바꾼 내용' } } }, connection: 'live' });
  assert.equal(note.value, '입력 중인 내용');
  w.document.documentElement.dataset.ssSurface = 'solid';
  w.dispatchEvent(new w.CustomEvent('sungso:surface-change', { detail: { surface: 'solid' } }));
  assert.equal(panel.parentElement, q('#sg-decisions-host'));
  assert.equal(q('#sg-note-flights'), note);
  assert.equal(q('#sg-decisions-drawer').open, false);
  assert.equal(writes.length, 0);
  q('.sg-decision-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], ['flights', { status: 'candidate', note: '입력 중인 내용' }, { status: 'candidate', note: '원래 메모' }]);
  w.dispatchEvent(new w.CustomEvent('sungso:private-clear'));
  w.document.documentElement.dataset.ssSurface = 'glass';
  w.dispatchEvent(new w.CustomEvent('sungso:surface-change', { detail: { surface: 'glass' } }));
  publish({ data: { decisions: { flights: { status: 'confirmed', note: '늦은 콜백' } } }, connection: 'live' });
  assert.equal(q('.sg-decisions'), null);
  assert.equal(q('.sg-decisions-toggle'), null);
});

test('folding the glass calendar retains selected dates and full-month state without invoking a selection or write', () => {
  const dom = new JSDOM('<html data-ss-surface="glass"><body><section id="calendar"></section></body></html>');
  const w = dom.window, selections = [];
  const days = ['2035-06-10','2035-06-11','2035-06-12'].map(date => ({ date, title: '테스트 일정' }));
  const locations = Object.fromEntries(days.map(day => [day.date, { country: '한국', journey: '테스트 장소', tone: 'korea', label: '여행', flag: '🇰🇷', icon: '✈️', activity: '✈️' }]));
  const source = readFileSync(new URL('../calendar.mjs', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export \{.*\};\r?\n/gm, '').replace(/^export /gm, '');
  const context = { document: w.document, TRIP_DAYS: days, TRIP_SETTINGS: { weddingDate: '2035-06-09' }, TRAVEL_LOCATIONS: locations };
  vm.runInNewContext(source, context);
  const root = w.document.querySelector('#calendar');
  const calendar = context.createTripCalendar(root, { days, selectedDate: days[0].date, onSelect: (...args) => selections.push(args) });
  const fold = root.querySelector('.travel-calendar-fold');
  fold.click(); root.querySelector('[data-calendar-range="month"]').click();
  calendar.select(days[1].date);
  fold.click(); calendar.updateDays(days); fold.click();
  assert.equal(root.dataset.glassExpanded, 'true');
  assert.equal(fold.getAttribute('aria-expanded'), 'true');
  assert.equal(root.querySelector('[data-calendar-range="month"]').getAttribute('aria-pressed'), 'true');
  assert.equal(root.querySelector(`[data-calendar-date="${days[1].date}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(selections.length, 0);
  root.querySelector(`[data-calendar-date="${days[2].date}"]`).click();
  assert.equal(selections[0][0], days[2].date);
  assert.equal(selections[0][1].scroll, false);
});
