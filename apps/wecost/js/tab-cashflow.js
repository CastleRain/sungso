import { personName } from "./planning-core.mjs";
import { localDate, validDate } from "./wedding-core.mjs";
import {
  money, exact, esc, icon, heading, button, field, saveFooter,
  bindFieldForm, syncForm, resetFieldForm, openHistory,
} from "./planning-ui.mjs";
import { mountWeddingCalendar } from "./wedding-calendar.mjs";

let getState;
const people = ["sohee", "sunwo"];
const el = (id) => document.getElementById(id);
const editors = {
  savings: { form: "cf-savings-edit", view: "cf-people-view", kind: "savings", label: "저축 계획" },
  support: { form: "cf-support-edit", view: "cf-support-view", kind: "settings", label: "지원금" },
  date: { form: "cf-date-edit", kind: "settings", label: "결혼일" },
};
const editButton = (key, label) => button(label,
  `data-cf-edit="${key}" aria-expanded="false" aria-controls="${editors[key].form}"`);
const editFooter = (key, label) => saveFooter(label).replace(
  '<button class="plan-button primary"',
  `${button("취소", `data-cf-cancel="${key}"`)}<button class="plan-button primary"`,
);

function setEditor(key, open, { saved = false } = {}) {
  const config = editors[key], form = el(config.form);
  if (form._busy) return;
  if (!open) form.querySelector("[data-date-close]")?.click();
  if (!saved) resetFieldForm(form, getState()[config.kind]);
  if (key === "support") syncSupportDefaults(form, getState().settings);
  form.hidden = !open;
  if (config.view) el(config.view).hidden = open;
  const trigger = el("tab-cashflow").querySelector(`[data-cf-edit="${key}"]`);
  trigger.setAttribute("aria-expanded", String(open));
  trigger.disabled = open;
  if (open) {
    el("cf-feedback").textContent = "";
    form.querySelector("input")?.focus({ preventScroll: true });
  } else {
    el("cf-feedback").textContent = saved ? `${config.label}을 저장했어요.` : "변경을 취소했어요.";
    trigger.focus({ preventScroll: true });
  }
}

function syncSupportDefaults(form, settings) {
  for (const side of ["Sohee", "Sunwo"]) {
    const input = form.querySelector(`[data-field="includeSupport${side}"]`);
    // Older documents omit these fields; inclusion defaults to true in the calculation.
    // Keep syncForm's null expected value so the first explicit edit compares correctly.
    if (!input._dirty && settings[`includeSupport${side}`] == null) input.checked = true;
  }
}

