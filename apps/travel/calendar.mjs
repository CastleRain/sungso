import { TRAVEL_LOCATIONS, TRIP_SETTINGS, TRIP_DAYS } from '../../shared/travel/trip-data.mjs';
export { TRAVEL_LOCATIONS };
const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const DAY_MS = 86400000;
const iso = date => date.toISOString().slice(0, 10);
const dateAt = text => new Date(`${text}T12:00:00Z`);
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
// A calendar-only milestone; this does not extend or write to the 11-day trip.
const weddingDate = () => TRIP_SETTINGS.weddingDate || '';
const PLACE_SYMBOLS = {'한국':'🇰🇷','싱가포르':'🇸🇬','몰디브':'🇲🇻','크루즈':'🚢'};
const countryHTML = country => country === '싱가포르' ? '싱가<wbr>포르' : escapeHTML(country);

// The ship's sea days are a separate location, not extra nights in Singapore.


export function calendarDates(fullMonth = false) {
 const anchor = dateAt(TRIP_DAYS[0].date);
 if (fullMonth) anchor.setUTCDate(1);
 const first = new Date(anchor.getTime() - anchor.getUTCDay() * DAY_MS);
 const last = fullMonth ? new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0, 12)) : dateAt(TRIP_DAYS.at(-1).date);
 const length = Math.ceil(((last - first) / DAY_MS + 1) / 7) * 7;
 return Array.from({length}, (_, i) => iso(new Date(first.getTime() + i * DAY_MS)));
}

