import { normalizeCloudSnapshot } from './cloud-snapshot-core.mjs?v=4.6.1';
import { cloudSessionErrorMessage } from './cloud-session.js?v=4.13.0';

export function mountCloudPanel({ root, session, captureSnapshot, applySnapshot, onAuthChange = () => {} }) {
  if (!root || !session) throw new TypeError('Cloud panel root and session are required.');
  const doc = root.ownerDocument;
  const element = (tag, className, label) => {
    const node = doc.createElement(tag); node.className = className;
    if (label != null) node.textContent = label;
    return node;
  };
  root.classList.add('cloud-panel');
  const heading = element('h3', '', '내 기록 클라우드 저장');
  const intro = element('p', 'cloud-panel-description', '회사 비중·가격 조건, 방문·관심·직접 확인한 주차값을 저장하고 다른 기기에서 불러옵니다.');
  const account = element('p', 'cloud-panel-account');
  const apiStatus = element('p', 'cloud-panel-note');
  apiStatus.setAttribute('role', 'status'); apiStatus.setAttribute('aria-live', 'polite');
  const actions = element('div', 'cloud-panel-actions');
  const button = (label, action) => { const node = element('button', '', label); node.type = 'button'; node.dataset.cloudAction = action; return node; };
  const login = button('Google 로그인', 'login');
  const logout = button('로그아웃', 'logout');
  const save = button('이 기기 기록을 클라우드에 저장', 'save');
  const load = button('클라우드 기록으로 이 기기 복원', 'load');
  actions.append(login, logout, save, load);
  const replacement = element('section', 'cloud-panel-replacement');
  replacement.hidden = true;
  replacement.setAttribute('aria-label', '기존 클라우드 기록 교체 확인');
  const replacementSummary = element('p', 'cloud-panel-replacement-summary');
  const replacementActions = element('div', 'cloud-panel-actions');
  const replace = button('이 기기 기록으로 클라우드 교체', 'replace');
  const cancelReplace = button('취소', 'cancel-replace');
  replacementActions.append(replace, cancelReplace);
  replacement.append(replacementSummary, replacementActions);
  const status = element('p', 'cloud-panel-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const detail = element('p', 'cloud-panel-note', '로그인만으로 기록을 바꾸지 않습니다. 불러오면 이 기기의 해당 기록을 교체합니다. 통근 경로·추천 점수는 저장하지 않습니다. 주소로 선택한 위치는 다시 확인합니다.');
  root.replaceChildren(heading, intro, account, apiStatus, actions, replacement, status, detail);
  let state = session.getState(); let busy = false; let revision = null; let owner = state.user?.uid || null; let epoch = 0;
  let replacementRevision = null;
  const render = () => {
    const signedIn = state.status === 'signed-in' && state.user;
    login.hidden = Boolean(signedIn); logout.hidden = !signedIn;
    login.disabled = !state.configured || busy || state.status === 'loading';
    logout.disabled = busy;
    save.disabled = load.disabled = !signedIn || busy;
    replace.disabled = cancelReplace.disabled = !signedIn || busy || replacementRevision === null;
    replacement.hidden = replacementRevision === null;
    root.setAttribute('aria-busy', String(busy));
    apiStatus.hidden = !signedIn || !['waking', 'unavailable'].includes(state.apiStatus);
    apiStatus.textContent = state.apiStatus === 'waking'
      ? '검색 서버를 깨우고 있어요. 오랜만에 접속하면 약 1분 걸릴 수 있습니다. 저장한 기록은 바로 볼 수 있어요.'
      : '검색 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요. 저장한 기록은 유지됩니다.';
    account.textContent = !state.configured ? '클라우드 저장 준비 중 · Firebase 연결 설정 필요'
      : signedIn ? `${state.user.displayName || state.user.email || 'Google 계정'} 로그인 · ${state.transport === 'firestore' ? '이 계정 전용 저장' : '가족 공간 저장'}`
        : state.status === 'loading' ? '로그인 상태 확인 중…' : state.error || 'Google 계정으로 로그인한 뒤 저장할 수 있습니다.';
  };
  const showReplacement = (remote, { conflict = false } = {}) => {
    const existing = remote.snapshot === null ? null : normalizeCloudSnapshot(remote.snapshot);
    replacementRevision = remote.revision;
    const timestamp = remote.updatedAt && Number.isFinite(Date.parse(remote.updatedAt))
      ? new Date(remote.updatedAt).toLocaleString('ko-KR') : '저장일 미기록';
    replacementSummary.textContent = existing
      ? `클라우드 버전 ${remote.revision} · ${timestamp} · 방문 ${existing.visits.length}개 · 관심 ${existing.shortlist.length}개 · 회사 ${existing.recommendationFilters.workplaces.length}곳`
      : '현재 클라우드에 저장된 기록이 없습니다.';
    status.textContent = `${conflict ? '다른 기기의 변경을 확인했습니다.' : '기존 클라우드 기록을 확인했습니다.'} 이 기기 기록은 유지했습니다. 현재 기록으로 클라우드를 교체하거나, 클라우드 기록을 불러올 수 있습니다.`;
  };
  const saveCurrentSnapshot = async (snapshot, expectedRevision, current) => {
    let saved;
    try { saved = await session.saveSnapshot(snapshot, expectedRevision); }
    catch (error) {
      if (error?.code !== 'CLOUD_SNAPSHOT_CONFLICT' && error?.status !== 409) throw error;
      if (!current()) return;
      revision = null; replacementRevision = null;
      // Inspect the new version without applying it or retrying a write.
      const latest = await session.loadSnapshot();
      if (current()) showReplacement(latest, { conflict: true });
      return;
    }
    if (!current()) return;
    revision = saved.revision; replacementRevision = null;
    status.textContent = `클라우드 저장 완료 · 버전 ${revision} · ${snapshot.visits.length}개 방문 · ${snapshot.shortlist.length}개 관심 후보`;
  };
  const run = async (message, work) => {
    if (busy) return;
    const operation = epoch; busy = true; status.textContent = message; render();
    try { await work(() => operation === epoch); }
    catch (error) { if (operation === epoch) status.textContent = cloudSessionErrorMessage(error); }
    finally { busy = false; render(); }
  };
  login.addEventListener('click', () => run('Google 로그인 창을 여는 중…', async () => { await session.signIn(); status.textContent = '로그인했습니다. 저장 또는 불러오기를 선택해주세요.'; }));
  logout.addEventListener('click', () => run('로그아웃 중…', async () => { await session.signOut(); status.textContent = '로그아웃했습니다. 이 기기의 기록은 유지됩니다.'; }));
  save.addEventListener('click', () => run('클라우드 기록을 확인하는 중…', async current => {
    const snapshot = normalizeCloudSnapshot(await captureSnapshot());
    if (!current()) return;
    if (revision === null) {
      const remote = await session.loadSnapshot();
      if (!current()) return;
      if (remote.snapshot !== null) { showReplacement(remote); return; }
      revision = remote.revision;
    }
    await saveCurrentSnapshot(snapshot, revision, current);
  }));
  replace.addEventListener('click', () => {
    if (replacementRevision === null) return;
    const expectedRevision = replacementRevision;
    void run('확인한 클라우드 버전에 이 기기 기록을 저장하는 중…', async current => {
      const snapshot = normalizeCloudSnapshot(await captureSnapshot());
      if (current()) await saveCurrentSnapshot(snapshot, expectedRevision, current);
    });
  });
  cancelReplace.addEventListener('click', () => {
    if (busy) return;
    replacementRevision = null;
    status.textContent = '클라우드 교체를 취소했습니다. 이 기기와 클라우드 기록은 그대로 유지됩니다.';
    render();
  });
  load.addEventListener('click', () => run('클라우드 기록을 불러오는 중…', async current => {
    replacementRevision = null;
    const remote = await session.loadSnapshot();
    if (!current()) return;
    if (remote.snapshot === null) { revision = 0; status.textContent = '아직 저장한 클라우드 기록이 없습니다. 이 기기 기록은 유지됩니다.'; return; }
    const snapshot = normalizeCloudSnapshot(remote.snapshot);
    await applySnapshot(snapshot);
    if (!current()) return;
    revision = remote.revision;
    const unresolved = snapshot.recommendationFilters.workplaces.filter(item => item.needsLocationResolution).length;
    status.textContent = `불러오기 완료 · 버전 ${revision}${unresolved ? ` · 회사 ${unresolved}곳의 주소 위치를 다시 확인해주세요.` : ''}`;
  }));
  const unsubscribe = session.subscribe(next => {
    const nextOwner = next.user?.uid || null;
    if (nextOwner !== owner) { owner = nextOwner; revision = null; replacementRevision = null; epoch += 1; status.textContent = ''; }
    state = next; render(); onAuthChange(next);
  });
  void session.init().catch(error => { status.textContent = cloudSessionErrorMessage(error); render(); });
  return { destroy() { epoch += 1; unsubscribe(); root.replaceChildren(); } };
}
