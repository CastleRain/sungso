import { normalizeParkingEvidence } from '../parking-evidence-core.mjs';
import { destinationLetter } from '../personalized-context-core.mjs';

const el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls || ''; if (text != null) n.textContent = text; return n; };
const metric = (value, unit) => Number.isFinite(value) ? `${Math.round(value * 10) / 10}${unit}` : '미확인';
const PARKING_KEY = 'homehunt_parking_observations_v1';
const candidateKey = c => String(c.catalogId || c.id || c.aptSeq || '');
const GATE_LABELS = {
  'required-destination-over-limit-or-no-route': '필수 목적지의 허용시간 초과 또는 경로 없음',
  'destination-no-route': '방문할 목적지의 실제 경로 없음',
  'price-over-ceiling': '목표가격 초과 허용범위를 넘음',
  'no-parking': '주차 불가로 확인됨',
  'destination-required': '기준 목적지 좌표 확인 필요',
  'positive-destination-weight-required': '목적지 비중을 하나 이상 0보다 크게 입력해주세요',
  'route-evidence-incomplete': '실제 경로·시간·환승·보행 정보를 확인해야 합니다',
  'price-evidence-incomplete': '목표가격 또는 같은 면적의 실거래 근거 확인 필요',
};

export function parkingForCandidate(candidate) {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(PARKING_KEY) || '{}')[candidateKey(candidate)]; } catch (_) { /* Local storage can be unavailable. */ }
  return normalizeParkingEvidence(saved || candidate.parkingEvidence || {}, { households: candidate.households });
}