export function registerCashflowHandlers(getSt) {
  getState = getSt;
  const personView = (person) => `<article class="cf-person">
    <h3>${icon("piggy-bank", person === "sohee" ? "rose" : "sky")}${personName(person)}</h3>
    <dl class="cf-person-money"><div><dt>현재 모은 돈</dt><dd id="cf-${person}-current"></dd></div><div class="cf-person-expected"><dt>결혼 시 예상 금액</dt><dd id="cf-${person}-total"></dd></div></dl>
    <dl class="cf-person-plan"><div><dt>매달 저축</dt><dd id="cf-${person}-monthly"></dd></div><div><dt>정기 저축일</dt><dd id="cf-${person}-day"></dd></div></dl>
  </article>`;
  const personFields = (person) => `<fieldset class="cf-person-fields"><legend>${icon("piggy-bank", person === "sohee" ? "rose" : "sky")}${personName(person)}</legend><div class="plan-form-grid">
    ${field(`${person}Current`, "현재 모은 돈", { attrs: `aria-label="${personName(person)} 현재 모은 돈"` })}
    ${field(`${person}Monthly`, "매달 저축", { attrs: `aria-label="${personName(person)} 매달 저축"` })}
    ${field(`${person}Day`, "정기 저축일", { type: "number", optional: true, suffix: "일", attrs: `placeholder="미설정" aria-label="${personName(person)} 정기 저축일"` })}
  </div></fieldset>`;
  el("tab-cashflow").innerHTML = `
    <header class="plan-page-head cf-page-head"><div>${icon("piggy-bank", "rose")}<div><h1>우리 자금</h1><p>모은 돈과 앞으로의 저축 계획을 함께 봐요.</p></div></div>
      <div class="cf-header-actions">${editButton("date", '<span class="cf-date-label">결혼일</span><span id="cf-date-value">미설정</span><img src="assets/icons/calendar-check.svg" width="16" height="16" alt="">')}${button("변경 내역", "data-history")}</div>
    </header>
    <form class="plan-card cf-editor cf-date-editor" id="cf-date-edit" hidden><h2>결혼일 변경</h2>${field("weddingDate", "결혼일", { type: "date" })}${editFooter("date", "날짜 저장")}</form>
    <section class="plan-card cf-overview" aria-label="우리 자금 요약">
      <div class="cf-equation">
        <div class="cf-overview-part">${icon("cash-coin")}<div><span>현재 모은 돈</span><strong id="cf-current"></strong><small>두 사람의 모은 돈 합계</small></div></div>
        <span class="cf-operator" aria-hidden="true">+</span>
        <div class="cf-overview-part">${icon("calendar-check", "sky")}<div><span>결혼일까지 추가 저축</span><strong id="cf-future"></strong><small>남은 저축 계획 반영</small></div></div>
        <span class="cf-operator" aria-hidden="true">=</span>
        <div class="cf-overview-part cf-overview-result">${icon("piggy-bank", "sage")}<div><span>결혼 시 예상 저축</span><strong id="cf-total"></strong><small>결혼비용 차감 전 금액</small></div></div>
      </div><p class="plan-notice cf-overview-note" id="cf-forecast-note"></p>
    </section>
    <section class="plan-card cf-savings-card">
      ${heading("wallet2", "두 사람의 저축", editButton("savings", "저축 계획 수정"))}
      <div class="cf-people" id="cf-people-view">${people.map(personView).join("")}</div>
      <form class="cf-editor" id="cf-savings-edit" hidden><div class="cf-people">${people.map(personFields).join("")}</div><p class="plan-note">모은 돈은 현재 실제 금액으로 입력해주세요. 매달 저축은 앞으로의 예상액에 반영돼요.</p>${editFooter("savings", "저축 계획 저장")}</form>
      <details class="cf-calculation"><summary>계산 기준</summary><div id="cf-calculation-content"></div></details>
    </section>
    <section class="plan-card cf-support-card">
      ${heading("gift", "부모님 지원", editButton("support", "지원금 수정"))}
      <p class="plan-note cf-support-note">저축과 구분해 집 자금에 반영해요.</p>
      <div class="cf-support-summary" id="cf-support-view"><dl class="cf-support-people">${people.map(person => `<div><dt>${icon("envelope-heart", person === "sohee" ? "rose" : "sky")}${personName(person)} 측</dt><dd id="cf-${person}-support"></dd><dd class="cf-inclusion" id="cf-${person}-included"></dd></div>`).join("")}</dl><div class="cf-support-total"><span>포함한 지원금</span><strong id="cf-support-total"></strong></div></div>
      <form class="cf-editor" id="cf-support-edit" hidden><div class="cf-people">${people.map(person => `<fieldset class="cf-person-fields"><legend>${personName(person)} 측</legend>${field(person === "sohee" ? "parentSupportSohee" : "parentSupportSunwo", "지원 금액", {attrs: `aria-label="${personName(person)} 측 지원 금액"`})}${field(person === "sohee" ? "includeSupportSohee" : "includeSupportSunwo", "집 자금 계산에 포함", {type: "checkbox", attrs: `aria-label="${personName(person)} 측 지원금 집 자금 계산에 포함"`})}</fieldset>`).join("")}</div>${editFooter("support", "지원금 저장")}</form>
    </section>
    <div class="cf-page-footer"><span id="cf-feedback" role="status"></span>${button("집 시뮬에서 사용 가능 금액 보기", 'data-go="house"')}</div>`;
  for (const [key, config] of Object.entries(editors)) {
    bindFieldForm(el(config.form), config.kind, "main", { onSaved: () => setEditor(key, false, { saved: true }) });
  }
  mountWeddingCalendar(el("cf-date-edit").querySelector("input"));
  el("tab-cashflow").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.cfEdit) setEditor(b.dataset.cfEdit, true);
    if (b.dataset.cfCancel) setEditor(b.dataset.cfCancel, false);
    if (b.hasAttribute("data-history")) openHistory();
  });
}

