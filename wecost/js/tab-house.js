import { won, wonFull, wonDetailed } from './utils.js';
import { calcLoanMonthly } from './calc.js';
import { addLoan, updateLoan, deleteLoan, addAdjustment, updateAdjustment, deleteAdjustment, updateSettings } from './firebase.js';

let _currentAvailCash = 0;

export function initHouseInputs(st) {
  const cfg = st.settings || {};

  // 부모님 지원금 입력 초기값 (최초 1회만)
  _initSupportInp('inp-sohee-sup', cfg.parentSupportSohee);
  _initSupportInp('inp-sunwo-sup', cfg.parentSupportSunwo);

  const limitEl = document.getElementById('inp-loan-limit');
  if (limitEl && cfg.monthlyPaymentLimit) limitEl.value = cfg.monthlyPaymentLimit;

  // 목표 집 가격 초기값
  const houseInp = document.getElementById('house-target-price');
  if (houseInp && !houseInp.dataset.userEdited && cfg.targetHousePrice) {
    houseInp.value = cfg.targetHousePrice.toLocaleString();
    const wonEl = document.getElementById('house-target-won');
    if (wonEl) wonEl.textContent = `≈ ${won(cfg.targetHousePrice)}`;
  }

  // 조정 항목 렌더
  renderAdjustments(st.adjustments || []);
}

export function renderHouse(st) {
  const cfg    = st.settings     || {};
  const loans  = st.loans        || [];
  const adjs   = st.adjustments  || [];
  const incS   = document.getElementById('chk-sohee-sup')?.checked || false;
  const incW   = document.getElementById('chk-sunwo-sup')?.checked || false;
  const supS   = incS ? (cfg.parentSupportSohee || 0) : 0;
  const supW   = incW ? (cfg.parentSupportSunwo || 0) : 0;

  const adjTotal = adjs.reduce((acc, a) => acc + (a.sign === '+' ? 1 : -1) * (a.amount || 0), 0);
  const avail    = Math.max(0, (st.coupleSavings || 0) - (st.totalPlanned || 0) + supS + supW + adjTotal);
  _currentAvailCash = avail;

  // 가용현금 카드
  _set('cash-savings',  won(st.coupleSavings || 0));
  _set('cash-wedding',  `-${won(st.totalPlanned || 0)}`);
  _set('cash-wedding-note', st.totalPlanned === 0 ? '(결혼비용 탭에서 연동)' : '(Firebase 연동)');
  // 지원금 레이블(won 형식) + 입력값 동기화 (포커스 중이 아닐 때만)
  _set('cash-sohee-sup', cfg.parentSupportSohee > 0 ? won(cfg.parentSupportSohee) : '');
  _set('cash-sunwo-sup', cfg.parentSupportSunwo > 0 ? won(cfg.parentSupportSunwo) : '');
  _syncSupportInp('inp-sohee-sup', cfg.parentSupportSohee);
  _syncSupportInp('inp-sunwo-sup', cfg.parentSupportSunwo);
  _set('cash-available', wonDetailed(avail));

  // 조정 항목 (매 렌더마다 갱신)
  renderAdjustments(adjs);

  // 대출 카드
  renderLoans(loans, avail);

  // 프리셋 카드
  renderPresetCards();

  // 목표 집 가격 계산기 결과 갱신 (입력값 유지 + availCash만 갱신)
  const hInp = document.getElementById('house-target-price');
  if (hInp && hInp.value) {
    const price = Number(hInp.value.replace(/[^0-9]/g, '')) || 0;
    if (price > 0) _renderHouseSimResult(price, avail, st.settings?.monthlyPaymentLimit || 0);
  }
}

