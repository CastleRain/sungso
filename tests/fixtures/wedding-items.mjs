// Synthetic costs only; no real couple amounts, document IDs or payment dates.
export function weddingItems(today = "2026-10-31") {
  const names = [
    "신혼여행 대역",
    "예물 대역",
    "스드메 계약 대역",
    "드레스 대역",
    "예복 대역",
    "혼주 양복 대역",
    "예비비 대역",
    "식사 대역",
    "취소비 대역",
    "예식장 대역",
    "혼주 한복 대역",
    "상견례 대역",
    "스튜디오 대역",
    "촬영 소품 대역",
    "도우미 대역",
    "야외 촬영 대역",
    "본식DVD 대역",
    "사회자 대역",
    "아이폰스냅 대역",
    "혼주 메이크업 대역",
    "숙박 대역",
    "청첩장 대역",
  ];
  const cats = {
    0: "✈️신혼여행",
    1: "💍예물예단",
    2: "👗스드메",
    3: "👗스드메",
    4: "🤵🏻예복",
    7: "🏰웨딩홀",
    9: "🏰웨딩홀",
    12: "👗스드메",
    15: "🎞️스냅촬영",
  };
  const done = new Set([1, 7, 8, 12, 13, 15]),
    partial = new Set([0, 2, 9, 11, 16, 17, 18]);
  return names.map((name, index) => {
    const planned = (index + 1) * 100000,
      deposit = done.has(index) || partial.has(index) ? 10000 : 0;
    const actual = done.has(index)
      ? planned - deposit
      : partial.has(index)
        ? Math.floor(planned / 3)
        : 0;
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(
      date.getUTCDate() +
        (done.has(index)
          ? -5
          : index === 21
            ? 1
            : index === 11
              ? 8
              : 35 + index),
    );
    return {
      id: `synthetic-${index}`,
      name,
      cat: cats[index] || "✨기타",
      planned,
      deposit,
      actual,
      balance: Math.max(0, planned - deposit),
      balanceDue: date.toISOString().slice(0, 10),
      memo: "합성 검증 자료",
    };
  });
}
