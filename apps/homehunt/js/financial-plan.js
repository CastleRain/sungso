import { financialSnapshotService, WECOST_HOUSE_URL } from './financial-snapshot-service.mjs?v=4.0.1';
import { calculateFundingScenario, FUNDING_STATUS_LABELS, fundingPriceBasis, fundingReferencePriceWon, parseScenarioMoney, loadFinancialScenarios, saveFinancialScenario, removeFinancialScenario } from './financial-scenario-core.mjs?v=4.0.1';

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const formatWon = (amount) => {
  if (amount == null || !Number.isFinite(amount)) return '확인 필요';
  const rounded = Math.round(amount);
  if (rounded < 1_000_000) return `${rounded.toLocaleString('ko-KR')}원`;
  const eok = Math.floor(rounded / 100_000_000);
  const man = Math.floor(rounded % 100_000_000 / 10_000);
  const remainder = rounded % 10_000;
  return `${eok ? `${eok.toLocaleString('ko-KR')}억 ` : ''}${man ? `${man.toLocaleString('ko-KR')}만 ` : ''}${remainder ? `${remainder.toLocaleString('ko-KR')}` : ''}`.trim() + '원';
};
const moneyValue = (amount) => amount == null ? '' : (amount / 10_000).toLocaleString('ko-KR', { maximumFractionDigits: 4 });
const costNames = ['취득세', '중개수수료', '등기 비용', '이사비', '수리비'];
const inputNames = { priceWon: '기준 가격', availableCashWon: '가용 현금', existingMonthlyWon: '기존 월 상환액', monthlyPaymentLimitWon: '월 상환 한도', additionalCostsWon: '부대비용', cashReserveWon: '남겨둘 현금', rate: '금리', term: '기간', grace: '거치기간', repaymentType: '상환 방식', rateType: '금리 방식' };
let currentDialog = null;

function localStorageOrNull() { try { return window.localStorage; } catch { return null; } }

function plainCandidate(candidate = {}) {
  const referencePriceWon = fundingReferencePriceWon(candidate);
  return {
    id: String(candidate.id || candidate.name || 'candidate'),
    name: String(candidate.name || '선택한 집'),
    priceManWon: referencePriceWon > 0 ? referencePriceWon / 10_000 : null,
    priceSource: String(candidate.priceSource || '자료 없음'),
    priceObservedAt: String(candidate.priceObservedAt || ''),
    dealType: candidate.dealType || 'sale',
  };
}

export function createFinancialPlanEntry(candidate) {
  const row = document.createElement('section');
  row.className = 'hh-funding-entry';
  const state = financialSnapshotService.getState();
  row.innerHTML = `<div><strong>자금 계획</strong><span>${escapeHTML(state.label)}</span></div><button type="button" class="hh-funding-button" data-open-funding>이 후보로 자금 계획 보기</button>`;
  row.querySelector('[data-open-funding]').addEventListener('click', () => openFinancialPlan(candidate));
  return row;
}

function field(name, label, value = '', hint = '', inputMode = 'decimal') {
  return `<label class="hh-funding-field"><span>${escapeHTML(label)}</span><div class="hh-funding-input"><input name="${escapeHTML(name)}" type="text" inputmode="${inputMode}" value="${escapeHTML(value)}" autocomplete="off" placeholder="직접 입력" aria-describedby="funding-hint-${name}"><span>${['rate'].includes(name) ? '%' : ['term', 'grace'].includes(name) ? '년' : '만원'}</span></div><small id="funding-hint-${name}">${escapeHTML(hint)}</small></label>`;
}

function choice(name, label, options, value) {
  return `<fieldset class="hh-funding-choice"><legend>${escapeHTML(label)}</legend><div>${options.map(([key, text]) => `<label><input type="radio" name="${name}" value="${key}" ${value === key ? 'checked' : ''}><span>${text}</span></label>`).join('')}</div></fieldset>`;
}

