import { OWNERS, emptyCost, costFields, validateCost, localDate, localMonth, monthlyCost, fixedSummary, sortCosts, nextDue, dueInMonth, isActiveInMonth, resolveIcon, searchIcons } from './fixed-costs-core.mjs';
import { fixedCostsStore } from './fixed-costs-store.mjs';
import { registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { mountWeddingCalendar } from './wedding-calendar.mjs';

const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const won = amount => `${Math.round(amount).toLocaleString('ko-KR')}원`;
const ownerOf = id => OWNERS.find(owner => owner.id === id) || OWNERS[0];
const btn = (label,attr = '',primary = false) => `<button type="button" class="plan-button${primary ? ' primary' : ''}" ${attr}>${label}</button>`;
// Match the existing planning tabs; item icons keep their user-selected Lucide ID.
const chromeIcon = (id,tone = 'cream') => `<span class="plan-icon ${tone}" aria-hidden="true"><img src="assets/icons/${id}.svg" width="22" height="22" alt=""></span>`;
const ownerStyle = id => ({ sungwoo:{icon:'piggy-bank',tone:'sky'},sohee:{icon:'piggy-bank',tone:'rose'},shared:{icon:'house-heart',tone:'sage'} }[id]);
const state = { items:[],ready:false,error:'',fromCache:true,pending:false,catalog:null,month:localMonth(),notice:'' };
let stop, retired = false, dialog, opener, bodyOverflow, view = '', editor = null, busy = false, calendars = [], discardAction;
let list = { owner:'sungwoo',query:'',sort:'amount',status:'active',scroll:0 };
let picker = { query:'',group:'all',mode:'recommended' }, recent = [];
const iconHTML = (id,tone = '') => {
  const safe = state.catalog?.icons.some(icon => icon.id === id) ? id : 'wallet';
  return `<span class="plan-icon fc-icon ${tone}" aria-hidden="true"><img src="assets/fixed-cost-icons/${safe}.svg" width="21" height="21" alt=""></span>`;
};
const itemIcon = item => resolveIcon(item,state.catalog).id;
const cycle = item => item.frequency === 'yearly' ? `매년 ${item.month}월 ${item.day ? `${item.day}일` : '출금일 미정'}` : item.day ? `매월 ${item.day}일` : '출금일 미정';
const categoryLabel = item => state.catalog.groups.find(group => group.id === item.category)?.label || '기타';
function row(item) {
  return `<button class="fc-cost-row" type="button" data-fc-edit="${esc(item.id)}" aria-label="${esc(item.name)} 수정">
    ${iconHTML(itemIcon(item),ownerStyle(item.owner).tone)}<span class="fc-row-name"><strong>${esc(item.name)}</strong><small>${esc(cycle(item))}${!isActiveInMonth(item,state.month) ? ' · 비활성' : ''}</small></span>
    <span class="fc-row-amount"><strong>${won(monthlyCost(item))}</strong>${item.frequency === 'yearly' ? `<small>연 ${won(item.amount)}</small>` : ''}</span><img class="fc-edit-glyph" src="assets/fixed-cost-icons/pencil.svg" width="15" height="15" alt=""></button>`;
}
function connectionLabel() { return state.error ? '연결 확인 필요' : !state.ready ? 'DB 연결 중…' : state.pending ? '저장 확인 중…' : state.fromCache ? '오프라인 · 저장된 화면' : '실시간 연결됨'; }
function monthOptions(year) {
  return `<div class="fc-month-year">${btn('이전 해',`data-fc-year="${year-1}" ${year <= 2000 ? 'disabled' : ''}`)}<strong aria-live="polite">${year}년</strong>${btn('다음 해',`data-fc-year="${year+1}" ${year >= 2199 ? 'disabled' : ''}`)}</div><div class="fc-choice-grid months">${Array.from({length:12},(_,i) => {const value = `${year}-${String(i+1).padStart(2,'0')}`;return btn(`${i+1}월`,`data-fc-month="${value}" aria-pressed="${state.month === value}"`);}).join('')}</div>${btn('이번 달',`data-fc-month="${localMonth()}"`)}`;
}
function monthPicker() {
  const [year,month] = state.month.split('-').map(Number);
  return `<details id="fc-month-picker" class="fc-month-picker"><summary aria-label="고정비 기준 월 선택"><span>기준 월</span><strong>${year}년 ${month}월</strong>${chromeIcon('calendar-check')}</summary><section class="fc-month-panel" aria-label="기준 월 선택">${monthOptions(year)}</section></details>`;
}
function recurringPicker(name,label,value,count) {
  const suffix = name === 'day' ? '일' : '월';
  return `<div class="fc-field"><span id="fc-${name}-label">${label}</span><input type="hidden" name="${name}" value="${value ?? ''}"><details class="fc-recurring-picker" data-fc-recurring="${name}"><summary aria-labelledby="fc-${name}-label fc-${name}-value"><span id="fc-${name}-value">${value ? `${value}${suffix}` : '아직 미정'}</span>${chromeIcon('calendar-check')}</summary><section class="fc-recurring-panel" aria-label="${label} 선택"><p class="fc-note">${name === 'day' ? '요일과 관계없이 반복되는 출금일이에요.' : '매년 결제할 월을 선택해주세요.'}</p><div class="fc-choice-grid ${name === 'day' ? 'days' : 'months'}">${Array.from({length:count},(_,i) => btn(`${i+1}${name === 'day' ? '' : suffix}`,`data-fc-recurring-value="${i+1}" aria-label="${i+1}${suffix}" aria-pressed="${value === i+1}"`)).join('')}</div>${btn('아직 미정','data-fc-recurring-value=""')}</section></details></div>`;
}
export function renderFixedCosts() {
  const root = document.getElementById('tab-fixed');
  if (!root || retired) return;
  const previousFocus = root.contains(document.activeElement) ? document.activeElement.getAttribute('data-fc-action') : null;
  root.innerHTML = `<div class="plan-page-head fc-page-heading"><div>${chromeIcon('calendar-check','rose')}<div><h1>고정비</h1><p>두 사람과 공동 생활에 정기적으로 나가는 돈을 함께 정리해요.</p></div></div><div class="fc-page-actions">${monthPicker()}${btn('+ 고정비 추가','data-fc-action="add"',true)}</div></div>
    <p class="fc-connection" role="status">${esc(connectionLabel())}${state.notice ? ` · ${esc(state.notice)}` : ''}</p>`;
  if (!state.catalog || !state.ready || state.error) {
    root.insertAdjacentHTML('beforeend',`<section class="fc-empty plan-card"><strong>${state.error ? esc(state.error) : '고정비 목록을 불러오고 있어요.'}</strong>${state.error ? btn('다시 연결','data-fc-action="retry"') : ''}</section>`); return;
  }
  const summary = fixedSummary(state.items,state.month);
  root.insertAdjacentHTML('beforeend',`<section class="plan-card fc-summary" aria-label="월 환산 고정비"><div class="fc-total">${chromeIcon('wallet2','cream')}<div><h2>월 환산 고정비</h2><strong>${won(summary.total)}</strong><p>${state.items.length ? '연간 결제는 12개월로 나누어 비교해요.' : '첫 고정비를 추가하면 합계를 보여드려요.'}</p></div></div><div class="fc-summary-shares"><div class="fc-share-bar ${summary.total ? '' : 'is-empty'}" aria-hidden="true">${summary.owners.map(owner => `<span class="${ownerStyle(owner.id).tone}" style="flex:${summary.total ? owner.total / summary.total : 1}"></span>`).join('')}</div><div class="fc-share-values">${summary.owners.map(owner => `<div><span>${owner.label}</span><strong>${won(owner.total)}</strong></div>`).join('')}</div></div></section>
    <div class="fc-section-head"><h2>누가 내고 있나요?</h2><span>월 환산 금액순 · 각 5개 미리보기</span></div>
    <div class="fc-owner-grid">${summary.owners.map(owner => `<section class="fc-owner-card plan-card" aria-label="${owner.label} 고정비"><header class="${ownerStyle(owner.id).tone}"><div>${chromeIcon(ownerStyle(owner.id).icon,ownerStyle(owner.id).tone)}<h3>${owner.label}<small>${owner.items.length}개 · 월 ${won(owner.total)}</small></h3></div>${btn('+ 추가',`data-fc-add-owner="${owner.id}"`)}</header><div class="fc-preview-list">${sortCosts(owner.items).slice(0,5).map(row).join('') || `<div class="fc-owner-empty">등록된 고정비가 없어요.<br>통신비·보험·구독부터 적어볼까요?</div>`}</div>${btn(`전체 ${state.items.filter(i => i.owner === owner.id).length}개 보기`, `data-fc-list="${owner.id}"`)}</section>`).join('')}</div>
    <section class="plan-card fc-upcoming"><div class="fc-section-head"><h2>${chromeIcon('calendar-check','cream')}${state.month === localMonth() ? '다가오는 출금' : '이달 출금 예정'}</h2><span>이달 일정 합계 ${won(summary.scheduled)}</span></div><div>${summary.active.map(item => ({ item,date:dueInMonth(item,state.month) })).filter(x => x.date && (state.month !== localMonth() || x.date >= localDate())).sort((a,b) => a.date.localeCompare(b.date) || b.item.amount - a.item.amount).slice(0,4).map(({ item,date }) => `<button type="button" class="fc-due-row" data-fc-edit="${esc(item.id)}"><time>${date.slice(5).replace('-','/')}</time>${iconHTML(itemIcon(item),ownerStyle(item.owner).tone)}<span>${esc(item.name)}</span><small class="fc-owner-tag ${ownerStyle(item.owner).tone}">${ownerOf(item.owner).label}</small><strong>${won(item.amount)}</strong></button>`).join('') || '<p class="fc-no-due">표시할 출금 예정이 없어요.</p>'}</div>${summary.unknownDays ? `<p class="fc-note">출금일 미정 ${summary.unknownDays}개는 일정에서 제외돼요.</p>` : ''}</section>
    <p class="fc-note">고정비는 기록용이에요. 우리 자금의 월 저축액·집 대출 상환액에서 자동으로 차감하거나 가져오지 않아요.</p>`);
  if (previousFocus) root.querySelector(`[data-fc-action="${previousFocus}"]`)?.focus({ preventScroll:true });
}
async function load() {
  state.error = ''; renderFixedCosts();
  try {
    if (!state.catalog) {
      const response = await fetch('assets/fixed-cost-icons/catalog.json');
      if (!response.ok) throw Error('아이콘 목록을 불러오지 못했어요.');
      const catalog = await response.json();
      if (!catalog.icons?.length || !catalog.groups?.length) throw Error('아이콘 목록을 확인해주세요.');
      if (retired) return;
      state.catalog = catalog;
    }
    stop?.();
    stop = fixedCostsStore.subscribe(snapshot => {
      Object.assign(state,snapshot,{ ready:true,error:'' }); renderFixedCosts();
      if (dialog?.open && view === 'list') renderListRows();
      if (dialog?.open && view === 'edit') {
        const latest = state.items.find(item => item.id === editor.id);
        const changed = latest && editor.expected && JSON.stringify(costFields(latest)) !== JSON.stringify(editor.expected);
        const warning = dialog.querySelector('#fc-remote');
        if (warning) warning.hidden = !changed;
      }
    },error => { state.error = error.code === 'permission-denied' ? '고정비 조회 권한을 확인해주세요. 다시 로그인 후 시도할 수 있어요.' : error.message || '고정비 연결을 확인해주세요.'; renderFixedCosts(); });
  } catch (error) { if (!retired) { state.error = error.message; renderFixedCosts(); } }
}
function clearCalendars() { calendars.forEach(calendar => calendar?.destroy()); calendars = []; }
function openShell() {
  if (dialog.open) return;
  opener = document.activeElement; bodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden'; dialog.showModal();
}
function close() {
  if (busy) return;
  clearCalendars(); dialog.close(); dialog.innerHTML = ''; document.body.style.overflow = bodyOverflow;
  editor = null; view = ''; renderFixedCosts();
  if (opener?.isConnected) opener.focus({ preventScroll:true });
  else document.querySelector('#tab-fixed [data-fc-action="add"]')?.focus({ preventScroll:true });
}
function dirty() { return editor && JSON.stringify(editor.draft) !== JSON.stringify(editor.initial); }
function requestLeave(action) {
  if (busy) return;
  if (view === 'edit') readDraft();
  if (editor && dirty()) {
    discardAction = action;
    dialog.querySelector('#fc-discard')?.remove();
    dialog.insertAdjacentHTML('afterbegin',`<div id="fc-discard" class="fc-discard" role="alert"><strong>저장하지 않은 변경이 있어요.</strong><p>입력 내용을 버릴까요?</p>${btn('계속 수정','data-fc-action="keep"')}${btn('변경 버리기','data-fc-action="discard"')}</div>`);
    dialog.querySelector('[data-fc-action="keep"]').focus();
  } else action();
}
function shell(title,subtitle,body,footer,headerExtra = '',headerIcon = chromeIcon('wallet2','cream')) {
  clearCalendars();
  dialog.innerHTML = `<header class="fc-drawer-head"><div class="fc-drawer-heading">${headerIcon}<div><h2 id="fc-drawer-title">${title}</h2><p>${subtitle}</p></div></div>${btn('닫기','data-fc-action="close" aria-label="고정비 창 닫기"')}</header>${headerExtra}<div class="fc-drawer-body">${body}</div><footer class="fc-drawer-footer">${footer}</footer>`;
  openShell();
}
function showList(owner = list.owner,reset = false) {
  view = 'list'; editor = null;
  if (reset) list = { owner,query:'',sort:'amount',status:'active',scroll:0 };
  const person = ownerOf(list.owner);
  shell(`${person.label}의 고정비`,'', '<div id="fc-full-list"></div>',`${btn('닫기','data-fc-action="close"')}${btn('+ 고정비 추가',`data-fc-add-owner="${person.id}"`,true)}`,`<div class="fc-list-tools"><label class="fc-search"><span class="sr-only">항목 검색</span><input id="fc-list-search" type="search" placeholder="항목명·카테고리 검색" value="${esc(list.query)}"></label><select id="fc-list-sort" aria-label="고정비 정렬"><option value="amount" ${list.sort === 'amount' ? 'selected' : ''}>금액 높은순</option><option value="date" ${list.sort === 'date' ? 'selected' : ''}>다음 출금일순</option></select><div class="fc-list-status">${[['active','이번 달'],['all','전체 · 중지 포함']].map(([key,label]) => btn(label,`data-fc-status="${key}" aria-pressed="${list.status === key}"`)).join('')}</div><p id="fc-list-count" class="fc-note"></p></div>`);
  renderListRows(); dialog.querySelector('.fc-drawer-body').scrollTop = list.scroll;
  dialog.querySelector('#fc-list-search').focus({ preventScroll:true });
}
function renderListRows() {
  const all = state.items.filter(item => item.owner === list.owner), current = all.filter(item => isActiveInMonth(item,state.month));
  const eligible = list.status === 'all' ? all : current;
  const query = list.query.trim().toLocaleLowerCase();
  const shown = sortCosts(eligible.filter(item => `${item.name} ${categoryLabel(item)}`.toLocaleLowerCase().includes(query)),list.sort);
  dialog.querySelector('.fc-drawer-head p').textContent = `${all.length}개 보관 · 이번 달 월 환산 ${won(current.reduce((sum,item) => sum + monthlyCost(item),0))}`;
  dialog.querySelector('#fc-list-count').textContent = `${shown.length}개 표시 / ${all.length}개 전체 · 합계는 검색과 무관한 이번 달 전체 기준`;
  dialog.querySelector('#fc-full-list').innerHTML = shown.map(row).join('') || '<div class="fc-empty">조건에 맞는 항목이 없어요.</div>';
}
function beginEdit(id,owner) {
  if (!state.catalog || !state.ready || state.error) return;
  const current = id ? state.items.find(item => item.id === id) : null;
  if (id && !current) return;
  const back = view === 'list';
  if (back) list.scroll = dialog.querySelector('.fc-drawer-body').scrollTop;
  const fields = current ? costFields(current) : emptyCost(owner || 'sungwoo');
  editor = { id:id || crypto.randomUUID(),expected:current ? structuredClone(fields) : null,draft:structuredClone(fields),initial:structuredClone(fields),back,operation:null };
  showEditor();
}
function select(name,label,options,value) {
  return `<label class="fc-field"><span>${label}</span><select name="${name}">${options.map(([key,text]) => `<option value="${esc(key)}" ${String(value) === String(key) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
}
function showEditor() {
  view = 'edit'; const item = editor.draft, selected = resolveIcon(item,state.catalog);
  shell(editor.expected ? '고정비 수정' : '고정비 추가','매달 또는 매년 반복되는 비용을 기록해요.', `<form id="fc-edit-form"><fieldset><div id="fc-remote" class="fc-remote" hidden>다른 기기에서 변경된 내용이 있어요. ${btn('최신 내용 불러오기','data-fc-action="reload-item"')}</div>
    <label class="fc-field"><span>항목명</span><input name="name" maxlength="80" required placeholder="예: 통신비, 보험, 넷플릭스" value="${esc(item.name)}"></label>
    <div class="fc-form-grid">${select('owner','누가 내나요?',OWNERS.map(o => [o.id,o.label]),item.owner)}${select('category','카테고리',state.catalog.groups.map(g => [g.id,g.label]),item.category)}</div>
    <div class="fc-icon-field"><div id="fc-selected-icon">${iconHTML(selected.id,ownerStyle(item.owner).tone)}<span>${esc(selected.label)}<small>${item.iconId ? '직접 선택한 아이콘' : '카테고리 기본 아이콘'}</small></span></div>${btn('아이콘 선택 · 144개','data-fc-action="icons"')}</div>
    <p class="fc-note" id="fc-icon-suggestions"></p>
    <div class="fc-form-grid">${select('frequency','결제 주기',[['monthly','매월'],['yearly','매년']],item.frequency)}<label class="fc-field"><span>1회 결제 금액 (원)</span><input name="amount" inputmode="numeric" required placeholder="예: 55,000" value="${item.amount == null ? '' : item.amount.toLocaleString('ko-KR')}"></label></div>
    <div class="fc-schedule-fields"><div id="fc-month-field" ${item.frequency !== 'yearly' ? 'hidden' : ''}>${recurringPicker('month','결제 월',item.month,12)}</div>${recurringPicker('day','출금일',item.day,31)}</div>
    <p class="fc-note">해당 날짜가 없는 달은 말일로 표시해요. 출금일이 지나도 자동으로 납부 처리하지 않아요.</p><div class="fc-form-preview" id="fc-form-preview" aria-live="polite"></div>
    <details class="fc-more-fields" ${item.startDate || item.endDate || item.paymentMethod || item.memo || !item.active ? 'open' : ''}><summary>기간·결제수단·메모·상태</summary><div class="fc-date-fields"><div class="fc-field"><label for="fc-start-date">시작일 <small>선택</small></label><input type="date" name="startDate" id="fc-start-date" value="${esc(item.startDate)}"></div><div class="fc-field"><label for="fc-end-date">종료일 <small>선택</small></label><input type="date" name="endDate" id="fc-end-date" value="${esc(item.endDate)}"></div></div>
    <label class="fc-field"><span>결제수단 별칭 <small>선택</small></span><input name="paymentMethod" maxlength="60" placeholder="예: 생활비 카드 · 계좌번호는 입력하지 않아요" value="${esc(item.paymentMethod)}"></label><label class="fc-field"><span>메모 <small>선택</small></span><textarea name="memo" maxlength="1000" rows="3">${esc(item.memo)}</textarea></label>${select('active','이 항목 상태',[['true','사용 중'],['false','중지 · 기록 보관']],item.active)}<p class="fc-note">중지하면 합계·출금 일정에서 빠지고, 전체 목록에서 다시 사용할 수 있어요.</p></details>
    <p id="fc-form-error" class="fc-error" role="alert" tabindex="-1"></p></fieldset></form>`,`${btn(editor.back ? '목록으로' : '취소','data-fc-action="back"')}<button class="plan-button primary" type="submit" form="fc-edit-form">저장</button>`);
  calendars = ['fc-start-date','fc-end-date'].map(id => mountWeddingCalendar(dialog.querySelector(`#${id}`)));
  updateEditorPreview(); dialog.querySelector('[name="name"]').focus({ preventScroll:true });
}
function readDraft() {
  const form = dialog.querySelector('#fc-edit-form'); if (!form) return;
  const values = new FormData(form), old = JSON.stringify(editor.draft);
  for (const key of ['name','owner','category','frequency','startDate','endDate','paymentMethod','memo']) editor.draft[key] = String(values.get(key) || '');
  const amount = String(values.get('amount') || '').replaceAll(',','').trim();
  editor.draft.amount = /^\d+$/.test(amount) ? Number(amount) : null;
  editor.draft.day = !values.get('day') || values.get('day') === 'null' ? null : Number(values.get('day'));
  editor.draft.month = editor.draft.frequency === 'monthly' || !values.get('month') || values.get('month') === 'null' ? null : Number(values.get('month'));
  editor.draft.active = values.get('active') === 'true';
  if (old !== JSON.stringify(editor.draft)) editor.operation = null;
}
function updateEditorPreview() {
  const item = editor.draft, icon = resolveIcon(item,state.catalog);
  dialog.querySelector('#fc-selected-icon').innerHTML = `${iconHTML(icon.id,ownerStyle(item.owner).tone)}<span>${esc(icon.label)}<small>${item.iconId ? '직접 선택한 아이콘' : '카테고리 기본 아이콘'}</small></span>`;
  dialog.querySelector('#fc-month-field').hidden = item.frequency !== 'yearly';
  for (const name of ['day','month']) {
    dialog.querySelector(`#fc-${name}-value`).textContent = item[name] ? `${item[name]}${name === 'day' ? '일' : '월'}` : '아직 미정';
    dialog.querySelectorAll(`[data-fc-recurring="${name}"] [data-fc-recurring-value]`).forEach(button => button.setAttribute('aria-pressed',String(button.dataset.fcRecurringValue === String(item[name] ?? ''))));
  }
  dialog.querySelector('#fc-form-preview').innerHTML = `<span>월 환산 비용</span><strong>${item.amount == null ? '금액을 입력해주세요' : won(monthlyCost(item))}</strong>${item.frequency === 'yearly' && item.amount != null ? `<small>실제 결제 월에는 ${won(item.amount)}이 나가요.</small>` : ''}`;
  const matches = item.name.trim() ? searchIcons(state.catalog,item.name).slice(0,3) : [];
  dialog.querySelector('#fc-icon-suggestions').innerHTML = matches.length ? `이름에 어울리는 아이콘 ${matches.map(icon => btn(`${iconHTML(icon.id)}${esc(icon.label)}`,`data-fc-suggest="${icon.id}"`)).join('')}` : '직접 선택한 아이콘은 이름이나 카테고리를 바꿔도 유지돼요.';
}
function showPicker() {
  readDraft(); view = 'icons'; picker = { query:'',group:'all',mode:'recommended' };
  shell('아이콘 선택','고정비에 맞는 아이콘 144개를 준비했어요.', '<div id="fc-icon-grid" class="fc-icon-grid"></div>', `${btn('편집으로','data-fc-action="editor"')}${btn('카테고리 기본으로','data-fc-action="default-icon"')}`,`<div class="fc-picker-tools"><label class="fc-search"><span class="sr-only">아이콘 검색</span><input id="fc-icon-search" type="search" placeholder="보험, 넷플릭스, 헬스, 정수기…"></label><div class="fc-picker-modes">${[['recommended','자주 쓰는'],['all','전체 144'],['recent','최근 선택']].map(([key,label]) => btn(label,`data-fc-icon-mode="${key}" aria-pressed="${key === picker.mode}"`)).join('')}</div><label class="fc-category-select"><span>분류</span><select id="fc-icon-group"><option value="all">모든 카테고리</option>${state.catalog.groups.map(group => `<option value="${group.id}">${esc(group.label)}</option>`).join('')}</select></label><p id="fc-icon-count" class="fc-note" role="status"></p></div>`);
  renderIcons(); dialog.querySelector('#fc-icon-search').focus();
}
function renderIcons() {
  let icons = searchIcons(state.catalog,picker.query,picker.group);
  if (!picker.query && picker.group === 'all' && picker.mode !== 'all') {
    const ids = picker.mode === 'recent' ? recent : state.catalog.recommended;
    icons = ids.map(id => state.catalog.icons.find(icon => icon.id === id)).filter(Boolean);
  }
  dialog.querySelector('#fc-icon-count').textContent = `${icons.length}개 · 선택하면 편집 화면에 적용돼요`;
  dialog.querySelector('#fc-icon-grid').innerHTML = icons.map(icon => `<button type="button" data-fc-icon="${icon.id}" class="fc-icon-option" aria-label="${esc(icon.label)} 아이콘" aria-pressed="${itemIcon(editor.draft) === icon.id}">${iconHTML(icon.id)}<span>${esc(icon.label)}</span></button>`).join('') || '<p class="fc-empty">아이콘이 없어요. 다른 검색어나 전체 목록을 확인해주세요.</p>';
}
function chooseIcon(id) {
  if (id && !state.catalog.icons.some(icon => icon.id === id)) return;
  editor.draft.iconId = id; editor.operation = null;
  if (id) recent = [id,...recent.filter(value => value !== id)].slice(0,18);
  showEditor(); dialog.querySelector('[data-fc-action="icons"]').focus();
}
async function save(event) {
  event.preventDefault(); if (busy || retired) return;
  readDraft(); const error = dialog.querySelector('#fc-form-error');
  try {
    validateCost(editor.draft);
    const command = { id:editor.id,action:editor.expected ? 'update' : 'create',values:structuredClone(editor.draft),expected:editor.expected };
    editor.operation ||= `${Date.now()}_${crypto.randomUUID()}`;
    busy = true; dialog.querySelector('fieldset').disabled = true;
    dialog.querySelectorAll('.fc-drawer-footer button,.fc-drawer-head button').forEach(button => button.disabled = true);
    error.textContent = '저장 중…';
    await fixedCostsStore.save(command,editor.operation);
    if (retired) return;
    // Acknowledge the save without waiting for the listener. Never change savings.
    const index = state.items.findIndex(item => item.id === command.id);
    if (index < 0) state.items.push({ ...command.values,id:command.id });
    else if (editor.expected) {
      const changed = Object.fromEntries(Object.entries(command.values).filter(([key,value]) => value !== editor.expected[key]));
      state.items[index] = { ...state.items[index],...changed };
    }
    const back = editor.back, owner = editor.draft.owner;
    busy = false; editor = null; state.notice = '고정비를 저장했어요.'; renderFixedCosts();
    if (back) { list.owner = owner; showList(); } else close();
  } catch (failure) {
    if (retired) return;
    busy = false; dialog.querySelector('fieldset').disabled = false;
    dialog.querySelectorAll('.fc-drawer-footer button,.fc-drawer-head button').forEach(button => button.disabled = false);
    error.textContent = `${failure.message || '저장하지 못했어요.'} 입력 내용은 유지했어요.`; error.focus();
    if (failure.code === 'fixed/conflict') dialog.querySelector('#fc-remote').hidden = false;
  }
}
function back() { const returnToList = editor?.back; requestLeave(() => returnToList ? showList() : close()); }
export function registerFixedCostsHandlers() {
  dialog = document.createElement('dialog'); dialog.id = 'fc-drawer'; dialog.className = 'fc-drawer'; dialog.setAttribute('aria-labelledby','fc-drawer-title');
  document.querySelector('[data-private-root]').append(dialog);
  dialog.addEventListener('cancel',event => { event.preventDefault(); if (view === 'icons') showEditor(); else requestLeave(close); });
  document.addEventListener('click',event => {
    const monthPanel = document.getElementById('fc-month-picker');
    if (monthPanel?.open && !monthPanel.contains(event.target)) monthPanel.open = false;
    const target = event.target.closest('button'); if (!target || retired || busy) return;
    if (target.dataset.fcYear) {
      const year = Number(target.dataset.fcYear);
      if (year < 2000 || year > 2199) return;
      const direction = target.textContent;
      monthPanel.querySelector('section').innerHTML = monthOptions(year);
      const buttons = [...monthPanel.querySelectorAll('[data-fc-year]')];
      (buttons.find(button => button.textContent === direction && !button.disabled) || buttons.find(button => !button.disabled))?.focus();
    }
    if (target.dataset.fcMonth) {
      state.month = target.dataset.fcMonth; renderFixedCosts();
      document.querySelector('#fc-month-picker summary').focus({preventScroll:true});
    }
    if (target.dataset.fcRecurringValue !== undefined) {
      const picker = target.closest('[data-fc-recurring]'), name = picker.dataset.fcRecurring;
      dialog.querySelector(`[name="${name}"]`).value = target.dataset.fcRecurringValue;
      readDraft(); updateEditorPreview(); picker.open = false; picker.querySelector('summary').focus({preventScroll:true});
    }
    if (target.dataset.fcAddOwner !== undefined) beginEdit(null,target.dataset.fcAddOwner);
    if (target.dataset.fcEdit) beginEdit(target.dataset.fcEdit);
    if (target.dataset.fcList) showList(target.dataset.fcList,true);
    if (target.dataset.fcStatus) { list.status = target.dataset.fcStatus; dialog.querySelectorAll('[data-fc-status]').forEach(button => button.setAttribute('aria-pressed',String(button === target))); renderListRows(); }
    if (target.dataset.fcIconMode) { picker.mode = target.dataset.fcIconMode; picker.query = ''; picker.group = 'all'; dialog.querySelector('#fc-icon-search').value = ''; dialog.querySelector('#fc-icon-group').value = 'all'; dialog.querySelectorAll('[data-fc-icon-mode]').forEach(button => button.setAttribute('aria-pressed',String(button === target))); renderIcons(); }
    if (target.dataset.fcIcon) chooseIcon(target.dataset.fcIcon);
    if (target.dataset.fcSuggest) { readDraft(); chooseIcon(target.dataset.fcSuggest); }
    const action = target.dataset.fcAction;
    if (action === 'add') beginEdit();
    if (action === 'retry') load();
    if (action === 'close') requestLeave(close);
    if (action === 'back') back();
    if (action === 'keep') { dialog.querySelector('#fc-discard').remove(); dialog.querySelector('[name="name"],#fc-icon-search')?.focus(); }
    if (action === 'discard') { const next = discardAction; editor = null; next?.(); }
    if (action === 'icons') showPicker();
    if (action === 'editor') showEditor();
    if (action === 'default-icon') chooseIcon('');
    if (action === 'reload-item') { const id = editor.id; requestLeave(() => beginEdit(id)); }
  });
  document.addEventListener('input',event => {
    if (event.target.id === 'fc-list-search') { list.query = event.target.value; renderListRows(); }
    if (event.target.id === 'fc-icon-search') { picker.query = event.target.value; renderIcons(); }
    if (event.target.closest('#fc-edit-form')) { readDraft(); updateEditorPreview(); }
  });
  document.addEventListener('change',event => {
    if (event.target.id === 'fc-list-sort') { list.sort = event.target.value; renderListRows(); }
    if (event.target.id === 'fc-icon-group') { picker.group = event.target.value; renderIcons(); }
    if (event.target.closest('#fc-edit-form')) { readDraft(); updateEditorPreview(); }
  });
  dialog.addEventListener('submit',save);
  document.addEventListener('keydown',event => {
    const panel = event.target.closest('.fc-month-picker,.fc-recurring-picker');
    if (!panel?.open) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); panel.open = false; panel.querySelector('summary').focus(); return; }
    if (!event.target.closest('.fc-choice-grid') || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    const grid = event.target.closest('.fc-choice-grid'), buttons = [...grid.querySelectorAll('button')], index = buttons.indexOf(event.target), columns = grid.classList.contains('days') ? 7 : 3;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : index + ({ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[event.key]);
    event.preventDefault(); buttons[Math.max(0,Math.min(buttons.length-1,next))].focus();
  },true);
  dialog.addEventListener('keydown',event => {
    if (!event.target.matches('[data-fc-icon]') || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    const buttons = [...dialog.querySelectorAll('[data-fc-icon]')], index = buttons.indexOf(event.target);
    const columns = getComputedStyle(dialog.querySelector('#fc-icon-grid')).gridTemplateColumns.split(' ').length;
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + ({ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[event.key]);
    event.preventDefault();buttons[Math.max(0,Math.min(buttons.length - 1,target))]?.focus();
  });
  window.addEventListener('beforeunload',event => { if (editor && dirty()) { event.preventDefault(); event.returnValue = ''; } });
  registerPrivateCleanup(() => { retired = true; stop?.(); clearCalendars(); state.items = []; editor = null; recent = []; if (dialog.open) { dialog.close(); document.body.style.overflow = bodyOverflow; } dialog.remove(); document.getElementById('tab-fixed')?.replaceChildren(); });
  load();
}
