import {
  savePlanning,
  planningOperationId,
  planningHistory,
} from "./planning-store.mjs";
import { registerPrivateCleanup } from "../../../shared/firebase/site-auth.mjs";

export const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
export function money(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "0원";
  const sign = n < 0 ? "−" : "",
    units = Math.round(Math.abs(n) / 10000);
  if (!units) return `${sign}1만원 미만`;
  return units >= 10000
    ? `${sign}${Math.floor(units / 10000)}억${units % 10000 ? ` ${(units % 10000).toLocaleString("ko-KR")}만원` : "원"}`
    : `${sign}${units.toLocaleString("ko-KR")}만원`;
}
export const exact = (n) =>
  n == null ? "미설정" : `${Number(n).toLocaleString("ko-KR")}원`;
export const icon = (name, tone = "cream") =>
  `<span class="plan-icon ${tone}" aria-hidden="true"><img src="assets/icons/${name}.svg" alt="" width="22" height="22"></span>`;
export const heading = (name, title, action = "", tone = "cream") =>
  `<div class="plan-card-head"><h2>${icon(name, tone)}${title}</h2>${action}</div>`;
export const button = (text, attrs = "", primary = false) =>
  `<button type="button" class="plan-button${primary ? " primary" : ""}" ${attrs}>${text}</button>`;
let fieldSequence = 0;
export function field(
  key,
  label,
  {
    type = "money",
    optional = false,
    suffix = type === "money" ? "원" : "",
    value = "",
    attrs = "",
  } = {},
) {
  const checkbox = type === "checkbox";
  return `<label class="plan-field${checkbox ? " plan-check" : ""}"><span>${label}</span><span class="plan-input"><input id="plan-field-${++fieldSequence}" data-field="${key}" data-format="${type}" ${optional ? "data-optional" : ""} type="${checkbox ? "checkbox" : type === "date" ? "date" : "text"}" ${type === "money" || type === "number" ? 'inputmode="decimal"' : ""} value="${esc(value)}" ${attrs}>${checkbox ? "" : `<small>${suffix}</small>`}</span><small class="plan-field-state"></small></label>`;
}
export const saveFooter = (label = "변경 저장") =>
  `<div class="plan-form-footer"><span class="plan-save-status" role="status">수정 후 저장해주세요</span><button class="plan-button primary" type="submit">${label}</button></div>`;
export function readInput(input) {
  if (input.type === "checkbox") return input.checked;
  if (!["money", "number"].includes(input.dataset.format))
    return input.value.trim();
  const raw = input.value.replaceAll(",", "").trim();
  if (!raw && input.hasAttribute("data-optional")) return null;
  if (!/^\d+(?:\.\d+)?$/.test(raw))
    throw Error("숫자를 입력해주세요. 빈 값과 0원은 구분돼요.");
  const n = Number(raw);
  if (
    !Number.isFinite(n) ||
    (input.dataset.format === "money" && !Number.isSafeInteger(n))
  )
    throw Error("금액은 원 단위 정수로 입력해주세요.");
  return n;
}
export function writeInput(input, value) {
  if (input.type === "checkbox") input.checked = !!value;
  else
    input.value =
      value == null
        ? ""
        : input.dataset.format === "money"
          ? Number(value).toLocaleString("ko-KR")
          : String(value);
  if (input.dataset.format === "date" && input._flatpickr)
    input._flatpickr.setDate(value || null, false);
}
export function syncForm(form, source) {
  if (!form) return;
  form._latest = structuredClone(source || {});
  for (const input of form.querySelectorAll("[data-field]")) {
    const value = source?.[input.dataset.field] ?? null;
    if (!input._dirty) {
      input._expected =
        source?._exists === false ? null : structuredClone(value);
      writeInput(input, value);
    }
    const hint = input
      .closest(".plan-field")
      ?.querySelector(".plan-field-state");
    if (hint) {
      const changed =
        input._dirty &&
        JSON.stringify(input._expected) !== JSON.stringify(value);
      hint.textContent = changed
        ? `다른 기기에서 변경됨 · 최신 ${formatValue(value, input)}`
        : "";
    }
  }
}
function formatValue(value, input) {
  return input.type === "checkbox"
    ? value
      ? "포함"
      : "제외"
    : input.dataset.format === "money"
      ? exact(value)
      : (value ?? "미설정");
}
export function formValues(form) {
  return Object.fromEntries(
    [...form.querySelectorAll("[data-field]")].map((input) => [
      input.dataset.field,
      readInput(input),
    ]),
  );
}
let notify = () => {},
  retired = false,
  modal,
  restoreFocus,
  calendar;
