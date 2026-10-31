// Wedding-page view model. Never mutates the shared state or writes during reads.
export const CATEGORY_CHOICES = [
  "🏰웨딩홀",
  "👗스드메",
  "🤵🏻예복",
  "💍예물예단",
  "📷사진·영상",
  "👪혼주·가족",
  "👥청첩장·모임",
  "🎤예식 진행",
  "🧳숙박·이동",
  "✈️신혼여행",
  "💄관리비용",
  "🎁선물답례",
  "🏠집",
  "🛠️인테리어",
  "🧴생활용품",
  "🔌가전",
  "🛏️가구",
  "✨기타·예비비",
];
export const categoryLabel = (cat) =>
  String(cat || "")
    .replace(/^[^가-힣A-Za-z0-9]+/u, "")
    .trim() || "기타·예비비";
export const categoryIcon = (cat) =>
  String(cat || "")
    .match(/^[^가-힣A-Za-z0-9]+/u)?.[0]
    ?.trim() || "✨";
export const isWeddingTravel = (item) => item.cat === "✈️신혼여행";
export function weddingCategory(item) {
  const label = categoryLabel(item.cat);
  if (["본식스냅영상", "스냅촬영"].includes(label)) return "📷사진·영상";
  if (label === "청첩장모임") return "👥청첩장·모임";
  if (label === "차(교통비)") return "🧳숙박·이동";
  // Explicit new/custom classifications always take precedence over suggestions.
  if (item.cat && label !== "기타") return item.cat;
  const name = String(item.name || "").replace(/\s/g, "");
  if (/혼주/.test(name)) return "👪혼주·가족";
  if (/DVD|스냅|본식영상/i.test(name)) return "📷사진·영상";
  if (/청첩장|상견례/.test(name)) return "👥청첩장·모임";
  if (/사회자|도우미|축가/.test(name)) return "🎤예식 진행";
  if (/촬영.*소품|소품.*촬영/.test(name)) return "👗스드메";
  if (/숙박|교통|택시|버스/.test(name)) return "🧳숙박·이동";
  return "✨기타·예비비";
}
const amount = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : 0);
export function paymentState(item) {
  const planned = amount(item.planned),
    deposit = amount(item.deposit),
    actual = amount(item.actual);
  const paid = deposit + actual;
  const remaining = Math.max(0, planned - paid);
  const progress =
    planned > 0 ? Math.min(100, Math.round((paid / planned) * 100)) : 0;
  const status =
    planned > 0 && paid >= planned
      ? "done"
      : paid > 0
        ? "partial"
        : planned > 0
          ? "unpaid"
          : "empty";
  return {
    planned,
    deposit,
    actual,
    paid,
    remaining,
    progress,
    status,
    overpaid: Math.max(0, paid - planned),
  };
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === value;
}
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function daysUntil(date, today = localDate()) {
  return validDate(date) && validDate(today)
    ? Math.round(
        (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
          86400000,
      )
    : null;
}
export function aggregate(items) {
  return items.reduce(
    (a, item) => {
      const p = paymentState(item);
      for (const key of ["planned", "paid", "remaining", "overpaid"])
        a[key] += p[key];
      a.count++;
      a[p.status]++;
      return a;
    },
    {
      planned: 0,
      paid: 0,
      remaining: 0,
      overpaid: 0,
      count: 0,
      done: 0,
      partial: 0,
      unpaid: 0,
      empty: 0,
    },
  );
}
export function weddingView(
  items,
  {
    includeTravel = true,
    status = "all",
    category = "",
    sort = "amount",
    groupBy = "none",
    today = localDate(),
  } = {},
) {
  const scoped = items.filter(
    (item) => includeTravel || !isWeddingTravel(item),
  );
  const categories = new Map();
  for (const item of scoped) {
    const key = weddingCategory(item);
    if (!categories.has(key)) categories.set(key, []);
    categories.get(key).push(item);
  }
  const dues = scoped
    .filter((i) => paymentState(i).remaining > 0)
    .sort((a, b) =>
      (validDate(a.balanceDue) ? a.balanceDue : "9999").localeCompare(
        validDate(b.balanceDue) ? b.balanceDue : "9999",
      ),
    );
  const soon = dues.filter((i) => {
    const d = daysUntil(i.balanceDue, today);
    return d !== null && d >= 0 && d <= 30;
  });
  const overdue = dues.filter(
    (i) =>
      daysUntil(i.balanceDue, today) !== null &&
      daysUntil(i.balanceDue, today) < 0,
  );
  const months = new Map();
  for (const item of dues) {
    const day = daysUntil(item.balanceDue, today);
    const key =
      day === null
        ? "날짜 미정"
        : day < 0
          ? "지난 납부일 확인"
          : item.balanceDue.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(item);
  }
  const filtered = scoped.filter(
    (i) =>
      (status === "all" || paymentState(i).status === status) &&
      (!category || weddingCategory(i) === category),
  );
  filtered.sort((a, b) => {
    const byName = String(a.name).localeCompare(String(b.name), "ko") ||
      String(a.id).localeCompare(String(b.id));
    if (sort === "name") return byName;
    if (sort === "unpriced") return Number(amount(b.planned) === 0) - Number(amount(a.planned) === 0) || amount(b.planned) - amount(a.planned) || byName;
    if (sort === "due") return (
      (validDate(a.balanceDue) ? a.balanceDue : "9999").localeCompare(
        validDate(b.balanceDue) ? b.balanceDue : "9999",
      ) || byName
    );
    if (sort === "amount-asc") return paymentState(a).planned - paymentState(b).planned || byName;
    if (sort === "remaining") return paymentState(b).remaining - paymentState(a).remaining || byName;
    return paymentState(b).planned - paymentState(a).planned || byName;
  });
  const grouped = new Map();
  if (groupBy === "category") for (const item of filtered) {
    const key = weddingCategory(item);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  const groups = [...grouped].map(([category, items]) => ({ category, items, totals: aggregate(items) })).sort((a, b) => {
    const byCategory = categoryLabel(a.category).localeCompare(categoryLabel(b.category), "ko");
    if (sort === "name") return byCategory;
    if (sort === "unpriced") {
      const priority = Number(b.items.some(i => amount(i.planned) === 0)) - Number(a.items.some(i => amount(i.planned) === 0));
      if (priority) return priority;
    }
    // Items are already date-sorted, so each first item gives its group's earliest date.
    if (sort === "due") return (validDate(a.items[0].balanceDue) ? a.items[0].balanceDue : "9999").localeCompare(validDate(b.items[0].balanceDue) ? b.items[0].balanceDue : "9999") || byCategory;
    if (sort === "amount-asc") return a.totals.planned - b.totals.planned || byCategory;
    if (sort === "remaining") return b.totals.remaining - a.totals.remaining || byCategory;
    return b.totals.planned - a.totals.planned || byCategory;
  });
  return {
    scoped,
    totals: aggregate(scoped),
    categories: [...categories].sort(
      (a, b) => aggregate(b[1]).planned - aggregate(a[1]).planned,
    ),
    dues,
    soon,
    overdue,
    months: [...months],
    filtered,
    groups,
    completed: scoped.filter((i) => paymentState(i).status === "done"),
  };
}
export function parseWon(value) {
  const text = String(value ?? "")
    .trim()
    .replaceAll(",", "");
  if (!text) return 0;
  if (
    !/^\d+$/.test(text) ||
    !Number.isSafeInteger(Number(text)) ||
    Number(text) > 1e12
  )
    throw new Error("금액은 0 이상의 정수로 입력해주세요.");
  return Number(text);
}
export function normalizeItemDraft(input) {
  const name = String(input.name || "").trim();
  if (!name || name.length > 200)
    throw new Error("항목명을 1~200자로 입력해주세요.");
  const planned = parseWon(input.planned),
    deposit = parseWon(input.deposit),
    actual = parseWon(input.actual);
  if (input.balanceDue && !validDate(input.balanceDue))
    throw new Error("납부일을 확인해주세요.");
  const memo = String(input.memo || "").trim();
  if (memo.length > 5000)
    throw new Error("메모는 5,000자 이내로 입력해주세요.");
  return {
    name,
    cat: String(input.cat || "✨기타·예비비"),
    planned,
    deposit,
    actual,
    balance: Math.max(0, planned - deposit - actual),
    balanceDue: input.balanceDue || null,
    memo: memo || null,
  };
}
export function paymentPatch(item, value, date, operationId) {
  const n = parseWon(value),
    state = paymentState(item);
  if (!n || n > state.remaining)
    throw new Error("납부액은 0원보다 크고 남은 잔금 이하여야 해요.");
  if (!validDate(date) || date > localDate())
    throw new Error("실제 납부일은 오늘 또는 이전 날짜로 입력해주세요.");
  return {
    actual: state.actual + n,
    balance: state.remaining - n,
    lastPaymentDate: date,
    weddingOperationId: operationId,
  };
}
const compareFields = [
  "name",
  "cat",
  "planned",
  "deposit",
  "actual",
  "balance",
  "balanceDue",
  "memo",
  "lastPaymentDate",
  "weddingOperationId",
];
export function sameItem(a, b) {
  return compareFields.every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));
}
export function decideItemWrite(current, expected, fields) {
  if (!current) throw new Error("항목이 삭제됐어요. 목록을 다시 확인해주세요.");
  if (
    fields.weddingOperationId &&
    current.weddingOperationId === fields.weddingOperationId
  ) {
    if (
      Object.entries(fields).every(
        ([k, v]) => (current[k] ?? null) === (v ?? null),
      )
    )
      return false;
    throw new Error(
      "이 저장은 이미 반영됐어요. 항목을 다시 열어 확인해주세요.",
    );
  }
  if (expected && !sameItem(current, expected))
    throw new Error(
      "다른 기기에서 항목이 변경됐어요. 입력은 보존했으니 최신 항목을 다시 열어 확인해주세요.",
    );
  return true;
}
