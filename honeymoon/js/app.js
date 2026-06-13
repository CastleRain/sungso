// app.js — 탭 라우터 + 공유 상태 + D-Day

import { initCards } from './tab-cards.js';
import { initPrice } from './tab-price.js';
import { initMap } from './tab-map.js';
import { initTournament } from './tab-tournament.js';
import { initPdf } from './tab-pdf.js';
import { initPlan } from './tab-plan.js';
import { RESORTS, getBestPrice, getFeaturedImage } from './resorts-data.js';
import { subscribeComments, addComment, deleteComment, getCustomImages, saveCustomImages, subscribeAllMetaCounts } from './firebase-notes.js';
import { subscribePicks, setPick, removePick } from './firebase-picks.js';
import { calcFitScore, initPrefsPanel, getPrefs } from './user-prefs.js';
import {
  getNaverCache, refreshNaverBlog, subscribeReviewPrefs,
  pinReview, unpinReview, hideReview, unhideReview, subscribeNaverMeta,
} from './firebase-naver.js';

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
    if (tabId === 'plan')       initPlan({ openDetailFn: openDetailSheet });
    if (tabId === 'cards')      initCards(openDetailSheet);
    if (tabId === 'price')      initPrice(openDetailSheet);
    if (tabId === 'tournament') initTournament(openDetailInTournament);
    if (tabId === 'pdf')        initPdf();
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

// ── Detail Modal Sheet ─────────────────────────────────────────────
let _currentDetailResortId = null;
let _sheetCloseTimer = null;

function openDetailSheet(resortId) {
  const resort = RESORTS.find(r => r.id === resortId);
  if (!resort) return;

  _currentDetailResortId = resortId;

  const sheet   = document.getElementById('detailSheet');
  const backdrop = document.getElementById('detailSheetBackdrop');
  const body    = document.getElementById('detailSheetBody');
  if (!sheet || !body) return;

  // 이전 prefs 구독 해제
  _naverPrefsUnsub?.();
  _naverPrefsUnsub = null;

  // 이미 열려있으면 콘텐츠만 교체 (애니메이션 없이)
  const alreadyOpen = sheet.classList.contains('ds-open');
  if (alreadyOpen) {
    body.innerHTML = renderResortDetail(resort);
    body.scrollTop = 0;
    _initNaverSection(resortId);
    return;
  }

  body.innerHTML = renderResortDetail(resort);
  body.scrollTop = 0;
  _initNaverSection(resortId);

  if (_sheetCloseTimer) { clearTimeout(_sheetCloseTimer); _sheetCloseTimer = null; }
  sheet.classList.remove('ds-closing');
  backdrop.classList.add('ds-open');
  // 다음 프레임에 열기 (트랜지션 트리거)
  requestAnimationFrame(() => { sheet.classList.add('ds-open'); });

  // 카드 선택 하이라이트
  document.querySelectorAll('.resort-card').forEach(c => c.classList.remove('selected'));
  document.querySelector(`.resort-card[data-id="${resortId}"]`)?.classList.add('selected');
  document.querySelectorAll('.map-pin').forEach(p => p.classList.remove('active'));
  document.querySelector(`.map-pin[data-resort="${resortId}"]`)?.classList.add('active');

  // 취향 점수 갱신용 트래킹
  // (prefs panel onChange에서 scoreEl 갱신 시 사용)
}

window.closeDetailSheet = function() {
  const sheet    = document.getElementById('detailSheet');
  const backdrop = document.getElementById('detailSheetBackdrop');
  if (!sheet) return;

  _naverPrefsUnsub?.();
  _naverPrefsUnsub = null;

  sheet.classList.add('ds-closing');
  backdrop.classList.remove('ds-open');

  _sheetCloseTimer = setTimeout(() => {
    sheet.classList.remove('ds-open', 'ds-closing');
    document.getElementById('detailSheetBody').innerHTML = '';
    document.querySelectorAll('.resort-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.map-pin').forEach(p => p.classList.remove('active'));
    _currentDetailResortId = null;
  }, 260);
};

