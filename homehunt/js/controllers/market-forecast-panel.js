import { formatAreaPair, formatPriceManwon } from '../display-format.mjs?v=2.5.0';

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function definitionList(rows) {
  const list = node('dl', 'forecast-facts');
  for (const [term, description] of rows) list.append(node('dt', '', term), node('dd', '', description));
  return list;
}

function friendlyReason(reason) {
  if (reason.includes('시계열 백테스트 원점')) return '6개월 뒤 가격을 과거 자료로 되짚어 볼 사례가 부족합니다.';
  if (reason.includes('불확실성 구간 표본')) return '예상 범위의 폭을 계산할 과거 사례가 부족합니다.';
  if (reason.includes('백테스트 평균 오차')) return '과거 예상과 실제 가격의 차이가 허용 기준보다 큽니다.';
  if (reason.includes('유효한 월별 표본')) return '같은 면적의 거래가 있었던 달이 부족합니다.';
  if (reason.includes('관측 기간')) return '조회한 거래 이력이 짧습니다.';
  if (reason.includes('전체 거래 표본')) return '같은 면적의 실제 거래 건수가 부족합니다.';
  if (reason.includes('마지막 유효 거래월')) return '최근 가격을 추정하기에는 마지막 거래가 오래됐습니다.';
  return reason;
}

