import { KAPT_COMPLEX_SOURCE, matchedOfficialComplexInfo } from '../../providers/official/complex.mjs?v=4.9.0';
import { officialComplexMatchNote } from '../official-complex-match-note.mjs?v=4.11.0';

const el = (tag, className = '', text) => {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const count = value => value !== null && value !== undefined && value !== ''
  && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const numberLabel = (value, unit) => value === null ? '미제공' : `${value.toLocaleString('ko-KR')}${unit}`;
const roundedRatio = value => Number(value.toFixed(2)).toLocaleString('ko-KR');
const dateLabel = value => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '날짜 미확인';
};

/** This model never turns a missing field, failed lookup, or another building into zero. */
export function officialComplexPanelModel(candidate = {}, info = candidate.officialComplexInfo) {
  const matched = matchedOfficialComplexInfo({ ...candidate, officialComplexInfo: info });
  const status = matched ? matched.status
    : ['ambiguous', 'unmatched', 'unavailable'].includes(info?.status) ? info.status : 'unavailable';
  const errors = Array.isArray(info?.errors) ? info.errors : [];
  const denied = errors.some(error => /(?:DENIED|PERMISSION|UNREGISTERED|KEY|AUTH|CREDENTIAL)/i.test(String(error?.code || '')));
  const messages = {
    matched: '공식 단지 정보를 확인했어요',
    partial: '확인된 공식 정보부터 표시해요',
    ambiguous: '같은 단지인지 더 확인해야 해요',
    unmatched: '공식 목록에서 같은 단지를 찾지 못했어요',
    unavailable: denied ? '공공데이터 활용승인·인증키 연결을 확인해주세요' : '공식 단지 정보를 아직 가져오지 못했어요',
  };
  const explanations = {
    matched: '주차대수와 세대수가 모두 확인되면 주차 점수에 반영합니다. 직접 입력한 주차 확인값이 있으면 그 값을 우선합니다.',
    partial: '조회에 성공한 항목은 표시합니다. 미제공·미완료 항목은 0으로 계산하지 않으며, 아래 버튼으로 다시 확인할 수 있어요.',
    ambiguous: '단지명·주소가 확실히 일치하지 않아 다른 단지의 정보를 주차 점수에 넣지 않았어요.',
    unmatched: '현재 공식 목록에 없거나 주소·단지명 대조가 되지 않았어요. 직접 확인한 주차값은 계속 사용할 수 있어요.',
    unavailable: denied ? '활용신청 후 승인 상태가 API에 반영되는 데 시간이 걸릴 수 있어요. 기존 후보와 통근 결과는 유지됩니다.' : '잠시 후 다시 확인해주세요. 기존 후보와 통근 결과는 유지됩니다.',
  };
  if (!matched) return { status, title: info?.matchIssue === 'combined-complex' ? '여러 단지가 통합 등록된 자료입니다' : messages[status],
    explanation: [officialComplexMatchNote(info) || explanations[status], info?.relatedComplex?.name ? `공식 목록 이름: ${info.relatedComplex.name}` : ''].filter(Boolean).join(' '),
    fields: [], matched: false };
  const above = count(matched.parking?.aboveGroundSpaces), below = count(matched.parking?.belowGroundSpaces);
  const total = above !== null && below !== null ? above + below : null;
  const households = count(matched.households);
  const ratio = total !== null && households > 0 ? total / households : null;
  return {
    status, title: messages[status], explanation: explanations[status], matched: true,
    headline: ratio === null ? '세대당 주차 미확인' : `세대당 ${roundedRatio(ratio)}대`,
    parkingTotal: numberLabel(total, '대'), observedAt: matched.observedAt,
    cacheHit: matched.cache?.hit === true,
    welfareFacilities: typeof matched.welfareFacilities === 'string' ? matched.welfareFacilities.trim() : '',
    fields: [
      ['전체 주차', numberLabel(total, '대')], ['지상 / 지하', `${numberLabel(above, '대')} / ${numberLabel(below, '대')}`],
      ['난방', String(matched.heatingType || '미제공')], ['승강기', numberLabel(count(matched.elevatorCount), '대')],
      ['공식 세대수', numberLabel(households, '세대')], ['동수', numberLabel(count(matched.buildingCount), '동')],
      ['최고층', numberLabel(count(matched.highestFloor), '층')], ['사용승인', matched.approvalDate ? dateLabel(matched.approvalDate) : '미제공'],
      ['지상 전기차 충전기', numberLabel(count(matched.groundEvChargers), '기')],
      ['지하 전기차 충전기', numberLabel(count(matched.undergroundEvChargers), '기')],
    ],
  };
}

