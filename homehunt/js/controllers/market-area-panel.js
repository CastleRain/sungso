import { formatAreaPair, formatPriceManwon } from '../display-format.mjs?v=2.5.0';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderMarketAreaPanel(root, rows, context, onSelect) {
  root.hidden = !context || !rows.length;
  if (root.hidden) {
    root.querySelector('.market-area-grid').replaceChildren();
    return;
  }
  const count = rows.reduce((sum, row) => sum + row.count, 0);
  root.querySelector('#marketAreaOverviewMeta').textContent = `${context.rangeStart}–${context.rangeEnd} · ${context.dealType} ${count.toLocaleString('ko-KR')}건 · ${rows.length}개 면적${context.partial ? ' · 일부 자료 미수신' : ''}`;
  root.querySelector('#marketAreaOverviewBasis').textContent = `${context.source} · 선택 기간의 계약금액을 거래건수 기준으로 평균냈습니다. 면적을 누르면 가격 흐름과 최근 계약을 자세히 볼 수 있어요.`;
  root.querySelector('.market-area-grid').replaceChildren(...rows.map((row) => {
    const selected = Math.abs(row.areaM2 - context.area) < .05;
    const button = element('button', `market-area-option${selected ? ' is-selected' : ''}`);
    button.type = 'button';
    button.dataset.marketArea = row.areaKey;
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-controls', 'marketPanelTrend');
    button.setAttribute('aria-label', `${formatAreaPair(row.areaM2)} · 기간 평균 ${formatPriceManwon(row.averageManWon)} · ${row.count}건 · 가격 상세 보기`);
    const head = element('span', 'market-area-option-head');
    head.append(element('strong', '', formatAreaPair(row.areaM2)), element('span', 'market-area-count', `${row.count.toLocaleString('ko-KR')}건`));
    const price = element('span', 'market-area-price');
    price.append(element('small', '', '선택기간 평균'), element('strong', '', formatPriceManwon(row.averageManWon)));
    const recent = element('span', 'market-area-recent');
    recent.append(element('small', '', `최근월 평균 · ${row.latestMonth} · ${row.latestMonthCount}건`), element('span', '', formatPriceManwon(row.latestMonthAverageManWon)));
    const foot = element('span', 'market-area-option-foot');
    foot.append(element('small', '', row.latestContractDate ? `마지막 계약 ${row.latestContractDate}` : '계약일 미확인'), element('span', '', selected ? '선택됨 · 상세 보기 →' : '상세 보기 →'));
    button.append(head, price, recent, foot);
    button.addEventListener('click', () => onSelect(row.areaKey));
    return button;
  }));
}
