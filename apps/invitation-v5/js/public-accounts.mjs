import { ACCOUNTS_PATH } from '../../../shared/invitation/account-core.mjs';
import { renderAccounts } from './account-view.mjs?v=5.4.0';
import { mountAccountTabs } from './account-interactions.mjs?v=5.4.0';
const local = ['127.0.0.1','localhost'].includes(location.hostname);
const base = local ? 'http://127.0.0.1:8025' : 'https://sungso-homehunt-api.onrender.com';
const section = document.querySelector('#accounts'), list = document.querySelector('#accounts-list');
const tabs = mountAccountTabs(list, {remember:true});
let controller;
let firstLoad = true;
async function refresh() {
  controller?.abort();
  const current = new AbortController(); controller = current;
  const timeout = setTimeout(() => current.abort(), 45000);
  // Clear destinations immediately, but reserve their space when returning from a bank app.
  const reserve = !section.hidden && list.children.length ? Math.ceil(list.getBoundingClientRect().height) : 0;
  list.replaceChildren();
  list.setAttribute('aria-busy', 'true');
  if (reserve) {
    list.style.minHeight = `${reserve}px`;
    const loading = document.createElement('p');
    loading.className = 'account-loading'; loading.setAttribute('role','status');
    loading.textContent = '계좌 정보를 확인하고 있어요.';
    list.append(loading);
  } else section.hidden = true;
  try {
    const response = await fetch(base + ACCOUNTS_PATH, {cache:'no-store',credentials:'omit',signal:current.signal});
    const data = await response.json();
    if (controller !== current || current.signal.aborted) return;
    if (!response.ok || data.ok !== true || !Array.isArray(data.groups) || data.groups.length > 4) throw Error('unavailable');
    list.innerHTML = renderAccounts(data.groups);
    tabs.refresh();
    section.hidden = !list.children.length;
    if (local && list.children.length) {
      const note = document.createElement('p');
      note.className = 'preview-note';
      note.textContent = '로컬 미리보기 · 실제 청첩장과 별도로 저장됩니다.';
      list.prepend(note);
    }
    if (firstLoad && !section.hidden && location.hash === '#accounts' && scrollY === 0) section.scrollIntoView({behavior:'instant'});
    firstLoad = false;
  } catch {
    if (controller === current) { section.hidden = true; list.replaceChildren(); }
  } finally {
    clearTimeout(timeout);
    if (controller === current) { list.style.removeProperty('min-height'); list.removeAttribute('aria-busy'); }
  }
}
// Avoid blocking the opening on a sleeping free server.
void refresh();
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
