import { weddingLettering } from './wedding-lettering.mjs?v=20260915-personal-invitation';
import { WEDDING } from './wedding-date.mjs?v=20260915-personal-invitation';
import { PHOTOS, getPhoto, hasPersonalPhotos, hasVenue, getVenue, venueLabel, venueCaption, personalizeCover } from './personal-content.mjs?v=20260915-personal-invitation';
import { countdownMarkup } from './countdown.mjs?v=20260915-personal-invitation';
import { escapeHtml as e } from './core.mjs?v=20260915-personal-invitation';

const ids = ['salon-lettering','salon-polaroid','salon-editorial'];
const photo = (i,cls='',eager=false) => `<img class="${cls}" src="${e(getPhoto(i).src)}" alt="${e(getPhoto(i).alt)}" width="${getPhoto(i).width}" height="${getPhoto(i).height}" ${eager?'fetchpriority="high"':'loading="lazy"'} decoding="async">`;
const mark = (id,key) => `data-reference-reveal data-reference-key="${id}-${key}"`;
const section = (id,key,cls,html) => `<section class="rs-section ref-reveal ${cls}" data-section="${key}" ${mark(id,key)}>${html}</section>`;
const title = text => `<h2 class="rs-title">${text}</h2>`;
const dateLine = () => `<p class="rs-date-line">${WEDDING.koFull}<br>${e(venueLabel())}</p>`;

export const salonCover = (id, thumbnail = false) => personalizeCover(renderSalonCover(id, thumbnail));
function renderSalonCover(id,thumbnail=false) {
  if (!ids.includes(id)) return '';
  const attrs = thumbnail ? 'data-reference-thumbnail' : `${mark(id,'cover')} data-reference-intro`;
  if (id==='salon-polaroid') return `<section class="cover ref-cover rs-cover rs-polaroid ref-reveal" ${attrs}>${thumbnail ? '' : weddingLettering({variant:'paper'})}<div class="rs-polaroid-paper"><div class="rs-polaroid-photo">${photo(2,'',!thumbnail)}</div><span class="rs-vertical-names">성우　소희</span><h2 class="rs-handwritten">Happy wedding day</h2></div>${dateLine()}</section>`;
  if (id==='salon-editorial') return `<section class="cover ref-cover rs-cover rs-editorial ref-reveal" ${attrs}>${photo(0,'rs-cover-photo',!thumbnail)}<div class="rs-corner rs-top-left"><h2>성우</h2><span>Sungwoo</span></div><div class="rs-corner rs-top-right"><h2>소희</h2><span>Sohee</span></div><p class="rs-side rs-side-left">${e(venueLabel())}</p><p class="rs-side rs-side-right">${WEDDING.dotted}　${WEDDING.weekday} ${WEDDING.koTime}</p><div class="rs-opening" aria-hidden="true"><span data-reference-intro-trigger>We're getting<br>Married!</span></div></section>`;
  return `<section class="cover ref-cover rs-cover rs-lettering ref-reveal" ${attrs}>${photo(2,'rs-cover-photo',!thumbnail)}<h2 class="rs-handwritten rs-writing" data-reference-intro-trigger>Happy wedding day</h2><p class="rs-cover-names">성우 & 소희</p></section>`;
}

