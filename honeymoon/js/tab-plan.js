// tab-plan.js — "우리의 플랜" 탭 렌더링 모듈
import { RESORTS, getFeaturedImage, getBestPrice } from './resorts-data.js';
import { subscribePicks, subscribeItinerary, removePick, setFinalCandidates,
         setConfirmedResort, setItinerary } from './firebase-picks.js';

const ROUTE_NODES = [
  { city: '인천',       emoji: '✈️',  nights: null, status: 'confirmed', label: '출발' },
  { city: '싱가폴',     emoji: '🇸🇬', nights: 2,    status: 'pending',   label: '경유·관광' },
  { city: '말레/몰디브', emoji: '🌊',  nights: 5,    status: 'pending',   label: '리조트 (미정)' },
  { city: '인천',       emoji: '🏠',  nights: null, status: 'pending',   label: '귀국' },
];

const RANK_EMOJI  = ['🥇', '🥈', '🥉'];
const RANK_LABELS = ['1위', '2위', '3위'];

const TRIP_TEMPLATE = [
  { day: 1, date: '2027-03-07', city: '인천 → 싱가폴', title: '출발', transport: '인천공항 출발', stay: '싱가폴 호텔', items: [
    { type: 'transport', text: '인천공항 집결', time: '' },
    { type: 'flight',    text: '싱가폴 창이공항 도착', time: '' },
    { type: 'hotel',     text: '호텔 체크인', time: '' },
  ]},
  { day: 2, date: '2027-03-08', city: '싱가폴', title: '싱가폴 관광', transport: null, stay: '싱가폴 호텔', items: [
    { type: 'activity', text: '마리나베이샌즈', time: '' },
    { type: 'activity', text: '가든스바이더베이', time: '' },
    { type: 'rest',     text: '야경 감상', time: '21:00' },
  ]},
  { day: 3, date: '2027-03-09', city: '싱가폴 → 몰디브', title: '몰디브 이동', transport: '싱가폴 → 말레 비행 + 리조트 이동', stay: '{{resort}}', items: [
    { type: 'flight',    text: '창이공항 출발', time: '' },
    { type: 'flight',    text: '말레 도착', time: '' },
    { type: 'transport', text: '리조트 이동', time: '' },
    { type: 'hotel',     text: '체크인', time: '' },
  ]},
  { day: 4, date: '2027-03-10', city: '몰디브', title: '리조트 Day 2', transport: null, stay: '{{resort}}', items: [
    { type: 'meal',     text: '조식', time: '08:00' },
    { type: 'activity', text: '스노클링', time: '' },
    { type: 'activity', text: '선셋 크루즈', time: '' },
  ]},
  { day: 5, date: '2027-03-11', city: '몰디브', title: '리조트 Day 3', transport: null, stay: '{{resort}}', items: [
    { type: 'meal',     text: '조식', time: '08:00' },
    { type: 'activity', text: '수중 액티비티', time: '' },
    { type: 'rest',     text: '스파', time: '' },
  ]},
  { day: 6, date: '2027-03-12', city: '몰디브', title: '리조트 Day 4', transport: null, stay: '{{resort}}', items: [
    { type: 'meal',     text: '조식', time: '08:00' },
    { type: 'activity', text: '다이빙', time: '' },
    { type: 'activity', text: '커플 사진 촬영', time: '' },
  ]},
  { day: 7, date: '2027-03-13', city: '몰디브', title: '리조트 마지막날', transport: '리조트 → 말레 공항', stay: '{{resort}}', items: [
    { type: 'meal',   text: '조식', time: '08:00' },
    { type: 'hotel',  text: '체크아웃', time: '' },
    { type: 'flight', text: '출국', time: '' },
  ]},
  { day: 8, date: '2027-03-14', city: '인천', title: '귀국', transport: '말레 → 인천 도착', stay: null, items: [
    { type: 'flight', text: '귀국', time: '' },
    { type: 'rest',   text: '수고했어요! 💕', time: '' },
  ]},
];

