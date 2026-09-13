import { won, wonFull, wonDetailed, dday } from './utils.js';
import { calcLoanMonthly } from './calc.js';
import { updateSettings } from './firebase.js';

let _targetTimer = null;

export function renderDashboard(st) {
  const avail   = st.availCash    || 0;
  const budget  = st.houseBudget  || 0;
  const monthly = st.totalMonthly || 0;
  const status  = st.status       || 'idle';
  const limit   = st.settings?.monthlyPaymentLimit || 0;

  // 체크리스트
  renderChecklist(st);

  // 4 결론 카드 — 빈 상태 처리
  const hasAnySavings = (st.coupleSavings || 0) > 0;
  const hasItems      = (st.items || []).length > 0;

  if (!hasAnySavings && !hasItems) {
    _setEmpty('db-avail-cash', '계산 대기', '저축액과 결혼비용을 먼저 입력해보세요.');
    _setEmpty('db-house-budget', '계산 대기', '목표 집 가격 또는 대출 조건이 필요해요.');
  } else {
    const cashEl = document.getElementById('db-avail-cash');
    if (cashEl) { cashEl.textContent = wonDetailed(avail); cashEl.classList.remove('pending'); }
    _set('db-avail-sub', `저축 ${won(st.coupleSavings || 0)} - 결혼비용 ${won(st.totalPlanned || 0)}`);

    const budgetEl = document.getElementById('db-house-budget');
    if (budgetEl) { budgetEl.textContent = wonDetailed(budget); budgetEl.classList.remove('pending'); }
    _set('db-house-sub', budget === avail ? '대출 없음' : `현금 ${won(avail)} + 대출 합산`);
  }

  if (monthly > 0) {
    const mEl = document.getElementById('db-monthly');
    if (mEl) { mEl.textContent = wonFull(monthly); mEl.classList.remove('pending'); }
    _set('db-monthly-sub', `활성 대출 ${(st.loans || []).filter(l => l.enabled !== false).length}건`);
  } else {
    _set('db-monthly', '-');
    _set('db-monthly-sub', '활성 대출이 없어요.');
  }

  const statusCard = document.getElementById('db-status-card');
  const statusVal  = document.getElementById('db-status-val');
  if (statusVal) {
    const map = {
      idle:    { text: '-',    cls: '',           sub: '월 한도 또는 대출 없음' },
      safe:    { text: '안전', cls: 'mc-income',  sub: `한도의 ${limit > 0 ? Math.round(monthly / limit * 100) : 0}%` },
      caution: { text: '주의', cls: 'mc-warning', sub: `한도 ${won(limit)} 근접` },
      over:    { text: '초과!', cls: 'mc-expense', sub: `한도 ${won(limit)} 초과` },
    };
    const s = map[status] || map.idle;
    statusVal.textContent = s.text;
    _set('db-status-sub', s.sub);
    if (statusCard) statusCard.className = `metric-card ${s.cls}`;
  }

  // 현금흐름 계산식
  _renderFlowEquation(st);

  // 다음 납부 일정
  _renderUpcoming(st);

  // 목표 집 가격 입력 초기값
  const inp = document.getElementById('db-target-price');
  if (inp && !inp.dataset.userEdited && st.settings?.targetHousePrice) {
    const v = st.settings.targetHousePrice;
    inp.value = v.toLocaleString();
    inp.dataset.init = '1';
    _computeSimResult(v, avail);
  }
}

// ===== 체크리스트 =====

