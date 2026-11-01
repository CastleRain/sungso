import { upcomingPayments, simulation } from "./planning-core.mjs";
import { scenarioWithRate } from './loan-rates.mjs';
import { loanRateHTML } from './loan-rates-ui.mjs';
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
} from "./planning-ui.mjs";
import {
  weddingFxHTML,
  weddingRateHint,
  handleWeddingFinance,
} from "./wedding-funds-ui.mjs";
let getState,
  filter = "all";
const el = (id) => document.getElementById(id);
export function registerDashboardHandlers(getSt) {
  getState = getSt;
  el("tab-dashboard").innerHTML =
    `<header class="plan-page-head"><div>${icon("house-heart", "rose")}<div><h1>대시보드</h1><p>지금 볼 금액과 다음 할 일을 한눈에.</p></div></div></header><div class="plan-fx" id="db-fx"></div>
  <div class="plan-metrics three" id="db-metrics"></div>
  <div class="plan-columns"><section class="plan-card">${heading("calculator", "집 자금 계산", button("계산 기준 보기", 'data-go="cashflow"'))}<div id="db-equation"></div></section>
  <section class="plan-card">${heading("envelope-heart", "놓치지 말아야 할 납부", "", "rose")}<div class="plan-segments" id="db-due-filters">${[
    ["all", "전체"],
    ["overdue", "기한 지남"],
    ["week", "7일 내"],
    ["month", "30일 내"],
  ]
    .map(([k, v]) => button(v, `data-due="${k}" aria-pressed="${k === "all"}"`))
    .join(
      "",
    )}</div><div id="db-due-list"></div><div class="plan-card-foot"><small>완납하기 전까지 일정에 남아요.</small>${button("전체 일정 보기", "data-wedding-schedule")}</div></section></div>
  <section class="plan-card plan-wallet" id="db-wallet"></section>
  <section class="plan-card plan-target-preview">${heading("house-heart", "목표 집값 미리 보기", button("집 시뮬에서 조건 바꾸기", 'data-go="house"'))}<div class="plan-preview-columns"><form id="db-target-form">${field("targetHousePrice", "목표 집값")}${saveFooter("목표 저장")}</form><div id="db-goal-result"></div></div></section>`;
  bindFieldForm(el("db-target-form"), "settings");
  el("db-target-form").addEventListener("input", () =>
    renderDashboard(getState()),
  );
  el("tab-dashboard").addEventListener("click", (e) => {
    const target = e.target.closest("button");
    if (!target) return;
    if (target.dataset.due) {
      filter = target.dataset.due;
      renderDashboard(getState());
    }
    if (target.hasAttribute("data-wedding-schedule")) {
      window._showTab("wedding");
      const schedule = el("wed-schedule");
      if (schedule) {
        schedule.open = true;
        schedule.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }
    if (target.hasAttribute("data-finance")) handleWeddingFinance(target);
  });
}
export function renderDashboard(st) {
  if (!el("db-metrics")) return;
  const limit = st.settings?.monthlyPaymentLimit || 0,
    ratio =
      limit && st.totalMonthly != null
        ? Math.round((st.totalMonthly / limit) * 100)
        : null;
  const metric = (name, title, value, sub, tone = "cream") =>
    `<article class="plan-card plan-metric">${icon(name, tone)}<div><span>${title}</span><strong>${value}</strong><small>${sub}</small></div></article>`;
  el("db-metrics").innerHTML =
    metric(
      "cash-coin",
      "집에 쓸 예상 현금",
      money(st.availCash),
      st.cashShortfall
        ? `<b class="plan-rose">자금 부족 ${money(st.cashShortfall)}</b>`
        : st.weddingCashRequired == null ? "결혼자금·환율 확인 필요" : "결혼 추가 필요액·별도 지출 차감 후",
    ) +
    metric(
      "house-heart",
      "등록 대출 포함 집 예산",
      money(st.houseBudget),
      `포함한 대출 ${money(st.loanTotal)}`,
      "rose",
    ) +
    metric(
      "calendar-check",
      "등록 대출 월 상환액",
      money(st.totalMonthly),
      ratio == null
        ? "월 한도 미설정"
        : `<div class="plan-meter"><span style="width:${Math.min(100, ratio)}%"></span></div>월 한도 ${money(limit)} · ${ratio}%`,
      "sage",
    );
  const lines = [
    ["결혼 시 예상 저축", st.coupleSavings],
    ["포함한 부모님 지원", st.support],
    ["결혼에 추가로 모을 돈", st.weddingCashRequired == null ? null : -st.weddingCashRequired],
    ["추가 수입·지출", st.adjustmentsTotal],
  ];
  el("db-equation").innerHTML =
    `<dl class="plan-equation">${lines.map(([name, n]) => `<div><dt>${name}</dt><dd class="${n < 0 ? "plan-rose" : ""}">${n > 0 && name !== "결혼 시 예상 저축" ? "+ " : ""}${money(n)}</dd></div>`).join("")}<div class="total"><dt>집에 쓸 예상 현금</dt><dd>${money(st.availCash)}</dd></div></dl><p class="plan-note">결혼비용의 ‘추가로 모을 돈’만 차감해요. 이미 낸 비용은 다시 빼지 않으며, 보유 결혼자금·예상 수입은 추가 필요액에 반영돼 있어요. 회사 대출은 집 예산에 따로 더해요.${st.weddingCashRequired == null ? " 결혼자금·환율 확인 전에는 집 예상액을 표시하지 않아요." : ""}${st.cashShortfall ? ` 부족액 ${money(st.cashShortfall)}도 집 예산에 반영해요.` : ""}${esc(weddingRateHint(st.items))}${st.forecast?.approximate ? " · 저축일 미설정: 월 단위 예상" : ""}</p>`;
  const due = upcomingPayments(st.displayItems || [], filter);
  el("db-due-list").innerHTML = due.length
    ? due
        .slice(0, 3)
        .map(
          (i) =>
            `<div class="plan-due-row"><span class="plan-due-date">${esc(i.balanceDue.slice(5).replace("-", "/"))}<small class="${i.days < 0 ? "plan-rose" : ""}">${i.days < 0 ? `${-i.days}일 지남` : i.days === 0 ? "오늘" : `D-${i.days}`}</small></span><span class="plan-due-name">${esc(i.name)}</span><strong class="plan-rose">${money(i.payment.remaining)}</strong>${button("납부 기록", `data-finance="payment" data-id="${esc(i.travelParentId || i.id)}" data-row="${esc(i.travelRowId || "")}" aria-label="${esc(i.name)} 납부 기록"`)}</div>`,
        )
        .join("") +
      (due.length > 3
        ? `<p class="plan-note">이 조건의 납부 ${due.length}건 · 가까운 순 3건 표시</p>`
        : "")
    : '<p class="plan-empty">이 조건에 해당하는 납부가 없어요.</p>';
  el("db-due-filters")
    .querySelectorAll("button")
    .forEach((b) => b.setAttribute("aria-pressed", b.dataset.due === filter));
  const f = st.funding || {};
  el("db-wallet").innerHTML =
    `<h2>${icon("wallet2", "rose")}결혼자금 확인</h2><div><span>남은 잔금</span><strong class="plan-rose">${money(st.totalBalance)}</strong></div><div><span>보유 자금 평가액</span><strong>${money(f.available)}</strong></div><div><span>예상 수입</span><strong>${money(f.expectedIncome || 0)}</strong></div><div><span>${f.surplus > 0 ? "예산보다 남는 돈" : "추가로 모을 돈"}</span><strong class="plan-rose">${money(f.surplus || f.needed)}</strong></div>${button("예산 범위·예상 수입", 'data-wedding-budget=""')}${button("결혼비용에서 확인", 'data-go="wedding"')}<p class="plan-note">예상 수입 전 추가 필요 ${money(f.neededBeforeIncome)} · 수입 반영 후 ${money(f.needed)}. 보유 결혼자금은 집 자금에 다시 더하지 않아요.${st.financeLoading ? " 결혼자금 연결 확인 중." : ""}</p>`;
  syncForm(el("db-target-form"), st.settings);
  try {
    const targetInput = el("db-target-form").querySelector("input");
    const rateScenario = scenarioWithRate(st.settings?.houseScenario || {}, st.marketRate);
    if (rateScenario.rateMode === 'market' && !st.marketRate?.usable) throw Error('공표 금리 자료 확인 중이에요. 집 시뮬에서 직접 금리를 입력할 수도 있어요.');
    const sim = simulation(st, {
      ...scenarioWithRate(st.settings?.houseScenario || {}, st.marketRate),
      target: Number(targetInput.value.replaceAll(",", "")),
    });
    el("db-goal-result").innerHTML = sim.target
      ? `<div><span>추가로 필요한 대출</span><strong>${money(sim.additional)}</strong><small>등록 대출 ${money(sim.basePrincipal)} 먼저 반영</small></div><div><span>합산 월 상환액</span><strong>${money(sim.monthly)}</strong><small>추가 대출 연 ${sim.terms.rate}% · ${sim.terms.term}년 · 거치 ${sim.terms.grace}년</small></div><p class="plan-note">거치 종료 후 ${sim.terms.type === "원금" ? "첫 달" : "상환"} 기준${sim.simple ? " · 부대비용·남겨둘 현금 입력 전" : ""}</p>`
      : '<p class="plan-empty">목표 집값을 저장하면 추가 대출과 월 부담이 연결돼요.</p>';
  } catch (error) {
    el("db-goal-result").textContent = error.message;
  }
  el("db-goal-result").insertAdjacentHTML('beforeend', loanRateHTML(st.marketRate, scenarioWithRate(st.settings?.houseScenario || {}, st.marketRate).rateMode));
  el("db-fx").innerHTML = weddingFxHTML().replace(
    'id="wf-fx-panel"',
    'id="db-fx-panel"',
  );
}
export function renderChecklist() {}
