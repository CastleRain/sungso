// Travel edits one existing WeCost expense. The detailed plan is a separate
// document; it must never become a second expense in the wedding ledger.
export const TRAVEL_CATEGORY = '✈️신혼여행';
export const isTravelItem = item => item?.cat === TRAVEL_CATEGORY;

function amount(value, label, { nullable = false, integer = true } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
      || value > Number.MAX_SAFE_INTEGER || (integer && !Number.isSafeInteger(value))) {
    throw new Error(`${label}은 0 이상의 올바른 금액으로 입력해주세요.`);
  }
  return value;
}
function text(value, label, max, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new Error(`${label}을 확인해주세요.`);
  }
  return value;
}
function itemId(value) {
  if (typeof value !== 'string' || !value || value.includes('/') || value.length > 200) {
    throw new Error('연결할 WeCost 신혼여행 비용을 선택해주세요.');
  }
  return value;
}
function validLedger(item) {
  if (!item || !isTravelItem(item)) throw new Error('연결한 신혼여행 비용이 없거나 분류가 바뀌었어요. WeCost를 확인해주세요.');
  itemId(item.id);
  for (const key of ['planned', 'deposit', 'actual']) amount(item[key] ?? 0, 'WeCost 금액');
}

export function normalizeBudgetDraft(draft) {
  if (!draft || !Array.isArray(draft.rows) || draft.rows.length < 1 || draft.rows.length > 50) {
    throw new Error('여행 예산 항목은 1개에서 50개까지 입력해주세요.');
  }
  const ids = new Set();
  const rows = draft.rows.map(row => {
    const id = text(row?.id, '항목 ID', 100, true);
    if (ids.has(id)) throw new Error('예산 항목이 중복됐어요. 다시 확인해주세요.');
    ids.add(id);
    if (!['KRW', 'USD'].includes(row.currency)) throw new Error('통화는 원 또는 달러로 선택해주세요.');
    return {
      id, name: text(row.name, '항목 이름', 100, true),
      amount: amount(row.amount, '항목 금액', { nullable: true, integer: row.currency === 'KRW' }),
      currency: row.currency, note: text(row.note, '항목 메모', 2000),
    };
  });
  const fxRate = amount(draft.fxRate, '달러 환율', { nullable: true, integer: false });
  if (fxRate === 0) throw new Error('달러 환율은 0보다 커야 해요. 모르면 비워주세요.');
  return {
    linkedItemId: itemId(draft.linkedItemId),
    baselineTotal: amount(draft.baselineTotal, '처음 비교 금액'),
    availableCash: amount(draft.availableCash, '남은 여행용 준비금', { nullable: true }),
    fxRate, rows, note: text(draft.note, '여행 예산 메모', 5000),
  };
}

const memoNames = new Map([
  ['아나네아', '몰디브 리조트'], ['디즈니크루즈', '디즈니 크루즈'], ['크루즈', '크루즈'],
  ['비행기', '항공'], ['항공권', '항공'], ['항공', '항공'],
  ['싱가폴숙소', '싱가포르 숙소'], ['싱가포르숙소', '싱가포르 숙소'],
  ['싱가폴여행비', '싱가포르 여행비'], ['싱가포르여행비', '싱가포르 여행비'],
  ['몰디브추가금', '몰디브 추가 비용'],
]);
function memoRows(memo, planned) {
  // Recognise only a complete, familiar "항목+만원" list. Parenthesised
  // possibilities are not part of the current plan, and unknown prose falls back.
  let body = typeof memo === 'string' ? memo : '';
  for (let i = 0; i < 10; i++) body = body.replace(/\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]/g, ' ');
  const labels = [...memoNames.keys()].sort((a, b) => b.length - a.length).join('|');
  const matcher = new RegExp(`(${labels})\\s*([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?)\\s*(?:만원|만)?`, 'g');
  const compact = body.replace(/(?<=[가-힣])\s+(?=[가-힣])/g, '');
  const rows = [];
  const remainder = compact.replace(matcher, (_, name, value) => {
    const won = Math.round(Number(value.replaceAll(',', '')) * 10000);
    rows.push({ id: `memo-${rows.length + 1}`, name: memoNames.get(name), amount: won, currency: 'KRW', note: '' });
    return '';
  });
  if (remainder.replace(/[\s,;+·/]/g, '') || !rows.length || rows.length > 50
      || rows.some(row => !Number.isSafeInteger(row.amount))
      || rows.reduce((sum, row) => sum + row.amount, 0) !== planned) return null;
  return rows;
}