const ITEM_TYPES = {
  flight:    { icon: '✈',  label: '항공',     color: '#4A90D9', bg: '#EBF4FF' },
  hotel:     { icon: '🏨', label: '숙박',     color: '#7B68EE', bg: '#F0EEFF' },
  transport: { icon: '🚌', label: '이동',     color: '#E67E22', bg: '#FEF4EA' },
  meal:      { icon: '🍽', label: '식사',     color: '#27AE60', bg: '#EAFAF1' },
  activity:  { icon: '🏄', label: '액티비티', color: '#1D9E75', bg: '#E6F6F1' },
  rest:      { icon: '😴', label: '휴식',     color: '#8E8E93', bg: '#F5F5F7' },
  memo:      { icon: '📝', label: '메모',     color: '#888',    bg: '#F9F9F9' },
};
const ITEM_TYPE_ORDER = ['flight', 'hotel', 'transport', 'meal', 'activity', 'rest', 'memo'];

// ── 모듈 상태 ─────────────────────────────────────────────────────────
let _openDetailFn = null;
let _picksUnsub   = null;
let _itiUnsub     = null;
let _currentDays  = [];
let _editMode     = {};   // { [dayIndex]: boolean }
let _saveTimer    = null;
let _saveStatus   = 'idle';
let _lastSaveTime = 0;

// ── 유틸 ──────────────────────────────────────────────────────────────
const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function normalizeItem(item) {
  if (typeof item === 'string') return { type: 'memo', text: item, time: '' };
  return { type: item.type || 'memo', text: item.text || '', time: item.time || '' };
}

function _updateSaveStatus(status) {
  _saveStatus = status;
  const el = document.getElementById('itiSaveStatus');
  if (!el) return;
  if (status === 'idle')         { el.textContent = ''; el.className = 'iti-save-status'; }
  else if (status === 'saving')  { el.textContent = '저장 중...'; el.className = 'iti-save-status status-saving'; }
  else if (status === 'saved')   {
    el.textContent = '✓ 저장됨'; el.className = 'iti-save-status status-saved';
    setTimeout(() => { if (_saveStatus === 'saved') _updateSaveStatus('idle'); }, 2500);
  }
  else if (status === 'error')   { el.textContent = '저장 실패'; el.className = 'iti-save-status status-error'; }
}

function _scheduleSave() {
  clearTimeout(_saveTimer);
  _updateSaveStatus('saving');
  _saveTimer = setTimeout(async () => {
    try {
      _lastSaveTime = Date.now();
      await setItinerary(_currentDays);
      _updateSaveStatus('saved');
    } catch {
      _updateSaveStatus('error');
      window._showToast?.('저장 실패', 'error');
    }
  }, 800);
}

function _rerenderDayCard(dayIndex) {
  const old = document.querySelector(`.itinerary-day[data-day-index="${dayIndex}"]`);
  if (!old) return;
  const d = _currentDays[dayIndex];
  if (!d) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = _renderDayCard(d, dayIndex);
  old.replaceWith(tmp.firstElementChild);
}

