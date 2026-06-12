// app.js — 탭 라우터 + 공유 상태 + D-Day

import { initCards } from './tab-cards.js';
import { initPrice } from './tab-price.js';
import { initMap } from './tab-map.js';
import { initTournament } from './tab-tournament.js';
import { initPdf } from './tab-pdf.js';
import { initPlan } from './tab-plan.js';
import { RESORTS, getBestPrice, getFeaturedImage } from './resorts-data.js';
import { subscribeComments, addComment, deleteComment, getCustomImages, saveCustomImages } from './firebase-notes.js';
import { subscribePicks, setPick, removePick } from './firebase-picks.js';
import { calcFitScore, initPrefsPanel, getPrefs } from './user-prefs.js';

// showToast를 window에도 노출 (tab-plan.js에서 사용)
window._showToast = (msg, type, dur) => showToast(msg, type, dur);

function showToast(msg, type = 'success', duration = 2000) {
  const el = document.createElement('div');
  el.className = `toast-msg toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, duration);
}

function getAccessDesc(resort) {
  const isSeaplane = resort.transfer_type === 'seaplane';
  const mins = resort.transfer_minutes;
  if (isSeaplane) {
    if (mins <= 30) return `공항에서 수상비행기로 단 ${mins}분. 하늘 위에서 내려다보는 에메랄드빛 산호 군도가 여행의 첫 장면이 됩니다.`;
    if (mins <= 40) return `수상비행기 ${mins}분, 몰디브 특유의 이동 방식으로 도착까지 이미 여행이 시작됩니다. 창밖으로 펼쳐지는 산호섬 뷰가 기대감을 높여줍니다.`;
    return `수상비행기 ${mins}분 거리의 외딴 아톨. 공항에서 멀수록 군중을 벗어난 온전한 자연 속 리조트를 경험합니다.`;
  } else {
    if (mins <= 25) return `공항에서 스피드보트로 ${mins}분, 이동 부담이 가장 적은 말레 아톨 리조트. 도착 직후부터 온전한 휴식을 시작할 수 있습니다.`;
    if (mins <= 60) return `스피드보트 ${mins}분, 파도 위를 달리며 도착하는 과정 자체가 몰디브 특유의 경험입니다. 풍부한 해양 생태계가 기다립니다.`;
    return `스피드보트 ${mins}분, 긴 이동이지만 그만큼 깊숙이 자리한 리조트. 외부와 단절된 완전한 프라이버시를 원하는 커플에게 적합합니다.`;
  }
}

function updatePrefsHint() {
  const el = document.getElementById('prefsHint');
  if (!el) return;
  const p = getPrefs();
  const WLABEL = ['관심없음', '보통', '중요'];
  const KEYS = [
    { key: 'lagoon', label: '라군' },
    { key: 'underwater', label: '수중' },
    { key: 'privacy', label: '프라이빗' },
    { key: 'dining', label: '다이닝' },
  ];
  const parts = KEYS.filter(k => p[k.key] !== 1).map(k => `${k.label} ${WLABEL[p[k.key]]}`);
  el.textContent = parts.length === 0 ? '모두 보통' : parts.join(' · ');
}

// ── Hero 배경 이미지 설정 ─────────────────────────────────────────
function setHeroBg() {
  const bg = document.getElementById('heroBg');
  if (!bg) return;
  for (const r of RESORTS) {
    const img = getFeaturedImage(r) || (r.image_urls && r.image_urls[0]);
    if (img) {
      bg.style.backgroundImage = `url(${img})`;
      return;
    }
  }
}

// ── D-Day 계산 ─────────────────────────────────────────────────────
function updateDDay() {
  const target = new Date('2027-03-07');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  const el = document.getElementById('ddayBadge');
  if (!el) return;
  if (diff > 0) el.textContent = `D-${diff}`;
  else if (diff === 0) el.textContent = 'D-Day! 🎉';
  else el.textContent = `D+${Math.abs(diff)}`;
}

// ── 탭 전환 ────────────────────────────────────────────────────────
const tabInited = new Set();

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));

  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const content = document.getElementById(`tab-${tabId}`);
  if (btn) btn.classList.add('active');
  if (content) content.classList.add('active');

  // 미니맵: 카드 탭에서만 표시
  document.getElementById('minimapFloat')?.classList.toggle('visible', tabId === 'cards');

  if (!tabInited.has(tabId)) {
    tabInited.add(tabId);
    if (tabId === 'plan') initPlan({ openDetailFn: openDetailInCards });
    if (tabId === 'cards') {
      initCards(openDetailInCards);
      initResizeHandle(
        document.getElementById('cardsResizeHandle'),
        document.querySelector('.cards-left-col'),
        'cards-left-w', 240, 700
      );
    }
    if (tabId === 'price') {
      initPrice(openDetailInPrice);
      initResizeHandle(
        document.getElementById('priceResizeHandle'),
        document.querySelector('.price-left-col'),
        'price-left-w', 280, 780
      );
    }
    if (tabId === 'tournament') initTournament(openDetailInTournament);
    if (tabId === 'pdf') initPdf();
  }
}

// ── 패널 리사이즈 핸들 ─────────────────────────────────────────────
function initResizeHandle(handle, leftEl, storageKey, min = 200, max = 720) {
  if (!handle || !leftEl) return;
  const stored = parseInt(localStorage.getItem(storageKey));
  if (stored && stored >= min && stored <= max) leftEl.style.width = stored + 'px';

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    handle.classList.add('dragging');
    const startX = e.clientX;
    const startW = leftEl.getBoundingClientRect().width;
    const onMove = mv => {
      const w = Math.max(min, Math.min(max, startW + mv.clientX - startX));
      leftEl.style.width = w + 'px';
    };
    const onUp = () => {
      handle.classList.remove('dragging');
      localStorage.setItem(storageKey, Math.round(leftEl.getBoundingClientRect().width));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ── 카드 탭 분할 오른쪽 패널에 상세 렌더 ──────────────────────────
// ── 토너먼트 탭 오른쪽 상세 패널 ─────────────────────────────────
function openDetailInTournament(resortId) {
  const resort = RESORTS.find(r => r.id === resortId);
  const col = document.getElementById('tournamentDetailCol');
  if (!col || !resort) return;

  // 현재 매치에서 이 리조트가 선택 가능한 상대인지 확인해서 "선택" 버튼 표시
  col.innerHTML = `
    <div class="tournament-detail-bar">
      <button class="tdb-back-btn" onclick="window._tournamentCloseDetail()">← 돌아가기</button>
      <button class="tdb-pick-btn" onclick="window._tournamentPick('${resort.id}')">💗 이 리조트 선택</button>
    </div>
    <div class="tournament-detail-content">${renderResortDetail(resort)}</div>`;

  document.getElementById('tournamentSplit')?.classList.add('detail-open');
  col.scrollTop = 0;
}

let _currentDetailResortId = null;

function openDetailInCards(resortId) {
  _currentDetailResortId = resortId;
  const resort = RESORTS.find(r => r.id === resortId);
  if (!resort) return;
  const panel = document.getElementById('cardsDetailPanel');
  if (panel) {
    const closeBar = panel.querySelector('.cards-detail-close-bar');
    panel.innerHTML = renderResortDetail(resort);
    if (closeBar) panel.insertBefore(closeBar, panel.firstChild);
    panel.scrollTop = 0;
  }
  document.getElementById('tab-cards').classList.add('detail-open');
  window._minimapHide?.();
  document.querySelectorAll('.resort-card').forEach(c => c.classList.remove('selected'));
  document.querySelector(`.resort-card[data-id="${resortId}"]`)?.classList.add('selected');
  // 미니맵 핀 하이라이트
  document.querySelectorAll('.map-pin').forEach(p => p.classList.remove('active'));
  document.querySelector(`.map-pin[data-resort="${resortId}"]`)?.classList.add('active');
}

window.closeCardDetail = function() {
  document.getElementById('tab-cards').classList.remove('detail-open');
  const panel = document.getElementById('cardsDetailPanel');
  if (!panel) return;
  const closeBar = panel.querySelector('.cards-detail-close-bar');
  panel.innerHTML = '';
  if (closeBar) panel.appendChild(closeBar);
  const empty = document.createElement('div');
  empty.className = 'cards-detail-empty';
  empty.innerHTML = '<div style="font-size:48px;">🏝️</div><div>리조트 카드를 클릭하면<br>상세 정보가 여기 표시됩니다</div>';
  panel.appendChild(empty);
  document.querySelectorAll('.resort-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.map-pin').forEach(p => p.classList.remove('active'));
  _currentDetailResortId = null;
  window._minimapShow?.();
};

// ── 가격 탭 오른쪽 패널에 상세 렌더 ──────────────────────────────
function openDetailInPrice(resortId) {
  const resort = RESORTS.find(r => r.id === resortId);
  if (!resort) return;
  const panel = document.getElementById('priceDetailPanel');
  if (panel) {
    const closeBar = panel.querySelector('.price-detail-close-bar');
    panel.innerHTML = renderResortDetail(resort);
    if (closeBar) panel.insertBefore(closeBar, panel.firstChild);
    panel.scrollTop = 0;
  }
  document.getElementById('tab-price').classList.add('detail-open');
}

window.closePriceDetail = function() {
  document.getElementById('tab-price').classList.remove('detail-open');
  const panel = document.getElementById('priceDetailPanel');
  if (!panel) return;
  const closeBar = panel.querySelector('.price-detail-close-bar');
  panel.innerHTML = '';
  if (closeBar) panel.appendChild(closeBar);
  const empty = document.createElement('div');
  empty.className = 'price-detail-empty';
  empty.innerHTML = '<div style="font-size:48px;">💰</div><div>리조트 이름을 클릭하면<br>상세 정보가 여기 표시됩니다</div>';
  panel.appendChild(empty);
  document.querySelectorAll('.resort-row').forEach(r => r.classList.remove('selected'));
};

// ── 지도/토너먼트용 오버레이 ────────────────────────────────────────
export function openDetail(resortId) {
  const resort = RESORTS.find(r => r.id === resortId);
  if (!resort) return;

  const overlay = document.getElementById('detailOverlay');
  const title = document.getElementById('detailOverlayTitle');
  const panel = document.getElementById('detailReportPanel');
  const mapName = document.getElementById('detailMapName');
  const mapSub = document.getElementById('detailMapSub');

  title.textContent = `${resort.name_ko}  ·  ${resort.name_en}`;
  mapName.textContent = resort.name_ko;
  mapSub.textContent = `${resort.atoll} · ${resort.transfer_type === 'seaplane' ? '✈' : '🚤'} ${resort.transfer_minutes}분 · ${resort.distance_km}km`;

  panel.innerHTML = renderResortDetail(resort);
  overlay.classList.add('open');
  panel.scrollTop = 0;
}

export function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
}

// ── Pick 모달 ──────────────────────────────────────────────────────
window._pickModalResortId = null;

window._openPickModal = function(resortId) {
  const r = RESORTS.find(x => x.id === resortId);
  if (!r) return;
  window._pickModalResortId = resortId;

  document.getElementById('pickModalResortName').textContent = r.name_ko;

  const picks = window._currentPicks || { sohee: [null,null,null], sungwoo: [null,null,null] };
  document.querySelectorAll('.pick-slot-btn').forEach(btn => {
    const person = btn.dataset.person;
    const rank   = parseInt(btn.dataset.rank);
    const cur    = picks[person]?.[rank];
    btn.classList.remove('slot-active', 'slot-taken');
    if (cur === resortId) {
      btn.classList.add('slot-active');
      btn.textContent = `✓ ${['🥇','🥈','🥉'][rank]} ${rank+1}위`;
    } else if (cur) {
      const ex = RESORTS.find(x => x.id === cur);
      btn.classList.add('slot-taken');
      btn.textContent = `${['🥇','🥈','🥉'][rank]} ${rank+1}위 (현재: ${ex?.name_ko || '…'})`;
    } else {
      btn.textContent = `${['🥇','🥈','🥉'][rank]} ${rank+1}위`;
    }
  });

  const anyPick = ['sohee','sungwoo'].some(p => picks[p]?.includes(resortId));
  const removeBtn = document.getElementById('pickRemoveBtn');
  if (removeBtn) removeBtn.style.display = anyPick ? 'block' : 'none';

  document.getElementById('pickModal').style.display = 'flex';
  document.getElementById('pickModalBackdrop').style.display = 'block';
};

window._closePickModal = function() {
  document.getElementById('pickModal').style.display = 'none';
  document.getElementById('pickModalBackdrop').style.display = 'none';
  window._pickModalResortId = null;
};

window._handlePickSlot = async function(person, rank) {
  const resortId = window._pickModalResortId;
  if (!resortId) return;
  try {
    await setPick(person, rank, resortId);
    showToast('✓ Pick 저장됨');
    window._openPickModal(resortId);
  } catch { showToast('저장 실패', 'error'); }
};

window._removePickForResort = async function(resortId) {
  const picks = window._currentPicks || {};
  try {
    for (const person of ['sohee','sungwoo']) {
      const arr = picks[person] || [];
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] === resortId) await removePick(person, i);
      }
    }
    showToast('Pick이 해제됐어요');
    window._closePickModal();
  } catch { showToast('해제 실패', 'error'); }
};

// ── 메모 팝업 ──────────────────────────────────────────────────────
let _memoResortId = null;
let _memoUnsub = null;
let _memoAuthor = '성우';

window._openMemo = function(resortId) {
  _memoResortId = resortId;

  // 이전 구독 정리
  if (_memoUnsub) { _memoUnsub(); _memoUnsub = null; }

  // 팝업 표시
  const popup = document.getElementById('memoPopup');
  const backdrop = document.getElementById('memoBackdrop');
  popup.style.display = 'flex';
  backdrop.style.display = 'block';

  // 작성자 버튼 상태 초기화
  document.querySelectorAll('.author-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.author === _memoAuthor);
    b.onclick = () => {
      _memoAuthor = b.dataset.author;
      document.querySelectorAll('.author-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    };
  });

  // 실시간 댓글 구독
  _memoUnsub = subscribeComments(resortId, renderMemoComments);
};

window._closeMemo = function() {
  document.getElementById('memoPopup').style.display = 'none';
  document.getElementById('memoBackdrop').style.display = 'none';
  if (_memoUnsub) { _memoUnsub(); _memoUnsub = null; }
  _memoResortId = null;
};

window._sendMemo = async function() {
  const ta = document.getElementById('memoComposeTa');
  const text = ta.value.trim();
  if (!text || !_memoResortId) return;
  const btn = document.getElementById('memoSendBtn');
  btn.disabled = true;
  try {
    await addComment(_memoResortId, _memoAuthor, text);
    ta.value = '';
    ta.focus();
  } finally {
    btn.disabled = false;
  }
};

window._deleteMemo = async function(commentId) {
  if (!_memoResortId) return;
  await deleteComment(_memoResortId, commentId);
};

function renderMemoComments(comments) {
  const wrap = document.getElementById('memoComments');
  if (!wrap) return;
  if (!comments.length) {
    wrap.innerHTML = '<div class="memo-empty">아직 메모가 없어요 ✏️</div>';
    return;
  }
  wrap.innerHTML = comments.map(c => {
    const isSungwoo = c.author === '성우';
    let timeStr = '';
    try {
      if (c.createdAt?.toDate) {
        timeStr = c.createdAt.toDate().toLocaleString('ko-KR', {
          month: 'numeric', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });
      }
    } catch (_) {}
    // XSS 방지 — text를 textContent로 이스케이프 처리
    const escaped = c.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    return `
<div class="memo-comment ${isSungwoo ? 'comment-sungwoo' : 'comment-sohee'}">
  <div class="comment-avatar">${isSungwoo ? '🧑' : '👩'}</div>
  <div class="comment-bubble">
    <div class="comment-meta">
      <span class="comment-author">${c.author}</span>
      <span class="comment-time">${timeStr}</span>
    </div>
    <div class="comment-text">${escaped}</div>
  </div>
  <button class="comment-del-btn" onclick="window._deleteMemo('${c.id}')" title="삭제">🗑</button>
</div>`;
  }).join('');
  wrap.scrollTop = wrap.scrollHeight;
}

// ── 리조트 상세 HTML 렌더링 ────────────────────────────────────────
function stars(n, max = 5) {
  return '★'.repeat(n) + '<span class="empty">' + '★'.repeat(max - n) + '</span>';
}

function renderGalleryContent(r, overrideUrls) {
  const urls = overrideUrls !== undefined ? overrideUrls : (r.image_urls && r.image_urls.length ? r.image_urls : null);
  const hero = getFeaturedImage(r);
  if (hero || (urls && urls.length)) {
    const galleryUrls = (urls && urls.length) ? urls : [hero];
    const mainUrl = hero || galleryUrls[0];
    const thumbs = galleryUrls.map((url, i) =>
      `<div class="gallery-thumb${getFeaturedImage(r) === url ? ' active' : ''}" data-idx="${i}" data-url="${encodeURIComponent(url)}" onclick="window._galleryThumb(this,'${r.id}')">
        <img src="${url}" alt="${r.name_ko}" loading="lazy" onerror="this.parentElement.style.display='none'">
        <div class="gallery-set-btn" onclick="event.stopPropagation();window._setFeatured('${r.id}',this.closest('.gallery-thumb').dataset.url)" title="대표 이미지로 설정">⭐</div>
      </div>`
    ).join('');
    return `
<div class="image-gallery">
  <div class="gallery-main" id="galleryMain_${r.id}">
    <img src="${mainUrl}" alt="${r.name_ko}" id="galleryMainImg_${r.id}" onerror="this.src=''; this.style.display='none'">
  </div>
  ${galleryUrls.length > 1 ? `<div class="gallery-thumbs">${thumbs}</div>` : ''}
</div>`;
  }
  return `<div class="gallery-empty">🏝️<br><small>이미지 준비 중</small></div>`;
}

function renderImageGallery(r) {
  return `<div class="gallery-outer" id="galleryOuter_${r.id}">
  ${renderGalleryContent(r)}
  <button class="gallery-edit-btn" onclick="window._openImageEdit('${r.id}')" title="이미지 추가/삭제">🖼️ 편집</button>
</div>`;
}

// 이미지 편집 팝업 상태
let _imgResortId = null;
let _imgEditUrls = [];

window._openImageEdit = async function(resortId) {
  _imgResortId = resortId;
  const r = RESORTS.find(x => x.id === resortId);
  if (!r) return;

  // Firebase 커스텀 이미지 또는 기본 이미지 로드
  const custom = await getCustomImages(resortId);
  _imgEditUrls = custom !== null ? [...custom] : [...(r.image_urls || [])];

  _renderImgEditList();
  document.getElementById('imgEditPopup').style.display = 'flex';
  document.getElementById('imgEditBackdrop').style.display = 'block';
};

window._closeImageEdit = function() {
  document.getElementById('imgEditPopup').style.display = 'none';
  document.getElementById('imgEditBackdrop').style.display = 'none';
  _imgResortId = null;
};

function _renderImgEditList() {
  const wrap = document.getElementById('imgEditList');
  if (!wrap) return;
  if (!_imgEditUrls.length) {
    wrap.innerHTML = '<div class="img-edit-empty">이미지 URL이 없습니다</div>';
    return;
  }
  wrap.innerHTML = _imgEditUrls.map((url, i) => `
    <div class="img-edit-row">
      <img class="img-edit-thumb" src="${url}" onerror="this.style.opacity='0.2'" loading="lazy" alt="">
      <span class="img-edit-url" title="${url}">${url.length > 55 ? url.slice(0, 55) + '…' : url}</span>
      <button class="img-edit-del" onclick="window._imgDel(${i})" title="삭제">×</button>
    </div>
  `).join('');
}

window._imgDel = function(idx) {
  _imgEditUrls.splice(idx, 1);
  _renderImgEditList();
};

window._imgAdd = function() {
  const input = document.getElementById('imgAddInput');
  const url = (input.value || '').trim();
  if (!url) return;
  _imgEditUrls.push(url);
  input.value = '';
  _renderImgEditList();
};

window._imgSave = async function() {
  if (!_imgResortId) return;
  const btn = document.getElementById('imgSaveBtn');
  btn.disabled = true;
  btn.textContent = '저장 중…';
  try {
    await saveCustomImages(_imgResortId, [..._imgEditUrls]);
    // 갤러리 DOM 즉시 갱신
    const r = RESORTS.find(x => x.id === _imgResortId);
    const outer = document.getElementById(`galleryOuter_${_imgResortId}`);
    if (r && outer) {
      outer.innerHTML = renderGalleryContent(r, _imgEditUrls)
        + `<button class="gallery-edit-btn" onclick="window._openImageEdit('${_imgResortId}')" title="이미지 추가/삭제">🖼️ 편집</button>`;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '저장';
    window._closeImageEdit();
  }
};

window._galleryThumb = function(el, resortId) {
  const url = decodeURIComponent(el.dataset.url || '');
  const main = document.getElementById(`galleryMainImg_${resortId}`);
  if (main && url) {
    main.style.opacity = '0';
    setTimeout(() => { main.src = url; main.style.opacity = '1'; }, 120);
  }
  el.closest('.gallery-thumbs')?.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
};

window._setFeatured = function(resortId, encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  try { localStorage.setItem('featured_img_' + resortId, url); } catch (_) {}
  const main = document.getElementById(`galleryMainImg_${resortId}`);
  if (main) main.src = url;
  const cardImg = document.querySelector(`.resort-card[data-id="${resortId}"] .card-image img`);
  if (cardImg) cardImg.src = url;
  showToast('✓ 대표 이미지로 설정됨');
};

function renderYoutubeSection(r) {
  const searchQuery = encodeURIComponent(`${r.name_ko} 몰디브 후기 브이로그`);
  const ytSearchUrl = `https://www.youtube.com/results?search_query=${searchQuery}`;

  const searchBtn = `<a href="${ytSearchUrl}" target="_blank" class="yt-search-btn">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
    유튜브에서 검색
  </a>`;

  if (!r.youtube_ids || r.youtube_ids.length === 0) {
    return `
<div class="yt-section">
  <div class="yt-section-header">
    <span class="yt-label">▶ 유튜브 영상 후기</span>
    ${searchBtn}
  </div>
  <div class="yt-empty-grid">
    ${[
      r.name_ko + ' 몰디브 브이로그',
      r.name_ko + ' 신혼여행 후기',
      r.name_ko + ' Maldives review',
    ].map(q => {
      const enc = encodeURIComponent(q);
      return `<a href="https://www.youtube.com/results?search_query=${enc}" target="_blank" class="yt-search-card">
        <div class="yt-search-icon">🔍</div>
        <div class="yt-search-text">${q}</div>
      </a>`;
    }).join('')}
  </div>
</div>`;
  }

  const embeds = r.youtube_ids.map(id => `
<div class="yt-embed-wrap">
  <iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0" allowfullscreen loading="lazy" title="${r.name_ko} 영상"></iframe>
</div>`).join('');

  return `
<div class="yt-section">
  <div class="yt-section-header">
    <span class="yt-label">▶ 유튜브 영상 후기 (${r.youtube_ids.length}개)</span>
    ${searchBtn}
  </div>
  <div class="yt-embed-grid">${embeds}</div>
</div>`;
}

