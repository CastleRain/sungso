import { getMember, syncAppAuth, registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { FIREBASE_CONFIG } from '../../../shared/firebase/config.mjs';
import { createMemberWork } from '../../../shared/firebase/member-work.mjs';
import { initializeApp, getApps }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  doc, collection,
  onSnapshot,
  getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { isTravelItem } from '../../../shared/finance/travel-budget-core.mjs';
import { homeTargetPriceBridge } from '../../../shared/finance/home-target-price.mjs';

const app = getApps().find(item => item.name === '[DEFAULT]') || initializeApp(FIREBASE_CONFIG);
await syncAppAuth(app);
const db  = getFirestore(app);
const memberWork = createMemberWork({ getMember, registerPrivateCleanup });
let targetPriceWriteSequence = 0;

// ===== 초기 기본값 =====

const DEFAULT_SETTINGS = { weddingDate: '', targetWeddingBudget: 0, targetHousePrice: 0, monthlyPaymentLimit: 0, parentSupportSohee: 0, parentSupportSunwo: 0, includeSupportSohee: false, includeSupportSunwo: false };

const DEFAULT_SAVINGS = {
  soheeCurrent: 0,
  soheeMonthly: 0,
  sunwoCurrent: 0,
  sunwoMonthly: 0,
};

// ===== 구독 =====

export function subscribeAll(onUpdate) {
  const caller = getMember(); if (!caller) throw new Error('로그인이 필요해요.');
  let active = true;
  // 각 컬렉션 상태를 별도로 저장하고 모든 구독이 첫 응답 후 콜백
  const snapshot = {
    settings:    null,
    items:       null,
    savings:     null,
    loans:       null,
    adjustments: null,
  };
  let readyCount = 0;
  const TOTAL = 5;

  function notify() {
    if (!active || getMember()?.uid !== caller.uid || readyCount < TOTAL) return;
    onUpdate({ ...snapshot });
  }

  // settings
  const settingsRef = doc(db, 'wecost_settings', 'main');
  const unsubSettings = memberWork.observe(onSnapshot, settingsRef, snap => {
    if (!snap.exists()) {
      snapshot.settings = { ...DEFAULT_SETTINGS };
    } else {
      snapshot.settings = snap.data();
    }
    // Publish only the target already read by WeCost, never a new financial query.
    // Optimistic pending writes are published by updateSettings after success.
    if (!snap.metadata?.hasPendingWrites) homeTargetPriceBridge.publish(snapshot.settings?.targetHousePrice);
    if (snapshot.settings === null) readyCount++;
    else if (snapshot.settings !== null && readyCount < TOTAL) {
      // first time non-null
    }
    readyCount = Math.max(readyCount, Object.values(snapshot).filter(v => v !== null).length);
    notify();
  }, () => { homeTargetPriceBridge.clear('wecost-unavailable'); });

  // savings
  const savingsRef = doc(db, 'wecost_savings', 'main');
  const unsubSavings = memberWork.observe(onSnapshot, savingsRef, snap => {
    if (!snap.exists()) {
      snapshot.savings = { ...DEFAULT_SAVINGS };
    } else {
      snapshot.savings = snap.data();
    }
    readyCount = Math.max(readyCount, Object.values(snapshot).filter(v => v !== null).length);
    notify();
  });

  // items
  const unsubItems = memberWork.observe(onSnapshot, collection(db, 'wecost_items'), snap => {
    snapshot.items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    readyCount = Math.max(readyCount, Object.values(snapshot).filter(v => v !== null).length);
    notify();
  });

  // loans
  const unsubLoans = memberWork.observe(onSnapshot, collection(db, 'wecost_loans'), snap => {
    snapshot.loans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    readyCount = Math.max(readyCount, Object.values(snapshot).filter(v => v !== null).length);
    notify();
  });

  // adjustments
  const unsubAdjustments = memberWork.observe(onSnapshot, collection(db, 'wecost_adjustments'), snap => {
    snapshot.adjustments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    readyCount = Math.max(readyCount, Object.values(snapshot).filter(v => v !== null).length);
    notify();
  });

  const cleanup = () => {
    if (!active) return;
    active = false;
    unsubSettings(); unsubSavings(); unsubItems(); unsubLoans(); unsubAdjustments();
    for (const key of Object.keys(snapshot)) snapshot[key] = null;
    targetPriceWriteSequence++;
    homeTargetPriceBridge.clear('signed-out');
    unregister();
  };
  const unregister = registerPrivateCleanup(cleanup);
  return cleanup;
}

// ===== settings =====

export async function updateSettings(fields) {
  const request = memberWork.capture();
  const hasTarget = Object.prototype.hasOwnProperty.call(fields, 'targetHousePrice');
  const targetPriceWon = fields.targetHousePrice;
  const targetSequence = hasTarget ? ++targetPriceWriteSequence : null;
  await updateDoc(doc(db, 'wecost_settings', 'main'), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
  request.assert();
  if (hasTarget && targetSequence === targetPriceWriteSequence) homeTargetPriceBridge.publish(targetPriceWon);
}

// ===== items (결혼비용) =====

export async function addItem(item) {
  const request = memberWork.capture();
  const result = await addDoc(collection(db, 'wecost_items'), {
    ...item,
    updatedAt: serverTimestamp(),
  });
  request.assert(); return result;
}

export async function updateItem(id, fields, expectedItem = null) {
  const request = memberWork.capture();
  if (isTravelItem(expectedItem)) {
    const { saveTravelLedgerItem } = await import('../../../shared/finance/travel-budget-store.mjs');
    request.assert();
    return saveTravelLedgerItem(id, fields, expectedItem);
  }
  await updateDoc(doc(db, 'wecost_items', id), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
  request.assert();
}

export async function deleteItem(id) {
  const request = memberWork.capture();
  await deleteDoc(doc(db, 'wecost_items', id));
  request.assert();
}

// ===== savings =====

export async function updateSavings(fields) {
  const request = memberWork.capture();
  await updateDoc(doc(db, 'wecost_savings', 'main'), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
  request.assert();
}

// ===== loans =====

export async function addLoan(loan) {
  const request = memberWork.capture();
  const result = await addDoc(collection(db, 'wecost_loans'), {
    ...loan,
    enabled:   loan.enabled !== false,
    updatedAt: serverTimestamp(),
  });
  request.assert(); return result;
}

export async function updateLoan(id, fields) {
  const request = memberWork.capture();
  await updateDoc(doc(db, 'wecost_loans', id), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
  request.assert();
}

export async function deleteLoan(id) {
  const request = memberWork.capture();
  await deleteDoc(doc(db, 'wecost_loans', id));
  request.assert();
}

// ===== adjustments =====

export async function addAdjustment(adj) {
  const request = memberWork.capture();
  const result = await addDoc(collection(db, 'wecost_adjustments'), {
    ...adj,
    updatedAt: serverTimestamp(),
  });
  request.assert(); return result;
}

export async function updateAdjustment(id, fields) {
  const request = memberWork.capture();
  await updateDoc(doc(db, 'wecost_adjustments', id), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
  request.assert();
}

export async function deleteAdjustment(id) {
  const request = memberWork.capture();
  await deleteDoc(doc(db, 'wecost_adjustments', id));
  request.assert();
}
