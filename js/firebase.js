import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, updateDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp({
  apiKey:            "AIzaSyBz-P5ycMAjYZBV7hkcZDrmq28EAw7Hsp8",
  authDomain:        "sungso-358cb.firebaseapp.com",
  projectId:         "sungso-358cb",
  storageBucket:     "sungso-358cb.firebasestorage.app",
  messagingSenderId: "143797950443",
  appId:             "1:143797950443:web:95b0f616246d84aae3bae"
});
const db = getFirestore(app);
const eventsCol = collection(db, 'events');

// ── State ──
let allEvents     = [];
let activeTab     = 'list';
let calDate       = new Date();
let selectedDate  = null;
let selectedEmoji = '📅';

// Today string (local time, YYYY-MM-DD)
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
const TODAY = todayStr();

// ── D-day helpers ──
function calcDiff(dateStr) {
  return Math.round((new Date(dateStr + 'T00:00:00') - new Date(TODAY + 'T00:00:00')) / 86400000);
}
function diffToLabel(diff) {
  return diff > 0 ? 'D-' + diff : diff === 0 ? 'D-Day! 🎉' : 'D+' + Math.abs(diff);
}

// ── D-day card row ──
// 핀된 이벤트가 없으면 결혼식 카드를 기본 표시.
// 핀된 이벤트가 있으면 날짜 적게 남은 순 정렬 후 표시 (중복 방지).
function renderDdayCards() {
  const row = document.getElementById('ddayRow');
  row.innerHTML = '';

  const pinned = allEvents.filter(ev => ev.pinned === true);

  if (pinned.length === 0) {
    const diff = calcDiff('2027-03-06');
    const label = diff > 0 ? 'D-' + diff : diff === 0 ? 'D-Day 💒' : 'D+' + Math.abs(diff);
    const card = document.createElement('div');
    card.className = 'dday-card';
    card.innerHTML =
      '<div class="dday-label">결혼식까지</div>' +
      '<div class="dday-number">' + label + '</div>' +
      '<div class="dday-date">2027년 3월 6일 토요일</div>';
    row.appendChild(card);
    return;
  }

  // 미래 이벤트 → 날짜 적게 남은 순, 과거 이벤트 → 뒤에 최근순
  const sorted = [...pinned].sort((a, b) => {
    const dA = calcDiff(a.date), dB = calcDiff(b.date);
    const futureA = dA >= 0, futureB = dB >= 0;
    if (futureA !== futureB) return futureA ? -1 : 1;
    return dA - dB;
  });

  sorted.forEach(ev => {
    const diff    = calcDiff(ev.date);
    const dateStr = new Date(ev.date + 'T00:00:00').toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' });
    const card = document.createElement('div');
    card.className = 'dday-card';
    card.innerHTML =
      '<div class="dday-label">' + ev.emoji + ' ' + ev.title + '까지</div>' +
      '<div class="dday-number">' + diffToLabel(diff) + '</div>' +
      '<div class="dday-date">' + dateStr + '</div>';
    row.appendChild(card);
  });
}

// ── Seed initial data if collection is empty ──
const SEED = [
  { date: '2026-09-13', title: '웨딩 촬영',       emoji: '📸' },
  { date: '2026-10-01', title: '청첩장 제작',      emoji: '✉️' },
  { date: '2026-11-01', title: '청첩장 발송',      emoji: '📬' },
  { date: '2026-12-15', title: '드레스 최종 피팅', emoji: '👗' },
  { date: '2027-01-20', title: '신혼집 계약',      emoji: '🏠' },
  { date: '2027-02-15', title: '혼수 준비 완료',   emoji: '🛍️' },
  { date: '2027-03-06', title: '결혼식',           emoji: '💒' },
  { date: '2027-03-10', title: '신혼여행 출발',    emoji: '✈️' },
];
(async () => {
  const snap = await getDocs(eventsCol);
  if (snap.empty) {
    for (const ev of SEED) {
      await addDoc(eventsCol, { ...ev, createdAt: serverTimestamp() });
    }
  }
})();

// ── Real-time subscription ──
onSnapshot(query(eventsCol, orderBy('date')), snap => {
  allEvents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderDdayCards();
  if (activeTab === 'list') renderList();
  else renderCalendar();
});

// ── List rendering ──
function renderList() {
  const listEl = document.getElementById('eventList');
  if (!listEl) return;

  if (allEvents.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:28px;color:#ddd;font-size:13px;">아직 일정이 없어요</div>';
    return;
  }

  const nextIdx = allEvents.findIndex(e => e.date >= TODAY);
  listEl.innerHTML = '';

  allEvents.forEach((ev, i) => {
    const isPast   = ev.date < TODAY;
    const isNext   = i === nextIdx;
    const diff     = calcDiff(ev.date);
    const ddayStr  = isPast ? '완료 ✓' : diff === 0 ? 'D-Day! 🎉' : 'D-' + diff;
    const dateStr  = new Date(ev.date + 'T00:00:00').toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' });
    const isPinned = ev.pinned === true;

    const row = document.createElement('div');
    row.className = 'event-row' +
      (isPast   ? ' past'   : '') +
      (isNext   ? ' next'   : '') +
      (isPinned ? ' pinned' : '');
    row.innerHTML =
      '<div class="ev-emoji">' + ev.emoji + '</div>' +
      '<div class="ev-info">' +
        '<div class="ev-title">' + ev.title + '</div>' +
        '<div class="ev-date">'  + dateStr  + '</div>' +
      '</div>' +
      '<div class="ev-dday">' + ddayStr + '</div>' +
      '<button class="ev-pin' + (isPinned ? ' pinned' : '') + '" title="' + (isPinned ? '고정 해제' : 'D-day에 고정') + '">📌</button>' +
      '<button class="ev-delete" title="삭제">🗑️</button>';

    row.querySelector('.ev-pin').addEventListener('click', (e) => {
      e.stopPropagation();
      updateDoc(doc(db, 'events', ev.id), { pinned: !isPinned });
    });
    row.querySelector('.ev-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDoc(doc(db, 'events', ev.id));
    });
    row.addEventListener('click', (e) => {
      if (e.target.closest('.ev-delete') || e.target.closest('.ev-pin')) return;
      updateDoc(doc(db, 'events', ev.id), { pinned: !isPinned });
    });
    listEl.appendChild(row);
  });
}

