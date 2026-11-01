import { validateWeddingBudget } from './wedding-budget-core.mjs';
import { db } from "./firebase.js";
import {
  doc,
  runTransaction,
  serverTimestamp,
  getDocs,
  query,
  collection,
  orderBy,
  documentId,
  startAt,
  endAt,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getMember,
  registerPrivateCleanup,
} from "../../../shared/firebase/site-auth.mjs";
import { createMemberWork } from "../../../shared/firebase/member-work.mjs";
import {
  fieldPatch,
  savingsRecordChange,
  validateLoan,
} from "./planning-core.mjs";
import { validDate } from "./wedding-core.mjs";

const work = createMemberWork({ getMember, registerPrivateCleanup });
const collections = {
  settings: "wecost_settings",
  savings: "wecost_savings",
  loan: "wecost_loans",
  adjustment: "wecost_adjustments",
};
const keys = {
  settings: [
    "weddingDate",
    "targetHousePrice",
    "monthlyPaymentLimit",
    "parentSupportSohee",
    "parentSupportSunwo",
    "includeSupportSohee",
    "includeSupportSunwo",
    "houseScenario",
    "weddingBudget",
  ],
  savings: [
    "soheeCurrent",
    "soheeMonthly",
    "sunwoCurrent",
    "sunwoMonthly",
    "soheeDay",
    "sunwoDay",
  ],
  loan: ["name", "amount", "rate", "term", "grace", "type", "enabled"],
  adjustment: ["name", "amount", "sign"],
};
export const planningOperationId = () => `${Date.now()}_${crypto.randomUUID()}`;
export function validatePlanningFields(kind, fields, current = {}) {
  if (!keys[kind] || Object.keys(fields).some((k) => !keys[kind].includes(k)))
    throw Error("저장할 항목을 확인해주세요.");
  const next = { ...current, ...fields };
  for (const [key, v] of Object.entries(fields)) {
    if (
      ["includeSupportSohee", "includeSupportSunwo", "enabled"].includes(key)
    ) {
      if (typeof v !== "boolean") throw Error("포함 여부를 확인해주세요.");
    } else if (key === "weddingDate") {
      if (!validDate(v)) throw Error("결혼일을 확인해주세요.");
    } else if (key === "name") {
      if (typeof v !== "string" || !v.trim() || v.length > 100)
        throw Error("이름을 1~100자로 입력해주세요.");
    } else if (key === "sign") {
      if (!["+", "-"].includes(v))
        throw Error("수입·지출 구분을 확인해주세요.");
    } else if (key.endsWith("Day")) {
      if (v !== null && (!Number.isInteger(v) || v < 1 || v > 31))
        throw Error("저축일은 1~31일로 입력해주세요.");
    } else if (key === "weddingBudget") {
      validateWeddingBudget(v);
    } else if (key === "houseScenario") {
      if (
        !v ||
        Object.keys(v).some((k) => !["terms", "fees", "reserve", "rateMode"].includes(k))
      )
        throw Error("비교 조건을 확인해주세요.");
      if (v.rateMode != null && !["market", "manual"].includes(v.rateMode)) throw Error("금리 적용 방식을 확인해주세요.");
      validateLoan({ ...v.terms, amount: 0 });
      for (const n of [v.fees, v.reserve])
        if (n !== null && (!Number.isSafeInteger(n) || n < 0 || n > 1e12))
          throw Error("부대비용을 확인해주세요.");
    } else if (
      !["type", "rate", "term", "grace"].includes(key) &&
      (!Number.isSafeInteger(v) || v < 0 || v > 1e12)
    )
      throw Error("금액은 0원 이상 정수로 입력해주세요.");
  }
  if (kind === "loan") validateLoan(next);
  return fields;
}

// Same explicit operation can be retried after an uncertain response. The log
// and edited document commit atomically; reads never seed financial documents.
export async function savePlanning(command, operationId) {
  const request = work.capture();
  if (!/^[\w-]{1,100}$/.test(operationId || ""))
    throw Error("저장 요청을 다시 열어주세요.");
  const {
    kind,
    id = "main",
    values = {},
    expected = {},
    action = "update",
  } = command;
  if (!collections[kind] || !/^[\w-]{1,160}$/.test(id))
    throw Error("저장 대상을 확인해주세요.");
  const ref = doc(db, collections[kind], id),
    logRef = doc(db, "wecost_settings", `planning_log_${operationId}`);
  const signature = JSON.stringify(command);
  await runTransaction(db, async (tx) => {
    request.assert();
    const [snap, log] = await Promise.all([tx.get(ref), tx.get(logRef)]);
    request.assert();
    if (log.exists()) {
      if (
        log.data().signature !== signature ||
        log.data().actorUid !== request.member.uid
      )
        throw Error("다른 저장 요청이에요. 입력을 다시 확인해주세요.");
      return;
    }
    const current = snap.exists() ? snap.data() : null;
    let patch;
    if (action === "record") {
      if (kind !== "savings") throw Error("저축 기록만 저장할 수 있어요.");
      patch = savingsRecordChange(
        current || {},
        command.expectedRecord ?? null,
        command.record,
      ).fields;
    } else if (action === "delete") {
      if (!["loan", "adjustment"].includes(kind))
        throw Error("삭제할 수 없는 항목이에요.");
      if (!current) return;
      fieldPatch(
        current,
        expected,
        Object.fromEntries(keys[kind].map((k) => [k, null])),
      );
      patch = null;
    } else {
      if (action === "create" && current)
        throw Error("이미 존재하는 항목이에요.");
      if (
        action !== "create" &&
        !current &&
        ["loan", "adjustment"].includes(kind)
      )
        throw Error("삭제된 항목이에요.");
      validatePlanningFields(kind, values, current || {});
      patch =
        action === "create"
          ? values
          : fieldPatch(current || {}, expected, values);
    }
    if (patch === null) tx.delete(ref);
    else
      tx.set(ref, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
    tx.set(logRef, {
      kind: "planning",
      target: `${collections[kind]}/${id}`,
      action,
      signature,
      before: current,
      changes: patch,
      actorUid: request.member.uid,
      actor: request.member.role === "sohee" ? "소희" : "성우",
      updatedAt: serverTimestamp(),
    });
  });
  request.assert();
  // The settings subscription publishes the confirmed latest target. Do not
  // publish a retried old operation's target over a newer remote update.
}
export async function planningHistory() {
  const request = work.capture();
  const result = await getDocs(
    query(
      collection(db, "wecost_settings"),
      orderBy(documentId(), "desc"),
      startAt("planning_log_\uf8ff"),
      endAt("planning_log_"),
      limit(30),
    ),
  );
  request.assert();
  return result.docs.map((d) => ({ id: d.id, ...d.data() }));
}