// ── initPlan ──────────────────────────────────────────────────────────
export function initPlan({ openDetailFn }) {
  _openDetailFn = openDetailFn;
  _editMode = {};

  const wrap = document.getElementById('planWrap');
  if (!wrap) return;

  wrap.innerHTML = `
    ${_renderTripHeader()}
    ${_renderRouteStrip()}
    <div id="planConfirmed"></div>
    <div id="planTopThree"></div>
    <div id="planItinerary"></div>
  `;

  if (_picksUnsub) _picksUnsub();
  _picksUnsub = subscribePicks(picks => {
    window._currentPicks = picks;
    _renderConfirmed(picks);
    _renderTopThree(picks);
    window._refreshCardPickBadges?.();
  });

  if (_itiUnsub) _itiUnsub();
  _itiUnsub = subscribeItinerary(days => {
    if (Date.now() - _lastSaveTime < 3000) return;
    if (Object.values(_editMode).some(Boolean)) return;
    _currentDays = days || [];
    _editMode = {};
    _renderItinerary(_currentDays);
  });

  window._planOpenDetail = (id) => {
    window.dispatchEvent(new CustomEvent('open-detail', { detail: { id } }));
  };

  window._removePick = async (person, rank) => {
    try {
      await removePick(person, parseInt(rank));
      window._showToast?.('Pick이 해제됐어요');
    } catch { window._showToast?.('해제 실패', 'error'); }
  };

  window._toggleFinalCandidate = async (resortId) => {
    const picks = window._currentPicks || {};
    const current = [...(picks.finalCandidates || [])];
    const idx = current.indexOf(resortId);
    if (idx === -1) current.push(resortId);
    else current.splice(idx, 1);
    try {
      await setFinalCandidates(current);
      window._showToast?.(idx === -1 ? '⭐ 최종 후보에 추가됐어요' : '최종 후보에서 제거됐어요');
    } catch { window._showToast?.('저장 실패', 'error'); }
  };

  window._confirmResort = async (resortId) => {
    try {
      await setConfirmedResort(resortId || null);
      window._showToast?.(resortId ? '🏆 리조트가 확정됐어요!' : '확정이 취소됐어요');
    } catch { window._showToast?.('저장 실패', 'error'); }
  };

  window._autoFillItinerary = async () => {
    const picks = window._currentPicks || {};
    const confirmedId   = picks.confirmedResort;
    const confirmedName = confirmedId
      ? (RESORTS.find(r => r.id === confirmedId)?.name_ko || '리조트 (미정)')
      : '리조트 (미정)';
    const days = TRIP_TEMPLATE.map(d => ({
      ...d,
      stay: d.stay ? d.stay.replace('{{resort}}', confirmedName) : d.stay,
    }));
    try {
      _lastSaveTime = Date.now();
      await setItinerary(days);
      _currentDays = days;
      _editMode = {};
      _renderItinerary(_currentDays);
      window._showToast?.('✓ 기본 일정이 생성됐어요');
    } catch { window._showToast?.('저장 실패', 'error'); }
  };

  window._resetItinerary = async () => {
    if (!confirm('일정을 초기화하고 기본 템플릿으로 다시 채울까요?')) return;
    window._autoFillItinerary();
  };

  // ── Day 편집 핸들러 ──────────────────────────────────────────────
  window._toggleDayEdit = (dayIndex) => {
    _editMode[dayIndex] = !_editMode[dayIndex];
    _rerenderDayCard(dayIndex);
  };

  window._updateDayField = (dayIndex, field, value) => {
    if (!_currentDays[dayIndex]) return;
    _currentDays[dayIndex] = { ..._currentDays[dayIndex], [field]: value };
    _scheduleSave();
  };

  window._updateItemField = (dayIndex, itemIndex, field, value) => {
    const d = _currentDays[dayIndex];
    if (!d) return;
    const items = (d.items || []).map(normalizeItem);
    if (!items[itemIndex]) return;
    items[itemIndex] = { ...items[itemIndex], [field]: value };
    _currentDays[dayIndex] = { ...d, items };
    _scheduleSave();
  };

  window._cycleItemType = (dayIndex, itemIndex) => {
    const d = _currentDays[dayIndex];
    if (!d) return;
    const items = (d.items || []).map(normalizeItem);
    if (!items[itemIndex]) return;
    const cur = items[itemIndex].type || 'memo';
    const next = ITEM_TYPE_ORDER[(ITEM_TYPE_ORDER.indexOf(cur) + 1) % ITEM_TYPE_ORDER.length];
    items[itemIndex] = { ...items[itemIndex], type: next };
    _currentDays[dayIndex] = { ...d, items };
    _scheduleSave();
    _rerenderDayCard(dayIndex);
  };

  window._moveItemUp = (dayIndex, itemIndex) => {
    if (itemIndex <= 0) return;
    const d = _currentDays[dayIndex];
    if (!d) return;
    const items = (d.items || []).map(normalizeItem);
    [items[itemIndex - 1], items[itemIndex]] = [items[itemIndex], items[itemIndex - 1]];
    _currentDays[dayIndex] = { ...d, items };
    _scheduleSave();
    _rerenderDayCard(dayIndex);
  };

  window._moveItemDown = (dayIndex, itemIndex) => {
    const d = _currentDays[dayIndex];
    if (!d) return;
    const items = (d.items || []).map(normalizeItem);
    if (itemIndex >= items.length - 1) return;
    [items[itemIndex], items[itemIndex + 1]] = [items[itemIndex + 1], items[itemIndex]];
    _currentDays[dayIndex] = { ...d, items };
    _scheduleSave();
    _rerenderDayCard(dayIndex);
  };

  window._addDayItem = (dayIndex) => {
    const typeEl = document.getElementById(`addItemType_${dayIndex}`);
    const textEl = document.getElementById(`addItemText_${dayIndex}`);
    const timeEl = document.getElementById(`addItemTime_${dayIndex}`);
    const text = textEl?.value.trim();
    if (!text) return;
    const d = _currentDays[dayIndex];
    if (!d) return;
    const items = (d.items || []).map(normalizeItem);
    items.push({ type: typeEl?.value || 'memo', text, time: timeEl?.value.trim() || '' });
    _currentDays[dayIndex] = { ...d, items };
    if (textEl) textEl.value = '';
    if (timeEl) timeEl.value = '';
    _scheduleSave();
    _rerenderDayCard(dayIndex);
  };

  window._addDayItemQuick = (dayIndex, text) => {
    if (!text.trim() || !_currentDays[dayIndex]) return;
    const d = _currentDays[dayIndex];
    const items = (d.items || []).map(normalizeItem);
    items.push({ type: 'memo', text: text.trim(), time: '' });
    _currentDays[dayIndex] = { ...d, items };
    _scheduleSave();
    _rerenderDayCard(dayIndex);
  };

  window._removeDayItem = (dayIndex, itemIndex) => {
    const d = _currentDays[dayIndex];
    if (!d) return;
    const items = (d.items || []).map(normalizeItem);
    items.splice(itemIndex, 1);
    _currentDays[dayIndex] = { ...d, items };
    _scheduleSave();
    _rerenderDayCard(dayIndex);
  };
}

