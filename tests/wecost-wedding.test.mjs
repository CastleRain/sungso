import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import * as core from "../apps/wecost/js/wedding-core.mjs";
import { weddingItems } from "./fixtures/wedding-items.mjs";
const sample = weddingItems(),
  today = "2026-10-31";
test("wedding classification keeps 22 records and amounts; miscellaneous reduces to two", () => {
  const before = structuredClone(sample),
    view = core.weddingView(sample, { today });
  assert.equal(view.scoped.length, 22);
  assert.equal(
    view.categories.find(([cat]) => cat === "✨기타·예비비")[1].length,
    2,
  );
  assert.equal(view.totals.done, 6);
  assert.equal(view.totals.partial, 7);
  assert.equal(view.totals.unpaid, 9);
  assert.deepEqual(sample, before);
  assert.equal(view.categories.flatMap(([, items]) => items).length, 22);
  assert.equal(
    core.weddingCategory({ cat: "직접 분류", name: "혼주" }),
    "직접 분류",
  );
  assert.equal(
    core.weddingCategory({ cat: "✨기타·예비비", name: "혼주" }),
    "✨기타·예비비",
  );
});
test("settled costs never appear as dues even if legacy balance is positive", () => {
  const view = core.weddingView(sample, { today });
  assert.equal(view.dues.length, 16);
  assert.equal(view.overdue.length, 0);
  for (const item of view.completed) {
    const p = core.paymentState(item);
    assert.equal(p.remaining, 0);
    assert.equal(p.progress, 100);
  }
  assert.equal(
    view.totals.remaining,
    view.dues.reduce((sum, i) => sum + core.paymentState(i).remaining, 0),
  );
});
test("progress, extra payments and zero estimates remain meaningful", () => {
  assert.deepEqual(
    core.paymentState({ planned: 100, deposit: 20, actual: 50, balance: 80 }),
    {
      planned: 100,
      deposit: 20,
      actual: 50,
      paid: 70,
      remaining: 30,
      progress: 70,
      status: "partial",
      overpaid: 0,
    },
  );
  assert.equal(
    core.aggregate([
      { planned: 100, actual: 150 },
      { planned: 100, actual: 0 },
    ]).remaining,
    100,
  );
  assert.equal(core.paymentState({ planned: 0 }).status, "empty");
  assert.equal(core.paymentState({ planned: 0, actual: 10 }).status, "partial");
});
test("travel exclusion changes only viewing scope including schedule and counts", () => {
  const view = core.weddingView(sample, {
    today,
    includeTravel: false,
    status: "partial",
  });
  assert.equal(view.scoped.length, 21);
  assert.equal(view.filtered.length, 6);
  assert.ok(view.dues.every((i) => !core.isWeddingTravel(i)));
  assert.equal(sample.length, 22);
  assert.equal(core.weddingView(sample, { today }).scoped.length, 22);
});
test("category/status filtering and chronological ordering do not conflate category expansion", () => {
  const view = core.weddingView(sample, {
    today,
    category: "👪혼주·가족",
    status: "unpaid",
    sort: "due",
  });
  assert.equal(view.filtered.length, 3);
  assert.equal(view.scoped.length, 22);
  assert.ok(
    view.filtered.every((i) => core.weddingCategory(i) === "👪혼주·가족"),
  );
});
test("date boundaries are calendar days, with past and undated dues visible", () => {
  assert.equal(core.daysUntil("2026-11-01", today), 1);
  assert.equal(core.daysUntil("2026-11-30", today), 30);
  assert.equal(core.validDate("2026-02-30"), false);
  const view = core.weddingView(
    [
      { id: "a", planned: 10, balanceDue: "2026-10-30" },
      { id: "b", planned: 20 },
      { id: "c", planned: 30, balanceDue: "2026-11-30" },
    ],
    { today },
  );
  assert.equal(view.soon.length, 1);
  assert.equal(view.overdue.length, 1);
  assert.equal(view.months.length, 3);
});
test("draft validates numeric/date values, preserves notes and calculates corrected balance", () => {
  const p = core.normalizeItemDraft({
    name: "항목",
    cat: "직접 분류",
    planned: "1,000,000",
    deposit: "200,000",
    actual: "300000",
    memo: " 기록 ",
  });
  assert.equal(p.balance, 500000);
  assert.equal(p.memo, "기록");
  for (const value of ["-1", "12a", "1.5", "1000000000001"])
    assert.throws(() => core.parseWon(value));
  assert.throws(() =>
    core.normalizeItemDraft({ name: "항목", balanceDue: "2026-02-30" }),
  );
});
test("partial and full payments reject excess and protect retries/concurrent edits", () => {
  const original = { name: "검사", planned: 100, deposit: 10, actual: 20 };
  const p = core.paymentPatch(original, "30", "2026-01-01", "op");
  assert.equal(p.actual, 50);
  assert.equal(p.balance, 40);
  assert.throws(() => core.paymentPatch(original, "71", "2026-01-01", "op"));
  assert.throws(() => core.paymentPatch(original, "1", "2099-01-01", "op"));
  assert.equal(core.decideItemWrite(original, original, p), true);
  assert.equal(core.decideItemWrite({ ...original, ...p }, original, p), false);
  assert.throws(
    () => core.decideItemWrite({ ...original, actual: 40 }, original, p),
    /다른 기기/,
  );
  assert.throws(() => core.decideItemWrite(null, original, p), /삭제/);
  assert.throws(
    () =>
      core.decideItemWrite({ ...original, ...p }, original, {
        ...p,
        actual: 70,
      }),
    /이미 반영/,
  );
});

