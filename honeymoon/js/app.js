// app.js — 탭 라우터 + 공유 상태 + D-Day

import { initCards } from './tab-cards.js';
import { initPrice } from './tab-price.js';
import { initMap } from './tab-map.js';
import { initTournament } from './tab-tournament.js';
import { initPdf } from './tab-pdf.js';
import { RESORTS, getBestPrice, getFeaturedImage } from './resorts-data.js';
import { subscribeComments, addComment, deleteComment } from './firebase-notes.js';

// ── D-Day 계산 ─────────────────────────────────────────────────────
function updateDDay() {
  const target = new Date('2027-03-08');
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

  if (!tabInited.has(tabId)) {
    tabInited.add(tabId);
    if (tabId === 'price') initPrice();
    if (tabId === 'map') {
      initMap(openDetailInMap);
      initResizeHandle(
        document.getElementById('mapResizeHandle'),
        document.querySelector('.map-tab-left'),
        'map-left-w', 180, 520
      );
    }
    if (tabId === 'tournament') initTournament();
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
function openDetailInCards(resortId) {
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
  document.querySelectorAll('.resort-card').forEach(c => c.classList.remove('selected'));
  document.querySelector(`.resort-card[data-id="${resortId}"]`)?.classList.add('selected');
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

// ── 지도 탭 오른쪽 패널에 상세 렌더 ──────────────────────────────
function openDetailInMap(resortId) {
  const resort = RESORTS.find(r => r.id === resortId);
  if (!resort) return;
  const panel = document.getElementById('mapInfoPanel');
  if (panel) {
    panel.innerHTML = renderResortDetail(resort);
    panel.scrollTop = 0;
  }
}

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

function renderImageGallery(r) {
  const hero = getFeaturedImage(r);
  if (hero || (r.image_urls && r.image_urls.length)) {
    const galleryUrls = r.image_urls && r.image_urls.length ? r.image_urls : [hero];
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

window._galleryThumb = function(el, resortId) {
  const url = decodeURIComponent(el.dataset.url || '');
  const main = document.getElementById(`galleryMainImg_${resortId}`);
  if (main && url) main.src = url;
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
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1D9E75;color:white;padding:9px 18px;border-radius:10px;font-size:12px;z-index:9999;box-shadow:0 3px 12px rgba(0,0,0,0.2);';
  toast.textContent = '✓ 대표 이미지로 설정됨';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
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

function renderResortDetail(r) {
  const agencies = r.agencies;
  const agencyIds = Object.keys(agencies);
  const agencyNames = { realmaldives: '리얼몰디브', honeymoonresort: '허니문리조트', tourmin: '투어민' };
  const agencyClass = { realmaldives: 'real', honeymoonresort: 'honey', tourmin: 'tour' };

  const priceCardsHtml = agencyIds.map(agId => {
    const ag = agencies[agId];
    const rows = [];
    const key_labels = [
      ['water_pool_4n', '🏊 워터풀빌라 4박'],
      ['water_4n', '🌊 워터빌라 4박'],
      ['mix_4n', '🔀 비치+워터 믹스 4박'],
      ['beach_4n', '🏖️ 비치빌라 4박'],
    ];
    for (const [key, label] of key_labels) {
      if (ag[key] == null) continue;
      const disc = ag[key + '_disc'];
      const base = ag[key];
      const val = disc != null
        ? `<span class="price-original">$${base.toLocaleString()}</span> <span class="price-discount">→ $${disc.toLocaleString()}</span>`
        : `<span>$${base.toLocaleString()}</span>`;
      rows.push(`<tr><td>${label}</td><td class="price-main">${val}</td></tr>`);
    }
    const promoHtml = ag.promotions?.length
      ? ag.promotions.map(p => `<div class="promo-badge">🎯 ${p}</div>`).join('')
      : '';
    const priceNoteHtml = ag.price_note
      ? `<div class="promo-badge" style="background:#FFF8E1;border-color:#FBC02D;color:#6D4C00;">📅 ${ag.price_note}</div>`
      : '';
    return `
<div class="price-card">
  <div class="price-card-header ${agencyClass[agId]}">
    <span class="price-agency ${agencyClass[agId]}">${agencyNames[agId]}</span>
    <span class="price-plan">${ag.meal_plan_name || ag.meal_plan}</span>
  </div>
  <table class="price-table">${rows.join('')}</table>
  ${promoHtml}
  ${priceNoteHtml}
  <div class="cancellation-note">📋 취소: ${ag.cancellation || '미확인'}</div>
</div>`;
  }).join('');

  const hmAg = agencies[agencyIds[0]];
  const hmTierClass = r.honeymoon_tier === '최상' ? 'good' : r.honeymoon_tier === '중간' ? 'ok' : 'weak';

  const pdfLinksHtml = r.pdfs.length
    ? r.pdfs.map(p => `<button class="card-detail-btn" onclick="openPdfFromDetail('${p.file}', '${p.label}')" style="margin:4px 6px 4px 0;">📄 ${p.label}</button>`).join('')
    : '<span style="color:var(--text-light);font-size:12px;">관련 PDF 없음</span>';

  return `
<section class="resort-section">
  <!-- 헤더 -->
  <div class="resort-header">
    <div class="resort-header-left">
      <div class="resort-num">${String(r.num).padStart(2,'0')} / 12</div>
      <div class="resort-name">${r.name_ko}</div>
      <div class="resort-name-en">${r.name_en}</div>
      <div class="resort-meta">
        <span class="meta-pill pill-blue">📍 ${r.atoll}</span>
        <span class="meta-pill pill-teal">${r.transfer_type === 'seaplane' ? '✈️' : '🚤'} ${r.transfer_minutes}분</span>
        ${r.villas ? `<span class="meta-pill pill-gray">🏠 ${r.villas}빌라</span>` : ''}
        <span class="meta-pill pill-gray">📅 ${r.opened}년 오픈</span>
        ${agencyIds.map(id => `<span class="meta-pill pill-${id === 'realmaldives' ? 'coral' : 'blue'}">${agencyNames[id]}</span>`).join('')}
      </div>
      <div class="resort-tags">${(r.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}</div>
    </div>
    <button class="memo-trigger-btn" onclick="window._openMemo('${r.id}')">💬 메모</button>
  </div>

  <!-- 이미지 갤러리 -->
  ${renderImageGallery(r)}

  <!-- 기본 정보 -->
  <div class="block">
    <div class="block-header">📋 기본 정보 & 특징</div>
    <div class="block-body">
      <p class="resort-desc">${r.description}</p>
      <div class="pros-cons">
        <div class="pros">
          <div class="pros-title">✅ 장점</div>
          <ul>${r.pros.map(p => `<li>${p}</li>`).join('')}</ul>
        </div>
        <div class="cons">
          <div class="cons-title">⚠️ 단점</div>
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

  <!-- 가격 -->
  <div class="block">
    <div class="block-header">💰 가격 비교 (1인 기준 USD · 4박)</div>
    <div class="block-body">
      <div class="price-compare ${agencyIds.length > 1 ? 'two-col' : 'one-col'}">
        ${priceCardsHtml}
      </div>
    </div>
  </div>

  <!-- 허니문 특전 -->
  <div class="block">
    <div class="block-header">💍 허니문 특전</div>
    <div class="block-body honeymoon-block">
      <ul class="hm-list">
        ${(hmAg.honeymoon_benefits || []).map(b => `<li><span class="hm-icon">💗</span>${b}</li>`).join('')}
      </ul>
      <div class="hm-comment ${hmTierClass}">💬 ${hmAg.honeymoon_comment || ''}</div>
    </div>
  </div>

  <!-- 유튜브 영상 -->
  <div class="block">
    <div class="block-header">📹 영상 후기</div>
    <div class="block-body">${renderYoutubeSection(r)}</div>
  </div>

  <!-- PDF -->
  <div class="block">
    <div class="block-header">📄 관련 PDF 견적서</div>
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

  // 카드 리사이즈 핸들
  initResizeHandle(
    document.getElementById('cardsResizeHandle'),
    document.querySelector('.cards-left-col'),
    'cards-left-w', 240, 700
  );

  // 왼쪽 그리드 빈 공간 클릭 → 목록으로
  document.getElementById('cardsGrid')?.addEventListener('click', e => {
    if (!document.getElementById('tab-cards').classList.contains('detail-open')) return;
    if (e.target.closest('.resort-card')) return;
    window.closeCardDetail();
  });

  tabInited.add('cards');
  initCards(openDetailInCards);

  window.addEventListener('open-detail', (e) => openDetail(e.detail.id));
});
