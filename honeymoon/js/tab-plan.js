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

// 기본 일정 템플릿 (8일 7박)
const TRIP_TEMPLATE = [
  { day: 1, date: '2027-03-07', city: '인천 → 싱가폴', title: '출발', transport: '인천공항 출발', stay: '싱가폴 호텔', items: ['인천공항 집결', '싱가폴 창이공항 도착', '호텔 체크인'] },
  { day: 2, date: '2027-03-08', city: '싱가폴', title: '싱가폴 관광', transport: null, stay: '싱가폴 호텔', items: ['마리나베이샌즈', '가든스바이더베이', '야경 감상'] },
  { day: 3, date: '2027-03-09', city: '싱가폴 → 몰디브', title: '몰디브 이동', transport: '싱가폴 → 말레 비행 + 리조트 이동', stay: '{{resort}}', items: ['창이공항 출발', '말레 도착', '리조트 이동', '체크인'] },
  { day: 4, date: '2027-03-10', city: '몰디브', title: '리조트 Day 2', transport: null, stay: '{{resort}}', items: ['조식', '스노클링', '선셋 크루즈'] },
  { day: 5, date: '2027-03-11', city: '몰디브', title: '리조트 Day 3', transport: null, stay: '{{resort}}', items: ['조식', '수중 액티비티', '스파'] },
  { day: 6, date: '2027-03-12', city: '몰디브', title: '리조트 Day 4', transport: null, stay: '{{resort}}', items: ['조식', '다이빙', '커플 사진 촬영'] },
  { day: 7, date: '2027-03-13', city: '몰디브', title: '리조트 마지막날', transport: '리조트 → 말레 공항', stay: '{{resort}}', items: ['조식', '체크아웃', '출국'] },
  { day: 8, date: '2027-03-14', city: '인천', title: '귀국', transport: '말레 → 인천 도착', stay: null, items: ['귀국', '수고했어요! 💕'] },
];

let _openDetailFn = null;
let _picksUnsub   = null;
let _itiUnsub     = null;
let _currentDays  = [];

export function initPlan({ openDetailFn }) {
  _openDetailFn = openDetailFn;

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
    _currentDays = days || [];
    _renderItinerary(_currentDays);
  });

  // 플랜 탭에서 리조트 상세 열기
  window._planOpenDetail = (id) => {
    window.dispatchEvent(new CustomEvent('open-detail', { detail: { id } }));
  };

  // Pick 제거
  window._removePick = async (person, rank) => {
    try {
      await removePick(person, parseInt(rank));
      window._showToast?.('Pick이 해제됐어요');
    } catch { window._showToast?.('해제 실패', 'error'); }
  };

  // 최종 협의 후보 토글
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

  // 리조트 확정
  window._confirmResort = async (resortId) => {
    try {
      await setConfirmedResort(resortId || null);
      window._showToast?.(resortId ? '🏆 리조트가 확정됐어요!' : '확정이 취소됐어요');
    } catch { window._showToast?.('저장 실패', 'error'); }
  };

  // 기본 일정 자동 생성
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
      await setItinerary(days);
      window._showToast?.('✓ 기본 일정이 생성됐어요');
    } catch { window._showToast?.('저장 실패', 'error'); }
  };

  // 일정 항목 추가
  window._addDayItem = async (dayIndex, text) => {
    if (!text.trim() || !_currentDays[dayIndex]) return;
    const days = _currentDays.map((d, i) =>
      i === dayIndex ? { ...d, items: [...(d.items || []), text.trim()] } : d
    );
    try { await setItinerary(days); } catch { window._showToast?.('저장 실패', 'error'); }
  };

  // 일정 항목 삭제
  window._removeDayItem = async (dayIndex, itemIndex) => {
    if (!_currentDays[dayIndex]) return;
    const days = _currentDays.map((d, i) => {
      if (i !== dayIndex) return d;
      const items = [...(d.items || [])];
      items.splice(itemIndex, 1);
      return { ...d, items };
    });
    try { await setItinerary(days); } catch { window._showToast?.('저장 실패', 'error'); }
  };

  // 일정 전체 초기화
  window._resetItinerary = async () => {
    if (!confirm('일정을 초기화하고 기본 템플릿으로 다시 채울까요?')) return;
    window._autoFillItinerary();
  };
}

