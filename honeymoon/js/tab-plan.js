// Resort comparison keeps its saved picks; the current trip lives in shared/trip-store.
import { RESORTS, getFeaturedImage, getBestPrice } from './resorts-data.js';
import { subscribePicks, subscribeItinerary, removePick, setFinalCandidates,
         setConfirmedResort } from './firebase-picks.js';
import { TRIP_DAYS } from '../../shared/trip-data.mjs';
import { subscribeTrip } from '../../shared/trip-store.mjs';

const RANK_EMOJI = ['🥇', '🥈', '🥉'];
const RANK_LABELS = ['1위', '2위', '3위'];
let _picksUnsub = null;
let _itiUnsub = null;
let _tripUnsub = null;
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function initPlan({ openDetailFn }) {
  const wrap = document.getElementById('planWrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <section id="planCurrentTrip" aria-label="현재 신혼여행 일정"></section>
    <section class="plan-resort-focus" aria-label="예약한 리조트">
      <div><span class="plan-focus-label">예약한 리조트</span><h2>아나네아 마디바루</h2><p>3월 12–16일 · 4박<br>객실·식사·수상비행기 조건은 예약서와 함께 확인해요.</p></div>
      <div class="plan-focus-actions"><button type="button" class="confirmed-detail-btn" id="openAnaneaPlan">리조트 정보·메모 보기 →</button><a class="plan-text-link" href="../travel/#resort">예약 세부사항 정리</a></div>
    </section>
    <p class="plan-section-intro">아래는 함께 비교하며 남긴 리조트 후보와 메모예요. 항공·크루즈·호텔과 현재 예약 상태는 <a href="../travel/">여행 일정</a>에서 함께 관리해요.</p>
    <div id="planConfirmed"></div>
    <div id="planTopThree"></div>
    <details class="plan-archive" id="planLegacyArchive"><summary>이전 일정 기록 <span>읽기 전용</span></summary><p>여행 구성을 바꾸기 전에 저장한 기록이에요. 현재 여행 일정과 분리해 그대로 보관하고 있어요.</p><div id="planItinerary"><p class="plan-section-intro">이전 기록을 불러오는 중…</p></div></details>
  `;

  document.getElementById('openAnaneaPlan').addEventListener('click', () => openDetailFn('ananea'));
  _renderCurrentTrip({ days: TRIP_DAYS });
  _tripUnsub?.();
  _tripUnsub = subscribeTrip(snapshot => _renderCurrentTrip(snapshot.data));
  _picksUnsub?.();
  _picksUnsub = subscribePicks(picks => {
    window._currentPicks = picks;
    _renderConfirmed(picks);
    _renderTopThree(picks);
    window._refreshCardPickBadges?.();
  });
  _itiUnsub?.();
  _itiUnsub = subscribeItinerary(days => _renderLegacyItinerary(days));

  window._planOpenDetail = id => openDetailFn(id);
  window._removePick = async (person, rank) => {
    try { await removePick(person, parseInt(rank)); window._showToast?.('Pick이 해제됐어요'); }
    catch { window._showToast?.('해제 실패', 'error'); }
  };
  window._toggleFinalCandidate = async resortId => {
    const current = [...(window._currentPicks?.finalCandidates || [])];
    const idx = current.indexOf(resortId);
    if (idx === -1) current.push(resortId);
    else current.splice(idx, 1);
    try { await setFinalCandidates(current); window._showToast?.(idx === -1 ? '⭐ 최종 후보에 추가됐어요' : '최종 후보에서 제거됐어요'); }
    catch { window._showToast?.('저장 실패', 'error'); }
  };
  window._confirmResort = async resortId => {
    try { await setConfirmedResort(resortId || null); window._showToast?.(resortId ? '비교 선택을 저장했어요' : '비교 선택을 해제했어요'); }
    catch { window._showToast?.('저장 실패', 'error'); }
  };
}

function _renderCurrentTrip(data = {}) {
  const el = document.getElementById('planCurrentTrip');
  if (!el) return;
  const days = Array.isArray(data.days) && data.days.length ? data.days : TRIP_DAYS;
  const start = days[0]?.date?.replaceAll('-', '.') || '2027.03.07';
  const end = days.at(-1)?.date?.replaceAll('-', '.') || '2027.03.17';
  el.innerHTML = `
    <div class="plan-trip-header">
      <div class="plan-trip-main"><div class="plan-trip-icon" aria-hidden="true">✈️</div><div class="plan-trip-info"><div class="plan-trip-name">우리의 3월, 전체 여행 일정</div><div class="plan-trip-dates">${esc(start)} — ${esc(end)}<span class="plan-trip-dur">${days.length}일</span></div><div class="plan-trip-dest">싱가포르 · 디즈니 크루즈 3박 · 몰디브 4박</div></div></div>
      <a class="plan-current-link" href="../travel/">일정·지도 보러 가기 →</a>
    </div>
    <div class="plan-current-links"><a href="../travel/#hotels">싱가포르 호텔 2박 고르기</a><a href="../travel/#cruise">3/8–11 크루즈 확인</a><a href="../travel/#flights">항공편·환승 확인</a></div>
    <details class="plan-current-overview"><summary>현재 여정 한눈에 보기</summary><ol>${days.map(day => `<li><span>${esc(day.date?.slice(5).replace('-', '/'))}</span><div><strong>${esc(day.title)}</strong><p>${esc(day.description)}</p></div></li>`).join('')}</ol><a class="plan-text-link" href="../travel/">이 일정 자세히 보기 →</a></details>
  `;
}

function _renderLegacyItinerary(days) {
  const el = document.getElementById('planItinerary');
  if (!el) return;
  if (!Array.isArray(days) || !days.length) {
    el.innerHTML = '<p class="plan-section-intro">표시할 이전 일정 기록이 없어요. 현재 일정은 여행 일정 페이지에서 확인할 수 있어요.</p>';
    return;
  }
  el.innerHTML = `<ol class="plan-legacy-days">${days.map((day, index) => {
    const items = Array.isArray(day.items) ? day.items : [];
    return `<li><div class="plan-legacy-date">DAY ${esc(day.day ?? index + 1)} · ${esc(day.date)}</div><h3>${esc(day.title || day.city)}</h3>${day.city ? `<p>${esc(day.city)}</p>` : ''}${day.transport ? `<p>이동 · ${esc(day.transport)}</p>` : ''}${day.stay ? `<p>숙박 · ${esc(day.stay)}</p>` : ''}${day.mood ? `<p>${esc(day.mood)}</p>` : ''}${items.length ? `<ul>${items.map(item => typeof item === 'string' ? `<li>${esc(item)}</li>` : `<li>${item?.time ? `<span>${esc(item.time)}</span> ` : ''}${esc(item?.text)}</li>`).join('')}</ul>` : ''}</li>`;
  }).join('')}</ol>`;
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
  <div class="plan-section-label">🏆 비교에서 선택한 리조트</div>
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
        <button class="confirmed-change-btn" onclick="if(confirm('비교에서 선택한 리조트를 해제할까요?')) window._confirmResort(null)">변경</button>
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
      ? `<span class="final-confirmed-badge">✓ 비교 선택</span>`
      : `<button class="final-confirm-btn" onclick="window._confirmResort?.('${r.id}')">✓ 비교 선택</button>`}
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
      <span class="final-section-hint">비교할 때 고른 후보예요 · 실제 예약 상태는 여행 일정에서 확인해요</span>
    </div>
    <div class="final-candidates-list">${finalsHtml}</div>
    <div class="final-toggle-area">
      <div class="final-toggle-label">Pick 목록에서 후보 추가/제거</div>
      <div class="picks-common-list">${toggleHtml}</div>
    </div>
  </div>
</div>`;
}