function greeting(id) {
  const polaroid=id==='salon-polaroid';
  return section(id,'greeting',`rs-greeting ${polaroid?'rs-photo-greeting':''}`,`${title(polaroid?'저희 결혼합니다 ♡':'소중한 분들을 초대합니다.')}<div class="rs-prose"><p>두 사람이 만나<br>함께할 내일을 약속합니다.<br>서로의 평범한 하루가<br>소중한 기억으로 쌓여<br>이제 하나의 길을 걷습니다.</p><p>부부라는 이름으로<br>새롭게 시작하는 날,<br>가까이에서 따뜻하게<br>축복해 주시면 감사하겠습니다.</p></div>${polaroid?photo(1,'rs-greeting-photo'):''}`);
}
function profiles(id) {
  return section(id,'profiles','rs-profiles',`<div class="rs-profile-grid"><article>${photo(1,'rs-person rs-groom')}<p>신랑 <strong>성우</strong></p><span>다정하게 이야기를 들어주는 사람</span><p class="rs-profile-note">함께 걷는 길을 좋아해요.<br>오래도록 곁을 지키겠습니다.</p><span class="rs-person-symbol">🌳</span></article><article>${photo(2,'rs-person rs-bride')}<p>신부 <strong>소희</strong></p><span>평범한 날을 특별하게 만드는 사람</span><p class="rs-profile-note">함께 웃는 날을 좋아해요.<br>따뜻한 마음을 나누겠습니다.</p><span class="rs-person-symbol">☀️</span></article></div><p class="rs-family">두 가족의 사랑 안에서<br><b>성우 <i>그리고</i> 소희</b></p><small class="sample-caption">인물 소개와 가족 안내는 예시입니다.</small>`);
}
function date(id,parts) {
  const calendar=parts.date.match(/<div class="wedding-calendar"[\s\S]*?<\/div><\/div>/)?.[0]||'';
  return section(id,'date','rs-date',`${title(id==='salon-polaroid'?`${WEDDING.monthKo}의<br>${WEDDING.dayKo}`:'예식 안내')}${id==='salon-polaroid'?'':dateLine()}${calendar}${id==='salon-polaroid'?dateLine():''}<p class="rs-date-caption">우리의 새로운 시작을<br>함께 기억해 주세요.</p>${countdownMarkup()}<small class="sample-caption">${e(venueCaption())}</small>`);
}
function gallery(id,selection) {
  if (!selection.sections.gallery) return '';
  const grid=selection.galleryLayout==='grid';
  const row=`<div class="rs-gallery ${grid?'rs-gallery-grid':'rs-gallery-slide'} ${selection.galleryLayout==='filmstrip'?'rs-gallery-film':''}"${grid?'':' data-reference-gallery'}>${PHOTOS.map((_,i)=>`<button type="button" data-action="photo" data-index="${i}" aria-label="${hasPersonalPhotos() ? '우리' : '예시'} 사진 ${i+1} 크게 보기">${photo(i)}</button>`).join('')}</div>`;
  const controls=grid?'':`<div class="rs-gallery-controls"><button type="button" data-reference-gallery-step="-1" aria-label="이전 사진">‹</button><output data-reference-gallery-count aria-live="polite">1 / ${PHOTOS.length}</output><button type="button" data-reference-gallery-step="1" aria-label="다음 사진">›</button></div>`;
  return section(id,'gallery','rs-gallery-section',`${title('갤러리')}<div${grid?'':` data-reference-gallery-root="${id}-gallery"`}>${row}${controls}</div><p class="rs-small">사진을 누르면 크게 볼 수 있어요.</p>`);
}
function interview(id) {
  return section(id,'interview','rs-interview',`${title('웨딩 인터뷰')}<p>서로에게 묻고 답한<br>두 사람의 이야기를 준비했습니다.</p><details><summary>인터뷰 읽어보기 <span>＋</span></summary><div><h3>함께할 미래는 어떤 모습인가요?</h3><p>크고 특별한 일보다, 하루 끝에 서로의 이야기를 들어주는 시간이 많았으면 좋겠어요.</p><h3>꼭 지키고 싶은 약속이 있나요?</h3><p>고맙다는 말을 아끼지 않고, 같은 편이라는 마음을 잊지 않으려고 해요.</p><small class="sample-caption">구성을 확인하기 위한 예시 인터뷰입니다.</small></div></details>`);
}
function timeline(id) {
  return section(id,'story','rs-timeline',`${title(id==='salon-polaroid'?'Time line':'우리의 이야기')}<ol>${[[1,'처음 만난 날','작은 인사가 긴 대화가 되었어요.'],[2,'함께한 날들','평범한 주말도 특별한 기억이 되었어요.'],[0,WEDDING.dotted,'이제 부부라는 이름으로 함께합니다.']].map(([i,heading,text])=>`<li>${photo(i)}<div><h3>${heading}</h3><p>${text}</p></div></li>`).join('')}</ol><small class="sample-caption">이야기는 구성을 살펴보기 위한 예시입니다.</small>`);
}
function snap(id) {
  return section(id,'guest-snap','rs-snap',`${title('게스트스냅 📷')}<p>당신의 시선으로 바라본<br>우리의 행복한 순간을 담아주세요.</p><div class="rs-snap-photo">${photo(2)}<span>OUR WEDDING<br><b>Guest snap</b></span></div><p class="rs-small">함께 웃고 반기는 순간들.<br>그날의 다정한 기억을 오래 간직하고 싶어요.</p><span class="rs-sample-button">사진 함께 모으기</span><small class="sample-caption">디자인 예시로 사진을 업로드하거나 수집하지 않아요.</small>`);
}
function guide(id) {
  return section(id,'guest-guide','rs-guide',`<div class="rs-guide-slides" aria-label="옆으로 넘겨보는 하객 안내">${[[1,'포토부스','소중한 날을 기억할 수 있도록','함께 사진을 남길 공간을 준비할 예정이에요.'],[0,'주차 안내','편안한 발걸음이 되도록',hasVenue() ? e(getVenue().parking || '주차 안내를 준비하고 있어요.') : '예식장의 주차 안내를 이곳에 자세히 적어요.'],[2,'감사의 선물','함께해 주신 마음에 감사하며','준비한 작은 선물로 마음을 전하려 해요.']].map(([i,heading,first,text])=>`<article>${photo(i)}<h2>${heading}</h2><p>${first}<br>${text}</p></article>`).join('')}</div><p class="rs-small">옆으로 넘겨서 안내를 확인해 주세요.</p>`);
}
function restyle(html,cls) {return html?.replace('class="',`class="ref-reveal ${cls} `).replace(/ data-section="([^"]+)"/, ' data-reference-reveal data-reference-key="'+cls+'-$1" data-section="$1"')||'';}
function ending(id) {return `<footer class="invitation-ending rs-ending ref-reveal" ${mark(id,'ending')}>${photo(0)}<div><p>저희 둘, 행복하게 잘 살겠습니다.</p><span>성우 & 소희</span><small>${WEDDING.dotted}</small></div></footer>`;}