/** Owns only this panel; detail selection changes invalidate pending UI updates. */
export function createOfficialComplexPanel(candidate, { load, isCurrent = () => true, onLoaded = () => {} } = {}) {
  const root = el('section', 'official-complex-panel'); root.setAttribute('aria-label', '공식 단지 정보');
  let busy = false;
  const source = () => {
    const link = el('a', 'official-complex-source', `${KAPT_COMPLEX_SOURCE.name} ↗`);
    link.href = KAPT_COMPLEX_SOURCE.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    return link;
  };
  const retryButton = () => {
    const button = el('button', 'dw-button', '공식 정보 다시 확인'); button.type = 'button';
    button.addEventListener('click', () => request(true)); return button;
  };
  function render(info) {
    const model = officialComplexPanelModel(candidate, info);
    root.dataset.status = model.status; root.setAttribute('aria-busy', 'false');
    const heading = el('div', 'official-complex-heading');
    heading.append(el('h3', '', '주차·단지 정보'), el('span', 'official-complex-status', model.matched ? '공식 자료' : '확인 필요'));
    const status = el('p', 'official-complex-message', model.title); status.setAttribute('role', 'status');
    root.replaceChildren(heading, status);
    if (model.matched) {
      root.append(el('strong', 'official-complex-parking', model.headline));
      const fields = el('dl', 'official-complex-fields');
      model.fields.forEach(([label, value]) => { const row = el('div'); row.append(el('dt', '', label), el('dd', '', value)); fields.append(row); });
      root.append(fields);
      if (model.welfareFacilities) {
        const facilities = el('details', 'official-complex-facilities');
        facilities.append(el('summary', '', '공용시설 · 목록 보기'), el('p', '', model.welfareFacilities));
        root.append(facilities);
      } else root.append(el('p', 'official-complex-facilities-missing', '공용시설 · 미제공'));
      root.append(el('small', 'official-complex-date', `자료 조회 ${dateLabel(model.observedAt)}${model.cacheHit ? ' · 저장된 공식 자료 재사용' : ''}`));
    }
    root.append(el('p', 'official-complex-note', model.explanation), source());
    if (typeof load === 'function' && candidate.catalogId && model.status !== 'matched') root.append(retryButton());
  }
  async function request(refresh = false) {
    if (busy || !isCurrent()) return;
    busy = true; root.dataset.status = 'loading'; root.setAttribute('aria-busy', 'true');
    const status = el('p', 'official-complex-message', '공식 단지와 주소를 대조하고 있어요.'); status.setAttribute('role', 'status');
    root.replaceChildren(el('h3', '', '주차·단지 정보'), status);
    try {
      const info = await load(candidate, { refresh });
      if (!isCurrent()) return;
      render(info); await onLoaded(info);
    } catch {
      if (isCurrent()) render({ status: 'unavailable' });
    } finally { busy = false; }
  }
  if (!candidate.catalogId) {
    root.append(el('h3', '', '주차·단지 정보'), el('p', 'official-complex-note', '공식 단지 식별정보가 있는 후보에서 주차·난방·승강기를 확인할 수 있어요.'), source());
  } else if (candidate.officialComplexInfo) render(candidate.officialComplexInfo);
  else if (typeof load === 'function') {
    root.append(el('h3', '', '주차·단지 정보'));
    void request();
  } else {
    root.append(el('h3', '', '주차·단지 정보'), el('p', 'official-complex-note', '공식 단지정보 조회 서버 연결이 필요해요. 로컬 검색 서버에서 확인할 수 있어요.'), source());
  }
  return root;
}
