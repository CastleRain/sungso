// firebase-notes.js — 리조트 메모 CRUD (Firestore 'resort_notes' 컬렉션)

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp }
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

export async function loadNote(resortId) {
  try {
    const snap = await getDoc(doc(db, 'resort_notes', resortId));
    return snap.exists() ? (snap.data().note || '') : '';
  } catch (_) { return ''; }
}

export async function saveNote(resortId, text) {
  await setDoc(doc(db, 'resort_notes', resortId), {
    note: text,
    updatedAt: serverTimestamp()
  }, { merge: true });
}