export function deriveBudgetDraft(item, savedPlan = null, fx = null) {
  validLedger(item);
  if (savedPlan?.linkedItemId === item.id) return normalizeBudgetDraft(savedPlan);
  const planned = item.planned ?? 0;
  return normalizeBudgetDraft({
    linkedItemId: item.id, baselineTotal: planned, availableCash: null,
    fxRate: typeof fx?.rate === 'number' && fx.rate > 0 ? fx.rate : null,
    rows: memoRows(item.memo, planned) || [{ id: 'existing-budget', name: '기존 신혼여행 예산', amount: planned, currency: 'KRW', note: '' }],
    note: typeof item.memo === 'string' ? item.memo : '',
  });
}

export function calculateTravelBudget(draft, item) {
  validLedger(item);
  const normalized = normalizeBudgetDraft(draft);
  if (normalized.linkedItemId !== item.id) throw new Error('예산과 WeCost 연결 항목이 달라요. 다시 선택해주세요.');
  let total = 0, missingCount = 0, missingRateCount = 0;
  const rowTotals = normalized.rows.map(row => {
    if (row.amount === null) { missingCount++; return null; }
    if (row.currency === 'USD' && normalized.fxRate === null) { missingRateCount++; return null; }
    const converted = Math.round(row.amount * (row.currency === 'USD' ? normalized.fxRate : 1));
    if (!Number.isSafeInteger(converted)) throw new Error('환산 금액이 너무 커요. 금액과 환율을 확인해주세요.');
    total += converted;
    return converted;
  });
  if (!Number.isSafeInteger(total)) throw new Error('합계가 너무 커요. 금액을 확인해주세요.');
  const paid = (item.deposit ?? 0) + (item.actual ?? 0);
  if (!Number.isSafeInteger(paid)) throw new Error('WeCost 결제 금액을 확인해주세요.');
  const remaining = Math.max(total - paid, 0);
  const registeredTotal = item.planned ?? 0;
  return {
    total, paid, remaining, baselineTotal: normalized.baselineTotal, delta: total - normalized.baselineTotal,
    registeredTotal, unsyncedDelta: total - registeredTotal, mismatch: total !== registeredTotal,
    availableCash: normalized.availableCash,
    additionalNeeded: normalized.availableCash === null ? null : Math.max(remaining - normalized.availableCash, 0),
    missingCount, missingRateCount, incomplete: missingCount > 0 || missingRateCount > 0,
    paymentProgress: total > 0 ? Math.min(paid / total, 1) : (paid > 0 ? 1 : 0), rowTotals,
  };
}

