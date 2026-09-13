import { requireMember, getMember, syncAppAuth, registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { FIREBASE_CONFIG } from '../../../shared/firebase/config.mjs';
import { koreanToday, isDateOnly, dayLabel, featuredEvents } from '../../../shared/home/home-core.mjs';

const member = await requireMember();
const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
const { getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
const app = getApps().find(item => item.name === '[DEFAULT]') || initializeApp(FIREBASE_CONFIG);
await syncAppAuth(app);
let closed = false, allEvents = [], selectedDate = null, selectedEmoji = '📅', pendingDelete = null, deleteReturn = null, deleting = false;
const current = () => !closed && getMember()?.uid === member.uid;
if (!current()) throw new Error('로그인 상태가 바뀌었어요.');
const db = getFirestore(app), eventsCol = collection(db, 'events');
const $ = id => document.getElementById(id);
const root = document.querySelector('[data-private-root]');
const monthNow = koreanToday().slice(0, 7).split('-').map(Number);
let calYear = monthNow[0], calMonth = monthNow[1] - 1;
const picker = globalThis.flatpickr?.('#formDate', { locale: 'ko', dateFormat: 'Y-m-d', minDate: koreanToday(), disableMobile: true });
if (!picker) { $('formDate').type = 'date'; $('formDate').min = koreanToday(); }
function el(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
function formatDate(date) { return isDateOnly(date) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${date}T00:00:00+09:00`)) : '날짜를 확인해 주세요'; }
async function write(action, control) {
  if (!current()) return;
  control.disabled = true; $('dateStatus').textContent = '';
  try { await action(); return true; } catch { if (current()) $('dateStatus').textContent = '일정을 저장하지 못했어요. 기존 일정과 입력 내용은 유지했으니 연결 상태를 확인해 주세요.'; return false; }
  finally { if (current()) control.disabled = false; }
}
function renderDdays() {
  const row = $('ddayRow'); row.replaceChildren();
  for (const event of featuredEvents(allEvents)) {
    const card = el('div', 'dday-card');
    card.append(el('div', 'dday-label', `${event.emoji || '📅'} ${event.title}`), el('div', 'dday-number', dayLabel(event.date)), el('div', 'dday-date', formatDate(event.date))); row.append(card);
  }
  if (!row.children.length) row.append(el('p', 'dates-empty', '기억하고 싶은 일정을 고정하면 D-day를 볼 수 있어요.'));
}
function renderList() {
  const list = $('eventList'); list.replaceChildren(); const today = koreanToday();
  const next = allEvents.find(event => event.date >= today);
  for (const event of allEvents) {
    const pinned = event.pinned === true, past = event.date < today;
    const row = el('div', `event-row${past ? ' past' : ''}${event.id === next?.id ? ' next' : ''}${pinned ? ' pinned' : ''}`);
    row.tabIndex = 0; row.setAttribute('role', 'group'); row.setAttribute('aria-label', `${event.title} · ${pinned ? '고정됨' : '고정 안 됨'}`);
    const icon = el('div', 'ev-emoji', event.emoji || '📅'), body = el('div', 'ev-info');
    body.append(el('div', 'ev-title', event.title), el('div', 'ev-date', formatDate(event.date)));
    const pin = el('button', `ev-pin${pinned ? ' pinned' : ''}`, '📌'); pin.type = 'button'; pin.setAttribute('aria-label', `${event.title} ${pinned ? '고정 해제' : '고정'}`); pin.setAttribute('aria-pressed', String(pinned));
    const toggle = () => { if (!pin.disabled) return write(() => updateDoc(doc(db, 'events', event.id), { pinned: !pinned }), pin); };
    pin.addEventListener('click', toggle);
    const remove = el('button', 'ev-delete', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `${event.title} 삭제`);
    remove.addEventListener('click', () => { pendingDelete = event; deleteReturn = remove; $('deleteDateStatus').textContent = ''; $('deleteDateDialog').showModal(); $('cancelDeleteDate').focus(); });
    row.addEventListener('click', event => { if (!event.target.closest('button')) toggle(); });
    row.addEventListener('keydown', event => { if (event.target === row && ['Enter', ' '].includes(event.key)) { event.preventDefault(); toggle(); } });
    row.append(icon, body, el('span', 'ev-dday', past ? '완료 ✓' : dayLabel(event.date)), pin, remove); list.append(row);
  }
  if (!allEvents.length) list.append(el('p', 'dates-empty', '아직 일정이 없어요. 다음 약속을 직접 추가해 주세요.'));
}
function showPopup() {
  const popup = $('calPopup'); popup.replaceChildren();
  const events = allEvents.filter(event => event.date === selectedDate); popup.classList.toggle('show', Boolean(events.length));
  if (!events.length) return;
  popup.append(el('div', 'cal-popup-title', formatDate(selectedDate)));
  for (const event of events) { const item = el('div', 'cal-popup-item'); item.append(el('span', '', event.emoji || '📅'), el('span', '', event.title)); popup.append(item); }
}
function renderCalendar() {
  $('calMonthLabel').textContent = `${calYear}년 ${calMonth + 1}월`;
  const grid = $('calGrid'); grid.replaceChildren();
  for (const name of ['일', '월', '화', '수', '목', '금', '토']) grid.append(el('div', 'cal-day-name', name));
  const first = new Date(Date.UTC(calYear, calMonth, 1)).getUTCDay(), total = new Date(Date.UTC(calYear, calMonth + 1, 0)).getUTCDate();
  for (let i = 0; i < first; i++) grid.append(el('div', 'cal-cell other-month'));
  for (let day = 1; day <= total; day++) {
    const date = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const events = allEvents.filter(event => event.date === date);
    const cell = el('button', `cal-cell${date === koreanToday() ? ' today' : ''}${events.length ? ' has-event' : ''}${date === selectedDate ? ' selected' : ''}`);
    cell.type = 'button'; cell.dataset.date = date; cell.disabled = !events.length;
    cell.setAttribute('aria-label', `${formatDate(date)}, 일정 ${events.length}개`); if (date === koreanToday()) cell.setAttribute('aria-current', 'date');
    cell.append(el('div', 'cal-date', String(day)));
    const dots = el('div', 'cal-dots'); dots.setAttribute('aria-hidden', 'true'); for (const _ of events.slice(0, 3)) dots.append(el('div', 'cal-dot')); cell.append(dots);
    cell.addEventListener('click', () => { selectedDate = date; renderCalendar(); grid.querySelector(`[data-date="${date}"]`)?.focus(); }); grid.append(cell);
  }
  showPopup();
}
const unsubscribe = onSnapshot(query(eventsCol, orderBy('date')), snapshot => {
  if (!current()) return;
  allEvents = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })); renderDdays(); renderList(); renderCalendar();
}, () => { if (current()) $('dateStatus').textContent = '일정을 불러오지 못했어요. 연결과 로그인 상태를 확인해 주세요.'; });
registerPrivateCleanup(() => { closed = true; unsubscribe(); allEvents = []; selectedDate = null; pendingDelete = null; deleteReturn = null; picker?.destroy(); root.hidden = true; root.replaceChildren(); });
root.hidden = false;
function closeDeleteDate() { if (deleting) return; $('deleteDateDialog').close(); pendingDelete = null; (deleteReturn?.isConnected ? deleteReturn : $('addBtn')).focus(); deleteReturn = null; }
$('cancelDeleteDate').addEventListener('click', closeDeleteDate);
$('deleteDateDialog').addEventListener('cancel', event => { event.preventDefault(); closeDeleteDate(); });
$('deleteDateForm').addEventListener('submit', async event => {
  event.preventDefault(); if (!current() || deleting || !pendingDelete) return; deleting = true; $('confirmDeleteDate').disabled = true; $('cancelDeleteDate').disabled = true;
  try { await deleteDoc(doc(db, 'events', pendingDelete.id)); if (current()) { deleting = false; closeDeleteDate(); } }
  catch { if (current()) $('deleteDateStatus').textContent = '삭제하지 못했어요. 기존 일정은 그대로 유지했으니 다시 시도해 주세요.'; }
  finally { deleting = false; if (current()) { $('confirmDeleteDate').disabled = false; $('cancelDeleteDate').disabled = false; } }
});
function setTab(calendar) {
  $('tabList').classList.toggle('active', !calendar); $('tabCal').classList.toggle('active', calendar);
  $('tabList').setAttribute('aria-selected', String(!calendar)); $('tabCal').setAttribute('aria-selected', String(calendar));
  $('listView').hidden = calendar; $('calView').hidden = !calendar; $('calView').classList.toggle('show', calendar);
}
$('tabList').addEventListener('click', () => setTab(false)); $('tabCal').addEventListener('click', () => setTab(true));
for (const id of ['tabList', 'tabCal']) $(id).addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); const calendar = event.key === 'End' || (!['Home'].includes(event.key) && id === 'tabList'); setTab(calendar); $(calendar ? 'tabCal' : 'tabList').focus();
});
for (const [id, direction] of [['calPrev', -1], ['calNext', 1]]) $(id).addEventListener('click', () => { const date = new Date(Date.UTC(calYear, calMonth + direction, 1)); calYear = date.getUTCFullYear(); calMonth = date.getUTCMonth(); selectedDate = null; renderCalendar(); });
for (const emoji of ['📸', '💍', '✉️', '📬', '👗', '🏠', '🛍️', '💒', '✈️', '📅', '🎉', '💕']) {
  const button = el('button', `emoji-pick-btn${emoji === selectedEmoji ? ' selected' : ''}`, emoji); button.type = 'button'; button.setAttribute('aria-label', `${emoji} 이모지`); button.setAttribute('aria-pressed', String(emoji === selectedEmoji));
  button.addEventListener('click', () => { selectedEmoji = emoji; for (const option of $('emojiPicker').children) { option.classList.toggle('selected', option === button); option.setAttribute('aria-pressed', String(option === button)); } }); $('emojiPicker').append(button);
}
$('addBtn').addEventListener('click', () => { const open = $('addForm').classList.toggle('show'); $('addBtn').setAttribute('aria-expanded', String(open)); if (open) $('formTitle').focus(); });
$('cancelDate').addEventListener('click', () => { $('addForm').classList.remove('show'); $('addBtn').setAttribute('aria-expanded', 'false'); });
$('addForm').addEventListener('submit', async event => {
  event.preventDefault(); const title = $('formTitle').value.trim(), date = $('formDate').value;
  if (!title || title.length > 120 || !isDateOnly(date)) { $('dateStatus').textContent = '제목과 날짜를 확인해 주세요.'; return; }
  const success = await write(() => addDoc(eventsCol, { title, date, emoji: selectedEmoji, createdAt: serverTimestamp() }), $('formSubmit'));
  if (success && current()) { $('formTitle').value = ''; picker?.clear(); $('formDate').value = ''; $('cancelDate').click(); }
});
