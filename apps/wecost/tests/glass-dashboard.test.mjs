import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { makePlanningState, upcomingPayments, simulation } from "../js/planning-core.mjs";
import { scenarioWithRate } from "../js/loan-rates.mjs";

const require = createRequire(new URL("../../sohee/sales/package.json", import.meta.url));
const { JSDOM } = require("jsdom");

function setup(target = 600000000) {
  const dom = new JSDOM('<html data-ss-surface="solid"><body><div data-private-root><main id="tab-dashboard"></main></div></body></html>');
  const w = dom.window, writes = [], targets = [], views = [];
  const state = {
    settings: {
      weddingDate: "2027-03-06", targetHousePrice: target,
      houseScenario: { rateMode: "manual", terms: { rate: 3, term: 30, grace: 0, type: "원리금" } },
    },
    savings: { soheeCurrent: 60000000, sunwoCurrent: 60000000, soheeMonthly: 0, sunwoMonthly: 0 },
    items: [{ id: "fixture-venue", name: "예식장", planned: 10000000, actual: 1000000, deposit: 1000000, balanceDue: "2020-10-01" }],
    adjustments: [], loans: [],
  };
  Object.assign(state, makePlanningState(state, { funds: { cashKrw: 0, usdBalance: 0, usdCostKrw: 0 } }, new Date(2026, 10, 3)));
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event("close")); };
  w._showHouseView = view => views.push(view);
  const context = vm.createContext({ document: w.document, window: w, structuredClone,
    registerPrivateCleanup: () => {}, planningOperationId: () => "fixture-operation", planningHistory: async () => [],
    savePlanning: async command => writes.push(structuredClone(command)),
    upcomingPayments, simulation: (st, draft) => { targets.push(draft.target); return simulation(st, draft); },
    scenarioWithRate, loanRateHTML: () => "", weddingRateHint: () => "", weddingFxHTML: () => "", handleWeddingFinance: () => {},
  });
  for (const file of ["planning-ui.mjs", "tab-dashboard.js"]) {
    const source = readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8")
      .replace(/^import\s[\s\S]*?;\r?\n/gm, "").replace(/^export /gm, "");
    vm.runInContext(source, context);
  }
  context.initPlanningUI(() => {});
  context.registerDashboardHandlers(() => state);
  context.renderDashboard(state);
  const q = selector => w.document.querySelector(selector);
  return { w, state, writes, targets, views, q, context,
    render: () => context.renderDashboard(state),
    surface: surface => { w.document.documentElement.dataset.ssSurface = surface; context.renderDashboard(state); },
    input: value => { const input = q("#db-target-form input"); input.value = String(value); input.dispatchEvent(new w.Event("input", { bubbles: true })); },
  };
}

test("glass reads saved targets while solid drafts and conflict baselines survive toggles and snapshots", async () => {
  const e = setup();
  const input = e.q("#db-target-form input"), initialMetrics = e.q("#db-metrics").textContent;
  e.input(500000000);
  assert.equal(e.targets.at(-1), 500000000);
  assert.equal(input._expected, 600000000);
  e.surface("glass");
  assert.equal(e.targets.at(-1), 600000000);
  assert.equal(e.q("#db-target-form input"), input);
  assert.equal(input._dirty, true);
  assert.equal(e.q("#db-target-draft").hidden, false);
  assert.equal(e.q("#db-saved-target").textContent, "6억원");
  assert.equal(e.q("#db-metrics").textContent, initialMetrics);
  e.state.settings.targetHousePrice = 700000000;
  e.render();
  assert.equal(e.targets.at(-1), 700000000);
  assert.equal(e.q("#db-saved-target").textContent, "7억원");
  assert.match(e.q("#db-target-form .plan-field-state").textContent, /최신 700,000,000원/);
  e.surface("solid");
  assert.equal(e.targets.at(-1), 500000000);
  assert.equal(input.value, "500,000,000");
  assert.equal(e.writes.length, 0);
  e.q("#db-target-form").dispatchEvent(new e.w.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(e.writes[0].values, { targetHousePrice: 500000000 });
  assert.deepEqual(e.writes[0].expected, { targetHousePrice: 600000000 });
});

test("calculation disclosures retain their open state and house shortcut selects the goal screen without writes", () => {
  const e = setup();
  e.surface("glass");
  assert.equal(e.q("#db-equation-details").open, false);
  e.q("#db-equation-details").open = true;
  e.q("#db-wallet-details").open = true;
  e.render();
  assert.equal(e.q("#db-equation-details").open, true);
  assert.equal(e.q("#db-wallet-details").open, true);
  e.q('[data-due="overdue"]').click();
  assert.equal(e.q('[data-due="overdue"]').getAttribute("aria-pressed"), "true");
  assert.match(e.q("#db-due-list").textContent, /예식장/);
  e.q("[data-dashboard-house-target]").click();
  assert.deepEqual(e.views, ["goal"]);
  assert.equal(e.q("[data-dashboard-house-target]").dataset.go, "house");
  assert.equal(e.writes.length, 0);
});

test("missing target and unavailable rate remain explicit instead of presenting a fabricated result", () => {
  const e = setup(null);
  e.surface("glass");
  assert.equal(e.q("#db-saved-target").textContent, "미설정");
  assert.match(e.q("#db-goal-result").textContent, /목표 집값을 저장하면/);
  e.state.settings.targetHousePrice = 0;
  e.render();
  assert.equal(e.q("#db-saved-target").textContent, "0원");
  e.state.settings.targetHousePrice = 400000000;
  e.state.settings.houseScenario.rateMode = "market";
  e.render();
  assert.match(e.q("#db-goal-result").textContent, /공표 금리 자료 확인 중/);
  assert.equal(e.q("#db-target-draft").hidden, true);
  assert.equal(e.writes.length, 0);
});
