import { ACCOUNTS_PATH } from '../../../shared/invitation/account-core.mjs';
import { renderAccounts } from './account-view.mjs?v=5.3.0';
const local = ['127.0.0.1','localhost'].includes(location.hostname);
const base = local ? 'http://127.0.0.1:8025' : 'https://sungso-homehunt-api.onrender.com';
const section = document.querySelector('#accounts'), list = document.querySelector('#accounts-list');
let controller;
let firstLoad = true;
async function refresh() {
  controller?.abort();
  const current = new AbortController(); controller = current;
  const timeout = setTimeout(() => current.abort(), 45000);
  // A stale financial destination should not remain visible while refreshing.
  section.hidden = true; list.replaceChildren();
  try {
    const response = await fetch(base + ACCOUNTS_PATH, {cache:'no-store',credentials:'omit',signal:current.signal});
    const data = await response.json();
    if (controller !== current || current.signal.aborted) return;
    if (!response.ok || data.ok !== true || !Array.isArray(data.groups) || data.groups.length > 4) throw Error('unavailable');
    list.innerHTML = renderAccounts(data.groups);
    section.hidden = !list.children.length;
    if (local && list.children.length) {
      const note = document.createElement('p');
      note.className = 'preview-note';
      note.textContent = '로컬 미리보기 · 실제 청첩장과 별도로 저장됩니다.';
      list.prepend(note);
    }
    if (firstLoad && !section.hidden && location.hash === '#accounts' && scrollY === 0) section.scrollIntoView({behavior:'instant'});
    firstLoad = false;
  } catch { /* No cached account data or fabricated fallback numbers. */ }
  finally { clearTimeout(timeout); }
}
// Avoid blocking the opening on a sleeping free server.
void refresh();
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
