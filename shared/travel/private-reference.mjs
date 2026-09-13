import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, getDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { FIREBASE_CONFIG } from '../firebase/config.mjs';
import { requireMember, getMember, syncAppAuth, registerPrivateCleanup } from '../firebase/site-auth.mjs';
import { hydrateTripReference, clearTripReference } from './trip-data.mjs';

export async function loadPrivateReference(id) {
  if (!['travel_reference', 'honeymoon_reference'].includes(id)) throw new Error('보호된 자료를 확인해주세요.');
  const member = await requireMember();
  const app = getApps().find(item => item.name === '[DEFAULT]') || initializeApp(FIREBASE_CONFIG);
  await syncAppAuth(app);
  const snapshot = await getDoc(doc(getFirestore(app), 'private_data', id));
  if (!getMember() || getMember().uid !== member.uid) throw new Error('로그인 상태가 변경됐어요.');
  if (!snapshot.exists()) throw new Error('보호된 자료 이전을 준비 중이에요. 관리자의 자료 이전이 끝난 뒤 다시 열어주세요.');
  const stored = snapshot.data();
  return typeof stored.payload === 'string' ? JSON.parse(stored.payload) : stored;
}

export async function loadTripReference() {
  const data = await loadPrivateReference('travel_reference');
  hydrateTripReference(data.reference);
  registerPrivateCleanup(clearTripReference);
  return data;
}

// Admin-managed markup. Remove executable content before inserting it.
export async function prepareTravelPage() {
  const data = await loadTripReference();
  const target = document.getElementById('private-trip-content');
  if (!target || typeof data.bodyHtml !== 'string') throw new Error('여행 화면 자료를 확인해주세요.');
  const template = document.createElement('template');
  template.innerHTML = data.bodyHtml;
  template.content.querySelectorAll('script,object,embed,base,meta,link,style').forEach(node => node.remove());
  for (const node of template.content.querySelectorAll('*')) for (const attribute of [...node.attributes]) {
    if (/^on/i.test(attribute.name) || attribute.name === 'srcdoc') node.removeAttribute(attribute.name);
    if (['href', 'src', 'action', 'formaction'].includes(attribute.name)) {
      let url;
      try { url = new URL(attribute.value, location.href); } catch { node.removeAttribute(attribute.name); continue; }
      if (!['https:', 'http:'].includes(url.protocol)) node.removeAttribute(attribute.name);
    }
  }
  target.replaceChildren(template.content);
  registerPrivateCleanup(() => target.replaceChildren());
}