const require = createRequire(
  new URL("../apps/sohee/sales/package.json", import.meta.url),
);
const { JSDOM } = require("jsdom");
function renderEnvironment() {
  const html = readFileSync(
    new URL("../apps/wecost/index.html", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM(html, { url: "http://localhost/sungso/wecost/" }),
    w = dom.window;
  const cleanups = [],
    writes = [];
  let fail = false;
  const context = vm.createContext({
    ...core,
    basePaymentState: core.paymentState,
    baseAggregate: core.aggregate,
    baseWeddingView: core.weddingView,
    withWeddingDetails: (item, payment) => payment,
    registerWeddingFinance: () => {},
    handleWeddingFinance: () => false,
    weddingFundingCard: () => "",
    weddingFundsHTML: () => "",
    weddingTravelDetails: () => "",
    weddingRemaining: items => core.aggregate(items).remaining,
    document: w.document,
    window: w,
    CSS: { escape: (s) => s },
    crypto: { randomUUID: () => "unit-operation" },
    structuredClone,
    console,
    confirm: () => true,
    registerPrivateCleanup: (fn) => cleanups.push(fn),
    addItem: async (...args) => {
      if (fail) throw Error("저장 실패");
      writes.push(args);
    },
    updateItem: async (...args) => {
      if (fail) throw Error("저장 실패");
      writes.push(args);
    },
    deleteItem: async (...args) => { writes.push(args); },
  });
  const source = readFileSync(
    new URL("../apps/wecost/js/tab-wedding.js", import.meta.url),
    "utf8",
  )
    .replace(/^import\s[\s\S]*?;\r?\n/gm, "")
    .replace(/^export /gm, "");
  vm.runInContext(
    source +
      ";this.render=renderWedding;this.register=registerWeddingHandlers;",
    context,
  );
  const state = { items: structuredClone(sample) };
  context.register(() => state);
  context.render(state);
  return {
    dom,
    w,
    context,
    state,
    writes,
    cleanups,
    setFail: (v) => (fail = v),
  };
}
test("renderer exposes full ledger, working expansion, filtering and correct progress without mutation", () => {
  const env = renderEnvironment(),
    d = env.w.document;
  assert.equal(d.querySelectorAll("#tbl-body tr:not(.wed-ledger-group-header):not(.wf-travel-row)").length, 22);
  const category = [...d.querySelectorAll(".wed-category")].find((e) =>
    e.textContent.includes("혼주·가족"),
  );
  category.open = true;
  assert.equal(category.querySelectorAll(".wed-child-row").length, 3);
  env.context.render(env.state);
  assert.equal(
    [...d.querySelectorAll(".wed-category")].find(
      (e) => e.dataset.disclosure === category.dataset.disclosure,
    ).open,
    true,
  );
  d.querySelector('[data-status="done"]').click();
  assert.equal(d.querySelectorAll("#tbl-body tr:not(.wed-ledger-group-header):not(.wf-travel-row)").length, 6);
  assert.ok(
    [...d.querySelectorAll("#tbl-body [role=progressbar]")].every(
      (e) => e.getAttribute("aria-valuenow") === "100",
    ),
  );
  assert.equal(d.querySelectorAll('#tbl-body [data-action="edit"]').length, 6);
  assert.ok(!d.querySelector("#tbl-body").textContent.includes("삭제"));
  const check = d.querySelector("#wed-include-travel");
  check.checked = false;
  check.dispatchEvent(new env.w.Event("change", { bubbles: true }));
  assert.equal(env.state.items.length, 22);
  assert.ok(d.querySelector("#s-total-hint").textContent.includes("22개"));
  env.dom.window.close();
});
test("editor failure retains draft and retry saves the corrected balance", async () => {
  const e = renderEnvironment(),
    d = e.w.document;
  e.w._openItemDrawer("synthetic-2");
  d.querySelector("#di-actual").value = "42";
  e.setFail(true);
  await e.w._saveItemDrawer();
  assert.equal(d.querySelector("#di-actual").value, "42");
  assert.ok(!d.querySelector("#item-drawer").classList.contains("hidden"));
  assert.match(d.querySelector("#wed-form-error").textContent, /저장 실패/);
  e.setFail(false);
  await e.w._saveItemDrawer();
  assert.equal(e.writes[0][1].actual, 42);
  assert.equal(e.writes[0][1].balance, 289958);
  e.cleanups.forEach((fn) => fn());
  assert.equal(d.querySelector("#tab-wedding").textContent, "");
  assert.equal(d.querySelector("#di-name").value, "");
  e.dom.window.close();
});

test("editor preview uses exact amounts without writing and clears invalid or private values", () => {
  const e = renderEnvironment(), d = e.w.document;
  const item = { id:'preview-only', name:'합성 여행 항목', cat:'✈️신혼여행', planned:18300000, deposit:300000, actual:12345600 };
  e.state.items = [item];
  e.context.render(e.state);
  e.w._openItemDrawer(item.id);
  assert.equal(d.querySelector('#wed-draft-paid').textContent,'1,264.56만원');
  assert.equal(d.querySelector('#wed-draft-remaining').textContent,'565.44만원');
  assert.equal(d.querySelector('#hint-di-actual').textContent,'1,234.56만원');
  assert.equal(d.querySelector('#wed-category-help').hidden,false);
  const input = (id,value) => {
    const el = d.getElementById(id);
    el.value = value;
    el.dispatchEvent(new e.w.Event('input',{bubbles:true}));
    return el;
  };
  assert.equal(input('di-actual','15000000').value,'15,000,000');
  assert.equal(d.querySelector('#wed-draft-remaining').textContent,'300만원');
  assert.equal(input('di-actual','1.5').value,'1.5');
  assert.equal(d.querySelector('#di-actual').getAttribute('aria-invalid'),'true');
  assert.equal(d.querySelector('#wed-draft-paid').textContent,'—');
  assert.equal(d.querySelector('#wed-draft-remaining').textContent,'—');
  input('di-actual','18300000');
  assert.equal(d.querySelector('#di-actual').hasAttribute('aria-invalid'),false);
  assert.equal(d.querySelector('#wed-draft-remaining').textContent,'0원');
  assert.match(d.querySelector('#wed-draft-note').textContent,/30만원 더 지급/);
  input('di-planned','');
  assert.match(d.querySelector('#wed-draft-note').textContent,/미정/);
  assert.equal(item.actual,12345600);
  assert.equal(e.writes.length,0);
  e.cleanups.forEach(fn=>fn());
  for (const id of ['wed-draft-paid','wed-draft-remaining','wed-draft-note','hint-di-actual']) assert.equal(d.getElementById(id).textContent,'');
  e.dom.window.close();
});
test("untrusted names, categories and notes render as text, not executable markup", () => {
  const e = renderEnvironment();
  e.state.items = [
    {
      id: "id'\"",
      name: "<img src=x onerror=alert(1)>",
      cat: "<svg/onload=alert(1)>",
      planned: 10,
      memo: "<script>alert(1)</script>",
    },
  ];
  e.context.render(e.state);
  assert.equal(
    e.w.document.querySelectorAll(
      "#tab-wedding img,#tab-wedding svg,#tab-wedding script",
    ).length,
    0,
  );
  e.dom.window.close();
});
test("discard and delete require explicit inline confirmation", async () => {
  const e = renderEnvironment(), d = e.w.document;
  e.w._openItemDrawer("synthetic-2");
  d.querySelector("#di-name").value = "미저장 이름";
  e.w._closeItemDrawer();
  assert.equal(d.querySelector("#wed-discard-confirm").hidden, false);
  d.querySelector("#wed-discard-cancel").click();
  assert.equal(d.querySelector("#di-name").value, "미저장 이름");
  e.w._closeItemDrawer();
  d.querySelector("#wed-discard-apply").click();
  assert.ok(d.querySelector("#item-drawer").classList.contains("hidden"));
  assert.equal(e.writes.length, 0);
  e.w._openItemDrawer("synthetic-2");
  e.w._confirmDeleteItemDrawer();
  assert.equal(d.querySelector("#wed-delete-confirm").hidden, false);
  assert.equal(e.writes.length, 0);
  d.querySelector("#wed-delete-cancel").click();
  assert.equal(e.writes.length, 0);
  e.w._confirmDeleteItemDrawer();
  d.querySelector("#wed-delete-apply").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.writes.length, 1);
  assert.equal(e.writes[0][0], "synthetic-2");
  assert.equal(e.writes[0][1].id, "synthetic-2");
  e.dom.window.close();
});
test("sorting and category grouping preserve every item and filtered financial totals", () => {
  const before = structuredClone(sample);
  for (const sort of ["amount", "amount-asc", "remaining", "due", "name"]) {
    const view = core.weddingView(sample, { sort, groupBy:"category", today });
    assert.equal(view.groups.length,11);
    assert.equal(new Set(view.groups.flatMap(g=>g.items.map(i=>i.id))).size,22);
    assert.deepEqual(core.aggregate(view.groups.flatMap(g=>g.items)),view.totals);
    for(const group of view.groups){
      assert.ok(group.items.every(i=>core.weddingCategory(i)===group.category));
      assert.deepEqual(group.totals,core.aggregate(group.items));
      for(let n=1;n<group.items.length;n++){
        const a=group.items[n-1],b=group.items[n];
        if(sort==='amount')assert.ok(a.planned>=b.planned);
        if(sort==='amount-asc')assert.ok(a.planned<=b.planned);
        if(sort==='remaining')assert.ok(core.paymentState(a).remaining>=core.paymentState(b).remaining);
        if(sort==='name')assert.ok(a.name.localeCompare(b.name,'ko')<=0);
      }
    }
  }
  const filtered=core.weddingView(sample,{status:'unpaid',includeTravel:false,groupBy:'category'});
  assert.deepEqual(core.aggregate(filtered.groups.flatMap(g=>g.items)),core.aggregate(filtered.filtered));
  assert.equal(core.weddingView(sample,{groupBy:'none'}).groups.length,0);
  assert.deepEqual(sample,before);
});
test("ledger grouping and sorting work together and leave the overview untouched", () => {
  const e=renderEnvironment(), d=e.w.document;
  const total=d.querySelector('#s-total').textContent;
  assert.equal(d.querySelectorAll('#tbl-body .wed-ledger-group-header').length,11);
  assert.equal(d.querySelectorAll('#tbl-body tr:not(.wed-ledger-group-header):not(.wf-travel-row)').length,22);
  assert.equal(d.querySelectorAll('.wed-mobile-ledger .wed-ledger-group').length,11);
  d.querySelector('#wed-sort-trigger').click();
  d.querySelector('[data-action="choose-sort"][data-value="amount-asc"]').click();
  const section=d.querySelector('.wed-mobile-ledger section[aria-label="스드메 항목"]');
  assert.match(section.querySelector('.wed-mobile-item > summary').textContent,/스드메 계약/);
  d.querySelector('[data-status="done"]').click();
  assert.equal(d.querySelectorAll('#tbl-body tr:not(.wed-ledger-group-header):not(.wf-travel-row)').length,6);
  assert.equal(d.querySelector('#s-total').textContent,total);
  d.querySelector('[data-action="group"][data-value="none"]').click();
  assert.equal(d.querySelectorAll('#tbl-body .wed-ledger-group-header').length,0);
  assert.equal(e.writes.length,0);
  assert.deepEqual(e.state.items,sample);
  e.dom.window.close();
});

test("category order follows totals and earliest valid dates, recalculating after filtering", () => {
  const items = [
    { id:'a', name:'가1', cat:'가', planned:100, deposit:100, balanceDue:'2026-12-20' },
    { id:'a2', name:'가2', cat:'가', planned:100, balanceDue:'2026-12-19' },
    { id:'b', name:'나1', cat:'나', planned:150, actual:10, balanceDue:'2026-11-01' },
    { id:'c', name:'다1', cat:'다', planned:50, actual:60, balanceDue:'invalid' },
  ];
  const before = structuredClone(items);
  for (const [sort, expected] of Object.entries({ amount:['가','나','다'], 'amount-asc':['다','나','가'], remaining:['나','가','다'], due:['나','가','다'], name:['가','나','다'] })) {
    const view = core.weddingView(items, { sort, groupBy:'category' });
    assert.deepEqual(view.groups.map(g=>g.category), expected);
    assert.deepEqual(core.aggregate(view.groups.flatMap(g=>g.items)), core.aggregate(items));
  }
  assert.deepEqual(core.weddingView(items, { status:'unpaid', groupBy:'category' }).groups.map(g=>[g.category,g.totals.planned]), [['가',100]]);
  assert.deepEqual(items, before);
});

test("compact category subtotals occupy the same four amount columns as item rows", () => {
  const e = renderEnvironment(), d = e.w.document;
  const groups = core.weddingView(e.state.items, { groupBy:'category' }).groups;
  const headers = [...d.querySelectorAll('.wed-ledger-group-header')];
  assert.deepEqual(headers.map(row=>row.dataset.ledgerGroup), groups.map(group=>group.category));
  headers.forEach((row, index) => {
    const group = groups[index], cells = [...row.cells];
    assert.equal(cells[0].colSpan, 1);
    assert.equal(cells.slice(1,5).every(cell=>cell.colSpan===1), true);
    assert.equal(cells.length, 7);
    assert.equal(row.nextElementSibling.cells.length, 7);
    const totals = [group.totals.planned, group.items.reduce((n,i)=>n+core.paymentState(i).deposit,0), group.totals.remaining, group.totals.paid];
    assert.deepEqual(cells.slice(1,5).map(cell=>cell.querySelector('[title]').title), totals.map(n=>`${n.toLocaleString('ko-KR')}원`));
    const button = row.querySelector('button');
    assert.deepEqual(button.getAttribute('aria-describedby').split(' ').map(id=>d.getElementById(id)), cells.slice(1,5));
    button.click();
    assert.ok(cells.slice(1,5).every(cell=>!cell.hidden));
    assert.ok(button.getAttribute('aria-controls').split(' ').every(id=>d.getElementById(id).hidden));
  });
  assert.equal(e.writes.length,0);
  e.dom.window.close();
});

test("only the sorting panel remains and closes with focus restored without changing data", () => {
  const e = renderEnvironment(), d = e.w.document;
  const original = structuredClone(e.state.items), total = d.querySelector('#s-total').textContent;
  assert.equal(d.querySelectorAll('#wed-ledger select').length, 0);
  assert.equal(d.querySelector('#wed-category-trigger'), null);
  assert.equal(d.querySelector('#wed-category-panel'), null);
  d.querySelector('#wed-sort-trigger').click();
  assert.equal(d.querySelector('#wed-sort-panel').hidden, false);
  d.querySelector('[data-value="unpriced"][data-action="choose-sort"]').focus();
  d.activeElement.dispatchEvent(new e.w.KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
  assert.equal(d.querySelector('#wed-sort-panel').hidden, true);
  assert.equal(d.activeElement.id, 'wed-sort-trigger');
  d.querySelector('[data-status="done"]').click();
  d.querySelector('[data-action="reset-filter"]').click();
  assert.equal(d.querySelectorAll('#tbl-body tr:not(.wed-ledger-group-header):not(.wf-travel-row)').length, 22);
  assert.equal(d.querySelector('#s-total').textContent, total);
  assert.equal(e.writes.length, 0);
  assert.deepEqual(e.state.items, original);
  e.cleanups.forEach(fn=>fn());
  e.context.render(e.state);
  assert.equal(d.querySelector('#wed-sort-panel').hidden, true);
  assert.equal(d.querySelector('[data-action="group"][data-value="category"]').getAttribute('aria-pressed'), 'true');
  e.dom.window.close();
});

test("overview starts folded, keeps user expansion on refresh, and grouped items retain their names without repeated categories", () => {
  const e = renderEnvironment(), d = e.w.document;
  assert.equal(d.querySelector('#wed-categories').open, false);
  assert.equal(d.querySelector('#wed-schedule').open, false);
  assert.equal(d.querySelector('#wed-ledger').open, true);
  assert.equal(d.querySelector('.wecost-travel-summary'), null);
  assert.equal(d.querySelector('#wed-include-travel').checked, true);
  assert.equal(d.querySelector('.wed-budget-link').getAttribute('href'), '../travel/#budget');
  assert.equal(d.querySelectorAll('#tbl-body .wed-category-cell').length, 0);
  assert.equal(d.querySelectorAll('#tbl-body .wed-nested-row .wed-branch').length, 22);
  for (const item of e.state.items) assert.ok(d.querySelector(`#tbl-body [data-id="${item.id}"]`).closest('tr').textContent.includes(item.name));
  d.querySelector('#wed-categories').open = true;
  e.context.render(e.state);
  assert.equal(d.querySelector('#wed-categories').open, true);
  d.querySelector('[data-action="group"][data-value="none"]').click();
  assert.equal(d.querySelectorAll('#tbl-body .wed-category-cell').length,22);
  assert.equal(d.querySelectorAll('#tbl-body .wed-branch').length,0);
  assert.equal(d.querySelectorAll('.wed-mobile-ledger .wed-branch').length,0);
  e.cleanups.forEach(fn=>fn());
  e.context.render(e.state);
  assert.equal(d.querySelector('#wed-categories').open, false);
  assert.equal(e.writes.length,0);
  e.dom.window.close();
});

test("category add opens a blank draft with the selected category, saves only on request, and global add resets context", async () => {
  const e = renderEnvironment(), d = e.w.document, original = structuredClone(e.state.items);
  const button = d.querySelector('#tbl-body [data-action="add"][data-category="👗스드메"]');
  button.focus();
  button.click();
  assert.equal(d.querySelector('#di-cat').value,'👗스드메');
  assert.equal(d.querySelector('#di-name').value,'');
  assert.equal(d.querySelector('#di-planned').value,'0');
  assert.equal(d.querySelector('#di-cat').disabled,false);
  assert.equal(e.writes.length,0);
  e.w._closeItemDrawer();
  assert.equal(d.activeElement,button);
  d.querySelector('.wed-mobile-ledger [data-action="add"][data-category="👪혼주·가족"]').click();
  assert.equal(d.querySelector('#di-cat').value,'👪혼주·가족');
  d.querySelector('#di-name').value='합성 추가 항목';
  d.querySelector('#di-planned').value='100,000';
  d.querySelector('#di-deposit').value='20,000';
  await e.w._saveItemDrawer();
  assert.equal(e.writes.length,1);
  assert.equal(e.writes[0][0].cat,'👪혼주·가족');
  assert.equal(e.writes[0][0].balance,80000);
  assert.deepEqual(e.state.items,original);
  d.querySelector('.page-hdr [data-action="add"]').click();
  assert.equal(d.querySelector('#di-cat').value,core.CATEGORY_CHOICES[0]);
  assert.equal(d.querySelector('#di-name').value,'');
  assert.equal(d.querySelector('#di-planned').value,'0');
  assert.equal(e.writes.length,1);
  e.dom.window.close();
});

test("category groups collapse independently, keep their totals and synchronize desktop/mobile through sorting and filters", () => {
  const e = renderEnvironment(), d = e.w.document;
  const original = structuredClone(e.state.items);
  const summary = d.querySelector('#s-remain').textContent;
  const desktop = () => d.querySelector('#tbl-body [data-action="toggle-ledger-group"][data-category="👗스드메"]');
  const mobile = () => d.querySelector('.wed-mobile-ledger [data-action="toggle-ledger-group"][data-category="👗스드메"]');
  const controlledRows = () => desktop().getAttribute('aria-controls').split(' ').map(id=>d.getElementById(id));
  const subtotalText = () => [...desktop().closest('tr').querySelectorAll('.wed-group-subtotal')].map(cell=>cell.textContent);
  const totals = subtotalText();
  desktop().focus();
  desktop().click();
  assert.equal(desktop().getAttribute('aria-expanded'), 'false');
  assert.equal(d.activeElement, desktop());
  assert.ok(controlledRows().every(row=>row.hidden));
  assert.equal(d.getElementById(mobile().getAttribute('aria-controls')).hidden, true);
  assert.deepEqual(subtotalText(), totals);
  assert.equal(d.querySelectorAll('#tbl-body tr[hidden]:not(.wf-travel-row)').length, 4);
  e.context.render(e.state);
  assert.ok(controlledRows().every(row=>row.hidden));
  d.querySelector('#wed-sort-trigger').click();
  d.querySelector('[data-action="choose-sort"][data-value="amount-asc"]').click();
  assert.ok(controlledRows().every(row=>row.hidden));
  d.querySelector('[data-status="done"]').click();
  assert.equal(controlledRows().length, 2);
  assert.ok(controlledRows().every(row=>row.hidden));
  d.querySelector('[data-action="reset-filter"]').click();
  d.querySelector('[data-action="group"][data-value="none"]').click();
  assert.equal(d.querySelectorAll('#tbl-body tr[hidden]:not(.wf-travel-row)').length, 0);
  d.querySelector('[data-action="group"][data-value="category"]').click();
  assert.ok(controlledRows().every(row=>row.hidden));
  mobile().click();
  assert.equal(desktop().getAttribute('aria-expanded'), 'true');
  assert.ok(controlledRows().every(row=>!row.hidden));
  d.querySelector('[data-action="toggle-ledger-groups"]').click();
  assert.equal(d.querySelectorAll('#tbl-body tr[hidden]:not(.wf-travel-row)').length, 22);
  assert.equal(d.querySelectorAll('#tbl-body .wed-group-subtotal').length, 44);
  assert.equal(d.querySelector('[data-action="toggle-ledger-groups"]').textContent, '모두 펼치기');
  e.w.HTMLElement.prototype.scrollIntoView = () => {};
  d.querySelector('[data-action="show-category"][data-category="👗스드메"]').click();
  assert.ok(controlledRows().every(row=>!row.hidden));
  assert.equal(d.querySelectorAll('#tbl-body tr[hidden]:not(.wf-travel-row)').length, 18);
  d.querySelector('[data-action="toggle-ledger-groups"]').click();
  d.querySelector('[data-action="toggle-ledger-groups"]').click();
  assert.equal(d.querySelectorAll('#tbl-body tr[hidden]:not(.wf-travel-row)').length, 0);
  assert.equal(d.querySelector('#s-remain').textContent, summary);
  assert.equal(e.writes.length, 0);
  assert.deepEqual(e.state.items, original);
  desktop().click();
  e.cleanups.forEach(fn=>fn());
  e.context.render(e.state);
  assert.equal(d.querySelectorAll('#tbl-body tr[hidden]:not(.wf-travel-row)').length, 0);
  e.dom.window.close();
});

test("fresh visits expand every group and view clicks preserve cards instead of replaying their entry animation", () => {
  const e = renderEnvironment(), d = e.w.document;
  const cards = [...d.querySelectorAll('#tab-wedding .card')];
  const ledger = d.querySelector('#wed-ledger');
  const group = d.querySelector('#tbl-body [data-category="👗스드메"]');
  const row = d.getElementById(group.getAttribute('aria-controls').split(' ')[0]);
  const assertCardsRetained = () => {
    assert.deepEqual([...d.querySelectorAll('#tab-wedding .card')], cards);
    assert.equal(d.querySelector('#wed-ledger'), ledger);
  };
  assert.equal(d.querySelectorAll('#tbl-body tr[hidden]:not(.wf-travel-row)').length, 0);
  assert.equal(d.querySelectorAll('.wed-group-toggle[aria-expanded="true"]').length, 22);
  group.focus();
  group.click();
  assert.equal(d.activeElement, group);
  assert.equal(d.getElementById(row.id), row);
  assert.equal(row.hidden, true);
  assertCardsRetained();
  group.click();
  assert.equal(row.hidden, false);
  d.querySelector('[data-action="toggle-ledger-groups"]').click();
  d.querySelector('[data-action="toggle-ledger-groups"]').click();
  assert.equal(d.getElementById(row.id), row);
  const picker = d.querySelector('#wed-sort-trigger');
  picker.click();
  d.querySelector('[data-action="close-picker"]').click();
  assert.equal(d.querySelector('#wed-sort-trigger'), picker);
  assert.equal(d.getElementById(row.id), row);
  assertCardsRetained();
  d.querySelector('[data-status="done"]').click();
  assert.equal(d.querySelectorAll('#tbl-body [data-action="edit"]').length, 6);
  assertCardsRetained();
  d.querySelector('#wed-sort-trigger').click();
  d.querySelector('[data-action="choose-sort"][data-value="amount-asc"]').click();
  assertCardsRetained();
  assert.equal(e.writes.length, 0);
  e.dom.window.close();
  const fresh = renderEnvironment();
  assert.equal(fresh.w.document.querySelectorAll('#tbl-body tr[hidden]:not(.wf-travel-row)').length, 0);
  fresh.dom.window.close();
});

test("unpriced sorting puts missing and zero estimates first, including their category, without losing paid zero-estimate records", () => {
  const items = [
    { id:'a', name:'금액 있는 항목', cat:'가', planned:100 },
    { id:'b', name:'큰 금액', cat:'나', planned:200 },
    { id:'c', name:'미입력', cat:'나' },
    { id:'d', name:'0원 입력', cat:'나', planned:0, actual:10 },
  ];
  const before = structuredClone(items);
  const view = core.weddingView(items, { sort:'unpriced', groupBy:'category' });
  assert.equal(view.groups[0].category, '나');
  assert.deepEqual(new Set(view.groups[0].items.slice(0,2).map(i=>i.id)), new Set(['c','d']));
  assert.equal(view.groups[0].items[2].id, 'b');
  assert.deepEqual(core.aggregate(view.groups.flatMap(g=>g.items)), core.aggregate(items));
  assert.deepEqual(core.weddingView(items, { sort:'unpriced' }).filtered.slice(2).map(i=>i.id), ['b','a']);
  assert.deepEqual(items, before);
  const e = renderEnvironment(), d = e.w.document;
  e.state.items = structuredClone(items);
  e.context.render(e.state);
  d.querySelector('#wed-sort-trigger').click();
  d.querySelector('[data-action="choose-sort"][data-value="unpriced"]').click();
  assert.equal(d.querySelector('.wed-ledger-group-header').dataset.ledgerGroup, '나');
  assert.match(d.querySelector('#wed-sort-trigger').textContent, /금액 미정 먼저/);
  assert.equal(e.writes.length, 0);
  e.dom.window.close();
});
