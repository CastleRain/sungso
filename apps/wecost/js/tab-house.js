import {
  simulation,
  PRESET_AMOUNTS,
  loanMonthly,
  loanPhases,
  validateLoan,
} from "./planning-core.mjs";
import {
  money,
  exact,
  esc,
  icon,
  heading,
  button,
  field,
  saveFooter,
  bindFieldForm,
  syncForm,
  formValues,
  readInput,
  writeInput,
  openDialog,
  closeDialog,
  submitCommand,
  showError,
} from "./planning-ui.mjs";
import { scenarioWithRate } from './loan-rates.mjs';
import { loanRateHTML } from './loan-rates-ui.mjs';
let getState,
  tab = "goal",
  scenario = null,
  baseline = null,
  scenarioDirty = false,
  scenarioError = "",
  selected = 3e8;
const el = (id) => document.getElementById(id);
const types = {
  원리금: "원리금균등",
  원금: "원금균등",
  만기: "만기일시",
  company: "회사대출 (원리금균등)",
};
const typeField = (key = "type") =>
  `<label class="plan-field"><span>상환 방식</span><select data-field="${key}" data-format="text">${Object.entries(
    types,
  )
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join("")}</select><small class="plan-field-state"></small></label>`;
const conditions = () =>
  `<div class="plan-form-grid four">${field("rate", "연 금리", { type: "number", suffix: "%" })}${field("term", "총 기간", { type: "number", suffix: "년" })}${field("grace", "거치 기간", { type: "number", suffix: "년" })}${typeField()}</div>`;
