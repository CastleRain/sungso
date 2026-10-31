import { normalizeBudgetDraft, calculateTravelBudget, buildBudgetUpdate, sameBudgetValue, isTravelItem } from '../../../shared/finance/travel-budget-core.mjs';

export function amount(value, label = '금액', decimals = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 10 ** decimals)) || Math.abs(value * 10 ** decimals - Math.round(value * 10 ** decimals)) > 0.000001) throw Error(`${label}을 올바르게 입력해주세요.`);
  return value;
}
export function normalizeFunds(value) {
  const cashKrw = amount(value.cashKrw, '원화 잔액');
  const usdBalance = amount(value.usdBalance, '달러 잔액', 2);
  const usdCostKrw = amount(value.usdCostKrw, '남은 달러의 환전 원가');
  if ((usdBalance === 0) !== (usdCostKrw === 0)) throw Error('달러 잔액과 해당 달러의 환전 원가를 함께 입력해주세요.');
  amount(cashKrw + usdCostKrw, '자금 합계');
  return { cashKrw, usdBalance, usdCostKrw };
}
export function fundingSummary(items, funds, plan = null, quote = null) {
  const remaining = items.reduce((sum, i) => {
    const detail = travelBreakdown(i, plan, funds);
    return sum + (detail.rows.length ? detail.rows.reduce((s, row) => s + row.remaining, 0) : Math.max((i.planned || 0) - (i.deposit || 0) - (i.actual || 0), 0));
  }, 0);
  if (!funds || funds.cashKrw === undefined) return { remaining, available: null, needed: null, surplus: null };
  const f = normalizeFunds(funds), rate = typeof quote?.rate === 'number' && Number.isFinite(quote.rate) && quote.rate > 0 ? quote.rate : null;
  if (f.usdBalance && !rate) return { remaining, available: null, needed: null, surplus: null, missingRate: true };
  const available = amount(f.cashKrw + Math.round(f.usdBalance * (rate || 0)), '현재 환산 합계');
  return { remaining, available, needed: Math.max(remaining - available, 0), surplus: Math.max(available - remaining, 0), rate, costRate: f.usdBalance ? f.usdCostKrw / f.usdBalance : null };
}

