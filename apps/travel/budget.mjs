import { deriveBudgetDraft, calculateTravelBudget } from '../../shared/finance/travel-budget-core.mjs';
let saveTravelBudget = async () => { throw new Error('WeCost 연결을 확인해주세요.'); };
let saveTravelLedgerItem = saveTravelBudget;

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => structuredClone(value);
const won = value => value == null ? '미입력' : `${Math.round(value).toLocaleString('ko-KR')}원`;
const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${won(Math.abs(value))}`;
const amount = value => value.trim() === '' ? null : Number(value.replaceAll(',', ''));
const root = $('#budget-content');
let snapshot = { items: [], plan: null, fx: null, connection: 'loading', saving: false };
let draft = null, expected = null, initial = '', selectedId = '', dirty = false, paymentExpected = null, paymentBusy = false;
let busy = false;
const selectedItem = () => snapshot.items.find(item => item.id === selectedId);
const ready = () => snapshot.connection === 'live' && !snapshot.saving && !busy;

root.innerHTML = `
  <div class="budget-connection"><p id="budget-sync" role="status">WeCost 신혼여행 금액을 불러오는 중…</p><a href="../wecost/?tab=wedding" class="subtle-link">WeCost 장부 열기 ↗</a></div>
  <div id="budget-empty" class="budget-empty" hidden><h3>WeCost의 신혼여행 항목을 연결해요</h3><p>기존 항목을 그대로 사용해 예상 금액과 지급액을 함께 봅니다.</p><a href="../wecost/?tab=wedding" class="button secondary">WeCost에서 항목 확인 ↗</a></div>
  <div id="budget-main" hidden>
    <div class="budget-linked"><label for="budget-item">연결할 WeCost 항목</label><select id="budget-item"></select><span id="budget-item-help"></span></div>
    <p id="budget-message" class="budget-message" role="status" hidden></p>
    <div class="budget-hero"><div><p class="eyebrow" id="budget-total-label">여행 예상 총액</p><strong id="budget-total">—</strong><p id="budget-baseline"></p></div><div class="budget-hero-side"><span>앞으로 지출할 금액</span><strong id="budget-remaining">—</strong><small id="budget-ledger-total"></small></div></div>
    <div class="budget-payment"><div><span>이미 지급한 금액</span><strong id="budget-paid">—</strong></div><small id="budget-due-summary"></small><progress id="budget-progress" max="100" value="0" aria-label="여행비 지급 비율"></progress><span id="budget-progress-text"></span><button id="budget-payment-edit" class="small-button" type="button">지급액·기한 수정</button></div>
    <div id="budget-mismatch" class="budget-notice" hidden><strong>WeCost의 예상액이 세부 합계와 달라졌어요.</strong><p id="budget-mismatch-text"></p><button type="button" class="text-button" id="budget-reconcile">장부 변경액을 조정 항목으로 가져오기</button></div>
    <p id="budget-incomplete" class="budget-notice" hidden></p>
    <section class="budget-card"><div class="budget-card-heading"><div><p class="eyebrow">OUR COSTS</p><h3>무엇에 얼마를 쓸까?</h3></div><span class="tiny">두 사람 합계 · 빈 금액은 미확인</span></div>
      <p class="fine" id="budget-origin"></p>
      <form id="budget-form"><div id="budget-rows" class="budget-rows"></div><button type="button" id="budget-add-row" class="text-button">+ 비용 항목 추가</button>
      <div class="budget-input-grid"><label>계산에 쓸 USD 환율<input id="budget-fx" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="1달러당 원"><small id="budget-fx-source"></small></label><label>남은 여행용 준비금 (원)<input id="budget-cash" type="number" min="0" step="1" inputmode="numeric" placeholder="아직 정하지 않았다면 비워두기"><small>이미 낸 돈을 제외하고 여행에 쓸 수 있는 금액</small></label></div>
      <div class="budget-funding"><span>앞으로 지출 <strong id="funding-remaining">—</strong></span><span>− 남은 준비금 <strong id="funding-cash">미입력</strong></span><span class="budget-needed">추가로 준비할 돈 <strong id="budget-needed">준비금 입력 후 계산</strong></span></div>
      <label class="budget-memo">함께 볼 예산 메모<textarea id="budget-note" rows="2" maxlength="1500" placeholder="포함된 비용, 확인할 견적, 예비비 기준"></textarea></label>
      <div class="budget-save-row"><p id="budget-save-help" class="tiny"></p><button id="budget-reset" type="button" class="button secondary">수정 취소</button><button id="budget-save" type="submit" class="button primary">WeCost와 함께 저장</button></div>
      </form>
    </section>
    <section class="budget-card"><p class="eyebrow">REFERENCE PRICES</p><h3>후보 가격으로 비교해보기</h3><p class="fine">아래 금액은 견적 당시 후보예요. 적용할 세부 항목을 고르면 저장 전에 총액 변화를 볼 수 있어요.</p>
      <div class="budget-quotes"><article><span>항공 네 구간 · 2인</span><strong>3,355,600원</strong><small>2026.09.13 공유 캡처 · 구매 전</small><label>교체할 항목<select id="quote-flight-target"></select></label><button class="small-button" type="button" data-quote="flight">항공 후보 금액 적용</button></article><article><span>크루즈 2인·3박 + 권장 팁</span><strong>US$2,141</strong><small>요금 $2,045 + 팁 $96 · 2026.09.12 기준</small><label>교체할 항목<select id="quote-cruise-target"></select></label><button class="small-button" type="button" data-quote="cruise">크루즈 참고 금액 적용</button></article></div>
    </section>
    <details class="budget-card budget-checks"><summary>합계에 빠진 비용은 없을까?</summary><p>이미 리조트·크루즈 요금에 포함된 비용은 다시 더하지 않아요. 항목을 추가해 비교하고, 저장할 때 예상 금액도 입력해주세요.</p><div class="budget-cost-suggestions">${['리조트 왕복 수상비행기·세금','퇴실 후 이용·공항 휴식','공항 왕복·심야 귀가','여행자보험·eSIM·크루즈 인터넷','해외결제 수수료·예비비'].map(name=>`<button type="button" class="small-button" data-cost-name="${esc(name)}">+ ${esc(name)}</button>`).join('')}</div><a href="#readiness" class="text-button">출발 준비 함께 보기 →</a></details>
  </div>
  <section class="budget-card budget-history"><p class="eyebrow">HOW OUR BUDGET CHANGED</p><h3>금액이 어떻게 바뀌었을까?</h3><p id="budget-history-status" class="fine">금액 변경 기록을 불러오는 중…</p><ol id="budget-history-list"></ol></section>
  <dialog id="budget-payment-dialog" class="budget-dialog" aria-labelledby="budget-payment-title"><form id="budget-payment-form"><h3 id="budget-payment-title">WeCost 지급 기록 수정</h3><p class="fine">예약 여부와 실제로 낸 금액은 별개예요. 같은 신혼여행 항목에 저장됩니다.</p><label>이미 낸 계약금 (원)<input id="budget-deposit" type="number" min="0" step="1" required inputmode="numeric"></label><label>계약금 외 추가 지급액 (원)<input id="budget-actual" type="number" min="0" step="1" required inputmode="numeric"></label><label>잔금 납부 예정일<input id="budget-due" type="date"></label><p id="budget-payment-error" role="alert"></p><div class="budget-dialog-actions"><button type="button" id="budget-payment-cancel" class="button secondary">취소</button><button type="submit" id="budget-payment-save" class="button primary">지급 기록 저장</button></div></form></dialog>`;

function message(text = '', error = false) {
  $('#budget-message').textContent = text; $('#budget-message').hidden = !text;
  $('#budget-message').classList.toggle('error', error);
}
function updateActions() {
  const enabled = ready() && !!draft && !!selectedItem();
  let complete = false;
  try { complete = !!draft && !calculateTravelBudget(draft, selectedItem()).incomplete; } catch {}
  $('#budget-save').disabled = !enabled || !complete || (!dirty && !!snapshot.plan);
  $('#budget-reset').disabled = !dirty || busy;
  $('#budget-item').disabled = dirty || busy;
  $('#budget-payment-edit').disabled = !enabled || dirty;
  $('#budget-add-row').disabled = busy || snapshot.saving || !draft;
  root.querySelectorAll('[data-quote],[data-cost-name],#budget-reconcile').forEach(el=>{el.disabled=busy||snapshot.saving||!draft;});
  $('#budget-form').querySelectorAll('input,textarea,[data-remove-row],select').forEach(el => { el.disabled = busy || (el.hasAttribute('data-remove-row') && draft?.rows.length===1); });
  $('#budget-save').textContent = busy ? '함께 저장하는 중…' : snapshot.plan ? 'WeCost와 함께 저장' : '예산 상세 연결하기';
}
function refreshTotals() {
  if (!draft || !selectedItem()) return;
  let calc;
  try { calc = calculateTravelBudget(draft, selectedItem()); }
  catch (error) { message(error.message, true); $('#budget-save').disabled = true; return; }
  // The live ledger remains the headline when a separate WeCost edit has
  // changed its total; saved line items remain visible for reconciliation.
  const useLedger = !dirty && !!snapshot.plan && calc.mismatch;
  const shown = useLedger ? { ...calc, total:calc.registeredTotal, remaining:Math.max(calc.registeredTotal-calc.paid,0), delta:calc.registeredTotal-calc.baselineTotal } : calc;
  if (useLedger) shown.additionalNeeded=draft.availableCash==null?null:Math.max(shown.remaining-draft.availableCash,0);
  const partial = calc.incomplete && !useLedger ? '확인된 금액 ' : '';
  $('#budget-total').textContent = `${partial}${won(shown.total)}`;
  $('#budget-total-label').textContent = dirty ? '저장 전 예상 총액 미리보기' : useLedger ? 'WeCost 최신 예상 총액' : '여행 예상 총액';
  $('#budget-baseline').textContent = `처음 비교 기준 ${won(calc.baselineTotal)} · ${signed(shown.delta)}`;
  $('#budget-remaining').textContent = won(shown.remaining);
  $('#budget-ledger-total').textContent = `WeCost 장부 예상 ${won(calc.registeredTotal)}`;
  $('#budget-paid').textContent = won(calc.paid);
  $('#budget-due-summary').textContent = selectedItem().balanceDue ? `장부에 기록한 잔금 예정일 ${selectedItem().balanceDue.replaceAll('-','.')} ` : '잔금 날짜 미입력';
  const percent = shown.total > 0 ? Math.min(100, Math.round(calc.paid / shown.total * 100)) : 0;
  $('#budget-progress').value = percent; $('#budget-progress-text').textContent = `${percent}% 지급`;
  $('#budget-mismatch').hidden = dirty || !snapshot.plan || !calc.mismatch;
  $('#budget-mismatch-text').textContent = `장부 ${won(calc.registeredTotal)} / 세부 합계 ${won(calc.total)}. 차액을 확인한 뒤 다시 맞춰주세요.`;
  $('#budget-incomplete').hidden = !calc.incomplete;
  $('#budget-incomplete').textContent = `${calc.missingCount + calc.missingRateCount}개 항목의 금액 또는 USD 환율을 아직 확인하지 않았어요. 현재 합계는 확인된 금액만 포함하므로 더 늘어날 수 있어요.`;
  $('#funding-remaining').textContent = won(shown.remaining);
  $('#funding-cash').textContent = won(draft.availableCash);
  $('#budget-needed').textContent = calc.additionalNeeded == null ? '준비금 입력 후 계산' : won(shown.additionalNeeded);
  $('#budget-save-help').textContent = calc.incomplete ? '미확인 항목의 예상 금액·환율을 입력하면 저장할 수 있어요. 포함되거나 무료인 비용은 0원을 입력해주세요.' : dirty ? `저장하면 WeCost 예상액이 ${won(calc.registeredTotal)} → ${won(shown.total)}으로 바뀌어요. 지급액은 그대로예요.` : '같은 장부 항목을 연결하므로 결혼비용에 중복으로 더해지지 않아요.';
  const strip = $('#travel-budget-summary');
  strip.innerHTML = `<a href="#budget" class="budget-summary-title"><span>${dirty ? '여행비 미리보기' : '우리 여행비'}</span><small>${calc.incomplete ? '미확인 비용 있음' : 'WeCost 연결'} →</small></a>${[['예상 총액',`${calc.incomplete ? '현재 ' : ''}${won(shown.total)}`],['이미 지급',won(calc.paid)],['앞으로 지출',won(shown.remaining)],['처음 기준 대비',signed(shown.delta)]].map(([label,value])=>`<a href="#budget"><span>${label}</span><strong>${value}</strong></a>`).join('')}`;
  strip.hidden = false;
  updateActions();
}
function renderRows() {
  $('#budget-rows').innerHTML = draft.rows.map((row,index)=>`<div class="budget-cost-row" data-row="${index}"><label class="budget-row-name">항목<input name="name" value="${esc(row.name)}" maxlength="100" required aria-label="항목 ${index+1} 이름"></label><label>예상 금액<input name="amount" type="number" min="0" step="${row.currency==='USD'?'0.01':'1'}" value="${row.amount ?? ''}" placeholder="미확인" inputmode="decimal" aria-label="${esc(row.name)} 금액"></label><label>통화<select name="currency" aria-label="${esc(row.name)} 통화"><option value="KRW" ${row.currency==='KRW'?'selected':''}>원</option><option value="USD" ${row.currency==='USD'?'selected':''}>USD</option></select></label><button type="button" class="budget-remove" data-remove-row="${index}" aria-label="${esc(row.name)} 항목 삭제">×</button><label class="budget-row-note">포함 내역·메모<input name="note" value="${esc(row.note)}" maxlength="1000" placeholder="예: 세금·이동 포함 여부"></label></div>`).join('');
  updateQuoteTargets();
}
function updateQuoteTargets() {
  for (const [type,pattern] of [['flight',/항공|비행/],['cruise',/크루즈|디즈니/]]) {
    const el = $(`#quote-${type}-target`), previous = el.value;
    const chosen = draft.rows.find(row=>row.id===previous)?.id || draft.rows.find(row=>pattern.test(row.name))?.id || '';
    el.innerHTML = '<option value="">교체할 세부 항목 선택</option>'+draft.rows.map(row=>`<option value="${esc(row.id)}" ${row.id===chosen?'selected':''}>${esc(row.name)}</option>`).join('');
  }
}
function loadDraft(item) {
  if (!item) { selectedId='';draft=null;dirty=false;$('#travel-budget-summary').hidden=true;updateActions();return; }
  selectedId = item.id;
  draft = deriveBudgetDraft(item, snapshot.plan, snapshot.fx);
  expected = {item:clone(item),plan:clone(snapshot.plan)};
  initial = JSON.stringify(draft); dirty = false;
  renderRows();
  $('#budget-fx').value = draft.fxRate ?? ''; $('#budget-cash').value = draft.availableCash ?? ''; $('#budget-note').value = draft.note || '';
  const stamp = snapshot.fx?.fetchedAt;
  const date = stamp?.toDate?.() || (typeof stamp?.seconds==='number' ? new Date(stamp.seconds*1000) : typeof stamp === 'string' ? new Date(stamp) : null);
  $('#budget-fx-source').textContent = snapshot.fx?.rate ? `저장된 참고 환율 ${snapshot.fx.rate.toLocaleString()}원${date&&!Number.isNaN(date.getTime())?` · ${date.toLocaleDateString('ko-KR')}`:''}. 실제 결제 환율·수수료와 달라요.` : 'USD 항목이 있다면 참고 환율을 입력해주세요.';
  $('#budget-origin').textContent = snapshot.plan ? '저장한 세부 예산이에요. 예상액을 바꾸면 처음 비교 기준과 증감을 함께 기록해요.' : '기존 장부 메모에서 합계가 맞는 항목만 나눠 보여줘요. 원래 WeCost 메모는 보존됩니다.';
  refreshTotals();
}
function markDirty() { dirty = JSON.stringify(draft) !== initial; refreshTotals(); }
function addRow(name = '새 비용') {
  if(busy||snapshot.saving||!draft)return;
  if (draft.rows.length >= 40) return message('비용 항목은 40개까지 정리할 수 있어요.',true);
  draft.rows.push({id:crypto.randomUUID(),name,amount:null,currency:'KRW',note:''});
  renderRows(); markDirty(); $('#budget-rows .budget-cost-row:last-child input').focus();
}
function renderBudgetSnapshot(next) {
  snapshot = next;
  $('#budget-sync').textContent = next.saving ? 'WeCost와 함께 저장하는 중…' : ({live:'WeCost 신혼여행 금액과 연결됐어요',loading:'WeCost 신혼여행 금액을 불러오는 중…',offline:'오프라인 · 마지막으로 불러온 금액이에요',error:'금액을 불러오지 못했어요. 새로고침 후 확인해주세요.'}[next.connection]);
  if (next.error) message(next.error,true);
  const item = selectedItem() || next.items.find(i=>i.id===next.plan?.linkedItemId) || (next.items.length===1?next.items[0]:null);
  const selection = item?.id || '';
  $('#budget-item').innerHTML = '<option value="" disabled>여행 합계 항목 선택</option>'+next.items.map(i=>`<option value="${esc(i.id)}" ${i.id===selection?'selected':''}>${esc(i.name)} · ${won(i.planned)}</option>`).join('');
  $('#budget-item-help').textContent = next.items.length > 1 ? '선택한 항목만 연결해요. 전체 여행 합계 항목을 선택해주세요.' : '기존 신혼여행 항목을 그대로 사용해요.';
  $('#budget-empty').hidden = next.connection==='loading' || next.items.length>0;
  $('#budget-main').hidden = !next.items.length;
  if (!dirty && !busy && item) loadDraft(item);
  if (!item) { selectedId='';draft=null;$('#travel-budget-summary').hidden=true; }
  $('#budget-form').hidden = !draft;
  if (draft) refreshTotals();
  updateActions();
}
$('#budget-item').addEventListener('change',event=>{loadDraft(snapshot.items.find(i=>i.id===event.target.value));$('#budget-form').hidden=!draft;});
$('#budget-rows').addEventListener('input',event=>{
  const el=event.target,row=draft.rows[Number(el.closest('[data-row]')?.dataset.row)]; if(!row)return;
  row[el.name]=el.name==='amount'?amount(el.value):el.value;if(el.name==='name')updateQuoteTargets();markDirty();
});
$('#budget-rows').addEventListener('change',event=>{if(event.target.name==='currency'){renderRows();markDirty();}});
$('#budget-rows').addEventListener('click',event=>{const button=event.target.closest('[data-remove-row]');if(!button||busy||draft.rows.length===1)return;draft.rows.splice(Number(button.dataset.removeRow),1);renderRows();markDirty();});
for(const [selector,key] of [['#budget-fx','fxRate'],['#budget-cash','availableCash'],['#budget-note','note']])$(selector).addEventListener('input',event=>{draft[key]=key==='note'?event.target.value:amount(event.target.value);markDirty();});
$('#budget-add-row').addEventListener('click',()=>addRow());
root.addEventListener('click',event=>{
  if(busy||snapshot.saving)return;
  const suggestion=event.target.closest('[data-cost-name]');if(suggestion&&draft)addRow(suggestion.dataset.costName);
  const quote=event.target.closest('[data-quote]');if(!quote||!draft)return;
  const type=quote.dataset.quote,id=$(`#quote-${type}-target`).value,row=draft.rows.find(r=>r.id===id);
  if(!row)return message('교체할 세부 항목을 먼저 선택해주세요. 합계 항목 전체를 항공료로 바꾸지 않도록 확인해요.',true);
  row.amount=type==='flight'?3355600:2141;row.currency=type==='flight'?'KRW':'USD';
  row.note=type==='flight'?'2인·네 구간, 2026.09.13 공유 캡처 기준 · 구매 전 후보':'2인·3박 요금 US$2,045 + 권장 팁 US$96 · 2026.09.12 참고액';
  renderRows();markDirty();message('후보 금액으로 미리 보고 있어요. 확인 후 저장하면 WeCost에도 반영돼요.');
});
$('#budget-reset').addEventListener('click',()=>{loadDraft(selectedItem());message();});
$('#budget-reconcile').addEventListener('click',()=>{
  if(busy||snapshot.saving||!draft)return;
  const diff=Number(selectedItem().planned||0)-calculateTravelBudget(draft,selectedItem()).total;
  if(diff<0)return message('WeCost에서 예상액이 줄었어요. 해당 세부 항목 금액을 직접 줄여 장부 합계와 맞춰주세요.');
  if(diff>0){draft.rows.push({id:crypto.randomUUID(),name:'WeCost 예산 변경분',amount:diff,currency:'KRW',note:'어떤 비용인지 확인 후 이름을 바꿔주세요.'});renderRows();markDirty();}
});
$('#budget-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!ready()||!draft)return;
  busy=true;updateActions();message();
  try{await saveTravelBudget(clone(draft),clone(expected));dirty=false;initial=JSON.stringify(draft);if(snapshot.plan && JSON.stringify(snapshot.plan.rows)===JSON.stringify(draft.rows))loadDraft(selectedItem());message('예상액을 WeCost와 함께 저장했어요. 변경 기록도 남겼습니다.');}
  catch(error){message(error.message||'저장하지 못했어요. 입력한 내용은 그대로예요.',true);}
  finally{busy=false;updateActions();}
});
$('#budget-payment-edit').addEventListener('click',()=>{
  paymentExpected=clone(selectedItem());$('#budget-deposit').value=paymentExpected.deposit||0;$('#budget-actual').value=paymentExpected.actual||0;$('#budget-due').value=paymentExpected.balanceDue||'';$('#budget-payment-error').textContent='';$('#budget-payment-dialog').showModal();
});
$('#budget-payment-cancel').addEventListener('click',()=>{if(!paymentBusy)$('#budget-payment-dialog').close();});
$('#budget-payment-dialog').addEventListener('cancel',event=>{if(paymentBusy)event.preventDefault();});
$('#budget-payment-form').addEventListener('submit',async event=>{
  event.preventDefault();if(paymentBusy)return;paymentBusy=true;$('#budget-payment-save').disabled=true;$('#budget-payment-cancel').disabled=true;
  try{await saveTravelLedgerItem(paymentExpected.id,{deposit:amount($('#budget-deposit').value),actual:amount($('#budget-actual').value),balanceDue:$('#budget-due').value||null},paymentExpected);$('#budget-payment-dialog').close();message('WeCost 지급 기록을 저장했어요.');}
  catch(error){$('#budget-payment-error').textContent=error.message||'저장하지 못했어요. 입력한 내용은 그대로예요.';}
  finally{paymentBusy=false;$('#budget-payment-save').disabled=false;$('#budget-payment-cancel').disabled=false;}
});
function renderBudgetHistory(next) {
  $('#budget-history-status').textContent=next.connection==='live'?(next.entries.length?'여행과 WeCost에서 저장한 최근 금액 변경이에요.':'연동 후 저장하는 변경부터 기록해요. 이전 변경은 추정하지 않아요.'):next.connection==='loading'?'금액 변경 기록을 불러오는 중…':'변경 기록을 불러오지 못했어요. 연결 후 다시 확인해주세요.';
  $('#budget-history-list').innerHTML=next.entries.map(entry=>{
    const date=new Date(entry.changedAt),time=Number.isNaN(date.getTime())?'시각 확인 중':date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
    const before=entry.before||{},after=entry.after||{};
    const rows = after.plan?.rows || [];
    const previousRows = new Map((before.plan?.rows || []).map(row=>[row.id,row]));
    const changes = rows.filter(row=>JSON.stringify(row)!==JSON.stringify(previousRows.get(row.id)));
    const rowAmount=row=>row.amount==null?'미확인':row.currency==='USD'?`US$${row.amount.toLocaleString('ko-KR')}`:won(row.amount);
    const deleted=(before.plan?.rows||[]).filter(row=>!rows.some(afterRow=>afterRow.id===row.id));
    return `<li><div><strong>${entry.source==='wecost'?'WeCost':'여행'} · ${esc(entry.actor||'미지정')}</strong><time>${esc(time)} · 한국 시간</time></div><p>예상 ${won(before.planned)} → <strong>${won(after.planned)}</strong> <span>(${signed((after.planned||0)-(before.planned||0))})</span><br>지급 ${won(before.paid)} → ${won(after.paid)} · 앞으로 ${won(after.remaining)}</p><details><summary>어떤 항목이 바뀌었는지 보기</summary>${changes.map(row=>`<div class="budget-history-row"><span>${esc(row.name)}</span><span>${previousRows.has(row.id)?esc(rowAmount(previousRows.get(row.id))):'새 항목'} → ${esc(rowAmount(row))}</span></div>`).join('')}${deleted.map(row=>`<div class="budget-history-row"><span>${esc(row.name)}</span><span>항목 삭제</span></div>`).join('')}<p>남은 준비금 ${won(before.plan?.availableCash)} → ${won(after.plan?.availableCash)}</p><p>${esc(after.item?.memo||after.plan?.note||'')}</p></details></li>`;
  }).join('');
}
import('../../shared/finance/travel-budget-store.mjs').then(store=>{
  saveTravelBudget=store.saveTravelBudget;saveTravelLedgerItem=store.saveTravelLedgerItem;
  const stopBudget=store.subscribeTravelBudget(renderBudgetSnapshot);
  const stopHistory=store.subscribeBudgetHistory(renderBudgetHistory);
  window.addEventListener('pagehide',event=>{if(!event.persisted){stopBudget();stopHistory();}},{once:true});
}).catch(()=>{
  renderBudgetSnapshot({...snapshot,connection:'error',error:'WeCost에 연결하지 못했어요. 연결 후 새로고침해주세요.'});
  renderBudgetHistory({entries:[],connection:'error'});
});