export function renderMarketForecastPanel(root, referenceRoot, {
  forecast, reference = null, trainingRange = null, areaM2 = null,
  contextLabel = '', partial = false, loading = false, onLoadHistory = null, onShowTrend = null,
  setEvidenceValue,
}) {
  root.replaceChildren();
  referenceRoot.replaceChildren();
  referenceRoot.hidden = !reference?.latestCount;
  const amount = (price) => formatPriceManwon(price);
  if (reference?.latestCount) {
    const actualCard = (title, price, description, provisional) => {
      const card = node('article', 'forecast-observed-card');
      const value = node('strong', 'forecast-observed-price');
      setEvidenceValue(value, price, provisional ? 'estimated' : 'verified', {
        format: 'price', sourceKind: 'molit-trade', derivation: 'arithmetic-mean',
        freshness: provisional ? 'provisional' : 'fresh', decisionStatus: provisional ? 'provisional' : 'observed',
      });
      card.append(node('small', '', title), value, node('p', '', description));
      return card;
    };
    referenceRoot.append(actualCard('최근 거래월 실제 평균', reference.latestAverageManWon,
      `${reference.latestMonth} · ${reference.latestCount}건${reference.staleMonths > 2 ? ` · ${reference.staleMonths}개월 전 거래` : ''}${reference.provisional ? ' · 신고 진행 중' : ''}${partial ? ' · 받은 자료 기준' : ''}`,
      partial || reference.provisional || reference.staleMonths > 2));
    if (reference.recentCount) {
      const card = actualCard('최근 3개월 실제 평균', reference.recentAverageManWon,
        `${reference.recentStartMonth}–${reference.recentEndMonth} · ${reference.recentCount}건${partial ? ' · 받은 자료 기준' : ''} · 신고 진행 중`, true);
      card.append(node('p', '', `실제 거래 범위 ${amount(reference.recentMinManWon)}–${amount(reference.recentMaxManWon)}`));
      referenceRoot.append(card);
    } else {
      const card = node('article', 'forecast-observed-card');
      card.append(node('small', '', '최근 3개월 실제 거래'), node('strong', '', '확인된 거래 없음'),
        node('p', '', `${reference.recentStartMonth}–${reference.recentEndMonth}${partial ? ' · 받은 자료 기준' : ''}. 위 금액은 마지막으로 확인된 과거 거래입니다.`));
      referenceRoot.append(card);
    }
  }

  root.className = `forecast-explain ${forecast.eligible ? 'hh-forecast-ready' : 'hh-forecast-hold'}`;
  const exactArea = Number(areaM2);
  const hasArea = Number.isFinite(exactArea) && exactArea > 0;
  const price = (value) => hasArea ? amount(value * exactArea / 3.3) : `평당 ${amount(value)}`;
  const baseline = forecast.modelKind === 'last-observation-carried-forward';
  const sourceNote = trainingRange
    ? `전망 자료 ${trainingRange.rangeStart}–${trainingRange.rangeEnd} · 같은 ${formatAreaPair(exactArea)}. 차트 조회기간과 별도로, 이미 받은 최대 5년 이력을 사용합니다.`
    : contextLabel;

  if (forecast.eligible) {
    const last = forecast.points.at(-1);
    root.append(node('span', 'forecast-method', baseline ? '가격 유지 가정' : '완만한 추세 반영'));
    root.append(node('strong', 'forecast-estimate-title', `${last.month} 예상 ${hasArea ? '평균 총가격' : '평균 평당가격'}`));
    const value = node('div', 'forecast-number');
    setEvidenceValue(value, hasArea ? last.point * exactArea / 3.3 : last.point, 'estimated', {
      format: hasArea ? 'price' : (number) => `평당 ${amount(number)}`,
      sourceKind: 'molit-trade', derivation: baseline ? 'last-price-forecast' : 'damped-trend-forecast',
      freshness: 'reference', decisionStatus: 'reference-only', observedAt: last.month,
    });
    root.append(value, node('p', 'forecast-range', `참고 범위 ${price(last.lower)}–${price(last.upper)}`));
    root.append(node('p', '', baseline
      ? `${forecast.trainingEndMonth}의 평균가격 ${price(forecast.baselinePriceP33)}을 유지하는 가정입니다. 과거 비교에서 추세를 연장하는 방식의 개선이 충분하지 않아 이 기준을 선택했습니다. 상승·하락이 없다는 확정 판단은 아닙니다.`
      : '최근 거래의 추세를 반영하되, 먼 시점으로 갈수록 변화의 폭을 줄였습니다. 과거 비교에서 가격 유지 방식보다 오차를 줄인 경우에만 선택합니다.'));
    root.append(node('p', 'forecast-training-note', `${forecast.trainingEndMonth}까지 학습한 마지막 거래월부터 ${forecast.backtestHorizonMonths}개월 뒤의 전망입니다. 오늘부터 ${forecast.backtestHorizonMonths}개월 뒤를 의미하지 않습니다.`));
  } else {
    root.append(node('strong', 'forecast-estimate-title', loading ? '긴 기간의 자료를 확인하고 있어요' : '미래 전망은 아직 계산하기 어려워요'));
    root.append(node('p', '', reference?.latestCount
      ? '위의 실제 거래가격은 확인할 수 있습니다. 미래 예상가격은 아래 조건이 갖춰지면 계산합니다.'
      : '선택한 단지·면적의 실제 거래부터 확인해야 합니다.'));
    const reasons = node('ul', 'forecast-hold-reasons');
    for (const reason of [...new Set((forecast.reasons || []).map(friendlyReason))]) reasons.append(node('li', '', reason));
    root.append(reasons);
    root.append(definitionList([
      ['계산 가능한 거래월', `${forecast.observations || 0}개월 · ${Number(forecast.transactionCount || 0).toLocaleString('ko-KR')}건`],
      ['6개월 뒤 가격 비교', `${forecast.backtestSamples || 0}회 / 필요 ${forecast.backtestMinSamples || 18}회`],
    ]));
  }
  if (sourceNote) root.append(node('p', 'forecast-training-note', sourceNote));
  const actions = node('div', 'forecast-actions');
  if (onLoadHistory && (partial || (trainingRange && trainingRange.months < 60))) {
    const button = node('button', 'record-btn', partial ? '누락된 자료 다시 확인' : '5년 자료로 전망 확인');
    button.type = 'button';
    button.disabled = loading;
    button.addEventListener('click', onLoadHistory);
    actions.append(button);
  }
  if (onShowTrend) {
    const button = node('button', 'outline-btn', '실제 가격 흐름 보기');
    button.type = 'button';
    button.addEventListener('click', onShowTrend);
    actions.append(button);
  }
  root.append(actions);
  if (forecast.eligible) {
    const details = node('details', 'forecast-validation');
    details.append(node('summary', '', '계산 방법과 과거 오차 보기'));
    details.append(definitionList([
      ['선택 방식의 과거 평균 오차', `${forecast.backtestMapePct.toFixed(1)}% · ${forecast.backtestSamples}회 비교`],
      ['학습 거래', `${forecast.observations}개월 · ${forecast.transactionCount.toLocaleString('ko-KR')}건`],
      ['신고 진행 월 제외', `최근 ${forecast.incompleteMonths}개월`],
      ['범위 산정', '과거 예상 오차의 약 80%를 포함하도록 산정'],
    ]));
    details.append(node('p', '', '방식 선택과 범위 산정에 같은 과거 비교 자료를 사용했습니다. 별도의 미래 검증 적중률이나 80% 확률을 보장하는 범위가 아닙니다.'));
    root.append(details);
  }
}