// Replace the linked parent only in the wedding view. Stable row IDs route edits
// to the existing plan/payment transaction; shared ledger documents stay intact.
export function travelLedgerItems(items, plan, funds) {
  return items.flatMap(item => {
    const detail = travelBreakdown(item, plan, funds);
    if (!detail.rows.length) return [detail.error ? { ...item, travelDetailError: detail.error } : item];
    return detail.rows.map(row => ({
      id: `travel:${JSON.stringify([item.id, row.id])}`, name: row.name, cat: item.cat,
      planned: row.planned, deposit: row.deposit, actual: row.actual, balance: row.remaining,
      balanceDue: item.balanceDue || '', memo: row.note,
      travelParentId: item.id, travelRowId: row.id, currency: row.currency, nativeAmount: row.amount,
    }));
  });
}
export function normalizePayments(plan, payments) {
  if (!Array.isArray(payments) || payments.length !== plan.rows.length) throw Error('각 세부 비용의 지급 내역을 확인해주세요.');
  const ids = new Set();
  return plan.rows.map(row => {
    const payment = payments.find(p => p.id === row.id);
    if (!payment || ids.has(payment.id)) throw Error('세부 비용과 지급 기록이 맞지 않아요.');
    ids.add(payment.id);
    return { id: row.id, deposit: amount(payment.deposit, '계약금'), actual: amount(payment.actual, '계약금 외 지급액') };
  });
}
export function travelBreakdown(item, plan, funds) {
  if (!item || !isTravelItem(item) || plan?.linkedItemId !== item.id) return { rows: [], error: '' };
  try {
    const normalized = normalizeBudgetDraft(plan), summary = calculateTravelBudget(normalized, item);
    if (funds?.travel?.linkedItemId !== item.id) throw Error('세부 예산의 지급액을 나눠 입력해주세요.');
    const payments = normalizePayments(normalized, funds.travel.payments);
    const deposit = payments.reduce((s, p) => s + p.deposit, 0), actual = payments.reduce((s, p) => s + p.actual, 0);
    if (summary.incomplete || summary.mismatch || deposit !== (item.deposit || 0) || actual !== (item.actual || 0)) throw Error('다른 화면에서 예산 또는 지급액이 변경됐어요. 세부 비용을 다시 맞춰주세요.');
    return { rows: normalized.rows.map((row, i) => ({ ...row, ...payments[i], planned: summary.rowTotals[i], paid: payments[i].deposit + payments[i].actual, remaining: Math.max(summary.rowTotals[i] - payments[i].deposit - payments[i].actual, 0) })), error: '' };
  } catch (error) { return { rows: [], error: error.message }; }
}
function unchanged(current, expected) {
  if (!sameBudgetValue(current ?? null, expected ?? null)) throw Error('다른 화면에서 내용이 바뀌었어요. 창을 닫고 최신 내용으로 다시 열어주세요.');
}
function validDate(date, today) {
  const value = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date || date > today) throw Error('실제 납부·환불한 날짜를 입력해주세요.');
}
// One operation produces all related writes. No currency exchange is a payment.
export function buildFundingChange(current, command, expected, today) {
  unchanged(current.funds, expected.funds);
  const funds = { ...(current.funds || {}), schemaVersion: 1, revision: (current.funds?.revision || 0) + 1 };
  let itemPatch = null, plan = null, movement = null;
  if (command.kind === 'balances') Object.assign(funds, normalizeFunds(command.balances));
  else {
    unchanged(current.item, expected.item);
    unchanged(current.plan, expected.plan);
    if (!current.item) throw Error('비용 항목을 다시 선택해주세요.');
    if (command.kind === 'travel') {
      const next = buildBudgetUpdate(current.item, current.plan, command.plan, expected);
      plan = next.plan;
      const payments = normalizePayments(plan, command.payments);
      const deposit = amount(payments.reduce((s, p) => s + p.deposit, 0)), actual = amount(payments.reduce((s, p) => s + p.actual, 0));
      itemPatch = { ...next.itemPatch, deposit, actual, balance: Math.max(next.itemPatch.planned - deposit - actual, 0) };
      if (command.ledgerMemo !== undefined) {
        if (typeof command.ledgerMemo !== 'string' || command.ledgerMemo.length > 5000) throw Error('여행 전체 메모는 5,000자 이내로 입력해주세요.');
        itemPatch.memo = command.ledgerMemo;
      }
      funds.travel = { linkedItemId: current.item.id, payments };
      // Initial detail registration can precede the separate balance registration.
    } else if (command.kind === 'payment') {
      validDate(command.date, today);
      const refund = command.direction === 'refund';
      if (!['payment', 'refund'].includes(command.direction) || !['cash', 'usd', 'outside'].includes(command.source)) throw Error('기록 종류와 결제 자금을 선택해주세요.');
      if (refund && command.source === 'usd') throw Error('달러 환불은 환불 원가를 확인한 뒤 세부 지급액과 자금 잔액에서 수정해주세요.');
      const native = amount(command.amount, '실제 금액', command.source === 'usd' ? 2 : 0);
      if (!native) throw Error('0보다 큰 금액을 입력해주세요.');
      let won = native;
      if (command.source !== 'outside') {
        if (!current.funds || current.funds.cashKrw === undefined) throw Error('남아 있는 결혼자금을 먼저 등록해주세요.');
        Object.assign(funds, normalizeFunds(current.funds));
        if (command.source === 'cash') {
          if (!refund && native > funds.cashKrw) throw Error('원화 잔액보다 큰 금액이에요. 실제 사용한 결혼자금을 확인해주세요.');
          funds.cashKrw = amount(funds.cashKrw + (refund ? native : -native));
        } else {
          if (native > funds.usdBalance) throw Error('보유한 달러보다 큰 금액이에요.');
          won = native === funds.usdBalance ? funds.usdCostKrw : Math.round(native * funds.usdCostKrw / funds.usdBalance);
          if (!won) throw Error('원화 환산액이 1원 미만이에요.');
          funds.usdBalance = Math.round((funds.usdBalance - native) * 100) / 100;
          funds.usdCostKrw -= won;
        }
      }
      const component = refund ? command.component : 'actual';
      if (!['deposit', 'actual'].includes(component)) throw Error('환불할 계약금 또는 추가 지급액을 선택해주세요.');
      let paymentTarget = current.item;
      let payments;
      if (isTravelItem(current.item) && current.plan?.linkedItemId === current.item.id) {
        const detail = travelBreakdown(current.item, current.plan, current.funds);
        if (detail.error) throw Error(detail.error);
        paymentTarget = detail.rows.find(row => row.id === command.rowId);
        if (!paymentTarget) throw Error('납부·환불할 신혼여행 세부 비용을 선택해주세요.');
        payments = structuredClone(funds.travel.payments);
      }
      if (refund && won > (paymentTarget[component] || 0)) throw Error('기록된 지급액보다 많이 환불할 수 없어요.');
      const nextValue = amount((paymentTarget[component] || 0) + (refund ? -won : won));
      itemPatch = {};
      if (payments) {
        payments.find(p => p.id === paymentTarget.id)[component] = nextValue;
        funds.travel = { ...funds.travel, payments };
        for (const key of ['deposit', 'actual']) itemPatch[key] = amount(payments.reduce((s, p) => s + p[key], 0));
      } else itemPatch[component] = nextValue;
      const nextItem = { ...current.item, ...itemPatch };
      itemPatch.balance = Math.max((nextItem.planned || 0) - (nextItem.deposit || 0) - (nextItem.actual || 0), 0);
      itemPatch.lastPaymentDate = command.date;
      movement = { source: command.source, direction: command.direction, native, won, date: command.date, rowId: command.rowId || null };
    } else throw Error('지원하지 않는 저장 요청이에요.');
  }
  return { funds, itemPatch, plan, movement };
}
