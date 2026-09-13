const el = (tag, className = '', text) => {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const count = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('ko-KR') : '미확인';
const REASONS = {
  STOPPED: '자동 확인을 중지했습니다. 확인한 결과는 그대로 볼 수 있어요.',
  COMPLETED: '이번에 확인할 수 있는 후보를 모두 처리했습니다.',
  BUDGET_LIMIT: '정한 호출 한도에 도달했거나 다음 집을 확인할 예산이 부족해 멈췄어요.',
  DAILY_LIMIT: '다음 집을 확인할 일일 잔여 한도가 부족해 멈췄어요.',
  CONTEXT_CHANGED: '검색 조건이나 통근 기준이 바뀌어 자동 확인을 멈췄어요.',
  BUSY: '다른 검색이나 통근 확인이 진행 중이어서 멈췄어요.',
  ERROR: '조회 오류가 있어 자동 확인을 멈췄어요. 확인된 결과는 유지합니다.',
  UNKNOWN_RECEIPT: '추가 호출 사용량을 확인하지 못해 자동 확인을 멈췄어요.',
  QUOTA_UNKNOWN: '일일 잔여 한도를 확인하지 못해 자동 확인을 시작하지 않았어요.',
  NO_PROGRESS: '새 경로를 확인하지 못해 반복 조회를 멈췄어요.',
  INVALID_CONTEXT: '통근 목적지와 조회 공급자 설정을 확인해주세요.',
  UNSUPPORTED_MODE: '자동 확인은 대중교통 목적지가 있을 때 사용할 수 있어요. 자동차 통근은 후보별로 확인해주세요.',
  INVALID_BUDGET: '이번 자동 확인의 호출 한도를 다시 선택해주세요.',
  BUDGET_EXCEEDED: '조회 사용량이 예상 상한을 넘어 추가 확인을 중지했어요.',
};

/** Only explicit button presses start a run; no preferences or consent are persisted. */
export function createCommuteAutoControl(root, { runner } = {}) {
  if (!root) return { render() {} };
  root.classList.add('commute-auto-control'); root.setAttribute('aria-label', '통근 자동 확인');
  const heading = el('div', 'commute-auto-heading');
  const title = el('strong', '', '유력 후보 통근 자동 확인');
  const stateLabel = el('span', 'commute-auto-state'); heading.append(title, stateLabel);
  const note = el('p', 'commute-auto-note', '이번에 정한 호출 한도 안에서 유력 후보를 차례로 확인합니다. 중지하면 현재 집의 회사 경로 확인까지만 마치고 다음 집부터 멈춥니다.');
  const form = el('div', 'commute-auto-actions');
  const label = el('label', '', '이번 호출 한도');
  const budget = el('select'); budget.setAttribute('aria-label', '자동 통근 신규 호출 한도');
  for (const value of [30, 100, 200]) { const option = el('option', '', `최대 ${value}회`); option.value = String(value); budget.append(option); }
  budget.value = '100'; label.append(budget);
  const start = el('button', 'commute-auto-start', '자동 확인 시작'); start.type = 'button';
  const stop = el('button', 'commute-auto-stop', '중지'); stop.type = 'button';
  form.append(label, start, stop);
  const counters = el('p', 'commute-auto-counters');
  const reason = el('p', 'commute-auto-reason'); reason.setAttribute('role', 'status');
  const hint = el('small', 'commute-auto-hint', '기본 최대 100회 · 실제 신규 호출만 차감 · 일일 잔여 한도도 함께 적용');
  root.replaceChildren(heading, note, form, counters, reason, hint);
  let snapshot = {};
  start.addEventListener('click', () => {
    if (snapshot.running || !runner?.start) return;
    render(runner.start({ maxCalls: Number(budget.value) }));
  });
  stop.addEventListener('click', () => {
    if (!snapshot.running || !runner?.stop) return;
    render(runner.stop());
  });
  function render(next = runner?.snapshot?.() || {}) {
    snapshot = { ...next };
    const running = snapshot.running === true;
    root.dataset.state = running ? snapshot.stopping ? 'stopping' : 'running' : snapshot.reason ? 'finished' : 'ready';
    stateLabel.textContent = running ? snapshot.stopping ? '현재 집 확인 후 중지' : '진행 중' : '직접 시작';
    const houseCalls = Number(snapshot.callsPerCandidate);
    note.textContent = `이번에 정한 호출 한도 안에서 유력 후보를 차례로 확인합니다. 중지하면 현재 집의 회사 경로 확인${houseCalls > 0 ? ` (최대 ${count(houseCalls)}회)` : ''}까지만 마치고 다음 집부터 멈춥니다.`;
    budget.disabled = running; start.disabled = running || !runner?.start;
    stop.hidden = !running; stop.disabled = snapshot.stopping === true;
    const provider = snapshot.provider === 'kakao' ? 'Kakao' : snapshot.provider === 'tmap' ? 'TMAP' : '대중교통';
    const usage = snapshot.usageUncertain ? `추가 사용량 미확인 · 확인된 ${count(snapshot.actualCalls)}회`
      : `실제 신규 ${count(snapshot.actualCalls || 0)} / ${count(snapshot.maxCalls || Number(budget.value))}회`;
    counters.textContent = `${provider} ${usage} · 집 ${count(snapshot.checked || 0)}곳 확인 시도 · 충족 ${count(snapshot.matched || 0)}곳 · 제외 ${count(snapshot.excluded || 0)}곳 · 미확인 ${count(snapshot.pending || 0)}곳`;
    reason.textContent = REASONS[snapshot.reason] || '';
    reason.hidden = !reason.textContent;
  }
  render();
  return { render };
}
