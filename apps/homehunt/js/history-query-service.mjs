/** History requests share one cancellation signal and never estimate completion. */
export function historyRequestPlan(months, { hasUsableCache = false, progressive = true } = {}) {
  const requested = Math.max(12, Math.min(60, Math.trunc(Number(months) || 60)));
  return progressive && !hasUsableCache && requested > 12 ? [12, requested] : [requested];
}

export function isCompleteHistoryPayload(payload) {
  return Array.isArray(payload?.records) && payload.partial !== true && payload.stale !== true
    && (!payload.missingRequests || (Array.isArray(payload.missingRequests) && payload.missingRequests.length === 0));
}

function checkCancelled(signal) {
  if (!signal?.aborted) return;
  throw new DOMException('History request cancelled', 'AbortError');
}

export async function fetchHistoryProgressively({
  url, months, signal, hasUsableCache = false, progressive = true,
  fetchImpl = globalThis.fetch, validatePreview = () => false,
  onPhase = () => {}, onPreview = () => {},
}) {
  const plan = historyRequestPlan(months, { hasUsableCache, progressive });
  let completedMonths = 0;
  for (let index = 0; index < plan.length; index += 1) {
    checkCancelled(signal);
    const requestMonths = plan[index];
    onPhase({ months: requestMonths, completedMonths, expanding: index > 0, last: index === plan.length - 1 });
    checkCancelled(signal);
    const endpoint = new URL(url);
    endpoint.searchParams.set('months', String(requestMonths));
    const response = await fetchImpl(endpoint, { signal });
    checkCancelled(signal);
    const payload = await response.json().catch(() => ({}));
    checkCancelled(signal);
    if (!response.ok || index === plan.length - 1) return { response, payload };
    // A shorter complete response may be shown, but never masquerades as the full range.
    if (validatePreview(payload, requestMonths)) {
      await onPreview(payload);
      checkCancelled(signal);
      completedMonths = requestMonths;
    }
  }
}

export function historyElapsedLabel(startedAt, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return seconds < 60 ? `${seconds}초 경과` : `${Math.floor(seconds / 60)}분 ${seconds % 60}초 경과`;
}

/** Only render known fields; upstream errors may include credentials or provider URLs. */
export function missingHistoryDetails(requests = []) {
  return (Array.isArray(requests) ? requests : []).map((item) => {
    const rawMonth = String(item?.dealYmd || item?.month || '');
    const match = rawMonth.match(/^(\d{4})-?(0[1-9]|1[0-2])$/);
    const month = match ? `${match[1]}년 ${Number(match[2])}월` : '월 미확인';
    const type = item?.type === 'sale' ? '매매' : item?.type === 'rent' ? '전월세' : '거래유형 미확인';
    const reason = String(item?.reason || '');
    let explanation = '공식 자료 응답 실패';
    if (/429|rate.?limit|quota|한도|제한/i.test(reason)) explanation = '공급원 요청 한도';
    else if (/401|403|auth|key|인증|승인/i.test(reason)) explanation = '공급원 인증 확인 필요';
    else if (/timeout|timed.?out|시간.?초과|abort/i.test(reason)) explanation = '응답 시간 초과';
    else if (/parse|xml|format|형식/i.test(reason)) explanation = '응답 형식 확인 필요';
    return `${month} · ${type} · ${explanation}${item?.staleCacheUsed ? ' · 이전 저장본 사용' : ''}`;
  });
}
