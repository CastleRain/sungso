import { addItem, updateItem, deleteItem } from "./firebase.js";
import { mountWeddingCalendar } from './wedding-calendar.mjs';
import { registerWeddingFinance, handleWeddingFinance, weddingFundingCard, weddingFundsHTML, weddingDisplayItems, weddingForeignAmount, weddingForeignNote, weddingRateHint, weddingTravelActions, weddingTravelAdd, weddingRemaining, withWeddingDetails, ensureWeddingFx } from './wedding-funds-ui.mjs';
import { registerPrivateCleanup } from "../../../shared/firebase/site-auth.mjs";
import {
  CATEGORY_CHOICES,
  categoryLabel,
  categoryIcon,
  weddingCategory,
  paymentState as basePaymentState,
  aggregate as baseAggregate,
  weddingView as baseWeddingView,
  localDate,
  daysUntil,
  normalizeItemDraft,
  parseWon,
  paymentPatch,
  isWeddingTravel,
} from "./wedding-core.mjs";
const paymentState = item => withWeddingDetails(item, basePaymentState(item));
const aggregate = items => baseAggregate(items, paymentState);
const weddingView = (items, options) => baseWeddingView(weddingDisplayItems(items), options, paymentState);
const STATUS = {
  done: "완납",
  partial: "일부 납부",
  unpaid: "미납",
  empty: "금액 미정",
};
const ui = {
  includeTravel: true,
  status: "all",
  sort: "amount",
  groupBy: "category",
  picker: null,
  collapsedGroups: new Set(), // Every category starts expanded on a fresh visit.
  open: new Set(["ledger"]),
};
let getState,
  editingItem = null,
  operationId = "",
  saving = false,
  activeModal = null,
  returnFocus = null,
  initialDraft = "",
  generation = 0,
  registered = false;
const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const money = (n) =>
  n >= 10000
    ? `${(n / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}만원`
    : `${n.toLocaleString("ko-KR")}원`;
const amt = (n, owed = false) =>
  `<span class="${owed && n > 0 ? "wed-owed" : n === 0 ? "wed-zero" : ""}" title="${n.toLocaleString("ko-KR")}원">${money(n)}</span>`;
const badge = (p) =>
  `<span class="status-badge ${p.status}">${STATUS[p.status]}</span>`;
const bar = (p) =>
  `<span class="wed-progress"><span class="wed-track" role="progressbar" aria-label="지급률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.progress}"><span style="width:${p.progress}%"></span></span><span>${p.planned > 0 ? p.progress + "%" : "미정"}</span></span>`;
const opened = (key) => (ui.open.has(key) ? " open" : "");
const edit = (item) => weddingTravelActions(item) ||
  `<span class="wf-item-actions"><button type="button" class="tbl-action-btn" data-action="edit" data-id="${esc(item.id)}" aria-label="${esc(item.name)} 수정">수정</button><button type="button" class="tbl-action-btn" data-finance="payment" data-id="${esc(item.id)}" aria-label="${esc(item.name)} 납부·환불 기록">기록</button></span>`;
const pay = (item) => item.travelRowId ? `<button type="button" class="tbl-action-btn" data-finance="payment" data-id="${esc(item.travelParentId)}" data-row="${esc(item.travelRowId)}" aria-label="${esc(item.name)} 납부 기록">납부 기록</button>` :
  `<button type="button" class="tbl-action-btn" data-action="pay" data-id="${esc(item.id)}" aria-label="${esc(item.name)} 납부 기록">납부 기록</button>`;
const empty = (text) => `<p class="wed-empty">${text}</p>`;
const icon = (cat) =>
  `<span class="wed-icon" aria-hidden="true">${esc(categoryIcon(cat))}</span>`;
const addToCategory = (cat) => weddingTravelAdd(cat) || `<button type="button" class="wed-category-add" data-action="add" data-category="${esc(cat)}" aria-label="${esc(categoryLabel(cat))}에 항목 추가">+ 추가</button>`;
const itemName = (item, nested = false) => `<span class="wed-item-name">${nested ? '<span class="wed-branch" aria-hidden="true"></span>' : icon(weddingCategory(item))}<span>${esc(item.name)} ${badge(paymentState(item))}</span></span>`;
const paidPair = (paid, planned) =>
  `<span class="wed-paid-pair"><span class="wed-pair-label">지급 </span>${money(paid)} <small>/ <span class="wed-pair-label">예정 </span>${money(planned)}</small></span>`;
