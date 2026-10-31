import {DEFAULT_COMPOSITION, normalizeComposition} from './js/composition.mjs';

const preset = (id, label, detail, changes) => Object.freeze({id, label, detail, composition:Object.freeze(normalizeComposition({...DEFAULT_COMPOSITION,...changes}))});
// Visual recipes only: applying one keeps all edited copy, photos and live data.
export const V2_PRESETS = Object.freeze([
  preset('v2-balance', 'V2 · 우리다운 균형', '지금의 안개 블루와 손글씨. 사진첩 앞의 짧은 나비 선, 한 컷씩 넘기는 필름을 더했어요.', {album:'film',divider:'breath',motion:'signature',order:['invitation','wedding-day','location','gallery','our-story','accounts','guestbook']}),
  preset('v2-cafe', 'V2 · 작은 카페 초대', '영수증형 당일 안내 · 필름 사진첩 · 인화지에 담긴 축하. 공통 스크롤은 더하지 않아 담백해요.', {album:'film',wishes:'polaroid',dayPass:'receipt',extras:['day-pass'],cover:'curtain',motion:'signature',spacing:'compact',order:['invitation','wedding-day','location','day-pass','gallery','our-story','accounts','guestbook']}),
  preset('v2-comfort', 'V2 · 편안하게 읽는 초대', '또렷한 모던 글씨와 조금 큰 본문. 날짜와 오시는 길을 먼저, 스크롤 연출은 쉬어 가요.', {font:'modern',textSize:'comfortable',textScale:1.1,lineScale:1.1,album:'grid',albumColumns:'two',motion:'still',wishes:'notebook',calendarMark:'underline',order:['invitation','wedding-day','location','gallery','our-story','accounts','guestbook']}),
]);
