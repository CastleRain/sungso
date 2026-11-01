import test from "node:test";
import assert from "node:assert/strict";
import {
  makePlanningState,
  savingsForecast,
  upcomingPayments,
  simulation,
  loanMonthly,
  fieldPatch,
  savingsRecordChange,
  PRESET_AMOUNTS,
  loanPhases,
} from "../apps/wecost/js/planning-core.mjs";
import { travelLedgerItems } from "../apps/wecost/js/wedding-funds-core.mjs";
const now = new Date(2026, 10, 1, 12);
const base = () => ({
  settings: {
    weddingDate: "2027-03-06",
    targetHousePrice: 600000000,
    monthlyPaymentLimit: 3000000,
    includeSupportSohee: true,
    parentSupportSohee: 30000000,
  },
  savings: {
    soheeCurrent: 30000000,
    sunwoCurrent: 60000000,
    soheeMonthly: 0,
    sunwoMonthly: 0,
  },
  items: [
    {
      id: "venue",
      planned: 10000000,
      deposit: 1000000,
      actual: 2000000,
      balance: 99999999,
      balanceDue: "2026-10-01",
    },
  ],
  adjustments: [],
  loans: [
    {
      id: "company-existing",
      name: "회사 대출",
      amount: 200000000,
      rate: 1,
      term: 13,
      grace: 1,
      type: "원리금",
      enabled: true,
    },
  ],
});
test("cash deducts total wedding cost, retains deficit, does not add wedding wallet again", () => {
  const st = base();
  let calc = makePlanningState(
    st,
    {
      connection: "live",
      funds: { cashKrw: 4500000, usdBalance: 8000, usdCostKrw: 11000000 },
      quote: { rate: 1300 },
    },
    now,
  );
  assert.equal(calc.netCash, 110000000);
  assert.equal(calc.totalBalance, 7000000);
  assert.equal(calc.houseBudget, 310000000);
  st.savings.soheeCurrent = 0;
  st.savings.sunwoCurrent = 0;
  st.settings.includeSupportSohee = false;
  calc = makePlanningState(st, {}, now);
  assert.equal(calc.availCash, 0);
  assert.equal(calc.cashShortfall, 10000000);
  assert.equal(calc.houseBudget, 190000000);
  const sim = simulation({ ...st, ...calc });
  assert.equal(sim.additional, 410000000);
});
test("old overdue never disappears; complete payment ignores stale balance; undefined date stays outside dated list", () => {
  const st = base();
  st.items.push(
    {
      id: "done",
      planned: 10,
      actual: 10,
      balance: 10,
      balanceDue: "2026-11-01",
    },
    { id: "nodate", planned: 10 },
    { id: "week", planned: 10, balanceDue: "2026-11-08" },
  );
  const calc = makePlanningState(st, {}, now);
  assert.deepEqual(
    upcomingPayments(calc.displayItems, "overdue").map((i) => i.id),
    ["venue"],
  );
  assert.deepEqual(
    upcomingPayments(calc.displayItems, "week").map((i) => i.id),
    ["week"],
  );
  assert.equal(upcomingPayments(calc.displayItems).length, 2);
});
test("company principal and monthly included once in all eight comparisons; no additional debt still keeps company repayment", () => {
  const st = { ...base(), netCash: 121100000 };
  const sim = simulation(st);
  assert.equal(sim.basePrincipal, 200000000);
  assert.equal(sim.additional, 278900000);
  assert.equal(Math.round(sim.monthly), 2726852);
  assert.equal(PRESET_AMOUNTS.length, 8);
  const comparisons = PRESET_AMOUNTS.map((additional) =>
    simulation(st, { additional }),
  );
  assert.equal(comparisons[0].houseBudget, 371100000);
  assert.equal(comparisons[7].houseBudget, 921100000);
  assert.ok(comparisons[7].ratio > 100);
  const small = simulation(st, { target: 300000000 });
  assert.equal(small.additional, 0);
  assert.equal(small.monthly, loanMonthly(st.loans[0]));
  const disabled = simulation({
    ...st,
    loans: [{ ...st.loans[0], enabled: false }],
  });
  assert.equal(disabled.basePrincipal, 0);
  assert.equal(disabled.additional, 478900000);
  assert.equal(st.loans.length, 1);
  assert.equal(st.loans[0].amount, 200000000);
});
test("zero interest is valid, invalid terms never become zero monthly, maturity principal stays explicit", () => {
  assert.equal(
    loanMonthly({
      amount: 1200000,
      rate: 0,
      term: 1,
      grace: 0,
      type: "원리금",
    }),
    100000,
  );
  for (const changes of [
    { rate: -1 },
    { rate: NaN },
    { grace: 30 },
    { term: 0 },
    { term: 1.2 },
    { amount: -1 },
  ])
    assert.throws(() =>
      loanMonthly({
        amount: 1000000,
        rate: 3.5,
        term: 30,
        grace: 0,
        type: "원리금",
        ...changes,
      }),
    );
  const p = loanPhases({
    amount: 1200000,
    rate: 1,
    term: 2,
    grace: 1,
    type: "만기",
  });
  assert.equal(p.maturityPrincipal, 1200000);
  assert.ok(Math.abs(p.monthly - 1000) < 1e-6);
});
test("fees/reserve distinguish unset from zero and reduce budgets consistently", () => {
  const st = { ...base(), netCash: 121100000 };
  assert.equal(simulation(st).simple, true);
  const explicit = simulation(st, { fees: 0, reserve: 0 });
  assert.equal(explicit.simple, false);
  const more = simulation(st, { fees: 1000000, reserve: 5000000 });
  assert.equal(more.additional, explicit.additional + 6000000);
  assert.equal(
    simulation(st, { fees: 1000000, reserve: 5000000, additional: 100000000 })
      .houseBudget,
    415100000,
  );
});
test("savings projection counts dates, clamps month end, respects wedding day and skips actual deposits", () => {
  const s = {
    soheeCurrent: 100,
    soheeMonthly: 10,
    soheeDay: 31,
    sunwoCurrent: 200,
    sunwoMonthly: 20,
    sunwoDay: 5,
    monthlyRecords: { sohee_2026_11: null },
  };
  let f = savingsForecast(s, "2027-03-06", now);
  assert.equal(f.people.sohee.count, 4);
  assert.equal(f.people.sunwo.count, 5);
  assert.equal(f.total, 440);
  assert.equal(f.approximate, false);
  s.monthlyRecords = {
    "sohee_2026-11": { actual: 10, planned: 10 },
    "sunwo_2026-12": { actual: null, planned: 50 },
  };
  f = savingsForecast(s, "2027-03-06", now);
  assert.equal(f.people.sohee.count, 3);
  assert.equal(f.total, 460);
  assert.equal(savingsForecast(s, "2026-10-01", now).future, 0);
  delete s.soheeDay;
  assert.equal(savingsForecast(s, "2027-03-06", now).approximate, true);
});
test("record already in current savings adds nothing; new record and corrections apply only credited delta", () => {
  const c = { soheeCurrent: 1000000 };
  const cmd = {
    person: "sohee",
    month: "2026-11",
    planned: 100000,
    actual: 80000,
    paidDate: "2026-11-01",
    alreadyIncluded: true,
  };
  let result = savingsRecordChange(c, null, cmd, "2026-11-01");
  assert.equal(result.delta, 0);
  assert.equal(result.fields.soheeCurrent, undefined);
  result = savingsRecordChange(
    c,
    null,
    { ...cmd, alreadyIncluded: false },
    "2026-11-01",
  );
  assert.equal(result.delta, 80000);
  assert.equal(result.fields.soheeCurrent, 1080000);
  const current = { ...c, ...result.fields };
  const correction = savingsRecordChange(
    current,
    result.record,
    { ...cmd, actual: 90000, alreadyIncluded: false },
    "2026-11-01",
  );
  assert.equal(correction.delta, 10000);
  assert.equal(correction.fields.soheeCurrent, 1090000);
  assert.throws(
    () => savingsRecordChange(current, null, cmd, "2026-11-01"),
    /다른 기기/,
  );
  assert.throws(
    () =>
      savingsRecordChange(
        c,
        null,
        { ...cmd, paidDate: "2026-11-02" },
        "2026-11-01",
      ),
    /실제 납입일/,
  );
});
test("independent field patches preserve remote changes and same-field conflicts are explicit", () => {
  const current = { soheeCurrent: 100, sunwoCurrent: 222 };
  assert.deepEqual(
    fieldPatch(current, { soheeCurrent: 100 }, { soheeCurrent: 150 }),
    { soheeCurrent: 150 },
  );
  assert.throws(
    () => fieldPatch(current, { sunwoCurrent: 200 }, { sunwoCurrent: 300 }),
    (e) => e.code === "planning-conflict" && e.conflicts[0] === "sunwoCurrent",
  );
  assert.deepEqual(
    fieldPatch(current, { soheeCurrent: 90 }, { soheeCurrent: 100 }),
    {},
  );
});
test("FX view uses same travel rows as wedding and preserves historic paid and fully paid USD balances", () => {
  const item = {
    id: "trip",
    cat: "✈️신혼여행",
    name: "신혼여행",
    planned: 200000,
    deposit: 0,
    actual: 120000,
  };
  const plan = {
    linkedItemId: "trip",
    baselineTotal: 200000,
    fxRate: 1000,
    rows: [
      { id: "hotel", name: "숙소", amount: 200, currency: "USD", note: "" },
    ],
  };
  const funds = {
    cashKrw: 0,
    usdBalance: 0,
    usdCostKrw: 0,
    travel: {
      linkedItemId: "trip",
      payments: [
        {
          id: "hotel",
          deposit: 0,
          actual: 120000,
          usdPaid: 200,
          usdPaidKrw: 120000,
        },
      ],
    },
  };
  const st = { ...base(), items: [item] },
    context = { plan, funds, quote: { rate: 1500 }, connection: "live" };
  const rows = travelLedgerItems(st.items, plan, funds, context.quote),
    calc = makePlanningState(st, context, now);
  assert.equal(
    calc.totalPlanned,
    rows.reduce((s, i) => s + i.planned, 0),
  );
  assert.equal(calc.totalPaid, 120000);
  assert.equal(calc.totalBalance, 0);
  const higher = makePlanningState(
    st,
    { ...context, quote: { rate: 2000 } },
    now,
  );
  assert.equal(higher.totalPlanned, 400000);
  assert.equal(higher.totalPaid, 120000);
  assert.equal(higher.totalBalance, 0);
});
