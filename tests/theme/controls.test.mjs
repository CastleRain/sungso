import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { installSuiteControls, parseCalendarValue, daysInMonth, monthGrid, isCalendarValueAllowed, parseTimeValue, isTimeValueAllowed } from '../../shared/theme/suite-controls.mjs';

const require = createRequire(new URL('../../apps/sohee/sales/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const tick = () => new Promise(resolve => setImmediate(resolve));
function env(t, markup) {
  const dom = new JSDOM('<!doctype html><html data-ss-suite><body>' + markup + '</body></html>', { url: 'http://example.test', pretendToBeVisual: true });
  const { window: win } = dom, doc = win.document;
  const cleanup = installSuiteControls({ root: doc });
  t.after(() => { cleanup(); win.close(); });
  const click = selector => { const target = typeof selector === 'string' ? doc.querySelector(selector) : selector; assert.ok(target, String(selector)); target.click(); return target; };
  const key = (target, name, extra = {}) => target.dispatchEvent(new win.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...extra }));
  return { win, doc, cleanup, click, key };
}

test('React controlled date and select fields receive one change and keep their DOM identity', async () => {
  const dom = new JSDOM('<html data-ss-suite><body><div id="app"></div></body></html>', { url: 'http://example.test', pretendToBeVisual: true });
  const saved = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react'), { createRoot } = require('react-dom/client');
  const changes = [], root = createRoot(dom.window.document.querySelector('#app'));
  const cleanup = installSuiteControls({ root: dom.window.document });
  function Form() {
    const [date, setDate] = React.useState('2028-02-28'), [choice, setChoice] = React.useState('a');
    return React.createElement('form', null,
      React.createElement('input', { id: 'react-date', type: 'date', name: 'date', value: date, onChange: event => { changes.push(['date', event.target.value]); setDate(event.target.value); } }),
      React.createElement('select', { id: 'react-select', name: 'choice', value: choice, onChange: event => { changes.push(['select', event.target.value]); setChoice(event.target.value); } },
        React.createElement('option', { value: 'a' }, 'A'), React.createElement('option', { value: 'b' }, 'B')),
      React.createElement('output', null, date + '/' + choice));
  }
  try {
    await React.act(async () => { root.render(React.createElement(Form)); await tick(); });
    const doc = dom.window.document, original = doc.querySelector('#react-date');
    await React.act(async () => { original.click(); doc.querySelector('[data-ss-value="2028-02-29"]').click(); });
    assert.equal(doc.querySelector('#react-date'), original);
    assert.equal(doc.querySelector('output').textContent, '2028-02-29/a');
    await React.act(async () => { doc.querySelector('#react-select').click(); doc.querySelector('[data-ss-index="1"]').click(); });
    assert.equal(doc.querySelector('output').textContent, '2028-02-29/b');
    assert.deepEqual(changes, [['date', '2028-02-29'], ['select', 'b']]);
  } finally {
    await React.act(async () => root.unmount()); cleanup(); dom.window.close();
    globalThis.window = saved.window; globalThis.document = saved.document; globalThis.HTMLElement = saved.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act;
  }
});

test('calendar arithmetic handles leap centuries, early years and real month boundaries', () => {
  assert.equal(daysInMonth(2000, 2), 29);
  assert.equal(daysInMonth(1900, 2), 28);
  assert.equal(parseCalendarValue('2027-02-29'), null);
  assert.equal(parseCalendarValue('2028-02-29').day, 29);
  assert.equal(parseCalendarValue('0001-01-01').year, 1);
  const february = monthGrid(2028, 2).filter(Boolean);
  assert.equal(february.length, 29);
  assert.equal(february[0], '2028-02-01');
  assert.equal(february.at(-1), '2028-02-29');
});

test('date/month constraints preserve min/max and step bases instead of rounding records', () => {
  const dates = { min: '2028-02-28', max: '2028-03-05', step: '2' };
  assert.equal(isCalendarValueAllowed('2028-02-29', dates), false);
  assert.equal(isCalendarValueAllowed('2028-03-01', dates), true);
  assert.equal(isCalendarValueAllowed('2028-03-07', dates), false);
  assert.equal(isCalendarValueAllowed('2027-02', { type: 'month', min: '2026-11', max: '2027-02', step: '3' }), true);
  assert.equal(isCalendarValueAllowed('2026-12', { type: 'month', min: '2026-11', step: '3' }), false);
  assert.equal(isCalendarValueAllowed('2026-12-01', { defaultValue: '2026-11-30', step: '2' }), false);
});