export function salonBody(selection,parts) {
  const id=selection.templateId;if(!ids.includes(id))return '';
  const s=selection.sections;
  const directions=restyle(parts.directions,`rs-detail rs-directions-${id}`),accounts=restyle(parts.accounts,`rs-detail rs-accounts-${id}`),rsvp=restyle(parts.rsvp,`rs-detail rs-rsvp-${id}`),guestbook=restyle(parts.guestbook,`rs-detail rs-guestbook-${id}`);
  const g=gallery(id,selection), story=s.story?timeline(id):'', details=guide(id);
  const quote=id==='salon-lettering'?section(id,'quote','rs-quote','<p>특별한 날에도,<br>평범한 날에도.</p><p>서로의 가장 가까운 곳에서<br>같은 계절을 걸어가겠습니다.</p>'):'';
  let content;
  if(id==='salon-polaroid')content=`${g}${s.story?interview(id):''}${directions}${details}${s.gallery?snap(id):''}${story}${accounts}${rsvp}${guestbook}`;
  else if(id==='salon-editorial')content=`${story}${s.gallery?snap(id):''}${g}${directions}${details}${rsvp}${accounts}${guestbook}`;
  else content=`${directions}${g}${s.story?interview(id):''}${story}${details}${accounts}${rsvp}${guestbook}`;
  return `${parts.cover}${greeting(id)}${quote}${profiles(id)}${date(id,parts)}${content}${ending(id)}`;
}
