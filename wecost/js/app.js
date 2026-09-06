import { subscribeAll, updateSettings } from './firebase.js';
import { computeAll }   from './calc.js';
import { renderDashboard, registerDashboardHandlers } from './tab-dashboard.js';
import { initCashflowInputs, renderCashflow, onSavingsInput, onWedDateChange } from './tab-cashflow.js';
import { renderWedding, registerWeddingHandlers } from './tab-wedding.js';
import { renderHouse, initHouseInputs, registerHouseHandlers } from './tab-house.js';

// ===== 전역 상태 =====

const st = {
  settings:    {},
  items:       [],
  savings:     {},
  loans:       [],
  adjustments: [],
  // calc 결과
  monthsLeft:    0,
  soheeFinal:    0,
  sunwoFinal:    0,
  coupleSavings: 0,
  totalPlanned:  0,
  totalPaid:     0,
  totalBalance:  0,
  availCash:     0,
  totalMonthly:  0,
  houseBudget:   0,
  status:        'idle',
  // UI 상태
  _incSohee: false,
  _incSunwo: false,
};

let _currentTab   = 'dashboard';
let _unsubAll     = null;
let _initialized  = false;
let _supTimer     = null;

// ===== 초기화 =====

function init() {
  setLoader('Firebase 연결 중…');
  registerAllHandlers();

  _unsubAll = subscribeAll((snapshot) => {
    Object.assign(st, snapshot);

    // 첫 로드: Firebase에 저장된 체크박스 상태 복원 (이후엔 DOM 상태 우선)
    if (!_initialized) {
      const chkS = document.getElementById('chk-sohee-sup');
      const chkW = document.getElementById('chk-sunwo-sup');
      if (chkS) chkS.checked = snapshot.settings?.includeSupportSohee || false;
      if (chkW) chkW.checked = snapshot.settings?.includeSupportSunwo || false;
    }

    st._incSohee = document.getElementById('chk-sohee-sup')?.checked || false;
    st._incSunwo = document.getElementById('chk-sunwo-sup')?.checked || false;

    computeAll(st);
    rerender();

    if (!_initialized) {
      _initialized = true;
      hideLoader();
      setSyncStatus('connected');
      initCashflowInputs(st);
      initHouseInputs(st);
    } else {
      setSyncStatus('connected');
    }
  });
}

function rerender() {
  renderDashboard(st);
  if (_currentTab === 'cashflow') renderCashflow(st);
  if (_currentTab === 'wedding')  renderWedding(st);
  if (_currentTab === 'house')    renderHouse(st);
}

// ===== 탭 전환 =====

function showTab(name) {
  _currentTab = name;
  localStorage.setItem('wecost_tab', name);
  document.querySelectorAll('.tab-page').forEach(el => {
    el.classList.add('hidden');
    el.classList.remove('active');
  });
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === name);
  });
  const page = document.getElementById(`tab-${name}`);
  if (page) {
    page.classList.remove('hidden');
    page.classList.add('active');
  }

  if (name === 'cashflow') renderCashflow(st);
  if (name === 'wedding')  renderWedding(st);
  if (name === 'house')    renderHouse(st);
}

// ===== 핸들러 등록 =====

