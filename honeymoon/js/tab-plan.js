// tab-plan.js — "우리의 플랜" 탭 렌더링 모듈
import { RESORTS, getFeaturedImage } from './resorts-data.js';
import { subscribePicks, subscribeItinerary, removePick, setFinalCandidates } from './firebase-picks.js';

const ROUTE_NODES = [
  { city: '인천',       emoji: '✈️',  nights: null, status: 'confirmed', label: '출발' },
  { city: '싱가폴',     emoji: '🇸🇬', nights: 2,    status: 'pending',   label: '경유·관광' },
  { city: '말레/몰디브', emoji: '🌊',  nights: 5,    status: 'pending',   label: '리조트 (미정)' },
  { city: '인천',       emoji: '🏠',  nights: null, status: 'pending',   label: '귀국' },
];

const RANK_EMOJI  = ['🥇', '🥈', '🥉'];
const RANK_LABELS = ['1위', '2위', '3위'];

let _openDetailFn = null;
let _picksUnsub   = null;
let _itiUnsub     = null;

export function initPlan({ openDetailFn }) {
  _openDetailFn = openDetailFn;

  const wrap = document.getElementById('planWrap');
  if (!wrap) return;

  wrap.innerHTML = `
    ${_renderTripHeader()}
    ${_renderRouteStrip()}
    <div id="planTopThree"></div>
    <div id="planItinerary"></div>
  `;

  if (_picksUnsub) _picksUnsub();
  _picksUnsub = subscribePicks(picks => {
    window._currentPicks = picks;
    _renderTopThree(picks);
    window._refreshCardPickBadges?.();
  });

  if (_itiUnsub) _itiUnsub();
  _itiUnsub = subscribeItinerary(days => _renderItinerary(days));

  // 플랜 탭에서 리조트 상세 열기 → 전체화면 오버레이
  window._planOpenDetail = (id) => {
    window.dispatchEvent(new CustomEvent('open-detail', { detail: { id } }));
  };
  // 플랜 탭에서 Pick 제거
  window._removePick = async (person, rank) => {
    try {
      await removePick(person, parseInt(rank));
      window._showToast?.('Pick이 해제됐어요');
    } catch { window._showToast?.('해제 실패', 'error'); }
  };
  // 최종 후보 토글
  window._toggleFinalCandidate = async (resortId) => {
    const picks = window._currentPicks || {};
    const current = [...(picks.finalCandidates || [])];
    const idx = current.indexOf(resortId);
    if (idx === -1) current.push(resortId);
    else current.splice(idx, 1);
    try {
      await setFinalCandidates(current);
      window._showToast?.(idx === -1 ? '최종 후보에 추가됐어요' : '최종 후보에서 제거됐어요');
    } catch { window._showToast?.('저장 실패', 'error'); }
  };
}

// ── 여행 요약 헤더 ─────────────────────────────────────────────
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

// ── Route Strip ─────────────────────────────────────────────────
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

// ── 커플 Top 3 ──────────────────────────────────────────────────
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

  const soheePicks  = picks.sohee   || [null, null, null];
  const sungwooPicks = picks.sungwoo || [null, null, null];
  const finals       = picks.finalCandidates || [];

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

  const allResortIds = [...new Set([...soheePicks, ...sungwooPicks].filter(Boolean))];
  const finalHtml = allResortIds.length > 0
    ? allResortIds.map(id => {
        const r  = _resortById(id);
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
    <div class="picks-common-card picks-final-card">
      <div class="picks-common-label">⭐ 최종 협의 후보 <span class="final-hint">클릭하여 토글</span></div>
      <div class="picks-common-list">${finalHtml}</div>
    </div>
  </div>
</div>`;
}

// ── 일정표 타임라인 ─────────────────────────────────────────────
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
    <div class="itinerary-empty-sub">싱가폴 일정과 몰디브 리조트 일정은 나중에 추가할 수 있어요</div>
  </div>
</div>`;
    return;
  }

  el.innerHTML = `
<div class="plan-section">
  <div class="plan-section-label">여행 일정표</div>
  <div class="itinerary-timeline">${days.map(_renderDayCard).join('')}</div>
</div>`;
}

function _renderDayCard(d) {
  const dateStr = d.date
    ? new Date(d.date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
    : '';
  const cityEmoji =
    (d.city?.includes('Singapore') || d.city?.includes('싱가폴')) ? '🇸🇬' :
    (d.city?.includes('Male') || d.city?.includes('몰디브') || d.city?.includes('말레')) ? '🌊' :
    (d.city?.includes('인천')) ? '✈️' : '📍';

  const transportHtml = d.transport ? `<div class="day-meta-row"><span class="day-meta-icon">🚌</span><span>${d.transport}</span></div>` : '';
  const stayHtml      = d.stay      ? `<div class="day-meta-row"><span class="day-meta-icon">🏨</span><span>${d.stay}</span></div>` : '';
  const itemsHtml     = d.items?.length
    ? `<ul class="day-items">${d.items.map(it => `<li>${it}</li>`).join('')}</ul>` : '';
  const moodHtml      = d.mood ? `<div class="day-mood">"${d.mood}"</div>` : '';

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
    ${itemsHtml}
  </div>
</div>`;
}
