import { getMember, syncAppAuth, registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { FIREBASE_CONFIG } from '../../../shared/firebase/config.mjs';
import { createMemberWork } from '../../../shared/firebase/member-work.mjs';
// firebase-picks.js — couplePicks + itinerary CRUD (Firestore)
// couplePicks/main : { sohee: string[], sungwoo: string[], finalCandidates: string[], confirmedResort: string|null, updatedAt }
// itineraries/main : { days: [...], updatedAt }

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, onSnapshot, setDoc, getDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const TRIP_ID = 'main';
const app = getApps().find(item => item.name === '[DEFAULT]') || initializeApp(FIREBASE_CONFIG);
await syncAppAuth(app);
const db  = getFirestore(app);
const memberWork = createMemberWork({ getMember, registerPrivateCleanup });

function picksRef()     { return doc(db, 'couplePicks', TRIP_ID); }
function itineraryRef() { return doc(db, 'itineraries', TRIP_ID); }

function normalizePicks(data) {
  const norm = arr => {
    const a = Array.isArray(arr) ? [...arr] : [];
    while (a.length < 3) a.push(null);
    return a.slice(0, 3);
  };
  return {
    sohee:            norm(data?.sohee),
    sungwoo:          norm(data?.sungwoo),
    finalCandidates:  Array.isArray(data?.finalCandidates) ? data.finalCandidates : [],
    confirmedResort:  data?.confirmedResort ?? null,
  };
}

export function subscribePicks(cb) {
  return memberWork.observe(onSnapshot, picksRef(),
    snap => cb(normalizePicks(snap.exists() ? snap.data() : {})),
    ()   => cb(normalizePicks({}))
  );
}

export function subscribeItinerary(cb) {
  return memberWork.observe(onSnapshot, itineraryRef(),
    snap => cb(snap.exists() ? (snap.data().days || []) : []),
    ()   => cb([])
  );
}

export async function setPick(person, rank, resortId) {
  const request = memberWork.capture();
  const snap = await getDoc(picksRef());
  request.assert();
  const data = snap.exists() ? snap.data() : {};
  const arr  = Array.isArray(data[person]) ? [...data[person]] : [];
  while (arr.length < 3) arr.push(null);
  arr[rank] = resortId;
  await setDoc(picksRef(), { [person]: arr, updatedAt: serverTimestamp() }, { merge: true });
  request.assert();
}

export async function removePick(person, rank) {
  const request = memberWork.capture();
  const snap = await getDoc(picksRef());
  request.assert();
  const data = snap.exists() ? snap.data() : {};
  const arr  = Array.isArray(data[person]) ? [...data[person]] : [];
  while (arr.length < 3) arr.push(null);
  arr[rank] = null;
  await setDoc(picksRef(), { [person]: arr, updatedAt: serverTimestamp() }, { merge: true });
  request.assert();
}

export async function setFinalCandidates(ids) {
  const request = memberWork.capture();
  await setDoc(picksRef(), { finalCandidates: ids, updatedAt: serverTimestamp() }, { merge: true });
  request.assert();
}

export async function setItinerary(days) {
  const request = memberWork.capture();
  await setDoc(itineraryRef(), { days, updatedAt: serverTimestamp() });
  request.assert();
}

export async function setConfirmedResort(resortId) {
  const request = memberWork.capture();
  await setDoc(picksRef(), { confirmedResort: resortId ?? null, updatedAt: serverTimestamp() }, { merge: true });
  request.assert();
}
