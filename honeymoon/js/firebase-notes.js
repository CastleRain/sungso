// firebase-notes.js — 리조트 댓글 메모 + 이미지 관리 CRUD (Firestore)
// 댓글: resort_notes/{resortId}/comments/{commentId}
// 이미지: resort_images/{resortId}  { urls: string[] }

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, addDoc, deleteDoc, doc,
         onSnapshot, query, orderBy, serverTimestamp,
         getDoc, setDoc }
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
const db = getFirestore(app);

// 실시간 댓글 구독 — 반환값은 unsubscribe 함수
// callback: ({ id, author, text, createdAt }[]) => void
export function subscribeComments(resortId, callback) {
  const ref = collection(db, 'resort_notes', resortId, 'comments');
  const q = query(ref, orderBy('createdAt', 'asc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, () => callback([]));
}

export async function addComment(resortId, author, text) {
  const ref = collection(db, 'resort_notes', resortId, 'comments');
  await addDoc(ref, { author, text, createdAt: serverTimestamp() });
}

export async function deleteComment(resortId, commentId) {
  await deleteDoc(doc(db, 'resort_notes', resortId, 'comments', commentId));
}

// 이미지 관리 — resort_images/{resortId} { urls: string[] }
export async function getCustomImages(resortId) {
  try {
    const snap = await getDoc(doc(db, 'resort_images', resortId));
    return snap.exists() ? (snap.data().urls ?? null) : null;
  } catch { return null; }
}

export async function saveCustomImages(resortId, urls) {
  await setDoc(doc(db, 'resort_images', resortId), { urls });
}
