import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { requireMember, getMember, syncAppAuth, registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { FIREBASE_CONFIG } from '../../../shared/firebase/config.mjs';
import { createMemberWork } from '../../../shared/firebase/member-work.mjs';
// firebase-naver.js — 네이버 블로그 후기 캐시 + pin/hide 관리
// Provider credentials stay on the authenticated Render API.
// naver_blog_cache/{resortId}  — API 결과 (새로 가져오기 시 덮어씀)
// blog_review_prefs/{resortId} — pin/hide 상태 (절대 덮어쓰기 금지)
// naver_blog_meta/{resortId}   — 카드 배지용 count

import { initializeApp, getApps }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection,
  serverTimestamp, deleteField,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';




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

const app = getApps().find(item => item.name === '[DEFAULT]') || initializeApp(FIREBASE_CONFIG);
await requireMember();
await syncAppAuth(app);
const db = getFirestore(app);
const memberWork = createMemberWork({ getMember, registerPrivateCleanup });
const observe = (...args) => memberWork.observe(onSnapshot, ...args);

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

// User-triggered member request; no public CORS relay or browser secret.
async function callNaverApi(query, sort, resortId) {
  const request = memberWork.capture();
  await syncAppAuth(app);
  request.assert();
  const token = await getAuth(app).currentUser.getIdToken();
  request.assert();
  const params = new URLSearchParams({ query, sort, resortId });
  const response = await fetch(`https://sungso-homehunt-api.onrender.com/api/blog-search?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`후기 검색 연결을 확인해주세요. (${response.status})`);
  const data = await response.json();
  request.assert();
  return Array.isArray(data.items) ? data.items : [];
}

// ── 캐시 읽기 ──────────────────────────────────────────────────────
export async function getNaverCache(resortId) {
  const request = memberWork.capture();
  const snap = await getDoc(doc(db, 'naver_blog_cache', resortId));
  request.assert();
  if (!snap.exists()) return null;
  return snap.data();
}

// ── Naver API 호출 → Firestore 캐시 저장 ──────────────────────────
export async function refreshNaverBlog(resortId, sort = 'sim') {
  await requireMember();
  const query = RESORT_QUERIES[resortId];
  if (!query) throw new Error('알 수 없는 resortId: ' + resortId);

  const rawItems = await callNaverApi(query, sort, resortId);

  const items = rawItems.map(item => ({
    linkHash:    makeLinkHash(item.link || ''),
    link:        item.link        || '',
    title:       stripHtml(item.title).slice(0, 100),
    bloggername: item.bloggername || '',
    bloggerlink: item.bloggerlink || '',
    postdate:    item.postdate    || '',
    description: stripHtml(item.description).slice(0, 120),
  }));

  return { items, query, sort, fetchedAt: new Date() };
}

// ── prefs 실시간 구독 ──────────────────────────────────────────────
export function subscribeReviewPrefs(resortId, cb) {
  return observe(
    doc(db, 'blog_review_prefs', resortId),
    snap => cb(snap.exists() ? snap.data() : { pinned: {}, hidden: {} }),
    ()   => cb({ pinned: {}, hidden: {} }),
  );
}

// ── 핀 저장 ───────────────────────────────────────────────────────
// setDoc+merge:true 는 dot notation을 리터럴 필드명으로 처리하므로
// updateDoc(dot notation)을 사용. 문서 없으면 setDoc으로 생성.
export async function pinReview(resortId, item, pinnedBy) {
  const request = memberWork.capture();
  pinnedBy = request.member.name;
  const lh  = item.linkHash;
  const ref = doc(db, 'blog_review_prefs', resortId);
  const snap = await getDoc(ref);
  request.assert();
  if (snap.exists()) {
    await updateDoc(ref, {
      [`pinned.${lh}`]: { ...item, pinnedBy, pinnedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      pinned: { [lh]: { ...item, pinnedBy, pinnedAt: serverTimestamp() } },
      hidden: {},
      updatedAt: serverTimestamp(),
    });
  }
  request.assert();
}

// ── 핀 해제 ───────────────────────────────────────────────────────
export async function unpinReview(resortId, linkHash) {
  const request = memberWork.capture();
  await updateDoc(doc(db, 'blog_review_prefs', resortId), {
    [`pinned.${linkHash}`]: deleteField(),
    updatedAt: serverTimestamp(),
  });
  request.assert();
}

// ── 숨김 (pinned에서도 동시 제거) ──────────────────────────────────
export async function hideReview(resortId, item, hiddenBy, reason = '관련 없음') {
  const request = memberWork.capture();
  hiddenBy = request.member.name;
  const lh  = item.linkHash;
  const ref = doc(db, 'blog_review_prefs', resortId);
  const snap = await getDoc(ref);
  request.assert();
  if (snap.exists()) {
    await updateDoc(ref, {
      [`hidden.${lh}`]: { ...item, hiddenBy, reason, hiddenAt: serverTimestamp() },
      [`pinned.${lh}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      pinned: {},
      hidden: { [lh]: { ...item, hiddenBy, reason, hiddenAt: serverTimestamp() } },
      updatedAt: serverTimestamp(),
    });
  }
  request.assert();
}

// ── 숨김 복구 ─────────────────────────────────────────────────────
export async function unhideReview(resortId, linkHash) {
  const request = memberWork.capture();
  await updateDoc(doc(db, 'blog_review_prefs', resortId), {
    [`hidden.${linkHash}`]: deleteField(),
    updatedAt: serverTimestamp(),
  });
  request.assert();
}

// ── naver_blog_meta 전체 구독 (카드 배지용) ────────────────────────
export function subscribeNaverMeta(cb) {
  return observe(
    collection(db, 'naver_blog_meta'),
    snap => {
      const meta = {};
      snap.forEach(d => { meta[d.id] = d.data(); });
      cb(meta);
    },
    () => cb({}),
  );
}
