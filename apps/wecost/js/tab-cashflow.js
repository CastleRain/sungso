import { monthRange, recordKey, personName } from "./planning-core.mjs";
import { localDate } from "./wedding-core.mjs";
import {
  money,
  esc,
  icon,
  heading,
  button,
  field,
  saveFooter,
  bindFieldForm,
  syncForm,
  formValues,
  openDialog,
  closeDialog,
  submitCommand,
  showError,
  openHistory,
} from "./planning-ui.mjs";
import { mountWeddingCalendar } from "./wedding-calendar.mjs";
let getState,
  offset = 0;
const el = (id) => document.getElementById(id);
export function registerCashflowHandlers(getSt) {
  getState = getSt;
  const personForm = (person) =>
    `<form id="plan-${person}" class="plan-person"><h3>${icon("piggy-bank", person === "sohee" ? "rose" : "sky")}${personName(person)}<small id="${person}-forecast"></small></h3><div class="plan-form-grid">${field(`${person}Current`, "모은 돈")}${field(`${person}Monthly`, "월 저축액")}${field(`${person}Day`, "정기 저축일", { type: "number", optional: true, suffix: "일", attrs: 'placeholder="미설정"' })}<div class="plan-field"><span>이번 달 납입</span><strong id="${person}-month-state"></strong>${button("기록", `data-person-record="${person}"`)}</div></div>${saveFooter()}</form>`;
  el("tab-cashflow").innerHTML =
    `<header class="plan-page-head"><div>${icon("piggy-bank", "rose")}<div><h1>현금흐름</h1><p>우리의 저축 계획을 차근차근 기록해요.</p></div></div>${button("변경 내역", "data-history")}</header>
  <form class="plan-date-form" id="plan-wedding-date">${field("weddingDate", "결혼일", { type: "date" })}${saveFooter("날짜 저장")}</form>
  <div class="plan-metrics three" id="cf-summary"></div><div class="plan-columns"><section class="plan-card">${heading("pencil-square", "우리 저축 계획")}${personForm("sohee")}${personForm("sunwo")}<p class="plan-notice" id="cf-forecast-note"></p></section><section class="plan-card">${heading("calendar-check", "월별 저축 기록", `<div class="plan-month-nav">${button("이전", 'data-month-step="-1" aria-label="이전 5개월"')}<span id="cf-period"></span>${button("다음", 'data-month-step="1" aria-label="다음 5개월"')}</div>`, "sky")}<p class="plan-note">예정한 금액과 실제 납입을 함께 확인해요.</p><div id="cf-records"></div><p class="plan-note">실제 납입을 모은 돈에 이미 넣었는지 구분해 기록해요. 과거 기록은 자동으로 만들지 않아요.</p></section></div>
  <section class="plan-card">${heading("gift", "부모님 지원", "<small>저축과 구분해 집 자금에 반영해요.</small>")}<div class="plan-support-grid"><form id="cf-support">${["sohee", "sunwo"].map((person) => `<div class="plan-support-row"><strong>${personName(person)} 측</strong>${field(person === "sohee" ? "parentSupportSohee" : "parentSupportSunwo", "지원 금액")}${field(person === "sohee" ? "includeSupportSohee" : "includeSupportSunwo", "집 자금에 포함", { type: "checkbox" })}</div>`).join("")}${saveFooter("지원금 저장")}</form><div class="plan-support-total"><span>포함한 지원금</span><strong id="cf-support-total"></strong></div></div></section>`;
  for (const person of ["sohee", "sunwo"])
    bindFieldForm(el(`plan-${person}`), "savings");
  bindFieldForm(el("cf-support"), "settings");
  bindFieldForm(el("plan-wedding-date"), "settings");
  mountWeddingCalendar(el("plan-wedding-date").querySelector("input"));
  el("tab-cashflow").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-month-step")) {
      offset += Number(b.dataset.monthStep) * 5;
      renderCashflow(getState());
    }
    if (b.dataset.recordMonth) openRecord(b.dataset.recordMonth);
    if (b.dataset.personRecord)
      openRecord(localDate().slice(0, 7), b.dataset.personRecord);
    if (b.hasAttribute("data-history")) openHistory();
  });
}
export function renderCashflow(st) {
  if (!el("cf-summary")) return;
  const f = st.forecast;
  el("cf-summary").innerHTML = [
    ["cash-coin", "등록한 저축", f.current, "두 사람의 모은 돈 합계"],
    [
      "calendar-check",
      "월 저축 계획",
      f.monthly,
      "기본 월 계획 · 월별로 조정 가능",
    ],
    [
      "piggy-bank",
      "결혼 시 예상 저축",
      f.total,
      f.approximate
        ? "저축일 미설정 · 월 단위 예상"
        : "결혼일까지 남은 납입일 반영",
    ],
  ]
    .map(
      ([ic, label, n, sub]) =>
        `<article class="plan-card plan-metric">${icon(ic)}<div><span>${label}</span><strong>${money(n)}</strong><small>${sub}</small></div></article>`,
    )
    .join("");
  for (const person of ["sohee", "sunwo"]) {
    syncForm(el(`plan-${person}`), st.savings);
    el(`${person}-forecast`).textContent =
      `결혼 시 ${money(f.people[person].total)}`;
    const record = f.people[person].currentRecord;
    el(`${person}-month-state`).textContent =
      record?.actual != null ? `${money(record.actual)} 기록됨` : "미확인";
  }
  syncForm(el("cf-support"), st.settings);
  syncForm(el("plan-wedding-date"), st.settings);
  el("cf-support-total").textContent = money(st.support);
  el("cf-forecast-note").textContent = f.approximate
    ? "저축일을 정하면 결혼일까지 남은 납입 횟수를 계산해요. 미설정인 사람은 다음 달부터 월 단위로 예상해요."
    : `남은 정기 저축 · 소희 ${f.people.sohee.count}회 / 성우 ${f.people.sunwo.count}회. 오늘 예정분 포함, 이미 기록한 납입은 제외해요.`;
  const now = new Date(),
    start = new Date(now.getFullYear(), now.getMonth() + offset, 1),
    end = new Date(start.getFullYear(), start.getMonth() + 4, 1);
  const months = monthRange(
    localDate(start).slice(0, 7),
    localDate(end).slice(0, 7),
  );
  el("cf-period").textContent =
    `${months[0].replace("-", ".")} – ${months.at(-1).replace("-", ".")}`;
  el("cf-records").innerHTML =
    `<table class="plan-record-table"><thead><tr><th>월</th><th>예정</th><th>실제 납입</th><th><span class="sr-only">기록</span></th></tr></thead><tbody>${months
      .map((month) => {
        const records = ["sohee", "sunwo"].map(
          (p) => st.savings.monthlyRecords?.[recordKey(p, month)],
        );
        const planned = records.reduce(
          (s, r, i) =>
            s +
            (r?.planned ??
              st.savings[i === 0 ? "soheeMonthly" : "sunwoMonthly"] ??
              0),
          0,
        );
        const actual = records.some((r) => r?.actual != null)
          ? records.reduce((s, r) => s + (r?.actual || 0), 0)
          : null;
        const complete = records.every((r) => r?.actual != null);
        return `<tr><th>${month.replace("-", ".")}</th><td>${money(planned)}</td><td>${money(actual)}${actual != null ? `<small>${complete ? "두 사람 기록" : "한 사람 기록"}</small>` : ""}</td><td>${button("기록·계획", `data-record-month="${month}" aria-label="${month} 기록과 계획"`)}</td></tr>`;
      })
      .join("")}</tbody></table>`;
}
function openRecord(month, person = "sohee") {
  const savings = getState().savings,
    old = savings.monthlyRecords?.[recordKey(person, month)] ?? null;
  const source = {
    planned: old?.planned ?? savings[`${person}Monthly`] ?? 0,
    actual: old?.actual ?? null,
    paidDate:
      old?.paidDate ||
      (month === localDate().slice(0, 7) ? localDate() : `${month}-01`),
    alreadyIncluded: old?.alreadyIncluded ?? true,
  };
  let cal;
  const dlg = openDialog(
    `${month.replace("-", ".")} 저축 기록`,
    `<form id="saving-record-form"><div class="plan-segments">${["sohee", "sunwo"].map((p) => button(personName(p), `data-record-person="${p}" aria-pressed="${p === person}"`)).join("")}</div><div class="plan-form-grid">${field("planned", "이달 예정 금액")}${field("actual", "실제 납입액", { optional: true, attrs: 'placeholder="미확인 · 계획만 저장"' })}${field("paidDate", "실제 납입일", { type: "date", attrs: `max="${localDate()}"` })}${field("alreadyIncluded", "실제 납입을 모은 돈에 이미 포함", { type: "checkbox" })}</div><p class="plan-notice">체크하면 모은 돈을 그대로 유지해요. 해제하면 실제 납입액을 더하고, 나중에 정정할 때 이전 자동 반영액과의 차이만 적용해요.</p><p class="plan-note">실제 납입액을 비워두면 계획만 저장해요. 0원은 납입하지 않았다고 확인한 기록이에요.</p>${saveFooter("기록 저장")}</form>`,
    (d) => {
      const form = d.querySelector("form");
      syncForm(form, source);
      cal = mountWeddingCalendar(form.querySelector("input[type=date]"));
      form.addEventListener("click", (e) => {
        const b = e.target.closest("[data-record-person]");
        if (b) {
          cal?.destroy();
          openRecord(month, b.dataset.recordPerson);
        }
      });
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          const values = formValues(form);
          await submitCommand(form, {
            kind: "savings",
            action: "record",
            expectedRecord: old,
            record: { person, month, ...values },
          });
          cal?.destroy();
          closeDialog();
        } catch (error) {
          showError(form, error);
        }
      });
    },
  );
  dlg.addEventListener("close", () => cal?.destroy(), { once: true });
}
export const initCashflowInputs = renderCashflow;
