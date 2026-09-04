const MANWON_PER_EOK = 10_000;
const M2_PER_PYEONG = 3.305785;

function numeric(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function localized(value, maximumFractionDigits = 0) {
  return Number(value).toLocaleString('ko-KR', { maximumFractionDigits });
}

export function formatPriceManwon(amount) {
  const rounded = Math.round(numeric(amount));
  if (rounded <= 0) return '가격 미정';

  const eok = Math.floor(rounded / MANWON_PER_EOK);
  const rest = rounded % MANWON_PER_EOK;
  if (!eok) return `${localized(rest)}만원`;
  return rest ? `${localized(eok)}억 ${localized(rest)}만원` : `${localized(eok)}억원`;
}

export function formatCompactPrice(amount) {
  const rounded = Math.round(numeric(amount));
  if (rounded <= 0) return '가격 미정';
  if (rounded < MANWON_PER_EOK) return `${localized(rounded)}만`;
  return `${localized(rounded / MANWON_PER_EOK, 2)}억`;
}

export function formatAreaPair(areaM2) {
  const area = numeric(areaM2);
  if (area <= 0) return '전용면적 미정';

  const metric = Math.round(area * 10) / 10;
  const pyeong = Math.round((area / M2_PER_PYEONG) * 10) / 10;
  return `전용 ${localized(metric, 1)}㎡ · 약 ${localized(pyeong, 1)}평`;
}