// ── 여행 요약 헤더 ─────────────────────────────────────────────────
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

// ── Route Strip ────────────────────────────────────────────────────
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

// ── 확정 리조트 히어로 카드 ─────────────────────────────────────────
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

// ── 커플 Top 3 ─────────────────────────────────────────────────────
function _resortById(id) {
  return id ? RESORTS.find(r => r.id === id) : null;
}

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

  const commonIds = soheePicks.filter(id => id && sungwooPicks.includes(id));

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

  // 최종 협의 후보 — finalCandidates에 있는 것만, 확정 버튼 포함
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
      : `<button class="final-confirm-btn" onclick="window._confirmResort?.('${r.id}')">✓ 이 리조트로 확정</button>`
    }
    <button class="final-remove-btn" onclick="window._toggleFinalCandidate?.('${id}')">제거</button>
  </div>
</div>`;
      }).join('')
    : '<span class="no-common-text">최종 후보가 없어요 — 아래 목록에서 + 버튼으로 추가해보세요</span>';

  // Pick된 전체 리조트 (최종 후보에 추가/제거용 토글)
  const toggleHtml = allResortIds.length > 0
    ? allResortIds.map(id => {
        const r       = _resortById(id);
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

// ── 일정표 타임라인 ─────────────────────────────────────────────────
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
    <button class="iti-reset-btn" onclick="window._resetItinerary?.()">↺ 초기화</button>
  </div>
  <div class="itinerary-timeline">${days.map(_renderDayCard).join('')}</div>
</div>`;
}

function _renderDayCard(d, dayIndex) {
  const dateStr = d.date
    ? new Date(d.date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
    : '';
  const cityEmoji =
    (d.city?.includes('Singapore') || d.city?.includes('싱가폴')) ? '🇸🇬' :
    (d.city?.includes('Male') || d.city?.includes('몰디브') || d.city?.includes('말레')) ? '🌊' :
    (d.city?.includes('인천')) ? '✈️' : '📍';

  const transportHtml = d.transport
    ? `<div class="day-meta-row"><span class="day-meta-icon">🚌</span><span>${d.transport}</span></div>` : '';
  const stayHtml = d.stay
    ? `<div class="day-meta-row"><span class="day-meta-icon">🏨</span><span>${d.stay}</span></div>` : '';

  const itemsHtml = (d.items || []).map((it, itemIdx) => `
<li class="day-item">
  <span class="day-item-text">${it.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</span>
  <button class="day-item-del" onclick="window._removeDayItem(${dayIndex}, ${itemIdx})" title="삭제">×</button>
</li>`).join('');

  const moodHtml = d.mood ? `<div class="day-mood">"${d.mood}"</div>` : '';

  return `
<div class="itinerary-day">
  <div class="day-num-col">
    <div class="day-num-label">DAY</div>
    <div class="day-num-val">${d.day}</div>
  </div>
  <div class="day-body">
    <div class="day-header">
      <div class="day-header-left">
        <span class="day-city-emoji">${cityEmoji}</span>
        <div>
          <div class="day-title">${d.title || d.city || ''}</div>
          <div class="day-date-sub">${dateStr}${d.city ? ` · ${d.city}` : ''}</div>
        </div>
      </div>
      ${moodHtml}
    </div>
    <div class="day-meta">
      ${transportHtml}
      ${stayHtml}
    </div>
    ${itemsHtml.length ? `<ul class="day-items">${itemsHtml}</ul>` : ''}
    <div class="day-add-row">
      <input class="day-add-input" placeholder="항목 추가..."
        onkeydown="if(event.key==='Enter'&&this.value.trim()){window._addDayItem(${dayIndex},this.value.trim());this.value='';event.preventDefault()}">
      <button class="day-add-btn" onclick="const i=this.previousElementSibling;if(i.value.trim()){window._addDayItem(${dayIndex},i.value.trim());i.value=''}">+</button>
    </div>
  </div>
</div>`;
}
