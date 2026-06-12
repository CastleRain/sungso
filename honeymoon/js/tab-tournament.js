// tab-tournament.js — 1vs1 토너먼트 (9개 리조트 → 우승 리조트)

import { RESORTS, getBestPrice, getFeaturedImage } from './resorts-data.js';

const STORAGE_KEY = 'maldives-tournament-state';
const WEIGHTS_KEY = 'maldives-tournament-weights';

const RATING_KEYS = ['lagoon', 'underwater', 'privacy', 'dining'];
const RATING_LABELS = { lagoon: '라군뷰', underwater: '수중환경', privacy: '프라이빗', dining: '다이닝' };

let state = null;  // { phase, bracket, currentMatch, winners, weights, champion }

// ── 가중치 계산 점수 ────────────────────────────────────────────────
function weightedScore(resort, weights) {
  return RATING_KEYS.reduce((sum, key) => {
    return sum + (resort.ratings[key] || 0) * (weights[key] || 1);
  }, 0);
}

// ── 상태 저장/복원 ──────────────────────────────────────────────────
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}

function loadState() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : null;
  } catch (_) { return null; }
}

function loadWeights() {
  try {
    const w = localStorage.getItem(WEIGHTS_KEY);
    return w ? JSON.parse(w) : { lagoon: 1, underwater: 1, privacy: 1, dining: 1, price: 1 };
  } catch (_) { return { lagoon: 1, underwater: 1, privacy: 1, dining: 1, price: 1 }; }
}

// ── 라운드 관리 ─────────────────────────────────────────────────────
function buildBracket(resorts) {
  const shuffled = [...resorts].sort(() => Math.random() - 0.5);
  const matches = [];
  for (let i = 0; i < shuffled.length - 1; i += 2) {
    matches.push([shuffled[i].id, shuffled[i + 1].id]);
  }
  // 홀수면 마지막 1개 자동 패스
  const byes = shuffled.length % 2 === 1 ? [shuffled[shuffled.length - 1].id] : [];
  return { matches, byes };
}

function getResortById(id) {
  return RESORTS.find(r => r.id === id);
}

// ── 렌더링 ──────────────────────────────────────────────────────────
function renderSetup() {
  const wrap = document.getElementById('tournamentWrap');
  const weights = loadWeights();

  const sliders = RATING_KEYS.concat(['price']).map(key => {
    const label = RATING_LABELS[key] || '예산';
    return `
<div class="weight-row">
  <label class="weight-label">${label}</label>
  <input type="range" class="weight-slider" data-key="${key}" min="0" max="3" step="1" value="${weights[key] ?? 1}">
  <span class="weight-val" id="wval_${key}">${weights[key] ?? 1}</span>
</div>`;
  }).join('');

  wrap.innerHTML = `
<div class="tournament-setup">
  <div class="tournament-title">🏆 리조트 토너먼트</div>
  <p class="tournament-desc">12개 리조트를 1:1 대결로 비교해 최종 추천 리조트를 찾습니다.<br>먼저 어떤 요소를 중요하게 생각하는지 설정해주세요.</p>

  <div class="weights-panel">
    <div class="weights-title">⚖️ 선호도 가중치 설정</div>
    <div class="weights-help">0 = 안 중요 · 1 = 보통 · 2 = 중요 · 3 = 매우 중요</div>
    ${sliders}
  </div>

  <div class="tournament-actions">
    <button class="tournament-start-btn" id="tournamentStartBtn">🏁 토너먼트 시작!</button>
    ${loadState() ? '<button class="tournament-resume-btn" id="tournamentResumeBtn">⏩ 이어서 하기</button>' : ''}
  </div>
</div>`;

  // 슬라이더 이벤트
  wrap.querySelectorAll('.weight-slider').forEach(slider => {
    slider.addEventListener('input', () => {
      document.getElementById(`wval_${slider.dataset.key}`).textContent = slider.value;
      weights[slider.dataset.key] = parseInt(slider.value);
      try { localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights)); } catch (_) {}
    });
  });

  document.getElementById('tournamentStartBtn').addEventListener('click', startTournament);
  document.getElementById('tournamentResumeBtn')?.addEventListener('click', resumeTournament);
}

