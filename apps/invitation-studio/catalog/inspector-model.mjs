/** Editor navigation only. Never copies values, URLs, or DOM selectors from preview messages. */
const SCENES = new Map([
  ['top', { key: 'cover', label: '첫 화면', contentKey: 'family' }],
  ['invitation', { key: 'intro', label: '초대글 · 가족 소개', contentKey: 'invitation' }],
  ['wedding-day', { key: 'date', label: '예식 날짜' }],
  ['location', { key: 'arrival', label: '오시는 길' }],
  ['our-story', { key: 'story', label: '우리의 이야기', contentKey: 'story1' }],
  ['gallery', { key: 'album', label: '사진첩', contentKey: 'photos' }],
  ['accounts', { key: 'gifting', label: '마음 전하실 곳' }],
  ['guestbook', { key: 'wishes', label: '축하의 편지' }],
  ['closing', { key: 'ending', label: '마지막 장면', contentKey: 'closing' }],
  ['navigation', { key: 'navigation', label: '빠른 메뉴' }],
]);
// Kept independent of source/build relative paths; tests assert parity with OPTIONAL_SECTIONS.
const OPTIONAL = new Map([
  ['day-pass', { key: 'dayPass', label: '당일 안내 패스' }],
  ['guest-guide', { key: 'guestGuide', label: '하객 안내' }],
  ['day-checklist', { key: 'checklist', label: '당일 체크리스트' }],
  ['keepsake', { key: 'keepsake', label: '간직하는 초대' }],
  ['promises', { key: 'promiseStyle', label: '우리의 약속' }],
  ['couple-notes', { key: 'noteStyle', label: '우리의 한 문장' }],
  ['thank-you', { key: 'thanksStyle', label: '감사 인사' }],
]);
const BASE_ORDER = ['invitation', 'wedding-day', 'location', 'our-story', 'gallery', 'accounts', 'guestbook'];
const GLOBAL = [
  ['palette', '색감', 'invitation'], ['font', '글씨체', 'invitation'],
  ['textSize', '글자 크기', 'invitation'], ['lineSpace', '문장 사이 여유', 'invitation'],
  ['photoTone', '사진의 색감', 'gallery'], ['motion', '공통 스크롤 효과', 'invitation'],
  ['spacing', '읽는 여백', 'invitation'], ['divider', '장면 사이의 연결', 'invitation'],
];
const DETAILS = new Map([
  ['coverFocus', { label: '표지 사진 구도', section: 'top' }],
  ['opening', { label: '첫 손글씨', section: 'top' }],
  ['calendarMark', { label: '달력의 날짜 표시', section: 'wedding-day' }],
  ['albumColumns', { label: '사진첩 한 줄의 사진', section: 'gallery' }],
  ['albumRatio', { label: '사진첩 사진 비율', section: 'gallery' }],
]);
const CONTENT = [
  ['family', '두 사람 · 가족', 'invitation'], ['invitation', '초대 문구', 'invitation'],
  ['story1', '이야기 첫 장', 'our-story'], ['story2', '이야기 두 번째 장', 'our-story'],
  ['story3', '이야기 마지막 장', 'our-story'], ['closing', '마지막 인사', 'closing'],
  ['photos', '시안 사진', 'gallery'],
];

/** Returns a fresh trusted destination, or null for unknown/disabled scenes. */
export function sceneEditorTarget(section, composition = {}) {
  if (typeof section !== 'string') return null;
  const value = SCENES.get(section);
  if (value) return { section, ...value };
  const optional = OPTIONAL.get(section);
  if (!optional || !Array.isArray(composition?.extras) || !composition.extras.includes(section)) return null;
  return { section, ...optional };
}

/** Scene identity, including the dock itself (rather than its demonstration scroll target). */
export function choiceSection(key) {
  if (typeof key !== 'string') return null;
  for (const [section, value] of [...SCENES, ...OPTIONAL]) if (value.key === key) return section;
  if (DETAILS.has(key)) return DETAILS.get(key).section;
  return GLOBAL.find(([choice]) => choice === key)?.[2] || null;
}

/** Native select groups. Stable values stay editor-owned; labels never come from messages. */
export function inspectorJumpGroups(composition = {}) {
  const groups = [{ label: '전체 분위기', items: GLOBAL.map(([key, label, section]) => ({ tab: 'style', key, label, section })) }];
  const scenes = [], seen = new Set();
  function add(section) {
    const target = sceneEditorTarget(section, composition);
    if (!target || seen.has(section)) return;
    seen.add(section); scenes.push({ tab: 'scenes', ...target });
    const detailKeys = section === 'top' ? ['coverFocus', 'opening'] : section === 'wedding-day' ? ['calendarMark'] : section === 'gallery' && ['grid', 'masonry'].includes(composition?.album) ? ['albumColumns', 'albumRatio'] : [];
    for (const key of detailKeys) scenes.push({ tab: 'scenes', key, ...DETAILS.get(key) });
  }
  add('top');
  const order = Array.isArray(composition?.order) ? composition.order : BASE_ORDER;
  for (const section of [...order, ...BASE_ORDER]) if (BASE_ORDER.includes(section) || OPTIONAL.has(section)) add(section);
  // A malformed/incomplete local order cannot hide an explicitly enabled option.
  for (const section of Array.isArray(composition?.extras) ? composition.extras : []) if (OPTIONAL.has(section)) add(section);
  add('closing'); add('navigation');
  groups.push({ label: '장면·순서', items: scenes });
  groups.push({ label: '문구·사진', items: CONTENT.map(([key, label, section]) => ({ tab: 'content', key, label, section })) });
  return groups;
}