// 하위 호환 alias (tab-plan.js의 window.dispatchEvent('open-detail') 등)
export function openDetail(resortId) { openDetailSheet(resortId); }
export function closeDetail()        { window.closeDetailSheet(); }

// ── 토너먼트 탭 split 패널 상세 (모달 시트와 별도) ─────────────────
function openDetailInTournament(resortId) {
  const resort = RESORTS.find(r => r.id === resortId);
  const col = document.getElementById('tournamentDetailCol');
  if (!col || !resort) return;

  col.innerHTML = `
    <div class="tournament-detail-bar">
      <button class="tdb-back-btn" onclick="window._tournamentCloseDetail()">← 돌아가기</button>
      <button class="tdb-pick-btn" onclick="window._tournamentPick('${resort.id}')">💗 이 리조트 선택</button>
    </div>
    <div class="tournament-detail-content">${renderResortDetail(resort)}</div>`;

  document.getElementById('tournamentSplit')?.classList.add('detail-open');
  col.scrollTop = 0;
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

// ── 메모 메타 (개수/최신) 전역 캐시 ──────────────────────────────
let _memoMeta = {}; // { resortId: { commentCount, lastComment, lastAuthor, lastUpdatedAt, resortName } }
window._memoMeta = _memoMeta;

function _getMemoCnt(resortId) {
  return _memoMeta[resortId]?.commentCount || 0;
}

function relativeTime(ts) {
  if (!ts?.toDate) return '';
  try {
    const diff = (Date.now() - ts.toDate().getTime()) / 1000;
    if (diff < 60)    return '방금 전';
    if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${Math.floor(diff / 86400)}일 전`;
  } catch { return ''; }
}

function _refreshMemoCountBadges() {
  // 카드 그리드 배지 갱신
  document.querySelectorAll('.resort-card').forEach(card => {
    const id = card.dataset.id;
    const cnt = _getMemoCnt(id);
    let badge = card.querySelector('.card-memo-badge');
    if (!badge) {
      const img = card.querySelector('.card-image');
      if (img) {
        badge = document.createElement('div');
        badge.className = 'card-memo-badge';
        img.appendChild(badge);
      }
    }
    if (badge) {
      badge.textContent = cnt ? `💬 ${cnt}` : '';
      badge.style.display = cnt ? 'flex' : 'none';
    }
  });

  // 플랜 탭 Pick 슬롯 배지 갱신
  document.querySelectorAll('.pick-slot-filled').forEach(slot => {
    const onclick = slot.getAttribute('onclick') || '';
    const m = onclick.match(/_openPickModal\?\.?\('([^']+)'\)/);
    if (!m) return;
    const id = m[1];
    const cnt = _getMemoCnt(id);
    let badge = slot.querySelector('.psc-memo-badge');
    if (!badge) {
      const name = slot.querySelector('.psc-name');
      if (name) {
        badge = document.createElement('span');
        badge.className = 'psc-memo-badge';
        name.after(badge);
      }
    }
    if (badge) {
      badge.textContent = cnt ? `💬 ${cnt}` : '';
      badge.style.display = cnt ? '' : 'none';
    }
  });

  // 상세 시트 메모 버튼 갱신
  const memoBtn = document.querySelector('#detailSheetBody .memo-trigger-btn');
  if (memoBtn && _currentDetailResortId) {
    const cnt = _getMemoCnt(_currentDetailResortId);
    memoBtn.textContent = `💬 메모${cnt ? ` ${cnt}` : ''}`;
  }
}

// ── 메모 알림 센터 ────────────────────────────────────────────────
let _memoCenterOpen = false;
window._memoCenterOpen = false;

window._toggleMemoCenter = function() {
  _memoCenterOpen ? window._closeMemoCenter() : window._openMemoCenter();
};

window._openMemoCenter = function() {
  _memoCenterOpen = true;
  window._memoCenterOpen = true;
  _renderMemoCenterItems();
  document.getElementById('memoCenterBackdrop').style.display = 'block';
  // 다음 프레임에 클래스 추가 (트랜지션 트리거)
  requestAnimationFrame(() => {
    document.getElementById('memoCenterDrawer').classList.add('mcd-open');
  });
};

window._closeMemoCenter = function() {
  _memoCenterOpen = false;
  window._memoCenterOpen = false;
  document.getElementById('memoCenterDrawer').classList.remove('mcd-open');
  document.getElementById('memoCenterBackdrop').style.display = 'none';
};

function _renderMemoCenterItems() {
  const list = document.getElementById('memoCenterList');
  if (!list) return;

  const entries = Object.entries(_memoMeta)
    .filter(([, m]) => m.commentCount > 0 && m.resortName)
    .sort((a, b) => {
      const ta = a[1].lastUpdatedAt?.toDate?.()?.getTime() || 0;
      const tb = b[1].lastUpdatedAt?.toDate?.()?.getTime() || 0;
      return tb - ta;
    });

  if (!entries.length) {
    list.innerHTML = '<div class="mcd-empty">아직 메모가 없어요<br><small>리조트 상세에서 메모를 남겨보세요</small></div>';
    return;
  }

  list.innerHTML = entries.map(([resortId, m]) => {
    const timeStr = relativeTime(m.lastUpdatedAt);
    const textPreview = (m.lastComment || '').slice(0, 45) + ((m.lastComment || '').length > 45 ? '…' : '');
    const authorAvatar = m.lastAuthor === '소희' ? '👩' : '🧑';
    return `
<div class="mcd-item" onclick="window._memoCenterOpenResort('${resortId}')">
  <div class="mcd-resort-row">
    <span class="mcd-resort-name">${m.resortName}</span>
    <span class="mcd-time">${timeStr}</span>
  </div>
  <div class="mcd-author">${authorAvatar} ${m.lastAuthor}</div>
  <div class="mcd-text">${textPreview.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
  <div class="mcd-count-chip">💬 메모 ${m.commentCount}개</div>
</div>`;
  }).join('');
}

window._memoCenterOpenResort = function(resortId) {
  window._closeMemoCenter();
  openDetailSheet(resortId);
  setTimeout(() => window._openMemo(resortId), 320);
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
    const resort = RESORTS.find(r => r.id === _memoResortId);
    await addComment(_memoResortId, resort?.name_ko || '', _memoAuthor, text);
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
      <button class="memo-trigger-btn" onclick="window._openMemo('${r.id}')">💬 메모${_getMemoCnt(r.id) ? ` ${_getMemoCnt(r.id)}` : ''}</button>
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

  <!-- 네이버 블로그 후기 -->
  <div class="block naver-block" id="naverBlock_${r.id}">
    <div class="block-header naver-block-header">
      <span>📝 블로그 후기</span>
      <div class="naver-header-actions">
        <button class="nsort-btn active" data-sort="sim"
          onclick="window._naverSetSort('${r.id}','sim',this)">관련순</button>
        <button class="nsort-btn" data-sort="date"
          onclick="window._naverSetSort('${r.id}','date',this)">최신순</button>
        <button class="naver-refresh-btn"
          onclick="window._naverRefresh('${r.id}')">🔄 새로 가져오기</button>
        <button class="naver-author-btn"
          onclick="window._naverToggleAuthor(this)">👤 <span class="naver-author-label">${window._naverAuthor||'성우'}</span></button>
      </div>
    </div>
    <div id="naverBody_${r.id}" class="naver-body">
      <div class="naver-loading">⏳ 후기 불러오는 중...</div>
    </div>
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


  // ── 전역 picks 구독 (모든 탭 공유) ─────────────────────────────
  window._currentPicks = { sohee: [null,null,null], sungwoo: [null,null,null], finalCandidates: [] };
  subscribePicks(picks => {
    window._currentPicks = picks;
    window._refreshCardPickBadges?.();
    if (window._pickModalResortId) window._openPickModal(window._pickModalResortId);
  });

  // ── 네이버 블로그 메타 구독 (카드 배지) ─────────────────────────
  window._naverCache  = {};
  window._naverPrefs  = {};
  window._naverAuthor = '성우';
  subscribeNaverMeta(meta => {
    window._naverMeta = meta;
    window._refreshNaverBadges?.();
  });

  // ── 전역 메모 메타 구독 (개수 배지 + 알림 센터) ─────────────────
  subscribeAllMetaCounts(meta => {
    _memoMeta = meta;
    window._memoMeta = meta;
    _refreshMemoCountBadges();
    if (_memoCenterOpen) _renderMemoCenterItems();
    const total = Object.values(meta).reduce((s, m) => s + (m.commentCount || 0), 0);
    const countEl = document.getElementById('memoNotifCount');
    if (countEl) { countEl.textContent = total; countEl.style.display = total ? '' : 'none'; }
  });

  // ── 플랜 탭 기본 초기화 (기본 활성 탭) ─────────────────────────
  tabInited.add('plan');
  initPlan({ openDetailFn: openDetailSheet });

  // ── 미니맵 초기화 ────────────────────────────────────────────────
  initMap(openDetailSheet);
  document.getElementById('minimapFloat')?.classList.remove('visible');

  // ── 취향 설정 패널 초기화 ────────────────────────────────────────
  updatePrefsHint();
  initPrefsPanel(() => {
    window._renderCards?.();
    // detail sheet가 열려있으면 취향 점수 즉시 갱신
    if (_currentDetailResortId) {
      const resort = RESORTS.find(r => r.id === _currentDetailResortId);
      if (resort) {
        const scoreEl = document.querySelector('#detailSheetBody .fit-score-num');
        if (scoreEl) scoreEl.textContent = calcFitScore(resort) + '%';
      }
    }
    updatePrefsHint();
  });

  // ESC 키 — 우선순위: 알림센터 → 메모 → pick → detailSheet
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (_memoCenterOpen)           { window._closeMemoCenter?.(); return; }
      if (_memoResortId)             { window._closeMemo?.();       return; }
      if (window._pickModalResortId) { window._closePickModal?.();  return; }
      if (document.getElementById('detailSheet')?.classList.contains('ds-open')) {
        window.closeDetailSheet();
      }
    }
  });

  window.addEventListener('open-detail', (e) => openDetailSheet(e.detail.id));
});

// ══════════════════════════════════════════════════════════════════
// 네이버 블로그 후기 — 상태 + 함수들
// ══════════════════════════════════════════════════════════════════

let _naverPrefsUnsub = null;

// YYYYMMDD → "2025.01.12" 포맷
function _fmtPostdate(s) {
  if (!s || s.length < 8) return s || '';
  return `${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`;
}

// Firestore Timestamp or Date → "yyyy.mm.dd HH:MM"
function _fmtFetchedAt(ts) {
  const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 캐시 + prefs 병합 → { visible: [...], hiddenItems: [...] }
function _naverMerge(resortId) {
  const cache = window._naverCache[resortId];
  const prefs = window._naverPrefs[resortId] || { pinned: {}, hidden: {} };
  const pinned = prefs.pinned || {};
  const hidden = prefs.hidden || {};

  // pinned 항목 (pinnedAt 오름차순)
  const pinnedItems = Object.values(pinned).sort((a, b) => {
    const ta = a.pinnedAt?.seconds || 0;
    const tb = b.pinnedAt?.seconds || 0;
    return ta - tb;
  }).map(it => ({ ...it, _pinned: true }));

  // cache 항목 중 pinned ∪ hidden에 없는 것
  const pinnedSet = new Set(Object.keys(pinned));
  const hiddenSet = new Set(Object.keys(hidden));
  const cacheItems = (cache?.items || []).filter(it => !pinnedSet.has(it.linkHash) && !hiddenSet.has(it.linkHash));

  // 숨긴 항목
  const hiddenItems = Object.values(hidden).sort((a, b) => {
    const ta = a.hiddenAt?.seconds || 0;
    const tb = b.hiddenAt?.seconds || 0;
    return ta - tb;
  });

  return { visible: [...pinnedItems, ...cacheItems], hiddenItems };
}

// 각 리뷰 카드 HTML 생성
function _naverCardHtml(item, resortId, isPinned = false, isHidden = false) {
  const lh  = item.linkHash || '';
  const rid = resortId;
  const esc = s => (s || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
  return `
<div class="nrv-card${isPinned ? ' is-pinned' : ''}${isHidden ? ' is-hidden' : ''}" data-lh="${lh}">
  <div class="nrv-meta">
    ${isPinned ? '<span class="nrv-pin-pill">📌 우리의 참고 후기</span>' : ''}
    <span class="nrv-date">${_fmtPostdate(item.postdate)}</span>
  </div>
  <div class="nrv-title">${esc(item.title)}</div>
  <div class="nrv-blogger">${esc(item.bloggername)}</div>
  ${item.description ? `<div class="nrv-desc">${esc(item.description)}</div>` : ''}
  <div class="nrv-actions">
    <a href="${item.link}" target="_blank" rel="noopener" class="nrv-link-btn">🔗 보기</a>
    ${isHidden
      ? `<button class="nrv-unhide-btn" onclick="window._naverUnhide('${rid}','${lh}')">↩ 복구</button>`
      : `<button class="nrv-pin-btn${isPinned ? ' active' : ''}"
          onclick="window._naverPin('${rid}','${lh}',${isPinned})">
          ${isPinned ? '📌 고정 해제' : '📌 고정'}
        </button>
        <button class="nrv-hide-btn" onclick="window._naverHide('${rid}','${lh}')">🙈 숨김</button>`
    }
  </div>
</div>`;
}

// 후기 목록 렌더
function renderNaverList(resortId) {
  const body = document.getElementById(`naverBody_${resortId}`);
  if (!body) return;

  const cache = window._naverCache[resortId];
  const { visible, hiddenItems } = _naverMerge(resortId);

  let html = '';

  // 마지막 업데이트 표시
  if (cache?.fetchedAt) {
    html += `<div class="naver-fetched-at">마지막 업데이트: ${_fmtFetchedAt(cache.fetchedAt)}</div>`;
  }

  if (visible.length === 0 && hiddenItems.length === 0) {
    html += `<div class="naver-empty">아직 가져온 후기가 없어요<br><button class="nrv-fetch-btn" onclick="window._naverFetch('${resortId}')">후기 가져오기</button></div>`;
  } else if (visible.length === 0) {
    html += `<div class="naver-empty">모든 후기가 숨김 처리됐어요</div>`;
  } else {
    html += visible.map(it => _naverCardHtml(it, resortId, it._pinned || false, false)).join('');
  }

  // 숨긴 후기 토글
  if (hiddenItems.length > 0) {
    html += `
<details class="naver-hidden-toggle">
  <summary>숨긴 후기 ${hiddenItems.length}개 보기</summary>
  <div class="naver-hidden-list">
    ${hiddenItems.map(it => _naverCardHtml(it, resortId, false, true)).join('')}
  </div>
</details>`;
  }

  body.innerHTML = html;
}

// 섹션 초기화 — 상세 시트 열릴 때 호출
async function _initNaverSection(resortId) {
  window._naverPrefs[resortId] = window._naverPrefs[resortId] || { pinned: {}, hidden: {} };

  // prefs 실시간 구독
  _naverPrefsUnsub?.();
  _naverPrefsUnsub = subscribeReviewPrefs(resortId, prefs => {
    window._naverPrefs[resortId] = prefs;
    renderNaverList(resortId);
  });

  const body = document.getElementById(`naverBody_${resortId}`);
  if (!body) return;

  // Firestore 캐시 확인
  const cache = await getNaverCache(resortId).catch(() => null);
  if (cache) {
    window._naverCache[resortId] = cache;
    renderNaverList(resortId);
  } else {
    body.innerHTML = `<div class="naver-empty">아직 가져온 후기가 없어요<br>
      <button class="nrv-fetch-btn" onclick="window._naverFetch('${resortId}')">후기 가져오기</button>
    </div>`;
  }
}

// ── window 핸들러 ──────────────────────────────────────────────────

window._naverFetch = async function(resortId) {
  const body = document.getElementById(`naverBody_${resortId}`);
  if (!body) return;
  body.innerHTML = '<div class="naver-loading">⏳ 네이버에서 후기를 가져오는 중...</div>';
  try {
    const sort = document.querySelector(`#naverBlock_${resortId} .nsort-btn.active`)?.dataset?.sort || 'sim';
    const data = await refreshNaverBlog(resortId, sort);
    window._naverCache[resortId] = data;
    renderNaverList(resortId);
    showToast('후기를 새로 가져왔어요 ✓');
  } catch (e) {
    body.innerHTML = `<div class="naver-error">후기를 불러오지 못했어요<br><small>${e.message}</small><br>
      <button class="nrv-fetch-btn" onclick="window._naverFetch('${resortId}')">다시 시도</button></div>`;
    showToast('후기 가져오기 실패', 'error');
  }
};

window._naverRefresh = async function(resortId) {
  if (!confirm('네이버 블로그 후기를 다시 검색할까요?\n(핀/숨김 상태는 유지됩니다)')) return;
  await window._naverFetch(resortId);
};

window._naverSetSort = function(resortId, sort, btn) {
  const block = document.getElementById(`naverBlock_${resortId}`);
  if (!block) return;
  block.querySelectorAll('.nsort-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // 캐시가 있고 저장된 sort와 다르면 자동 재요청
  const cache = window._naverCache[resortId];
  if (cache && cache.sort !== sort) {
    window._naverFetch(resortId);
  }
};

window._naverToggleAuthor = function(btn) {
  window._naverAuthor = window._naverAuthor === '성우' ? '소희' : '성우';
  btn.querySelector('.naver-author-label').textContent = window._naverAuthor;
  // 열려있는 모든 author label 갱신
  document.querySelectorAll('.naver-author-label').forEach(el => {
    el.textContent = window._naverAuthor;
  });
};

window._naverPin = async function(resortId, linkHash, isCurrentlyPinned) {
  if (isCurrentlyPinned) {
    await unpinReview(resortId, linkHash).catch(e => showToast('고정 해제 실패: ' + e.message, 'error'));
  } else {
    const cache = window._naverCache[resortId];
    const item  = (cache?.items || []).find(it => it.linkHash === linkHash)
                  || Object.values(window._naverPrefs[resortId]?.hidden || {}).find(it => it.linkHash === linkHash);
    if (!item) return;
    await pinReview(resortId, item, window._naverAuthor || '성우')
      .catch(e => showToast('고정 실패: ' + e.message, 'error'));
  }
};

window._naverUnpin = async function(resortId, linkHash) {
  await unpinReview(resortId, linkHash).catch(e => showToast('고정 해제 실패: ' + e.message, 'error'));
};

window._naverHide = async function(resortId, linkHash) {
  const cache = window._naverCache[resortId];
  const prefs = window._naverPrefs[resortId] || {};
  const item  = (cache?.items || []).find(it => it.linkHash === linkHash)
                || Object.values(prefs.pinned || {}).find(it => it.linkHash === linkHash);
  if (!item) return;
  await hideReview(resortId, item, window._naverAuthor || '성우', '관련 없음')
    .catch(e => showToast('숨김 실패: ' + e.message, 'error'));
};

window._naverUnhide = async function(resortId, linkHash) {
  await unhideReview(resortId, linkHash).catch(e => showToast('복구 실패: ' + e.message, 'error'));
};