// ── 여행 요약 헤더 ────────────────────────────────────────────────────
function _renderTripHeader() {
  return `
<div class="plan-trip-header">
  <div class="plan-trip-main">
    <div class="plan-trip-icon">💍</div>
    <div class="plan-trip-info">
      <div class="plan-trip-name">성우 ♥ 소희 허니문</div>
      <div class="plan-trip-dates">2027.03.07 — 2027.03.14<span class="plan-trip-dur">8일 7박</span></div>
      <div class="plan-trip-dest">🌊 몰디브 · 🇸🇬 싱가폴 경유</div>
    </div>
  </div>
  <div class="plan-trip-right">
    <span class="plan-status-badge">✈ 준비 중</span>
  </div>
</div>`;
}

// ── Route Strip ───────────────────────────────────────────────────────
function _renderRouteStrip() {
  const nodes = ROUTE_NODES.map((n, i) => {
    const nightsHtml = n.nights != null ? `<div class="rn-nights">${n.nights}박</div>` : '';
    const dotClass   = n.status === 'confirmed' ? 'dot-confirmed' : 'dot-pending';
    return `
${i > 0 ? '<div class="route-arrow">›</div>' : ''}
<div class="route-node rn-${n.status}">
  <div class="rn-top">
    <span class="rn-status-dot ${dotClass}"></span>
    <span class="rn-emoji">${n.emoji}</span>
  </div>
  <div class="rn-city">${n.city}</div>
  <div class="rn-label">${n.label}</div>
  ${nightsHtml}
</div>`;
  }).join('');
  return `
<div class="plan-section">
  <div class="plan-section-label">여정 개요</div>
  <div class="route-strip">${nodes}</div>
</div>`;
}

