/** Only visual choices may cross the editor/preview boundary. Never accepts data mode or URLs. */
export const DEFAULT_COMPOSITION = Object.freeze({ palette: 'mist', font: 'letter', cover: 'cinema', opening: 'ink', intro: 'letter', date: 'ticket', story: 'chapters', album: 'stack' });
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
});
export const PRESETS = Object.freeze([
  { id: 'flow', label: '01 · 잔잔하게 이어지는', detail: '기존 F의 분위기에서 새 초대글을 더했어요.', composition: DEFAULT_COMPOSITION },
  { id: 'light', label: '02 · 빛이 열리는', detail: '빛으로 드러나는 손글씨와 커튼, 둥근 날짜의 조합.', composition: Object.freeze({ ...DEFAULT_COMPOSITION, cover: 'curtain', opening: 'light', intro: 'together', date: 'orbit', story: 'line', album: 'contact' }) },
  { id: 'letter', label: '03 · 우리의 작은 영화', detail: '흐르는 손글씨와 열리는 창, 커피 한 잔의 이야기.', composition: Object.freeze({ ...DEFAULT_COMPOSITION, cover: 'aperture', opening: 'flow', intro: 'ribbon', date: 'flip', story: 'cafe', album: 'stack' }) },
]);
export const SECTION_IDS = Object.freeze({ palette: 'invitation', font: 'invitation', cover: 'top', opening: 'top', intro: 'invitation', date: 'wedding-day', story: 'our-story', album: 'gallery' });
export function normalizeComposition(input) {
  const result = { ...DEFAULT_COMPOSITION };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  if (Object.hasOwn(input, 'version') && String(input.version) !== '1') return result;
  const candidate = input.composition && typeof input.composition === 'object' && !Array.isArray(input.composition) ? input.composition : input;
  for (const key of Object.keys(result)) {
    if (Object.hasOwn(candidate, key) && typeof candidate[key] === 'string' && CHOICES[key].some(choice => choice.id === candidate[key])) result[key] = candidate[key];
  }
  return result;
}
export function readComposition(search = '') {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(typeof search === 'string' ? search.slice(0, 2048) : '');
  return normalizeComposition(Object.fromEntries(params));
}
export function compositionParams(input) {
  return new URLSearchParams({ version: '1', ...normalizeComposition(input) });
}
export function sameComposition(left, right) {
  return Object.keys(DEFAULT_COMPOSITION).every(key => left?.[key] === right?.[key]);
}
