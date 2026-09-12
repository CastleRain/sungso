import { TRIP_DAYS, HOTELS, PLACES, DECISIONS } from '../shared/trip-data.mjs';

// Keep the local itinerary readable even if the shared storage SDK cannot load.
let saveHotelChoice = async () => { throw new Error('공동 저장 연결을 확인해주세요.'); };
let saveDay = async () => { throw new Error('공동 저장 연결을 확인해주세요.'); };

const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const clone = (value) => JSON.parse(JSON.stringify(value));
const mapSearch = (query) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
const hotelById = (id) => HOTELS.find((hotel) => hotel.id === id);
const formatDay = (date) => {
  const value = new Date(`${date}T12:00:00Z`);
  return `${value.getUTCMonth() + 1}/${value.getUTCDate()} ${'일월화수목금토'[value.getUTCDay()]}`;
};
const scrollToElement = (element) => element?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
let snapshot = { data: { days: TRIP_DAYS, hotels: { arrival: null, return: null }, decisions: {} }, connection: 'loading', saving: false, error: null };
let selectedDate = TRIP_DAYS[0].date;
let selectedPlace = 'airport';
let previewHotelId = null;
let pendingHotel = null;
let dayEditDate = null;
let originalEvents = null;
let editorSaving = false;
let renderSignature = '';
let hotelSignature = '';
let historySnapshot = { entries: [], connection: 'loading', error: null };
let showAllHistory = false;

function allDays() { return Array.isArray(snapshot.data?.days) ? snapshot.data.days : TRIP_DAYS; }
function currentDay() { return allDays().find((day) => day.date === selectedDate) || allDays()[0]; }
function daySlot(date = selectedDate) { return date <= '2027-03-08' ? 'arrival' : 'return'; }
function currentHotel() { return hotelById(snapshot.data?.hotels?.[daySlot()]) || HOTELS[0]; }
function placeQuery(key) {
  if (key === 'hotel') return (hotelById(previewHotelId) || currentHotel()).query;
  return PLACES[key]?.q || PLACES[key]?.query || PLACES.airport.q;
}
function placeName(key) {
  if (key === 'hotel') return (hotelById(previewHotelId) || currentHotel()).name;
  return PLACES[key]?.name || '위치 확인';
}
function canSave() { return snapshot.connection === 'live' && !snapshot.saving; }
function showMessage(text, isError = false) {
  const box = $('#action-message');
  box.textContent = text;
  box.classList.toggle('error', isError);
  box.hidden = !text;
}

function showPlace(key, { focusMap = false } = {}) {
  if (!PLACES[key]) return;
  selectedPlace = key;
  const query = placeQuery(key);
  $('#map-title').textContent = placeName(key);
  $('#place-link').href = mapSearch(query);
  const map = $('#google-map');
  const source = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=${key === 'airport' ? '11' : key === 'resort' ? '10' : '15'}&output=embed`;
  if (map.getAttribute('src') !== source) map.src = source;
  map.title = `${placeName(key)} Google 지도`;
  document.querySelectorAll('[data-place]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.place === key)));
  const slotLabel = daySlot() === 'arrival' ? '3/7 도착일' : '3/11 하선일';
  const savedHotel = hotelById(snapshot.data?.hotels?.[daySlot()]);
  $('#map-hotel-note').textContent = previewHotelId
    ? `지도만 미리보기: ${hotelById(previewHotelId).name}. 저장한 숙박 후보와 동선은 바뀌지 않아요.`
    : savedHotel
      ? `${slotLabel} 저장한 숙박 후보: ${savedHotel.name} · 예약 확정과는 별개예요.`
      : `${slotLabel} 호텔 후보는 아직 저장 전이에요. 동선은 파크로열을 예시로 보여줘요.`;
  if (focusMap) scrollToElement($('.map-card'));
}

function routeForDay(day) {
  if (!day.route) return null;
  const base = TRIP_DAYS.find((item) => item.date === day.date);
  if (JSON.stringify(day.events) === JSON.stringify(base?.events)) return day.route;
  // Edited Singapore itineraries use the actual event order. Overseas air segments stay separate.
  const route = (day.events || []).map((event) => event.place).filter((key) => key && key !== 'resort' && PLACES[key]);
  return route.filter((key, index) => index === 0 || route[index - 1] !== key);
}

function renderRoute(day) {
  const link = $('#route-link');
  const route = routeForDay(day);
  const query = (key) => key === 'hotel' ? currentHotel().query : placeQuery(key);
  if (route && route.length > 1) {
    const parameters = new URLSearchParams({ api: '1', origin: query(route[0]), destination: query(route.at(-1)), travelmode: 'driving' });
    if (route.length > 2) parameters.set('waypoints', route.slice(1, -1).map(query).join('|'));
    link.href = `https://www.google.com/maps/dir/?${parameters}`;
    link.textContent = 'Google 지도에서 이날 동선 보기 ↗';
    $('#route-note').textContent = '차량 기준으로 열려요. 산책 구간은 도보로 바꿔보세요. 모바일에서는 경유지 수가 제한될 수 있어요.';
  } else {
    const key = route?.[0] || day.focus;
    link.href = mapSearch(query(key));
    link.textContent = `${placeName(key)} Google 지도에서 보기 ↗`;
    $('#route-note').textContent = '항해·항공 이동은 도로 경로로 표시하지 않고, 관련 장소의 위치를 보여줘요.';
  }
}

