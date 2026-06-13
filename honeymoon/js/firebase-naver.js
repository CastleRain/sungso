// firebase-naver.js — 네이버 블로그 후기 캐시 + pin/hide 관리
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

const FUNCTION_URL = 'https://us-central1-sungso-358cb.cloudfunctions.net/naverBlogSearch';

const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);

// djb2 hash → base36 (Cloud Function과 동일)
export function makeLinkHash(url) {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(h, 33) ^ url.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

// ── 캐시 읽기 ──────────────────────────────────────────────────────
export async function getNaverCache(resortId) {
  const snap = await getDoc(doc(db, 'naver_blog_cache', resortId));
  if (!snap.exists()) return null;
  return snap.data();   // { query, sort, items[], fetchedAt }
}

// ── Cloud Function 호출 → Firestore 캐시 자동 갱신 ─────────────────
export async function refreshNaverBlog(resortId, sort = 'sim') {
  const url = `${FUNCTION_URL}?resortId=${encodeURIComponent(resortId)}&sort=${sort}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || '후기 가져오기 실패');
  }
  const data = await resp.json();
  // fetchedAt을 JS Date로 정규화 (Function이 저장하지만 응답에는 없음)
  return {
    items:     data.items || [],
    query:     data.query,
    sort:      data.sort,
    fetchedAt: new Date(),
  };
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
      [`pinned.${lh}`]: deleteField(),  // 핀이었으면 동시에 제거
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
