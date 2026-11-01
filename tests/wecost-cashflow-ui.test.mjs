import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { savingsForecast, personName } from "../apps/wecost/js/planning-core.mjs";
import { localDate, validDate } from "../apps/wecost/js/wedding-core.mjs";
const require = createRequire(new URL("../apps/sohee/sales/package.json", import.meta.url));
const { JSDOM } = require("jsdom");
const now = new Date(2026, 10, 1);

function setup({ noDate = false, records = {} } = {}) {
  const dom = new JSDOM('<body><div data-private-root><main id="tab-cashflow" class="plan-page"></main></div></body>');
  const w = dom.window, writes = [], statuses = [];
  let fail = false, pending = null, operation = 0;
  const state = {
    settings: { weddingDate: noDate ? "" : "2027-03-06", parentSupportSohee: 1000000, parentSupportSunwo: 2000000 },
    savings: { soheeCurrent: 5000000, sunwoCurrent: 7000000, soheeMonthly: 100000, sunwoMonthly: 200000, soheeDay: 15, sunwoDay: 20, monthlyRecords: structuredClone(records) },
  };
  const recalc = () => {
    state.forecast = savingsForecast(state.savings, state.settings.weddingDate, now);
    state.support = (state.settings.includeSupportSohee !== false ? state.settings.parentSupportSohee : 0) + (state.settings.includeSupportSunwo !== false ? state.settings.parentSupportSunwo : 0);
  };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event("close")); };
  const context = vm.createContext({ document: w.document, window: w, structuredClone, personName, validDate,
    localDate: (date) => localDate(date || now),
    registerPrivateCleanup: () => {}, planningHistory: async () => [],
    planningOperationId: () => `operation-${++operation}`,
    mountWeddingCalendar: (input) => { input.dataset.calendar = "ready"; return { destroy() {} }; },
    savePlanning: async (command, id) => {
      writes.push({ command: structuredClone(command), id });
      if (pending) await pending;
      if (fail) throw Error("저장 실패 테스트");
      Object.assign(state[command.kind], command.values);
      recalc(); context.renderCashflow(state);
    },
  });
  for (const file of ["planning-ui.mjs", "tab-cashflow.js"]) {
    const source = readFileSync(new URL(`../apps/wecost/js/${file}`, import.meta.url), "utf8")
      .replace(/^import\s[\s\S]*?;\r?\n/gm, "").replace(/^export /gm, "");
    vm.runInContext(source, context);
  }
  context.initPlanningUI(status => statuses.push(status));
  recalc(); context.registerCashflowHandlers(() => state); context.renderCashflow(state);
  const q = selector => w.document.querySelector(selector);
  return { state, writes, statuses, q, context,
    click: selector => q(selector).click(),
    input: (key, value) => {
      const input = q(`[data-field="${key}"]`);
      if (input.type === "checkbox") input.checked = value; else input.value = String(value);
      input.dispatchEvent(new w.Event("input", { bubbles: true }));
    },
    submit: async (id) => {
      q(`#${id}`).dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
      await new Promise(resolve => setImmediate(resolve));
    },
    snapshot: (kind, patch) => { Object.assign(state[kind], patch); recalc(); context.renderCashflow(state); },
    fail: value => { fail = value; },
    hold: () => { let release; pending = new Promise(resolve => { release = resolve; }); return () => { release(); pending = null; }; },
  };
}

test("read-first summary preserves prior monthly adjustments without records UI or writes", () => {
  const records = {
    "sohee_2026-11": { actual: 80000, creditedAmount: 80000 },
    "sohee_2026-12": { planned: 300000, actual: null },
  };
  const e = setup({ records });
  assert.equal(e.q("#cf-savings-edit").hidden, true);
  assert.equal(e.q("#cf-support-edit").hidden, true);
  assert.equal(e.q("#cf-current").textContent, "1,200만원");
  assert.equal(e.q("#cf-future").textContent, "130만원");
  assert.equal(e.q("#cf-total").textContent, "1,330만원");
  assert.equal(e.q(".plan-record-table"), null);
  assert.match(e.q("#cf-calculation-content").textContent, /2026.12.*월 계획 30만원/);
  assert.deepEqual(e.state.savings.monthlyRecords, records);
  assert.equal(e.writes.length, 0);
});