// ── 확정 리조트 히어로 카드 ───────────────────────────────────────────
function _renderConfirmed(picks) {
  const el = document.getElementById('planConfirmed');
  if (!el) return;
  const confirmedId = picks.confirmedResort;
  if (!confirmedId) { el.innerHTML = ''; return; }
  const r = RESORTS.find(x => x.id === confirmedId);
  if (!r) { el.innerHTML = ''; return; }
  const img   = getFeaturedImage(r);
  const price = getBestPrice(r, 'water_pool_4n');
  el.innerHTML = `
<div class="plan-section confirmed-section">
  <div class="plan-section-label">🏆 우리의 리조트</div>
  <div class="confirmed-resort-card">
    ${img ? `<div class="confirmed-img"><img src="${img}" alt="${r.name_ko}" onerror="this.parentElement.style.display='none'"></div>` : ''}
    <div class="confirmed-body">
      <div class="confirmed-name">${r.name_ko}</div>
      <div class="confirmed-en">${r.name_en}</div>
      <div class="confirmed-meta">
        <span>📍 ${r.atoll}</span>
        <span>${r.transfer_type === 'seaplane' ? '✈️' : '🚤'} ${r.transfer_minutes}분</span>
        ${price ? `<span>💰 워터풀 $${price.toLocaleString()}/인</span>` : ''}
      </div>
      <div class="confirmed-actions">
        <button class="confirmed-detail-btn" onclick="window._planOpenDetail?.('${r.id}')">📋 상세 보기</button>
        <button class="confirmed-change-btn" onclick="if(confirm('확정을 취소할까요?')) window._confirmResort(null)">변경</button>
      </div>
    </div>
  </div>
</div>`;
}

// ── 커플 Top 3 ────────────────────────────────────────────────────────
function _resortById(id) { return id ? RESORTS.find(r => r.id === id) : null; }

function _renderPickSlot(resortId, rank, person) {
  if (!resortId) {
    return `
<div class="pick-slot-card pick-slot-empty">
  <div class="psc-rank-num">${RANK_EMOJI[rank]}</div>
  <div class="psc-empty-text">미선택</div>
  <div class="psc-empty-hint">리조트 정보 탭에서<br>Pick을 지정해보세요</div>
</div>`;
  }
  const r = _resortById(resortId);
  if (!r) return '';
  const img = getFeaturedImage(r);
  const imgHtml = img
    ? `<img src="${img}" alt="${r.name_ko}" onerror="this.style.display='none'">`
    : `<div class="psc-no-img">🏝️</div>`;
  const memoCnt = window._memoMeta?.[r.id]?.commentCount || 0;
  return `
<div class="pick-slot-card pick-slot-filled" onclick="window._openPickModal?.('${r.id}')">
  <div class="psc-rank-badge">${RANK_EMOJI[rank]} ${RANK_LABELS[rank]}</div>
  <div class="psc-img">${imgHtml}</div>
  <div class="psc-body">
    <div class="psc-name">${r.name_ko}${memoCnt ? `<span class="psc-memo-badge">💬 ${memoCnt}</span>` : ''}</div>
    <div class="psc-sub">${r.atoll} · ${r.transfer_type === 'seaplane' ? '✈' : '🚤'} ${r.transfer_minutes}분</div>
    <div class="psc-actions">
      <button class="psc-detail-btn" onclick="event.stopPropagation(); window._planOpenDetail?.('${r.id}')">상세 보기</button>
      <button class="psc-remove-btn" onclick="event.stopPropagation(); window._removePick?.('${person}', ${rank})" title="제거">× 해제</button>
    </div>
  </div>
</div>`;
}

