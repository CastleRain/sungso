// firebase-naver.js — 네이버 블로그 후기 캐시 + pin/hide 관리
// Naver API를 브라우저에서 직접 호출 (CORS proxy 경유)
// naver_blog_cache/{resortId}  — API 결과 (새로 가져오기 시 덮어씀)
// blog_review_prefs/{resortId} — pin/hide 상태 (절대 덮어쓰기 금지)
// naver_blog_meta/{resortId}   — 카드 배지용 count

import { initializeApp, getApps }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection,
  serverTimestamp, deleteField,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyBz-P5ycMAjYZBV7hkcZDrmq28EAw7Hsp8',
  authDomain:        'sungso-358cb.firebaseapp.com',
  projectId:         'sungso-358cb',
  storageBucket:     'sungso-358cb.firebasestorage.app',
  messagingSenderId: '143797950443',
  appId:             '1:143797950443:web:95b0f616246d84aae3bae',
};

const NAVER_CLIENT_ID     = 'SIUfSSP3KTI1ui7rzHSk';
const NAVER_CLIENT_SECRET = 'kPSbNhWM3y';

// CORS 프록시 — Naver API는 브라우저 직접 호출 불가 (CORS 미지원)
const CORS_PROXY = 'https://corsproxy.io/?url=';

const RESORT_QUERIES = {
  cora_cora:    '코라코라 몰디브 후기',
  ananea:       '아나네아 몰디브 후기',
  veligandu:    '벨리간두 몰디브 후기',
  dhigufaru:    '디구파루 몰디브 후기',
  furaveri:     '푸라베리 몰디브 후기',
  fushifaru:    '푸시파루 몰디브 후기',
  raaya:        '라야 바이 앳모스피어 후기',
  varu:         '바루 앳모스피어 몰디브 후기',
  saii_so:      '사이라군 SO몰디브 후기',
  emerald:      '에메랄드 파스멘두 몰디브 후기',
  oblu_sangeli: '오블루 상겔리 몰디브 후기',
  outrigger:    '아웃리거 마푸시바루 후기',
};

const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);

// djb2 hash → base36
export function makeLinkHash(url) {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(h, 33) ^ url.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

function stripHtml(s) {
  const div = document.createElement('div');
  div.innerHTML = s || '';
  return (div.textContent || div.innerText || '').trim();
}

// Naver Blog Search API 직접 호출 (CORS proxy 경유)
async function callNaverApi(query, sort) {
  const params = new URLSearchParams({ query, display: '8', start: '1', sort });
  const naverUrl = `https://openapi.naver.com/v1/search/blog?${params}`;
  const resp = await fetch(CORS_PROXY + encodeURIComponent(naverUrl), {
    headers: {
      'X-Naver-Client-Id':     NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
    },
  });
  if (!resp.ok) throw new Error(`Naver API 오류 (${resp.status})`);
  const data = await resp.json();
  return data.items || [];
}

// ── 캐시 읽기 ──────────────────────────────────────────────────────
export async function getNaverCache(resortId) {
  const snap = await getDoc(doc(db, 'naver_blog_cache', resortId));
  if (!snap.exists()) return null;
  return snap.data();
}

// ── Naver API 호출 → Firestore 캐시 저장 ──────────────────────────
export async function refreshNaverBlog(resortId, sort = 'sim') {
  const query = RESORT_QUERIES[resortId];
  if (!query) throw new Error('알 수 없는 resortId: ' + resortId);

  const rawItems = await callNaverApi(query, sort);

  const items = rawItems.map(item => ({
    linkHash:    makeLinkHash(item.link || ''),
    link:        item.link        || '',
    title:       stripHtml(item.title).slice(0, 100),
    bloggername: item.bloggername || '',
    bloggerlink: item.bloggerlink || '',
    postdate:    item.postdate    || '',
    description: stripHtml(item.description).slice(0, 120),
  }));

  await setDoc(doc(db, 'naver_blog_cache', resortId), {
    query, sort, items,
    fetchedAt: serverTimestamp(),
  });

  await setDoc(doc(db, 'naver_blog_meta', resortId), {
    count:     items.length,
    updatedAt: serverTimestamp(),
  });

  return { items, query, sort, fetchedAt: new Date() };
}

// ── prefs 실시간 구독 ──────────────────────────────────────────────
export function subscribeReviewPrefs(resortId, cb) {
  return onSnapshot(
    doc(db, 'blog_review_prefs', resortId),
    snap => cb(snap.exists() ? snap.data() : { pinned: {}, hidden: {} }),
    ()   => cb({ pinned: {}, hidden: {} }),
  );
}

// ── 핀 저장 ───────────────────────────────────────────────────────
export async function pinReview(resortId, item, pinnedBy = '성우') {
  const lh = item.linkHash;
  await setDoc(
    doc(db, 'blog_review_prefs', resortId),
    {
      [`pinned.${lh}`]: { ...item, pinnedBy, pinnedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

// ── 핀 해제 ───────────────────────────────────────────────────────
export async function unpinReview(resortId, linkHash) {
  await updateDoc(doc(db, 'blog_review_prefs', resortId), {
    [`pinned.${linkHash}`]: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

// ── 숨김 (pinned에서도 동시 제거) ──────────────────────────────────
export async function hideReview(resortId, item, hiddenBy = '소희', reason = '관련 없음') {
  const lh = item.linkHash;
  await setDoc(
    doc(db, 'blog_review_prefs', resortId),
    {
      [`hidden.${lh}`]: { ...item, hiddenBy, reason, hiddenAt: serverTimestamp() },
      [`pinned.${lh}`]: deleteField(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

// ── 숨김 복구 ─────────────────────────────────────────────────────
export async function unhideReview(resortId, linkHash) {
  await updateDoc(doc(db, 'blog_review_prefs', resortId), {
    [`hidden.${linkHash}`]: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

// ── naver_blog_meta 전체 구독 (카드 배지용) ────────────────────────
export function subscribeNaverMeta(cb) {
  return onSnapshot(
    collection(db, 'naver_blog_meta'),
    snap => {
      const meta = {};
      snap.forEach(d => { meta[d.id] = d.data(); });
      cb(meta);
    },
    () => cb({}),
  );
}