test("cancel discards only the open draft, restores latest remote values and returns focus", () => {
  const e = setup();
  e.click('[data-cf-edit="savings"]'); e.input("soheeCurrent", 9000000);
  e.snapshot("savings", { soheeCurrent: 6000000, sunwoCurrent: 8000000 });
  assert.equal(e.q('[data-field="soheeCurrent"]').value, "9,000,000");
  assert.match(e.q("#cf-savings-edit").textContent, /최신 6,000,000원/);
  e.click('[data-cf-cancel="savings"]');
  assert.equal(e.q("#cf-savings-edit").hidden, true);
  assert.equal(e.q('[data-field="soheeCurrent"]')._dirty, false);
  assert.equal(e.q('[data-field="soheeCurrent"]').value, "6,000,000");
  assert.equal(e.q("#cf-sohee-current").textContent, "600만원");
  assert.equal(e.q('[data-cf-edit="savings"]'), e.q("body").ownerDocument.activeElement);
  assert.equal(e.writes.length, 0);
  assert.equal(e.statuses.at(-1), "reset");
});

test("saving both people uses one changed-field command and preserves monthly records", async () => {
  const e = setup({ records: { "sohee_2026-12": { planned: 500000 } } });
  e.click('[data-cf-edit="savings"]');
  e.input("soheeCurrent", 6000000); e.input("sunwoMonthly", 300000);
  await e.submit("cf-savings-edit");
  assert.equal(e.writes.length, 1);
  assert.deepEqual(e.writes[0].command.values, { soheeCurrent: 6000000, sunwoMonthly: 300000 });
  assert.deepEqual(e.writes[0].command.expected, { soheeCurrent: 5000000, sunwoMonthly: 200000 });
  assert.deepEqual(e.state.savings.monthlyRecords, { "sohee_2026-12": { planned: 500000 } });
  assert.equal(e.q("#cf-savings-edit").hidden, true);
  assert.equal(e.q("#cf-current").textContent, "1,300만원");
  assert.match(e.q("#cf-feedback").textContent, /저장했어요/);
});

test("failed save keeps editor and draft; retry reuses its operation id", async () => {
  const e = setup(); e.click('[data-cf-edit="savings"]');
  e.input("soheeCurrent", 6000000); e.fail(true);
  await e.submit("cf-savings-edit");
  assert.equal(e.q("#cf-savings-edit").hidden, false);
  assert.equal(e.q('[data-field="soheeCurrent"]').value, "6,000,000");
  assert.match(e.q("#cf-savings-edit .plan-save-status").textContent, /저장 실패/);
  e.fail(false); await e.submit("cf-savings-edit");
  assert.equal(e.writes[0].id, e.writes[1].id);
  assert.equal(e.q("#cf-savings-edit").hidden, true);
});

test("legacy support defaults remain included while first explicit exclusion expects missing field", async () => {
  const e = setup(); e.click('[data-cf-edit="support"]');
  assert.equal(e.q('[data-field="includeSupportSohee"]').checked, true);
  e.input("includeSupportSohee", false);
  await e.submit("cf-support-edit");
  assert.deepEqual(e.writes[0].command.values, { includeSupportSohee: false });
  assert.deepEqual(e.writes[0].command.expected, { includeSupportSohee: null });
  assert.equal(e.q("#cf-support-total").textContent, "200만원");
  assert.equal(e.q("#cf-sohee-included").textContent, "계산에서 제외");
  assert.equal(e.q("#cf-current").textContent, "1,200만원");
});

test("date is an explicit edit, missing date stays unknown and save updates the forecast", async () => {
  const e = setup({ noDate: true });
  assert.equal(e.q("#cf-total").textContent, "—");
  assert.match(e.q("#cf-forecast-note").textContent, /결혼일을 정하면/);
  e.click('[data-cf-edit="date"]');
  assert.equal(e.q('[data-field="weddingDate"]').dataset.calendar, "ready");
  e.input("weddingDate", "2027-03-06"); await e.submit("cf-date-edit");
  assert.equal(e.q("#cf-date-edit").hidden, true);
  assert.equal(e.q("#cf-total").textContent, "1,320만원");
  assert.deepEqual(e.writes[0].command.values, { weddingDate: "2027-03-06" });
});

test("pending save cannot be cancelled or have the same editor reopened", async () => {
  const e = setup(); e.click('[data-cf-edit="savings"]'); e.input("soheeCurrent", 6000000);
  const release = e.hold(); await e.submit("cf-savings-edit");
  e.click('[data-cf-cancel="savings"]'); e.click('[data-cf-edit="savings"]');
  assert.equal(e.q("#cf-savings-edit").hidden, false);
  assert.equal(e.q('[data-field="soheeCurrent"]')._dirty, true);
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.q("#cf-savings-edit").hidden, true);
  assert.equal(e.writes.length, 1);
});