function _renderTopThree(picks) {
  const el = document.getElementById('planTopThree');
  if (!el) return;
  const soheePicks   = picks.sohee   || [null, null, null];
  const sungwooPicks = picks.sungwoo || [null, null, null];
  const finals       = picks.finalCandidates || [];
  const confirmedId  = picks.confirmedResort;
  const commonIds    = soheePicks.filter(id => id && sungwooPicks.includes(id));
  const soheeEmpty   = soheePicks.every(id => !id);
  const sungwooEmpty = sungwooPicks.every(id => !id);

  const soheeSlots = soheeEmpty
    ? `<div class="picks-empty-state"><div class="pes-icon">👩</div><div>아직 소희의 Top 3가<br>정해지지 않았어요</div><div class="pes-hint">리조트 정보 탭에서 Pick을 지정해보세요</div></div>`
    : soheePicks.map((id, i) => _renderPickSlot(id, i, 'sohee')).join('');

  const sungwooSlots = sungwooEmpty
    ? `<div class="picks-empty-state"><div class="pes-icon">🧑</div><div>아직 성우의 Top 3가<br>정해지지 않았어요</div><div class="pes-hint">리조트 정보 탭에서 Pick을 지정해보세요</div></div>`
    : sungwooPicks.map((id, i) => _renderPickSlot(id, i, 'sungwoo')).join('');

  const commonHtml = commonIds.length > 0
    ? commonIds.map(id => {
        const r = _resortById(id);
        return r ? `<span class="common-pick-badge" onclick="window._planOpenDetail?.('${r.id}')">${r.name_ko}</span>` : '';
      }).join('')
    : '<span class="no-common-text">두 사람의 공통 선택이 없어요</span>';

  const allResortIds = [...new Set([...soheePicks, ...sungwooPicks].filter(Boolean))];

  const finalsHtml = finals.length > 0
    ? finals.map(id => {
        const r = _resortById(id);
        if (!r) return '';
        const isConfirmed = confirmedId === id;
        return `
<div class="final-candidate-row ${isConfirmed ? 'final-confirmed' : ''}">
  <span class="final-cand-name" onclick="window._planOpenDetail?.('${r.id}')">${r.name_ko}</span>
  <div class="final-cand-btns">
    ${isConfirmed
      ? `<span class="final-confirmed-badge">✓ 확정됨</span>`
      : `<button class="final-confirm-btn" onclick="window._confirmResort?.('${r.id}')">✓ 이 리조트로 확정</button>`}
    <button class="final-remove-btn" onclick="window._toggleFinalCandidate?.('${id}')">제거</button>
  </div>
</div>`;
      }).join('')
    : '<span class="no-common-text">최종 후보가 없어요 — 아래 목록에서 + 버튼으로 추가해보세요</span>';

  const toggleHtml = allResortIds.length > 0
    ? allResortIds.map(id => {
        const r = _resortById(id);
        if (!r) return '';
        const isFinal = finals.includes(id);
        return `<span class="final-toggle-badge ${isFinal ? 'final-active' : ''}" onclick="window._toggleFinalCandidate?.('${id}')">${r.name_ko}${isFinal ? ' ✓' : ' +'}</span>`;
      }).join('')
    : '<span class="no-common-text">Pick된 리조트가 없어요</span>';

  el.innerHTML = `
<div class="plan-section">
  <div class="plan-section-label">커플 Top 3</div>
  <div class="picks-grid">
    <div class="pick-person-card">
      <div class="pick-person-header pick-sohee-header">
        <span class="pick-person-avatar">👩</span>
        <span class="pick-person-name">소희</span>
      </div>
      <div class="pick-slots-list">${soheeSlots}</div>
    </div>
    <div class="pick-person-card">
      <div class="pick-person-header pick-sungwoo-header">
        <span class="pick-person-avatar">🧑</span>
        <span class="pick-person-name">성우</span>
      </div>
      <div class="pick-slots-list">${sungwooSlots}</div>
    </div>
  </div>
  <div class="picks-common-row">
    <div class="picks-common-card">
      <div class="picks-common-label">💞 공통 후보</div>
      <div class="picks-common-list">${commonHtml}</div>
    </div>
  </div>
  <div class="final-section">
    <div class="final-section-header">
      <span class="final-section-title">⭐ 최종 협의 후보</span>
      <span class="final-section-hint">확정 버튼으로 리조트를 최종 결정하세요</span>
    </div>
    <div class="final-candidates-list">${finalsHtml}</div>
    <div class="final-toggle-area">
      <div class="final-toggle-label">Pick 목록에서 후보 추가/제거</div>
      <div class="picks-common-list">${toggleHtml}</div>
    </div>
  </div>
</div>`;
}

// ── 일정표 타임라인 ───────────────────────────────────────────────────
function _renderItinerary(days) {
  const el = document.getElementById('planItinerary');
  if (!el) return;
  if (!days || days.length === 0) {
    el.innerHTML = `
<div class="plan-section">
  <div class="plan-section-label">여행 일정표</div>
  <div class="itinerary-empty">
    <div class="itinerary-empty-icon">🗓️</div>
    <div class="itinerary-empty-title">아직 세부 일정이 없어요</div>
    <div class="itinerary-empty-sub">기본 일정 (싱가폴 2박 + 몰디브 5박)을 자동으로 생성할 수 있어요</div>
    <button class="iti-autofill-btn" onclick="window._autoFillItinerary?.()">📅 기본 일정 자동 생성</button>
  </div>
</div>`;
    return;
  }
  el.innerHTML = `
<div class="plan-section">
  <div class="plan-section-header-row">
    <div class="plan-section-label">여행 일정표</div>
    <div class="iti-header-right">
      <span id="itiSaveStatus" class="iti-save-status"></span>
      <button class="iti-reset-btn" onclick="window._resetItinerary?.()">↺ 초기화</button>
    </div>
  </div>
  <div class="itinerary-timeline">${days.map((d, i) => _renderDayCard(d, i)).join('')}</div>
</div>`;
}

