import { subscribeAll } from "./firebase.js";
import { makePlanningState } from "./planning-core.mjs";
import { initPlanningUI } from "./planning-ui.mjs";
import { createLoanRateReader } from "./loan-rates.mjs";
import { registerWeddingBudget } from "./wedding-budget-ui.mjs";
import { renderDashboard, registerDashboardHandlers } from "./tab-dashboard.js";
import { renderCashflow, registerCashflowHandlers } from "./tab-cashflow.js";
import { renderFixedCosts, registerFixedCostsHandlers } from "./tab-fixed-costs.js";
import { renderWedding, registerWeddingHandlers } from "./tab-wedding.js";
import { renderHouse, registerHouseHandlers } from "./tab-house.js";
import {
  getWeddingFinanceState,
  subscribeFinanceView,
} from "./wedding-funds-ui.mjs";
import { registerPrivateCleanup } from "../../../shared/firebase/site-auth.mjs";

const st = { settings: {}, items: [], savings: {}, loans: [], adjustments: [] };
const loanRates = createLoanRateReader({ onChange(market) { st.marketRate = market; render(); } });
st.marketRate = loanRates.get();
let currentTab = "dashboard",
  initialized = false,
  retired = false,
  unsubscribe;
const renderers = {
  dashboard: renderDashboard,
  cashflow: renderCashflow,
  fixed: renderFixedCosts,
  wedding: renderWedding,
  house: renderHouse,
};
function recompute() {
  Object.assign(st, makePlanningState(st, getWeddingFinanceState()));
}
function render() {
  if (!initialized || retired) return;
  recompute();
  renderDashboard(st);
  if (currentTab !== "dashboard") renderers[currentTab](st);
}
// Surface changes repaint the dashboard's read-only saved target, using the
// existing state and forms. No subscriptions, saves or editors are restarted.
function refreshDashboardSurface() {
  if (initialized && !retired) renderDashboard(st);
}
window.addEventListener("sungso:surface-change", refreshDashboardSurface);
function showTab(name) {
  if (!renderers[name]) return;
  currentTab = name;
  try {
    localStorage.setItem("wecost_tab", name);
    const url = new URL(location.href);
    url.searchParams.set("tab", name);
    history.replaceState(null, "", url);
  } catch {}
  document.querySelectorAll(".tab-page").forEach((page) => {
    page.classList.toggle("hidden", page.id !== `tab-${name}`);
    page.classList.toggle("active", page.id === `tab-${name}`);
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.tab === name);
    item.setAttribute(
      "aria-current",
      item.dataset.tab === name ? "page" : "false",
    );
  });
  const label = document.querySelector(".wecost-page-label");
  if (label)
    label.textContent = `WeCost · ${{ dashboard: "대시보드", cashflow: "우리 자금", fixed: "고정비", wedding: "결혼비용", house: "집 시뮬레이션" }[name]}`;
  if (initialized) {
    recompute();
    renderers[name](st);
  }
}
window._showTab = showTab;
initPlanningUI((status) => {
  setTimeout(() => {
    if (retired) return;
    const pending =
      [...document.querySelectorAll("[data-field]")].some(
        (input) => input._dirty,
      ) || document.querySelector("form[data-dirty=true]");
    const display = ["saved", "reset"].includes(status) && pending ? "draft" : status;
    const label = document.getElementById("planning-status");
    if (label) {
      label.textContent = {
        draft: "저장 전 변경사항",
        saving: "저장 중…",
        saved: "저장됨",
        reset: "저장된 데이터 기준",
        error: "저장 확인 필요",
      }[display];
      label.dataset.state = display;
    }
  }, 0);
});
registerDashboardHandlers(() => st);
registerCashflowHandlers(() => st);
registerFixedCostsHandlers();
registerHouseHandlers(() => st);
registerWeddingHandlers(() => st);
registerWeddingBudget(() => st);
const stopFinance = subscribeFinanceView(render);
document.addEventListener("click", (e) => {
  if (e.target.closest('[data-refresh-loan-rate]')) loanRates.refresh();
  const go = e.target.closest("[data-go]");
  if (go) {
    showTab(go.dataset.go);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});
document.querySelectorAll(".nav-item").forEach((item) => {
  item.tabIndex = 0;
  item.setAttribute("role", "button");
  item.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      showTab(item.dataset.tab);
    }
  });
});
function start() {
  unsubscribe?.();
  unsubscribe = subscribeAll(
    (snapshot) => {
      if (retired) return;
      Object.assign(st, snapshot);
      const first = !initialized;
      initialized = true;
      render();
      document.getElementById("loading-screen").classList.add("hidden");
      document.getElementById("sync-text").textContent = "실시간 연결됨";
      document.getElementById("sync-dot").className = "sync-dot";
      if (first) {
        let saved;
        try {
          saved = localStorage.getItem("wecost_tab");
        } catch {}
        showTab(
          new URLSearchParams(location.search).get("tab") ||
            saved ||
            "dashboard",
        );
      }
    },
    (error) => {
      document.getElementById("sync-text").textContent = "연결 확인 필요";
      document.getElementById("sync-dot").className = "sync-dot error";
      const label = document.getElementById("loader-msg");
      if (label) label.textContent = error?.message || "연결을 확인해주세요";
      document.getElementById("retry-btn")?.classList.remove("hidden");
    },
  );
}
window._retryInit = start;
window._manualRefresh = start;
window._fmtMoneyHint = (input, hintId) => {
  const raw = input.value.replace(/[^0-9]/g, "");
  input.value = raw ? Number(raw).toLocaleString("ko-KR") : "";
  const hint = document.getElementById(hintId);
  if (hint)
    hint.textContent = raw
      ? `${Math.round(Number(raw) / 10000).toLocaleString("ko-KR")}만원`
      : "";
};
registerPrivateCleanup(() => {
  retired = true;
  window.removeEventListener("sungso:surface-change", refreshDashboardSurface);
  unsubscribe?.();
  stopFinance();
  loanRates.stop();
  for (const key of Object.keys(st)) delete st[key];
});
start();
loanRates.refresh();
