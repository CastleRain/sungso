import { FIREBASE_CONFIG } from '../firebase/config.mjs';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, collection, query, where, orderBy, documentId, startAt, endAt, limit, onSnapshot, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { TRAVEL_CATEGORY, isTravelItem, normalizeBudgetDraft, buildBudgetUpdate, buildTravelLedgerUpdate, buildBudgetAudit } from './travel-budget-core.mjs';

const appName = 'sungso-travel-budget';
const app = getApps().find(item => item.name === appName) || initializeApp(FIREBASE_CONFIG, appName);
const db = getFirestore(app);
const planRef = doc(db, 'itineraries', 'honeymoon_2027_budget');
const fxRef = doc(db, 'honeymoon_fx', 'usd_krw');
const itemsQuery = query(collection(db, 'wecost_items'), where('cat', '==', TRAVEL_CATEGORY));
const historyPrefix = 'honeymoon_2027_budget_log_';
const historyQuery = query(collection(db, 'itineraries'), orderBy(documentId()), startAt(historyPrefix), endAt(historyPrefix + '\uf8ff'), limit(50));

let state = { items: [], plan: null, fx: null, connection: 'loading', saving: false, error: '' };
let historyState = { entries: [], connection: 'loading', error: '' };
const subscribers = new Set(), historySubscribers = new Set();
let stops = [], timer = null, historyStop = null, historyTimer = null;
let readiness = { items: false, plan: false, fx: false };
const failures = new Map();
const online = () => navigator.onLine !== false;
const emit = () => subscribers.forEach(cb => cb(structuredClone(state)));
const emitHistory = () => historySubscribers.forEach(cb => cb(structuredClone(historyState)));
const liveSnapshot = snap => !snap.metadata?.fromCache && !snap.metadata?.hasPendingWrites;

function actor() {
  try { const value = localStorage.getItem('sungso_trip_actor'); return ['성우', '소희'].includes(value) ? value : '미지정'; }
  catch { return '미지정'; }
}
function historyRef() {
  // The built-in ascending document-ID index returns recent reverse-time IDs.
  return doc(db, 'itineraries', historyPrefix + String(9999999999999 - Date.now()).padStart(13, '0') + '_' + crypto.randomUUID());
}
function connectionError(error, saving = false) {
  if (error?.code === 'permission-denied') return saving ? '저장 권한이 없어 금액이 반영되지 않았어요.' : '여행 예산을 읽을 권한을 확인해주세요.';
  return error?.message || (saving ? '저장하지 못했어요. 입력한 내용을 유지한 뒤 다시 시도해주세요.' : '여행 예산을 불러오지 못했어요. 새로고침 후 확인해주세요.');
}
function start() {
  if (stops.length) return;
  readiness = { items: false, plan: false, fx: false };
  failures.clear();
  timer = setTimeout(() => {
    if (state.connection === 'loading') { state = { ...state, connection: 'offline', error: 'WeCost 여행 예산에 연결하지 못했어요. 연결 후 다시 확인해주세요.' }; emit(); }
  }, 15000);
  const receive = (key, value, snap) => {
    readiness[key] = liveSnapshot(snap);
    failures.delete(key);
    const live = !failures.size && Object.values(readiness).every(Boolean) && online();
    if (live) clearTimeout(timer);
    state = { ...state, [key]: value, connection: failures.size ? 'error' : live ? 'live' : (online() ? 'loading' : 'offline'), error: live ? '' : state.error };
    emit();
  };
  const failed = (key, error) => {
    readiness[key] = false; failures.set(key, error);
    clearTimeout(timer);
    state = { ...state, connection: 'error', error: connectionError(error) }; emit();
  };
  // Subscribing only reads existing records. Missing plans/rates stay null;
  // no seeds, exchange-rate fetches, or user data are written on page load.
  stops.push(onSnapshot(itemsQuery, { includeMetadataChanges: true }, snap => {
    receive('items', snap.docs.map(row => ({ ...row.data(), id: row.id })).filter(isTravelItem), snap);
  }, error => failed('items', error)));
  stops.push(onSnapshot(planRef, { includeMetadataChanges: true }, snap => receive('plan', snap.exists() ? snap.data() : null, snap), error => failed('plan', error)));
  stops.push(onSnapshot(fxRef, { includeMetadataChanges: true }, snap => receive('fx', snap.exists() ? snap.data() : null, snap), error => failed('fx', error)));
}
function stopReading() { stops.forEach(stop => stop()); stops = []; clearTimeout(timer); }

