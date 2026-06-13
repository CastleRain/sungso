import { initializeApp, getApps }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  doc, collection,
  onSnapshot,
  getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyBz-P5ycMAjYZBV7hkcZDrmq28EAw7Hsp8',
  authDomain:        'sungso-358cb.firebaseapp.com',
  projectId:         'sungso-358cb',
  storageBucket:     'sungso-358cb.firebasestorage.app',
  messagingSenderId: '143797950443',
  appId:             '1:143797950443:web:95b0f616246d84aae3bae',
};

const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);

// ===== 초기 기본값 =====

const DEFAULT_SETTINGS = {
  weddingDate:           '2027-03-06',
  targetWeddingBudget:   50000000,
  targetHousePrice:      400000000,
  monthlyPaymentLimit:   1500000,
  parentSupportSohee:    0,
  parentSupportSunwo:    0,
  includeSupportSohee:   false,
  includeSupportSunwo:   false,
};

const DEFAULT_SAVINGS = {
  soheeCurrent: 0,
  soheeMonthly: 0,
  sunwoCurrent: 0,
  sunwoMonthly: 0,
};

// ===== 구독 =====

export function subscribeAll(onUpdate) {
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
    if (readyCount < TOTAL) return;
    onUpdate({ ...snapshot });
  }

  // settings
  const settingsRef = doc(db, 'wecost_settings', 'main');
  const unsubSettings = onSnapshot(settingsRef, async snap => {
    if (!snap.exists()) {
      await setDoc(settingsRef, { ...DEFAULT_SETTINGS, updatedAt: serverTimestamp() });
      snapshot.settings = { ...DEFAULT_SETTINGS };
    } else {
      snapshot.settings = snap.data();
    }
    if (snapshot.settings === null) readyCount++;
    else if (snapshot.settings !== null && readyCount < TOTAL) {
      // first time non-null
    }
    readyCount = Math.max(readyCount, Object.values(snapshot).filter(v => v !== null).length);
    notify();
  });

  // savings
  const savingsRef = doc(db, 'wecost_savings', 'main');
  const unsubSavings = onSnapshot(savingsRef, async snap => {
    if (!snap.exists()) {
      await setDoc(savingsRef, { ...DEFAULT_SAVINGS, updatedAt: serverTimestamp() });
      snapshot.savings = { ...DEFAULT_SAVINGS };
    } else {
      snapshot.savings = snap.data();
    }
    readyCount = Math.max(readyCount, Object.values(snapshot).filter(v => v !== null).length);
    notify();
  });

  // items
  const unsubItems = onSnapshot(collection(db, 'wecost_items'), snap => {
    snapshot.items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    readyCount = Math.max(readyCount, Object.values(snapshot).filter(v => v !== null).length);
    notify();
  });

  // loans
  const unsubLoans = onSnapshot(collection(db, 'wecost_loans'), snap => {
    snapshot.loans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    readyCount = Math.max(readyCount, Object.values(snapshot).filter(v => v !== null).length);
    notify();
  });

  // adjustments
  const unsubAdjustments = onSnapshot(collection(db, 'wecost_adjustments'), snap => {
    snapshot.adjustments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    readyCount = Math.max(readyCount, Object.values(snapshot).filter(v => v !== null).length);
    notify();
  });

  return () => {
    unsubSettings(); unsubSavings(); unsubItems(); unsubLoans(); unsubAdjustments();
  };
}

// ===== settings =====

export async function updateSettings(fields) {
  await updateDoc(doc(db, 'wecost_settings', 'main'), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
}

// ===== items (결혼비용) =====

export async function addItem(item) {
  return await addDoc(collection(db, 'wecost_items'), {
    ...item,
    updatedAt: serverTimestamp(),
  });
}

export async function updateItem(id, fields) {
  await updateDoc(doc(db, 'wecost_items', id), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteItem(id) {
  await deleteDoc(doc(db, 'wecost_items', id));
}

// ===== savings =====

export async function updateSavings(fields) {
  await updateDoc(doc(db, 'wecost_savings', 'main'), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
}

// ===== loans =====

export async function addLoan(loan) {
  return await addDoc(collection(db, 'wecost_loans'), {
    ...loan,
    enabled:   loan.enabled !== false,
    updatedAt: serverTimestamp(),
  });
}

export async function updateLoan(id, fields) {
  await updateDoc(doc(db, 'wecost_loans', id), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteLoan(id) {
  await deleteDoc(doc(db, 'wecost_loans', id));
}

// ===== adjustments =====

export async function addAdjustment(adj) {
  return await addDoc(collection(db, 'wecost_adjustments'), {
    ...adj,
    updatedAt: serverTimestamp(),
  });
}

export async function updateAdjustment(id, fields) {
  await updateDoc(doc(db, 'wecost_adjustments', id), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAdjustment(id) {
  await deleteDoc(doc(db, 'wecost_adjustments', id));
}
