import { getMember, registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { ACCOUNTS_PATH } from '../../../shared/invitation/account-core.mjs';
import { mountAccountManager } from './accounts-manage-ui.mjs?v=5.5.0';
const uid = getMember()?.uid, requests = new Set();
let disposed = false;
function current() { return !disposed && uid && getMember()?.uid === uid && getAuth(getApp('homehunt-private-cloud')).currentUser?.uid === uid; }
async function request(path, { method = 'GET', body } = {}) {
  if (!current()) throw Error('승인된 계정으로 다시 로그인해 주세요.');
  const token = await getAuth(getApp('homehunt-private-cloud')).currentUser.getIdToken();
  if (!current()) throw Error('로그인 계정이 바뀌었어요.');
  const controller = new AbortController(); requests.add(controller);
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch('https://sungso-homehunt-api.onrender.com' + ACCOUNTS_PATH + path, {
      method, headers: { Authorization:`Bearer ${token}`, ...(body ? {'Content-Type':'application/json'} : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: controller.signal, cache:'no-store', credentials:'omit',
    });
    const data = await response.json();
    if (!current()) throw Error('로그인 계정이 바뀌었어요.');
    if (!response.ok || data.ok !== true) throw Error(data.error || '계좌 정보를 불러오지 못했어요.');
    return data;
  } catch (error) { if (error.name === 'AbortError') throw Error('연결이 늦어지고 있어요. 입력한 내용은 그대로 두었으니 다시 시도해 주세요.'); throw error; }
  finally { clearTimeout(timeout); requests.delete(controller); }
}
if (!uid) throw Error('Google 로그인이 필요해요.');
const manager = mountAccountManager({ root:document.querySelector('#accounts-manager'), request });
registerPrivateCleanup(() => { disposed = true; requests.forEach(item => item.abort()); requests.clear(); manager.dispose(); });