export function registerHouseHandlers(getSt) {
  getState = getSt;
  el("tab-house").innerHTML =
    `<header class="plan-page-head"><div>${icon("house-heart", "rose")}<div><h1>집 시뮬레이션</h1><p>집값과 대출 조건을 바꾸며, 월 부담을 비교해요.</p></div></div></header>
 <div class="plan-house-tabs" role="tablist" aria-label="집 시뮬레이션 화면">${[
   ["goal", "목표 집값"],
   ["amounts", "대출 금액별 비교"],
   ["loans", "내 대출 관리"],
 ]
   .map(([k, v]) =>
     button(
       v,
       `role="tab" id="house-tab-${k}" data-house-tab="${k}" aria-controls="house-view-${k}" aria-selected="${k === "goal"}" tabindex="${k === "goal" ? 0 : -1}"`,
     ),
   )
   .join("")}</div>
 <section id="house-view-goal" class="house-view" role="tabpanel" aria-labelledby="house-tab-goal"><div class="plan-columns house-goal-grid"><section class="plan-card">${heading("cash-coin", "집값과 사용할 자금")}<form id="house-target-form">${field("targetHousePrice", "목표 집값")}${saveFooter("목표 저장")}</form><div class="plan-band cream" id="house-cash-band"></div><div class="plan-band sky" id="house-base-band"></div><div id="house-goal-conditions"></div></section><section class="plan-card house-result">${heading("calculator", "등록 대출을 포함한 월 부담", "", "sage")}<div id="house-goal-result"></div><form id="house-limit-form">${field("monthlyPaymentLimit", "월 상환 한도")}${saveFooter("한도 저장")}</form>${button("상환 흐름 보기", 'data-phases="goal"')}</section></div><section class="plan-card" id="house-funding"></section></section>
 <section id="house-view-amounts" class="house-view" role="tabpanel" aria-labelledby="house-tab-amounts" hidden><section class="plan-card plan-base-equation" id="house-comparison-base"></section><section class="plan-card" id="house-amount-conditions"></section><div id="preset-grid" class="plan-presets"></div><section class="plan-card plan-selection" id="house-selection"></section><p class="plan-note">등록 대출과 추가 대출의 거치 종료 후 부담을 합한 참고값이에요. 대출 승인·가능 여부를 판단하는 값은 아니에요.</p></section>
 <section id="house-view-loans" class="house-view" role="tabpanel" aria-labelledby="house-tab-loans" hidden><div class="plan-columns house-loans-grid"><section><div class="plan-card-head"><h2>등록한 대출 <span id="house-loan-count"></span></h2>${button("대출 추가", "data-add-loan", true)}</div><div id="loan-grid" class="plan-loan-list"></div></section><section class="plan-card" id="house-loan-summary"></section></div><p class="plan-notice">등록한 대출은 받을 예정인 조건이에요. 현재 통장 잔액이나 실제 남은 대출 원금을 뜻하지 않아요.</p></section>`;
  const form = document.createElement("form");
  form.id = "house-condition-form";
  form.className = "plan-conditions";
  form.innerHTML = `<div class="plan-form-grid">${field("fees", "추가 부대비용", { optional: true, attrs: 'placeholder="미설정"' })}${field("reserve", "남겨둘 현금", { optional: true, attrs: 'placeholder="미설정"' })}</div><p class="plan-note">이미 차감한 이사비·가전비는 다시 넣지 않아요.</p>${heading("calculator", "추가 대출 조건", "", "sage")}<label class="plan-field"><span>비교 금리 기준</span><select data-field="rateMode" data-format="text"><option value="market">최신 공표 평균 자동 반영</option><option value="manual">직접 입력한 금리</option></select></label><div id="house-rate-evidence"></div>${conditions()}<p class="plan-note">등록 대출 외에 추가로 빌릴 금액에 적용해요.</p>${saveFooter("비교 조건 저장")}`;
  el("house-goal-conditions").append(form);
  bindFieldForm(el("house-target-form"), "settings");
  bindFieldForm(el("house-limit-form"), "settings");
  form.addEventListener("input", () => {
    scenarioDirty = true;
    form.dataset.dirty = "true";
    try {
      const rateMode = form.querySelector('[data-field=rateMode]').value;
      const rateInput = form.querySelector('[data-field=rate]');
      if (rateMode === 'market') writeInput(rateInput, getState().marketRate?.usable ? getState().marketRate.value : null);
      rateInput.readOnly = rateMode === 'market';
      if (rateMode === 'market' && !getState().marketRate?.usable) throw Error('최신 공표 금리를 확인하거나 직접 입력을 선택해주세요.');
      const v = formValues(form);
      scenario = {
        rateMode: v.rateMode,
        fees: v.fees,
        reserve: v.reserve,
        terms: { rate: v.rate, term: v.term, grace: v.grace, type: v.type },
      };
      validateLoan({ ...scenario.terms, amount: 0 });
      scenarioError = "";
    } catch (e) {
      scenarioError = e.message;
    }
    form.querySelector(".plan-save-status").textContent = "저장 전 비교 조건";
    el('house-rate-evidence').innerHTML = loanRateHTML(getState().marketRate, form.querySelector('[data-field=rateMode]').value);
    renderResults(getState());
  });
  form.addEventListener("change", () =>
    form.dispatchEvent(new Event("input", { bubbles: true })),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      if (scenarioError) throw Error(scenarioError);
      await submitCommand(form, {
        kind: "settings",
        values: { houseScenario: scenario },
        expected: { houseScenario: baseline },
      });
      scenarioDirty = false;
      form.dataset.dirty = "false";
      baseline = structuredClone(scenario);
    } catch (error) {
      showError(form, error);
      if (
        error.code === "planning-conflict" &&
        error.conflicts.includes("houseScenario")
      ) {
        const panel = form.querySelector(".plan-conflicts");
        const latest = error.latest?.houseScenario;
        panel.innerHTML = `<strong>비교 조건이 다른 기기에서 변경됐어요</strong><p>최신 조건: ${latest ? `연 ${latest.terms.rate}% · ${latest.terms.term}년 · 거치 ${latest.terms.grace}년 · 부대비용 ${money(latest.fees)} · 남겨둘 현금 ${money(latest.reserve)}` : "미설정"}</p>${button("최신 조건 사용", "data-scenario-latest")}${button("내 입력 유지", "data-scenario-mine")}`;
        panel.querySelector("[data-scenario-latest]").onclick = () => {
          scenarioDirty = false;
          scenarioError = "";
          form.dataset.dirty = "false";
          panel.remove();
          renderHouse(getState());
        };
        panel.querySelector("[data-scenario-mine]").onclick = () => {
          baseline = structuredClone(latest ?? null);
          form._operation = null;
          panel.remove();
          form.querySelector(".plan-save-status").textContent =
            "내 입력을 유지했어요. 확인 후 다시 저장해주세요";
        };
      }
    }
  });
  el("house-target-form").addEventListener("input", () =>
    renderResults(getState()),
  );
  el("tab-house").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.houseTab) showHouseTab(b.dataset.houseTab);
    if (b.hasAttribute("data-adjustments")) openAdjustments();
    if (b.hasAttribute("data-add-loan")) openLoan();
    if (b.dataset.editLoan) openLoan(b.dataset.editLoan);
    if (b.dataset.deleteLoan) confirmDelete("loan", b.dataset.deleteLoan);
    if (b.dataset.toggleLoan) toggleLoan(b);
    if (b.dataset.preset) {
      selected = Number(b.dataset.preset);
      renderResults(getState());
    }
    if (b.hasAttribute("data-apply-preset")) {
      try {
        const result = simulation(getState(), {
          ...scenario,
          additional: selected,
        });
        const input = el("house-target-form").querySelector("input");
        writeInput(input, Math.round(result.houseBudget));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        showHouseTab("goal");
      } catch (error) {
        scenarioError = error.message;
        renderResults(getState());
      }
    }
    if (b.dataset.phases) openPhases(b.dataset.phases);
  });
  el("tab-house")
    .querySelector("[role=tablist]")
    .addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const keys = ["goal", "amounts", "loans"],
        idx = keys.indexOf(tab);
      showHouseTab(
        e.key === "Home"
          ? "goal"
          : e.key === "End"
            ? "loans"
            : keys[(idx + (e.key === "ArrowRight" ? 1 : 2)) % 3],
      );
      el(`house-tab-${tab}`).focus();
    });
  window._showHouseView = showHouseTab;
}
export function showHouseTab(next) {
  tab = next;
  document.querySelectorAll("[data-house-tab]").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.houseTab === tab);
    b.tabIndex = b.dataset.houseTab === tab ? 0 : -1;
  });
  document
    .querySelectorAll(".house-view")
    .forEach((v) => (v.hidden = v.id !== `house-view-${tab}`));
  if (tab !== "loans")
    el(
      tab === "goal" ? "house-goal-conditions" : "house-amount-conditions",
    ).append(el("house-condition-form"));
  renderHouse(getState());
}
function savedScenario(st) {
  return scenarioWithRate(st.settings.houseScenario || { fees: null, reserve: null }, st.marketRate);
}
export function renderHouse(st) {
  if (!el("house-target-form")) return;
  syncForm(el("house-target-form"), st.settings);
  syncForm(el("house-limit-form"), st.settings);
  if (!scenarioDirty) {
    baseline = structuredClone(st.settings.houseScenario ?? null);
    scenario = structuredClone(savedScenario(st));
    const source = {
      ...scenario.terms,
      rateMode: scenario.rateMode,
      fees: scenario.fees,
      reserve: scenario.reserve,
    };
    for (const input of el("house-condition-form").querySelectorAll(
      "[data-field]",
    ))
      writeInput(input, source[input.dataset.field]);
  }
  if (scenario.rateMode === 'market') {
    scenario = scenarioWithRate(scenario, st.marketRate);
    writeInput(el('house-condition-form').querySelector('[data-field=rate]'), scenario.terms.rate);
  }
  el('house-condition-form').querySelector('[data-field=rate]').readOnly = scenario.rateMode === 'market';
  el('house-rate-evidence').innerHTML = loanRateHTML(st.marketRate, scenario.rateMode);
  el("house-cash-band").innerHTML =
    `${icon("piggy-bank", "rose")}<div><span>집에 쓸 예상 현금</span><strong>${money(st.availCash)}</strong><small>${st.cashShortfall ? `먼저 채울 부족액 ${money(st.cashShortfall)}` : "저축·지원금에서 결혼비용과 추가 지출 차감"}</small></div>${button("자금 계산·조정", "data-adjustments")}`;
  const loans = st.loans.filter((l) => l.enabled !== false);
  el("house-base-band").innerHTML =
    `${icon("bank", "sky")}<div><span>받을 예정인 등록 대출 · 기본 포함</span><strong>${money(st.loanTotal)}</strong><small>${esc(loans.map((l) => `${l.name} · 연 ${l.rate}% · 총 ${l.term}년 · 거치 ${l.grace || 0}년`).join(" / ") || "등록한 대출이 없어요")}</small></div>${button("조건 관리", 'data-house-tab="loans"')}`;
  el("house-loan-count").textContent =
    `${st.loans.length}건 · 포함 ${loans.length}건`;
  el("loan-grid").innerHTML = st.loans.length
    ? st.loans
        .map((l) => {
          let m = null;
          try {
            m = loanMonthly(l);
          } catch {}
          return `<article class="plan-card plan-loan"><div class="plan-card-head"><h3>${icon("bank", "sky")}${esc(l.name)}</h3><div>${button(l.enabled === false ? "합계에서 제외됨" : "합계에 포함", `data-toggle-loan="${esc(l.id)}" aria-pressed="${l.enabled !== false}"`)}${button("수정", `data-edit-loan="${esc(l.id)}" aria-label="${esc(l.name)} 수정"`)}<details class="plan-more"><summary aria-label="${esc(l.name)} 더보기">더보기</summary>${button("대출 삭제", `data-delete-loan="${esc(l.id)}"`)}</details></div></div><dl class="plan-loan-spec">${[
            ["대출 금액", money(l.amount)],
            ["연 금리", `${l.rate}%`],
            ["총 기간", `${l.term}년`],
            ["거치 기간", `${l.grace || 0}년`],
            ["상환 방식", types[l.type] || l.type],
          ]
            .map(([a, b]) => `<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`)
            .join(
              "",
            )}</dl><div class="plan-card-foot"><span>거치 ${l.grace || 0}년 → 상환 ${l.term - (l.grace || 0)}년${l.type === "원금" ? " · 상환 첫 달" : l.type === "만기" ? " · 원금 만기 별도" : ""}</span><strong>${m === null ? "조건 확인 필요" : `월 ${money(m)}`}</strong></div></article>`;
        })
        .join("")
    : '<div class="plan-card plan-empty">등록한 대출이 없어요. 받을 예정인 조건을 추가해주세요.</div>';
  const ratio =
    st.settings.monthlyPaymentLimit && st.totalMonthly != null
      ? (st.totalMonthly / st.settings.monthlyPaymentLimit) * 100
      : null;
  el("house-loan-summary").innerHTML =
    `${heading("calculator", "포함한 대출 합계", "", "sage")}<dl class="plan-equation"><div><dt>대출 금액</dt><dd>${money(st.loanTotal)}</dd></div><div class="total"><dt>거치 종료 후 월</dt><dd>${money(st.totalMonthly)}</dd></div></dl>${meter(ratio)}<p class="plan-note">월 한도 ${money(st.settings.monthlyPaymentLimit)}${ratio != null ? ` · ${Math.round(ratio)}%` : ""}</p><p class="plan-notice">실행일·실제 거치 이자 조건 확인 전이에요. 원금균등은 첫 상환액, 만기일시는 이자만 포함해요.</p>${button("상환 흐름 보기", 'data-phases="loans"')}`;
  renderResults(st);
}
function meter(ratio) {
  return `<div class="plan-meter ${ratio > 100 ? "over" : ratio > 80 ? "near" : ""}"><span style="width:${ratio == null ? 0 : Math.min(100, Math.max(0, ratio))}%"></span></div>`;
}
function renderResults(st) {
  try {
    if (scenarioError) throw Error(scenarioError);
    if (scenario?.rateMode === 'market' && !st.marketRate?.usable) throw Error('최신 공표 금리를 확인하거나 직접 입력을 선택해주세요.');
    const input = el("house-target-form").querySelector(
      "[data-field=targetHousePrice]",
    );
    const target = readInput(input),
      s = simulation(st, { ...scenario, target });
    el("house-goal-result").innerHTML =
      `<span class="plan-chip">${s.simple ? "간편 예상" : "입력 조건 기준"}</span><div class="plan-hero-number">${money(s.monthly)}<small>/ 월</small></div>${meter(s.ratio)}<p class="plan-note">${s.ratio == null ? "월 한도를 설정해주세요" : `월 한도 대비 ${Math.round(s.ratio)}%`}</p><dl class="plan-equation"><div><dt>필요한 총 대출</dt><dd>${money(s.totalPrincipal)}</dd></div><div><dt>등록 대출 (기본 포함)</dt><dd>${money(s.basePrincipal)}</dd></div><div><dt>추가로 필요한 대출</dt><dd>${money(s.additional)}</dd></div><div class="total"><dt>${s.headroom < 0 ? "월 한도 초과" : "월 한도까지 여유"}</dt><dd class="${s.headroom < 0 ? "plan-rose" : ""}">${money(s.headroom == null ? null : Math.abs(s.headroom))}</dd></div></dl><p class="plan-notice">${s.simple ? "부대비용·남겨둘 현금 입력 전. " : ""}각 대출의 거치 종료 후 ${s.terms.type === "원금" ? "첫 상환액" : "월 부담"}을 합한 값이에요.${s.terms.type === "만기" ? " 추가 대출 원금은 만기에 별도로 갚아요." : ""}</p>`;
    const total = Math.max(s.target, s.houseBudget, 1),
      parts = [
        ["우리 현금", Math.max(0, s.usableCash), "sky"],
        ["등록 대출", s.basePrincipal, "cream"],
        ["추가 대출", s.additional, "sage"],
      ];
    el("house-funding").innerHTML =
      `${heading("house-heart", `${money(s.target)} 집값, 이렇게 마련해요`)}<div class="plan-stack">${parts.map(([label, n, tone]) => `<span class="${tone}" style="flex:${n || 0.00001}" title="${label} ${exact(n)}"></span>`).join("")}</div><div class="plan-funding-legend">${parts.map(([label, n, tone]) => `<div><span>${label}</span><strong>${money(n)} <small>(${Math.round((n / total) * 100)}%)</small></strong></div>`).join("")}</div><p class="plan-note">${s.usableCash < 0 ? `결혼비용·부대비용을 채울 부족분 ${money(-s.usableCash)}도 추가 대출 필요액에 포함했어요. ` : ""}${s.unusedFunds > 0 ? `목표보다 많은 자금 ${money(s.unusedFunds)}. 등록 대출 원금을 줄일지는 대출 관리에서 결정해주세요. ` : ""}만원 단위 반올림 · 실제 원 단위로 계산해요.</p>`;
    const base = simulation(st, { ...scenario, additional: 0 });
    el("house-comparison-base").innerHTML =
      `<div><span>집에 쓸 예상 현금</span><strong>${money(st.availCash)}</strong></div><span>+</span><div><span>등록 대출 · 받을 예정</span><strong>${money(base.basePrincipal)}</strong></div><span>=</span><div><span>추가 대출 전 집 예산</span><strong>${money(base.houseBudget)}</strong></div><p class="plan-note">등록 대출만 받을 때 월 ${money(base.baseMonthly)}${scenario.fees || scenario.reserve ? " · 부대비용·남겨둘 현금 차감" : ""}${st.cashShortfall ? ` · 자금 부족 ${money(st.cashShortfall)} 반영` : ""}</p>`;
    el("preset-grid").innerHTML = PRESET_AMOUNTS.map((amount) => {
      const p = simulation(st, { ...scenario, additional: amount });
      return `<button type="button" class="plan-preset ${p.ratio > 100 ? "over" : ""}" data-preset="${amount}" aria-pressed="${selected === amount}"><h3>${icon("cash-coin")}추가 ${money(amount)}</h3><p>총 대출 ${money(p.totalPrincipal)}</p><dl><div><dt>집 예산</dt><dd>${money(p.houseBudget)}</dd></div><div><dt>월 상환 합계</dt><dd>${money(p.monthly)}</dd></div></dl>${meter(p.ratio)}<small>${p.ratio == null ? "월 한도 미설정" : `월 한도 대비 ${Math.round(p.ratio)}%`}${p.headroom < 0 ? ` · ${money(-p.headroom)} 초과` : ""}</small></button>`;
    }).join("");
    const pick = simulation(st, { ...scenario, additional: selected });
    el("house-selection").innerHTML =
      `<div><span>선택한 집 예산</span><strong>${money(pick.houseBudget)}</strong></div><div><span>등록 대출 + 추가 대출</span><strong>${money(pick.basePrincipal)} + ${money(selected)}</strong></div><div><span>합산 월 상환액</span><strong>${money(pick.monthly)}</strong></div>${button("이 예산으로 목표 집값 보기", "data-apply-preset", true)}<p class="plan-note">목표 입력란에서 먼저 비교해요. 저장 전에는 기존 목표와 등록 대출이 바뀌지 않아요.</p>`;
    if (!s.target) {
      el("house-goal-result").innerHTML =
        '<p class="plan-empty">목표 집값을 입력하면 등록 대출을 반영한 추가 대출과 월 부담을 계산해요.</p>';
      el("house-funding").replaceChildren();
    }
  } catch (error) {
    el("house-goal-result").innerHTML =
      `<p class="plan-notice error" role="status">${esc(error.message)}</p>`;
    el("preset-grid").innerHTML =
      `<p class="plan-notice">${esc(error.message)}</p>`;
    el("house-comparison-base").replaceChildren();
    el("house-selection").replaceChildren();
    el("house-funding").replaceChildren();
  }
}
function openLoan(id) {
  const existing = getState().loans.find((l) => l.id === id),
    source = existing || {
      name: "",
      amount: 0,
      rate: getState().marketRate?.usable ? getState().marketRate.value : null,
      term: 30,
      grace: 0,
      type: "원리금",
      enabled: true,
    };
  const loanId = id || crypto.randomUUID();
  openDialog(
    existing ? "대출 조건 수정" : "대출 추가",
    `<form id="plan-loan-form"><p class="plan-note">저장하기 전에는 집 예산과 월 상환 합계에 반영되지 않아요.</p><div class="plan-form-grid">${field("name", "대출명", { type: "text" })}${field("amount", "대출 금액")}</div><label class="plan-slider-label">금액 빠르게 선택<input type="range" min="0" max="1000000000" step="10000000" id="plan-loan-slider" value="${source.amount}"></label>${conditions()}${field("enabled", "집 예산·월 상환 합계에 포함", { type: "checkbox" })}<p id="plan-loan-preview" class="plan-notice"></p>${saveFooter(existing ? "변경 저장" : "이 조건으로 추가")}</form>`,
    (d) => {
      const form = d.querySelector("form");
      syncForm(form, source);
      bindFieldForm(form, "loan", loanId, {
        action: existing ? "update" : "create",
        onSaved: closeDialog,
      });
      const preview = () => {
        try {
          const l = formValues(form);
          d.querySelector("#plan-loan-preview").textContent =
            `거치 종료 후 ${l.type === "원금" ? "첫 달" : "월"} ${money(loanMonthly(l))}${l.type === "만기" ? ` · 만기에 원금 ${money(l.amount)} 별도` : ""}`;
        } catch (e) {
          d.querySelector("#plan-loan-preview").textContent = e.message;
        }
      };
      form.addEventListener("input", preview);
      d.querySelector("#plan-loan-slider").addEventListener("input", (e) => {
        const input = form.querySelector("[data-field=amount]");
        writeInput(input, Number(e.target.value));
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      preview();
    },
  );
}
async function toggleLoan(b) {
  const loan = getState().loans.find((l) => l.id === b.dataset.toggleLoan);
  if (!loan) return;
  const wrap = b.closest(".plan-loan");
  let status = wrap.querySelector(".plan-save-status");
  if (!status) {
    status = document.createElement("p");
    status.className = "plan-save-status";
    wrap.append(status);
  }
  try {
    await submitCommand(wrap, {
      kind: "loan",
      id: loan.id,
      values: { enabled: loan.enabled === false },
      expected: { enabled: loan.enabled ?? null },
    });
  } catch (e) {
    showError(wrap, e);
  }
}
function confirmDelete(kind, id) {
  const item = getState()[kind === "loan" ? "loans" : "adjustments"].find(
    (i) => i.id === id,
  );
  if (!item) return;
  openDialog(
    "삭제 확인",
    `<form><p><strong>${esc(item.name)}</strong>을 삭제할까요? 계산 합계에서 빠져요.</p>${saveFooter("삭제")}</form>`,
    (d) => {
      const form = d.querySelector("form");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          await submitCommand(form, {
            kind,
            id,
            action: "delete",
            expected: item,
          });
          closeDialog();
        } catch (error) {
          showError(form, error);
        }
      });
    },
  );
}
function openAdjustments() {
  const st = getState();
  openDialog(
    "집 자금 계산·조정",
    `<dl class="plan-equation"><div><dt>결혼 시 예상 저축</dt><dd>${money(st.coupleSavings)}</dd></div><div><dt>포함한 부모님 지원</dt><dd>+ ${money(st.support)}</dd></div><div><dt>예산에 포함한 결혼비용</dt><dd>− ${money(st.totalPlanned)}</dd></div><div><dt>결혼 예상 수입</dt><dd>+ ${money(st.weddingBudget.expectedIncome)}</dd></div></dl><div class="plan-adjust-list">${st.adjustments.map((a) => `<div><span>${esc(a.name)}</span><strong>${a.sign === "+" ? "+" : "−"} ${money(a.amount)}</strong>${button("수정", `data-adjust-edit="${esc(a.id)}"`)}${button("삭제", `data-adjust-delete="${esc(a.id)}"`)}</div>`).join("")}</div>${button("수입·지출 추가", "data-adjust-add", true)}<div class="plan-notice">집 자금 ${money(st.availCash)}${st.cashShortfall ? ` · 부족 ${money(st.cashShortfall)}` : ""}</div>`,
    (d) =>
      d.addEventListener(
        "click",
        function handler(e) {
          const b = e.target.closest("button");
          if (b?.hasAttribute("data-adjust-add") || b?.dataset.adjustEdit) {
            d.removeEventListener("click", handler);
            openAdjustment(b.dataset.adjustEdit);
          }
          if (b?.dataset.adjustDelete) {
            d.removeEventListener("click", handler);
            confirmDelete("adjustment", b.dataset.adjustDelete);
          }
        },
        { signal: dialogSignal(d) },
      ),
  );
}
function dialogSignal(d) {
  const c = new AbortController();
  d.addEventListener("close", () => c.abort(), { once: true });
  return c.signal;
}
function openAdjustment(id) {
  const existing = getState().adjustments.find((a) => a.id === id);
  openDialog(
    existing ? "추가 수입·지출 수정" : "추가 수입·지출 등록",
    `<form>${field("name", "이름", { type: "text" })}${field("amount", "금액")}<label class="plan-field"><span>구분</span><select data-field="sign"><option value="-">지출 · 집 자금에서 차감</option><option value="+">수입 · 집 자금에 추가</option></select></label><p class="plan-note">결혼비용의 예상 수입으로 기록한 돈은 여기에 다시 넣지 않아요.</p>${saveFooter()}</form>`,
    (d) => {
      const form = d.querySelector("form");
      syncForm(form, existing || { name: "", amount: 0, sign: "-" });
      bindFieldForm(form, "adjustment", id || crypto.randomUUID(), {
        action: existing ? "update" : "create",
        onSaved: () => {
          closeDialog();
        },
      });
    },
  );
}
function openPhases(mode) {
  try {
    const st = getState();
    const sim = mode === "goal" ? simulation(st, {
        ...scenario,
        target: readInput(el("house-target-form").querySelector("input")),
      }) : null;
    const loans = [
      ...(sim?.baseLoans || st.loans.filter((loan) => loan.enabled !== false)),
      ...(sim && sim.additional > 0
        ? [{ name: "추가 대출 (비교안)", ...sim.terms, amount: sim.additional }]
        : []),
    ];
    openDialog(
      "상환 흐름 보기",
      `<p class="plan-notice">실제 실행일과 거치 중 납부 조건이 아직 없어요. 아래는 입력한 금리의 이자를 매월 낸다는 가정이며, 날짜별 실제 청구표는 아니에요.</p>${loans
        .map((l) => {
          const p = loanPhases(l);
          return `<article class="plan-phase"><h3>${esc(l.name)}</h3><dl class="plan-equation">${p.graceMonths ? `<div><dt>거치 ${p.graceMonths}개월 · 이자만 가정</dt><dd>월 ${money(p.graceInterest)}</dd></div>` : ""}<div><dt>이후 ${p.repaymentMonths}개월 · ${p.declining ? "첫 달부터 점차 감소" : "월 부담"}</dt><dd>${money(p.monthly)}</dd></div>${p.maturityPrincipal ? `<div><dt>만기 원금 별도 상환</dt><dd>${money(p.maturityPrincipal)}</dd></div>` : ""}</dl></article>`;
        })
        .join("")}`,
    );
  } catch (e) {
    openDialog("조건 확인", `<p>${esc(e.message)}</p>`);
  }
}
export const initHouseInputs = renderHouse;
