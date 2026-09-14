const samples = [
  {src:'./assets/couple-garden.webp',alt:'정원에서 손을 잡은 가상 커플의 웨딩 예시 사진',width:1024,height:1536},
  {src:'./assets/couple-walk.webp',alt:'함께 걸으며 웃는 가상 커플의 웨딩 예시 사진',width:1536,height:1024},
  {src:'./assets/couple-close.webp',alt:'서로를 바라보는 가상 커플의 웨딩 예시 사진',width:1536,height:1024},
];
const blankVenue = () => ({name:'',hall:'',address:'',mapUrl:'',transport:'',parking:''});
export let PHOTOS = samples;
let representative = null, venue = blankVenue(), personalized = false;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function applyPersonalContent(snapshot) {
  clearPersonalContent();
  if (!snapshot?.ready) return;
  const profile = snapshot.profile, media = snapshot.photos;
  const photo = (id,index) => media[id] ? {src:media[id].dataUrl,alt:`우리의 사진 ${index + 1}`,width:media[id].width,height:media[id].height} : null;
  representative = profile.coverId ? photo(profile.coverId,0) : null;
  const gallery = profile.galleryIds.map(photo).filter(Boolean);
  personalized = Boolean(representative || gallery.length);
  PHOTOS = gallery.length ? gallery : representative ? [representative] : samples;
  venue = {...blankVenue(),...profile.venue};
}
export function clearPersonalContent() { PHOTOS = samples; representative = null; venue = blankVenue(); personalized = false; }
export const getPhoto = index => PHOTOS[((Number(index) || 0) % PHOTOS.length + PHOTOS.length) % PHOTOS.length];
export const getCoverPhoto = () => representative || (personalized ? PHOTOS[0] : null);
export const hasPersonalPhotos = () => personalized;
export const getVenue = () => ({...venue});
export const hasVenue = () => Boolean(venue.name);
export const venueName = () => venue.name || '우리의 웨딩홀';
export const venueHall = () => venue.name ? venue.hall : '가든홀';
export const venueLabel = () => [venueName(),venueHall()].filter(Boolean).join(' · ');
export const venueCaption = () => hasVenue() ? '두 사람이 설정한 예식 일정과 장소입니다.' : '예식 날짜와 시간은 두 사람의 일정이며 장소는 예시입니다.';
export const contentDescription = () => `${hasPersonalPhotos() ? '우리 사진' : '예시 사진'} · ${hasVenue() ? venueLabel() : '예시 예식장'}`;

// Preserve each cover's layout and illustration, replacing only its first photo.
export function personalizeCover(html) {
  const photo = getCoverPhoto();
  if (!photo) return html;
  let replaced = false;
  return html.replace(/<img\b[^>]*>/g, tag => {
    if (replaced || tag.includes('couple-illustration.webp')) return tag;
    replaced = true;
    return tag.replace(/\bsrc="[^"]*"/,`src="${escape(photo.src)}"`).replace(/\balt="[^"]*"/,`alt="대표사진"`).replace(/\bwidth="[^"]*"/,`width="${photo.width}"`).replace(/\bheight="[^"]*"/,`height="${photo.height}"`);
  });
}
export function venueDirections() {
  if (!hasVenue()) return '';
  return `<div class="personal-venue"><p class="personal-venue-name">${escape(venueLabel())}</p>${venue.address ? `<p class="personal-venue-address">${escape(venue.address)}</p>` : ''}${venue.mapUrl ? `<a class="personal-map-link" href="${escape(venue.mapUrl)}" target="_blank" rel="noopener noreferrer">지도에서 위치 보기 <span aria-hidden="true">↗</span></a>` : ''}${venue.transport ? `<div><h3>오시는 길</h3><p>${escape(venue.transport)}</p></div>` : ''}${venue.parking ? `<div><h3>주차 안내</h3><p>${escape(venue.parking)}</p></div>` : ''}</div>`;
}
