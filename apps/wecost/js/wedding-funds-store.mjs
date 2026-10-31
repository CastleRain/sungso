import { db } from './firebase.js';
import { getMember, registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { createMemberWork } from '../../../shared/firebase/member-work.mjs';
import { buildBudgetAudit, sameBudgetValue, isTravelItem } from '../../../shared/finance/travel-budget-core.mjs';
import { buildFundingChange } from './wedding-funds-core.mjs';
import { localDate } from './wedding-core.mjs';
import { doc, collection, onSnapshot, getDocFromServer, getDocsFromServer, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const work = createMemberWork({ getMember, registerPrivateCleanup });
const fundsRef = doc(db, 'wecost_settings', 'wedding_funds');
const planRef = doc(db, 'itineraries', 'honeymoon_2027_budget');
const state = { funds: null, plan: null, connection: 'loading', error: '' };
const subscribers = new Set(), live = new Set();
let stops = [], busy = false;
const emit = () => subscribers.forEach(fn => fn(structuredClone(state)));
export function subscribeWeddingFunds(fn) {
  subscribers.add(fn); fn(structuredClone(state));
  if (!stops.length) {
    for (const [key, ref] of [['funds', fundsRef], ['plan', planRef]]) stops.push(work.observe(onSnapshot, ref, { includeMetadataChanges: true }, snap => {
      state[key] = snap.exists() ? snap.data() : null;
      if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) live.add(key); else live.delete(key);
      state.connection = live.size === 2 ? 'live' : 'loading'; state.error = ''; emit();
    }, error => { state.connection = 'error'; state.error = error.code === 'permission-denied' ? '자금 조회 권한을 확인해주세요.' : '자금에 연결하지 못했어요. 새로고침 후 다시 확인해주세요.'; emit(); }));
  }
  return () => { subscribers.delete(fn); if (!subscribers.size) { stops.forEach(stop => stop()); stops = []; live.clear(); state.connection = 'loading'; } };
}
export async function saveWeddingFinance(command, expected, operationId) {
  const request = work.capture();
  if (busy) throw Error('저장이 끝날 때까지 기다려주세요.');
  if (state.connection !== 'live' || globalThis.navigator?.onLine === false) throw Error('실시간 연결을 확인한 뒤 다시 저장해주세요.');
  if (!/^[\w-]{8,100}$/.test(operationId)) throw Error('저장 요청을 다시 열어주세요.');
  const saved = structuredClone(command), original = structuredClone(expected);
  const opRef = doc(db, 'wecost_settings', `wedding_funds_log_${operationId}`);
  const itemRef = original.item ? doc(db, 'wecost_items', original.item.id) : null;
  const auditRef = doc(db, 'itineraries', `honeymoon_2027_budget_log_${String(9999999999999 - Date.now()).padStart(13, '0')}_${operationId}`);
  busy = true;
  try {
    const result = await runTransaction(db, async tx => {
      request.assert();
      const prior = await tx.get(opRef); request.assert();
      if (prior.exists()) {
        if (prior.data().actorUid !== request.member.uid || !sameBudgetValue(prior.data().command, saved)) throw Error('같은 저장 요청의 내용이 달라요. 창을 다시 열어주세요.');
        return { replayed: true };
      }
      const f = await tx.get(fundsRef); request.assert();
      const p = itemRef ? await tx.get(planRef) : null; request.assert();
      const i = itemRef ? await tx.get(itemRef) : null; request.assert();
      const before = { funds: f.exists() ? f.data() : null, plan: p?.exists() ? p.data() : null, item: i?.exists() ? { ...i.data(), id: itemRef.id } : null };
      const next = buildFundingChange(before, saved, original, localDate());
      const afterItem = before.item ? { ...before.item, ...(next.itemPatch || {}) } : null;
      const audit = isTravelItem(before.item) ? buildBudgetAudit(before.item, before.plan, afterItem, next.plan || before.plan, request.member.name) : null;
      request.assert();
      tx.set(fundsRef, { ...next.funds, updatedAt: serverTimestamp() });
      if (next.itemPatch) tx.update(itemRef, { ...next.itemPatch, updatedAt: serverTimestamp() });
      if (next.plan) tx.set(planRef, { ...next.plan, updatedAt: serverTimestamp() }, { merge: true });
      if (audit) tx.set(auditRef, { ...audit, source: 'wecost', actorUid: request.member.uid, changedAt: serverTimestamp() });
      // Private exact before/after snapshots also make each actual change recoverable.
      tx.set(opRef, { command: saved, before, after: { funds: next.funds, item: afterItem, plan: next.plan || before.plan }, movement: next.movement, actorUid: request.member.uid, changedAt: serverTimestamp() });
      return { replayed: false };
    });
    request.assert(); return result;
  } finally { busy = false; }
}
export async function exportWeddingBackup() {
  const request = work.capture();
  const refs = ['wecost_settings', 'wecost_savings', 'wecost_items', 'wecost_loans', 'wecost_adjustments'];
  const collections = {};
  for (const name of refs) {
    const snapshot = await getDocsFromServer(collection(db, name)); request.assert();
    collections[name] = Object.fromEntries(snapshot.docs.map(row => [row.id, row.data()]));
  }
  const plan = await getDocFromServer(planRef); request.assert();
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), collections, travelPlan: plan.exists() ? plan.data() : null };
}
registerPrivateCleanup(() => {
  stops.forEach(stop => stop()); stops = []; subscribers.clear(); live.clear();
  Object.assign(state, { funds: null, plan: null, connection: 'loading', error: '' });
});