// Firestore Timestamp instances and structured-cloned snapshots compare alike.
// Unknown fields are included so a concurrent change cannot be silently lost.
function canonical(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
export const sameBudgetValue = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function unchanged(actual, expected) {
  if (!sameBudgetValue(actual, expected)) throw new Error('다른 화면에서 금액이나 메모가 바뀌었어요. 최신 내용을 다시 불러온 뒤 저장해주세요.');
}

export function buildBudgetUpdate(rawItem, rawPlan, draft, expected) {
  validLedger(rawItem);
  if (!expected || !Object.hasOwn(expected, 'item') || !Object.hasOwn(expected, 'plan')) {
    throw new Error('편집 전 내용을 다시 불러온 뒤 저장해주세요.');
  }
  unchanged(rawItem, expected.item);
  unchanged(rawPlan ?? null, expected.plan ?? null);
  const plan = normalizeBudgetDraft(draft);
  if (rawPlan?.linkedItemId && rawPlan.linkedItemId !== plan.linkedItemId) {
    throw new Error('여행 예산이 다른 WeCost 비용에 연결돼 있어요. 기존 연결 항목을 선택해주세요.');
  }
  // The comparison basis is captured from the ledger on first explicit save.
  // A client cannot reset it to make subsequent price changes disappear.
  plan.baselineTotal = rawPlan?.linkedItemId === rawItem.id
    ? amount(rawPlan.baselineTotal, '처음 비교 금액') : (rawItem.planned ?? 0);
  const summary = calculateTravelBudget(plan, rawItem);
  if (summary.missingRateCount) throw new Error('달러 금액을 합산하려면 환율을 입력해주세요. 환율 없이 WeCost 금액을 변경할 수 없어요.');
  if (summary.missingCount) throw new Error('모든 항목의 예상 금액을 입력한 뒤 저장해주세요. 미확인 비용을 뺀 합계로 WeCost 금액을 변경할 수 없어요.');
  return { itemPatch: { planned: summary.total, balance: summary.remaining }, plan };
}

export function buildTravelLedgerUpdate(rawItem, fields, expectedItem) {
  validLedger(rawItem);
  if (!expectedItem) throw new Error('편집 전 WeCost 내용을 다시 불러온 뒤 저장해주세요.');
  unchanged(rawItem, expectedItem);
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('저장할 금액을 확인해주세요.');
  const allowed = new Set(['name', 'cat', 'planned', 'deposit', 'actual', 'balance', 'balanceDue', 'memo']);
  if (Object.keys(fields).some(key => !allowed.has(key))) throw new Error('여행 비용에서 변경할 수 없는 항목이 포함됐어요.');
  const patch = { ...fields };
  if (Object.hasOwn(patch, 'name')) patch.name = text(patch.name, '비용 이름', 200, true);
  if (Object.hasOwn(patch, 'cat') && patch.cat !== TRAVEL_CATEGORY) throw new Error('연결한 신혼여행 비용의 분류는 유지해주세요.');
  if (Object.hasOwn(patch, 'memo')) patch.memo = text(patch.memo, '비용 메모', 10000);
  if (Object.hasOwn(patch, 'balanceDue')) {
    const due = new Date(`${patch.balanceDue}T00:00:00Z`);
    if (patch.balanceDue !== '' && patch.balanceDue !== null && (typeof patch.balanceDue !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(patch.balanceDue)
        || !Number.isFinite(due.getTime()) || due.toISOString().slice(0, 10) !== patch.balanceDue)) {
      throw new Error('잔금 날짜를 확인해주세요.');
    }
  }
  for (const key of ['planned', 'deposit', 'actual']) if (Object.hasOwn(patch, key)) patch[key] = amount(patch[key], 'WeCost 금액');
  const next = { ...rawItem, ...patch };
  const paid = (next.deposit ?? 0) + (next.actual ?? 0);
  if (!Number.isSafeInteger(paid)) throw new Error('WeCost 결제 금액을 확인해주세요.');
  patch.balance = Math.max((next.planned ?? 0) - paid, 0);
  return patch;
}

function ledgerAudit(item) {
  if (!item) return null;
  return Object.fromEntries(['id', 'name', 'cat', 'planned', 'deposit', 'actual', 'balance', 'balanceDue', 'memo']
    .filter(key => item[key] !== undefined).map(key => [key, item[key]]));
}
export function buildBudgetAudit(beforeItem, beforePlan, afterItem, afterPlan, actor = '미지정') {
  const snapshot = (item, plan) => ({
    item: ledgerAudit(item), plan: plan ? normalizeBudgetDraft(plan) : null,
    planned: item?.planned ?? 0, paid: (item?.deposit ?? 0) + (item?.actual ?? 0),
    remaining: Math.max((item?.planned ?? 0) - (item?.deposit ?? 0) - (item?.actual ?? 0), 0),
  });
  const before = snapshot(beforeItem, beforePlan);
  const after = snapshot(afterItem, afterPlan);
  if (sameBudgetValue(before, after)) return null;
  return {
    tripId: 'honeymoon_2027', type: sameBudgetValue(before.plan, after.plan) ? 'ledger' : 'budget',
    target: afterItem.id, actor: ['성우', '소희'].includes(actor) ? actor : '미지정', before, after,
    delta: (afterItem.planned ?? 0) - (beforeItem?.planned ?? 0),
  };
}
