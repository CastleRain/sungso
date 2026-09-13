import { getMember, syncAppAuth, registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { FIREBASE_CONFIG } from '../../../shared/firebase/config.mjs';
import { createMemberWork } from '../../../shared/firebase/member-work.mjs';
// firebase-fx.js — USD/KRW 환율 조회 + Firestore 저장/구독

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const app = getApps().find(item => item.name === '[DEFAULT]') || initializeApp(FIREBASE_CONFIG);
await syncAppAuth(app);
const db  = getFirestore(app);
const memberWork = createMemberWork({ getMember, registerPrivateCleanup });
const FX_DOC = doc(db, 'honeymoon_fx', 'usd_krw');

const FETCH_API = 'https://open.er-api.com/v6/latest/USD';
const STALE_MS  = 60 * 60 * 1000; // 1시간

// 환율 실시간 구독 (callback: { rate, fetchedAt })
export function subscribeFx(cb) {
  return memberWork.observe(onSnapshot, FX_DOC, snap => {
    if (snap.exists()) cb(snap.data());
  });
}

// 인터넷에서 최신 환율 가져와 Firestore에 저장
export async function fetchAndSaveFx() {
  const request = memberWork.capture();
  const res  = await fetch(FETCH_API);
  request.assert();
  const data = await res.json();
  request.assert();
  if (data.result !== 'success') throw new Error('환율 API 오류');
  const rate = Math.round(data.rates.KRW);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('환율 응답을 확인해주세요.');
  await setDoc(FX_DOC, { rate, fetchedAt: serverTimestamp() });
  request.assert();
  return rate;
}

// 1시간 이상 지났으면 자동 갱신
export async function autoRefreshFx() {
  const request = memberWork.capture();
  try {
    const snap = await getDoc(FX_DOC);
    request.assert();
    if (snap.exists()) {
      const { fetchedAt } = snap.data();
      const ts = fetchedAt?.toMillis?.() ?? 0;
      if (Date.now() - ts < STALE_MS) return; // 아직 신선함
    }
    await fetchAndSaveFx();
  } catch (e) {
    if (!request.current()) return;
    console.warn('[FX] 자동 갱신 실패:', e);
  }
}