function startTournament() {
  const weights = loadWeights();
  const { matches, byes } = buildBracket(RESORTS);
  state = {
    phase: 'match',
    rounds: [matches],
    roundIndex: 0,
    matchIndex: 0,
    roundByes: [byes],
    winners: [byes],  // byes are automatic winners
    weights,
    champion: null,
  };
  saveState();
  renderMatch();
}

function resumeTournament() {
  state = loadState();
  if (!state) { startTournament(); return; }
  if (state.phase === 'result') renderResult();
  else renderMatch();
}

function currentMatchPair() {
  const round = state.rounds[state.roundIndex];
  return round[state.matchIndex];
}

function getRoundLabel() {
  const labels = ['1라운드', '2라운드', '준결승', '결승'];
  return labels[state.roundIndex] ?? `${state.roundIndex + 1}라운드`;
}

function renderMatch() {
  const wrap = document.getElementById('tournamentWrap');
  const [idA, idB] = currentMatchPair();
  const ra = getResortById(idA);
  const rb = getResortById(idB);
  const round = state.rounds[state.roundIndex];
  const totalMatches = round.length;
  const doneMatches = state.matchIndex;
  const priceKey = 'water_pool_4n';

  wrap.innerHTML = `
<div class="tournament-match active">
  <div class="tournament-progress">
    <span class="round-label">${getRoundLabel()}</span>
    <span class="match-count">${doneMatches + 1} / ${totalMatches} 매치</span>
    <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${Math.round(doneMatches / totalMatches * 100)}%"></div></div>
  </div>

  <div class="match-arena">
    ${renderMatchCard(ra, 'A')}
    <div class="vs-badge">VS</div>
    ${renderMatchCard(rb, 'B')}
  </div>

  <div class="tournament-footer-actions">
    <button class="skip-match-btn" id="skipMatchBtn">⏭ 건너뛰기 (랜덤 선택)</button>
    <button class="reset-tournament-btn" id="resetBtn">↩ 처음부터</button>
  </div>
</div>`;

  document.querySelectorAll('.match-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => pickWinner(btn.dataset.id));
  });
  document.getElementById('skipMatchBtn').addEventListener('click', () => {
    const pick = Math.random() < 0.5 ? idA : idB;
    pickWinner(pick);
  });
  document.getElementById('resetBtn').addEventListener('click', () => {
    state = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    renderSetup();
  });
}

function renderMatchCard(resort, side) {
  const priceKey = 'water_pool_4n';
  const price = getBestPrice(resort, priceKey);
  const heroImg = getFeaturedImage(resort);
  const imgHtml = heroImg
    ? `<img src="${heroImg}" alt="${resort.name_ko}" loading="lazy" onerror="this.style.display='none';">`
    : `<div class="match-card-placeholder">🏝️</div>`;
  const ratingHtml = ['lagoon','underwater','privacy','dining'].map(key => {
    const w = (state.weights[key] || 0);
    return `<div class="match-rating ${w >= 2 ? 'highlighted' : ''}">
      <span>${RATING_LABELS[key]}</span>
      <span style="color:#f59e0b">${'★'.repeat(resort.ratings[key])}${'☆'.repeat(5 - resort.ratings[key])}</span>
    </div>`;
  }).join('');

  return `
<div class="match-resort-card" data-side="${side}">
  <div class="match-card-image">${imgHtml}</div>
  <div class="match-card-body">
    <div class="match-resort-name">${resort.name_ko}</div>
    <div class="match-resort-sub">${resort.atoll} · ${resort.transfer_type === 'seaplane' ? '✈️' : '🚤'} ${resort.transfer_minutes}분</div>
    <div class="match-ratings">${ratingHtml}</div>
    ${price ? `<div class="match-price">워터풀 최저 <strong>$${price.toLocaleString()}</strong>/인</div>` : ''}
    ${resort.has_hammock ? '<div class="match-hammock">🛏️ 해먹 있음</div>' : ''}
  </div>
  <button class="match-pick-btn" data-id="${resort.id}">💗 선택!</button>
</div>`;
}