export function renderLoans(loans, availCash) {
  const grid = document.getElementById('loan-grid');
  if (!grid) return;
  grid.innerHTML = '';

  let totalMonthly = 0;
  loans.forEach((loan) => {
    const monthly  = calcLoanMonthly(loan);
    const enabled  = loan.enabled !== false;
    if (enabled) totalMonthly += monthly;
    const isCompany = loan.type === 'company';
    const typeOpts = isCompany
      ? `<option value="company" selected>사내대출 (무이자거치+원리금균등)</option>`
      : ['원리금', '원금', '만기'].map(t =>
          `<option value="${t}" ${loan.type === t ? 'selected' : ''}>${{ 원리금: '원리금균등', 원금: '원금균등', 만기: '만기일시' }[t]}</option>`
        ).join('');

    const noteText = (loan.grace || 0) > 0
      ? (isCompany
          ? `초기 ${loan.grace}년 무이자 거치, 이후 ${loan.term - loan.grace}년 원리금균등`
          : `${loan.grace}년 거치 후 ${loan.term - loan.grace}년 상환 기준`)
      : '상환 개시 후 월 납입 기준';

    const div = document.createElement('div');
    div.className = `loan-card${enabled ? '' : ' disabled-card'}`;
    div.innerHTML = `
      <div class="loan-card-hdr">
        <input class="loan-name-inp" type="text" value="${_esc(loan.name)}"
               onchange="window._updateLoan('${loan.id}','name',this.value)">
        <div style="display:flex;align-items:center;gap:8px">
          <label class="loan-enabled-row" style="margin:0">
            <input type="checkbox" ${enabled ? 'checked' : ''}
                   onchange="window._updateLoan('${loan.id}','enabled',this.checked)">
            활성
          </label>
          <button class="btn btn-danger btn-sm" onclick="window._deleteLoan('${loan.id}')">삭제</button>
        </div>
      </div>
      <div class="loan-form">
        <div class="inp-grp"><label>대출금액 (원)</label>
          <input type="number" value="${loan.amount || 0}"
                 oninput="window._updateLoan('${loan.id}','amount',this.value)"></div>
        <div class="inp-grp"><label>연 금리 (%)</label>
          <input type="number" step="0.1" value="${loan.rate || 0}"
                 oninput="window._updateLoan('${loan.id}','rate',this.value)"></div>
        <div class="inp-grp"><label>총 기간 (년)</label>
          <input type="number" value="${loan.term || 30}" ${isCompany ? 'readonly' : ''}
                 oninput="window._updateLoan('${loan.id}','term',this.value)"></div>
        <div class="inp-grp"><label>거치 (년)</label>
          <input type="number" value="${loan.grace || 0}" ${isCompany ? 'readonly' : ''}
                 oninput="window._updateLoan('${loan.id}','grace',this.value)"></div>
        <div class="inp-grp"><label>상환방식</label>
          <select ${isCompany ? 'disabled' : ''}
                  onchange="window._updateLoan('${loan.id}','type',this.value)">${typeOpts}</select></div>
      </div>
      <div class="loan-result">
        <span class="loan-result-note">${noteText}</span>
        <span class="loan-result-val">월 ${wonFull(monthly)}</span>
      </div>
    `;
    grid.appendChild(div);
  });

  _set('tl-total', wonFull(totalMonthly));
  const limit = Number(document.getElementById('inp-loan-limit')?.value) || 0;
  const badge = document.getElementById('tl-status');
  if (badge) {
    if (limit === 0 || totalMonthly === 0) {
      badge.textContent = '-'; badge.className = 'tl-status';
    } else if (totalMonthly <= limit * 0.8) {
      badge.textContent = '안전'; badge.className = 'tl-status status-safe';
    } else if (totalMonthly <= limit) {
      badge.textContent = '주의'; badge.className = 'tl-status status-caution';
    } else {
      badge.textContent = '한도 초과!'; badge.className = 'tl-status status-warn';
    }
  }
}

export function renderPresetCards() {
  const rate   = Number(document.getElementById('preset-rate')?.value  || 3.5);
  const term   = Number(document.getElementById('preset-term')?.value  || 30);
  const avail  = _currentAvailCash;
  const grid   = document.getElementById('preset-grid');
  if (!grid) return;

  // 집 가격별 관점: 가용현금 기준으로 각 집 가격에 필요한 대출 계산
  const housePrices = [200000000, 300000000, 400000000, 500000000, 600000000, 700000000];
  grid.innerHTML = housePrices.map(price => {
    const loanAmt = Math.max(0, price - avail);
    const monthly = loanAmt > 0 ? calcLoanMonthly({ amount: loanAmt, rate, term, grace: 0, type: '원리금' }) : 0;
    const canAfford = loanAmt <= avail * 2;
    return `
      <div class="preset-card">
        <div class="preset-loan-lbl">집 가격</div>
        <div class="preset-house-price">${won(price)}</div>
        <div class="preset-loan-lbl" style="margin-top:6px">필요 대출 ${won(loanAmt)}</div>
        <div class="preset-monthly-val">${monthly > 0 ? `월 ${wonFull(monthly)}` : '대출 불필요'}</div>
        <div class="preset-detail">현금 ${won(avail)} + 대출 ${won(loanAmt)}</div>
      </div>
    `;
  }).join('');
}

