/** Progressive control enhancement; no storage, authentication or network access. */
const DAY = 86400000;
const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
const candidateSelector = 'input[type="date"],input[type="month"],input[type="time"],select';
const installs = new WeakMap();
let nextPanelId = 0;

function utcDate(year, month, day = 1) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
const pad = number => String(number).padStart(2, '0');
export function parseCalendarValue(value, type = 'date') {
  const match = String(value || '').match(type === 'month' ? /^(\d{4})-(\d{2})$/ : /^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = type === 'month' ? 1 : Number(match[3]);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}
export function daysInMonth(year, month) { return utcDate(year, month + 1, 0).getUTCDate(); }
function dateValue(date) {
  return String(date.getUTCFullYear()).padStart(4, '0') + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
}
function formatValue(parts, type = 'date') {
  return String(parts.year).padStart(4, '0') + '-' + pad(parts.month) + (type === 'month' ? '' : '-' + pad(parts.day));
}
function serial(value, type) {
  const parsed = parseCalendarValue(value, type);
  return parsed ? type === 'month' ? (parsed.year - 1970) * 12 + parsed.month - 1 : utcDate(parsed.year, parsed.month, parsed.day).getTime() / DAY : null;
}
export function isCalendarValueAllowed(value, { type = 'date', min = '', max = '', step = '', defaultValue = '' } = {}) {
  const number = serial(value, type), lower = serial(min, type), upper = serial(max, type);
  if (number === null || (lower !== null && number < lower) || (upper !== null && number > upper)) return false;
  if (step === 'any') return true;
  const interval = Number(step) > 0 ? Number(step) : 1;
  const base = lower ?? serial(defaultValue, type) ?? 0;
  const quotient = (number - base) / interval;
  return Math.abs(quotient - Math.round(quotient)) < 1e-7;
}
export function monthGrid(year, month) {
  const first = utcDate(year, month);
  const firstDay = first.getUTCDay();
  return Array.from({ length: Math.ceil((firstDay + daysInMonth(year, month)) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    return day < 1 || day > daysInMonth(year, month) ? null : formatValue({ year, month, day });
  });
}
export function parseTimeValue(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?$/);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]), second = Number(match[3] || 0) + Number(match[4] || 0);
  return hour > 23 || minute > 59 || second >= 60 ? null : { hour, minute, second };
}
export function isTimeValueAllowed(value, { min = '', max = '', step = '', defaultValue = '' } = {}) {
  const total = raw => { const time = parseTimeValue(raw); return time ? time.hour * 3600 + time.minute * 60 + time.second : null; };
  const number = total(value), lower = total(min), upper = total(max);
  if (number === null) return false;
  if (lower !== null && upper !== null && lower > upper) {
    if (number < lower && number > upper) return false;
  } else if ((lower !== null && number < lower) || (upper !== null && number > upper)) return false;
  if (step === 'any') return true;
  const interval = Number(step) > 0 ? Number(step) : 60, base = lower ?? total(defaultValue) ?? 0;
  const quotient = (number - base) / interval;
  return Math.abs(quotient - Math.round(quotient)) < 1e-7;
}
function localToday() {
  const now = new Date();
  return formatValue({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}
function eligible(element) {
  if (!element?.matches?.(candidateSelector) || element._flatpickr || element.classList.contains('flatpickr-input')) return false;
  if (element.closest('[data-ss-native], [data-ss-controls="native"], .flatpickr-calendar, [data-ss-owned-control]')) return false;
  if (element.tagName === 'SELECT' && (element.multiple || element.size > 1 || element.hidden)) return false;
  return element.type !== 'hidden' && !element.readOnly;
}
function available(element) { return eligible(element) && !element.disabled && !element.matches(':disabled'); }
function accessibleName(control, doc) {
  const labelled = control.getAttribute('aria-labelledby');
  if (labelled) {
    const name = labelled.split(/\s+/).map(id => doc.getElementById(id)?.textContent.trim() || '').join(' ').trim();
    if (name) return name;
  }
  return control.getAttribute('aria-label') || [...(control.labels || [])].map(label => label.textContent.trim()).join(' ') || control.getAttribute('title') || (control.tagName === 'SELECT' ? '선택' : control.type === 'month' ? '월 선택' : control.type === 'time' ? '시간 선택' : '날짜 선택');
}
function setControlValue(control, value, win) {
  if (control.value === value) return false;
  const prototype = control.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, value);
  control.dispatchEvent(new win.Event('input', { bubbles: true }));
  control.dispatchEvent(new win.Event('change', { bubbles: true }));
  return true;
}

/**
 * The original form element remains in place and keeps its type, constraints,
 * name, React identity and form validation. Only native popup activation is
 * replaced; existing Flatpickr and custom widgets retain ownership.
 */
export function installSuiteControls({ root = document } = {}) {
  if (installs.has(root)) return installs.get(root);
  const doc = root.nodeType === 9 ? root : root.ownerDocument, win = doc.defaultView;
  const marked = new Map(), listeners = [];
  let active = null, stopped = false, refreshQueued = false, typeahead = '', typeTimer = null;
  function listen(target, name, callback, options) {
    target.addEventListener(name, callback, options);
    listeners.push(() => target.removeEventListener(name, callback, options));
  }
  function make(tag, className, text) {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function button(text, label, action) {
    const element = make('button', 'ss-control-button', text);
    element.type = 'button';
    if (label) element.setAttribute('aria-label', label);
    if (action) element.addEventListener('click', action);
    return element;
  }
  function mark(control) {
    if (marked.has(control)) return;
    marked.set(control, { haspopup: control.getAttribute('aria-haspopup'), expanded: control.getAttribute('aria-expanded'), controls: control.getAttribute('aria-controls') });
    control.classList.add('ss-enhanced-control');
    control.setAttribute('aria-haspopup', control.tagName === 'SELECT' ? 'listbox' : 'dialog');
    control.setAttribute('aria-expanded', 'false');
  }
  function unmark(control) {
    const previous = marked.get(control);
    if (!previous) return;
    control.classList.remove('ss-enhanced-control');
    for (const [key, value] of Object.entries(previous)) {
      if (value === null) control.removeAttribute('aria-' + key);
      else control.setAttribute('aria-' + key, value);
    }
    marked.delete(control);
  }
  function scan() {
    if (stopped) return;
    for (const control of marked.keys()) if (!control.isConnected || !eligible(control)) {
      if (active?.control === control) close(false);
      unmark(control);
    }
    const found = [...root.querySelectorAll(candidateSelector)];
    if (root.matches?.(candidateSelector)) found.unshift(root);
    found.filter(eligible).forEach(mark);
    if (active && (!active.control.isConnected || !available(active.control))) close(false);
  }
  function close(restoreFocus = false) {
    if (!active) return;
    const { panel, control } = active;
    active = null;
    panel.remove();
    control.setAttribute('aria-expanded', 'false');
    const old = marked.get(control)?.controls;
    if (old == null) control.removeAttribute('aria-controls'); else control.setAttribute('aria-controls', old);
    if (restoreFocus && control.isConnected && available(control)) control.focus({ preventScroll: true });
    win.clearTimeout(typeTimer); typeahead = '';
  }
  function place() {
    if (!active) return;
    const { control, panel, kind } = active;
    const rect = control.getBoundingClientRect(), margin = 12, gap = 6;
    const width = Math.min(kind === 'select' ? Math.max(rect.width, 220) : 324, win.innerWidth - margin * 2);
    panel.style.width = width + 'px';
    panel.style.maxHeight = Math.max(120, win.innerHeight - margin * 2) + 'px';
    const panelHeight = Math.min(panel.scrollHeight || (kind === 'select' ? 260 : 390), win.innerHeight - margin * 2);
    const below = win.innerHeight - rect.bottom - margin;
    const top = below >= panelHeight || rect.top < panelHeight + gap + margin ? Math.max(margin, Math.min(rect.bottom + gap, win.innerHeight - panelHeight - margin)) : rect.top - panelHeight - gap;
    panel.style.left = Math.max(margin, Math.min(rect.left, win.innerWidth - width - margin)) + 'px';
    panel.style.top = top + 'px';
  }
  function constraints() {
    const control = active.control;
    return { type: control.type, min: control.min, max: control.max, step: control.step, defaultValue: control.defaultValue };
  }
  function choose(value) {
    if (!active || !available(active.control)) { close(false); return; }
    const { control, kind } = active;
    if (kind !== 'select' && value && !(kind === 'time' ? isTimeValueAllowed(value, constraints()) : isCalendarValueAllowed(value, constraints()))) return;
    if (!value && control.required && kind !== 'select') return;
    setControlValue(control, value, win);
    close(true);
  }
  function selectedFocus(fallback = true) {
    if (!active) return;
    const targets = active.panel.querySelectorAll('[data-ss-value]:not(:disabled),[data-ss-index]:not(:disabled)');
    const match = [...targets].find(element => active.kind === 'select' ? Number(element.dataset.ssIndex) === active.optionIndex : element.dataset.ssValue === active.focusValue);
    const target = match || (fallback ? targets[0] : null) || active.panel.querySelector('button:not(:disabled)');
    if (target?.dataset.ssIndex !== undefined) active.optionIndex = Number(target.dataset.ssIndex);
    if (target?.dataset.ssValue) active.focusValue = target.dataset.ssValue;
    if (target && [...targets].includes(target)) targets.forEach(element => { element.tabIndex = element === target ? 0 : -1; });
    target?.focus({ preventScroll: true });
  }
  function renderSelect(focus = true) {
    const current = active;
    if (!current || current.kind !== 'select') return;
    const restoreActiveFocus = current.panel.contains(doc.activeElement);
    current.panel.replaceChildren();
    const { control, panel } = current;
    const label = make('div', 'ss-control-label', accessibleName(control, doc)); panel.append(label);
    const list = make('div', 'ss-control-options');
    list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', accessibleName(control, doc));
    let previousGroup = null;
    [...control.options].forEach((option, index) => {
      if (option.hidden) return;
      const group = option.parentElement?.tagName === 'OPTGROUP' ? option.parentElement : null;
      if (group && group !== previousGroup) list.append(make('div', 'ss-control-group', group.label));
      previousGroup = group;
      const optionButton = button(option.label || option.textContent, '', () => choose(option.value));
      optionButton.className = 'ss-control-option';
      optionButton.dataset.ssIndex = String(index);
      optionButton.id = panel.id + '-option-' + index;
      optionButton.setAttribute('role', 'option');
      optionButton.setAttribute('aria-selected', String(index === control.selectedIndex));
      optionButton.disabled = option.disabled || !!group?.disabled;
      optionButton.tabIndex = index === current.optionIndex ? 0 : -1;
      list.append(optionButton);
    });
    if (!list.children.length) list.append(make('p', 'ss-control-empty', '선택할 항목이 없어요.'));
    panel.append(list);
    panel.append(button('닫기', '선택 목록 닫기', () => close(true)));
    if (focus || restoreActiveFocus) selectedFocus();
    place();
  }
  function shiftMonth(delta) {
    if (!active || active.kind === 'select') return;
    const date = utcDate(active.year, active.month + delta);
    const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1;
    if (year < 1 || year > 9999) return;
    active.year = year; active.month = month;
    renderCalendar();
  }
  function renderCalendar(focus = true) {
    if (!active || active.kind === 'select') return;
    const current = active, { panel, control, year, month, kind } = current;
    const rules = constraints(), isMonth = kind === 'month';
    const allows = value => isCalendarValueAllowed(value, rules);
    panel.replaceChildren();
    const heading = make('div', 'ss-calendar-heading');
    const title = make('strong', 'ss-calendar-title', isMonth ? year + '년' : year + '년 ' + month + '월');
    title.setAttribute('aria-live', 'polite');
    const previous = button('이전', isMonth ? '이전 해' : '이전 달', () => shiftMonth(isMonth ? -12 : -1));
    const next = button('다음', isMonth ? '다음 해' : '다음 달', () => shiftMonth(isMonth ? 12 : 1));
    const lower = parseCalendarValue(control.min, control.type), upper = parseCalendarValue(control.max, control.type);
    previous.disabled = isMonth ? year <= (lower?.year || 1) : year === 1 && month === 1 || !!lower && year * 12 + month <= lower.year * 12 + lower.month;
    next.disabled = isMonth ? year >= (upper?.year || 9999) : year === 9999 && month === 12 || !!upper && year * 12 + month >= upper.year * 12 + upper.month;
    heading.append(previous, title, next); panel.append(heading);
    const grid = make('div', isMonth ? 'ss-month-grid' : 'ss-calendar-grid');
    grid.setAttribute('role', 'grid'); grid.setAttribute('aria-label', title.textContent);
    const values = isMonth ? Array.from({ length: 12 }, (_, index) => formatValue({ year, month: index + 1 }, 'month')) : monthGrid(year, month);
    const today = localToday().slice(0, isMonth ? 7 : 10);
    if (!isMonth) {
      const row = make('div', 'ss-calendar-week'); row.setAttribute('role', 'row');
      weekdayNames.forEach(name => { const cell = make('span', '', name); cell.setAttribute('role', 'columnheader'); row.append(cell); });
      grid.append(row);
    }
    const columns = isMonth ? 3 : 7;
    for (let index = 0; index < values.length; index += columns) {
      const row = make('div', isMonth ? 'ss-month-row' : 'ss-calendar-week'); row.setAttribute('role', 'row');
      values.slice(index, index + columns).forEach(value => {
        if (!value) { const empty = make('span', 'ss-calendar-blank'); empty.setAttribute('role', 'gridcell'); row.append(empty); return; }
        const parts = parseCalendarValue(value, kind);
        const dayButton = button(isMonth ? parts.month + '월' : String(parts.day), value.replace(/-/g, '.') + (isMonth ? '' : ' ' + weekdayNames[utcDate(parts.year, parts.month, parts.day).getUTCDay()] + '요일'), () => choose(value));
        dayButton.className = 'ss-calendar-day';
        dayButton.dataset.ssValue = value; dayButton.setAttribute('role', 'gridcell');
        dayButton.setAttribute('aria-selected', String(value === control.value));
        if (value === today) dayButton.setAttribute('aria-current', 'date');
        dayButton.disabled = !allows(value);
        dayButton.tabIndex = value === current.focusValue ? 0 : -1;
        row.append(dayButton);
      });
      grid.append(row);
    }
    panel.append(grid);
    const footer = make('div', 'ss-calendar-footer');
    const todayButton = button(isMonth ? '이번 달' : '오늘', '', () => choose(today)); todayButton.disabled = !allows(today);
    footer.append(todayButton);
    if (!control.required) footer.append(button('비우기', '', () => choose('')));
    footer.append(button('닫기', '달력 닫기', () => close(true)));
    panel.append(footer);
    if (focus) selectedFocus();
    place();
  }
  function renderTime(focus = true) {
    if (!active || active.kind !== 'time') return;
    const { control, panel } = active, now = new Date();
    const time = parseTimeValue(control.value) || { hour: now.getHours(), minute: now.getMinutes(), second: 0 };
    const seconds = [control.value, control.min, control.max].some(value => value.split(':').length > 2)
      || (Number(control.step) > 0 && (Number(control.step) < 60 || Number(control.step) % 60 !== 0));
    panel.replaceChildren();
    panel.append(make('strong', 'ss-calendar-title', accessibleName(control, doc)));
    const fields = make('div', 'ss-time-fields'), inputs = {};
    for (const [key, label, max] of [['hour', '시', 23], ['minute', '분', 59], ...(seconds ? [['second', '초', 59.999]] : [])]) {
      const group = make('div', 'ss-time-field');
      const fieldLabel = make('label', '', label), field = make('input', 'ss-time-input');
      field.id = panel.id + '-' + key; fieldLabel.htmlFor = field.id;
      field.type = 'number'; field.inputMode = key === 'second' ? 'decimal' : 'numeric';
      // The original control owns the step base (which may include a fraction).
      // A second constraint here would reject valid values such as value=.125.
      field.min = '0'; field.max = String(max); field.step = key === 'second' ? 'any' : '1';
      field.value = String(time[key]); field.setAttribute('aria-label', label);
      inputs[key] = field;
      const shift = amount => {
        const interval = key === 'minute' ? 5 : 1;
        field.value = String(Math.max(0, Math.min(max, (Number(field.value) || 0) + amount * interval)));
        validate();
      };
      group.append(fieldLabel, field, button('줄이기', label + ' 줄이기', () => shift(-1)), button('늘리기', label + ' 늘리기', () => shift(1)));
      fields.append(group);
    }
    panel.append(fields);
    const message = make('p', 'ss-control-empty'); message.setAttribute('aria-live', 'polite');
    const footer = make('div', 'ss-calendar-footer');
    if (!control.required) footer.append(button('비우기', '', () => choose('')));
    const apply = button('선택', '시간 선택 적용', () => choose(value()));
    function value() {
      if (Object.values(inputs).some(input => input.value === '' || !input.validity.valid)) return '';
      const second = Number(inputs.second?.value || 0), whole = Math.floor(second), fraction = String(Math.round((second - whole) * 1000)).padStart(3, '0').replace(/0+$/, '');
      return pad(Number(inputs.hour.value)) + ':' + pad(Number(inputs.minute.value)) + (seconds ? ':' + pad(whole) + (fraction ? '.' + fraction : '') : '');
    }
    function validate() {
      apply.disabled = !isTimeValueAllowed(value(), constraints());
      message.textContent = apply.disabled ? '설정된 시간 범위와 간격에 맞춰주세요.' : '분은 직접 입력하거나 5분씩 조정할 수 있어요.';
    }
    active.validateTime = validate;
    Object.values(inputs).forEach(input => input.addEventListener('input', validate));
    footer.append(button('닫기', '시간 선택 닫기', () => close(true)), apply);
    panel.append(message, footer); validate();
    panel.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.tagName === 'INPUT') { event.preventDefault(); event.stopPropagation(); if (!apply.disabled) apply.click(); }
    });
    if (focus) inputs.hour.focus({ preventScroll: true });
    place();
  }
  function open(control, focus = true) {
    if (!available(control)) return;
    if (active?.control === control) return;
    close(false); mark(control);
    const kind = control.tagName === 'SELECT' ? 'select' : control.type;
    const panel = make('div', 'ss-control-panel');
    panel.dataset.ssOwnedControl = ''; panel.id = 'ss-control-panel-' + (++nextPanelId);
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', accessibleName(control, doc) + (kind === 'select' ? ' 목록' : kind === 'time' ? ' 시간' : ' 달력'));
    const host = control.closest('dialog[open], [role="dialog"]') || doc.body;
    host.append(panel);
    active = { control, panel, kind, optionIndex: control.selectedIndex };
    control.setAttribute('aria-controls', panel.id); control.setAttribute('aria-expanded', 'true');
    if (kind === 'select') renderSelect(focus);
    else if (kind === 'time') renderTime(focus);
    else {
      let value = control.value || localToday().slice(0, kind === 'month' ? 7 : 10);
      if (control.min && value < control.min) value = control.min;
      if (control.max && value > control.max) value = control.max;
      const parsed = parseCalendarValue(value, kind) || parseCalendarValue(localToday().slice(0, kind === 'month' ? 7 : 10), kind);
      active.year = parsed.year; active.month = parsed.month; active.focusValue = formatValue(parsed, kind);
      renderCalendar(focus);
    }
  }
  function activate(event) {
    const control = event.target;
    if (!available(control)) return;
    event.preventDefault();
    if (event.type === 'pointerdown') control.focus({ preventScroll: true });
    open(control);
  }
  function optionKey(event) {
    const options = [...active.panel.querySelectorAll('[data-ss-index]:not(:disabled)')];
    if (!options.length) return;
    let index = options.findIndex(option => Number(option.dataset.ssIndex) === active.optionIndex);
    if (event.key === 'ArrowDown') index = Math.min(index + 1, options.length - 1);
    else if (event.key === 'ArrowUp') index = Math.max(index - 1, 0);
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = options.length - 1;
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      win.clearTimeout(typeTimer); typeahead += event.key.toLocaleLowerCase();
      typeTimer = win.setTimeout(() => { typeahead = ''; }, 650);
      const found = options.findIndex(option => option.textContent.trim().toLocaleLowerCase().startsWith(typeahead));
      if (found >= 0) index = found;
    } else return;
    event.preventDefault(); event.stopPropagation();
    const next = options[Math.max(0, index)];
    active.optionIndex = Number(next.dataset.ssIndex);
    options.forEach(option => { option.tabIndex = option === next ? 0 : -1; });
    next.focus({ preventScroll: true }); next.scrollIntoView?.({ block: 'nearest' });
  }
  function calendarKey(event) {
    const value = event.target.dataset?.ssValue;
    if (!value) return;
    const parts = parseCalendarValue(value, active.kind), monthMode = active.kind === 'month';
    let date = utcDate(parts.year, parts.month, parts.day);
    const shifts = monthMode ? { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 } : { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in shifts) {
      if (monthMode) date = utcDate(parts.year, parts.month + shifts[event.key]);
      else date.setUTCDate(date.getUTCDate() + shifts[event.key]);
    } else if (event.key === 'Home' || event.key === 'End') {
      if (monthMode) date = utcDate(parts.year, event.key === 'Home' ? 1 : 12);
      else date.setUTCDate(date.getUTCDate() + (event.key === 'Home' ? -date.getUTCDay() : 6 - date.getUTCDay()));
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const delta = (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey || monthMode ? 12 : 1);
      const target = utcDate(parts.year, parts.month + delta);
      date = utcDate(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(parts.day, daysInMonth(target.getUTCFullYear(), target.getUTCMonth() + 1)));
    } else return;
    event.preventDefault(); event.stopPropagation();
    let next = dateValue(date).slice(0, monthMode ? 7 : 10);
    const rules = constraints();
    if (rules.min && next < rules.min) next = rules.min;
    if (rules.max && next > rules.max) next = rules.max;
    if (!parseCalendarValue(next, active.kind)) return;
    // Step-constrained dates remain reachable with arrows in the intended direction.
    const direction = next < value ? -1 : 1;
    for (let attempts = 0; !isCalendarValueAllowed(next, rules) && attempts < 366; attempts++) {
      const parsed = parseCalendarValue(next, active.kind);
      if (!parsed) return;
      const candidate = utcDate(parsed.year, parsed.month + (monthMode ? direction : 0), parsed.day + (monthMode ? 0 : direction));
      next = dateValue(candidate).slice(0, monthMode ? 7 : 10);
      if ((rules.min && next < rules.min) || (rules.max && next > rules.max)) return;
    }
    if (!isCalendarValueAllowed(next, rules)) return;
    const destination = parseCalendarValue(next, active.kind);
    active.year = destination.year; active.month = destination.month; active.focusValue = next;
    renderCalendar();
  }
  function keydown(event) {
    if (!active) {
      if (available(event.target) && ['Enter', ' ', 'ArrowDown', 'F4'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); open(event.target);
      }
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (!active.panel.contains(event.target) && event.target !== active.control) return;
    if (event.key === 'Tab') {
      const focusable = [...active.panel.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(element => element.tabIndex >= 0 && !element.hidden);
      if (event.target === active.control || (event.shiftKey ? event.target === focusable[0] : event.target === focusable.at(-1))) close(true);
      return;
    }
    if (active.kind === 'select') {
      if (['Enter', ' '].includes(event.key) && event.target.dataset?.ssIndex !== undefined) {
        event.preventDefault(); event.stopPropagation(); event.target.click(); return;
      }
      optionKey(event);
    } else if (active.kind !== 'time') calendarKey(event);
  }
  listen(root, 'pointerdown', activate, true);
  listen(root, 'click', activate, true);
  listen(doc, 'keydown', keydown, true);
  listen(doc, 'pointerdown', event => { if (active && !active.panel.contains(event.target) && event.target !== active.control) close(false); }, true);
  listen(doc, 'focusin', event => { if (active && !active.panel.contains(event.target) && event.target !== active.control) close(false); }, true);
  const refresh = () => active?.kind === 'select' ? renderSelect(false) : active?.kind === 'time' ? renderTime(false) : active && renderCalendar(false);
  listen(doc, 'input', event => { if (active?.control === event.target) refresh(); }, true);
  listen(doc, 'change', event => { if (active?.control === event.target) refresh(); }, true);
  listen(doc, 'reset', () => { close(false); win.setTimeout(scan, 0); }, true);
  listen(win, 'resize', place);
  listen(doc, 'scroll', place, true);
  const observer = new win.MutationObserver(records => {
    if (records.every(record => record.target.closest?.('[data-ss-owned-control]'))) return;
    if (refreshQueued) return; refreshQueued = true;
    win.queueMicrotask(() => {
      refreshQueued = false; scan();
      if (active && records.some(record => record.target === active.control || active.control.contains(record.target))) {
        if (active.kind === 'select') renderSelect(false);
        else if (active.kind === 'time') active.validateTime?.();
        else renderCalendar(active.panel.contains(doc.activeElement));
      }
    });
  });
  observer.observe(root.nodeType === 9 ? doc.documentElement : root, { subtree: true, childList: true, attributes: true, attributeFilter: ['type', 'readonly', 'disabled', 'min', 'max', 'step', 'required', 'hidden', 'multiple', 'size', 'data-ss-native', 'data-ss-controls', 'selected', 'value', 'label'] });
  scan();
  const cleanup = () => {
    if (stopped) return; stopped = true; close(false); observer.disconnect();
    listeners.forEach(remove => remove());
    for (const control of marked.keys()) unmark(control);
    installs.delete(root);
  };
  installs.set(root, cleanup);
  return cleanup;
}