test('date selection preserves the exact form element, changes once and restores its focus', t => {
  const e = env(t, '<form id="form"><label for="due">납부일</label><input id="due" name="due" type="date" value="2028-02-28" min="2028-02-28" max="2028-03-02" required></form>');
  const source = e.doc.getElementById('due'), parent = source.parentNode, events = [];
  source.addEventListener('input', () => events.push('input')); source.addEventListener('change', () => events.push('change'));
  e.click(source);
  assert.equal(e.doc.querySelector('.ss-control-panel').getAttribute('aria-label'), '납부일 달력');
  assert.equal(e.doc.querySelector('[data-ss-value="2028-02-27"]').disabled, true);
  assert.equal(e.doc.querySelector('.ss-calendar-footer').textContent.includes('비우기'), false);
  e.click('[data-ss-value="2028-02-29"]');
  assert.equal(source.value, '2028-02-29');
  assert.deepEqual(events, ['input', 'change']);
  assert.equal(source.parentNode, parent); assert.equal(source.type, 'date');
  assert.equal(new e.win.FormData(e.doc.querySelector('form')).get('due'), '2028-02-29');
  assert.equal(source.checkValidity(), true);
  assert.equal(e.doc.activeElement, source);
  assert.equal(e.doc.querySelector('.ss-control-panel'), null);
});

test('calendar arrows cross month boundaries, PageDown clamps end-of-month and Escape does not close the host', t => {
  const e = env(t, '<dialog open><input id="date" type="date" value="2027-01-31"></dialog>');
  let parentEscapes = 0; e.doc.querySelector('dialog').addEventListener('keydown', event => { if (event.key === 'Escape') parentEscapes++; });
  e.click('#date');
  assert.equal(e.doc.querySelector('.ss-control-panel').parentNode, e.doc.querySelector('dialog'));
  e.key(e.doc.activeElement, 'PageDown'); assert.equal(e.doc.activeElement.dataset.ssValue, '2027-02-28');
  e.key(e.doc.activeElement, 'ArrowRight'); assert.equal(e.doc.activeElement.dataset.ssValue, '2027-03-01');
  e.key(e.doc.activeElement, 'Escape');
  assert.equal(parentEscapes, 0); assert.equal(e.doc.querySelector('.ss-control-panel'), null);
  assert.equal(e.doc.activeElement.id, 'date'); assert.equal(e.doc.querySelector('#date').value, '2027-01-31');
});

test('step-constrained calendar skips invalid days with keyboard without modifying the field', t => {
  const e = env(t, '<input type="date" id="date" value="2028-02-28" min="2028-02-28" max="2028-03-03" step="2">');
  e.click('#date');
  e.key(e.doc.activeElement, 'ArrowRight');
  assert.equal(e.doc.activeElement.dataset.ssValue, '2028-03-01');
  assert.equal(e.doc.querySelector('#date').value, '2028-02-28');
  e.key(e.doc.activeElement, 'Enter'); // native keyboard activation is browser-owned
  e.doc.activeElement.click(); assert.equal(e.doc.querySelector('#date').value, '2028-03-01');
});

test('month picker keeps constraints, moves years and commits the same YYYY-MM value', t => {
  const e = env(t, '<input type="month" id="month" name="month" value="2026-12" min="2026-11" max="2027-02">');
  e.click('#month');
  assert.equal(e.doc.querySelector('[data-ss-value="2026-10"]').disabled, true);
  e.click('[aria-label="다음 해"]');
  assert.equal(e.doc.querySelector('[data-ss-value="2027-03"]').disabled, true);
  e.click('[data-ss-value="2027-02"]'); assert.equal(e.doc.querySelector('#month').value, '2027-02');
});

test('select list honors optgroups and disabled choices and emits normal bubbling events', t => {
  const e = env(t, '<form><label for="choice">분류</label><select id="choice" name="choice" required><option value="">선택</option><optgroup label="비활성" disabled><option value="blocked">비활성 항목</option></optgroup><optgroup label="여행"><option value="flight">항공</option><option value="hotel">숙소</option></optgroup></select></form>');
  const source = e.doc.querySelector('select'), events = [];
  e.doc.querySelector('form').addEventListener('change', event => events.push([event.target, event.target.value]));
  e.click(source);
  assert.equal(e.doc.querySelector('[data-ss-index="1"]').disabled, true);
  assert.equal(e.doc.querySelector('[role="listbox"]').getAttribute('aria-label'), '분류');
  e.click('[data-ss-index="3"]');
  assert.equal(source.value, 'hotel');
  assert.deepEqual(events, [[source, 'hotel']]);
  assert.equal(source.checkValidity(), true);
  assert.equal(new e.win.FormData(e.doc.querySelector('form')).get('choice'), 'hotel');
});

