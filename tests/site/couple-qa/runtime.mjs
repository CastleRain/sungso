export const apps = [];
export const auths = new Map();
const actorKey = 'sungso_qa_actor';
export function fakeUser(actor) {
  if (!actor || actor === 'signed-out') return null;
  const uid = actor === 'sungwoo' ? 'qa-sungwoo' : actor === 'sohee' ? 'qa-sohee' : 'qa-nonmember';
  return { uid, displayName: actor, email: `${actor}@qa.invalid`, emailVerified: true, async getIdToken() { return `qa-synthetic-${uid}`; }, async getIdTokenResult() { return { claims: { email_verified: true, firebase: { sign_in_provider: 'google.com' } } }; } };
}
export function actor() { return sessionStorage.getItem(actorKey) || 'signed-out'; }
export function authFor(app) { if (!auths.has(app.name)) auths.set(app.name, { app, currentUser: app.name === 'homehunt-private-cloud' ? fakeUser(actor()) : null, listeners: new Set() }); return auths.get(app.name); }
export function emitAuth(auth) { for (const fn of auth.listeners) queueMicrotask(() => fn(auth.currentUser)); }
export function setActor(value) { sessionStorage.setItem(actorKey, value); const primary = auths.get('homehunt-private-cloud'); if (primary) { primary.currentUser = fakeUser(value); emitAuth(primary); } else location.reload(); }
export async function api(body, db) {
  const user = db?.app ? authFor(db.app).currentUser : null;
  const response = await fetch('/__qa/data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-QA-UID': user?.uid || '' }, body: JSON.stringify(body) });
  const value = await response.json(); if (!response.ok) throw Object.assign(new Error(value.error?.message || 'QA error'), { code: value.error?.code || 'unavailable' }); return value;
}
export class Timestamp {
  constructor(seconds, nanoseconds = 0) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  static fromMillis(value) { return new Timestamp(Math.floor(value / 1000), (value % 1000) * 1000000); }
  static fromDate(value) { return Timestamp.fromMillis(value.getTime()); }
  static now() { return Timestamp.fromMillis(Date.now()); }
  toDate() { return new Date(this.toMillis()); }
  toMillis() { return this.seconds * 1000 + this.nanoseconds / 1000000; }
  toJSON() { return { $qaTimestamp: this.toMillis() }; }
}
export function revive(value) { if (value?.$qaTimestamp != null) return Timestamp.fromMillis(value.$qaTimestamp); if (Array.isArray(value)) return value.map(revive); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, revive(item)])); return value; }