function registerAllHandlers() {
  // 탭 전환
  window._showTab = showTab;

  // 현금흐름 탭
  window._onSavingsInput = (field, el) => {
    onSavingsInput(field, el);
    // 즉시 로컬 반영 (Firebase snapshot 전)
    const s = st.savings;
    const map = {
      'sohee-cur': 'soheeCurrent', 'sohee-mon': 'soheeMonthly',
      'sunwo-cur': 'sunwoCurrent', 'sunwo-mon': 'sunwoMonthly',
    };
    if (map[field]) {
      s[map[field]] = Number(document.getElementById(`inp-${field}`)?.value.replace(/[^0-9]/g, '')) || 0;
      computeAll(st);
      renderCashflow(st);
      renderDashboard(st);
    }
  };
  window._onWedDateChange = () => {
    const val = document.getElementById('inp-wed-date')?.value;
    if (val) st.settings.weddingDate = val;
    computeAll(st);
    renderCashflow(st);
    renderDashboard(st);
    onWedDateChange();
  };

  // 결혼비용 탭
  window._toggleTable = (hdr) => {
    const body = document.getElementById('tbl-body-wrap');
    const icon = hdr.querySelector('.toggle-icon');
    if (!body) return;
    body.classList.toggle('hidden');
    if (icon) icon.textContent = body.classList.contains('hidden') ? '▼' : '▲';
  };
  window._manualRefresh = () => {
    setSyncStatus('syncing');
    setTimeout(() => setSyncStatus('connected'), 1200);
  };

  // 금액 입력 → 콤마 포맷 + 한국어 단위 힌트
  window._fmtMoneyHint = (el, hintId) => {
    const raw = el.value.replace(/[^0-9]/g, '');
    el.value  = raw ? Number(raw).toLocaleString() : '';
    const val = Number(raw) || 0;
    const hint = document.getElementById(hintId);
    if (!hint) return;
    if (val >= 100000000)      hint.textContent = `${(val / 100000000).toFixed(1)}억원`;
    else if (val >= 10000000)  hint.textContent = `${Math.round(val / 10000000).toLocaleString()}천만원`;
    else if (val >= 10000)     hint.textContent = `${Math.round(val / 10000).toLocaleString()}만원`;
    else                       hint.textContent = val > 0 ? `${val.toLocaleString()}원` : '';
  };

  // 부모님 지원금 입력 — 즉시 로컬 반영 + debounce Firebase 저장
  window._onSupportAmountChange = (person, el) => {
    const raw   = el.value.replace(/[^0-9]/g, '');
    el.value    = raw ? Number(raw).toLocaleString() : '';
    const val   = Number(raw) || 0;
    const field = person === 'sohee' ? 'parentSupportSohee' : 'parentSupportSunwo';
    // 한국어 단위 힌트 (won 형식으로 cash-*-sup 스팬 즉시 갱신)
    const hintEl = document.getElementById(person === 'sohee' ? 'cash-sohee-sup' : 'cash-sunwo-sup');
    if (hintEl) {
      if (val >= 100000000)      hintEl.textContent = `${(val / 100000000).toFixed(1)}억원`;
      else if (val >= 10000000)  hintEl.textContent = `${Math.round(val / 10000000).toLocaleString()}천만원`;
      else if (val >= 10000)     hintEl.textContent = `${Math.round(val / 10000).toLocaleString()}만원`;
      else                       hintEl.textContent = val > 0 ? `${val.toLocaleString()}원` : '';
    }

    if (!st.settings) st.settings = {};
    st.settings[field] = val;
    st._incSohee = document.getElementById('chk-sohee-sup')?.checked || false;
    st._incSunwo = document.getElementById('chk-sunwo-sup')?.checked || false;
    computeAll(st);
    renderHouse(st);
    renderDashboard(st);

    clearTimeout(_supTimer);
    _supTimer = setTimeout(() => updateSettings({ [field]: val }), 600);
  };

  // 결혼비용 항목 드로어 핸들러
  registerWeddingHandlers(() => st);

  // 대시보드 핸들러
  registerDashboardHandlers(() => st.availCash);

  // 집 시뮬레이션 핸들러
  let _chkTimer = null;
  registerHouseHandlers(
    () => ({ ...st }),
    () => {
      const incS = document.getElementById('chk-sohee-sup')?.checked || false;
      const incW = document.getElementById('chk-sunwo-sup')?.checked || false;
      st._incSohee = incS;
      st._incSunwo = incW;
      computeAll(st);
      renderHouse(st);
      renderDashboard(st);
      // 체크박스 상태 Firebase 저장 (debounce)
      clearTimeout(_chkTimer);
      _chkTimer = setTimeout(() => updateSettings({
        includeSupportSohee: incS,
        includeSupportSunwo: incW,
      }), 400);
    }
  );

  // 재시도
  window._retryInit = () => {
    if (_unsubAll) { try { _unsubAll(); } catch(e) {} }
    _initialized = false;
    init();
  };
}

// ===== 로더 / 동기화 상태 =====

function setLoader(msg) {
  const screen = document.getElementById('loading-screen');
  if (screen) screen.classList.remove('hidden');
  const el = document.getElementById('loader-msg');
  if (el) el.textContent = msg;
}

function hideLoader() {
  const screen = document.getElementById('loading-screen');
  if (screen) screen.classList.add('hidden');
  // 마지막 탭 복원
  const linkedTab = new URLSearchParams(location.search).get('tab');
  const restoredTab = linkedTab || localStorage.getItem('wecost_tab') || 'dashboard';
  showTab(['dashboard', 'cashflow', 'wedding', 'house'].includes(restoredTab) ? restoredTab : 'dashboard');
}

function setSyncStatus(state) {
  const dot  = document.getElementById('sync-dot');
  const text = document.getElementById('sync-text');
  const map  = {
    connected: { cls: '',        txt: '실시간 연결됨' },
    syncing:   { cls: 'saving',  txt: '동기화 중…'  },
    error:     { cls: 'error',   txt: '연결 오류'   },
  };
  const s = map[state] || map.connected;
  if (dot)  { dot.className = 'sync-dot ' + s.cls; }
  if (text) text.textContent = s.txt;
}

// ===== 시작 =====

init();
