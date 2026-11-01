import { weddingBudgetSummary } from './wedding-budget-core.mjs';
import {
  calcLoanMonthly,
  monthsUntil,
} from "../../../shared/finance/financial-calc.mjs";
import {
  paymentState,
  daysUntil,
  localDate,
  validDate,
} from "./wedding-core.mjs";
import { travelLedgerItems, fundingSummary } from "./wedding-funds-core.mjs";

export const PRESET_AMOUNTS = [5e7, 1e8, 1.5e8, 2e8, 3e8, 4e8, 5e8, 6e8];
export const DEFAULT_TERMS = { rate: 3.5, term: 30, grace: 0, type: "원리금" };
export const personName = (person) => (person === "sohee" ? "소희" : "성우");
export const recordKey = (person, month) => `${person}_${month}`;
export function validateLoan(loan) {
  if (
    !Number.isSafeInteger(loan.amount) ||
    loan.amount < 0 ||
    loan.amount > 1e12
  )
    throw Error("대출 금액을 0원 이상으로 입력해주세요.");
  if (!Number.isFinite(loan.rate) || loan.rate < 0 || loan.rate > 100)
    throw Error("연 금리는 0~100%로 입력해주세요.");
  if (!Number.isInteger(loan.term) || loan.term < 1 || loan.term > 50)
    throw Error("총 기간은 1~50년으로 입력해주세요.");
  if (
    !Number.isInteger(loan.grace) ||
    loan.grace < 0 ||
    loan.grace >= loan.term
  )
    throw Error("거치 기간은 총 기간보다 짧아야 해요.");
  if (!["원리금", "원금", "만기", "company"].includes(loan.type))
    throw Error("상환 방식을 선택해주세요.");
  return loan;
}
export function loanMonthly(loan) {
  return calcLoanMonthly(validateLoan(loan));
}
export function loanPhases(loan) {
  validateLoan(loan);
  return {
    graceMonths: loan.grace * 12,
    repaymentMonths: (loan.term - loan.grace) * 12,
    graceInterest: (loan.amount * loan.rate) / 1200,
    monthly: loanMonthly(loan),
    maturityPrincipal: loan.type === "만기" ? loan.amount : 0,
    declining: loan.type === "원금",
  };
}
function dueOn(month, day) {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(Math.min(day, new Date(y, m, 0).getDate())).padStart(2, "0")}`;
}
export function monthRange(start, end, maximum = 600) {
  if (!/^\d{4}-\d{2}$/.test(start || "") || !/^\d{4}-\d{2}$/.test(end || ""))
    return [];
  const [y, m] = start.split("-").map(Number),
    [ey, em] = end.split("-").map(Number);
  const count = Math.min(maximum, (ey - y) * 12 + em - m + 1);
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const d = new Date(y, m - 1 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}
export function savingsForecast(savings, weddingDate, now = new Date()) {
  const today = localDate(now),
    month = today.slice(0, 7),
    records = savings.monthlyRecords || {};
  const result = {
    current: 0,
    monthly: 0,
    future: 0,
    approximate: false,
    people: {},
  };
  for (const person of ["sohee", "sunwo"]) {
    const current = savings[`${person}Current`] || 0,
      monthly = savings[`${person}Monthly`] || 0;
    const day = savings[`${person}Day`],
      configured = Number.isInteger(day) && day >= 1 && day <= 31;
    let future = 0,
      count = 0;
    for (const key of monthRange(month, weddingDate?.slice(0, 7))) {
      const record = records[recordKey(person, key)];
      if (record?.actual != null) continue; // Actual deposits already belong to Current.
      const due = configured ? dueOn(key, day) : `${key}-01`;
      const pending = configured
        ? due >= today && due <= weddingDate
        : key > month && key <= weddingDate.slice(0, 7);
      if (!pending) continue;
      count++;
      future += record?.planned ?? monthly;
    }
    result.people[person] = {
      current,
      monthly,
      future,
      count,
      total: current + future,
      day: configured ? day : null,
      currentRecord: records[recordKey(person, month)] || null,
    };
    result.current += current;
    result.monthly += monthly;
    result.future += future;
    result.approximate ||= !configured;
  }
  result.total = result.current + result.future;
  return result;
}
export function makePlanningState(st, finance = {}, now = new Date()) {
  const cfg = st.settings || {},
    savings = st.savings || {};
  const displayItems = travelLedgerItems(
    st.items || [],
    finance.plan,
    finance.funds,
    finance.quote,
  );
  const items = displayItems.map((item) => {
    const paid = paymentState(item);
    if (item.travelRowId && item.currency === "USD") {
      paid.remaining = item.balance;
      paid.status =
        item.balance > 0
          ? paid.paid > 0
            ? "partial"
            : "unpaid"
          : paid.planned > 0
            ? "done"
            : "empty";
    }
    return {
      ...item,
      payment: paid,
      days: daysUntil(item.balanceDue, localDate(now)),
    };
  });
  const weddingBudget = weddingBudgetSummary(items, cfg.weddingBudget);
  const { planned: totalPlanned, paid: totalPaid, remaining: totalBalance } = weddingBudget;
  const forecast = savingsForecast(savings, cfg.weddingDate, now);
  const support =
    (cfg.includeSupportSohee ? cfg.parentSupportSohee || 0 : 0) +
    (cfg.includeSupportSunwo ? cfg.parentSupportSunwo || 0 : 0);
  const adjustmentsTotal = (st.adjustments || []).reduce(
    (s, i) => s + (i.sign === "+" ? 1 : -1) * (i.amount || 0),
    0,
  );
  const netCash = forecast.total + support - totalPlanned + weddingBudget.expectedIncome + adjustmentsTotal;
  const loans = (st.loans || []).filter((l) => l.enabled !== false),
    invalidLoans = [];
  let totalMonthly = 0;
  for (const loan of loans) {
    try {
      totalMonthly += loanMonthly(loan);
    } catch {
      invalidLoans.push(loan.id);
    }
  }
  const loanTotal = loans.reduce((s, l) => s + l.amount, 0);
  return {
    displayItems: items,
    forecast,
    monthsLeft: monthsUntil(cfg.weddingDate, now),
    soheeFinal: forecast.people.sohee.total,
    sunwoFinal: forecast.people.sunwo.total,
    coupleSavings: forecast.total,
    support,
    adjustmentsTotal,
    weddingBudget,
    totalPlanned,
    totalPaid,
    totalBalance,
    netCash,
    availCash: Math.max(netCash, 0),
    cashShortfall: Math.max(-netCash, 0),
    loanTotal,
    totalMonthly: invalidLoans.length ? null : totalMonthly,
    invalidLoans,
    houseBudget: Math.max(netCash + loanTotal, 0),
    funding: fundingSummary(
      st.items || [],
      finance.funds,
      finance.plan,
      finance.quote,
      cfg.weddingBudget,
    ),
    financeLoading: finance.connection !== "live",
    fxPending: items.some((i) => i.fxPending),
  };
}
export function upcomingPayments(items, filter = "all") {
  return items
    .filter(
      (i) =>
        i.payment.remaining > 0 &&
        i.days !== null &&
        (filter === "overdue"
          ? i.days < 0
          : filter === "week"
            ? i.days >= 0 && i.days <= 7
            : filter === "month"
              ? i.days >= 0 && i.days <= 30
              : true),
    )
    .sort(
      (a, b) =>
        a.days - b.days ||
        b.payment.remaining - a.payment.remaining ||
        String(a.id).localeCompare(String(b.id)),
    );
}
export function simulation(st, draft = {}) {
  const terms = { ...DEFAULT_TERMS, ...draft.terms };
  validateLoan({ ...terms, amount: 0 });
  // All explicitly enabled registered loans are the base. The existing company
  // record is therefore included once, regardless of its type/name spelling.
  const baseLoans = (st.loans || []).filter((l) => l.enabled !== false);
  const basePrincipal = baseLoans.reduce(
    (s, l) => s + validateLoan(l).amount,
    0,
  );
  const baseMonthly = baseLoans.reduce((s, l) => s + loanMonthly(l), 0);
  const fees = draft.fees ?? null,
    reserve = draft.reserve ?? null;
  for (const n of [fees, reserve])
    if (n !== null && (!Number.isSafeInteger(n) || n < 0))
      throw Error("부대비용과 남겨둘 현금은 0원 이상으로 입력해주세요.");
  const netCash = st.netCash ?? st.availCash ?? 0;
  const usableCash = netCash - (fees || 0) - (reserve || 0);
  const target = draft.target ?? st.settings?.targetHousePrice ?? 0;
  if (!Number.isSafeInteger(target) || target < 0)
    throw Error("목표 집값을 확인해주세요.");
  const additional =
    draft.additional ?? Math.max(0, target - usableCash - basePrincipal);
  const monthly = baseMonthly + loanMonthly({ ...terms, amount: additional });
  const limit = st.settings?.monthlyPaymentLimit || 0;
  return {
    terms,
    target,
    additional,
    baseLoans,
    basePrincipal,
    baseMonthly,
    totalPrincipal: basePrincipal + additional,
    usableCash,
    houseBudget: Math.max(0, usableCash + basePrincipal + additional),
    monthly,
    limit,
    ratio: limit > 0 ? (monthly / limit) * 100 : null,
    headroom: limit > 0 ? limit - monthly : null,
    simple: fees === null || reserve === null,
    fees,
    reserve,
    unusedFunds: Math.max(0, usableCash + basePrincipal + additional - target),
  };
}
export function fieldPatch(current, expected, values) {
  const patch = {},
    conflicts = [];
  for (const [key, value] of Object.entries(values)) {
    if (
      JSON.stringify(current?.[key] ?? null) === JSON.stringify(value ?? null)
    )
      continue;
    if (
      JSON.stringify(current?.[key] ?? null) !==
      JSON.stringify(expected?.[key] ?? null)
    )
      conflicts.push(key);
    else patch[key] = value;
  }
  if (conflicts.length)
    throw Object.assign(
      Error(
        "다른 기기에서 같은 항목이 변경됐어요. 최신 값과 비교해 다시 저장해주세요.",
      ),
      { code: "planning-conflict", conflicts, latest: current },
    );
  return patch;
}
export function savingsRecordChange(
  current,
  expectedRecord,
  command,
  today = localDate(),
) {
  const { person, month, planned, actual, paidDate, alreadyIncluded } = command;
  if (
    !["sohee", "sunwo"].includes(person) ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
  )
    throw Error("사람과 월을 확인해주세요.");
  for (const n of [planned, actual])
    if (n !== null && (!Number.isSafeInteger(n) || n < 0 || n > 1e12))
      throw Error("금액을 0원 이상 정수로 입력해주세요.");
  if (planned === null) throw Error("예정 금액을 입력해주세요.");
  if (
    actual !== null &&
    (!validDate(paidDate) || paidDate > today || paidDate.slice(0, 7) !== month)
  )
    throw Error(
      "선택한 월의 실제 납입일을 입력해주세요. 미래 납입은 계획으로 기록해요.",
    );
  if (typeof alreadyIncluded !== "boolean")
    throw Error("모은 돈 포함 여부를 선택해주세요.");
  const key = recordKey(person, month),
    old = current.monthlyRecords?.[key] ?? null;
  fieldPatch(
    { record: old },
    { record: expectedRecord },
    {
      record: {
        person,
        month,
        planned,
        actual,
        paidDate: actual === null ? "" : paidDate,
        alreadyIncluded,
        creditedAmount: actual === null || alreadyIncluded ? 0 : actual,
      },
    },
  );
  const record = {
    person,
    month,
    planned,
    actual,
    paidDate: actual === null ? "" : paidDate,
    alreadyIncluded,
    creditedAmount: actual === null || alreadyIncluded ? 0 : actual,
  };
  const delta = record.creditedAmount - (old?.creditedAmount || 0),
    field = `${person}Current`;
  const nextCurrent = (current[field] || 0) + delta;
  if (nextCurrent < 0)
    throw Error(
      "이전 자동 반영액을 되돌리면 모은 돈이 음수가 돼요. 현재 저축을 먼저 확인해주세요.",
    );
  return {
    record,
    key,
    delta,
    fields: {
      monthlyRecords: { ...current.monthlyRecords, [key]: record },
      ...(delta ? { [field]: nextCurrent } : {}),
    },
  };
}