export function createParkingEditor(candidate, onChange) {
  const evidence = parkingForCandidate(candidate);
  const root = el('details', 'parking-evidence-editor');
  const known = Number.isFinite(evidence.spacesPerHousehold);
  const ratioLabel = known ? Number(evidence.spacesPerHousehold.toFixed(2)).toLocaleString('ko-KR') : '';
  root.append(el('summary', '', known
    ? `주차 세대당 ${ratioLabel}대 · ${evidence.sourceType === 'official' ? '공식 자료' : '사용자 확인'} · 수정`
    : '주차 정보 미확인 · 확인한 값 입력'));
  const form = el('form');
  const label = el('label', '', '세대당 주차대수');
  const input = el('input'); input.type = 'number'; input.min = '0'; input.step = '0.01'; input.inputMode = 'decimal';
  input.value = known ? String(Number(evidence.spacesPerHousehold.toFixed(2))) : ''; input.placeholder = '예: 1.2 · 주차 불가는 0';
  label.append(input);
  const dateLabel = el('label', '', '확인일'); const date = el('input'); date.type = 'text'; date.placeholder = 'YYYY-MM-DD';
  date.value = String(evidence.observedAt || '').slice(0, 10); dateLabel.append(date);
  const status = el('small'); status.setAttribute('role', 'status');
  const save = el('button', '', '이 기기에 저장'); save.type = 'submit';
  const reset = el('button', '', '사용자 확인값 지우기'); reset.type = 'button';
  const persist = value => {
    const key = candidateKey(candidate); if (!key) throw new Error('단지 식별 정보를 확인해주세요.');
    let records = {}; try { records = JSON.parse(localStorage.getItem(PARKING_KEY) || '{}'); } catch (_) { /* Recover a damaged record. */ }
    if (!records || typeof records !== 'object' || Array.isArray(records)) records = {};
    if (value) records[key] = value; else delete records[key];
    localStorage.setItem(PARKING_KEY, JSON.stringify(records)); onChange();
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    const ratio = Number(input.value);
    if (!input.value.trim() || !Number.isFinite(ratio) || ratio < 0) { status.textContent = '확인한 주차대수를 0 이상의 숫자로 입력해주세요.'; return; }
    const stamp = date.value.trim(); const parsed = new Date(`${stamp}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== stamp || parsed > new Date()) {
      status.textContent = '실제로 확인한 날짜를 YYYY-MM-DD 형식으로 입력해주세요.'; return;
    }
    try { persist({ sourceType: 'field', spacesPerHousehold: ratio, observedAt: stamp, sourceName: '사용자 확인' }); }
    catch (_) { status.textContent = '이 브라우저에 저장하지 못했습니다. 저장 공간 설정을 확인해주세요.'; }
  });
  reset.addEventListener('click', () => { try { persist(null); } catch (_) { status.textContent = '확인값을 지우지 못했습니다.'; } });
  form.append(label, dateLabel, el('small', '', '단지 상세에서 공식 주차정보를 확인할 수 있어요. 직접 입력한 확인값은 이 기기에 저장하고 공식 자료보다 우선 사용합니다. 확인값을 지우면 공식 자료로 돌아갑니다.'), save, reset, status);
  root.append(form); return root;
}

export function createPersonalizedScoreCard(candidate, { detailed = false } = {}) {
  const r = candidate.personalizedRecommendation;
  const root = el('section', 'personalized-score-card');
  if (!r) { root.append(el('small', '', '우리 기준 추천 계산 준비 중')); return root; }
  root.dataset.decision = r.decision;
  const head = el('div', 'personalized-score-head');
  const hasTotal = Number.isFinite(r.score);
  head.append(el('strong', '', r.decision === 'excluded' ? '우리 조건에서 제외'
    : hasTotal ? `우리 기준 추천 ${Math.round(r.score)}점` : '추천 총점 보류'));
  if (!hasTotal && Number.isFinite(r.referenceScore)) {
    const hasReferenceEvidence = Object.entries(r.dimensions || {}).some(([key, d]) => key !== 'commute'
      && d.status !== 'unknown' && Number.isFinite(d.score));
    head.append(el('small', '', hasReferenceEvidence
      ? `통근 미반영 · 생활·예산 참고 ${r.referenceScore.toFixed(1)} / ${r.referenceMaxScore ?? 45}점`
      : '통근 미반영 · 생활·예산 근거 확인 전'));
  }
  root.append(head);
  const b = r.commuteBalance;
  if (Number.isFinite(b?.weightedMeanMinutes)) root.append(el('p', '', `비중 반영 평균 ${metric(b.weightedMeanMinutes, '분')} · 환승·도보·버스 부담 반영 ${metric(r.weightedCostMinutes ?? b.weightedMeanCostMinutes, '분 상당')}`));
  if (r.gateReasons?.length) root.append(el('p', '', r.gateReasons.map(code => GATE_LABELS[code] || '근거 확인 필요').join(' · ')));
  const labels = { commute: '회사 통근', station: '역 접근', households: '단지 규모', age: '연식', parking: '주차', budget: '목표가격' };
  const dl = el('dl');
  for (const [key, d] of Object.entries(r.dimensions || {})) {
    const name = el('dt', '', labels[key] || d.label || key);
    if (detailed && d.label) name.append(el('small', '', d.label));
    const unknown = d.status === 'unknown' || !Number.isFinite(d.score);
    const value = el('dd', '', unknown ? '미확인 · 점수 보류' : `${d.score.toFixed(1)} / ${d.maxScore ?? d.weight ?? '—'}점`);
    value.dataset.status = unknown ? 'unknown' : 'known';
    dl.append(name, value);
  }
  root.append(dl);
  if (!detailed && r.dimensions?.budget?.label) root.append(el('p', '', r.dimensions.budget.label));
  if (detailed) (b?.evaluations || []).forEach((row, index) => {
    const d = row.destination; const line = el('div', 'personalized-route-row');
    const timeCondition = d?.required === false
      ? `${metric(d?.maxMinutes, '분')} 목표 · 초과는 점수에만 반영`
      : `${metric(d?.maxMinutes, '분')} 제한 · 초과 시 제외`;
    line.append(el('strong', '', `${destinationLetter(index)} ${d?.label || '목적지'} · ${Number(d?.normalizedWeightPercent || 0).toFixed(1)}%`),
      el('p', '', `${metric(row.durationMinutes, '분')} / ${timeCondition} · 환승 ${metric(row.transferCount, '회')} · 도보 ${metric(row.walkingMinutes, '분')}`));
    const route = row.best;
    line.append(el('small', '', `지하철 ${metric(route?.subwayMinutes, '분')} · 버스 ${metric(route?.busMinutes, '분')}${route?.transitComposition && route.transitComposition !== 'unknown' ? ` · ${{ subway: '지하철 위주', bus: '버스 위주', mixed: '버스·지하철 혼합' }[route.transitComposition] || ''}` : ''}`));
    root.append(line);
  });
  if (detailed && r.unknowns?.length) root.append(el('p', '', `확인 필요: ${r.unknowns.join(' · ')}`));
  if (detailed) root.append(el('small', '', '실제 경로의 부담은 회사 비중대로 반영합니다. 시간 초과로 제외하는 것은 제한을 설정한 회사뿐입니다.'));
  return root;
}
