import { subscribeWeddingFunds, saveWeddingFinance, exportWeddingBackup } from './wedding-funds-store.mjs';
import { normalizeFunds, fundingSummary, travelBreakdown, currentTravelBreakdown, travelLedgerItems, buildFundingChange } from './wedding-funds-core.mjs';
import { deriveBudgetDraft, isTravelItem } from '../../../shared/finance/travel-budget-core.mjs';
import { registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { localDate } from './wedding-core.mjs';
import { createFxReader, dollarValuation, quoteIsOld } from './wedding-fx.mjs';

let state = { funds: null, plan: null, connection: 'loading', error: '' }, getState, rerender, dialog, expected, currentItem, draft, mode, operationId, busy = false, retired = false;
let fxReader, fxState = { quote: null, loading: false, error: '' }, travelFocusId = null, restoreFxFocus = false;
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const won = value => `${Number(value).toLocaleString('ko-KR')}원`;
const compact = value => value >= 10000 ? `${(value / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}만원` : won(value);
const dollars = value => `US$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const button = (action, text, id = '', row = '') => `<button type="button" class="tbl-action-btn" data-finance="${action}" data-id="${esc(id)}" data-row="${esc(row)}">${text}</button>`;
const el = id => document.getElementById(id);
const hasFunds = () => state.funds?.cashKrw !== undefined;
const quoteStamp = quote => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(quote.asOf);
function foreignReferenceHTML(amount) {
  const { quote, loading, error } = fxState, valuation = dollarValuation(amount, 0, quote);
  if (!valuation) return `<span>${loading ? '원화 환산 확인 중…' : error ? '원화 환산 조회 실패' : '원화 환산 확인 전'}</span>`;
  return `<span title="${esc(`${won(valuation.value)} · ${quoteStamp(quote)} KST 고시 · 1 USD ≈ ${quote.rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원`)}">${quoteIsOld(quote) ? '이전 고시' : '현재'} 약 ${compact(valuation.value)}</span>`;
}
export function weddingForeignAmount(item) {
  if (!item.travelRowId || item.currency !== 'USD' || !Number.isFinite(item.nativeAmount) || item.nativeAmount < 0) return '';
  return `<span class="wed-foreign-amount"><strong>${dollars(item.nativeAmount)}</strong><small class="wed-foreign-reference" data-wed-usd-reference="${item.nativeAmount}">${foreignReferenceHTML(item.nativeAmount)}</small>${item.fxPending ? `<small class="wed-foreign-budget">환율 확인 전 · 임시 ${compact(item.planned)}</small>` : ''}</span>`;
}
export function weddingForeignNote(items) {
  return items.some(item => item.travelRowId && item.currency === 'USD') ? '<p class="wed-note wed-currency-note">달러 금액은 고정이고 원화 환산액은 환율에 따라 달라져요. 예산·잔금·합계·정렬에 같은 환율이 반영돼요. 지급한 금액은 그대로예요. <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates By Exchange Rate API ↗</a></p>' : '';
}
function fxHTML() {
  const { quote, loading, error } = fxState;
  const valuation = dollarValuation(state.funds?.usdBalance, state.funds?.usdCostKrw, quote);
  const stamp = quote ? quoteStamp(quote) : '';
  const difference = valuation ? valuation.difference === 0 ? '환전 원가와 같아요' : `환전 원가보다 ${compact(Math.abs(valuation.difference))} ${valuation.difference < 0 ? '낮아요' : '높아요'}` : '';
  return `<div class="wf-fx-value"><span>${quote && quoteIsOld(quote) ? '이전 고시 환율로 환산' : '현재 환율로 본 달러'}</span><strong${valuation ? ` title="${won(valuation.value)}"` : ''}>${valuation ? `약 ${compact(valuation.value)}` : loading ? '환율 확인 중…' : '—'}</strong>${valuation ? `<small>${difference}</small>` : ''}</div><div class="wf-fx-meta">${quote ? `<span>1 USD ≈ ${quote.rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원</span><small>${stamp} KST 고시 · 일 1회 갱신</small>` : '<span>최신 고시 환율을 확인해요</span>'}<a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates By Exchange Rate API ↗</a></div><button type="button" class="tbl-action-btn" data-finance="refresh-fx" data-focus="fx-refresh" ${loading ? 'disabled' : ''}>${loading ? '조회 중…' : '환율 새로고침'}</button><p class="wf-fx-note" role="status">${error ? `${esc(error)} ` : ''}참고 환산액이에요. 은행의 실제 환전액과 다를 수 있으며 합계와 추가로 모을 돈에 반영돼요. 실제 원가·지급 기록은 유지해요.</p>`;
}
export function ensureWeddingFx() {
  const hasUsdCosts = state.plan?.rows?.some(row => row.currency === 'USD');
  if (!retired && fxReader && (hasUsdCosts || (hasFunds() && state.funds.usdBalance > 0))) void fxReader.refresh();
}
const field = (id, label, value, unit = '원', extra = '') => `<label class="wf-field" for="${id}"><span>${label}</span><span class="wf-input"><input id="${id}" inputmode="decimal" autocomplete="off" value="${esc(value ?? '')}" ${extra}><small>${unit}</small></span></label>`;
const num = id => {
  const text = el(id).value.replaceAll(',', '').trim();
  if (!/^(?:\d+)(?:\.\d+)?$/.test(text)) throw Error('금액을 숫자로 입력해주세요.');
  return Number(text);
};
function fundingCardContent(items) {
  let summary;
  try { summary = fundingSummary(items, state.funds, state.plan, fxState.quote); } catch { summary = { needed: null }; }
  const ready = summary.needed !== null;
  return `<div class="mc-label">${ready && summary.surplus > 0 ? '예산보다 남는 돈' : '추가로 모을 돈'}</div><div class="mc-value" id="s-funding-gap">${ready ? compact(summary.surplus || summary.needed) : '—'}</div><div class="mc-sub">${ready ? `전체 잔금 − 현재 환산 합계 · ${rateBasis()}` : summary.missingRate ? '환율 확인 후 계산해요' : '현재 남은 결혼자금을 등록해주세요'}</div>`;
}
export const weddingFundingCard = items => `<div class="metric-card wf-goal" id="wf-funding-card">${fundingCardContent(items)}</div>`;
const rateBasis = () => !state.funds?.usdBalance ? '원화 잔액 기준' : fxState.quote && quoteIsOld(fxState.quote) ? '마지막 확인 환율 기준' : '현재 환율 기준';
function currentTotalHTML() {
  const summary = fundingSummary([], state.funds, null, fxState.quote);
  return `<span>현재 환산 합계</span><strong>${summary.available === null ? '—' : compact(summary.available)}</strong><small>${summary.available === null ? '환율 확인 후 계산해요' : `원화 + 달러 평가액 · ${rateBasis()}`}</small>`;
}
export const weddingDisplayItems = items => travelLedgerItems(items, state.plan, state.funds, fxState.quote);
export function weddingRateHint(items) {
  if (!items.some(item => item.id === state.plan?.linkedItemId) || !state.plan?.rows?.some(row => row.currency === 'USD')) return '';
  return fxState.quote ? ` · ${quoteIsOld(fxState.quote) ? '이전 고시' : '현재 환율'} 반영` : ' · 환율 확인 전 저장 예산';
}
export function weddingTravelAdd(cat) {
  const item = getState?.().items.find(i => i.id === state.plan?.linkedItemId && i.cat === cat);
  return item && travelBreakdown(item, state.plan, state.funds).rows.length ? `<button type="button" class="wed-category-add" data-finance="travel-add" data-id="${esc(item.id)}" aria-label="신혼여행에 항목 추가">+ 추가</button>` : '';
}
export function weddingTravelActions(item) {
  if (item.travelRowId) return `<span class="wf-item-actions">${button('travel-row', '수정', item.travelParentId, item.travelRowId)}${button('payment', '기록', item.travelParentId, item.travelRowId)}</span>`;
  if (item.travelDetailError) return button('travel', '세부 비용 확인', item.id);
  return '';
}
export function weddingRemaining(items) { return fundingSummary(items, state.funds, state.plan, fxState.quote).remaining; }
export function withWeddingDetails(item, payment) {
  const detail = currentTravelBreakdown(item, state.plan, state.funds, fxState.quote);
  if (!detail.rows.length) return payment;
  const remaining = detail.rows.reduce((sum, row) => sum + row.remaining, 0), planned = detail.rows.reduce((sum, row) => sum + row.planned, 0);
  return { ...payment, planned, progress: planned > 0 ? Math.min(100, Math.round(payment.paid / planned * 100)) : 0, remaining, status: remaining > 0 ? (payment.paid > 0 ? 'partial' : 'unpaid') : planned > 0 ? 'done' : payment.status, overpaid: detail.rows.reduce((sum, row) => sum + Math.max(row.paid - row.planned, 0), 0) };
}
export function weddingFundsHTML() {
  const f = state.funds;
  return `<section class="card wf-funds" aria-label="남아 있는 결혼자금"><div class="wf-funds-title"><h2 class="card-title">남아 있는 결혼자금</h2><p>사용 후 현재 남은 현금·달러</p></div>${hasFunds() ? `<div class="wf-fund-amount"><span>원화</span><strong>${compact(f.cashKrw)}</strong></div><div class="wf-fund-amount"><span>보유 달러</span><strong>${dollars(f.usdBalance)}</strong><small>남은 달러의 환전 원가 ${compact(f.usdCostKrw)}</small></div><div class="wf-fund-amount wf-total" id="wf-current-total">${currentTotalHTML()}</div>` : `<p class="wf-funds-empty">${state.error || (state.connection === 'loading' ? '결혼자금 불러오는 중…' : '현재 남은 원화와 달러를 따로 등록해요.')}</p>`}${button('funds', hasFunds() ? '자금 관리' : '자금 등록')}${hasFunds() && f.usdBalance > 0 ? `<div id="wf-fx-panel" class="wf-fx-panel" aria-label="보유 달러 현재 환산액">${fxHTML()}</div>` : ''}<p class="wf-funds-caption">기존 저축과 별도 · 달러는 원화 카드대금과 구분해요.${state.connection !== 'live' && hasFunds() ? ' 최신 잔액 연결 확인 중' : ''}</p></section>`;
}

function shell(title, subtitle, body, saveLabel = '저장') {
  dialog.innerHTML = `<form id="wf-form"><header><div><h2 id="wf-title">${title}</h2><p>${subtitle}</p></div><button type="button" class="wf-close" data-close aria-label="닫기">×</button></header><div class="wf-body">${body}<p id="wf-error" class="wf-error" role="alert" tabindex="-1"></p></div><footer><button type="button" class="btn btn-ghost" data-close>취소</button><button type="submit" class="btn btn-primary">${saveLabel}</button></footer></form>`;
  dialog.showModal();
  document.body.classList.add('wf-modal-open');
  dialog.querySelector('.wf-body input, .wf-body select, .wf-body button')?.focus();
}
function capture(item = null) {
  if (state.connection !== 'live') throw Error(state.error || '결혼자금 연결을 확인한 뒤 다시 열어주세요.');
  currentItem = item ? structuredClone(item) : null;
  expected = structuredClone({ funds: state.funds, plan: item ? state.plan : null, item });
  operationId = crypto.randomUUID();
}
function openFunds() {
  capture(); mode = 'balances';
  const f = hasFunds() ? state.funds : { cashKrw: '', usdBalance: '', usdCostKrw: '' };
  shell('남아 있는 결혼자금', '이미 사용한 돈을 제외한 현재 잔액을 입력해요.', `<section class="wf-section">${field('wf-cash', '현재 원화 잔액', f.cashKrw)}<div class="wf-two">${field('wf-usd', '현재 달러 잔액', f.usdBalance, 'USD')}${field('wf-cost', '남은 달러의 환전 원가', f.usdCostKrw)}</div><p class="wf-help">환전할 때 지출한 원화 중 현재 남은 달러에 해당하는 금액이에요. 환율 변동만으로 원가를 바꾸지 않아요.</p><div class="wf-preview" id="wf-preview" aria-live="polite"></div></section><p class="wf-help">저축·납부 내역은 바뀌지 않아요. 돈을 모았으면 잔액을 늘리고, 실제 결제는 항목의 ‘납부·환불’에서 기록하세요.</p><details class="wf-backup"><summary>변경 전 자료 보관</summary><p>현재 재무 원본을 비공개 JSON 파일로 내려받아요. 이 파일에는 실제 금액이 포함돼요.</p><button type="button" class="btn btn-ghost" data-backup>원본 백업 내려받기</button><p id="wf-backup-status" role="status"></p></details>`);
  preview();
}
function travelInputs() {
  return draft.rows.map((row, index) => travelFocusId && row.id !== travelFocusId ? '' : `<section class="wf-edit-row" data-row-index="${index}">${travelFocusId ? '' : `<div class="wf-row-heading"><strong>세부 비용 ${index + 1}</strong><button type="button" class="wf-remove" data-remove="${index}" aria-label="세부 비용 ${index + 1} 삭제">삭제</button></div>`}<label class="wf-field"><span>항목명</span><input data-key="name" value="${esc(row.name)}" maxlength="100" required></label><div class="wf-two"><label class="wf-field"><span>예정 금액</span><input data-key="amount" value="${esc(row.amount ?? '')}" inputmode="decimal" required></label><label class="wf-field"><span>통화</span><select data-key="currency"><option value="KRW" ${row.currency === 'KRW' ? 'selected' : ''}>원화 KRW</option><option value="USD" ${row.currency === 'USD' ? 'selected' : ''}>미국 달러 USD</option></select></label></div><div class="wf-two"><label class="wf-field"><span>지급한 계약금 (원)</span><input data-key="deposit" value="${row.deposit ?? ''}" inputmode="numeric" required></label><label class="wf-field"><span>계약금 외 지급액 (원)</span><input data-key="actual" value="${row.actual ?? ''}" inputmode="numeric" required></label></div><label class="wf-field"><span>메모 · 확정/추정 근거</span><input data-key="note" value="${esc(row.note)}" maxlength="2000"></label></section>`).join('');
}
function openTravel(item, rowId = null, add = false) {
  capture(item); mode = 'travel';
  const plan = deriveBudgetDraft(item, state.plan);
  const saved = state.funds?.travel?.linkedItemId === item.id ? state.funds.travel.payments : [];
  draft = { ...plan, rows: plan.rows.map((row, index) => ({ ...row, deposit: saved.find(p => p.id === row.id)?.deposit ?? (plan.rows.length === 1 && index === 0 ? item.deposit || 0 : (item.deposit || 0) > 0 ? null : 0), actual: saved.find(p => p.id === row.id)?.actual ?? (plan.rows.length === 1 && index === 0 ? item.actual || 0 : (item.actual || 0) > 0 ? null : 0) })) };
  travelFocusId = rowId;
  if (add) {
    if (draft.rows.length >= 50) throw Error('여행 비용은 최대 50개까지 등록할 수 있어요.');
    const row = { id: crypto.randomUUID(), name: '', amount: null, currency: 'KRW', deposit: 0, actual: 0, note: '' };
    draft.rows.push(row); travelFocusId = row.id;
  }
  if (travelFocusId && !draft.rows.some(row => row.id === travelFocusId)) throw Error('최신 항목을 다시 선택해주세요.');
  shell(add ? '신혼여행 항목 추가' : travelFocusId ? '신혼여행 항목 수정' : '신혼여행 비용 정리', travelFocusId ? '이 항목의 예산과 지급액을 수정해요.' : '예산과 이미 지급한 돈을 나눠 입력해요.', `${field('wf-fx', '현재 적용 환율', fxState.quote?.rate ?? '', '원/USD', 'readonly')}<p class="wf-help">${fxState.quote ? '달러 예산·잔금은 이 고시 환율로 계산돼요. 원화 카드 결제액은 청구가 확정되면 기록하세요.' : '달러 비용을 저장하려면 현재 환율 조회가 필요해요. 창을 닫고 환율을 다시 확인해주세요.'}</p>${travelFocusId ? '' : `<label class="wf-field"><span>여행 전체 메모</span><textarea id="wf-travel-memo" maxlength="5000" rows="3">${esc(item.memo || plan.note || '')}</textarea></label>`}<div id="wf-rows">${travelInputs()}</div>${travelFocusId ? '' : '<button type="button" class="btn btn-ghost" data-add-row>+ 세부 비용 추가</button>'}<div id="wf-preview" class="wf-preview" aria-live="polite"></div><p class="wf-help">실제 결제는 목록의 ‘기록’에서 남겨주세요. 이 화면에서 지급액을 정정해도 현재 자금 잔액은 자동 차감되지 않아요.</p>`, '저장');
  preview();
}
function readTravelRows() {
  for (const section of dialog.querySelectorAll('[data-row-index]')) {
    const original = draft.rows[Number(section.dataset.rowIndex)], value = key => section.querySelector(`[data-key="${key}"]`).value;
    const number = key => {
      const raw = value(key).replaceAll(',', '').trim();
      return raw === '' ? null : /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
    };
    draft.rows[Number(section.dataset.rowIndex)] = { id: original.id, name: value('name'), currency: value('currency'), amount: number('amount'), deposit: number('deposit'), actual: number('actual'), note: value('note') };
  }
}
function openPayment(item, rowId = '') {
  capture(item); mode = 'payment';
  const detail = currentTravelBreakdown(item, state.plan, state.funds, fxState.quote);
  if (detail.error) { openTravel(item); return; }
  const selected = detail.rows.find(row => row.id === rowId);
  shell('납부·환불 기록', `${esc(item.name)} · 실제 처리한 금액만 기록해요.`, `${detail.rows.length ? `<label class="wf-field"><span>신혼여행 세부 비용</span><select id="wf-target"><option value="">항목 선택</option>${detail.rows.map(row => `<option value="${esc(row.id)}" ${selected?.id === row.id ? 'selected' : ''}>${esc(row.name)} · 잔금 ${compact(row.remaining)}</option>`).join('')}</select></label>` : ''}<div class="wf-choice" role="group" aria-label="기록 종류"><label><input type="radio" name="direction" value="payment" checked> 납부</label><label><input type="radio" name="direction" value="refund"> 환불 받음</label></div><fieldset class="wf-source"><legend>어디에서 사용한 돈인가요?</legend><label><input type="radio" name="source" value="cash" ${!hasFunds() ? 'disabled' : ''}> 결혼자금 원화<small>${hasFunds() ? compact(state.funds.cashKrw) : '자금 등록 필요'}</small></label><label><input type="radio" name="source" value="usd" ${!hasFunds() || !state.funds.usdBalance ? 'disabled' : ''}> 보유 달러<small>${hasFunds() ? dollars(state.funds.usdBalance) : '자금 등록 필요'}</small></label><label><input type="radio" name="source" value="outside"> 별도 자금·카드<small>결혼자금 잔액 유지</small></label></fieldset>${field('wf-payment', '실제 납부·환불액', '', '원')}<label class="wf-field" id="wf-refund-component" hidden><span>환불받은 금액의 원래 구분</span><select id="wf-component"><option value="deposit">계약금</option><option value="actual">계약금 외 지급액</option></select></label><label class="wf-field"><span>처리 날짜</span><input id="wf-date" type="date" value="${localDate()}" max="${localDate()}" required></label><div id="wf-preview" class="wf-preview" aria-live="polite">결제 자금과 실제 금액을 선택해주세요.</div><p class="wf-help">신용카드는 실제 청구·사용한 원화 금액으로 기록하세요. 예정 환불은 입금된 뒤 기록하고, 환불받는 자금으로 원화 또는 별도 자금을 선택해요.</p>`, '기록 저장');
}
function command() {
  if (mode === 'balances') return { kind: mode, balances: normalizeFunds({ cashKrw: num('wf-cash'), usdBalance: num('wf-usd'), usdCostKrw: num('wf-cost') }) };
  if (mode === 'travel') {
    readTravelRows();
    const hasUsd = draft.rows.some(row => row.currency === 'USD');
    if (hasUsd && !fxState.quote) throw Error('현재 환율을 불러온 뒤 달러 비용을 저장해주세요.');
    return { kind: mode, plan: { ...draft, fxRate: hasUsd ? fxState.quote.rate : draft.fxRate, note: el('wf-travel-memo')?.value ?? draft.note }, ledgerMemo: el('wf-travel-memo')?.value ?? (currentItem.memo || ''), payments: draft.rows.map(row => ({ id: row.id, deposit: row.deposit, actual: row.actual })) };
  }
  return { kind: 'payment', direction: dialog.querySelector('[name="direction"]:checked')?.value, source: dialog.querySelector('[name="source"]:checked')?.value || '', amount: num('wf-payment'), rowId: el('wf-target')?.value || '', component: el('wf-component').value, date: el('wf-date').value };
}
function preview() {
  if (!el('wf-preview')) return;
  try {
    const input = command(), next = buildFundingChange(expected, input, expected, localDate());
    if (mode === 'balances') {
      const summary = fundingSummary(getState().items, next.funds, state.plan, fxState.quote);
      el('wf-preview').textContent = `현재 환산 합계 ${summary.available === null ? '환율 확인 필요' : compact(summary.available)} · ${summary.needed === null ? '추가로 모을 돈은 환율 확인 후 계산해요' : summary.surplus ? '예산보다 남는 돈 ' + compact(summary.surplus) : '추가로 모을 돈 ' + compact(summary.needed)}${summary.costRate ? ` · 평균 환전 원가 ${summary.costRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원/USD` : ''}`;
    } else if (mode === 'travel') {
      const p = next.itemPatch;
      const row = next.plan.rows.find(row => row.id === travelFocusId);
      const payment = row && next.funds.travel.payments.find(value => value.id === row.id);
      const planned = row && Math.round(row.amount * (row.currency === 'USD' ? next.plan.fxRate : 1));
      el('wf-preview').textContent = row ? `이 항목 예정 ${compact(planned)} · 지급 ${compact(payment.deposit + payment.actual)} · 잔금 ${compact(Math.max(planned - payment.deposit - payment.actual, 0))}` : `예정 ${compact(p.planned)} · 지급 ${compact(p.deposit + p.actual)} · 잔금 ${compact(p.balance)} (기존 예정 ${compact(currentItem.planned)} · 기존 지급 ${compact((currentItem.deposit || 0) + (currentItem.actual || 0))})`;
    } else {
      const f = next.funds, m = next.movement;
      const remaining = fundingSummary([{ ...currentItem, ...next.itemPatch }], f, expected.plan, fxState.quote).remaining;
      el('wf-preview').textContent = `장부 ${m.direction === 'refund' ? '환불' : '지급'} ${won(m.won)} · 남은 잔금 ${compact(remaining)}${f.cashKrw !== undefined ? ` · 결혼자금 원화 ${compact(f.cashKrw)} / 달러 ${dollars(f.usdBalance)}` : ''}`;
    }
  } catch (error) { el('wf-preview').textContent = error.message; }
}
export function handleWeddingFinance(target) {
  const action = target.dataset.finance || (target.dataset.action === 'pay' ? 'payment' : '');
  if (!action) return false;
  if (action === 'refresh-fx') { restoreFxFocus = true; if (fxReader) void fxReader.refresh(true); return true; }
  if (busy) return true;
  try {
    const item = getState().items.find(i => i.id === target.dataset.id);
    if (action === 'funds') openFunds();
    else if (item && action === 'travel') openTravel(item);
    else if (item && action === 'travel-row') openTravel(item, target.dataset.row);
    else if (item && action === 'travel-add') openTravel(item, null, true);
    else if (item && action === 'payment') openPayment(item, target.dataset.row);
  } catch (error) { window.alert(error.message); }
  return true;
}
export function registerWeddingFinance(getSt, render) {
  getState = getSt; rerender = render;
  let storage = null;
  try { storage = window.localStorage; } catch { /* Public quote caching is optional. */ }
  fxReader = createFxReader({ storage, onChange: next => {
    if (retired) return;
    const changed = fxState.quote?.rate !== next.quote?.rate || fxState.quote?.asOf !== next.quote?.asOf;
    fxState = next;
    if (changed && el('s-total')) {
      const y = window.scrollY;
      rerender(getState(), { fxUpdate: true });
      window.scrollTo(0, y);
    }
    for (const node of document.querySelectorAll('[data-wed-usd-reference]')) node.innerHTML = foreignReferenceHTML(Number(node.dataset.wedUsdReference));
    if (el('wf-fx-panel')) el('wf-fx-panel').innerHTML = fxHTML();
    if (el('wf-current-total')) el('wf-current-total').innerHTML = currentTotalHTML();
    if (el('wf-funding-card')) el('wf-funding-card').innerHTML = fundingCardContent(getState().items);
    if (dialog?.open) {
      if (mode === 'travel' && el('wf-fx')) el('wf-fx').value = fxState.quote?.rate ?? '';
      preview();
    }
    if (restoreFxFocus && !next.loading) { el('wf-fx-panel')?.querySelector('[data-finance=refresh-fx]')?.focus({ preventScroll: true }); restoreFxFocus = false; }
  } });
  fxState = fxReader.snapshot();
  dialog = document.createElement('dialog'); dialog.id = 'wf-dialog'; dialog.className = 'wf-dialog'; dialog.setAttribute('aria-labelledby', 'wf-title');
  document.querySelector('[data-private-root]').append(dialog);
  dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  dialog.addEventListener('close', () => { dialog.replaceChildren(); expected = null; currentItem = null; draft = null; travelFocusId = null; document.body.classList.remove('wf-modal-open'); });
  dialog.addEventListener('input', preview);
  dialog.addEventListener('change', e => {
    if (e.target.name === 'source') { el('wf-payment').value = ''; el('wf-payment').closest('.wf-input').querySelector('small').textContent = e.target.value === 'usd' ? 'USD' : '원'; }
    if (e.target.name === 'direction') {
      const refund = e.target.value === 'refund';
      el('wf-refund-component').hidden = !refund;
      const usd = dialog.querySelector('[name="source"][value="usd"]');
      usd.disabled = refund || !hasFunds() || !state.funds.usdBalance;
      if (refund && usd.checked) { usd.checked = false; el('wf-payment').value = ''; }
    }
    preview();
  });
  dialog.addEventListener('click', async e => {
    const target = e.target.closest('button'); if (!target || busy) return;
    if (target.hasAttribute('data-close')) { dialog.close(); return; }
    if (target.hasAttribute('data-add-row') || target.hasAttribute('data-remove')) {
      readTravelRows();
      if (target.hasAttribute('data-add-row')) { if (draft.rows.length >= 50) return; draft.rows.push({ id: crypto.randomUUID(), name: '', amount: null, currency: 'KRW', deposit: 0, actual: 0, note: '' }); }
      else { if (draft.rows.length <= 1) return; draft.rows.splice(Number(target.dataset.remove), 1); }
      el('wf-rows').innerHTML = travelInputs(); preview();
      el('wf-rows').lastElementChild?.querySelector('input')?.focus();
    }
    if (target.hasAttribute('data-backup')) {
      target.disabled = true;
      try {
        const backup = await exportWeddingBackup(); if (retired || !dialog.open) return;
        const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `wecost-private-backup-${localDate()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        el('wf-backup-status').textContent = '다운로드를 요청했어요. 저장된 파일을 확인해주세요.';
      } catch (error) { if (el('wf-backup-status')) el('wf-backup-status').textContent = error.message; }
      finally { if (!retired) target.disabled = false; }
    }
  });
  dialog.addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return;
    try {
      const input = command(); buildFundingChange(expected, input, expected, localDate());
      busy = true; el('wf-error').textContent = '';
      dialog.querySelectorAll('input,select,textarea,button').forEach(node => node.disabled = true);
      await saveWeddingFinance(input, expected, operationId);
      if (!retired) { busy = false; dialog.close(); }
    } catch (error) {
      if (!retired) {
        busy = false; el('wf-error').textContent = error.message || '저장하지 못했어요. 입력 내용은 유지돼요.';
        dialog.querySelectorAll('input,select,textarea,button').forEach(node => node.disabled = false);
        if (mode === 'payment') {
          dialog.querySelector('[name=source][value=cash]').disabled = !hasFunds();
          dialog.querySelector('[name=source][value=usd]').disabled = !hasFunds() || !state.funds.usdBalance || dialog.querySelector('[name=direction]:checked').value === 'refund';
        }
        el('wf-error').focus();
      }
    }
  });
  subscribeWeddingFunds(next => { if (retired) return; state = next; if (el('s-total')) rerender(getState()); });
  registerPrivateCleanup(() => { retired = true; fxReader?.dispose(); fxState = { quote: null, loading: false, error: '' }; busy = false; state = { funds: null, plan: null, connection: 'loading', error: '' }; dialog.close(); dialog.remove(); expected = null; draft = null; currentItem = null; });
}