function renderDay(changeMap = true) {
  const day = currentDay();
  $('#day-kicker').textContent = `${formatDay(day.date)} · ${day.label}`;
  $('#day-title').textContent = day.title;
  $('#day-description').textContent = day.description || day.desc || '';
  $('#day-note').textContent = day.note || '';
  $('#timeline').innerHTML = (day.events || []).length ? day.events.map((event) => `<li><time>${escapeHTML(event.time)}</time><strong>${escapeHTML(event.title)}</strong><p>${escapeHTML(event.text)}</p>${event.place && PLACES[event.place] ? `<button type="button" class="text-button" data-location="${escapeHTML(event.place)}">${escapeHTML(event.place === 'hotel' ? currentHotel().name : PLACES[event.place].name)} 지도 보기 ↗</button>` : ''}</li>`).join('') : '<li class="empty-day">아직 일정이 없어요. ‘일정 수정’에서 함께 추가해보세요.</li>';
  document.querySelectorAll('[data-day]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.day === selectedDate)));
  renderRoute(day);
  if (changeMap) { previewHotelId = null; showPlace(day.focus); }
  else showPlace(selectedPlace);
}

function selectDay(date, scroll = false) {
  if (!allDays().some((day) => day.date === date)) return;
  selectedDate = date;
  renderDay();
  renderSignature = JSON.stringify({ days: snapshot.data.days, hotels: snapshot.data.hotels });
  if (scroll) scrollToElement($('#itinerary'));
  const button = document.querySelector(`[data-day="${date}"]`);
  // Keep the selected day visible without shifting the page vertically.
  if (button) {
    const parent = $('#day-tabs');
    const left = button.offsetLeft - parent.offsetLeft;
    if (left < parent.scrollLeft || left + button.offsetWidth > parent.scrollLeft + parent.clientWidth) parent.scrollTo({ left: Math.max(0, left - 10), behavior: 'smooth' });
  }
}

function renderHotels() {
  const choices = snapshot.data?.hotels || {};
  $('#hotel-choices').innerHTML = [
    { key: 'arrival', date: '3/7', label: '도착일 · 3/8 체크아웃' },
    { key: 'return', date: '3/11', label: '하선일 · 3/12 체크아웃' }
  ].map((slot) => {
    const hotel = hotelById(choices[slot.key]);
    return `<div class="hotel-choice"><div class="slot-date">${slot.date}<span>1박</span></div><div class="slot-details"><small>${slot.label}</small><strong>${escapeHTML(hotel?.name || '숙박 후보를 골라주세요')}</strong><p>${hotel ? '함께 저장한 후보 · 예약 완료 아님' : '지도는 파크로열 기준으로 미리보기 중'}</p></div></div>`;
  }).join('');
  $('#hotel-grid').innerHTML = HOTELS.map((hotel) => `<article class="hotel-card ${Object.values(choices).includes(hotel.id) ? 'is-chosen' : ''}"><span class="hotel-area">${escapeHTML(hotel.area)}</span><h3>${escapeHTML(hotel.name)}</h3><p class="hotel-room">${escapeHTML(hotel.room)}</p><p class="hotel-reason">${escapeHTML(hotel.reason)}</p><p class="hotel-caution">${escapeHTML(hotel.caution)}</p><div class="hotel-links"><button type="button" class="text-button" data-preview-hotel="${hotel.id}">지도 미리보기 ↗</button><a href="${escapeHTML(hotel.url)}" target="_blank" rel="noopener noreferrer">호텔 공식 사이트 ↗</a></div><div class="hotel-actions">${['arrival', 'return'].map((slot) => `<button type="button" data-save-hotel="${hotel.id}" data-slot="${slot}" aria-pressed="${choices[slot] === hotel.id}" ${!canSave() || pendingHotel ? 'disabled' : ''}><span>${slot === 'arrival' ? '3/7' : '3/11'} 숙박 후보</span><span>${pendingHotel === `${slot}:${hotel.id}` ? '저장 중…' : choices[slot] === hotel.id ? '선택됨 ✓' : '선택 +'}</span></button>`).join('')}</div></article>`).join('');
}

function updateSnapshot(next) {
  snapshot = next;
  const status = $('#trip-sync');
  status.dataset.connection = next.connection;
  status.textContent = next.saving ? '변경사항을 함께 저장하는 중…' : next.connection === 'live' ? '함께 저장한 최신 일정 · 변경하면 서로에게 반영돼요' : next.connection === 'loading' ? '함께 저장한 일정 불러오는 중…' : next.connection === 'offline' ? '오프라인 · 연결 후 변경사항을 저장할 수 있어요' : '연결을 확인해주세요 · 지금은 저장할 수 없어요';
  if (next.error) showMessage(typeof next.error === 'string' ? next.error : next.error.message || '변경사항을 저장하지 못했어요. 연결을 확인해주세요.', true);
  $('#edit-day').disabled = !canSave();
  $('#save-day').disabled = !canSave() || editorSaving;
  document.querySelectorAll('[data-decision-status]').forEach((badge) => {
    const state = next.data?.decisions?.[badge.dataset.decisionStatus]?.status || 'candidate';
    badge.textContent = state === 'confirmed' ? '예약 완료로 표시됨' : state === 'pending' ? '미정' : '예약 전 후보';
    badge.classList.toggle('confirmed', state === 'confirmed');
  });
  const nextDaySignature = JSON.stringify({ days: next.data.days, hotels: next.data.hotels });
  if (nextDaySignature !== renderSignature) { renderDay(false); renderSignature = nextDaySignature; }
  const nextHotelSignature = JSON.stringify({ hotels: next.data.hotels, save: canSave(), pendingHotel });
  if (nextHotelSignature !== hotelSignature) { renderHotels(); hotelSignature = nextHotelSignature; }
}

function editorEvents() {
  return [...document.querySelectorAll('.editor-event')].map((row) => {
    const event = {
      time: row.querySelector('[name=time]').value.trim(),
      title: row.querySelector('[name=title]').value.trim(),
      text: row.querySelector('[name=text]').value.trim()
    };
    const place = row.querySelector('[name=place]').value;
    if (place) event.place = place;
    return event;
  });
}

function renderEditorEvents(events) {
  $('#editor-events').innerHTML = events.map((event, index) => `<section class="editor-event"><div class="editor-event-top"><span>일정 ${index + 1}</span><button type="button" class="remove-event" data-remove-event="${index}" aria-label="일정 ${index + 1} 삭제">삭제</button></div><div class="editor-fields"><label>시간<input name="time" value="${escapeHTML(event.time)}" maxlength="80" placeholder="예: 15:00 전후"></label><label>할 일<input name="title" value="${escapeHTML(event.title)}" maxlength="160" placeholder="예: 호텔 체크인" required></label><label class="wide">메모<textarea name="text" maxlength="1500" placeholder="이동 방법이나 함께 확인할 내용">${escapeHTML(event.text)}</textarea></label><label class="wide">지도에 연결할 장소<select name="place"><option value="">장소 연결 없음</option>${Object.entries(PLACES).map(([key, place]) => `<option value="${escapeHTML(key)}" ${event.place === key ? 'selected' : ''}>${escapeHTML(place.name)}</option>`).join('')}</select></label></div></section>`).join('');
  $('#add-event').disabled = events.length >= 30 || editorSaving;
}

function openEditor() {
  if (!canSave()) { showMessage('연결이 완료된 뒤 일정을 수정할 수 있어요.', true); return; }
  const day = currentDay();
  dayEditDate = day.date;
  originalEvents = clone(day.events || []);
  $('#editor-date').textContent = `${formatDay(day.date)} · ${day.label}`;
  $('#editor-error').textContent = '';
  renderEditorEvents(originalEvents);
  $('#day-editor').showModal();
}

function closeEditor() {
  if (editorSaving) return;
  $('#day-editor').close();
  dayEditDate = null;
  originalEvents = null;
  $('#edit-day').focus();
}

function historyValue(type, value) {
  if (type === 'hotel') return `<p>${escapeHTML(hotelById(value)?.name || '아직 선택하지 않음')}</p>`;
  if (type === 'decision') {
    const label = { pending: '미정', candidate: '후보 있음', confirmed: '완료' }[value?.status] || '미정';
    return `<p><strong>${label}</strong></p><p>${escapeHTML(value?.note || '메모 없음')}</p>`;
  }
  if (type === 'day') return Array.isArray(value) && value.length ? `<ol>${value.map((event) => `<li><strong>${escapeHTML(event.time)} · ${escapeHTML(event.title)}</strong>${event.text ? `<p>${escapeHTML(event.text)}</p>` : ''}${event.place && PLACES[event.place] ? `<small>위치: ${escapeHTML(PLACES[event.place].name)}</small>` : ''}</li>`).join('')}</ol>` : '<p>일정 없음</p>';
  return '<p>내용 확인 필요</p>';
}

function renderHistory() {
  const { entries = [], connection, error } = historySnapshot;
  $('#history-status').textContent = error ? '변경 기록을 불러오지 못했어요. 연결 상태를 확인해주세요.' : connection === 'loading' ? '변경 기록을 불러오는 중…' : connection !== 'live' ? '연결을 확인하는 중이에요. 표시된 기록이 최신이 아닐 수 있어요.' : entries.length ? '누가 언제 무엇을 바꿨는지 확인해요. 이름은 선택한 작성자 기준이에요.' : '아직 변경 기록이 없어요. 호텔 후보·일정·결정 사항을 저장하면 여기에 쌓여요.';
  const visibleEntries = showAllHistory ? entries : entries.slice(0, 8);
  $('#history-list').innerHTML = visibleEntries.map((entry) => {
    const label = entry.type === 'hotel' ? `${entry.target === 'arrival' ? '3/7' : '3/11'} 숙박 후보` : entry.type === 'day' ? `${formatDay(entry.target)} 일정` : DECISIONS.find((decision) => decision.id === entry.target)?.title || '결정 사항';
    const changedAt = new Date(entry.changedAt);
    const time = Number.isNaN(changedAt.getTime()) ? '시간 확인 중' : new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(changedAt);
    return `<li class="history-item"><details><summary><div class="history-item-heading"><span class="history-actor">${escapeHTML(entry.actor || '함께')}</span><strong>${escapeHTML(label)}</strong><time>${escapeHTML(time)} <span>한국 시간</span></time></div><span class="history-expand">변경 내용 보기</span></summary><div class="history-diff"><div><span class="diff-label">변경 전</span>${historyValue(entry.type, entry.before)}</div><div><span class="diff-label">변경 후</span>${historyValue(entry.type, entry.after)}</div></div></details></li>`;
  }).join('');
  $('#history-more').hidden = entries.length <= 8;
  $('#history-more').textContent = showAllHistory ? '최근 8건만 보기' : `최근 ${entries.length}건 모두 보기`;
}

$('#day-tabs').innerHTML = TRIP_DAYS.map((day) => `<button type="button" class="day-tab" data-day="${escapeHTML(day.date)}" aria-pressed="${day.date === selectedDate}"><strong>${formatDay(day.date)}</strong><span>${escapeHTML(day.label)}</span></button>`).join('');
$('#place-buttons').innerHTML = Object.entries(PLACES).map(([key, place]) => `<button type="button" class="place-button" data-place="${escapeHTML(key)}" aria-pressed="false">${escapeHTML(place.name)}</button>`).join('');
$('#flight-search').href = 'https://www.skyscanner.co.kr/transport/d/sela/2027-03-07/sin/sin/2027-03-12/mle/mle/2027-03-16/sin/sin/2027-03-17/sela/config/12409-2703070850--31876-0-16292-2703071425%7C16292-2703121005--31876-0-14155-2703121140%7C14155-2703161255--31876-0-16292-2703162045%7C16292-2703170010--31876-0-12409-2703170725?adultsv2=2&cabinclass=economy&childrenv2=&ref=home&departure-times=0-750,0-750#/results';

document.addEventListener('click', async (event) => {
  const dayButton = event.target.closest('[data-day]');
  if (dayButton) selectDay(dayButton.dataset.day);
  const goDay = event.target.closest('[data-go-day]');
  if (goDay) selectDay(goDay.dataset.goDay, true);
  const placeButton = event.target.closest('[data-place]');
  if (placeButton) { previewHotelId = null; showPlace(placeButton.dataset.place); }
  const locationButton = event.target.closest('[data-location]');
  if (locationButton) { previewHotelId = null; showPlace(locationButton.dataset.location, { focusMap: innerWidth <= 720 }); }
  const previewButton = event.target.closest('[data-preview-hotel]');
  if (previewButton) { previewHotelId = previewButton.dataset.previewHotel; showPlace('hotel'); scrollToElement($('.map-card')); }
  const saveButton = event.target.closest('[data-save-hotel]');
  if (saveButton && canSave() && !pendingHotel) {
    const { slot, saveHotel: id } = saveButton.dataset;
    if (snapshot.data?.hotels?.[slot] === id) { showMessage('이미 함께 저장한 숙박 후보예요. 실제 예약은 호텔 예약 페이지에서 진행해요.'); return; }
    pendingHotel = `${slot}:${id}`;
    renderHotels();
    try {
      await saveHotelChoice(slot, id);
      previewHotelId = null;
      showMessage(`${slot === 'arrival' ? '3/7' : '3/11'} 숙박 후보로 ${hotelById(id).name}을 함께 저장했어요. 실제 호텔 예약은 아직 진행하지 않았어요.`);
      renderDay(false);
    } catch (error) { showMessage(error.message || '호텔 후보를 저장하지 못했어요. 다시 시도해주세요.', true); }
    finally { pendingHotel = null; renderHotels(); document.querySelector(`[data-save-hotel="${id}"][data-slot="${slot}"]`)?.focus({ preventScroll: true }); }
  }
  const remove = event.target.closest('[data-remove-event]');
  if (remove && !editorSaving) { const events = editorEvents(); events.splice(Number(remove.dataset.removeEvent), 1); renderEditorEvents(events); }
});

$('#edit-day').addEventListener('click', openEditor);
$('#history-more').addEventListener('click', () => { showAllHistory = !showAllHistory; renderHistory(); });
$('#close-editor').addEventListener('click', closeEditor);
$('#cancel-editor').addEventListener('click', closeEditor);
$('#day-editor').addEventListener('cancel', (event) => { if (editorSaving) event.preventDefault(); });
$('#add-event').addEventListener('click', () => {
  const events = editorEvents();
  if (events.length >= 30 || editorSaving) return;
  events.push({ time: '', title: '', text: '' });
  renderEditorEvents(events);
  $('#editor-events').lastElementChild?.querySelector('[name=title]')?.focus();
});
$('#day-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!canSave() || editorSaving || !dayEditDate) { $('#editor-error').textContent = '연결이 완료된 뒤 다시 저장해주세요. 입력한 내용은 이 창에 남아 있어요.'; return; }
  const events = editorEvents();
  if (events.some((item) => !item.title)) { $('#editor-error').textContent = '각 일정의 할 일을 적어주세요.'; return; }
  editorSaving = true;
  $('#editor-error').textContent = '';
  $('#save-day').disabled = true;
  $('#save-day').textContent = '저장 중…';
  $('#close-editor').disabled = true;
  $('#cancel-editor').disabled = true;
  $('#day-form').querySelectorAll('input, textarea, select, .remove-event, #add-event').forEach((input) => { input.disabled = true; });
  try {
    await saveDay(dayEditDate, events, originalEvents);
    showMessage(`${formatDay(dayEditDate)} 일정을 함께 저장했어요.`);
    editorSaving = false;
    closeEditor();
  } catch (error) {
    $('#editor-error').textContent = `${error.message || '일정을 저장하지 못했어요.'} 입력한 내용은 그대로 남아 있어요. 다른 사람이 수정했다면 내용을 따로 복사한 뒤 창을 다시 열어 최신 일정과 비교해주세요.`;
  } finally {
    editorSaving = false;
    $('#save-day').disabled = !canSave();
    $('#save-day').textContent = '함께 보는 일정에 저장';
    $('#close-editor').disabled = false;
    $('#cancel-editor').disabled = false;
    $('#day-form').querySelectorAll('input, textarea, select, .remove-event, #add-event').forEach((input) => { input.disabled = false; });
    $('#add-event').disabled = editorEvents().length >= 30;
  }
});

const sectionObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    document.querySelectorAll('.section-nav a').forEach((link) => link.classList.toggle('is-active', link.hash === `#${entry.target.id}`));
  }
}, { rootMargin: '-70px 0px -65% 0px', threshold: 0 });
['itinerary', 'hotels', 'flights', 'cruise', 'resort', 'history'].forEach((id) => sectionObserver.observe(document.getElementById(id)));
renderHotels();
renderDay();
import('../shared/trip-store.mjs').then((store) => {
  saveHotelChoice = store.saveHotelChoice;
  saveDay = store.saveDay;
  store.subscribeTrip(updateSnapshot);
  store.subscribeTripHistory((next) => { historySnapshot = next; renderHistory(); });
}).catch(() => {
  updateSnapshot({ ...snapshot, connection: 'error', error: '함께 저장한 일정에 연결하지 못했어요. 현재 기본 초안을 보여드려요. 연결 후 새로고침해주세요.' });
  historySnapshot = { entries: [], connection: 'error', error: true };
  renderHistory();
});