function _renderHouseSimResult(price, availCash, limit) {
  const loan    = Math.max(0, price - availCash);
  const monthly = loan > 0
    ? calcLoanMonthly({ amount: loan, rate: 3.5, term: 30, grace: 0, type: '원리금' })
    : 0;

  _set('house-sim-avail',   wonDetailed(availCash));
  _set('house-sim-loan',    loan > 0 ? wonDetailed(loan) : '대출 불필요');
  _set('house-sim-monthly', monthly > 0 ? wonFull(monthly) : '-');

  const statusEl  = document.getElementById('house-sim-status');
  const statusBox = document.getElementById('house-sim-status-box');
  if (statusEl) {
    if (limit <= 0 || monthly <= 0) {
      statusEl.textContent = '-';
      if (statusBox) statusBox.className = 'sim-result-box';
    } else if (monthly <= limit * 0.8) {
      statusEl.textContent = '가능';
      if (statusBox) statusBox.className = 'sim-result-box r-house';
      statusEl.style.color = 'var(--income)';
    } else if (monthly <= limit) {
      statusEl.textContent = '주의';
      if (statusBox) statusBox.className = 'sim-result-box';
      statusEl.style.color = 'var(--warning)';
    } else {
      statusEl.textContent = '초과';
      if (statusBox) statusBox.className = 'sim-result-box r-loan';
      statusEl.style.color = 'var(--expense)';
    }
  }

  const grid = document.getElementById('house-sim-grid');
  if (grid) grid.style.display = '';
}

