import { WEDDING } from './wedding-date.mjs?v=20260915-venue-map';
export const WEDDING_INSTANT = Date.parse(`${WEDDING.iso}T${WEDDING.time24}:00+09:00`);
export function remainingTime(now = Date.now()) {
  const seconds = Math.max(0,Math.ceil((WEDDING_INSTANT - now) / 1000));
  return {days:Math.floor(seconds/86400),hours:Math.floor(seconds/3600)%24,minutes:Math.floor(seconds/60)%60,seconds:seconds%60,arrived:seconds===0};
}
export function countdownMarkup() {
  return `<div class="wedding-countdown" data-wedding-countdown role="timer" aria-live="off" aria-label="예식까지 남은 시간"><p data-countdown-message>우리의 시작까지</p><div class="countdown-units">${[['days','일'],['hours','시간'],['minutes','분'],['seconds','초']].map(([key,label])=>`<span><b data-countdown="${key}">00</b><small>${label}</small></span>`).join('')}</div><small class="countdown-arrived" data-countdown-arrived hidden>함께하는 우리의 첫날 ♡</small></div>`;
}
export function createCountdown({root = document, now = Date.now, schedule = setInterval, cancel = clearInterval} = {}) {
  let timer = null;
  const tick = () => {
    const time = remainingTime(now());
    root.querySelectorAll('[data-wedding-countdown]').forEach(node=>{
      node.querySelectorAll('[data-countdown]').forEach(cell=>{cell.textContent = String(time[cell.dataset.countdown]).padStart(2,'0');});
      node.querySelector('[data-countdown-message]').textContent = time.arrived ? '기다리던 날이 찾아왔어요' : '우리의 시작까지';
      node.querySelector('[data-countdown-arrived]').hidden = !time.arrived;
      node.setAttribute('aria-label',time.arrived ? '예식 시간이 되었습니다' : `예식까지 ${time.days}일 ${time.hours}시간 ${time.minutes}분 ${time.seconds}초`);
    });
  };
  const pause = () => { if(timer!==null) cancel(timer);timer=null; };
  const resume = () => { pause();tick();if(!root.hidden)timer=schedule(tick,1000); };
  return {mount(){root.addEventListener?.('visibilitychange',resume);resume();},refresh:tick,dispose(){pause();root.removeEventListener?.('visibilitychange',resume);}};
}