export function createTripCalendar(container, {days, selectedDate, onSelect}) {
 let currentDays = days, selected = selectedDate, fullMonth = false;
 container.classList.add('trip-calendar');
 container.innerHTML = `<div class="calendar-heading"><div><p class="calendar-kicker">${escapeHTML(TRIP_DAYS[0].date.slice(0,7))}</p><h3>우리의 여행 달력</h3></div><div class="calendar-view-switch" role="group" aria-label="달력 표시 범위"><button type="button" data-calendar-range="trip" aria-pressed="true">여행 기간</button><button type="button" data-calendar-range="month" aria-pressed="false">이달 전체</button></div></div><div class="calendar-wedding-banner"><span aria-hidden="true">💍</span><span><strong>${escapeHTML(weddingDate())}</strong> 우리의 결혼식</span></div><div class="calendar-legend" aria-label="여행 장소 색상"><span data-tone="singapore">싱가포르</span><span data-tone="sea">크루즈 · 해상</span><span data-tone="maldives">몰디브</span><span data-tone="korea">한국</span></div><table class="country-calendar"><caption class="calendar-sr">함께 보는 여행 일정. 여행 날짜를 누르면 위치는 유지하고 그날 일정과 지도를 바꿉니다.</caption><thead><tr>${WEEKDAYS.map((day,index)=>`<th scope="col" class="${index===0?'calendar-sunday':index===6?'calendar-saturday':''}">${day}</th>`).join('')}</tr></thead><tbody></tbody></table><div class="calendar-selection" aria-live="polite"><div><span class="calendar-selection-date"></span><strong class="calendar-selection-country"></strong></div><button type="button" class="calendar-open-day">이날 일정 보기 <span aria-hidden="true">→</span></button></div><p class="calendar-help">날짜를 누르면 달력은 그대로, 선택한 날의 내용만 바뀌어요. ‘이날 일정 보기’로 세부 일정으로 이동하세요.</p>`;
 const tableBody=container.querySelector('tbody');
 function renderGrid() {
  const byDate=new Map(currentDays.map(day=>[day.date,day]));
  const dates=calendarDates(fullMonth);
  tableBody.innerHTML=Array.from({length:dates.length/7},(_,week)=>`<tr>${dates.slice(week*7,week*7+7).map(date=>{
   const value=dateAt(date),number=value.getUTCDate(),day=byDate.get(date),location=TRAVEL_LOCATIONS[date];
   if(date===weddingDate())return `<td><div class="calendar-wedding-day" role="group" aria-label="${escapeHTML(weddingDate())}, 우리의 결혼식"><span class="calendar-date-row"><strong>${number}</strong><small aria-hidden="true">💍</small></span><span class="calendar-place-symbols" aria-hidden="true"><span class="calendar-activity">💒</span></span><span class="calendar-country">결혼식</span><span class="calendar-day-note">우리의 시작</span></div></td>`;
   if(!day||!location)return `<td class="calendar-inactive ${date.slice(0,7)!==TRIP_DAYS[0].date.slice(0,7)?'calendar-outside':''}"><div><span>${number}</span><span class="calendar-sr">${date} · 여행 일정 없음</span></div></td>`;
   const index=currentDays.findIndex(day=>day.date===date)+1;
   const symbols=location.route?location.route.map(country=>`<span class="${country==='크루즈'?'calendar-activity':'calendar-flag'}"${country==='크루즈'?' data-activity="ship"':''}>${PLACE_SYMBOLS[country]}</span>`).join('<span class="calendar-symbol-arrow">→</span>'):`${location.flag?`<span class="calendar-flag">${location.flag}</span>`:''}<span class="calendar-activity" data-activity="${location.activityType}">${location.activity}</span>`;
   const countries=location.route?`<span class="calendar-country calendar-route">${location.route.map(country=>`<span>${countryHTML(country)}</span>`).join('<span class="calendar-route-arrow" aria-hidden="true">↓</span>')}</span>`:`<span class="calendar-country">${countryHTML(location.country)}</span>`;
   return `<td><button type="button" class="calendar-day" data-calendar-date="${date}" data-tone="${location.tone}" aria-pressed="${selected===date}" aria-label="${value.getUTCMonth()+1}월 ${number}일 ${WEEKDAYS[value.getUTCDay()]}요일, ${escapeHTML(location.journey)}, ${escapeHTML(day.title)}" title="${escapeHTML(location.journey)} · ${escapeHTML(day.title)}"><span class="calendar-date-row"><strong>${number}</strong><small>D${index}</small></span><span class="calendar-place-symbols${location.route?' calendar-route-symbols':''}" aria-hidden="true">${symbols}</span>${countries}${location.routeNote?`<span class="calendar-route-note">${escapeHTML(location.routeNote)}</span>`:''}<span class="calendar-day-note"><i aria-hidden="true">${location.icon}</i>${escapeHTML(location.label)}</span></button></td>`;
  }).join('')}</tr>`).join('');
  container.querySelectorAll('[data-calendar-range]').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.calendarRange==='month')===fullMonth)));
  updateSelection();
 }
 function updateSelection(){
  const location=TRAVEL_LOCATIONS[selected],value=dateAt(selected);
  container.querySelectorAll('[data-calendar-date]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.calendarDate===selected)));
  container.querySelector('.calendar-selection').dataset.tone=location.tone;
  container.querySelector('.calendar-selection-date').textContent=`${value.getUTCMonth()+1}월 ${value.getUTCDate()}일 ${WEEKDAYS[value.getUTCDay()]}요일`;
  container.querySelector('.calendar-selection-country').textContent=location.journey;
 }
 container.addEventListener('click',event=>{
  const range=event.target.closest('[data-calendar-range]');
  if(range){fullMonth=range.dataset.calendarRange==='month';renderGrid();return;}
  const button=event.target.closest('[data-calendar-date]');
  if(button){selected=button.dataset.calendarDate;updateSelection();onSelect(selected,{scroll:false});}
  if(event.target.closest('.calendar-open-day'))onSelect(selected,{scroll:true});
 });
 container.addEventListener('keydown',event=>{
  const button=event.target.closest('[data-calendar-date]');
  if(!button)return;
  const offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];
  if(offset===undefined)return;
  const next=iso(new Date(dateAt(button.dataset.calendarDate).getTime()+offset*DAY_MS));
  const target=container.querySelector(`[data-calendar-date="${next}"]`);
  if(target){event.preventDefault();target.focus();}
 });
 renderGrid();
 return {select(date){if(!TRAVEL_LOCATIONS[date])return;selected=date;updateSelection();},updateDays(days){currentDays=days;renderGrid();}};
}
