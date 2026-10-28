/** Only visual choices may cross the editor/preview boundary. Never accepts data mode or URLs. */
export const ORDER_SECTIONS = Object.freeze([
  { id: 'invitation', label: '초대글 · 가족 소개' },
  { id: 'wedding-day', label: '예식 날짜' },
  { id: 'location', label: '오시는 길' },
  { id: 'our-story', label: '우리의 이야기' },
  { id: 'gallery', label: '사진첩' },
  { id: 'accounts', label: '마음 전하실 곳' },
  { id: 'guestbook', label: '축하의 편지' },
].map(section => Object.freeze(section)));
export const DEFAULT_ORDER = Object.freeze(ORDER_SECTIONS.map(section => section.id));
export const DEFAULT_COMPOSITION = Object.freeze({ palette: 'mist', font: 'letter', motion: 'signature', cover: 'cinema', opening: 'ink', intro: 'letter', date: 'ticket', story: 'chapters', album: 'stack', arrival: 'unfold', gifting: 'card', wishes: 'envelope', navigation: 'dock', order: DEFAULT_ORDER });
export const CHOICES = Object.freeze({
  palette: Object.freeze([
    { id: 'mist', label: '안개 블루', detail: '지금의 차분한 블루와 맑은 종이색을 유지해요.', source: 'ORIGINAL · 색감' },
    { id: 'azure', label: '맑은 블루', detail: '깨끗한 화이트에 조금 더 선명한 파랑을 더해요.', source: 'BLUE · 색감' },
    { id: 'rose', label: '은은한 로즈', detail: '하얀 종이에 조용한 장밋빛을 살짝 담아요.', source: 'ROSE · 색감' },
    { id: 'midnight', label: '밤빛 네이비', detail: '밝은 바탕과 깊은 남색으로 또렷하게 보여요.', source: 'NAVY · 색감' },
  ]),
  font: Object.freeze([
    { id: 'letter', label: '단정한 편지', detail: '부드러운 리디바탕 본문과 또렷한 함렛 제목.', source: 'ORIGINAL · 글씨체' },
    { id: 'editorial', label: '또렷한 세리프', detail: '함렛의 단단한 획으로 이름과 문장을 선명하게.', source: 'SERIF · 글씨체' },
    { id: 'modern', label: '가벼운 모던', detail: '정돈된 프리텐다드 본문에 기존 손글씨를 함께.', source: 'MODERN · 글씨체' },
  ]),
  motion: Object.freeze([
    { id: 'signature', label: '장면 그대로', detail: '고른 장면의 펼침과 스크롤 연출을 그대로 살려요.', source: 'ORIGINAL · 스크롤' },
    { id: 'rise', label: '살며시 떠오르기', detail: '각 장면에 아래에서 살짝 떠오르는 흐름을 더해요.', source: 'RISE · 스크롤' },
    { id: 'focus', label: '선명해지는 장면', detail: '각 장면에 조금씩 가까워지고 선명해지는 흐름을 더해요.', source: 'FOCUS · 스크롤' },
    { id: 'drift', label: '교차하는 흐름', detail: '양쪽에서 작은 움직임으로 장면이 가운데에 자리 잡아요.', source: 'DRIFT · 스크롤' },
    { id: 'unveil', label: '걷히는 베일', detail: '얇은 베일이 걷히듯 장면이 드러나요.', source: 'UNVEIL · 스크롤' },
    { id: 'breathe', label: '여백으로 스며들기', detail: '조금 가까웠던 장면이 여백 안으로 잔잔하게 자리 잡아요.', source: 'BREATHE · 스크롤' },
    { id: 'still', label: '차분하게 읽기', detail: '스크롤 움직임만 쉬어요. 첫 손글씨와 클릭 동작은 유지돼요.', source: 'STILL · 스크롤' },
  ]),
  cover: Object.freeze([
    { id: 'cinema', label: '시네마 프레임', detail: '가득 찬 사진이 작은 프레임으로 이어져요.', source: 'F · 다듬은 표지' },
    { id: 'curtain', label: '빛의 커튼', detail: '양쪽으로 빛이 걷히며 두 사람을 보여줘요.', source: 'NEW · 표지' },
    { id: 'aperture', label: '열리는 창', detail: '사진 위의 부드러운 창이 넓게 열려요.', source: 'NEW · 표지' },
  ]),
  opening: Object.freeze([
    { id: 'ink', label: '한 획씩 쓰는 편지', detail: '원래의 손글씨를 한 획씩 또렷하게 써 내려가요.', source: 'ORIGINAL · 첫 문구' },
    { id: 'flow', label: '두 줄의 흐름', detail: '두 줄의 손글씨가 부드럽게 흐르며 이어져요.', source: 'NEW · 첫 문구' },
    { id: 'bloom', label: '번지는 잉크', detail: '은은하게 번진 글씨가 맑고 선명하게 맺혀요.', source: 'NEW · 첫 문구' },
    { id: 'light', label: '빛이 지나간 자리', detail: '가는 빛이 지나간 자리에 손글씨가 드러나요.', source: 'NEW · 첫 문구' },
  ]),
  intro: Object.freeze([
    { id: 'letter', label: '펼쳐지는 초대', detail: '한 줄씩 이어지는 초대글과 가족 소개.', source: 'NEW · 초대글' },
    { id: 'together', label: '마주 오는 이름', detail: '서로 다른 쪽에서 이름이 만나 하나가 돼요.', source: 'NEW · 가족 소개' },
    { id: 'ribbon', label: '이어지는 리본', detail: '가는 선이 두 가족의 이야기를 연결해요.', source: 'NEW · 초대글' },
  ]),
  date: Object.freeze([
    { id: 'ticket', label: '우리의 날짜 카드', detail: '날짜와 달력이 한 장으로 자리 잡아요.', source: 'F · 예식 날짜' },
    { id: 'orbit', label: '하루를 감싸는 궤도', detail: '가는 궤도가 예식 날짜를 부드럽게 감싸요.', source: 'NEW · 예식 날짜' },
    { id: 'flip', label: '넘겨지는 날짜', detail: '날짜 면이 살짝 넘어가며 일정을 펼쳐요.', source: 'NEW · 예식 날짜' },
  ]),
  story: Object.freeze([
    { id: 'chapters', label: '세 장의 이야기', detail: '사진 한 장에서 이어지는 간결한 세 챕터.', source: 'F · 이야기' },
    { id: 'line', label: '한 줄로 이어진 우리', detail: '처음부터 오늘까지, 선으로 이어진 장면.', source: 'A · 이야기' },
    { id: 'fold', label: '펼쳐지는 기억', detail: '겹쳐 둔 사진을 펼치듯 기억을 만나요.', source: 'B · 이야기' },
    { id: 'light', label: '빛을 따라 읽는', detail: '부드러운 빛이 이야기 위를 지나가요.', source: 'C · 이야기' },
    { id: 'constellation', label: '우리의 별자리', detail: '세 순간이 하나의 별자리로 이어져요.', source: 'D · 이야기' },
    { id: 'cafe', label: '커피 한 잔의 시작', detail: '커피숍에서 만난 두 사람의 작은 편지.', source: 'E · 이야기' },
  ]),
  album: Object.freeze([
    { id: 'stack', label: '겹쳐지는 사진', detail: '여러 순간이 한 장의 사진첩으로 모여요.', source: 'F · 사진첩' },
    { id: 'contact', label: '펼쳐지는 필름', detail: '사진들이 가볍게 펼쳐지고 한 장을 골라요.', source: 'G · 사진첩' },
    { id: 'grid', label: '한눈에 보는 사진첩', detail: '모든 순간을 차분한 격자로 살펴봐요.', source: 'VER6 · 사진첩' },
  ]),
  arrival: Object.freeze([
    { id: 'unfold', label: '펼쳐지는 약도', detail: '접어 둔 약도를 펼치고 교통편을 골라요.', source: 'ORIGINAL · 오시는 길' },
    { id: 'itinerary', label: '한 줄의 도착 여정', detail: '가는 경로선과 정돈된 안내를 따라 도착해요.', source: 'JOURNEY · 오시는 길' },
    { id: 'postcard', label: '부산에서 온 엽서', detail: '엽서 한 장에 장소와 지도를 함께 담아요.', source: 'POSTCARD · 오시는 길' },
  ]),
  gifting: Object.freeze([
    { id: 'card', label: '받는 분의 카드', detail: '양가와 받는 분을 고르면 한 장의 카드가 바뀌어요.', source: 'ORIGINAL · 마음 전하실 곳' },
    { id: 'ledger', label: '단정한 한 줄', detail: '가벼운 선과 또렷한 계좌 정보로 간결하게 전해요.', source: 'LINE · 마음 전하실 곳' },
    { id: 'letter', label: '마음을 담은 편지', detail: '편지지 위에 받는 분과 계좌를 차분히 펼쳐요.', source: 'LETTER · 마음 전하실 곳' },
  ]),
  wishes: Object.freeze([
    { id: 'envelope', label: '열어 보는 봉투', detail: '봉투를 열고 축하의 편지를 남겨요.', source: 'ORIGINAL · 방명록' },
    { id: 'postcard', label: '축하의 엽서', detail: '한 장의 엽서에서 짧은 인사를 시작해요.', source: 'POSTCARD · 방명록' },
    { id: 'notebook', label: '우리의 축하 노트', detail: '노트에 한 줄을 남기듯 두 사람에게 마음을 전해요.', source: 'NOTEBOOK · 방명록' },
  ]),
  navigation: Object.freeze([
    { id: 'dock', label: '현재 장면의 메뉴', detail: '지금 읽는 위치를 표시하는 익숙한 하단 메뉴.', source: 'ORIGINAL · 빠른 메뉴' },
    { id: 'ribbon', label: '가느다란 길잡이', detail: '종이 끝의 리본처럼 얇고 넓게 이어지는 메뉴.', source: 'RIBBON · 빠른 메뉴' },
    { id: 'compact', label: '작은 책갈피', detail: '간격을 모은 작은 메뉴로 읽는 흐름을 가볍게.', source: 'BOOKMARK · 빠른 메뉴' },
  ]),
});
export const CHOICE_KEYS = Object.freeze(Object.keys(CHOICES));
export const PRESETS = Object.freeze([
  { id: 'flow', label: '01 · 잔잔하게 이어지는', detail: '기존 F의 분위기에서 새 초대글을 더했어요.', composition: DEFAULT_COMPOSITION },
  { id: 'light', label: '02 · 빛이 열리는', detail: '빛으로 드러나는 손글씨와 커튼, 둥근 날짜의 조합.', composition: Object.freeze({ ...DEFAULT_COMPOSITION, cover: 'curtain', opening: 'light', intro: 'together', date: 'orbit', story: 'line', album: 'contact' }) },
  { id: 'letter', label: '03 · 우리의 작은 영화', detail: '흐르는 손글씨와 열리는 창, 커피 한 잔의 이야기.', composition: Object.freeze({ ...DEFAULT_COMPOSITION, cover: 'aperture', opening: 'flow', intro: 'ribbon', date: 'flip', story: 'cafe', album: 'stack' }) },
]);
export const SECTION_IDS = Object.freeze({ palette: 'invitation', font: 'invitation', motion: 'invitation', cover: 'top', opening: 'top', intro: 'invitation', date: 'wedding-day', story: 'our-story', album: 'gallery', arrival: 'location', gifting: 'accounts', wishes: 'guestbook', navigation: 'location' });
/** Every required section occurs once. Cover and closing never enter the movable list. */
export function normalizeOrder(input) {
  const values = typeof input === 'string' ? input.slice(0, 512).split(',') : Array.isArray(input) ? input.slice(0, 64) : [];
  const selected = values.filter(value => typeof value === 'string' && DEFAULT_ORDER.includes(value));
  return [...new Set([...selected, ...DEFAULT_ORDER])];
}
export function moveSection(input, section, position) {
  const order = normalizeOrder(input);
  if (!DEFAULT_ORDER.includes(section) || !Number.isInteger(position) || position < 0 || position >= order.length) return order;
  order.splice(order.indexOf(section), 1); order.splice(position, 0, section); return order;
}
export function normalizeComposition(input) {
  const result = { ...DEFAULT_COMPOSITION, order: [...DEFAULT_ORDER] };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  if (Object.hasOwn(input, 'version') && String(input.version) !== '1') return result;
  const candidate = Object.hasOwn(input, 'composition') && input.composition && typeof input.composition === 'object' && !Array.isArray(input.composition) ? input.composition : input;
  for (const key of CHOICE_KEYS) {
    if (Object.hasOwn(candidate, key) && typeof candidate[key] === 'string' && CHOICES[key].some(choice => choice.id === candidate[key])) result[key] = candidate[key];
  }
  if (Object.hasOwn(candidate, 'order')) result.order = normalizeOrder(candidate.order);
  return result;
}
export function readComposition(search = '') {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(typeof search === 'string' ? search.slice(0, 2048) : '');
  return normalizeComposition(Object.fromEntries(params));
}
export function compositionParams(input) {
  const result = normalizeComposition(input);
  return new URLSearchParams({ version: '1', ...result, order: result.order.join(',') });
}
export function sameComposition(left, right) {
  return CHOICE_KEYS.every(key => left?.[key] === right?.[key]) && Array.isArray(left?.order) && Array.isArray(right?.order) && left.order.length === right.order.length && left.order.every((id, index) => id === right.order[index]);
}
