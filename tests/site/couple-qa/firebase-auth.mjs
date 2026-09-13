import { authFor, actor, setActor, fakeUser, emitAuth } from './runtime.mjs';
export const browserLocalPersistence = {};
export const browserSessionPersistence = {};
export const getAuth = authFor;
export async function setPersistence() {}
export function onAuthStateChanged(auth, callback) { auth.listeners.add(callback); queueMicrotask(() => callback(auth.currentUser)); return () => auth.listeners.delete(callback); }
export const onIdTokenChanged = onAuthStateChanged;
export class GoogleAuthProvider { setCustomParameters() {} addScope() {} }
export async function signInWithPopup(auth) { const name = actor() === 'signed-out' ? 'sungwoo' : actor(); setActor(name); return { user: fakeUser(name) }; }
export async function updateCurrentUser(auth, user) { auth.currentUser = user; emitAuth(auth); }
export async function signOut(auth) { auth.currentUser = null; if (auth.app.name === 'homehunt-private-cloud') sessionStorage.setItem('sungso_qa_actor', 'signed-out'); emitAuth(auth); }
export async function getIdToken(user) { return user.getIdToken(); }