function buildQuickSummary(r) {
  const items = [];
  const ok = (label) => items.push({ label, ok: true });
  const warn = (label) => items.push({ label, ok: false });

  // 이동 수단
  if (r.transfer_type === 'seaplane') {
    r.transfer_minutes <= 35 ? ok(`✈ 수상비행기 ${r.transfer_minutes}분`) : warn(`✈ 수상비행기 ${r.transfer_minutes}분`);
  } else {
    ok(`🚤 스피드보트 ${r.transfer_minutes}분`);
  }
  if (r.has_hammock) ok('🛏️ 해먹 있음');
  if (r.ratings.lagoon >= 4) ok('라군뷰 최상');
  if (r.ratings.privacy >= 4) ok('프라이버시 우수');
  if (r.ratings.dining >= 4) ok('다이닝 우수');
  if (r.ratings.underwater >= 4) ok('스노클링 우수');
  const hasAI = Object.values(r.agencies).some(ag => ag.meal_plan === 'AI');
  if (hasAI) ok('올인클루시브 포함');

  return items.slice(0, 7).map(({ label, ok: isOk }) =>
    `<span class="qs-item ${isOk ? 'qs-ok' : 'qs-warn'}">${label}</span>`
  ).join('');
}

function renderResortDetail(r) {
  const agencies = r.agencies;
  const agencyIds = Object.keys(agencies);
  const agencyNames = { realmaldives: '리얼몰디브', honeymoonresort: '허니문리조트', tourmin: '투어민' };
  const agencyClass = { realmaldives: 'real', honeymoonresort: 'honey', tourmin: 'tour' };

  // 적합도 점수
  const fitScore = calcFitScore(r);

  // 가격 카드 (prow 스타일)
  const priceCardsHtml = agencyIds.map(agId => {
    const ag = agencies[agId];
    const key_labels = [
      ['water_pool_4n', '🏊 워터풀빌라 4박'],
      ['water_4n', '🌊 워터빌라 4박'],
      ['mix_4n', '🔀 비치+워터 믹스 4박'],
      ['beach_4n', '🏖️ 비치빌라 4박'],
    ];
    const rows = key_labels.filter(([k]) => ag[k] != null).map(([key, label]) => {
      const disc = ag[key + '_disc'];
      const base = ag[key];
      const hasDiscount = disc != null;
      return `
<div class="prow">
  <span class="prow-label">${label}</span>
  <div class="prow-prices">
    ${hasDiscount ? `<span class="prow-original">$${base.toLocaleString()}</span>` : ''}
    <span class="prow-final${hasDiscount ? ' is-discount' : ''}">$${(hasDiscount ? disc : base).toLocaleString()}</span>
    <span class="prow-unit">/인</span>
  </div>
</div>`;
    }).join('');

    const promoHtml = ag.promotions?.length
      ? ag.promotions.map(p => `<div class="promo-badge">🎯 ${p}</div>`).join('') : '';
    const priceNoteHtml = ag.price_note
      ? `<div class="promo-badge" style="background:#FFF8E1;border-color:#FBC02D;color:#6D4C00;">📅 ${ag.price_note}</div>` : '';

    return `
<div class="price-card">
  <div class="price-card-header ${agencyClass[agId]}">
    <span class="price-agency ${agencyClass[agId]}">${agencyNames[agId]}</span>
    <span class="price-plan">${ag.meal_plan_name || ag.meal_plan}</span>
  </div>
  <div class="price-rows">${rows}</div>
  ${promoHtml}${priceNoteHtml}
  <div class="cancellation-note">📋 취소: ${ag.cancellation || '미확인'}</div>
</div>`;
  }).join('');

  const hmAg = agencies[agencyIds[0]];
  const hmTierClass = r.honeymoon_tier === '최상' ? 'good' : r.honeymoon_tier === '중간' ? 'ok' : 'weak';

  const pdfLinksHtml = r.pdfs.length
    ? r.pdfs.map(p => `<button class="pdf-link-btn" onclick="openPdfFromDetail('${p.file}', '${p.label}')">📄 ${p.label}</button>`).join('')
    : '<span style="color:var(--text-light);font-size:12px;">관련 PDF 없음</span>';

  return `
<section class="resort-section">
  <!-- 헤더 -->
  <div class="resort-header">
    <div class="resort-header-left">
      <div class="resort-name">${r.name_ko}</div>
      <div class="resort-name-en">${r.name_en}</div>
      <div class="resort-meta">
        <span class="meta-pill pill-blue">📍 ${r.atoll}</span>
        <span class="meta-pill pill-teal">${r.transfer_type === 'seaplane' ? '✈️' : '🚤'} ${r.transfer_minutes}분</span>
        ${r.villas ? `<span class="meta-pill pill-gray">🏠 ${r.villas}빌라</span>` : ''}
        ${r.opened ? `<span class="meta-pill pill-gray">📅 ${r.opened}년 오픈</span>` : ''}
        ${agencyIds.map(id => `<span class="meta-pill pill-${id === 'realmaldives' ? 'coral' : id === 'tourmin' ? 'teal' : 'blue'}">${agencyNames[id]}</span>`).join('')}
      </div>
    </div>
    <div class="detail-header-actions">
      <div class="fit-score">
        <div class="fit-score-num">${fitScore}%</div>
        <div class="fit-score-label">취향 적합도</div>
      </div>
      <button class="pick-trigger-btn" onclick="window._openPickModal('${r.id}')">💗 Pick</button>
      <button class="memo-trigger-btn" onclick="window._openMemo('${r.id}')">💬 메모</button>
    </div>
  </div>

  <!-- Quick Summary -->
  <div class="quick-summary">${buildQuickSummary(r)}</div>

  <!-- 이미지 갤러리 -->
  ${renderImageGallery(r)}

  <!-- 위치 & 이동 -->
  <div class="block">
    <div class="block-header">위치 &amp; 이동</div>
    <div class="location-card">
      <div class="location-visual ${r.transfer_type === 'seaplane' ? 'loc-sea' : 'loc-boat'}">
        <div class="loc-transfer-icon">${r.transfer_type === 'seaplane' ? '✈' : '🚤'}</div>
        <div class="loc-minutes">${r.transfer_minutes}<span class="loc-min-unit">분</span></div>
        <div class="loc-from">말레 공항 기준</div>
      </div>
      <div class="location-info">
        <div class="loc-atoll-row">
          <span class="loc-atoll-badge">${r.atoll}</span>
          ${r.transfer_type === 'seaplane'
            ? '<span class="loc-type-badge loc-type-sea">✈ 수상비행기</span>'
            : '<span class="loc-type-badge loc-type-boat">🚤 스피드보트</span>'}
        </div>
        <div class="loc-access-desc">${getAccessDesc(r)}</div>
        <button class="loc-map-btn" onclick="window._minimapShowWithPin('${r.id}')">
          🗺️ 지도에서 보기
        </button>
      </div>
    </div>
  </div>

  <!-- 가격 -->
  <div class="block">
    <div class="block-header">가격 비교 · 1인 USD · 4박</div>
    <div class="block-body">
      <div class="price-compare ${agencyIds.length > 1 ? 'two-col' : 'one-col'}">
        ${priceCardsHtml}
      </div>
    </div>
  </div>

  <!-- 기본 정보 -->
  <div class="block">
    <div class="block-header">리조트 특징</div>
    <div class="block-body">
      <p class="resort-desc">${r.description}</p>
      <div class="pros-cons">
        <div class="pros">
          <div class="pros-title">장점</div>
          <ul>${r.pros.map(p => `<li>${p}</li>`).join('')}</ul>
        </div>
        <div class="cons">
          <div class="cons-title">주의사항</div>
          <ul>${r.cons.map(c => `<li>${c}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="rating-grid">
        <div class="rating-item"><div class="rating-label">라군뷰</div><div class="rating-stars">${stars(r.ratings.lagoon)}</div></div>
        <div class="rating-item"><div class="rating-label">수중환경</div><div class="rating-stars">${stars(r.ratings.underwater)}</div></div>
        <div class="rating-item"><div class="rating-label">프라이빗</div><div class="rating-stars">${stars(r.ratings.privacy)}</div></div>
        <div class="rating-item"><div class="rating-label">다이닝</div><div class="rating-stars">${stars(r.ratings.dining)}</div></div>
      </div>
    </div>
  </div>

  <!-- 허니문 특전 -->
  <div class="block">
    <div class="block-header">허니문 특전</div>
    <div class="block-body honeymoon-block">
      <ul class="hm-list">
        ${(hmAg.honeymoon_benefits || []).map(b => `<li><span class="hm-icon">💗</span>${b}</li>`).join('')}
      </ul>
      <div class="hm-comment ${hmTierClass}">💬 ${hmAg.honeymoon_comment || ''}</div>
    </div>
  </div>

  <!-- 유튜브 영상 -->
  <div class="block">
    <div class="block-header">영상 후기</div>
    <div class="block-body">${renderYoutubeSection(r)}</div>
  </div>

  <!-- PDF -->
  <div class="block">
    <div class="block-header">관련 PDF 견적서</div>
    <div class="block-body">${pdfLinksHtml}</div>
  </div>
</section>`;
}

// PDF 탭으로 이동 + 파일 열기
window.openPdfFromDetail = function(file, label) {
  closeDetail();
  switchTab('pdf');
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('open-pdf', { detail: { file, label } }));
  }, 150);
};

// ── 초기화 ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateDDay();
  setHeroBg();

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('detailCloseBtn').addEventListener('click', closeDetail);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (_memoResortId) window._closeMemo();
      else closeDetail();
    }
  });

  document.getElementById('detailOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDetail();
  });

  // ── 전역 picks 구독 (모든 탭 공유) ─────────────────────────────
  window._currentPicks = { sohee: [null,null,null], sungwoo: [null,null,null], finalCandidates: [] };
  subscribePicks(picks => {
    window._currentPicks = picks;
    window._refreshCardPickBadges?.();
    // Pick 모달이 열려있으면 슬롯 상태 갱신
    if (window._pickModalResortId) window._openPickModal(window._pickModalResortId);
  });

  // ── 플랜 탭 기본 초기화 (기본 활성 탭) ─────────────────────────
  tabInited.add('plan');
  initPlan({ openDetailFn: openDetailInCards });

  // ── 미니맵 초기화 ────────────────────────────────────────────────
  initMap(openDetailInCards);
  // 기본 탭이 plan이므로 minimap은 숨김 상태로 시작
  document.getElementById('minimapFloat')?.classList.remove('visible');

  // ── 왼쪽 영역 클릭 → 상세 닫기 (cards 탭이 초기화된 후에 이벤트 위임) ──
  document.querySelector('.main-layout')?.addEventListener('click', e => {
    if (!document.getElementById('tab-cards')?.classList.contains('detail-open')) return;
    if (!e.target.closest('#tab-cards')) return;
    if (e.target.closest('.resort-card') || e.target.closest('.cards-right-col')) return;
    window.closeCardDetail();
  });

  // ── 취향 설정 패널 초기화 ────────────────────────────────────────
  updatePrefsHint();
  initPrefsPanel(() => {
    window._renderCards?.();
    if (_currentDetailResortId) {
      const resort = RESORTS.find(r => r.id === _currentDetailResortId);
      if (resort) {
        const scoreEl = document.querySelector('#cardsDetailPanel .fit-score-num');
        if (scoreEl) scoreEl.textContent = calcFitScore(resort) + '%';
      }
    }
    updatePrefsHint();
  });

  window.addEventListener('open-detail', (e) => openDetail(e.detail.id));
});