test('select keyboard navigation skips disabled options, supports typeahead, and cancels without change', t => {
  const e = env(t, '<select id="select"><option value="a">서울</option><option value="b" disabled>부산</option><option value="c">제주</option><option value="d">한국</option></select>');
  const source = e.doc.querySelector('select');
  e.key(source, 'ArrowDown'); assert.equal(e.doc.activeElement.dataset.ssIndex, '0');
  e.key(e.doc.activeElement, 'ArrowDown'); assert.equal(e.doc.activeElement.dataset.ssIndex, '2');
  e.key(e.doc.activeElement, '한'); assert.equal(e.doc.activeElement.dataset.ssIndex, '3');
  e.key(e.doc.activeElement, 'Escape'); assert.equal(source.value, 'a');
  e.click(source); e.key(e.doc.activeElement, 'End'); e.key(e.doc.activeElement, 'Enter');
  assert.equal(source.value, 'd');
});

test('replacing the form in a change handler does not leave an orphan popup or throw', async t => {
  const e = env(t, '<div id="mount"><select id="select"><option>a</option><option>b</option></select></div>');
  e.doc.querySelector('select').addEventListener('change', () => { e.doc.querySelector('#mount').innerHTML = '<input id="new" type="date">'; });
  e.click('#select'); e.click('[data-ss-index="1"]'); await tick();
  assert.equal(e.doc.querySelector('.ss-control-panel'), null);
  assert.ok(e.doc.querySelector('#new').classList.contains('ss-enhanced-control'));
});

test('dynamic options update an open list and form reset closes the picker with native values restored', async t => {
  const e = env(t, '<form><select id="select"><option value="a">A</option><option value="b">B</option></select><input id="date" type="date" value="2026-11-03"></form>');
  e.click('#select'); const option = e.doc.createElement('option'); option.value = 'c'; option.textContent = 'C';
  e.doc.querySelector('select').append(option); await tick();
  e.click('[data-ss-index="2"]'); assert.equal(e.doc.querySelector('select').value, 'c');
  e.click('#date'); e.doc.querySelector('form').reset(); await tick();
  assert.equal(e.doc.querySelector('select').value, 'a'); assert.equal(e.doc.querySelector('#date').value, '2026-11-03');
  assert.equal(e.doc.querySelector('.ss-control-panel'), null);
});

test('Flatpickr, explicit opt-outs, read-only, multi-select and disabled fieldsets keep native ownership', async t => {
  const e = env(t, '<input id="flat" type="date"><input id="native" data-ss-native type="date"><input id="readonly" type="date" readonly><select multiple id="multi"><option>A</option></select><fieldset disabled><input id="disabled" type="date"></fieldset>');
  const flat = e.doc.querySelector('#flat'); flat._flatpickr = {}; flat.setAttribute('type', 'text'); await tick();
  assert.equal(flat.classList.contains('ss-enhanced-control'), false);
  for (const id of ['flat', 'native', 'readonly', 'multi', 'disabled']) { e.click('#' + id); assert.equal(e.doc.querySelector('.ss-control-panel'), null); }
});

test('removal, outside focus and cleanup close the popup without changing drafts or old aria', async t => {
  const e = env(t, '<input id="date" type="date" value="2026-11-03" aria-controls="old" aria-haspopup="menu"><button id="outside">외부</button>');
  const source = e.doc.querySelector('#date');
  assert.equal(installSuiteControls({ root: e.doc }), e.cleanup);
  e.click(source); e.doc.querySelector('#outside').focus(); assert.equal(e.doc.querySelector('.ss-control-panel'), null);
  e.click(source); source.remove(); await tick(); assert.equal(e.doc.querySelector('.ss-control-panel'), null);
  assert.equal(source.getAttribute('aria-haspopup'), 'menu'); assert.equal(source.getAttribute('aria-controls'), 'old');
  assert.equal(source.value, '2026-11-03');
  e.cleanup(); assert.equal(e.doc.querySelector('.ss-control-panel'), null);
});

test('required empty fields remain invalid and opening or cancelling does not supply a default', t => {
  const e = env(t, '<form><input id="date" name="date" type="date" required></form>');
  const source = e.doc.querySelector('#date');
  assert.equal(source.checkValidity(), false);
  e.click(source); e.key(e.doc.activeElement, 'Escape');
  assert.equal(source.value, ''); assert.equal(source.checkValidity(), false);
});