function _renderDayCard(d, dayIndex) {
  return _editMode[dayIndex] ? _renderDayCardEdit(d, dayIndex) : _renderDayCardView(d, dayIndex);
}

function _getCityEmoji(city) {
  if (!city) return '📍';
  if (city.includes('Singapore') || city.includes('싱가폴')) return '🇸🇬';
  if (city.includes('Male') || city.includes('몰디브') || city.includes('말레')) return '🌊';
  if (city.includes('인천')) return '✈️';
  return '📍';
}

// ── View mode ─────────────────────────────────────────────────────────
function _renderDayCardView(d, dayIndex) {
  const items = (d.items || []).map(normalizeItem);
  const dateStr = d.date
    ? new Date(d.date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
    : '';
  const cityEmoji = _getCityEmoji(d.city);

  const transportChip = d.transport
    ? `<span class="meta-chip meta-chip-transport">🚌 ${esc(d.transport)}</span>` : '';
  const stayChip = d.stay
    ? `<span class="meta-chip meta-chip-stay">🏨 ${esc(d.stay)}</span>` : '';

  const itemsHtml = items.map((it) => {
    const T = ITEM_TYPES[it.type] || ITEM_TYPES.memo;
    const isTodo = !it.text || it.text.includes('미정');
    return `
<li class="day-item-view${isTodo ? ' item-todo' : ''}">
  <span class="item-chip" style="background:${T.bg};color:${T.color}">${T.icon} ${T.label}</span>
  ${it.time ? `<span class="item-time-display">${esc(it.time)}</span>` : ''}
  <span class="item-text-display">${esc(it.text)}</span>
  ${isTodo ? '<span class="todo-pill">추후 입력</span>' : ''}
</li>`;
  }).join('');

  const moodHtml = d.mood ? `<div class="day-mood-view">"${esc(d.mood)}"</div>` : '';

  return `
<div class="itinerary-day" data-day-index="${dayIndex}">
  <div class="day-num-col">
    <div class="day-num-label">DAY</div>
    <div class="day-num-val">${d.day}</div>
  </div>
  <div class="day-body">
    <div class="day-view-header">
      <div class="day-view-header-left">
        <span class="day-city-emoji">${cityEmoji}</span>
        <div>
          <div class="day-title">${esc(d.title || d.city || '')}</div>
          <div class="day-date-sub">${dateStr}${d.city ? ` · ${esc(d.city)}` : ''}</div>
        </div>
      </div>
      <button class="day-edit-btn" onclick="window._toggleDayEdit(${dayIndex})">✏️ 편집</button>
    </div>
    ${(transportChip || stayChip) ? `<div class="day-meta-chips">${transportChip}${stayChip}</div>` : ''}
    ${moodHtml}
    ${items.length ? `<ul class="day-items-view">${itemsHtml}</ul>` : ''}
    <div class="day-add-row">
      <input class="day-add-input" placeholder="항목 빠르게 추가 (Enter)..."
        onkeydown="if(event.key==='Enter'&&this.value.trim()){window._addDayItemQuick(${dayIndex},this.value.trim());this.value='';event.preventDefault()}">
      <button class="day-add-btn" onclick="const i=this.previousElementSibling;if(i.value.trim()){window._addDayItemQuick(${dayIndex},i.value.trim());i.value=''}">+</button>
    </div>
  </div>
</div>`;
}

// ── Edit mode ─────────────────────────────────────────────────────────
function _renderDayCardEdit(d, dayIndex) {
  const items = (d.items || []).map(normalizeItem);
  const cityEmoji = _getCityEmoji(d.city);

  const itemsEditHtml = items.map((it, j) => {
    const T = ITEM_TYPES[it.type] || ITEM_TYPES.memo;
    return `
<li class="day-item-edit-row">
  <button class="item-type-cycle" onclick="window._cycleItemType(${dayIndex},${j})"
    title="${T.label}" style="background:${T.bg};color:${T.color}">${T.icon}</button>
  <input class="item-time-input" value="${esc(it.time)}" placeholder="시간"
    oninput="window._updateItemField(${dayIndex},${j},'time',this.value)">
  <input class="item-text-input" value="${esc(it.text)}" placeholder="내용 입력"
    oninput="window._updateItemField(${dayIndex},${j},'text',this.value)">
  <div class="item-reorder-btns">
    <button onclick="window._moveItemUp(${dayIndex},${j})"${j === 0 ? ' disabled' : ''}>↑</button>
    <button onclick="window._moveItemDown(${dayIndex},${j})"${j === items.length - 1 ? ' disabled' : ''}>↓</button>
  </div>
  <button class="item-del-btn" onclick="window._removeDayItem(${dayIndex},${j})">×</button>
</li>`;
  }).join('');

  const typeOptions = ITEM_TYPE_ORDER.map(t =>
    `<option value="${t}">${ITEM_TYPES[t].icon} ${ITEM_TYPES[t].label}</option>`
  ).join('');

  return `
<div class="itinerary-day editing" data-day-index="${dayIndex}">
  <div class="day-num-col">
    <div class="day-num-label">DAY</div>
    <div class="day-num-val">${d.day}</div>
  </div>
  <div class="day-body">
    <div class="day-edit-header-row">
      <span class="day-city-emoji" style="font-size:20px;flex-shrink:0">${cityEmoji}</span>
      <input class="day-edit-title" value="${esc(d.title || '')}" placeholder="제목..."
        oninput="window._updateDayField(${dayIndex},'title',this.value)">
      <button class="day-save-close-btn" onclick="window._toggleDayEdit(${dayIndex})">완료</button>
    </div>
    <div class="day-edit-fields-grid">
      <label class="day-edit-field-label">날짜
        <input type="date" class="day-edit-field-input" value="${d.date || ''}"
          oninput="window._updateDayField(${dayIndex},'date',this.value)">
      </label>
      <label class="day-edit-field-label">도시/지역
        <input type="text" class="day-edit-field-input" value="${esc(d.city || '')}" placeholder="예: 몰디브"
          oninput="window._updateDayField(${dayIndex},'city',this.value)">
      </label>
      <label class="day-edit-field-label">이동 수단
        <input type="text" class="day-edit-field-input" value="${esc(d.transport || '')}" placeholder="예: 수상비행기 45분"
          oninput="window._updateDayField(${dayIndex},'transport',this.value)">
      </label>
      <label class="day-edit-field-label">숙박
        <input type="text" class="day-edit-field-input" value="${esc(d.stay || '')}" placeholder="예: 코라코라 리조트"
          oninput="window._updateDayField(${dayIndex},'stay',this.value)">
      </label>
      <label class="day-edit-field-label" style="grid-column:1/-1">오늘의 무드
        <input type="text" class="day-edit-field-input" value="${esc(d.mood || '')}" placeholder="예: 파란 바다 위의 하루..."
          oninput="window._updateDayField(${dayIndex},'mood',this.value)">
      </label>
    </div>
    <div class="day-edit-items-label">일정 항목</div>
    <ul class="day-items-edit">${itemsEditHtml}</ul>
    <div class="day-edit-add-row">
      <select class="item-type-select" id="addItemType_${dayIndex}">${typeOptions}</select>
      <input class="day-add-input" id="addItemText_${dayIndex}" placeholder="항목 내용..."
        onkeydown="if(event.key==='Enter'){window._addDayItem(${dayIndex});event.preventDefault()}">
      <input class="day-add-time" id="addItemTime_${dayIndex}" placeholder="시간">
      <button class="day-add-btn" onclick="window._addDayItem(${dayIndex})">+</button>
    </div>
  </div>
</div>`;
}
