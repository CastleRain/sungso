import { api, revive, Timestamp } from './runtime.mjs';
export { Timestamp };
const stores = new Map();
export function getFirestore(app) { if (!stores.has(app.name)) stores.set(app.name, { app, subscriptions: new Set(), closed: false }); return stores.get(app.name); }
export const initializeFirestore = getFirestore;
export function collection(parent, ...parts) { return { kind: 'collection', db: parent.db || parent, path: [parent.path, ...parts].filter(Boolean).join('/') }; }
export function doc(parent, ...parts) { const path = [parent.path, ...parts].filter(Boolean).join('/') + (parts.length ? '' : `/${crypto.randomUUID()}`); return { kind: 'doc', db: parent.db || parent, path, id: path.split('/').at(-1) }; }
export const query = (ref, ...constraints) => ({ ...ref, constraints });
export const where = (field, op, value) => ({ kind: 'where', field, op, value });
export const orderBy = (field, direction = 'asc') => ({ kind: 'orderBy', field, direction });
export const documentId = () => '__name__';
export const startAt = value => ({ kind: 'startAt', value });
export const endAt = value => ({ kind: 'endAt', value });
export const startAfter = value => ({ kind: 'startAt', value: value?.id || value });
export const limit = value => ({ kind: 'limit', value });
export const serverTimestamp = () => ({ $qaServerTimestamp: true });
const rawRef = ref => ({ kind: ref.kind, path: ref.path, constraints: ref.constraints });
function snapshot(value, ref) {
  const metadata = { fromCache: false, hasPendingWrites: false };
  if (value.rows) { const docs = value.rows.map(row => snapshot(row, { ...ref, kind: 'doc', path: row.path, id: row.id })); return { docs, size: docs.length, empty: !docs.length, metadata, forEach: callback => docs.forEach(callback), docChanges: () => docs.map(doc => ({ type: 'added', doc })) }; }
  return { id: value.id, ref, metadata, exists: () => value.data !== null, data: () => revive(value.data), get: field => revive(value.data?.[field]), _version: value.version };
}
export async function getDoc(ref) { return snapshot(await api({ op: 'read', ref: rawRef(ref) }, ref.db), ref); }
export const getDocFromServer = getDoc;
export const getDocs = getDoc;
export function onSnapshot(ref, ...args) {
  const success = args.find(arg => typeof arg === 'function'), error = args.filter(arg => typeof arg === 'function')[1]; let active = true, last = '';
  const poll = async () => { if (!active || ref.db.closed) return; try { const value = await api({ op: 'read', ref: rawRef(ref) }, ref.db); const hash = JSON.stringify(value); if (active && hash !== last) { last = hash; success(snapshot(value, ref)); } } catch (cause) { if (active) error?.(cause); } };
  const timer = setInterval(poll, 500); void poll();
  const stop = () => { active = false; clearInterval(timer); ref.db.subscriptions.delete(stop); }; ref.db.subscriptions.add(stop); return stop;
}
const change = (ref, type, value, options = {}) => ({ path: ref.path, type, value, merge: options.merge === true });
export async function setDoc(ref, value, options) { await api({ op: 'write', changes: [change(ref, 'set', value, options)] }, ref.db); }
export async function updateDoc(ref, value) { await api({ op: 'write', changes: [change(ref, 'update', value)] }, ref.db); }
export async function deleteDoc(ref) { await api({ op: 'write', changes: [change(ref, 'delete')] }, ref.db); }
export async function addDoc(ref, value) { const target = doc(ref); await setDoc(target, value); return target; }
export async function runTransaction(db, update) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const pending = [], readVersions = {};
    const transaction = { async get(ref) { const value = await getDoc(ref); readVersions[ref.path] = value._version; return value; }, set(ref, value, options) { pending.push(change(ref, 'set', value, options)); }, update(ref, value) { pending.push(change(ref, 'update', value)); }, delete(ref) { pending.push(change(ref, 'delete')); } };
    const result = await update(transaction);
    try { await api({ op: 'commit', changes: pending, readVersions }, db); return result; } catch (error) { if (error.code !== 'aborted' || attempt === 4) throw error; }
  }
}
export function writeBatch(db) { const pending = []; return { set(ref, value, options) { pending.push(change(ref, 'set', value, options)); }, update(ref, value) { pending.push(change(ref, 'update', value)); }, delete(ref) { pending.push(change(ref, 'delete')); }, commit: () => api({ op: 'commit', changes: pending }, db) }; }
export async function terminate(db) { db.closed = true; for (const stop of [...db.subscriptions]) stop(); }
export function connectFirestoreEmulator() {}
export async function enableNetwork() {}
export async function disableNetwork() {}
export function deleteField() { return { $qaDeleteField: true }; }
export function increment(value) { return { $qaIncrement: value }; }