// ── Calendar rendering ──
const DAY_NAMES = ['일','월','화','수','목','금','토'];

function renderCalendar() {
  const gridEl = document.getElementById('calGrid');
  if (!gridEl) return;

  const y = calDate.getFullYear();
  const m = calDate.getMonth();
  document.getElementById('calMonthLabel').textContent = y + '년 ' + (m + 1) + '월';

  const evMap = {};
  allEvents.forEach(ev => {
    (evMap[ev.date] = evMap[ev.date] || []).push(ev);
  });

  const firstDay    = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let html = DAY_NAMES.map(n => `<div class="cal-day-name">${n}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell other-month"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const ds  = y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const evs = evMap[ds] || [];
    const isToday    = ds === TODAY;
    const isSelected = ds === selectedDate;
    const hasEvent   = evs.length > 0;

    let cls = 'cal-cell';
    if (isToday)    cls += ' today';
    if (hasEvent)   cls += ' has-event';
    if (isSelected) cls += ' selected';

    const dots = evs.slice(0, 3).map(() => '<div class="cal-dot"></div>').join('');

    html += `<div class="${cls}" data-date="${ds}">
      <div class="cal-date">${d}</div>
      ${dots ? '<div class="cal-dots">' + dots + '</div>' : ''}
    </div>`;
  }

  gridEl.innerHTML = html;

  gridEl.querySelectorAll('.cal-cell.has-event').forEach(cell => {
    cell.addEventListener('click', () => {
      selectedDate = cell.dataset.date;
      renderCalendar();
      showCalPopup(evMap[selectedDate] || []);
    });
  });

  if (selectedDate && evMap[selectedDate]) showCalPopup(evMap[selectedDate]);
  else if (selectedDate && !evMap[selectedDate]) document.getElementById('calPopup').classList.remove('show');
}

function showCalPopup(events) {
  const popup = document.getElementById('calPopup');
  if (!popup) return;
  const dateStr = new Date(selectedDate + 'T00:00:00').toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' });
  popup.innerHTML =
    '<div class="cal-popup-title">' + dateStr + '</div>' +
    events.map(ev =>
      '<div class="cal-popup-item"><span>' + ev.emoji + '</span><span>' + ev.title + '</span></div>'
    ).join('');
  popup.classList.add('show');
}

// ── Tab switching ──
document.getElementById('tabList').addEventListener('click', () => {
  activeTab = 'list';
  document.getElementById('tabList').classList.add('active');
  document.getElementById('tabCal').classList.remove('active');
  document.getElementById('listView').classList.remove('hidden');
  document.getElementById('calView').classList.remove('show');
  renderList();
});

document.getElementById('tabCal').addEventListener('click', () => {
  activeTab = 'calendar';
  document.getElementById('tabCal').classList.add('active');
  document.getElementById('tabList').classList.remove('active');
  document.getElementById('calView').classList.add('show');
  document.getElementById('listView').classList.add('hidden');
  renderCalendar();
});

// ── Calendar navigation ──
document.getElementById('calPrev').addEventListener('click', () => {
  calDate = new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1);
  selectedDate = null;
  document.getElementById('calPopup').classList.remove('show');
  renderCalendar();
});
document.getElementById('calNext').addEventListener('click', () => {
  calDate = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1);
  selectedDate = null;
  document.getElementById('calPopup').classList.remove('show');
  renderCalendar();
});

// ── Add form ──
const QUICK_EMOJIS = ['📸','💍','✉️','📬','👗','🏠','🛍️','💒','✈️','📅','🎉','💕'];

(function initEmojiPicker() {
  const picker = document.getElementById('emojiPicker');
  QUICK_EMOJIS.forEach(em => {
    const btn = document.createElement('button');
    btn.className = 'emoji-pick-btn' + (em === selectedEmoji ? ' selected' : '');
    btn.textContent = em;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      selectedEmoji = em;
      picker.querySelectorAll('.emoji-pick-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    picker.appendChild(btn);
  });
})();

document.getElementById('addBtn').addEventListener('click', () => {
  document.getElementById('addForm').classList.toggle('show');
});

document.getElementById('formSubmit').addEventListener('click', async () => {
  const title = document.getElementById('formTitle').value.trim();
  const date  = document.getElementById('formDate').value;
  if (!title || !date) return;

  await addDoc(eventsCol, { title, date, emoji: selectedEmoji, createdAt: serverTimestamp() });

  document.getElementById('formTitle').value = '';
  document.getElementById('formDate').value  = '';
  document.getElementById('addForm').classList.remove('show');
});