function renderAdjustments(adjs) {
  const container = document.getElementById('extra-expenses-list');
  if (!container) return;
  // 조정 항목 텍스트 입력 중에만 재렌더 생략 (버튼 포커스는 허용)
  const active = document.activeElement;
  const isTyping = active && container.contains(active) &&
    (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  if (isTyping) return;
  container.innerHTML = '';
  adjs.forEach(adj => _appendAdjRow(container, adj));
}

function _appendAdjRow(container, adj) {
  const sign    = adj.sign || '-';
  const cls     = sign === '+' ? 'plus' : 'minus';
  const hintCls = sign === '+' ? 'inc' : 'exp';
  const hintId  = `adj-hint-${adj.id || 'new'}`;
  const amtHint = _adjHintText(sign, adj.amount || 0);
  const row     = document.createElement('div');
  row.className  = 'exp-row';
  row.dataset.id = adj.id || '';
  row.innerHTML  = `
    <button class="exp-sign-btn ${cls}" title="클릭해서 +수입/−지출 전환"
            onclick="window._toggleAdjSign(this, '${adj.id}')">${sign}</button>
    <input class="exp-inp-name" type="text"
           placeholder="${sign === '+' ? '항목명 (예: 이사비 지원)' : '항목명 (예: 가전제품 구입)'}"
           value="${_esc(adj.name || '')}"
           onchange="window._updateAdjField('${adj.id}','name',this.value)">
    <input class="exp-inp-amt" type="text" inputmode="numeric"
           placeholder="0"
           value="${adj.amount > 0 ? adj.amount.toLocaleString() : ''}"
           oninput="window._onAdjAmtInput(this, '${adj.id}', '${hintId}')">
    <span class="exp-won-hint ${hintCls}" id="${hintId}">${amtHint}</span>
    <button class="exp-del-btn" onclick="window._deleteAdjustment('${adj.id}')">✕</button>
  `;
  container.appendChild(row);
}

function _adjHintText(sign, val) {
  if (!val || val <= 0) return '';
  let s;
  if (val >= 100000000)     s = `${(val / 100000000).toFixed(1)}억`;
  else if (val >= 10000000) s = `${Math.round(val / 10000000)}천만`;
  else if (val >= 10000)    s = `${Math.round(val / 10000)}만`;
  else                      s = `${val.toLocaleString()}`;
  return (sign === '+' ? '+' : '−') + s;
}

// ===== 전역 핸들러 =====

export function registerHouseHandlers(getStFn, recomputeFn) {
  window._syncAmt = (src) => {
    let raw;
    if (src === 'slider') {
      raw = Number(document.getElementById('add-loan-slider').value);
      const el = document.getElementById('add-loan-amt-inp');
      if (el) el.value = raw ? raw.toLocaleString() : '0';
    } else {
      raw = Number(document.getElementById('add-loan-amt-inp').value.replace(/[^0-9]/g, '')) || 0;
      const clamped = Math.min(1000000000, Math.max(0, Math.round(raw / 10000000) * 10000000));
      const slider  = document.getElementById('add-loan-slider');
      if (slider) slider.value = clamped;
      const el = document.getElementById('add-loan-amt-inp');
      if (el) el.value = raw ? raw.toLocaleString() : '';
    }
    const lbl = document.getElementById('add-loan-won-lbl');
    if (lbl) lbl.textContent = raw ? won(raw) : '';
  };

  window._addLoanFromForm = async () => {
    const amount = Number(document.getElementById('add-loan-amt-inp')?.value.replace(/[^0-9]/g, '')) || 0;
    if (!amount) { alert('대출 금액을 입력해주세요.'); return; }
    await addLoan({
      name:    document.getElementById('add-loan-name')?.value  || '대출',
      amount,
      rate:    Number(document.getElementById('add-loan-rate')?.value)  || 3.5,
      term:    Number(document.getElementById('add-loan-term')?.value)  || 30,
      grace:   Number(document.getElementById('add-loan-grace')?.value) || 0,
      type:    document.getElementById('add-loan-type')?.value   || '원리금',
      enabled: true,
    });
  };

  window._updateLoan = async (id, key, val) => {
    const parsed = (key === 'name' || key === 'type') ? val
                 : key === 'enabled' ? (val === true || val === 'true')
                 : Number(val);
    await updateLoan(id, { [key]: parsed });
  };

  window._deleteLoan = async (id) => {
    await deleteLoan(id);
  };

  window._updatePresetRate = () => {
    const v = Number(document.getElementById('preset-rate')?.value || 3.5).toFixed(1);
    const disp = document.getElementById('preset-rate-display');
    if (disp) disp.textContent = v;
    renderPresetCards();
  };
  window._renderPresetCards = renderPresetCards;

  let _houseTargetTimer = null;
  window._onHouseTargetInput = (el) => {
    el.dataset.userEdited = '1';
    const raw   = Number(el.value.replace(/[^0-9]/g, '')) || 0;
    const wonEl = document.getElementById('house-target-won');
    if (wonEl) wonEl.textContent = raw ? `≈ ${won(raw)}` : '';

    const st  = getStFn();
    const lim = st.settings?.monthlyPaymentLimit || 0;
    if (raw > 0) _renderHouseSimResult(raw, _currentAvailCash, lim);
    else {
      const grid = document.getElementById('house-sim-grid');
      if (grid) grid.style.display = 'none';
    }

    clearTimeout(_houseTargetTimer);
    _houseTargetTimer = setTimeout(async () => {
      if (raw > 0) await updateSettings({ targetHousePrice: raw });
    }, 800);
  };

  window._onSupportToggle = () => recomputeFn();

  window._onLimitChange = async () => {
    const val = Number(document.getElementById('inp-loan-limit')?.value) || 0;
    await updateSettings({ monthlyPaymentLimit: val });
  };

  window._addAdjustment = async (sign = '-') => {
    await addAdjustment({ name: '', amount: 0, sign });
  };

  window._onAdjAmtInput = (el, id, hintId) => {
    const raw  = el.value.replace(/[^0-9]/g, '');
    el.value   = raw ? Number(raw).toLocaleString() : '';
    const val  = Number(raw) || 0;
    // 행의 sign 버튼에서 현재 부호 읽기
    const row  = el.closest('.exp-row');
    const sign = row?.querySelector('.exp-sign-btn')?.textContent?.trim() || '-';
    const hint = document.getElementById(hintId);
    if (hint) {
      hint.textContent = _adjHintText(sign, val);
      hint.className   = `exp-won-hint ${sign === '+' ? 'inc' : 'exp'}`;
    }
    if (id && id !== 'undefined') {
      clearTimeout(window._adjAmtTimer);
      window._adjAmtTimer = setTimeout(() => updateAdjustment(id, { amount: val }), 600);
    } else {
      recomputeFn();
    }
  };

  window._toggleAdjSign = async (btn, id) => {
    const newSign = btn.textContent === '-' ? '+' : '-';
    btn.textContent = newSign;
    btn.className = `exp-sign-btn ${newSign === '+' ? 'plus' : 'minus'}`;
    if (id && id !== 'undefined') await updateAdjustment(id, { sign: newSign });
    else recomputeFn();
  };

  window._updateAdjField = async (id, field, val) => {
    if (id && id !== 'undefined') {
      const parsed = field === 'name' ? val : Number(val) || 0;
      await updateAdjustment(id, { [field]: parsed });
    } else {
      recomputeFn();
    }
  };

  window._deleteAdjustment = async (id) => {
    if (id && id !== 'undefined') await deleteAdjustment(id);
    else {
      const row = document.querySelector(`.exp-row[data-id=""]`);
      if (row) { row.remove(); recomputeFn(); }
    }
  };
}

function _initSupportInp(id, val) {
  const el = document.getElementById(id);
  if (!el || el.dataset.init) return;
  el.value = val > 0 ? Math.round(val).toLocaleString() : '';
  el.dataset.init = '1';
}

function _syncSupportInp(id, val) {
  const el = document.getElementById(id);
  if (!el || document.activeElement === el) return;
  el.value = val > 0 ? Math.round(val).toLocaleString() : '';
}

function _set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function _esc(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
