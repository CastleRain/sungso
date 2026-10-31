// Keep the stored YYYY-MM-DD value; only wedding editors get the custom picker.
export function mountWeddingCalendar(input) {
  if (!input || typeof window.flatpickr !== 'function') return null;
  const doc = input.ownerDocument, original = { type: input.type, readOnly: input.readOnly, placeholder: input.placeholder };
  const wrapper = doc.createElement('div'); wrapper.className = 'wed-date-picker';
  const control = doc.createElement('div'); control.className = 'wed-date-control';
  const toggle = doc.createElement('button'); toggle.type = 'button'; toggle.className = 'wed-date-toggle';
  toggle.setAttribute('aria-label', '달력 열기');
  toggle.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="4"/><path d="M7 3v4m10-4v4M3 11h18m-12 4h1m4 0h1"/></svg>';
  const panel = doc.createElement('section'); panel.className = 'wed-date-panel'; panel.id = `${input.id}-calendar`; panel.hidden = true;
  panel.setAttribute('aria-label', '날짜 선택 달력');
  panel.innerHTML = '<div class="wed-date-heading"><strong>날짜 선택</strong><span>일정을 한눈에 확인해요</span></div><div class="wed-date-mount"></div><div class="wed-date-shortcuts"><button type="button" data-date-today>오늘</button><button type="button" data-date-clear>날짜 미정</button><button type="button" data-date-close>닫기</button></div>';
  toggle.setAttribute('aria-controls', panel.id); toggle.setAttribute('aria-expanded', 'false');
  input.before(wrapper); wrapper.append(control, panel); control.append(input, toggle);
  input.type = 'text'; input.readOnly = true; input.placeholder = '날짜를 선택해주세요';
  const clear = panel.querySelector('[data-date-clear]'); clear.hidden = input.required;
  let picker;
  const show = (open, focus = false) => {
    if (input.disabled) return;
    panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '달력 닫기' : '달력 열기');
    if (open) {
      picker.jumpToDate(input.value || new Date());
      panel.scrollIntoView({ block: 'nearest' });
      if (focus) (panel.querySelector('.selected, .today:not(.flatpickr-disabled), .flatpickr-day:not(.flatpickr-disabled)'))?.focus();
    } else if (focus) toggle.focus({ preventScroll: true });
  };
  picker = window.flatpickr(input, {
    locale: 'ko', dateFormat: 'Y-m-d', ariaDateFormat: 'Y년 n월 j일',
    defaultDate: input.value || null, minDate: input.min || undefined, maxDate: input.max || undefined,
    disableMobile: true, inline: true, clickOpens: false, monthSelectorType: 'static',
    appendTo: panel.querySelector('.wed-date-mount'),
    onReady: (_, __, fp) => {
      fp.calendarContainer.classList.add('wed-calendar');
      for (const [element, label] of [[fp.prevMonthNav, '이전 달'], [fp.nextMonthNav, '다음 달']]) {
        element.setAttribute('role', 'button'); element.setAttribute('tabindex', '0'); element.setAttribute('aria-label', label);
        element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); element.click(); } });
      }
    },
    onChange: () => show(false, true),
  });
  const open = () => show(panel.hidden);
  const keys = event => {
    if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); event.stopImmediatePropagation(); show(false, true); }
    else if (event.target === input && ['Enter', ' ', 'ArrowDown'].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); show(true, true); }
  };
  input.addEventListener('click', open); toggle.addEventListener('click', open); wrapper.addEventListener('keydown', keys, true);
  panel.querySelector('[data-date-today]').addEventListener('click', () => { if (!input.disabled) picker.setDate(new Date(), true); });
  clear.addEventListener('click', () => { if (!input.disabled) picker.clear(); });
  panel.querySelector('[data-date-close]').addEventListener('click', () => show(false, true));
  return { destroy() {
    input.removeEventListener('click', open); wrapper.removeEventListener('keydown', keys, true);
    picker.destroy(); wrapper.before(input); wrapper.remove();
    input.type = original.type; input.readOnly = original.readOnly; input.placeholder = original.placeholder;
  } };
}
