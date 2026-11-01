import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { validateWeddingBudget } from '../apps/wecost/js/wedding-budget-core.mjs';
import * as core from "../apps/wecost/js/planning-core.mjs";
import { validDate } from "../apps/wecost/js/wedding-core.mjs";
import { createMemberWork } from "../shared/firebase/member-work.mjs";
function env() {
  const docs = new Map([
    ["wecost_savings/main", { soheeCurrent: 1000, sunwoCurrent: 2000 }],
    [
      "wecost_settings/main",
      { parentSupportSohee: 100, parentSupportSunwo: 200 },
    ],
    [
      "wecost_loans/base",
      {
        name: "회사대출 대역",
        amount: 200000000,
        rate: 1,
        term: 13,
        grace: 1,
        type: "원리금",
        enabled: true,
      },
    ],
  ]);
  let member = { uid: "fixture-member", role: "sungwoo" },
    fail = false,
    writes = 0;
  const cleanup = [];
  const c = vm.createContext({
    ...core,
    validateWeddingBudget,
    validDate,
    createMemberWork,
    structuredClone,
    crypto: { randomUUID: () => "fixture" },
    db: {},
    getMember: () => member,
    registerPrivateCleanup: (fn) => cleanup.push(fn),
    doc: (_, col, id) => `${col}/${id}`,
    serverTimestamp: () => "timestamp",
    runTransaction: async (_, fn) => {
      const pending = [];
      await fn({
        get: async (ref) => ({
          exists: () => docs.has(ref),
          data: () => structuredClone(docs.get(ref)),
        }),
        set: (ref, data, options) => pending.push({ ref, data, options }),
        delete: (ref) => pending.push({ ref, remove: true }),
      });
      if (fail) throw Error("합성 저장 실패");
      for (const p of pending) {
        if (p.remove) docs.delete(p.ref);
        else
          docs.set(
            p.ref,
            p.options?.merge
              ? { ...docs.get(p.ref), ...structuredClone(p.data) }
              : structuredClone(p.data),
          );
        writes++;
      }
    },
  });
  const source = readFileSync(
    new URL("../apps/wecost/js/planning-store.mjs", import.meta.url),
    "utf8",
  )
    .replace(/^import\s[\s\S]*?;\r?\n/gm, "")
    .replace(/^export /gm, "");
  vm.runInContext(
    source + ";this.api={savePlanning,validatePlanningFields};",
    c,
  );
  return {
    docs,
    api: c.api,
    fail: (v) => (fail = v),
    writes: () => writes,
    retire: () => {
      cleanup.forEach((fn) => fn());
      member = null;
    },
  };
}
test("two quick independent support and savings updates both commit without replacing remote fields", async () => {
  const e = env();
  await e.api.savePlanning(
    {
      kind: "settings",
      values: { parentSupportSohee: 150 },
      expected: { parentSupportSohee: 100 },
    },
    "1",
  );
  await e.api.savePlanning(
    {
      kind: "settings",
      values: { parentSupportSunwo: 250 },
      expected: { parentSupportSunwo: 200 },
    },
    "2",
  );
  assert.equal(e.docs.get("wecost_settings/main").parentSupportSohee, 150);
  assert.equal(e.docs.get("wecost_settings/main").parentSupportSunwo, 250);
  e.docs.get("wecost_savings/main").sunwoCurrent = 9000;
  await e.api.savePlanning(
    {
      kind: "savings",
      values: { soheeCurrent: 1200 },
      expected: { soheeCurrent: 1000 },
    },
    "3",
  );
  assert.equal(e.docs.get("wecost_savings/main").sunwoCurrent, 9000);
  await assert.rejects(
    e.api.savePlanning(
      {
        kind: "savings",
        values: { sunwoCurrent: 3000 },
        expected: { sunwoCurrent: 2000 },
      },
      "4",
    ),
    /다른 기기/,
  );
});
test("failed command is atomic, retry commits once and duplicate request cannot increase savings twice", async () => {
  const e = env();
  const cmd = {
    kind: "savings",
    action: "record",
    expectedRecord: null,
    record: {
      person: "sohee",
      month: "2026-01",
      planned: 100,
      actual: 100,
      paidDate: "2026-01-01",
      alreadyIncluded: false,
    },
  };
  e.fail(true);
  await assert.rejects(e.api.savePlanning(cmd, "record1"), /합성 저장 실패/);
  assert.equal(e.writes(), 0);
  e.fail(false);
  await e.api.savePlanning(cmd, "record1");
  assert.equal(e.docs.get("wecost_savings/main").soheeCurrent, 1100);
  const before = e.writes();
  await e.api.savePlanning(cmd, "record1");
  assert.equal(e.writes(), before);
  assert.equal(e.docs.get("wecost_savings/main").soheeCurrent, 1100);
  await assert.rejects(
    e.api.savePlanning(
      { ...cmd, record: { ...cmd.record, actual: 200 } },
      "record1",
    ),
    /다른 저장 요청/,
  );
});
test("new zero-interest loan saves; invalid update and stale deletion cannot overwrite registered base", async () => {
  const e = env();
  const l = {
    name: "무이자 대역",
    amount: 1200000,
    rate: 0,
    term: 1,
    grace: 0,
    type: "원리금",
    enabled: true,
  };
  await e.api.savePlanning(
    { kind: "loan", id: "zero", action: "create", values: l },
    "add",
  );
  assert.equal(e.docs.get("wecost_loans/zero").rate, 0);
  await assert.rejects(
    e.api.savePlanning(
      {
        kind: "loan",
        id: "zero",
        values: { grace: 1 },
        expected: { grace: 0 },
      },
      "invalid",
    ),
    /거치/,
  );
  const expected = structuredClone(e.docs.get("wecost_loans/base"));
  e.docs.get("wecost_loans/base").amount = 210000000;
  await assert.rejects(
    e.api.savePlanning(
      { kind: "loan", id: "base", action: "delete", expected },
      "delete",
    ),
    /다른 기기/,
  );
  assert.ok(e.docs.has("wecost_loans/base"));
});
test("anonymous/retired client cannot write planning records", async () => {
  const e = env();
  e.retire();
  await assert.rejects(
    e.api.savePlanning(
      { kind: "settings", values: { targetHousePrice: 1 } },
      "auth",
    ),
    /로그인/,
  );
  assert.equal(e.writes(), 0);
});
test('budget projection saves atomically, retries once and rejects stale policy without editing financial records', async () => {
  const e = env(), policy = { excludedIds: ['food'], incomes: [{ id: 'gift', name: '축의금', amount: 1000000, date: '', itemId: '', enabled: true }] };
  const cmd = { kind: 'settings', values: { weddingBudget: policy }, expected: { weddingBudget: null } };
  e.fail(true); await assert.rejects(e.api.savePlanning(cmd, 'budget-1')); assert.equal(e.writes(), 0);
  e.fail(false); await e.api.savePlanning(cmd, 'budget-1'); const n = e.writes(); await e.api.savePlanning(cmd, 'budget-1'); assert.equal(e.writes(), n);
  assert.deepEqual(e.docs.get('wecost_settings/main').weddingBudget, policy);
  assert.equal(e.docs.get('wecost_settings/main').parentSupportSohee, 100);
  assert.equal(e.docs.get('wecost_savings/main').soheeCurrent, 1000);
  await assert.rejects(e.api.savePlanning({ ...cmd, values: { weddingBudget: { excludedIds: [], incomes: [] } } }, 'budget-2'), /다른 기기/);
  assert.equal(e.docs.get('wecost_settings/main').weddingBudget.incomes[0].amount, 1000000);
});
test('rate-mode persistence accepts explicit automatic or manual zero rates and rejects unavailable values', async () => {
  const e = env(), houseScenario = { rateMode: 'market', fees: null, reserve: null, terms: { rate: 4.88, term: 30, grace: 0, type: '원리금' } };
  await e.api.savePlanning({ kind: 'settings', values: { houseScenario }, expected: { houseScenario: null } }, 'rate-1');
  assert.equal(e.docs.get('wecost_settings/main').houseScenario.rateMode, 'market');
  assert.equal(e.docs.get('wecost_loans/base').rate, 1);
  await assert.rejects(e.api.savePlanning({ kind: 'settings', values: { houseScenario: { ...houseScenario, terms: { ...houseScenario.terms, rate: null } } }, expected: { houseScenario } }, 'rate-2'), /금리/);
});
