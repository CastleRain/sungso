import { profileAdapter } from './profile-adapter.mjs?v=20260915-venue-map';
import { FIREBASE_CONFIG } from '../../../shared/firebase/config.mjs';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import * as sdk from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { firestoreAdapter } from './firestore-adapter.mjs?v=20260915-venue-map';
import { getMember, syncAppAuth } from '../../../shared/firebase/site-auth.mjs';

export async function connect() {
  const name = 'sungso-invitation';
  const app = getApps().find(item => item.name === name) || initializeApp(FIREBASE_CONFIG, name);
  await syncAppAuth(app);
  return firestoreAdapter(sdk, sdk.getFirestore(app), { online: () => navigator.onLine, events: window, member: getMember });
}

export async function connectProfile() {
  const name = 'sungso-invitation';
  const app = getApps().find(item => item.name === name) || initializeApp(FIREBASE_CONFIG, name);
  await syncAppAuth(app);
  return profileAdapter(sdk, sdk.getFirestore(app), { online: () => navigator.onLine, events: window, member: getMember });
}
