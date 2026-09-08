const GROUPS = {
  region: ['recommendSeoul', 'recommendGyeonggi'],
  price: ['recommendBudgetSource', 'recommendMaxPriceEok', 'recommendMaxPriceMan', 'recommendBudgetOverPct'],
  area: ['recommendMinArea', 'recommendAreaOperator'],
  households: ['recommendHouseholds', 'recommendHouseholdsOperator'],
  age: ['recommendMaxAge'],
  commute: ['recommendPreferSubway', 'recommendExcludeFar'],
  parking: ['recommendParkingRatio', 'recommendRequireParking'],
};
const TITLES = { region: '지역', price: '목표 예산', area: '전용면적', households: '세대수', age: '준공 연식', commute: '통근', parking: '주차' };
const BOOLS = new Set(['recommendSeoul', 'recommendGyeonggi', 'recommendPreferSubway', 'recommendExcludeFar', 'recommendRequireParking']);
const NUMBERS = {
  recommendHouseholds: ['최소 세대수', 0, Infinity, true],
  recommendMaxAge: ['준공 연식', 0, Infinity, true],
  recommendMinArea: ['전용면적', 0, Infinity],
  recommendMaxPriceEok: ['목표가격 억 단위', 0, Infinity],
  recommendMaxPriceMan: ['목표가격 만원 단위', 0, Infinity],
  recommendBudgetOverPct: ['초과 허용률', 0, 100],
  recommendParkingRatio: ['세대당 주차 대수', 0.1, 5],
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const numeric = value => String(value ?? '').trim().replaceAll(',', '');

/** Validate the active draft only; opening/canceling a filter never writes form state. */
export function recommendationQuickFilterPatch(key, initial, draft) {
  if (!GROUPS[key]) throw new Error('지원하지 않는 조건입니다.');
  if (key === 'region' && !draft.recommendSeoul && !draft.recommendGyeonggi) throw new Error('서울 또는 경기 중 한 지역 이상 선택해주세요.');
  const patch = {};
  for (const field of GROUPS[key]) {
    if (key === 'price' && draft.recommendBudgetSource === 'wecost' && ['recommendMaxPriceEok', 'recommendMaxPriceMan'].includes(field)) continue;
    let value = draft[field];
    if (BOOLS.has(field)) value = Boolean(value);
    else if (NUMBERS[field]) {
      const [name, min, max, integer] = NUMBERS[field];
      const text = numeric(value);
      const number = Number(text);
      if (!text || !Number.isFinite(number) || number < min || number > max || (integer && !Number.isSafeInteger(number))) {
        throw new Error(`${name}을 ${Number.isFinite(max) ? `${min}~${max} 범위의 ` : `${min} 이상의 `}${integer ? '정수' : '숫자'}로 입력해주세요.`);
      }
      value = String(number);
    } else if (field === 'recommendBudgetSource') {
      if (!['manual', 'wecost'].includes(value)) throw new Error('목표가격 출처를 선택해주세요.');
    } else if (!['gt', 'gte'].includes(value)) throw new Error('면적·세대수 포함 방식을 선택해주세요.');
    const before = BOOLS.has(field) ? Boolean(initial[field]) : NUMBERS[field] ? String(Number(numeric(initial[field]))) : initial[field];
    if (value !== before) patch[field] = value;
  }
  if (key === 'price' && draft.recommendBudgetSource !== 'wecost' && !(Number(numeric(draft.recommendMaxPriceEok)) * 10000 + Number(numeric(draft.recommendMaxPriceMan)) > 0)) {
    throw new Error('목표가격을 0원보다 크게 입력해주세요.');
  }
  return patch;
}

const node = (tag, className = '', text) => {
  const result = document.createElement(tag);
  result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
const button = (text, action, className = '') => {
  const result = node('button', className, text);
  result.type = 'button';
  result.dataset.rqfAction = action;
  return result;
};

/** Small transactional editors backed by the existing recommendation form. No searches or storage. */
export function createRecommendationQuickFilters({ getValues, applyValues, openFull, getBusy = () => false }) {
  let ui;
  let key = '';
  let anchor;
  let initial;
  let draft;
  let manualPriceDraft;
  let applying = false;
  let generation = 0;
  const fields = new Map();
  const ranges = new Map();

  function setError(message = '') {
    ui.error.textContent = message;
    ui.error.hidden = !message;
  }

  function check(field, label) {
    const wrapper = node('label', 'rqf-check');
    const input = node('input');
    input.type = 'checkbox';
    input.checked = Boolean(draft[field]);
    input.dataset.rqfField = field;
    fields.set(field, input);
    wrapper.append(input, node('span', '', label));
    return wrapper;
  }

  function numberField(field, label, unit, options = {}) {
    const wrapper = node('label', 'rqf-field');
    const input = node('input');
    const [, min, max, integer] = NUMBERS[field];
    input.type = 'number';
    input.inputMode = integer ? 'numeric' : 'decimal';
    input.min = String(min);
    if (Number.isFinite(max)) input.max = String(max);
    input.step = integer ? '1' : 'any';
    input.value = String(draft[field] ?? '');
    input.dataset.rqfField = field;
    input.setAttribute('aria-label', label);
    fields.set(field, input);
    const row = node('span', 'rqf-value-row');
    row.append(input, node('span', 'rqf-unit', unit));
    wrapper.append(node('span', 'rqf-label', label), row);
    ui.body.append(wrapper);
    if (options.max !== undefined) {
      const range = node('input', 'rqf-range');
      range.type = 'range';
      range.min = String(options.min ?? 0);
      range.max = String(options.max);
      range.step = String(options.step ?? 1);
      range.dataset.rqfRange = field;
      range.setAttribute('aria-label', `${label} 슬라이더`);
      ranges.set(field, range);
      const limits = node('div', 'rqf-range-limits');
      limits.append(node('span', '', `${range.min}${unit}`), node('span', '', `${range.max}${unit}`));
      ui.body.append(range, limits);
    }
    return wrapper;
  }

  function operator(field, choices) {
    const label = node('label', 'rqf-field');
    label.append(node('span', 'rqf-label', '기준 포함'));
    const select = node('select');
    select.dataset.rqfField = field;
    for (const [value, text] of choices) {
      const option = node('option', '', text);
      option.value = value;
      select.append(option);
    }
    select.value = draft[field];
    fields.set(field, select);
    label.append(select);
    ui.body.append(label);
  }

  function presets(field, values, unit) {
    const group = node('div', 'rqf-presets');
    group.setAttribute('aria-label', `${TITLES[key]} 빠른 선택`);
    for (const value of values) {
      const control = button(`${value}${unit}`, 'preset', 'rqf-preset');
      control.dataset.rqfTarget = field;
      control.dataset.rqfValue = String(value);
      group.append(control);
    }
    ui.body.append(group);
  }

  function sync() {
    for (const [field, input] of fields) {
      if (input.type === 'checkbox') input.checked = Boolean(draft[field]);
      else if (input.value !== String(draft[field] ?? '')) input.value = String(draft[field] ?? '');
    }
    for (const [field, range] of ranges) {
      const value = field === 'recommendMaxPriceEok' ? Number(numeric(draft[field])) + Number(numeric(draft.recommendMaxPriceMan)) / 10000 : draft[field];
      range.value = String(clamp(value, Number(range.min), Number(range.max)));
    }
    if (key === 'price') {
      const linked = draft.recommendBudgetSource === 'wecost';
      fields.get('recommendMaxPriceEok').readOnly = linked;
      fields.get('recommendMaxPriceMan').readOnly = linked;
      for (const field of ['recommendMaxPriceEok', 'recommendMaxPriceMan']) fields.get(field).placeholder = linked && initial.recommendBudgetSource !== 'wecost' ? '적용 시 가져옴' : '';
      ranges.get('recommendMaxPriceEok').disabled = linked;
      for (const control of ui.body.querySelectorAll('[data-rqf-source]')) control.setAttribute('aria-pressed', String(control.dataset.rqfSource === draft.recommendBudgetSource));
      ui.source.textContent = linked
        ? (initial.recommendBudgetSource === 'wecost' ? initial.budgetStatus || 'WeCost 집 시뮬의 목표집가격과 연동합니다.' : '조건 적용 시 WeCost의 최신 목표가격을 확인합니다.')
        : '목표 안은 예산 점수 만점, 초과 허용 범위 안에서는 금액이 높을수록 점수가 낮아집니다.';
    }
    const busy = applying || Boolean(getBusy());
    ui.apply.disabled = busy;
    ui.apply.textContent = applying ? '적용 중…' : '조건 적용';
    ui.busy.hidden = !busy;
  }

  function render() {
    fields.clear();
    ranges.clear();
    ui.body.replaceChildren();
    ui.heading.textContent = `${TITLES[key]} 조건`;
    ui.root.dataset.filter = key;
    ui.source.textContent = '조건 적용은 검색하지 않습니다. 팝업을 닫으면 변경 내용은 취소됩니다.';
    setError();
    if (key === 'region') {
      ui.body.append(check('recommendSeoul', '서울'), check('recommendGyeonggi', '경기'));
      ui.source.textContent = '공식 단지·실거래 자료를 지원하는 서울·경기에서 선택합니다.';
    } else if (key === 'households') {
      numberField('recommendHouseholds', '최소 세대수', '세대', { max: 1000 });
      presets('recommendHouseholds', [300, 500, 1000], '세대');
      operator('recommendHouseholdsOperator', [['gt', '초과'], ['gte', '이상']]);
    } else if (key === 'age') {
      numberField('recommendMaxAge', '준공 후 최대', '년', { max: 30 });
      presets('recommendMaxAge', [10, 20, 30], '년 이내');
    } else if (key === 'area') {
      numberField('recommendMinArea', '최소 전용면적', '평', { max: 50, step: 0.1 });
      presets('recommendMinArea', [18, 20, 25, 30, 40], '평');
      operator('recommendAreaOperator', [['gte', '평 이상'], ['gt', '평 초과']]);
      ui.source.textContent = '전용면적 기준이며 1평은 약 3.3㎡입니다. 공급면적과 다를 수 있습니다.';
    } else if (key === 'price') {
      const sources = node('div', 'rqf-source');
      for (const [value, text] of [['wecost', 'WeCost 금액 사용'], ['manual', '직접 입력']]) {
        const control = button(text, 'source');
        control.dataset.rqfSource = value;
        sources.append(control);
      }
      ui.body.append(sources);
      numberField('recommendMaxPriceEok', '목표집가격', '억', { min: 0.5, max: 20, step: 0.1 });
      numberField('recommendMaxPriceMan', '추가 금액', '만원');
      presets('recommendMaxPriceEok', [4, 5, 6, 7, 10], '억');
      numberField('recommendBudgetOverPct', '목표가격 초과 허용', '%');
      ui.body.append(button('WeCost 연동 자세히', 'full', 'rqf-link'));
    } else if (key === 'parking') {
      numberField('recommendParkingRatio', '세대당 주차 선호', '대 이상');
      presets('recommendParkingRatio', [1, 1.2, 1.5, 2], '대');
      ui.body.append(check('recommendRequireParking', '주차 불가로 확인된 단지는 제외'));
      ui.source.textContent = '주차 정보가 없는 단지는 불가로 단정하지 않고 점수를 보류합니다. 공식·현장 확인 근거로 비교합니다.';
    } else if (key === 'commute') {
      const destinations = Array.isArray(initial.destinations) ? initial.destinations : [];
      const weights = destinations.map(item => Math.max(0, Number(item.normalizedWeightPercent ?? item.weightPercent) || 0));
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      const list = node('ul', 'rqf-destinations');
      destinations.forEach((item, index) => {
        const row = node('li', 'rqf-destination');
        const share = total > 0 ? weights[index] / total * 100 : 0;
        const minutes = Number(item.individualMaxMinutes ?? item.maxMinutes);
        const time = Number.isFinite(minutes) ? `${minutes}분` : '시간 미설정';
        row.append(node('strong', '', item.label || item.name || `회사 ${index + 1}`), node('span', '', `${Number(share.toFixed(1))}% · ${time}${item.enforceMaxMinutes === false || item.required === false ? ' 초과 허용' : ' 이내'}`));
        list.append(row);
      });
      if (!destinations.length) list.append(node('li', 'rqf-destination', '강남역 100% · 회사를 등록하면 회사 비중으로 비교합니다.'));
      ui.body.append(list, check('recommendPreferSubway', '지하철 위주로 · 환승과 도보가 적은 경로 선호'), check('recommendExcludeFar', '시간 제한을 켠 회사의 초과 후보 제외'), button('회사 위치·비중·시간 편집', 'full', 'rqf-link'));
      ui.source.textContent = '회사 비중은 합계 100%로 환산합니다. 실제 통근 확인은 후보를 고른 뒤 따로 실행합니다.';
    }
    sync();
  }

  function close({ returnFocus = true } = {}) {
    if (!ui || ui.root.hidden) return;
    generation += 1;
    ui.root.hidden = true;
    const previous = anchor;
    const replacement = document.querySelector(`[data-quick-filter="${key}"]`);
    if (previous) previous.setAttribute('aria-expanded', 'false');
    replacement?.setAttribute('aria-expanded', 'false');
    anchor = null;
    key = '';
    applying = false;
    if (returnFocus) (previous?.isConnected === false ? replacement : previous)?.focus();
  }

  async function apply() {
    if (applying || getBusy()) { sync(); return; }
    let patch;
    try { patch = recommendationQuickFilterPatch(key, initial, draft); }
    catch (error) { setError(error.message); return; }
    if (!Object.keys(patch).length) { close(); return; }
    const token = generation;
    applying = true;
    setError();
    sync();
    try {
      const result = await applyValues(patch, key, { isCurrent: () => token === generation && !ui.root.hidden });
      if (token !== generation) return;
      if (result === false) throw new Error('조건을 적용하지 못했습니다. 입력값을 확인해주세요.');
      close();
    } catch (error) {
      if (token === generation) setError(error.message || '조건을 적용하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      if (token === generation) { applying = false; sync(); }
    }
  }

  function changed(event) {
    const target = event.target;
    if (applying) return;
    if (target.dataset.rqfField) draft[target.dataset.rqfField] = target.type === 'checkbox' ? target.checked : target.value;
    else if (target.dataset.rqfRange) {
      const field = target.dataset.rqfRange;
      if (field === 'recommendMaxPriceEok') {
        const amount = Math.round(Number(target.value) * 10000);
        draft[field] = String(Math.floor(amount / 10000));
        draft.recommendMaxPriceMan = String(amount % 10000);
      } else draft[field] = target.value;
    } else return;
    setError();
    sync();
  }

  function choosePriceSource(source) {
    if (draft.recommendBudgetSource === 'manual') manualPriceDraft = { recommendMaxPriceEok: draft.recommendMaxPriceEok, recommendMaxPriceMan: draft.recommendMaxPriceMan };
    draft.recommendBudgetSource = source;
    if (source === 'manual') Object.assign(draft, manualPriceDraft);
    else {
      draft.recommendMaxPriceEok = initial.recommendBudgetSource === 'wecost' ? initial.recommendMaxPriceEok : '';
      draft.recommendMaxPriceMan = initial.recommendBudgetSource === 'wecost' ? initial.recommendMaxPriceMan : '';
    }
  }

  function position() {
    if (!anchor || !ui) return;
    const toolbar = ui.root.parentElement;
    const container = toolbar.getBoundingClientRect();
    const bounds = anchor.getBoundingClientRect();
    const width = Math.min(380, container.width - 24);
    ui.root.style.setProperty('--rqf-left', `${clamp(bounds.left - container.left, 12, Math.max(12, container.width - width - 12))}px`);
  }

  function refresh() {
    if (!ui || ui.root.hidden) return;
    const replacement = document.querySelector(`[data-quick-filter="${key}"]`);
    if (replacement) anchor = replacement;
    anchor?.setAttribute('aria-controls', ui.root.id);
    anchor?.setAttribute('aria-expanded', 'true');
    sync();
    position();
  }

  function mount() {
    if (ui) return true;
    const toolbar = document.querySelector('.recommendation-map-toolbar');
    if (!toolbar) return false;
    const root = node('section', 'rqf-popover');
    root.id = 'recommendationQuickFilter';
    root.hidden = true;
    root.tabIndex = -1;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'false');
    root.setAttribute('aria-labelledby', 'rqfHeading');
    const heading = node('h3');
    heading.id = 'rqfHeading';
    const header = node('header', 'rqf-header');
    const dismiss = button('×', 'close', 'rqf-close');
    dismiss.setAttribute('aria-label', '조건 팝업 닫기');
    header.append(heading, dismiss);
    const body = node('div', 'rqf-body');
    const source = node('p', 'rqf-source-hint');
    const error = node('p', 'rqf-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const busy = node('p', 'rqf-busy', '조회가 끝나면 조건을 적용할 수 있습니다.');
    busy.setAttribute('role', 'status');
    busy.hidden = true;
    const footer = node('footer', 'rqf-footer');
    const applyButton = button('조건 적용', 'apply', 'rqf-apply');
    footer.append(button('취소', 'close', 'rqf-cancel'), applyButton);
    root.append(header, body, source, error, busy, footer);
    toolbar.append(root);
    ui = { root, heading, body, source, error, busy, apply: applyButton };
    root.addEventListener('input', changed);
    root.addEventListener('change', changed);
    root.addEventListener('click', event => {
      const control = event.target.closest('[data-rqf-action]');
      if (!control || !root.contains(control)) return;
      const action = control.dataset.rqfAction;
      if (action === 'close') close();
      else if (action === 'apply') void apply();
      else if (action === 'full' && !applying) { const current = key; close({ returnFocus: false }); openFull(current); }
      else if (action === 'source' && !applying) { choosePriceSource(control.dataset.rqfSource); setError(); sync(); }
      else if (action === 'preset' && !applying) {
        if (key === 'price') choosePriceSource('manual');
        draft[control.dataset.rqfTarget] = control.dataset.rqfValue;
        if (key === 'price') { draft.recommendBudgetSource = 'manual'; draft.recommendMaxPriceMan = '0'; }
        setError();
        sync();
      }
    });
    document.addEventListener('pointerdown', event => {
      if (!root.hidden && !root.contains(event.target) && !anchor?.contains(event.target)) close({ returnFocus: false });
    });
    document.addEventListener('keydown', event => {
      if (root.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const focusable = [...root.querySelectorAll('button, input, select, [tabindex="0"]')].filter(item => !item.disabled && !item.hidden);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    });
    document.addEventListener('homehunt:viewchange', () => close({ returnFocus: false }));
    window.addEventListener('resize', position);
    return true;
  }

  function open(nextKey, nextAnchor) {
    if (!GROUPS[nextKey] || !mount()) return false;
    if (!ui.root.hidden && key === nextKey && anchor === nextAnchor) { close(); return false; }
    close({ returnFocus: false });
    key = nextKey;
    anchor = nextAnchor;
    initial = structuredClone(getValues());
    draft = structuredClone(initial);
    manualPriceDraft = { recommendMaxPriceEok: initial.recommendMaxPriceEok, recommendMaxPriceMan: initial.recommendMaxPriceMan };
    generation += 1;
    render();
    ui.root.hidden = false;
    anchor?.setAttribute('aria-controls', ui.root.id);
    anchor?.setAttribute('aria-expanded', 'true');
    position();
    ui.body.querySelector('input:not([type="range"]), button, select')?.focus();
    if (!ui.root.contains(document.activeElement)) ui.root.focus();
    return true;
  }

  return { open, close, refresh, isOpen: () => Boolean(ui && !ui.root.hidden) };
}
