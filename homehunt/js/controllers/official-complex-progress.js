const integer = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const count = value => value.toLocaleString('ko-KR');
const el = (tag, className = '', text) => {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const REASONS = {
  ACCESS_DENIED: '활용승인·인증키 연결을 확인한 뒤 미완료 항목을 다시 확인해주세요.',
  MISSING_CREDENTIAL: '공공데이터 인증키를 연결한 뒤 이어서 확인할 수 있어요.',
  QUOTA_EXCEEDED: '공식 단지정보 조회 한도에 도달했습니다. 한도가 복구되면 미완료 항목을 이어서 확인할 수 있어요.',
  NETWORK_ERROR: '공식 단지정보 서버 연결이 원활하지 않아요. 확인된 정보는 유지합니다.',
  LOCAL_SERVER_REQUIRED: '공식 단지정보를 자동 확인하려면 로컬 검색 서버 연결이 필요해요.',
  USER_PAUSED: '자동 확인을 잠시 멈췄어요. 확인된 정보는 계속 볼 수 있어요.',
  CONSECUTIVE_FAILURES: '연속 조회에 실패해 자동 확인을 멈췄어요. 연결 상태를 확인한 뒤 이어 확인할 수 있어요.',
  user: '자동 확인을 잠시 멈췄어요. 확인된 정보는 계속 볼 수 있어요.',
  manual: '자동 확인을 잠시 멈췄어요. 확인된 정보는 계속 볼 수 있어요.',
};

export function officialComplexProgressModel(snapshot = {}) {
  const total = integer(snapshot.total);
  const completed = Math.min(total, integer(snapshot.completed));
  const pending = snapshot.pending == null ? Math.max(0, total - completed) : Math.min(total, integer(snapshot.pending));
  const matched = Math.min(total, integer(snapshot.matched));
  const partial = Math.min(total, integer(snapshot.partial));
  const unmatched = Math.min(total, integer(snapshot.unmatched));
  const failed = Math.min(total, integer(snapshot.failed));
  const paused = snapshot.paused === true;
  const running = Boolean(snapshot.running);
  return { total, completed, pending, matched, partial, unmatched, failed, paused, running,
    title: paused ? '주차·시설 자동 확인 일시정지' : running ? '주차·시설 자동 확인 중' : pending ? '주차·시설 자동 확인 대기' : '주차·시설 자동 확인 결과',
    progressLabel: `${count(completed)} / ${count(total)}곳 조회`,
    countsLabel: `정보 확인 ${count(matched)}곳 · 일부 확인 ${count(partial)}곳 · 단지 대조 미확인 ${count(unmatched)}곳 · 조회 실패 ${count(failed)}곳 · 대기 ${count(pending)}곳`,
    reason: REASONS[snapshot.reason] || (paused ? '자동 확인을 잠시 멈췄어요. 확인된 정보는 계속 볼 수 있어요.' : ''),
    canRetry: !running && partial + failed > 0,
    canPause: running || pending > 0,
    retryCount: partial + failed,
  };
}

/** The caller owns the queue; this component reports houses, never API-call estimates. */
export function createOfficialComplexProgress(root, { onRetry, onPause } = {}) {
  if (!root) return { render() {} };
  root.classList.add('official-complex-progress'); root.setAttribute('aria-label', '공식 주차·시설 자동 확인');
  const heading = el('div', 'official-complex-progress-heading');
  const title = el('strong'), summary = el('span', 'official-complex-progress-count');
  heading.append(title, summary);
  const progress = el('progress'); progress.setAttribute('aria-label', '공식 정보 조회한 단지 비율');
  const counts = el('p', 'official-complex-progress-counts');
  const note = el('p', 'official-complex-progress-note', '저장한 집과 현재 가격 후보를 합쳐 단지별로 한 번씩 확인합니다. 주차·난방·승강기를 차례로 보강하며, 확인 중에도 후보를 열어볼 수 있습니다.');
  const reason = el('p', 'official-complex-progress-reason'); reason.setAttribute('role', 'status');
  const actions = el('div', 'official-complex-progress-actions');
  const pause = el('button'), retry = el('button'); pause.type = retry.type = 'button';
  actions.append(pause, retry); root.replaceChildren(heading, progress, counts, note, reason, actions);
  let snapshot = {}, actionPending = false;
  async function act(callback) {
    if (actionPending || typeof callback !== 'function') return;
    actionPending = true; render(snapshot);
    try { await callback(); }
    catch { reason.hidden = false; reason.textContent = '자동 확인 상태를 변경하지 못했어요. 잠시 후 다시 눌러주세요.'; }
    finally { actionPending = false; pause.disabled = retry.disabled = false; }
  }
  pause.addEventListener('click', () => { const model = officialComplexProgressModel(snapshot); if (model.canPause) void act(() => onPause?.(!model.paused)); });
  retry.addEventListener('click', () => { if (officialComplexProgressModel(snapshot).canRetry) void act(onRetry); });
  function render(next = {}) {
    snapshot = { ...next };
    const model = officialComplexProgressModel(snapshot);
    root.hidden = model.total === 0;
    root.dataset.state = model.paused ? 'paused' : model.running ? 'running' : 'idle';
    title.textContent = model.title; summary.textContent = model.progressLabel;
    progress.max = model.total || 1; progress.value = model.completed;
    progress.setAttribute('aria-valuetext', model.progressLabel);
    counts.textContent = model.countsLabel;
    reason.textContent = model.reason; reason.hidden = !model.reason;
    pause.textContent = model.paused ? '이어 확인' : '일시정지';
    pause.hidden = !model.canPause || typeof onPause !== 'function';
    retry.textContent = `미완료 ${count(model.retryCount)}곳 다시 확인`;
    retry.hidden = !model.canRetry || typeof onRetry !== 'function';
    pause.disabled = retry.disabled = actionPending;
    actions.hidden = pause.hidden && retry.hidden;
  }
  render();
  return { render };
}