export function renderCashflow(st) {
  if (!el("cf-current")) return;
  const f = st.forecast, dateReady = validDate(st.settings.weddingDate);
  for (const key of ["current", "future", "total"]) {
    const target = el(`cf-${key}`), value = key !== "current" && !dateReady ? null : f[key];
    target.textContent = money(value);
    target.title = exact(value);
  }
  el("cf-date-value").textContent = st.settings.weddingDate || "미설정";
  const relevantRecords = Object.entries(st.savings.monthlyRecords || {}).filter(([key]) =>
    /^(sohee|sunwo)_\d{4}-\d{2}$/.test(key) && key.split("_")[1] >= localDate().slice(0, 7) && key.split("_")[1] <= st.settings.weddingDate?.slice(0, 7),
  );
  el("cf-forecast-note").textContent = !dateReady
    ? "결혼일을 정하면 그날까지 모을 예상 금액을 함께 볼 수 있어요."
    : relevantRecords.length
      ? "이전에 저장한 월별 계획·납입 기록을 함께 반영했어요. 아래 계산 기준에서 확인할 수 있어요."
      : f.future === 0
        ? f.monthly === 0 ? "월 저축 계획이 없어 예상 저축이 현재 금액과 같아요." : "결혼일까지 남은 저축 일정이 없어 현재 모은 돈과 같아요."
        : f.approximate ? "저축일이 미설정된 사람은 다음 달부터 월 단위로 예상해요." : "결혼일까지 남은 정기 저축일을 기준으로 예상했어요.";
  for (const person of people) {
    const p = f.people[person];
    for (const key of ["current", "total", "monthly"]) {
      const value = key === "total" && !dateReady ? null : p[key];
      el(`cf-${person}-${key}`).textContent = money(value);
      el(`cf-${person}-${key}`).title = exact(value);
    }
    el(`cf-${person}-day`).textContent = p.day ? `매월 ${p.day}일` : "미설정";
    const side = person === "sohee" ? "Sohee" : "Sunwo", included = st.settings[`includeSupport${side}`] !== false;
    el(`cf-${person}-support`).textContent = money(st.settings[`parentSupport${side}`] || 0);
    const status = el(`cf-${person}-included`);
    status.textContent = included ? "계산에 포함" : "계산에서 제외";
    status.classList.toggle("excluded", !included);
  }
  el("cf-support-total").textContent = money(st.support);
  for (const config of Object.values(editors)) syncForm(el(config.form), st[config.kind]);
  syncSupportDefaults(el("cf-support-edit"), st.settings);
  el("cf-calculation-content").innerHTML = `<p>현재 모은 돈 + 결혼일까지 추가 저축 = 결혼 시 예상 저축이에요. 결혼비용·지원금·대출은 이 저축 합계에 섞지 않아요.</p>
    ${dateReady ? `<ul>${people.map(person => `<li><strong>${personName(person)}</strong> · 남은 저축 ${f.people[person].count}회 · 추가 ${money(f.people[person].future)}${f.people[person].day ? "" : " · 다음 달부터 월 단위 예상"}</li>`).join("")}</ul>` : "<p>결혼일을 먼저 설정해주세요.</p>"}
    ${relevantRecords.length ? `<p>기존 기록 중 예상액 계산 기간에 해당하는 내용이에요. 기록한 납입은 다시 더하지 않아요.</p><ul>${relevantRecords.map(([key, record]) => `<li>${personName(key.split("_")[0])} · ${esc(key.split("_")[1].replace("-", "."))} · ${record?.actual != null ? `납입 ${money(record.actual)} 기록됨 (추가 저축에서 제외)` : `월 계획 ${money(record?.planned ?? st.savings[`${key.split("_")[0]}Monthly`] ?? 0)}`}</li>`).join("")}</ul>` : ""}`;
}

export const initCashflowInputs = renderCashflow;