function pickWinner(winnerId) {
  const loserId = currentMatchPair().find(id => id !== winnerId);

  state.winners[state.roundIndex] = state.winners[state.roundIndex] || [];
  state.winners[state.roundIndex].push(winnerId);
  state.matchIndex++;

  const round = state.rounds[state.roundIndex];

  if (state.matchIndex >= round.length) {
    // 라운드 끝
    const allWinners = state.winners[state.roundIndex];
    if (allWinners.length === 1) {
      // 우승!
      state.champion = allWinners[0];
      state.phase = 'result';
      saveState();
      renderResult();
      return;
    }

    // 다음 라운드 구성
    const { matches, byes } = buildBracket(allWinners.map(id => getResortById(id)));
    state.roundIndex++;
    state.rounds[state.roundIndex] = matches;
    state.roundByes[state.roundIndex] = byes;
    state.winners[state.roundIndex] = byes.map(r => r);  // byes pass through
    state.matchIndex = 0;
  }

  saveState();
  renderMatch();
}

function renderResult() {
  const wrap = document.getElementById('tournamentWrap');
  const champion = getResortById(state.champion);
  if (!champion) { renderSetup(); return; }

  const champImg = getFeaturedImage(champion);
  const imgHtml = champImg
    ? `<img src="${champImg}" alt="${champion.name_ko}" style="width:100%;max-height:240px;object-fit:cover;border-radius:12px;">`
    : `<div style="height:160px;display:flex;align-items:center;justify-content:center;font-size:64px;">🏝️</div>`;

  const agencyNames = { realmaldives: '리얼몰디브', honeymoonresort: '허니문리조트', tourmin: '투어민' };
  const priceRows = ['water_pool_4n','mix_4n','water_4n','beach_4n'].map(key => {
    const labels = { water_pool_4n: '워터풀 4박', mix_4n: '믹스 4박', water_4n: '워터 4박', beach_4n: '비치 4박' };
    const prices = Object.entries(champion.agencies).map(([id, ag]) => {
      const disc = ag[key + '_disc'];
      const base = ag[key];
      if (base == null) return null;
      const val = disc ?? base;
      return `${agencyNames[id]}: $${val.toLocaleString()}`;
    }).filter(Boolean);
    if (!prices.length) return '';
    return `<div class="result-price-row"><span>${labels[key]}</span><span>${prices.join(' · ')}</span></div>`;
  }).filter(Boolean).join('');

  wrap.innerHTML = `
<div class="tournament-result active">
  <div class="result-crown">🏆</div>
  <div class="result-title">토너먼트 결과</div>
  <div class="result-subtitle">두 분의 최종 선택 리조트</div>

  <div class="result-champion">
    ${imgHtml}
    <div class="result-name">${champion.name_ko}</div>
    <div class="result-name-en">${champion.name_en}</div>
    <div class="result-atoll">📍 ${champion.atoll} · ${champion.transfer_type === 'seaplane' ? '✈️' : '🚤'} ${champion.transfer_minutes}분</div>
    <div class="result-prices">${priceRows}</div>
    <div class="result-desc">${champion.description}</div>
  </div>

  <div class="result-actions">
    <button class="result-detail-btn" onclick="window._tournamentDetailClick?.('${champion.id}')">📋 상세 정보 보기</button>
    <button class="result-restart-btn" id="restartBtn">🔄 다시 시작</button>
  </div>
</div>`;

  window._tournamentDetailClick = (id) => {
    // app.js의 openDetail 함수 연결 필요 — 이벤트로 전달
    window.dispatchEvent(new CustomEvent('open-detail', { detail: { id } }));
  };

  document.getElementById('restartBtn').addEventListener('click', () => {
    state = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    renderSetup();
  });
}

export function initTournament(detailOpenFn) {
  const saved = loadState();
  if (saved && saved.phase === 'match') {
    state = saved;
    // 저장된 상태로 재개할지 묻기
    renderSetup();  // setup 화면에서 "이어서 하기" 버튼으로 선택
  } else if (saved && saved.phase === 'result') {
    state = saved;
    renderResult();
  } else {
    renderSetup();
  }
}
