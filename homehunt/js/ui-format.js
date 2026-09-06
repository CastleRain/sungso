/** HomeHunt 3 display and evidence contracts. */

const MANWON_PER_EOK = 10_000;
const M2_PER_PYEONG = 3.305785;

export const EVIDENCE_TIERS = Object.freeze({
  verified: Object.freeze({ label: '확정', icon: '✓' }),
  estimated: Object.freeze({ label: '추정', icon: '∿' }),
  unknown: Object.freeze({ label: '미확인', icon: '?' }),
  personal: Object.freeze({ label: '개인 기록', icon: '★' }),
});

function numeric(value) {
  if (typeof value === 'string' && !value.trim()) return NaN;
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function localized(value, maximumFractionDigits = 0, minimumFractionDigits = 0) {
  return Number(value).toLocaleString('ko-KR', {
    maximumFractionDigits,
    minimumFractionDigits,
  });
}

function safeText(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeClassTokens(value) {
  return String(value ?? '')
    .split(/\s+/)
    .filter((token) => /^[A-Za-z0-9_-]+$/.test(token))
    .join(' ');
}

function normalizeTier(value) {
  const tier = safeText(value, 'unknown').toLowerCase();
  return Object.prototype.hasOwnProperty.call(EVIDENCE_TIERS, tier) ? tier : 'unknown';
}

function normalizeObservedAt(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const normalized = safeText(value);
  return normalized || null;
}

export function formatPrice(amountManWon) {
  const amount = Math.round(numeric(amountManWon));
  if (!Number.isFinite(amount) || amount <= 0) return '가격 미정';

  const eok = Math.floor(amount / MANWON_PER_EOK);
  const rest = amount % MANWON_PER_EOK;
  if (!eok) return `${localized(rest)}만원`;
  return rest
    ? `${localized(eok)}억 ${localized(rest)}만원`
    : `${localized(eok)}억원`;
}

export const formatPriceManwon = formatPrice;

export function formatArea(areaM2) {
  const area = numeric(areaM2);
  if (!Number.isFinite(area) || area <= 0) return '전용면적 미정';

  const metric = Math.round(area * 10) / 10;
  const pyeong = Math.round((area / M2_PER_PYEONG) * 10) / 10;
  return `전용 ${localized(metric, 1)}㎡ · 약 ${localized(pyeong, 1)}평`;
}

export const formatAreaPair = formatArea;

/**
 * Keep evidence axes independent: where a value came from, how it was
 * derived, how fresh it is, and whether it can drive a decision are not
 * interchangeable with the visual evidence tier.
 */
export function createEvidenceViewModel(valueOrConfig, config = {}) {
  const objectForm = arguments.length === 1
    && valueOrConfig
    && typeof valueOrConfig === 'object'
    && !Array.isArray(valueOrConfig)
    && Object.prototype.hasOwnProperty.call(valueOrConfig, 'value');
  const input = objectForm ? valueOrConfig : { ...config, value: valueOrConfig };
  const tier = normalizeTier(input.tier);
  const isUnknown = tier === 'unknown';

  return Object.freeze({
    value: isUnknown ? null : input.value,
    tier,
    sourceKind: safeText(input.sourceKind, 'unknown'),
    derivation: safeText(input.derivation, 'none'),
    freshness: safeText(input.freshness, 'unknown'),
    decisionStatus: safeText(input.decisionStatus, 'unknown'),
    observedAt: normalizeObservedAt(input.observedAt),
    reason: safeText(input.reason, isUnknown ? '값을 확인할 수 없어요' : ''),
  });
}

export const buildEvidenceViewModel = createEvidenceViewModel;

function isEvidenceViewModel(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.prototype.hasOwnProperty.call(value, 'tier')
    && Object.prototype.hasOwnProperty.call(value, 'sourceKind')
    && Object.prototype.hasOwnProperty.call(value, 'derivation')
    && Object.prototype.hasOwnProperty.call(value, 'freshness')
    && Object.prototype.hasOwnProperty.call(value, 'decisionStatus'),
  );
}

function valueFormatter(format) {
  if (typeof format === 'function') return format;
  switch (format) {
    case 'price': return formatPrice;
    case 'area': return formatArea;
    case 'number':
      return (value, options) => {
        const parsed = numeric(value);
        if (!Number.isFinite(parsed)) return '값 미정';
        return localized(
          parsed,
          Number.isInteger(options.maximumFractionDigits) ? options.maximumFractionDigits : 1,
          Number.isInteger(options.minimumFractionDigits) ? options.minimumFractionDigits : 0,
        );
      };
    case 'text':
    default: return (value) => safeText(value, '값 미정');
  }
}

function forceEstimatedPrefix(value, requestedPrefix) {
  const prefix = requestedPrefix === '약' ? '약' : '예상';
  const text = safeText(value, '값 미정');
  return /^(예상|약)(?:\s|$)/.test(text) ? text : `${prefix} ${text}`;
}

function normalizeRenderArguments(value, tierOrOptions, maybeOptions) {
  if (isEvidenceViewModel(value)) {
    return {
      model: createEvidenceViewModel(value),
      options: tierOrOptions && typeof tierOrOptions === 'object' ? tierOrOptions : {},
    };
  }

  if (typeof tierOrOptions === 'string') {
    const options = maybeOptions && typeof maybeOptions === 'object' ? maybeOptions : {};
    return {
      model: createEvidenceViewModel(value, { ...options, tier: tierOrOptions }),
      options,
    };
  }

  const options = tierOrOptions && typeof tierOrOptions === 'object' ? tierOrOptions : {};
  return { model: createEvidenceViewModel(value, options), options };
}

function displayText(model, options) {
  if (model.tier === 'unknown') return safeText(options.reason, model.reason);

  let formatted;
  try {
    formatted = valueFormatter(options.format)(model.value, options);
  } catch (_) {
    formatted = '값 미정';
  }
  const text = safeText(formatted, '값 미정');
  return model.tier === 'estimated'
    ? forceEstimatedPrefix(text, options.estimatedPrefix)
    : text;
}

/**
 * Render an evidence value as escaped HTML (default) or plain text.
 *
 * Supported forms:
 *   renderValue(11000, 'verified', { format:'price' })
 *   renderValue(evidenceViewModel, { format:'price', output:'text' })
 */
export function renderValue(value, tierOrOptions = {}, maybeOptions = {}) {
  const { model, options } = normalizeRenderArguments(value, tierOrOptions, maybeOptions);
  const tier = model.tier;
  const tierMeta = EVIDENCE_TIERS[tier];
  const text = displayText(model, options);
  const plain = `${tierMeta.icon} ${tierMeta.label} · ${text}`;
  if (options.output === 'text' || options.as === 'text') return plain;

  const extraClass = safeClassTokens(options.className);
  const className = `hh-value hh-value--${tier}${extraClass ? ` ${extraClass}` : ''}`;
  const attrs = [
    `class="${className}"`,
    `data-tier="${tier}"`,
    `data-source-kind="${escapeHTML(model.sourceKind)}"`,
    `data-derivation="${escapeHTML(model.derivation)}"`,
    `data-freshness="${escapeHTML(model.freshness)}"`,
    `data-decision-status="${escapeHTML(model.decisionStatus)}"`,
  ];
  if (model.observedAt) attrs.push(`data-observed-at="${escapeHTML(model.observedAt)}"`);

  const badge = `<span class="hh-value__badge" aria-label="증거 등급: ${escapeHTML(tierMeta.label)}"><span aria-hidden="true">${tierMeta.icon}</span>${escapeHTML(tierMeta.label)}</span>`;
  const renderedValue = `<span class="hh-value__text">${escapeHTML(text)}</span>`;
  const meta = options.meta
    ? `<span class="hh-value__meta">${escapeHTML(options.meta)}</span>`
    : '';
  return `<span ${attrs.join(' ')}>${badge}${renderedValue}${meta}</span>`;
}

export function renderValueText(value, tierOrOptions = {}, maybeOptions = {}) {
  if (typeof tierOrOptions === 'string') {
    return renderValue(value, tierOrOptions, { ...maybeOptions, output: 'text' });
  }
  return renderValue(value, { ...(tierOrOptions || {}), output: 'text' });
}
