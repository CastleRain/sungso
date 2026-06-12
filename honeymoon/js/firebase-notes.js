// firebase-notes.js — 리조트 댓글 메모 + 이미지 관리 CRUD (Firestore)
// 댓글: resort_notes/{resortId}/comments/{commentId}
// 이미지: resort_images/{resortId}  { urls: string[] }
// 메타: resort_note_meta/{resortId}  { commentCount, lastComment, lastAuthor, lastUpdatedAt, resortName }

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, addDoc, deleteDoc, doc,
         onSnapshot, query, orderBy, serverTimestamp,
         getDoc, setDoc, updateDoc, increment }
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
export function subscribeComments(resortId, callback) {
  const ref = collection(db, 'resort_notes', resortId, 'comments');
  const q = query(ref, orderBy('createdAt', 'asc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, () => callback([]));
}

// resortName 파라미터 추가 — 신규 댓글에 resortId/resortName 저장 + 메타 갱신
export async function addComment(resortId, resortName, author, text) {
  const ref = collection(db, 'resort_notes', resortId, 'comments');
  await addDoc(ref, { resortId, resortName, author, text, createdAt: serverTimestamp() });

  const metaRef = doc(db, 'resort_note_meta', resortId);
  await setDoc(metaRef, {
    commentCount: increment(1),
    lastComment: text,
    lastAuthor: author,
    lastUpdatedAt: serverTimestamp(),
    resortName,
  }, { merge: true });
}

export async function deleteComment(resortId, commentId) {
  await deleteDoc(doc(db, 'resort_notes', resortId, 'comments', commentId));
  try {
    await updateDoc(doc(db, 'resort_note_meta', resortId), { commentCount: increment(-1) });
  } catch (_) {}
}

// resort_note_meta 전체 구독 — cb({ resortId: { commentCount, lastComment, lastAuthor, lastUpdatedAt, resortName } })
export function subscribeAllMetaCounts(cb) {
  const ref = collection(db, 'resort_note_meta');
  return onSnapshot(ref, snap => {
    const meta = {};
    snap.forEach(d => { meta[d.id] = d.data(); });
    cb(meta);
  }, () => cb({}));
}

// 이미지 관리
export async function getCustomImages(resortId) {
  try {
    const snap = await getDoc(doc(db, 'resort_images', resortId));
    return snap.exists() ? (snap.data().urls ?? null) : null;
  } catch { return null; }
}

export async function saveCustomImages(resortId, urls) {
  await setDoc(doc(db, 'resort_images', resortId), { urls });
}