test('time constraints cover midnight ranges, seconds and step without losing precise original values', () => {
  assert.equal(parseTimeValue('24:00'), null);
  assert.deepEqual(parseTimeValue('09:03:02.125'), { hour: 9, minute: 3, second: 2.125 });
  const rules = { min: '22:00', max: '04:00', step: '900' };
  assert.equal(isTimeValueAllowed('23:45', rules), true);
  assert.equal(isTimeValueAllowed('02:15', rules), true);
  assert.equal(isTimeValueAllowed('12:00', rules), false);
  assert.equal(isTimeValueAllowed('23:46', rules), false);
});

test('time panel preserves a non-five-minute time and lets the user change minutes before applying', t => {
  const e = env(t, '<form><input id="time" name="time" type="time" value="09:03" required></form>');
  e.click('#time');
  assert.equal(e.doc.querySelector('[aria-label="분"]').value, '3');
  const minute = e.doc.querySelector('[aria-label="분"]'); minute.value = '7'; minute.dispatchEvent(new e.win.Event('input', { bubbles: true }));
  e.key(minute, 'Tab'); assert.ok(e.doc.querySelector('.ss-control-panel'));
  e.click('[aria-label="시간 선택 적용"]');
  assert.equal(e.doc.querySelector('#time').value, '09:07');
  assert.equal(e.doc.querySelector('#time').type, 'time');
  assert.equal(new e.win.FormData(e.doc.querySelector('form')).get('time'), '09:07');
});

test('time range and step prevent invalid application, seconds remain intact on no-op selection', t => {
  const e = env(t, '<input id="time" type="time" value="09:03:02.125" min="09:00" max="10:00" step="0.125">');
  e.click('#time');
  assert.equal(e.doc.querySelector('[aria-label="초"]').value, '2.125');
  const hour = e.doc.querySelector('[aria-label="시"]'); hour.value = '11'; hour.dispatchEvent(new e.win.Event('input', { bubbles: true }));
  assert.equal(e.doc.querySelector('[aria-label="시간 선택 적용"]').disabled, true);
  hour.value = '9'; hour.dispatchEvent(new e.win.Event('input', { bubbles: true }));
  e.click('[aria-label="시간 선택 적용"]');
  assert.equal(e.doc.querySelector('#time').value, '09:03:02.125');
});

test('the original time step base keeps fractional seconds valid without a second field constraint', t => {
  const e = env(t, '<input id="time" type="time" value="09:03:02.125">');
  const source = e.doc.querySelector('#time');
  assert.equal(source.checkValidity(), true);
  e.click(source);
  assert.equal(e.doc.querySelector('[aria-label="시간 선택 적용"]').disabled, false);
  e.click('[aria-label="시간 선택 적용"]');
  assert.equal(source.value, '09:03:02.125');
});

test('live constraints update calendar focus and time validation without replacing a time draft', async t => {
  const e = env(t, '<input id="date" type="date" value="2028-02-28"><input id="time" type="time" value="09:03">');
  e.click('#date'); e.doc.querySelector('#date').min = '2028-02-29'; await tick();
  assert.equal(e.doc.querySelector('[data-ss-value="2028-02-28"]').disabled, true);
  assert.equal(e.doc.activeElement.dataset.ssValue, '2028-02-29');
  e.key(e.doc.activeElement, 'Escape');
  e.click('#time'); const hour = e.doc.querySelector('[aria-label="시"]');
  hour.value = '11'; hour.dispatchEvent(new e.win.Event('input', { bubbles: true }));
  e.doc.querySelector('#time').max = '10:00'; await tick();
  assert.equal(e.doc.querySelector('[aria-label="시"]'), hour);
  assert.equal(hour.value, '11');
  assert.equal(e.doc.querySelector('[aria-label="시간 선택 적용"]').disabled, true);
});

test('a disabled selected placeholder focuses the first available option and live opt-out restores ownership', async t => {
  const e = env(t, '<div id="group"><select><option disabled selected>선택</option><option value="a">서울</option><option value="b">제주</option></select></div>');
  const source = e.doc.querySelector('select');
  e.click(source);
  assert.equal(e.doc.activeElement.dataset.ssIndex, '1');
  assert.equal(e.doc.activeElement.tabIndex, 0);
  e.key(e.doc.activeElement, 'ArrowDown'); assert.equal(e.doc.activeElement.dataset.ssIndex, '2');
  e.doc.querySelector('#group').setAttribute('data-ss-controls', 'native'); await tick();
  assert.equal(e.doc.querySelector('.ss-control-panel'), null);
  assert.equal(source.classList.contains('ss-enhanced-control'), false);
  assert.equal(source.getAttribute('aria-haspopup'), null);
});

