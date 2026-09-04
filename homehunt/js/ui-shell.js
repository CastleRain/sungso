import { hhUI, clampPanelWidth } from './ui-state.js?v=3.0.1';

const VIEW_META = Object.freeze({
  recommend: { screen: 'finder', kicker: 'HOME FINDER', title: '집 찾기', placeholder: '단지명·동네 검색' },
  map: { screen: 'records', kicker: 'MY RECORDS', title: '내 기록 · 지도', placeholder: '단지명 검색 후 실거래 보기' },
  visits: { screen: 'records', kicker: 'MY RECORDS', title: '내 기록 · 목록', placeholder: '단지명 검색 후 실거래 보기' },
  market: { screen: 'market', kicker: 'ACTUAL DEALS', title: '실거래', placeholder: '서울·경기 단지명 검색' },
  supply: { screen: 'supply', kicker: 'NEW HOMES', title: '분양·청약', placeholder: '주변 아파트 단지 검색' },
  guide: { screen: 'guide', kicker: 'QUICK START', title: '사용 안내', placeholder: '알고 싶은 아파트 검색' },
  connections: { screen: 'health', kicker: 'DATA STATUS', title: '연결 상태', placeholder: '연결 후 확인할 단지 검색' },
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const SHEET_ACTION_LABELS = Object.freeze({
  peek: '결과 시트: 현재 최소, 누르면 절반 높이로 펼치기',
  half: '결과 시트: 현재 절반, 누르면 전체 화면으로 펼치기',
  full: '결과 시트: 현재 전체, 누르면 최소 높이로 접기',
});

function activeView() {
  return $('.app-view.active:not([hidden])')?.dataset.view || 'recommend';
}

function updateTopbar(view = activeView()) {
  const meta = VIEW_META[view] || VIEW_META.recommend;
  const kicker = $('#hhViewKicker');
  const title = $('#hhViewTitle');
  const input = $('#hhGlobalSearchInput');
  if (kicker) kicker.textContent = meta.kicker;
  if (title) title.textContent = meta.title;
  if (input) input.placeholder = meta.placeholder;
  document.body.dataset.hhScreen = meta.screen;
  hhUI.set({
    screen: meta.screen,
    subview: view === 'map' ? 'map' : view === 'visits' ? 'list' : hhUI.get().subview,
  });
}

function desktopPanelMax() {
  if (!window.matchMedia('(min-width: 1024px)').matches) return 560;
  const available = $('.hh-main')?.clientWidth || Math.max(0, document.documentElement.clientWidth - 76);
  return Math.max(360, Math.min(560, available - 480));
}

function effectivePanelWidth(requested) {
  return Math.min(clampPanelWidth(requested), desktopPanelMax());
}

function applyShellState(next) {
  const panelWidth = effectivePanelWidth(next.panelWidth);
  const panelMax = desktopPanelMax();
  document.documentElement.style.setProperty('--hh-panel-w', `${panelWidth}px`);
  document.documentElement.style.setProperty('--hh-panel-width-live', `${panelWidth}px`);
  document.body.classList.toggle('hh-panel-is-collapsed', next.panel === 'collapsed');
  document.body.classList.toggle('hh-filter-is-open', next.filterDrawer);
  document.body.dataset.hhSheet = next.sheet;
  const resultPanel = $('#recommendationResultPanel');
  if (resultPanel) {
    resultPanel.dataset.sheet = next.sheet;
    resultPanel.dataset.snap = next.sheet;
    const sheetHandle = $('.hh-sheet-handle', resultPanel);
    if (sheetHandle) sheetHandle.setAttribute('aria-label', SHEET_ACTION_LABELS[next.sheet]);
  }
  const recommendationMap = $('#recommendationMap');
  if (recommendationMap) recommendationMap.dataset.sheetSnap = next.sheet;
  const resizeHandle = $('#recommendationPanelResize');
  if (resizeHandle) {
    resizeHandle.setAttribute('aria-valuemin', '360');
    resizeHandle.setAttribute('aria-valuemax', String(panelMax));
    resizeHandle.setAttribute('aria-valuenow', String(panelWidth));
    resizeHandle.setAttribute('aria-valuetext', `후보 패널 너비 ${panelWidth}px`);
  }
}

function initPanelResize() {
  const handle = $('#recommendationPanelResize');
  if (!handle) return;
  let startX = 0;
  let startWidth = 0;

  const finish = (event) => {
    if (!handle.hasPointerCapture?.(event.pointerId)) return;
    handle.releasePointerCapture(event.pointerId);
    document.body.classList.remove('hh-panel-resizing');
  };

  handle.addEventListener('pointerdown', (event) => {
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    startX = event.clientX;
    startWidth = effectivePanelWidth(hhUI.get().panelWidth);
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('hh-panel-resizing');
    event.preventDefault();
  });
  handle.addEventListener('pointermove', (event) => {
    if (!handle.hasPointerCapture?.(event.pointerId)) return;
    hhUI.setPanelWidth(Math.min(desktopPanelMax(), clampPanelWidth(startWidth - (event.clientX - startX))));
  });
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = effectivePanelWidth(hhUI.get().panelWidth);
    const width = event.key === 'Home' ? 360
      : event.key === 'End' ? desktopPanelMax()
        : current + (event.key === 'ArrowLeft' ? 16 : -16);
    hhUI.setPanelWidth(Math.min(desktopPanelMax(), width));
  });
}

function initMobileSheet() {
  const panel = $('#recommendationResultPanel');
  if (!panel || $('.hh-sheet-handle', panel)) return;
  const handle = document.createElement('button');
  handle.className = 'hh-sheet-handle hh-sheet__handle';
  handle.type = 'button';
  handle.setAttribute('aria-label', SHEET_ACTION_LABELS[hhUI.get().sheet]);
  handle.innerHTML = '<strong>결과 시트</strong><small>눌러서 크기 변경</small>';
  handle.addEventListener('click', () => {
    const current = hhUI.get().sheet;
    hhUI.set({ sheet: current === 'peek' ? 'half' : current === 'half' ? 'full' : 'peek' });
  });
  panel.prepend(handle);
}

function initRailHints() {
  $$('.portal-nav-item').forEach((button) => {
    const label = $('span', button)?.textContent.trim();
    if (label && !button.title) button.title = label;
  });
}

function syncVisitRecordAction() {
  const action = $('#openVisitButton');
  const topbarActions = $('.hh-topbar-actions');
  if (!action || !topbarActions) return;
  const mobile = window.matchMedia('(max-width: 1023px)').matches;
  action.classList.toggle('hh-mobile-record-fab', mobile);
  if (mobile && action.parentElement !== document.body) document.body.append(action);
  if (!mobile && action.parentElement !== topbarActions) topbarActions.append(action);
}

function initShell() {
  hhUI.subscribe(applyShellState);
  initPanelResize();
  initMobileSheet();
  initRailHints();
  syncVisitRecordAction();
  updateTopbar();
  document.addEventListener('homehunt:viewchange', (event) => updateTopbar(event.detail?.view));
  const observer = new MutationObserver(() => updateTopbar());
  $$('.app-view').forEach((view) => observer.observe(view, { attributes: true, attributeFilter: ['class', 'hidden'] }));
  window.addEventListener('resize', () => {
    syncVisitRecordAction();
    applyShellState(hhUI.get());
  }, { passive: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initShell, { once: true });
else initShell();