export function subscribeTravelBudget(cb) {
  subscribers.add(cb); cb(structuredClone(state)); start();
  return () => { subscribers.delete(cb); if (!subscribers.size) { stopReading(); state = { ...state, connection: 'loading' }; } };
}
function stampISO(stamp) {
  if (typeof stamp === 'string') return stamp;
  if (stamp?.toDate) return stamp.toDate().toISOString();
  if (typeof stamp?.seconds === 'number') return new Date(stamp.seconds * 1000).toISOString();
  return '';
}
function startHistory() {
  if (historyStop) return;
  historyTimer = setTimeout(() => {
    if (historyState.connection === 'loading') { historyState = { ...historyState, connection: 'offline', error: '금액 변경 기록에 연결하지 못했어요.' }; emitHistory(); }
  }, 15000);
  historyStop = onSnapshot(historyQuery, { includeMetadataChanges: true }, snap => {
    const live = liveSnapshot(snap) && online();
    if (live) clearTimeout(historyTimer);
    const entries = snap.docs.map(row => ({ ...row.data(), id: row.id, changedAt: stampISO(row.data().changedAt) }))
      .filter(row => row.tripId === 'honeymoon_2027' && ['budget', 'ledger'].includes(row.type))
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt) || a.id.localeCompare(b.id));
    historyState = { entries, connection: live ? 'live' : (online() ? 'loading' : 'offline'), error: live ? '' : historyState.error }; emitHistory();
  }, error => { clearTimeout(historyTimer); historyState = { ...historyState, connection: 'error', error: connectionError(error) }; emitHistory(); });
}
export function subscribeBudgetHistory(cb) {
  historySubscribers.add(cb); cb(structuredClone(historyState)); startHistory();
  return () => { historySubscribers.delete(cb); if (!historySubscribers.size) { historyStop?.(); historyStop = null; clearTimeout(historyTimer); historyState = { ...historyState, connection: 'loading' }; } };
}

async function saving(action, requireSubscription) {
  if (!online() || (requireSubscription && state.connection !== 'live')) throw new Error('WeCost 여행 예산에 연결된 뒤 다시 저장해주세요.');
  if (state.saving) throw new Error('앞선 금액 저장이 끝난 뒤 다시 시도해주세요.');
  state = { ...state, saving: true, error: '' }; emit();
  try {
    const result = await action();
    state = { ...state, saving: false, error: '' }; emit();
    return result;
  } catch (error) {
    const message = connectionError(error, true);
    state = { ...state, saving: false, error: message }; emit();
    throw new Error(message);
  }
}

export async function saveTravelBudget(draft, expected) {
  const normalized = normalizeBudgetDraft(draft), who = actor();
  const original = structuredClone(expected);
  return saving(async () => {
    const itemRef = doc(db, 'wecost_items', normalized.linkedItemId), auditRef = historyRef();
    return runTransaction(db, async tx => {
      const itemSnap = await tx.get(itemRef), planSnap = await tx.get(planRef);
      const rawItem = itemSnap.exists() ? { ...itemSnap.data(), id: itemRef.id } : null;
      const rawPlan = planSnap.exists() ? planSnap.data() : null;
      const next = buildBudgetUpdate(rawItem, rawPlan, normalized, original);
      const audit = buildBudgetAudit(rawItem, rawPlan, { ...rawItem, ...next.itemPatch }, next.plan, who);
      if (!audit) return { changed: false };
      // No second WeCost item is created. Payment/date/memo/unknown fields and
      // the current itinerary document are outside this update's write set.
      tx.update(itemRef, { ...next.itemPatch, updatedAt: serverTimestamp() });
      tx.set(planRef, { ...next.plan, updatedAt: serverTimestamp() }, { merge: true });
      tx.set(auditRef, { ...audit, source: 'travel', changedAt: serverTimestamp() });
      return { changed: true };
    });
  }, true);
}

// Called by WeCost's existing editor after its own subscriptions are ready.
// It needs no Travel subscription: a server transaction checks connectivity
// and the exact editor snapshot, and commits the expense plus audit atomically.
export async function saveTravelLedgerItem(id, fields, expectedItem) {
  if (typeof id !== 'string' || !id || id.includes('/') || id.length > 200) throw new Error('WeCost 여행 비용을 다시 선택해주세요.');
  const who = actor();
  const savedFields = structuredClone(fields), original = structuredClone(expectedItem);
  return saving(async () => {
    const itemRef = doc(db, 'wecost_items', id), auditRef = historyRef();
    return runTransaction(db, async tx => {
      const itemSnap = await tx.get(itemRef), planSnap = await tx.get(planRef);
      const rawItem = itemSnap.exists() ? { ...itemSnap.data(), id } : null;
      const rawPlan = planSnap.exists() ? planSnap.data() : null;
      const patch = buildTravelLedgerUpdate(rawItem, savedFields, original);
      const linkedPlan = rawPlan?.linkedItemId === id ? rawPlan : null;
      const audit = buildBudgetAudit(rawItem, linkedPlan, { ...rawItem, ...patch }, linkedPlan, who);
      if (!audit) return { changed: false };
      tx.update(itemRef, { ...patch, updatedAt: serverTimestamp() });
      tx.set(auditRef, { ...audit, source: 'wecost', changedAt: serverTimestamp() });
      return { changed: true };
    });
  }, false);
}

window.addEventListener('offline', () => {
  state = { ...state, connection: 'offline', error: '인터넷 연결이 끊겼어요. 연결 후 다시 저장해주세요.' }; emit();
  historyState = { ...historyState, connection: 'offline', error: '마지막으로 받은 금액 변경 기록이에요.' }; emitHistory();
});
window.addEventListener('online', () => {
  if (subscribers.size) { stopReading(); state = { ...state, connection: 'loading', error: '' }; emit(); start(); }
  if (historySubscribers.size) { historyStop?.(); historyStop = null; clearTimeout(historyTimer); historyState = { ...historyState, connection: 'loading', error: '' }; emitHistory(); startHistory(); }
});