function safeNumeric(value) {
  if (typeof value !== 'string' || !value.trim() || !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readForm(form) {
  const value = (name) => form.elements.namedItem(name)?.value ?? '';
  const snapshotMoney = (name) => {
    const input = form.elements.namedItem(name);
    return input.dataset.snapshotRaw && !input.dataset.userEdited ? Number(input.dataset.snapshotRaw) : parseScenarioMoney(input.value);
  };
  const costs = costNames.map((_, index) => parseScenarioMoney(value(`cost${index}`)));
  const anyCost = costs.some((cost) => cost != null);
  return {
    input: {
      priceWon: parseScenarioMoney(value('priceWon')),
      availableCashWon: snapshotMoney('availableCashWon'),
      existingMonthlyWon: snapshotMoney('existingMonthlyWon'),
      monthlyPaymentLimitWon: snapshotMoney('monthlyPaymentLimitWon'),
      cashReserveWon: value('cashReserveWon').trim() ? parseScenarioMoney(value('cashReserveWon')) ?? Number.NaN : 0,
      additionalCostsWon: anyCost ? costs.reduce((sum, cost) => sum + (cost || 0), 0) : null,
      costsComplete: costs.every((cost) => cost != null),
      includeExisting: form.elements.namedItem('includeExisting').checked,
      rate: safeNumeric(value('rate')), term: safeNumeric(value('term')), grace: safeNumeric(value('grace')),
      repaymentType: value('repaymentType'), rateType: value('rateType'),
    },
    costInputs: costs,
  };
}

function effectivePriceSource(candidate, input) {
  return fundingPriceBasis(candidate, input).label;
}

function renderResult(target, input, candidate) {
  const result = calculateFundingScenario(input);
  const priceBasis = fundingPriceBasis(candidate, input);
  const notes = [];
  if (result.missing.length) notes.push(`${result.missing.map((key) => inputNames[key] || key).join(' · ')} 입력 필요`);
  if (!result.costsComplete) notes.push('미입력 부대비용은 미포함');
  if (!result.includeExisting) notes.push('기존 대출 미반영');
  if (!(input.monthlyPaymentLimitWon > 0)) notes.push('월 상환 한도 확인 필요');
  if (result.cashReserveShortfallWon > 0) notes.push(`남겨둘 현금 목표보다 가용 현금이 ${formatWon(result.cashReserveShortfallWon)} 부족`);
  if (result.graceMonthlyWon != null) notes.push(`거치 중 이자 월 ${formatWon(result.graceMonthlyWon)} · 상환 시작 후 금액으로 부담 비교`);
  if (result.balloonPrincipalWon > 0) notes.push(`만기 원금 ${formatWon(result.balloonPrincipalWon)} 별도 상환`);
  if (input.repaymentType === '원금') notes.push('원금균등 월 상환액은 상환 시작 첫 달 기준이며 이후 감소');
  if (input.rateType === 'variable') notes.push('변동금리의 향후 변동은 반영하지 않음');
  target.innerHTML = `<div class="hh-funding-verdict" data-funding-status="${result.status}" role="status" aria-live="polite" aria-atomic="true"><span>입력한 조건 기준</span><strong>${FUNDING_STATUS_LABELS[result.status]}</strong></div>
    <dl class="hh-funding-metrics"><div><dt>필요 대출액</dt><dd>${formatWon(result.requiredLoanWon)}</dd></div><div><dt>새 대출 월 상환액</dt><dd>${formatWon(result.monthlyWon)}</dd></div><div><dt>월 총상환액</dt><dd>${formatWon(result.totalMonthlyWon)}</dd></div><div><dt>설정한 월 한도 대비</dt><dd>${result.limitRatio == null ? '확인 필요' : `${(result.limitRatio * 100).toFixed(1)}%`}</dd></div><div><dt>구매 후 현금</dt><dd>${formatWon(result.remainingCashWon)}</dd></div><div><dt>입력한 부대비용</dt><dd>${formatWon(result.costsIncludedWon)}${result.costsComplete ? '' : ' · 일부/전체 미포함'}</dd></div></dl>
    <p class="hh-funding-price-basis">${escapeHTML(priceBasis.label)} 기준${priceBasis.provenance === 'manual' ? ' · 직접 입력한 시나리오' : priceBasis.observedAt ? ` · ${escapeHTML(priceBasis.observedAt)}` : ' · 기준일 확인 필요'}</p>
    ${notes.length ? `<ul class="hh-funding-notes">${notes.map((note) => `<li>${escapeHTML(note)}</li>`).join('')}</ul>` : '<p class="hh-funding-note">안정: 입력한 월 상환 한도의 80% 이하 · 주의: 80% 초과~100% 이하</p>'}
    <p class="hh-funding-note">자금 계획 계산이며 은행 승인·대출 한도·세금 확정값이 아니에요. DSR·LTV·규제 지역·소득·기존 부채·보유 주택은 최신 공식 기준과 금융기관 심사 확인이 필요해요.</p>`;
  return result;
}

export function openFinancialPlan(rawCandidate) {
  if (currentDialog) currentDialog.close();
  const candidate = plainCandidate(rawCandidate);
  const stored = loadFinancialScenarios(localStorageOrNull()).find((item) => item.candidate.id === candidate.id);
  const values = { ...(stored?.input || {}) };
  const savedPriceWasOverridden = stored && fundingPriceBasis(stored.candidate, stored.input).provenance === 'manual';
  if (candidate.priceManWon && !savedPriceWasOverridden && ['sale', '매매'].includes(candidate.dealType)) values.priceWon = fundingReferencePriceWon(candidate);
  const opener = document.activeElement;
  const dialog = document.createElement('dialog');
  currentDialog = dialog;
  dialog.className = 'hh-funding-dialog';
  dialog.setAttribute('aria-labelledby', 'funding-dialog-title');
  dialog.innerHTML = `<header class="hh-funding-header"><div><span>후보별 개인 시나리오</span><h2 id="funding-dialog-title">${escapeHTML(candidate.name)} · 자금 계획</h2></div><button type="button" class="hh-funding-icon-button" aria-label="자금 계획 닫기" data-close-funding>×</button></header>
    <div class="hh-funding-connection" data-funding-connection></div>
    ${!['sale', '매매'].includes(candidate.dealType) ? '<p class="hh-funding-note hh-funding-trade-note">선택한 가격은 매매가가 아니에요. 구매 시나리오를 계산하려면 매매 호가를 직접 입력해 주세요.</p>' : ''}
    <div class="hh-funding-workspace"><form class="hh-funding-form" novalidate>
      <div class="hh-funding-fields">${field('priceWon', '기준 가격', moneyValue(values.priceWon ?? (['sale', '매매'].includes(candidate.dealType) ? fundingReferencePriceWon(candidate) : null)), '예: 9.3억 / 9억 3천만원 / 93,000만원')}${field('availableCashWon', '가용 현금', moneyValue(values.availableCashWon), 'WeCost에서 확인한 금액 또는 직접 입력')}${field('cashReserveWon', '남겨둘 현금', moneyValue(values.cashReserveWon), '미입력 시 현금을 모두 투입한 시나리오')}${field('monthlyPaymentLimitWon', '월 상환 한도', moneyValue(values.monthlyPaymentLimitWon), '본인이 감당할 수 있는 월 총상환액')}</div>
      <details class="hh-funding-details" open><summary>대출 조건</summary><div class="hh-funding-fields">${field('rate', '연 금리', values.rate ?? '', '제시받은 금리를 직접 입력')}${field('term', '전체 기간', values.term ?? '', '거치를 포함한 정수 년')}${field('grace', '거치기간', values.grace ?? '0', '전체 기간보다 짧게 입력')}${field('existingMonthlyWon', '기존 월 상환액', moneyValue(values.existingMonthlyWon), '기존 대출이 없으면 0 입력')}</div>
      ${choice('rateType', '금리 방식', [['fixed', '고정'], ['variable', '변동']], values.rateType)}${choice('repaymentType', '상환 방식', [['원리금', '원리금균등'], ['원금', '원금균등'], ['만기', '만기일시']], values.repaymentType || '원리금')}
      <label class="hh-funding-toggle"><input name="includeExisting" type="checkbox" ${values.includeExisting !== false ? 'checked' : ''}><span>기존 대출을 월 총상환액에 포함</span></label></details>
      <details class="hh-funding-details"><summary>부대비용 <span>미입력 항목은 미포함</span></summary><p class="hh-funding-note">확인한 견적을 입력해 주세요. 비용이 없음을 확인한 항목은 0으로 입력하세요.</p><div class="hh-funding-fields">${costNames.map((name, index) => field(`cost${index}`, name, moneyValue(stored?.costInputs?.[index]), '미입력 시 미포함')).join('')}</div></details>
    </form><aside class="hh-funding-result" aria-label="현재 입력의 자금 계산 결과"></aside></div>
    <footer class="hh-funding-footer"><div><button type="button" class="hh-funding-button hh-funding-primary" data-save-funding>이 브라우저에 시나리오 저장</button><p>최근 3개 후보를 비교해요. WeCost 원본은 변경하지 않아요.</p><span data-funding-save-message role="status"></span></div><button type="button" class="hh-funding-button" data-compare-funding>저장한 자금 계획 비교</button></footer>
    <div class="hh-funding-saved" data-funding-comparison hidden></div>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const output = dialog.querySelector('.hh-funding-result');
  const updateResult = () => renderResult(output, readForm(form).input, candidate);
  const updateConnection = (state) => {
    if (!dialog.isConnected) return;
    const connection = dialog.querySelector('[data-funding-connection]');
    connection.innerHTML = `<div><strong>${escapeHTML(state.label)}</strong><p>${state.status === 'connected' ? `계산 기준 ${escapeHTML(state.snapshot.calculationDate)} · 동기화 ${escapeHTML(state.snapshot.synchronizedAt)}` : escapeHTML(state.message || '권한을 확인하고 있어요.')}</p></div><a class="hh-funding-button" href="${WECOST_HOUSE_URL}">WeCost에서 조건 수정</a>`;
    ['availableCashWon', 'existingMonthlyWon', 'monthlyPaymentLimitWon'].forEach((name) => {
      const input = form.elements.namedItem(name);
      if (input.dataset.userEdited) return;
      if (state.status === 'connected') {
        input.value = moneyValue(state.snapshot[name]);
        input.dataset.snapshotValue = 'true';
        input.dataset.snapshotRaw = String(state.snapshot[name]);
      } else if (input.dataset.snapshotValue) {
        input.value = '';
        delete input.dataset.snapshotValue;
        delete input.dataset.snapshotRaw;
      }
    });
    updateResult();
  };
  const unsubscribe = financialSnapshotService.subscribe(updateConnection);
  const onReturn = () => financialSnapshotService.refresh();
  window.addEventListener('focus', onReturn);
  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('input', (event) => { event.target.dataset.userEdited = 'true'; updateResult(); });
  form.addEventListener('change', updateResult);
  dialog.querySelector('[data-close-funding]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); dialog.close(); });
  // Keep the underlying HomeHunt modal's Escape handler from closing its panel too.
  dialog.addEventListener('keydown', (event) => { event.stopPropagation(); });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    unsubscribe();
    window.removeEventListener('focus', onReturn);
    dialog.remove();
    if (currentDialog === dialog) currentDialog = null;
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  }, { once: true });
  dialog.querySelector('[data-save-funding]').addEventListener('click', () => {
    const value = readForm(form);
    const status = saveFinancialScenario(localStorageOrNull(), { candidate, ...value });
    dialog.querySelector('[data-funding-save-message]').textContent = status.ok ? '개인 시나리오를 저장했어요. 이 브라우저에서만 확인할 수 있어요.' : '브라우저 저장 공간을 사용할 수 없어 저장하지 못했어요.';
    if (status.ok) {
      window.dispatchEvent(new CustomEvent('homehunt:financial-scenarios-changed'));
      const comparison = dialog.querySelector('[data-funding-comparison]');
      if (!comparison.hidden) comparison.replaceChildren(renderFinancialComparison());
    }
  });
  dialog.querySelector('[data-compare-funding]').addEventListener('click', () => {
    const comparison = dialog.querySelector('[data-funding-comparison]');
    comparison.hidden = !comparison.hidden;
    if (!comparison.hidden) { comparison.replaceChildren(renderFinancialComparison()); comparison.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  });
  dialog.showModal();
  financialSnapshotService.refresh();
  return dialog;
}

export function renderFinancialComparison() {
  const section = document.createElement('section');
  section.className = 'hh-funding-comparison';
  const items = loadFinancialScenarios(localStorageOrNull());
  section.innerHTML = '<h3>후보별 자금 계획 비교</h3><p class="hh-funding-note">저장한 시점의 사용자 입력 시나리오예요. 가격·현금·금리는 최신 조건을 다시 확인해 주세요.</p>';
  if (!items.length) {
    section.insertAdjacentHTML('beforeend', '<p class="hh-funding-empty">후보에서 자금 계획을 열고 저장하면 최대 3곳을 나란히 비교할 수 있어요.</p>');
    return section;
  }
  const results = items.map((item) => calculateFundingScenario(item.input));
  const row = (title, getter) => `<tr><th scope="row">${title}</th>${items.map((item, index) => `<td>${escapeHTML(getter(item, results[index]))}</td>`).join('')}</tr>`;
  section.insertAdjacentHTML('beforeend', `<div class="hh-funding-table-wrap" role="region" aria-label="최대 3개 후보 자금 계획 비교" tabindex="0"><table><thead><tr><th scope="col">비교 기준</th>${items.map((item, index) => `<th scope="col">${'ABC'[index]} · ${escapeHTML(item.candidate.name)}</th>`).join('')}</tr></thead><tbody>
    ${row('가격 근거', (item) => effectivePriceSource(item.candidate, item.input))}
    ${row('기준 가격', (item) => formatWon(item.input.priceWon))}
    ${row('가용 현금', (item) => formatWon(item.input.availableCashWon))}
    ${row('부대비용', (_, result) => `${formatWon(result.costsIncludedWon)}${result.costsComplete ? '' : ' · 미포함 항목 있음'}`)}
    ${row('필요 대출', (_, result) => formatWon(result.requiredLoanWon))}
    ${row('새 대출 월 상환', (_, result) => formatWon(result.monthlyWon))}
    ${row('월 총상환', (_, result) => formatWon(result.totalMonthlyWon))}
    ${row('기존 대출 반영', (item) => item.input.includeExisting ? formatWon(item.input.existingMonthlyWon) : '미반영 · 총상환 확인 필요')}
    ${row('개인 월 상환 한도', (item) => item.input.monthlyPaymentLimitWon > 0 ? formatWon(item.input.monthlyPaymentLimitWon) : '확인 필요')}
    ${row('구매 후 현금', (_, result) => formatWon(result.remainingCashWon))}
    ${row('입력 조건 판단', (_, result) => FUNDING_STATUS_LABELS[result.status])}
    ${row('금리 / 전체 기간', (item) => `${item.input.rate ?? '미입력'}% / ${item.input.term ?? '미입력'}년`)}
    ${row('금리 / 상환 방식', (item) => `${item.input.rateType === 'fixed' ? '고정' : item.input.rateType === 'variable' ? '변동' : '방식 미확인'} · ${{ '원리금': '원리금균등', '원금': '원금균등 첫 달', '만기': '만기일시 이자' }[item.input.repaymentType] || '미확인'}`)}
    ${row('거치기간 / 거치 이자', (item, result) => `${item.input.grace ?? '미입력'}년 / ${result.graceMonthlyWon == null ? '해당 없음 또는 미확인' : `월 ${formatWon(result.graceMonthlyWon)}`}`)}
    ${row('만기 별도 원금', (_, result) => result.balloonPrincipalWon > 0 ? formatWon(result.balloonPrincipalWon) : '해당 없음 또는 미확인')}
    ${row('저장 시각', (item) => item.savedAt ? new Date(item.savedAt).toLocaleString('ko-KR') : '확인 필요')}
    <tr><th scope="row">관리</th>${items.map((_, index) => `<td><button class="hh-funding-button" type="button" data-edit-scenario="${index}">수정</button><button class="hh-funding-button" type="button" data-remove-scenario="${index}">삭제</button></td>`).join('')}</tr></tbody></table></div>`);
  section.querySelectorAll('[data-edit-scenario]').forEach((button) => button.addEventListener('click', () => openFinancialPlan(items[Number(button.dataset.editScenario)].candidate)));
  section.querySelectorAll('[data-remove-scenario]').forEach((button) => button.addEventListener('click', () => {
    const result = removeFinancialScenario(localStorageOrNull(), items[Number(button.dataset.removeScenario)].candidate.id);
    if (result.ok) {
      const replacement = renderFinancialComparison();
      section.replaceWith(replacement);
      const focusTarget = replacement.querySelector('button') || replacement;
      if (focusTarget === replacement) replacement.tabIndex = -1;
      focusTarget.focus();
      window.dispatchEvent(new CustomEvent('homehunt:financial-scenarios-changed'));
    } else {
      let message = section.querySelector('[data-funding-delete-error]');
      if (!message) { message = document.createElement('p'); message.dataset.fundingDeleteError = ''; message.className = 'hh-funding-note'; message.setAttribute('role', 'status'); section.append(message); }
      message.textContent = '브라우저 저장 공간을 사용할 수 없어 시나리오를 삭제하지 못했어요.';
    }
  }));
  return section;
}