export function initPlanningUI(onChange) {
  notify = onChange;
  modal = document.createElement("dialog");
  modal.className = "plan-dialog";
  modal.id = "planning-dialog";
  modal.setAttribute("aria-labelledby", "planning-dialog-title");
  document.querySelector("[data-private-root]").append(modal);
  modal.addEventListener("cancel", (e) => {
    if (modal._busy) e.preventDefault();
  });
  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-dialog-close]") && !modal._busy) modal.close();
  });
  modal.addEventListener("close", () => {
    calendar?.destroy();
    calendar = null;
    modal.replaceChildren();
    restoreFocus?.focus({ preventScroll: true });
  });
  registerPrivateCleanup(() => {
    retired = true;
    calendar?.destroy();
    modal.close();
    modal.remove();
    document
      .querySelectorAll(".plan-page")
      .forEach((page) => page.replaceChildren());
  });
}
export function openDialog(title, body, onReady) {
  restoreFocus = document.activeElement;
  modal.innerHTML = `<div class="plan-dialog-head"><h2 id="planning-dialog-title">${title}</h2>${button("닫기", "data-dialog-close")}</div>${body}`;
  modal.showModal();
  onReady?.(modal);
  modal.querySelector("input,select,button")?.focus();
  return modal;
}
export function closeDialog() {
  modal?.close();
}
export function bindFieldForm(
  form,
  kind,
  id = "main",
  { onSaved = null, action = "update" } = {},
) {
  form.addEventListener("input", (e) => {
    const input = e.target.closest("[data-field]");
    if (!input) return;
    input._dirty = true;
    if (input.dataset.format === "money" && /^[\d,]*$/.test(input.value)) {
      const pos = input.value.length - input.selectionStart;
      input.value = input.value.replaceAll(",", "")
        ? Number(input.value.replaceAll(",", "")).toLocaleString("ko-KR")
        : "";
      try {
        input.setSelectionRange(
          input.value.length - pos,
          input.value.length - pos,
        );
      } catch {}
    }
    form.querySelector(".plan-save-status").textContent =
      "저장 전 변경사항이 있어요";
    notify("draft");
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const inputs = [...form.querySelectorAll("[data-field]")].filter(
        (input) => action === "create" || input._dirty,
      );
      if (!inputs.length) {
        form.querySelector(".plan-save-status").textContent =
          "변경된 내용이 없어요";
        return;
      }
      const values = Object.fromEntries(
        inputs.map((input) => [input.dataset.field, readInput(input)]),
      );
      const expected = Object.fromEntries(
        inputs.map((input) => [input.dataset.field, input._expected ?? null]),
      );
      await submitCommand(form, { kind, id, action, values, expected });
      inputs.forEach((input) => {
        input._dirty = false;
        input._expected = values[input.dataset.field];
      });
      onSaved?.(values);
    } catch (error) {
      showError(form, error);
    }
  });
}
export function showError(form, error) {
  const status = form.querySelector(".plan-save-status");
  if (status) {
    status.textContent =
      error.message ||
      "저장하지 못했어요. 입력을 유지했으니 다시 시도해주세요.";
    status.classList.add("error");
  }
  notify("error");
  form.querySelector(".plan-conflicts")?.remove();
  if (error.code === "planning-conflict") {
    const panel = document.createElement("div");
    panel.className = "plan-conflicts";
    panel.setAttribute("role", "alert");
    panel.innerHTML = "<strong>다른 기기의 변경을 확인해주세요</strong>";
    for (const input of form.querySelectorAll("[data-field]")) {
      if (!error.conflicts.includes(input.dataset.field)) continue;
      const latest = error.latest?.[input.dataset.field] ?? null;
      const row = document.createElement("div");
      row.innerHTML = `<p>${esc(input.closest("label")?.querySelector("span")?.textContent || input.dataset.field)} · 내 입력 ${esc(formatValue(readInput(input), input))} / 최신 ${esc(formatValue(latest, input))}</p>`;
      for (const [label, mine] of [
        ["최신 값 사용", false],
        ["내 입력 유지", true],
      ]) {
        const choice = document.createElement("button");
        choice.type = "button";
        choice.className = "plan-button";
        choice.textContent = label;
        choice.onclick = () => {
          input._expected = latest;
          if (!mine) {
            writeInput(input, latest);
            input._dirty = false;
          }
          row.remove();
          status.textContent = "선택한 내용을 확인한 뒤 다시 저장해주세요";
          form._operation = null;
        };
        row.append(choice);
      }
      panel.append(row);
    }
    if (!panel.querySelector("button"))
      panel.append(
        document.createTextNode(
          " 이 기록을 닫고 최신 내용으로 다시 열어주세요. 입력한 내용은 저장되지 않았어요.",
        ),
      );
    form.append(panel);
  }
}
export async function submitCommand(form, command) {
  if (form._busy) throw Error("저장 중이에요. 잠시 기다려주세요.");
  const signature = JSON.stringify(command);
  if (form._operation?.signature !== signature)
    form._operation = { signature, id: planningOperationId() };
  const inputs = [...form.querySelectorAll("input,select,textarea,button")],
    disabled = inputs.map((el) => el.disabled);
  const status = form.querySelector(".plan-save-status");
  form._busy = true;
  if (modal?.contains(form)) modal._busy = true;
  inputs.forEach((input) => (input.disabled = true));
  if (status) {
    status.textContent = "저장 중…";
    status.classList.remove("error");
  }
  notify("saving");
  try {
    await savePlanning(command, form._operation.id);
    if (retired) return;
    form._operation = null;
    form.querySelector(".plan-conflicts")?.remove();
    if (status) status.textContent = "저장됐어요";
    notify("saved");
  } finally {
    form._busy = false;
    if (modal) modal._busy = false;
    inputs.forEach((input, i) => (input.disabled = disabled[i]));
  }
}
function historyField(key, value) {
  const labels = {
    soheeCurrent: "소희 모은 돈", sunwoCurrent: "성우 모은 돈",
    soheeMonthly: "소희 월 저축", sunwoMonthly: "성우 월 저축",
    soheeDay: "소희 저축일", sunwoDay: "성우 저축일",
    weddingDate: "결혼일", targetHousePrice: "목표 집값", monthlyPaymentLimit: "월 한도",
    parentSupportSohee: "소희 측 지원금", parentSupportSunwo: "성우 측 지원금",
    includeSupportSohee: "소희 측 지원금 포함", includeSupportSunwo: "성우 측 지원금 포함",
    amount: "금액", name: "이름", rate: "연 금리", term: "기간", grace: "거치",
    type: "상환 방식", enabled: "합계 포함", sign: "수입·지출",
  };
  let display = value;
  if (value == null || value === "") display = "미설정";
  else if (typeof value === "boolean") display = value ? "포함" : "제외";
  else if (key === "sign") display = value === "+" ? "수입" : "지출";
  else if (typeof value === "number") {
    const suffix = key === "rate" ? "%" : ["term", "grace"].includes(key) ? "년" : key.endsWith("Day") ? "일" : "원";
    display = value.toLocaleString("ko-KR") + suffix;
  }
  return `${labels[key] || "항목"}: ${display}`;
}
export function openHistory() {
  const dialog = openDialog(
    "최근 변경 내역",
    '<div class="plan-history" role="status">불러오는 중…</div>',
  );
  const target = dialog.querySelector(".plan-history");
  planningHistory()
    .then((rows) => {
      if (retired || !target.isConnected) return;
      target.innerHTML = rows.length
        ? rows
            .map(
              (row) =>
                `<article><strong>${esc(row.actor)} · ${row.action === "record" ? "월별 저축 기록" : row.target.startsWith("wecost_loans") ? "대출" : row.target.startsWith("wecost_adjustments") ? "추가 수입·지출" : row.target.startsWith("wecost_savings") ? "저축 계획" : "계산 기준"} ${row.action === "delete" ? "삭제" : "변경"}</strong><small>${esc(row.updatedAt?.toDate?.().toLocaleString("ko-KR") || "")}</small><p>${esc(
                  Object.entries(row.changes || {})
                    .filter(
                      ([key]) =>
                        key !== "monthlyRecords" && key !== "houseScenario",
                    )
                    .map(([key, value]) => historyField(key, value))
                    .join(" · ") || "월별 기록·조건을 저장했어요.",
                )}</p></article>`,
            )
            .join("")
        : "<p>이번 개선 이후 저장한 변경 내역이 여기에 표시돼요.</p>";
    })
    .catch((error) => {
      if (target.isConnected) target.textContent = error.message;
    });
}
