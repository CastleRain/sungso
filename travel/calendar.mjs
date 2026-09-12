const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const DAY_MS = 86400000;
const iso = date => date.toISOString().slice(0, 10);
const dateAt = text => new Date(`${text}T12:00:00Z`);
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// The ship's sea days are a separate location, not extra nights in Singapore.
export const TRAVEL_LOCATIONS = {
 '2027-03-07': {tone:'singapore',country:'싱가포르',journey:'한국 → 싱가포르',label:'도착 · 1박',icon:'↗',stay:'싱가포르 호텔 · 후보 선택 전'},
 '2027-03-08': {tone:'sea',country:'크루즈',journey:'싱가포르 → 크루즈',label:'승선 · 3박',icon:'≈',stay:'디즈니 어드벤처 · 예약 전 후보'},
 '2027-03-09': {tone:'sea',country:'크루즈',journey:'크루즈 · 해상',label:'바다 위 하루',icon:'≈',stay:'디즈니 어드벤처 · 예약 전 후보'},
 '2027-03-10': {tone:'sea',country:'크루즈',journey:'크루즈 · 해상',label:'바다 위 하루',icon:'≈',stay:'디즈니 어드벤처 · 예약 전 후보'},
 '2027-03-11': {tone:'singapore',country:'싱가포르',journey:'크루즈 → 싱가포르',label:'하선 · 1박',icon:'↓',stay:'싱가포르 호텔 · 후보 선택 전'},
 '2027-03-12': {tone:'maldives',country:'몰디브',journey:'싱가포르 → 몰디브',label:'리조트 · 4박',icon:'↗',stay:'아나네아 마디바루 · 4박 계획'},
 '2027-03-13': {tone:'maldives',country:'몰디브',journey:'몰디브',label:'아나네아',icon:'☀',stay:'아나네아 마디바루'},
 '2027-03-14': {tone:'maldives',country:'몰디브',journey:'몰디브',label:'아나네아',icon:'☀',stay:'아나네아 마디바루'},
 '2027-03-15': {tone:'maldives',country:'몰디브',journey:'몰디브',label:'아나네아',icon:'☀',stay:'아나네아 마디바루'},
 '2027-03-16': {tone:'singapore',country:'싱가포르',journey:'몰디브 → 싱가포르',label:'귀국 환승',icon:'↗',stay:'싱가포르 20:45 도착 · 공항 환승'},
 '2027-03-17': {tone:'korea',country:'한국',journey:'싱가포르 → 한국',label:'07:25 도착',icon:'⌂',stay:'00:10 싱가포르 출발 → 인천 귀국'}
};

export function calendarDates(fullMonth = false) {
 const first = dateAt(fullMonth ? '2027-02-28' : '2027-03-07');
 return Array.from({length: fullMonth ? 35 : 14}, (_, i) => iso(new Date(first.getTime() + i * DAY_MS)));
}

export function createTripCalendar(container, {days, selectedDate, onSelect}) {
 let currentDays = days, selected = selectedDate, fullMonth = false;
 container.classList.add('trip-calendar');
 container.innerHTML = `<div class="calendar-heading"><div><p class="calendar-kicker">MARCH 2027</p><h3>3월, 우리의 여행 달력</h3></div><div class="calendar-view-switch" role="group" aria-label="달력 표시 범위"><button type="button" data-calendar-range="trip" aria-pressed="true">여행 기간</button><button type="button" data-calendar-range="month" aria-pressed="false">3월 전체</button></div></div><div class="calendar-legend" aria-label="여행 장소 색상"><span data-tone="singapore">싱가포르</span><span data-tone="sea">크루즈 · 해상</span><span data-tone="maldives">몰디브</span><span data-tone="korea">한국</span></div><table class="country-calendar"><caption class="calendar-sr">2027년 3월 여행. 날짜를 누르면 그날 일정과 지도로 이동합니다.</caption><thead><tr>${WEEKDAYS.map((day,index)=>`<th scope="col" class="${index===0?'calendar-sunday':index===6?'calendar-saturday':''}">${day}</th>`).join('')}</tr></thead><tbody></tbody></table><div class="calendar-selection" aria-live="polite"><div><span class="calendar-selection-date"></span><strong class="calendar-selection-country"></strong></div><button type="button" class="calendar-open-day">이날 일정 보기 <span aria-hidden="true">→</span></button></div><p class="calendar-help">↗ 나라를 옮기는 날 · 날짜를 누르면 아래에서 일정과 지도를 볼 수 있어요.</p>`;
 const tableBody=container.querySelector('tbody');
 function renderGrid() {
  const byDate=new Map(currentDays.map(day=>[day.date,day]));
  const dates=calendarDates(fullMonth);
  tableBody.innerHTML=Array.from({length:dates.length/7},(_,week)=>`<tr>${dates.slice(week*7,week*7+7).map(date=>{
   const value=dateAt(date),number=value.getUTCDate(),day=byDate.get(date),location=TRAVEL_LOCATIONS[date];
   if(!day||!location)return `<td class="calendar-inactive ${date.slice(0,7)!=='2027-03'?'calendar-outside':''}"><div><span>${number}</span><span class="calendar-sr">${date} · 여행 일정 없음</span></div></td>`;
   const index=currentDays.findIndex(day=>day.date===date)+1;
   return `<td><button type="button" class="calendar-day" data-calendar-date="${date}" data-tone="${location.tone}" aria-pressed="${selected===date}" aria-label="3월 ${number}일 ${WEEKDAYS[value.getUTCDay()]}요일, ${escapeHTML(location.journey)}, ${escapeHTML(day.title)}" title="${escapeHTML(location.journey)} · ${escapeHTML(day.title)}"><span class="calendar-date-row"><strong>${number}</strong><small>D${index}</small></span><span class="calendar-country">${location.country==='싱가포르'?'싱가<wbr>포르':escapeHTML(location.country)}</span><span class="calendar-day-note"><i aria-hidden="true">${location.icon}</i>${escapeHTML(location.label)}</span></button></td>`;
  }).join('')}</tr>`).join('');
  container.querySelectorAll('[data-calendar-range]').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.calendarRange==='month')===fullMonth)));
  updateSelection();
 }
 function updateSelection(){
  const location=TRAVEL_LOCATIONS[selected],value=dateAt(selected);
  container.querySelectorAll('[data-calendar-date]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.calendarDate===selected)));
  container.querySelector('.calendar-selection').dataset.tone=location.tone;
  container.querySelector('.calendar-selection-date').textContent=`3월 ${value.getUTCDate()}일 ${WEEKDAYS[value.getUTCDay()]}요일`;
  container.querySelector('.calendar-selection-country').textContent=location.journey;
 }
 container.addEventListener('click',event=>{
  const range=event.target.closest('[data-calendar-range]');
  if(range){fullMonth=range.dataset.calendarRange==='month';renderGrid();return;}
  const button=event.target.closest('[data-calendar-date]');
  if(button){selected=button.dataset.calendarDate;updateSelection();onSelect(selected);}
  if(event.target.closest('.calendar-open-day'))onSelect(selected);
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