function dueRow(item) {
  const p = paymentState(item),
    d = daysUntil(item.balanceDue);
  const date =
    d === null ? "날짜 미정" : item.balanceDue.slice(5).replace("-", "/");
  const day =
    d === null ? "" : d < 0 ? `${-d}일 지남` : d === 0 ? "오늘" : `D-${d}`;
  return `<div class="wed-due-row"><span class="wed-date">${date}<small>${day}</small></span><span class="wed-due-name">${esc(item.name)}</span>${amt(p.remaining, true)}${pay(item)}</div>`;
}
function itemSummary(item, nested = false) {
  const p = paymentState(item);
  return `${itemName(item, nested)}${weddingForeignAmount(item) ? `<span class="wed-paid-pair">${weddingForeignAmount(item)}<small>지급 ${money(p.paid)}</small></span>` : paidPair(p.paid, p.planned)}<span class="wed-child-balance">잔금 ${amt(p.remaining, true)}</span>${bar(p)}`;
}
function categoryHTML([cat, items]) {
  const t = aggregate(items),
    p = paymentState({ planned: t.planned, actual: t.paid }),
    key = `cat:${cat}`;
  return `<details class="wed-category" data-disclosure="${esc(key)}"${opened(key)}><summary><span class="wed-cat-name">${icon(cat)}<span>${esc(categoryLabel(cat))}<small>${items.length}개 항목</small></span></span>${paidPair(t.paid, t.planned)}<span class="wed-cat-remain"><small>잔금 </small>${amt(t.remaining, true)}</span>${bar(p)}<span class="wed-chevron" aria-hidden="true"></span></summary><div class="wed-category-children">${items.map((i) => `<div class="wed-child-row">${itemSummary(i)}${edit(i)}</div>`).join("")}<button type="button" class="wed-text-button" data-action="show-category" data-category="${esc(cat)}">이 카테고리의 상세 항목으로 이동</button></div></details>`;
}
function tableRow(item, rowId = "", hidden = false) {
  const p = paymentState(item), grouped = ui.groupBy === "category";
  return `<tr${grouped ? ' class="wed-nested-row"' : ''}${rowId ? ` id="${rowId}"` : ""}${hidden ? " hidden" : ""}><td>${itemName(item, grouped)}${item.travelDetailError ? `<small class="wed-overpaid">${esc(item.travelDetailError)}</small>` : ""}${p.overpaid ? `<small class="wed-overpaid">예상보다 ${money(p.overpaid)} 더 지급</small>` : ""}</td>${grouped ? "" : `<td class="wed-category-cell">${esc(categoryLabel(weddingCategory(item)))}</td>`}<td class="amt wed-planned">${weddingForeignAmount(item) || amt(p.planned)}</td><td class="amt">${amt(p.deposit)}</td><td class="amt">${amt(p.remaining, true)}</td><td class="amt">${amt(p.paid)}</td><td>${bar(p)}</td><td>${edit(item)}</td></tr>`;
}
function mobileItem(item, nested = false) {
  const p = paymentState(item),
    key = `item:${item.id}`;
  return `<details class="wed-mobile-item" data-disclosure="${esc(key)}"${opened(key)}><summary>${itemSummary(item, nested)}<span class="wed-chevron" aria-hidden="true"></span></summary><div class="wed-mobile-more"><dl><dt>카테고리</dt><dd>${esc(categoryLabel(weddingCategory(item)))}</dd><dt>계약금</dt><dd>${money(p.deposit)}</dd><dt>${item.travelRowId ? "여행 공통 납부일" : "납부 예정일"}</dt><dd>${esc(item.balanceDue || "미정")}</dd><dt>메모</dt><dd>${esc(item.memo || "없음")}</dd></dl>${p.overpaid ? `<p>예상보다 ${money(p.overpaid)} 더 지급했어요.</p>` : ""}<div class="wed-row-actions">${edit(item)}</div></div></details>`;
}
const SORT_OPTIONS = [
  ["amount", "예정금액 높은순", "큰 비용부터 확인", "↓"],
  ["amount-asc", "예정금액 낮은순", "작은 비용부터 확인", "↑"],
  ["remaining", "잔금 높은순", "남은 비용이 큰 항목부터", "↓"],
  ["due", "납부일 가까운순", "날짜 미정 항목은 마지막에", "◷"],
  ["unpriced", "금액 미정 먼저", "예정금액이 0원이거나 비어 있는 항목", "—"],
  ["name", "항목명순", "가나다순으로 확인", "가"],
];
function groupSummary(group) {
  return `<span class="wed-group-metric"><small>예정</small><strong>${amt(group.totals.planned)}</strong></span><span class="wed-group-metric"><small>지급</small><strong>${amt(group.totals.paid)}</strong></span><span class="wed-group-metric wed-group-balance"><small>잔금</small><strong>${amt(group.totals.remaining, true)}</strong></span>`;
}
function groupToggle(group, controls, surface, index) {
  const collapsed = ui.collapsedGroups.has(group.category);
  const summaryId = `wed-group-totals-${surface}-${index}`;
  const description = surface === "desktop" ? ["planned", "deposit", "remaining", "paid"].map(key => `${summaryId}-${key}`).join(" ") : summaryId;
  return `<button type="button" class="wed-group-toggle" data-action="toggle-ledger-group" data-category="${esc(group.category)}" data-focus="ledger-group-${surface}-${esc(group.category)}" aria-label="${esc(categoryLabel(group.category))} 항목 ${collapsed ? "펼치기" : "접기"}" aria-expanded="${!collapsed}" aria-controls="${controls}" aria-describedby="${description}"><span class="wed-group-name">${icon(group.category)}<span>${esc(categoryLabel(group.category))}</span><small>${group.items.length}개</small></span>${surface === "mobile" ? `<span class="wed-group-totals" id="${summaryId}">${groupSummary(group)}</span>` : ""}<span class="wed-chevron" aria-hidden="true"></span></button>`;
}
function ledgerRows(view) {
  if (ui.groupBy !== "category") return view.filtered.map(item => tableRow(item)).join("");
  return view.groups.map((group, index) => {
    const ids = group.items.map((_, n) => `wed-ledger-row-${index}-${n}`);
    const totals = { ...group.totals, deposit: group.items.reduce((sum, item) => sum + paymentState(item).deposit, 0) };
    const subtotalCells = [["planned", "예정"], ["deposit", "계약금"], ["remaining", "잔금"], ["paid", "누적 지급"]].map(([key, label]) => `<td class="amt wed-group-subtotal" id="wed-group-totals-desktop-${index}-${key}"><span class="wed-sr-only">${label} 합계 </span>${amt(totals[key], key === "remaining")}</td>`).join("");
    const controlledIds = ids;
    return `<tr class="wed-ledger-group-header" data-ledger-group="${esc(group.category)}"><th>${groupToggle(group, controlledIds.join(" "), "desktop", index)}</th>${subtotalCells}<td class="wed-group-caption">소계</td><td>${addToCategory(group.category)}</td></tr>${group.items.map((item, n) => tableRow(item, ids[n], ui.collapsedGroups.has(group.category))).join("")}`;
  }).join("");
}
function mobileLedger(view) {
  if (ui.groupBy !== "category") return view.filtered.map(item => mobileItem(item)).join("");
  return view.groups.map((group, index) => {
    const id = `wed-mobile-group-${index}`;
    return `<section class="wed-ledger-group" aria-label="${esc(categoryLabel(group.category))} 항목"><header class="wed-mobile-group-heading">${groupToggle(group, id, "mobile", index)}${addToCategory(group.category)}</header><div id="${id}"${ui.collapsedGroups.has(group.category) ? " hidden" : ""}>${group.items.map(item => mobileItem(item, true)).join("")}</div></section>`;
  }).join("");
}
function ledgerControls(view) {
  const allCollapsed = view.groups.length > 0 && view.groups.every(group => ui.collapsedGroups.has(group.category));
  const sortLabel = SORT_OPTIONS.find(([key]) => key === ui.sort)[1];
  return `<div class="wed-ledger-tools">
    <div class="wed-view-toggle" role="group" aria-label="목록 보기 방식">${[["category", "카테고리별"], ["none", "전체 목록"]].map(([key, label]) => `<button type="button" data-action="group" data-value="${key}" data-focus="group-${key}" aria-pressed="${ui.groupBy === key}">${label}</button>`).join("")}</div>
    <div class="wed-picker-triggers">${ui.groupBy === "category" && view.groups.length ? `<button type="button" class="wed-fold-all" data-action="toggle-ledger-groups" data-value="${allCollapsed ? "expand" : "collapse"}" data-focus="fold-all">${allCollapsed ? "모두 펼치기" : "모두 접기"}</button>` : ""}
    <button type="button" class="wed-picker-trigger" id="wed-sort-trigger" data-action="picker" data-picker="sort" data-focus="picker-sort" aria-expanded="${ui.picker === "sort"}" aria-controls="wed-sort-panel"><span class="wed-tool-label">정렬</span><span>${sortLabel}</span><span class="wed-chevron" aria-hidden="true"></span></button></div>
  </div>
  <section id="wed-sort-panel" class="wed-choice-panel" aria-label="정렬 선택"${ui.picker === "sort" ? "" : " hidden"}><div class="wed-choice-heading"><span>${ui.groupBy === "category" ? "카테고리와 내부 항목에 함께 적용돼요" : "전체 항목을 정렬해요"}</span><button type="button" class="wed-text-button" data-action="close-picker" aria-label="정렬 선택 닫기">닫기</button></div><div class="wed-sort-options">${SORT_OPTIONS.map(([key, label, hint, symbol]) => `<button type="button" class="wed-choice" data-action="choose-sort" data-value="${key}" data-focus="sort-option-${key}" aria-pressed="${ui.sort === key}" aria-label="${label}"><span class="wed-icon" aria-hidden="true">${symbol}</span><span class="wed-choice-name">${label}<small>${hint}</small></span><span class="wed-choice-check" aria-hidden="true">✓</span></button>`).join("")}</div></section>`;
}
function rememberDisclosures(root) {
  for (const el of root.querySelectorAll("details[data-disclosure]"))
    el.open ? ui.open.add(el.dataset.disclosure) : ui.open.delete(el.dataset.disclosure);
}
function restoreViewFocus(root, key) {
  if (key) root.querySelector(`[data-focus="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
}
function weddingScope(view) {
  return ui.includeTravel ? `전체 ${view.scoped.length}개 항목` : `신혼여행 제외 · ${view.scoped.length}개 항목`;
}
function ledgerHTML(v) {
  const t = v.totals, scope = weddingScope(v);
  return `<details class="card wed-section" data-disclosure="ledger" id="wed-ledger"${opened("ledger")}><summary><h2 class="card-title">항목별 상세 <small id="tbl-count">${v.filtered.length}개 표시 / ${scope}</small></h2><span class="wed-chevron" aria-hidden="true"></span></summary><div class="wed-ledger-toolbar"><div class="wed-filters" role="group" aria-label="항목 필터"><div class="wed-status-filters">${[["all", "전체", t.count], ["unpaid", "미납", t.unpaid], ["partial", "일부 납부", t.partial], ["done", "완납", t.done], ...(t.empty ? [["empty", "금액 미정", t.empty]] : [])].map(([key, label, count]) => `<button type="button" data-focus="status-${key}" data-action="status" data-status="${key}" aria-pressed="${ui.status === key}">${label} ${count}</button>`).join("")}</div></div>${ledgerControls(v)}</div>${ui.status !== "all" ? `<button class="wed-text-button" data-action="reset-filter" data-focus="reset-filter">필터 해제 · 전체 항목 보기</button>` : ""}
 ${ui.groupBy === "category" ? `<p class="wed-note wed-group-note">${({ amount: "예정 합계가 큰 카테고리부터", "amount-asc": "예정 합계가 작은 카테고리부터", remaining: "잔금 합계가 큰 카테고리부터", due: "가장 빠른 납부일이 있는 카테고리부터", unpriced: "금액 미정 항목이 있는 카테고리부터", name: "카테고리 가나다순" })[ui.sort]} · 제목을 누르면 접을 수 있어요.</p>` : ""}
 ${weddingForeignNote(v.filtered)}<div id="tbl-body-wrap" class="wed-desktop-ledger"><div class="table-wrap"><table class="wed-table"><thead><tr><th scope="col">${ui.groupBy === "category" ? "카테고리 / 세부 항목" : "항목"}</th>${ui.groupBy === "category" ? "" : '<th scope="col">카테고리</th>'}<th scope="col" class="amt">예정금액</th><th scope="col" class="amt">계약금</th><th scope="col" class="amt">잔금</th><th scope="col" class="amt">누적 지급</th><th scope="col">지급률</th><th scope="col"><span class="wed-sr-only">추가 / 수정</span></th></tr></thead><tbody id="tbl-body">${ledgerRows(v)}</tbody></table></div></div><div class="wed-mobile-ledger">${mobileLedger(v)}</div>${!v.filtered.length ? empty("조건에 맞는 항목이 없어요.") : ""}</details>`;
}
function renderLedger() {
  const ledger = $("wed-ledger");
  if (!ledger) return;
  rememberDisclosures(ledger);
  const focus = document.activeElement?.dataset?.focus;
  const template = document.createElement("template");
  template.innerHTML = ledgerHTML(weddingView(getState().items || [], ui));
  ledger.replaceChildren(...template.content.firstElementChild.childNodes);
  restoreViewFocus(ledger, focus);
}
function syncSortPanel() {
  const open = ui.picker === "sort";
  $("wed-sort-panel").hidden = !open;
  $("wed-sort-trigger").setAttribute("aria-expanded", String(open));
}
function syncLedgerGroups() {
  const buttons = [...$("wed-ledger").querySelectorAll('[data-action="toggle-ledger-group"]')];
  for (const button of buttons) {
    const category = button.dataset.category, collapsed = ui.collapsedGroups.has(category);
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute("aria-label", `${categoryLabel(category)} 항목 ${collapsed ? "펼치기" : "접기"}`);
    for (const id of button.getAttribute("aria-controls").split(" ")) $(id).hidden = collapsed;
  }
  const allButton = $("wed-ledger").querySelector('[data-action="toggle-ledger-groups"]');
  if (allButton) {
    const allCollapsed = buttons.length > 0 && buttons.every(button => ui.collapsedGroups.has(button.dataset.category));
    allButton.dataset.value = allCollapsed ? "expand" : "collapse";
    allButton.textContent = allCollapsed ? "모두 펼치기" : "모두 접기";
  }
}
export function renderWedding(st, options = {}) {
  const root = $("tab-wedding");
  if (!root) return;
  root.classList.toggle("wed-fx-updating", Boolean(options.fxUpdate));
  rememberDisclosures(root);
  const focus = document.activeElement?.dataset?.focus,
    items = st.items || [],
    v = weddingView(items, ui),
    t = aggregate(weddingDisplayItems(items));
  t.remaining = weddingRemaining(items);
  const near = v.soon.slice(0, 3),
    scope = weddingScope(v),
    progress = paymentState({ planned: t.planned, actual: t.paid });
  root.innerHTML = `
 <div class="page-hdr"><div><h1>결혼비용</h1><p>항목별 예산과 지급 현황을 관리해요.</p></div><div class="wed-page-actions"><label class="wed-switch"><input id="wed-include-travel" data-focus="travel" type="checkbox" ${ui.includeTravel ? "checked" : ""}> 상세에 신혼여행 포함</label><a class="wed-budget-link" href="../travel/#budget">여행 예산 ↗</a><button type="button" class="btn btn-primary" data-action="add">+ 항목 추가</button></div></div>
 <div class="metric-grid metric-grid-4"><div class="metric-card mc-primary"><div class="mc-label">총 예정 비용</div><div class="mc-value" id="s-total">${money(t.planned)}</div><div class="mc-sub" id="s-total-hint">전체 결혼비용 · ${t.count}개 항목${weddingRateHint(items)}</div></div><div class="metric-card"><div class="mc-label">지금까지 지급</div><div class="mc-value" id="s-paid">${money(t.paid)}</div><div class="mc-sub" id="s-paid-hint">완납 ${t.done}개 · 일부 납부 ${t.partial}개</div></div><div class="metric-card wed-balance-card"><div class="mc-label">남은 잔금</div><div class="mc-value wed-owed" id="s-remain">${money(t.remaining)}</div><div class="mc-sub">각 항목의 남은 금액 합계</div></div>${weddingFundingCard(items)}</div>
 ${weddingFundsHTML()}<div class="wed-overview-grid"><section class="card wed-next"><div class="card-hdr"><h2 class="card-title">다음 납부 <small id="s-soon">30일 내 ${money(aggregate(v.soon).remaining)} · ${v.soon.length}건</small></h2><button class="wed-text-button" data-action="schedule">전체 일정 보기</button></div>${near.length ? near.map(dueRow).join("") : empty("30일 내 예정된 납부가 없어요.")}${v.overdue.length ? `<button class="wed-overdue-link" data-action="overdue">지난 납부일 ${v.overdue.length}건 · ${money(aggregate(v.overdue).remaining)} 확인</button>` : ""}</section>
 <section class="card wed-total-progress"><div class="wed-between"><h2 class="card-title">지급 진행 현황</h2><span id="prog-info">${progress.progress}% · ${money(t.paid)} / ${money(t.planned)}</span></div>${bar(progress)}${t.overpaid ? `<p class="wed-note">일부 항목은 예상보다 ${money(t.overpaid)} 더 지급했어요. 다른 항목의 잔금에서 빼지 않아요.</p>` : ""}</section>
 </div><div class="wed-reference-sections"><details class="card wed-section" id="wed-categories" data-disclosure="categories"${opened("categories")}><summary><h2 class="card-title">카테고리별 현황 <small>${v.categories.length}개 · ${v.scoped.length}항목</small></h2><span class="wed-chevron" aria-hidden="true"></span></summary><p class="wed-note">카테고리를 누르면 포함된 항목을 볼 수 있어요.</p><div class="wed-category-columns" aria-hidden="true"><span>카테고리</span><span>지급 / 예정</span><span>남은 잔금</span><span>지급률</span><span></span></div><div id="cat-rows">${v.categories.length ? v.categories.map(categoryHTML).join("") : empty(ui.includeTravel ? "등록된 항목이 없어요. 항목 추가로 시작해보세요." : "신혼여행을 제외한 항목이 없어요.")}</div></details>
 <details class="card wed-section" id="wed-schedule" data-disclosure="schedule"${opened("schedule")}><summary><h2 class="card-title">잔금 납부 일정 <small>남은 납부 ${v.dues.length}건</small></h2><span class="wed-chevron" aria-hidden="true"></span></summary><div id="timeline">${
   v.months
     .map(([month, rows]) => {
       const key = `month:${month}`;
       return `<details class="wed-month" data-disclosure="${esc(key)}"${opened(key)}><summary><span>${/^\d/.test(month) ? `${month.slice(0, 4)}년 ${Number(month.slice(5))}월` : month}</span><small>${rows.length}건 · ${money(aggregate(rows).remaining)}</small><span class="wed-chevron" aria-hidden="true"></span></summary>${rows.map(dueRow).join("")}</details>`;
     })
     .join("") || empty("남은 납부가 없어요.")
 }<details class="wed-completed" data-disclosure="completed"${opened("completed")}><summary>완납 항목 ${v.completed.length}개 보기</summary>${v.completed.map((i) => `<div class="wed-completed-row"><span>${esc(i.name)}</span><span>${money(paymentState(i).paid)}</span>${edit(i)}</div>`).join("") || empty("완납 항목이 없어요.")}</details></div></details>
 </div>${ledgerHTML(v)}`;
  restoreViewFocus(root, focus);
  ensureWeddingFx();
}
function error(message) {
  const el = $("wed-form-error");
  if (el) {
    el.textContent = message;
    if (message) el.focus();
  }
}
function draft() {
  return {
    name: $("di-name").value,
    cat: $("di-cat").value,
    planned: $("di-planned").value,
    deposit: $("di-deposit").value,
    actual: $("di-actual").value,
    balanceDue: $("di-balance-due").value,
    memo: $("di-memo").value,
  };
}
function updateEditorPreview() {
  const values = {};
  let valid = true;
  for (const key of ["planned", "deposit", "actual"]) {
    const input = $(`di-${key}`), hint = $(`hint-di-${key}`);
    try {
      values[key] = parseWon(input.value);
      hint.textContent = values[key] > 0 ? money(values[key]) : "";
      input.removeAttribute("aria-invalid");
    } catch {
      valid = false;
      hint.textContent = "0 이상의 정수를 입력해주세요.";
      input.setAttribute("aria-invalid", "true");
    }
  }
  const payment = valid ? paymentState(values) : null;
  $("wed-draft-paid").textContent = valid ? money(payment.paid) : "—";
  $("wed-draft-remaining").textContent = valid ? money(payment.remaining) : "—";
  $("wed-draft-note").textContent = !valid ? "금액을 확인하면 누적 지급액과 잔금을 계산해요." : !payment.planned ? "예정 금액이 미정이에요. 입력하면 잔금을 계산해요." : payment.overpaid ? `예정 금액보다 ${money(payment.overpaid)} 더 지급했어요.` : "누적 지급 = 계약금 + 추가 지급 · 잔금 = 예정 − 누적 지급";
}
let editorCalendar = null;
function showModal(el) {
  returnFocus = document.activeElement;
  activeModal = el;
  el.classList.remove("hidden");
  $("item-drawer-backdrop").classList.remove("hidden");
  document.body.classList.add("wed-modal-open");
  editorCalendar?.destroy();
  editorCalendar = mountWeddingCalendar(el.querySelector('input[type="date"]'));
}
function closeModal(force = false) {
  if (saving && !force) return;
  if (
    !force &&
    activeModal?.id === "item-drawer" &&
    initialDraft !== JSON.stringify(draft())
  ) {
    $("wed-delete-confirm").hidden = true;
    $("wed-discard-confirm").hidden = false;
    $("wed-discard-cancel").focus();
    return;
  }
  $("wed-delete-confirm").hidden = true;
  $("wed-discard-confirm").hidden = true;
  editorCalendar?.destroy();
  editorCalendar = null;
  activeModal?.classList.add("hidden");
  $("item-drawer-backdrop").classList.add("hidden");
  document.body.classList.remove("wed-modal-open");
  activeModal = null;
  editingItem = null;
  if (returnFocus?.isConnected) returnFocus.focus();
  else $("tab-wedding")?.querySelector('[data-action="add"]')?.focus();
}
function busy(value) {
  saving = value;
  for (const el of activeModal?.querySelectorAll(
    "button,input,select,textarea",
  ) || [])
    el.disabled = value;
  if (
    !value &&
    activeModal?.id === "item-drawer" &&
    editingItem &&
    isWeddingTravel(editingItem)
  )
    $("di-cat").disabled = true;
}
export function registerWeddingHandlers(getStFn) {
  getState = getStFn;
  if (registered) return;
  registered = true;
  registerWeddingFinance(getStFn, renderWedding);
  $("item-drawer").addEventListener("input", (e) => {
    if (!["di-planned", "di-deposit", "di-actual"].includes(e.target.id)) return;
    const raw = e.target.value.replaceAll(",", "").trim();
    // Format valid integers only; keep unsupported input visible for validation.
    if (/^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)))
      e.target.value = Number(raw).toLocaleString("ko-KR");
    updateEditorPreview();
  });
  const root = $("tab-wedding");
  root.addEventListener("change", (e) => {
    if (e.target.id === "wed-include-travel") {
      ui.includeTravel = e.target.checked;
      ui.picker = null;
    } else return;
    renderWedding(getState());
  });
  root.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action],[data-finance]");
    if (!target) return;
    if (handleWeddingFinance(target)) return;
    const action = target.dataset.action;
    if (action === "picker") {
      ui.picker = ui.picker === target.dataset.picker ? null : target.dataset.picker;
      syncSortPanel();
      return;
    }
    if (["choose-sort", "close-picker"].includes(action)) {
      const picker = ui.picker;
      if (action === "choose-sort") ui.sort = target.dataset.value;
      ui.picker = null;
      if (action === "choose-sort") renderLedger();
      else syncSortPanel();
      $(`wed-${picker}-trigger`)?.focus({ preventScroll: true });
      return;
    }
    if (action === "add" || action === "edit")
      return window._openItemDrawer(target.dataset.id || null, target.dataset.category || "");
    if (action === "pay") return openPayment(target.dataset.id);
    if (action === "toggle-ledger-group") {
      const category = target.dataset.category;
      if (ui.collapsedGroups.has(category)) ui.collapsedGroups.delete(category);
      else ui.collapsedGroups.add(category);
      syncLedgerGroups();
      return;
    }
    if (action === "toggle-ledger-groups") {
      for (const group of weddingView(getState().items || [], ui).groups)
        if (target.dataset.value === "collapse") ui.collapsedGroups.add(group.category);
        else ui.collapsedGroups.delete(group.category);
      syncLedgerGroups();
      return;
    }
    if (action === "schedule" || action === "overdue") {
      const section = $("wed-schedule");
      section.open = true;
      if (action === "overdue")
        section
          .querySelector('[data-disclosure="month:지난 납부일 확인"]')
          ?.setAttribute("open", "");
      section.scrollIntoView({ block: "start" });
      return;
    }
    if (action === "group") ui.groupBy = target.dataset.value;
    else if (action === "status") ui.status = target.dataset.status;
    else if (action === "show-category") {
      ui.groupBy = "category";
      ui.status = "all";
      ui.collapsedGroups.delete(target.dataset.category);
      $("wed-ledger").open = true;
    } else if (action === "reset-filter") {
      ui.status = "all";
    }
    ui.picker = null;
    renderLedger();
    if (action === "show-category") {
      const buttons = [...root.querySelectorAll('[data-action="toggle-ledger-group"]')];
      const button = buttons.find(el => el.dataset.category === target.dataset.category && el.getClientRects().length);
      (button || $("wed-ledger")).scrollIntoView({ block: "start" });
      button?.focus({ preventScroll: true });
    }
  });
  root.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !ui.picker) return;
    e.preventDefault();
    const picker = ui.picker;
    ui.picker = null;
    syncSortPanel();
    $(`wed-${picker}-trigger`)?.focus({ preventScroll: true });
  });
  window._openItemDrawer = (id, initialCategory = "") => {
    if (saving) return;
    const item = id ? getState().items.find((i) => i.id === id) : null;
    if (id && !item) return;
    editingItem = item ? structuredClone(item) : null;
    operationId = crypto.randomUUID();
    $("drawer-title").textContent = item ? "항목 수정" : "항목 추가";
    $("drawer-item-id").value = id || "";
    $("drawer-delete-btn").style.display = item ? "" : "none";
    const cat = item ? weddingCategory(item) : initialCategory || CATEGORY_CHOICES[0],
      categories = [
        ...new Set([
          ...CATEGORY_CHOICES,
          ...getState().items.map(weddingCategory),
          cat,
        ]),
      ];
    $("wed-editor-context").textContent = item ? "금액을 정정하는 화면이에요. 결혼자금 잔액은 바뀌지 않으며 실제 결제는 납부·환불에서 기록하세요." : initialCategory ? `${categoryLabel(cat)} 카테고리에 세부 항목을 추가해요. 분류는 아래에서 바꿀 수 있어요.` : "카테고리를 고르고 실제 준비할 항목명을 입력해요. 예: 스드메 → 드레스 추가금";
    $("di-cat").innerHTML = categories
      .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)
      .join("");
    for (const [key, val] of Object.entries({
      name: item?.name || "",
      cat,
      planned: item?.planned ?? 0,
      deposit: item?.deposit ?? 0,
      actual: item?.actual ?? 0,
      "balance-due": item?.balanceDue || "",
      memo: item?.memo || "",
    }))
      $(`di-${key}`).value =
        typeof val === "number" ? val.toLocaleString("ko-KR") : val;
    $("di-cat").disabled = !!item && isWeddingTravel(item);
    $("wed-category-help").hidden = !$("di-cat").disabled;
    $("wed-form-error").textContent = "";
    $("wed-delete-confirm").hidden = true;
    $("wed-discard-confirm").hidden = true;
    $("wed-last-payment").textContent = item?.lastPaymentDate
      ? `마지막 납부 기록: ${item.lastPaymentDate}`
      : "";
    updateEditorPreview();
    initialDraft = JSON.stringify(draft());
    showModal($("item-drawer"));
    $("di-name").focus();
  };
  window._closeItemDrawer = () => closeModal();
  window._saveItemDrawer = async () => {
    if (saving) return;
    let payload;
    try {
      payload = normalizeItemDraft(draft());
    } catch (e) {
      error(e.message);
      return;
    }
    const original = editingItem,
      id = $("drawer-item-id").value,
      version = generation;
    if (!original || !isWeddingTravel(original))
      payload.weddingOperationId = operationId;
    busy(true);
    error("");
    try {
      if (id) await updateItem(id, payload, original);
      else await addItem(payload, operationId);
      if (version === generation) {
        busy(false);
        closeModal(true);
      }
    } catch (e) {
      if (version === generation) {
        busy(false);
        error(e.message || "저장하지 못했어요. 입력 내용은 그대로예요.");
      }
    }
  };
  window._confirmDeleteItemDrawer = () => {
    if (saving || !editingItem) return;
    $("wed-discard-confirm").hidden = true;
    $("wed-delete-name").textContent = `“${editingItem.name}” 항목을 삭제할까요?`;
    $("wed-delete-confirm").hidden = false;
    $("wed-delete-cancel").focus();
  };
  $("wed-delete-cancel").addEventListener("click", () => {
    $("wed-delete-confirm").hidden = true;
    $("drawer-delete-btn").focus();
  });
  $("wed-discard-cancel").addEventListener("click", () => {
    $("wed-discard-confirm").hidden = true;
    $("di-name").focus();
  });
  $("wed-discard-apply").addEventListener("click", () => closeModal(true));
  $("wed-delete-apply").addEventListener("click", async () => {
    if (saving || !editingItem) return;
    const item = editingItem,
      version = generation;
    busy(true);
    try {
      await deleteItem(item.id, item);
      if (version === generation) {
        busy(false);
        closeModal(true);
      }
    } catch (e) {
      if (version === generation) {
        busy(false);
        error(e.message || "삭제하지 못했어요.");
      }
    }
  });
  $("wed-payment-save").addEventListener("click", savePayment);
  $("wed-payment-cancel").addEventListener("click", () => closeModal());
  document.addEventListener("keydown", (e) => {
    if (!activeModal) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
    }
    if (e.key === "Tab") {
      const controls = [
        ...activeModal.querySelectorAll(
          'button,input,select,textarea,[tabindex="0"]',
        ),
      ].filter(
        (el) =>
          !el.disabled && el.type !== "hidden" && el.getClientRects().length,
      );
      if (!controls.length) {
        e.preventDefault();
        return;
      }
      const first = controls[0],
        last = controls.at(-1);
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          !activeModal.contains(document.activeElement))
      ) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  registerPrivateCleanup(() => {
    generation++;
    saving = false;
    closeModal(true);
    operationId = "";
    initialDraft = "";
    ui.open = new Set(["ledger"]);
    ui.includeTravel = true;
    ui.status = "all";
    ui.sort = "amount";
    ui.groupBy = "category";
    ui.picker = null;
    ui.collapsedGroups.clear();
    for (const el of $("item-drawer").querySelectorAll("input,textarea"))
      el.value = "";
    $("di-cat").replaceChildren();
    for (const id of [
      "wed-payment-name",
      "wed-payment-summary",
      "wed-payment-error",
      "wed-form-error",
      "wed-editor-context",
      "wed-last-payment",
      "wed-draft-paid",
      "wed-draft-remaining",
      "wed-draft-note",
      "hint-di-planned",
      "hint-di-deposit",
      "hint-di-actual",
    ])
      $(id).textContent = "";
    $("wed-category-help").hidden = true;
    for (const input of $("item-drawer").querySelectorAll('[aria-invalid]')) input.removeAttribute("aria-invalid");
    $("wed-payment-amount").value = "";
    $("wed-payment-date").value = "";
    root.replaceChildren();
  });
}
function openPayment(id) {
  const item = getState().items.find((i) => i.id === id);
  if (!item || paymentState(item).remaining <= 0 || saving) return;
  editingItem = structuredClone(item);
  operationId = crypto.randomUUID();
  $("wed-payment-name").textContent = item.name;
  $("wed-payment-summary").textContent =
    `현재 잔금 ${money(paymentState(item).remaining)} · 일부 납부도 기록할 수 있어요.`;
  $("wed-payment-amount").value =
    paymentState(item).remaining.toLocaleString("ko-KR");
  $("wed-payment-date").value = localDate();
  $("wed-payment-date").max = localDate();
  $("wed-payment-error").textContent = "";
  showModal($("wed-payment-dialog"));
  $("wed-payment-amount").focus();
}
async function savePayment() {
  if (saving || !editingItem) return;
  let patch;
  try {
    patch = paymentPatch(
      editingItem,
      $("wed-payment-amount").value,
      $("wed-payment-date").value,
      operationId,
    );
    if (isWeddingTravel(editingItem))
      patch = {
        actual: patch.actual,
        balance: patch.balance,
        memo: [
          editingItem.memo,
          `납부 기록 ${$("wed-payment-date").value} · ${parseWon($("wed-payment-amount").value).toLocaleString("ko-KR")}원`,
        ]
          .filter(Boolean)
          .join("\n"),
      };
  } catch (e) {
    $("wed-payment-error").textContent = e.message;
    return;
  }
  const item = editingItem,
    version = generation;
  busy(true);
  try {
    await updateItem(item.id, patch, item);
    if (version === generation) {
      busy(false);
      closeModal(true);
    }
  } catch (e) {
    if (version === generation) {
      busy(false);
      $("wed-payment-error").textContent =
        e.message || "저장하지 못했어요. 금액은 그대로예요.";
    }
  }
}
