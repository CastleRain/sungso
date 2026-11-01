import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../apps/sohee/sales/package.json", import.meta.url),
);
const { JSDOM } = require("jsdom");
function env() {
  const dom = new JSDOM("<body><div data-private-root></div></body>"),
    w = dom.window,
    writes = [],
    cleanup = [];
  let failure = null;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  const context = vm.createContext({
    document: w.document,
    window: w,
    structuredClone,
    registerPrivateCleanup: (fn) => cleanup.push(fn),
    planningOperationId: () => "operation",
    savePlanning: async (cmd) => {
      if (failure) throw failure;
      writes.push(structuredClone(cmd));
    },
    planningHistory: async () => [],
  });
  const code = readFileSync(
    new URL("../apps/wecost/js/planning-ui.mjs", import.meta.url),
    "utf8",
  )
    .replace(/^import\s[\s\S]*?;\r?\n/gm, "")
    .replace(/^export /gm, "");
  vm.runInContext(
    code +
      ";this.api={field,saveFooter,bindFieldForm,syncForm,initPlanningUI};",
    context,
  );
  const a = context.api;
  a.initPlanningUI(() => {});
  const form = w.document.createElement("form");
  form.innerHTML =
    a.field("soheeCurrent", "소희 모은 돈") +
    a.field("sunwoCurrent", "성우 모은 돈") +
    a.saveFooter();
  w.document.body.append(form);
  a.syncForm(form, { soheeCurrent: 100, sunwoCurrent: 200 });
  a.bindFieldForm(form, "savings");
  return {
    a,
    w,
    form,
    writes,
    set: (key, v) => {
      const input = form.querySelector(`[data-field=${key}]`);
      input.value = v;
      input.dispatchEvent(new w.Event("input", { bubbles: true }));
    },
    submit: async () => {
      form.dispatchEvent(
        new w.Event("submit", { bubbles: true, cancelable: true }),
      );
      await new Promise((r) => setImmediate(r));
    },
    fail: (e) => (failure = e),
  };
}
test("remote snapshots refresh clean inputs while dirty field and original comparison survive", async () => {
  const e = env();
  e.set("soheeCurrent", "150");
  e.a.syncForm(e.form, { soheeCurrent: 120, sunwoCurrent: 250 });
  assert.equal(e.form.querySelector("[data-field=soheeCurrent]").value, "150");
  assert.equal(e.form.querySelector("[data-field=sunwoCurrent]").value, "250");
  assert.match(e.form.textContent, /최신 120원/);
  await e.submit();
  assert.deepEqual(e.writes[0].values, { soheeCurrent: 150 });
  assert.deepEqual(e.writes[0].expected, { soheeCurrent: 100 });
});
test("failed save retains draft and retry keeps operation; same-field conflict requires explicit choice", async () => {
  const e = env();
  e.set("soheeCurrent", "150");
  e.fail(
    Object.assign(Error("충돌"), {
      code: "planning-conflict",
      conflicts: ["soheeCurrent"],
      latest: { soheeCurrent: 120 },
    }),
  );
  await e.submit();
  assert.equal(e.writes.length, 0);
  assert.equal(e.form.querySelector("[data-field=soheeCurrent]").value, "150");
  const mine = [...e.form.querySelectorAll("button")].find(
    (b) => b.textContent === "내 입력 유지",
  );
  assert.ok(mine);
  mine.click();
  e.fail(null);
  await e.submit();
  assert.deepEqual(e.writes[0].expected, { soheeCurrent: 120 });
  assert.equal(e.form.querySelector("[data-field=soheeCurrent]")._dirty, false);
});
test("editing zero defaults from an absent savings doc uses null expected, creates only on explicit save", async () => {
  const e = env();
  e.a.syncForm(e.form, { soheeCurrent: 0, sunwoCurrent: 0, _exists: false });
  assert.equal(e.writes.length, 0);
  e.set("soheeCurrent", "150");
  await e.submit();
  assert.deepEqual(e.writes[0].expected, { soheeCurrent: null });
});