export function renderChecklist(st) {
  const card = document.getElementById('db-checklist');
  if (!card) return;

  const checks = [
    {
      label: '결혼 예정일',
      done:  !!st.settings?.weddingDate,
      tab:   'cashflow',
      btnTxt: '결혼일 입력',
    },
    {
      label: '소희 저축액',
      done:  ((st.savings?.soheeCurrent || 0) + (st.savings?.soheeMonthly || 0)) > 0,
      tab:   'cashflow',
      btnTxt: '저축 입력',
    },
    {
      label: '성우 저축액',
      done:  ((st.savings?.sunwoCurrent || 0) + (st.savings?.sunwoMonthly || 0)) > 0,
      tab:   'cashflow',
      btnTxt: '저축 입력',
    },
    {
      label: '결혼비용 항목',
      done:  (st.items || []).length > 0,
      tab:   'wedding',
      btnTxt: '비용 추가',
    },
    {
      label: '목표 집 가격',
      done:  (st.settings?.targetHousePrice || 0) > 0,
      tab:   'house',
      btnTxt: '집 가격 설정',
    },
    {
      label: '대출 조건',
      done:  (st.loans || []).length > 0,
      tab:   'house',
      btnTxt: '대출 추가',
    },
  ];

  const doneCount = checks.filter(c => c.done).length;
  const total     = checks.length;
  const allDone   = doneCount === total;

  if (allDone) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');

  const pendingItems = checks.filter(c => !c.done);
  card.innerHTML = `
    <div class="checklist-hdr">
      <div>
        <div class="checklist-title">시작 전 입력이 필요해요 (${doneCount}/${total} 완료)</div>
        <div class="checklist-sub">아래 항목을 입력하면 계산 결과가 나타나요.</div>
      </div>
    </div>
    <div class="checklist-items">
      ${checks.map(c => `
        <div class="cl-item ${c.done ? 'done' : 'pending'}">
          <span class="cl-icon">${c.done ? '✅' : '○'}</span>
          <span class="cl-label">${c.label}</span>
          ${!c.done ? `<button class="cl-btn" onclick="window._showTab('${c.tab}')">${c.btnTxt}</button>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

// ===== 현금흐름 계산식 =====

function _renderFlowEquation(st) {
  const savings  = st.coupleSavings || 0;
  const support  = (st._incSohee ? st.settings?.parentSupportSohee || 0 : 0)
                 + (st._incSunwo ? st.settings?.parentSupportSunwo || 0 : 0);
  const adjTotal = (st.adjustments || []).reduce((a, b) => a + (b.sign === '+' ? 1 : -1) * (b.amount || 0), 0);
  const wedding  = st.totalPlanned || 0;
  const avail    = Math.max(0, savings - wedding + support + adjTotal);

  _set('feq-savings-val', wonDetailed(savings));
  _set('feq-support-val', support !== 0 ? wonDetailed(support) : '₩0');
  _set('feq-adjust-val',  adjTotal !== 0 ? (adjTotal > 0 ? '+' : '') + wonDetailed(adjTotal) : '₩0');
  _set('feq-wedding-val', wonDetailed(wedding));
  _set('feq-result-val',  wonDetailed(avail));
  _set('db-flow-total', `총 ${wonDetailed(savings + support + adjTotal)}`);

  // 미니 바 (보조)
  const total = Math.max(savings + Math.abs(support) + Math.abs(adjTotal), 1);
  _setWidth('db-seg-saving',  pct(savings, total));
  _setWidth('db-seg-support', pct(Math.abs(support), total));
  _setWidth('db-seg-extra',   pct(Math.abs(adjTotal), total));
  _setWidth('db-seg-wedding', pct(wedding, total));
  _setWidth('db-seg-remain',  pct(avail, total));
}

// ===== 다음 납부 일정 =====

function _renderUpcoming(st) {
  const list = document.getElementById('db-upcoming');
  if (!list) return;
  const items = (st.items || [])
    .filter(i => i.balanceDue && (i.balance || 0) > 0)
    .map(i => ({ ...i, _d: dday(i.balanceDue) }))
    .filter(i => i._d !== null && i._d >= -3)
    .sort((a, b) => a._d - b._d)
    .slice(0, 5);

  if (items.length === 0) {
    list.innerHTML = '<p class="upcoming-empty">임박한 납부 일정이 없어요.</p>';
    return;
  }

  list.innerHTML = items.map(item => {
    const d    = item._d;
    const mod  = d < 0 ? '' : d <= 7 ? 'urg' : d <= 30 ? 'soon' : 'norm';
    const ddTxt = d < 0 ? `D+${Math.abs(d)}` : d === 0 ? 'D-Day!' : `D-${d}`;
    return `
      <div class="upcoming-item ${mod}">
        <div class="upcoming-dday ${mod}">${ddTxt}</div>
        <div style="flex:1">
          <div class="upcoming-name">${item.name}</div>
          <div class="upcoming-date">${item.balanceDue?.replace(/-/g, '/')} · ${item.cat || ''}</div>
        </div>
        <div class="upcoming-amt">${won(item.balance)}</div>
      </div>
    `;
  }).join('');
}

// ===== 목표 집 가격 시뮬레이터 =====

function _computeSimResult(price, availCash) {
  if (!price || price <= 0) {
    const grid = document.getElementById('db-sim-grid');
    if (grid) grid.style.display = 'none';
    return;
  }
  const loan    = Math.max(0, price - availCash);
  const monthly = loan > 0
    ? calcLoanMonthly({ amount: loan, rate: 3.5, term: 30, grace: 0, type: '원리금' })
    : 0;

  _set('db-sim-loan',     loan > 0 ? wonDetailed(loan) : '대출 불필요');
  _set('db-sim-loan-sub', loan > 0 ? `집 ${wonDetailed(price)} - 현금 ${won(availCash)}` : `현금 ${won(availCash)}으로 충분`);
  _set('db-sim-monthly',  monthly > 0 ? wonFull(monthly) : '-');
  _set('db-sim-monthly-sub', monthly > 0 ? '원리금균등 3.5% 30년 기준' : '');

  const grid = document.getElementById('db-sim-grid');
  if (grid) grid.style.display = '';
}

export function registerDashboardHandlers(getAvailCashFn) {
  window._onTargetPriceInput = (el) => {
    el.dataset.userEdited = '1';
    const raw = Number(el.value.replace(/[^0-9]/g, '')) || 0;
    const wonEl = document.getElementById('db-target-won');
    if (wonEl) wonEl.textContent = raw ? `≈ ${_won(raw)}` : '';

    _computeSimResult(raw, getAvailCashFn());

    clearTimeout(_targetTimer);
    _targetTimer = setTimeout(async () => {
      if (raw > 0) await updateSettings({ targetHousePrice: raw });
    }, 800);
  };
}

// ===== 내부 유틸 =====

function _setEmpty(id, valTxt, subTxt) {
  const el = document.getElementById(id);
  if (el) { el.textContent = valTxt; el.classList.add('pending'); }
  const sub = id.replace('db-', 'db-') + '-sub';
  // sub ID 패턴: db-avail-cash → db-avail-sub, db-house-budget → db-house-sub
  const subMap = {
    'db-avail-cash':    'db-avail-sub',
    'db-house-budget':  'db-house-sub',
    'db-monthly':       'db-monthly-sub',
    'db-status-val':    'db-status-sub',
  };
  const subEl = document.getElementById(subMap[id] || id + '-sub');
  if (subEl) subEl.textContent = subTxt;
}

function _won(n) {
  if (!n && n !== 0) return '-';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return `${sign}₩${(abs / 100000000).toFixed(1).replace(/\.0$/, '')}억`;
  if (abs >= 10000)     return `${sign}₩${Math.round(abs / 10000)}만`;
  return `${sign}₩${abs.toLocaleString()}`;
}

function pct(a, b) { return b === 0 ? 0 : Math.round(Math.max(0, Math.min(100, a / b * 100))); }
function _set(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function _setWidth(id, w) { const el = document.getElementById(id); if (el) el.style.width = w + '%'; }
