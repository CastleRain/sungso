// firebase-picks.js — couplePicks + itinerary CRUD (Firestore)
// couplePicks/main : { sohee: string[], sungwoo: string[], finalCandidates: string[], updatedAt }
// itineraries/main : { days: [...], updatedAt }

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, onSnapshot, setDoc, getDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBz-P5ycMAjYZBV7hkcZDrmq28EAw7Hsp8",
  authDomain:        "sungso-358cb.firebaseapp.com",
  projectId:         "sungso-358cb",
  storageBucket:     "sungso-358cb.firebasestorage.app",
  messagingSenderId: "143797950443",
  appId:             "1:143797950443:web:95b0f616246d84aae3bae"
};

const TRIP_ID = 'main';
const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);

function picksRef()     { return doc(db, 'couplePicks', TRIP_ID); }
function itineraryRef() { return doc(db, 'itineraries', TRIP_ID); }

function normalizePicks(data) {
  const norm = arr => {
    const a = Array.isArray(arr) ? [...arr] : [];
    while (a.length < 3) a.push(null);
    return a.slice(0, 3);
  };
  return {
    sohee:           norm(data?.sohee),
    sungwoo:         norm(data?.sungwoo),
    finalCandidates: Array.isArray(data?.finalCandidates) ? data.finalCandidates : [],
  };
}

export function subscribePicks(cb) {
  return onSnapshot(picksRef(),
    snap => cb(normalizePicks(snap.exists() ? snap.data() : {})),
    ()   => cb(normalizePicks({}))
  );
}

export function subscribeItinerary(cb) {
  return onSnapshot(itineraryRef(),
    snap => cb(snap.exists() ? (snap.data().days || []) : []),
    ()   => cb([])
  );
}

export async function setPick(person, rank, resortId) {
  const snap = await getDoc(picksRef());
  const data = snap.exists() ? snap.data() : {};
  const arr  = Array.isArray(data[person]) ? [...data[person]] : [];
  while (arr.length < 3) arr.push(null);
  arr[rank] = resortId;
  await setDoc(picksRef(), { [person]: arr, updatedAt: serverTimestamp() }, { merge: true });
}

export async function removePick(person, rank) {
  const snap = await getDoc(picksRef());
  const data = snap.exists() ? snap.data() : {};
  const arr  = Array.isArray(data[person]) ? [...data[person]] : [];
  while (arr.length < 3) arr.push(null);
  arr[rank] = null;
  await setDoc(picksRef(), { [person]: arr, updatedAt: serverTimestamp() }, { merge: true });
}

export async function setFinalCandidates(ids) {
  await setDoc(picksRef(), { finalCandidates: ids, updatedAt: serverTimestamp() }, { merge: true });
}

export async function setItinerary(days) {
  await setDoc(itineraryRef(), { days, updatedAt: serverTimestamp() });
}
