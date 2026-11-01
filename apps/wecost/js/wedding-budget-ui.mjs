import { weddingBudgetSummary, isBudgetIncluded, validateWeddingBudget } from './wedding-budget-core.mjs';
import { cashAfterWedding } from './planning-core.mjs';
import { money, exact, esc, button, openDialog, closeDialog, saveFooter, submitCommand, showError } from './planning-ui.mjs';
import { categoryLabel, weddingCategory } from './wedding-core.mjs';
import { mountWeddingCalendar } from './wedding-calendar.mjs';
let getState;
export function registerWeddingBudget(getSt) {
  getState = getSt;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-wedding-budget]');
    if (b) openWeddingBudget(b.dataset.weddingBudget);
  });
}
export function budgetItemControl(item, policy) {
  const included = isBudgetIncluded(item, policy);
  return `<button type="button" class="wed-budget-tag ${included ? '' : 'excluded'}" data-wedding-budget="${esc(item.id)}" aria-label="${esc(item.name)} 예산 ${included ? '포함' : '제외'} 설정">${included ? '예산 포함' : '기록만'}</button>`;
}
export function budgetOverview(st) {
  const b = st.weddingBudget, f = st.funding;
  if (!b || !f) return '';
  return `<section class="card wed-budget-overview"><div class="card-hdr"><h2 class="card-title">우리 부담으로 볼 비용</h2>${button('예산 범위·예상 수입', 'data-wedding-budget=""')}</div><div class="wed-budget-equation"><span>예산에 포함<strong>${money(b.planned)}</strong></span><span>−</span><span>앞으로 들어올 돈<strong>${money(b.expectedIncome)}</strong></span><span>=</span><span>우리가 부담할 예상액<strong>${money(b.ownBudget)}</strong></span></div><p class="wed-note">전체 기록 ${money(b.allPlanned)} · 기록만 ${b.excluded.length}건 ${money(b.excludedPlanned)}. 기록만인 항목도 목록과 납부 일정에 남아요.</p>${b.expectedIncome ? `<p class="wed-note">수입 없이 더 필요 ${money(f.neededBeforeIncome)} → 수입 반영 후 ${money(f.needed)}${f.surplus ? ` · 예상 여유 ${money(f.surplus)}` : ''}. 수입 전 결제할 돈은 따로 준비해야 해요.</p>` : ''}</section>`;
}
function openWeddingBudget(focusId = '') {
  const st = getState();
  const expected = structuredClone(st.settings.weddingBudget ?? null);
  const draft = structuredClone(expected || { excludedIds: [], incomes: [] });
  const items = st.displayItems || [], calendars = [];
  const grouped = new Map();
  for (const i of items) { const cat = weddingCategory(i); if (!grouped.has(cat)) grouped.set(cat, []); grouped.get(cat).push(i); }
  const body = `<form id="wedding-budget-form"><p class="plan-note">예산 포함 여부는 결혼비용 합계·모을 돈·대시보드·집 예산에 함께 적용해요. 항목의 금액과 지급 내역은 보존해요.</p><div class="budget-preview" id="budget-preview" aria-live="polite"></div><h3>1. 어떤 비용을 예산에 넣을까요?</h3><p class="plan-note">체크를 해제하면 ‘기록만’ 남아요. 예산에 넣은 비용은 예상 수입을 연결해 충당할 수도 있어요.</p><div class="budget-scope-list">${[...grouped].map(([cat, rows]) => `<details ${!focusId || rows.some(i => i.id === focusId) ? 'open' : ''}><summary>${esc(categoryLabel(cat))} <small>${rows.length}개</small></summary>${rows.map(i => `<label class="budget-scope-row"><input type="checkbox" data-budget-id="${esc(i.id)}" ${isBudgetIncluded(i, draft) ? 'checked' : ''}><span>${esc(i.name)}</span><strong title="${esc(exact(i.payment.planned))}">${money(i.payment.planned)}</strong><small data-inclusion-label>${isBudgetIncluded(i, draft) ? '예산 포함' : '기록만'}</small></label>`).join('')}</details>`).join('')}</div><h3>2. 앞으로 들어올 돈</h3><p class="plan-note">아직 보유 자금·저축·부모님 지원·추가 수입에 들어 있지 않은 돈만 기록해요. 입금 후에는 현재 잔액을 반영하고 여기서 체크를 꺼주세요.</p><div id="budget-incomes"></div>${button('+ 예상 수입 추가', 'data-add-income')}<p class="plan-note">특정 비용에 연결한 수입은 그 비용이 ‘기록만’이면 함께 계산에서 빠져요. 일반 축의금은 ‘공통 결혼자금’으로 선택하세요.</p><p id="budget-income-timing" class="plan-note"></p>${saveFooter('예산 기준 저장')}</form>`;
  openDialog('예산 범위와 예상 수입', body, dialog => {
    const form = dialog.querySelector('form'), list = form.querySelector('#budget-incomes');
    const sourceItems = new Map(items.map(i => [i.id, i]));
    function preview() {
      try {
        read(); validateWeddingBudget(draft);
        const b = weddingBudgetSummary(items, draft, st.funding?.available ?? null);
        const needed = b.included.some(item => item.fxPending) ? null : b.needed;
        const cash = cashAfterWedding(st.coupleSavings, st.support, st.adjustmentsTotal, needed);
        form.querySelector('#budget-preview').innerHTML = `<div><span>포함 비용</span><strong>${money(b.planned)}</strong></div><div><span>기록만</span><strong>${money(b.excludedPlanned)}</strong></div><div><span>반영할 예상 수입</span><strong>${money(b.expectedIncome)}</strong></div><div><span>추가로 모을 돈</span><strong>${money(needed)}</strong></div><small>저장 전 미리보기 · 집 예상 현금 ${money(cash == null ? null : Math.max(cash, 0))}${cash < 0 ? ` · 부족 ${money(-cash)}` : ''} · 추가 필요액만 차감</small>`;
        form.querySelector('#budget-income-timing').textContent = b.undatedIncome ? '예정일이 없는 수입이 있어요. 납부일까지 들어오는지는 따로 확인해주세요.' : b.expectedIncome ? '예상 수입은 입금된 현금이 아니에요. 납부일과 입금 예정일을 함께 확인해주세요.' : '';
        for (const row of b.incomeRows) {
          const article = [...list.children].find(el => el.dataset.incomeId === row.id);
          if (article) article.querySelector('[data-income-effect]').textContent = row.applied ? '모을 돈·집 예상 현금에 반영' : row.enabled ? '연결 비용이 제외되었거나 없어 함께 제외' : '계산 제외';
        }
      } catch (error) { form.querySelector('#budget-preview').textContent = error.message; }
    }
    function read() {
      const visibleIds = new Set(items.flatMap(i => [i.id, i.travelParentId].filter(Boolean)));
      draft.excludedIds = [...draft.excludedIds.filter(id => !visibleIds.has(id)), ...[...form.querySelectorAll('[data-budget-id]')].filter(el => !el.checked).map(el => el.dataset.budgetId)];
      for (const node of form.querySelectorAll('[data-budget-id]')) node.closest('label').querySelector('[data-inclusion-label]').textContent = node.checked ? '예산 포함' : '기록만';
      draft.incomes = [...list.children].map(node => ({
        id: node.dataset.incomeId, name: node.querySelector('[name=name]').value.trim(),
        amount: /^[\d,]+$/.test(node.querySelector('[name=amount]').value) ? Number(node.querySelector('[name=amount]').value.replaceAll(',', '')) : NaN,
        date: node.querySelector('[name=date]').value,
        itemId: node.querySelector('[name=itemId]').value,
        enabled: node.querySelector('[name=enabled]').checked,
      }));
    }
    function appendIncome(row) {
      const article = document.createElement('section'); article.className = 'budget-income'; article.dataset.incomeId = row.id;
      article.innerHTML = `<div class="budget-income-head"><label><input name="enabled" type="checkbox" ${row.enabled ? 'checked' : ''}> 예상 수입 반영</label>${button('지우기', 'data-remove-income')}</div><div class="plan-form-grid"><label class="plan-field"><span>수입 이름</span><input name="name" value="${esc(row.name)}" maxlength="100" placeholder="예: 축의금 예상"></label><label class="plan-field"><span>예상 금액 (원)</span><input name="amount" inputmode="numeric" value="${row.amount.toLocaleString('ko-KR')}"></label><label class="plan-field"><span>입금 예정일 · 선택</span><input id="income-date-${esc(row.id)}" name="date" type="date" value="${esc(row.date)}"></label><label class="plan-field"><span>충당할 비용</span><select name="itemId"><option value="">공통 결혼자금</option>${items.map(i => `<option value="${esc(i.id)}" ${i.id === row.itemId ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}${row.itemId && !sourceItems.has(row.itemId) ? `<option selected value="${esc(row.itemId)}">기존 연결 항목 · 현재 목록에 없음</option>` : ''}</select></label></div><small data-income-effect></small>`;
      list.append(article);
      const calendar = mountWeddingCalendar(article.querySelector('[name=date]'));
      if (calendar) calendars.push(calendar);
      article.querySelector('[data-remove-income]').onclick = () => { calendar?.destroy(); const n = calendars.indexOf(calendar); if (n >= 0) calendars.splice(n, 1); article.remove(); changed(); };
    }
    const changed = () => { form.dataset.dirty = 'true'; form.querySelector('.plan-save-status').textContent = '저장 전 미리보기'; preview(); };
    draft.incomes.forEach(appendIncome);
    form.addEventListener('input', changed); form.addEventListener('change', changed);
    form.querySelector('[data-add-income]').onclick = () => { appendIncome({ id: crypto.randomUUID(), name: '', amount: 0, date: '', itemId: '', enabled: true }); changed(); list.lastElementChild.querySelector('[name=name]').focus(); };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      try { read(); validateWeddingBudget(draft); await submitCommand(form, { kind: 'settings', values: { weddingBudget: draft }, expected: { weddingBudget: expected } }); closeDialog(); }
      catch (error) { showError(form, error); }
    });
    dialog.addEventListener('close', () => calendars.forEach(c => c.destroy()), { once: true });
    preview();
  });
}
