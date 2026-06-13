// firebase-fx.js — USD/KRW 환율 조회 + Firestore 저장/구독

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBz-P5ycMAjYZBV7hkcZDrmq28EAw7Hsp8",
  authDomain: "sungso-358cb.firebaseapp.com",
  projectId: "sungso-358cb",
  storageBucket: "sungso-358cb.firebasestorage.app",
  messagingSenderId: "143797950443",
  appId: "1:143797950443:web:95b0f616246d84aae3bae"
};

const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);
const FX_DOC = doc(db, 'honeymoon_fx', 'usd_krw');

const FETCH_API = 'https://open.er-api.com/v6/latest/USD';
const STALE_MS  = 60 * 60 * 1000; // 1시간

// 환율 실시간 구독 (callback: { rate, fetchedAt })
export function subscribeFx(cb) {
  return onSnapshot(FX_DOC, snap => {
    if (snap.exists()) cb(snap.data());
  });
}

// 인터넷에서 최신 환율 가져와 Firestore에 저장
export async function fetchAndSaveFx() {
  const res  = await fetch(FETCH_API);
  const data = await res.json();
  if (data.result !== 'success') throw new Error('환율 API 오류');
  const rate = Math.round(data.rates.KRW);
  await setDoc(FX_DOC, { rate, fetchedAt: serverTimestamp() });
  return rate;
}

// 1시간 이상 지났으면 자동 갱신
export async function autoRefreshFx() {
  try {
    const snap = await getDoc(FX_DOC);
    if (snap.exists()) {
      const { fetchedAt } = snap.data();
      const ts = fetchedAt?.toMillis?.() ?? 0;
      if (Date.now() - ts < STALE_MS) return; // 아직 신선함
    }
    await fetchAndSaveFx();
  } catch (e) {
    console.warn('[FX] 자동 갱신 실패:', e);
  }
}
