import { TEMPLATES } from './catalog.mjs?v=20260915-venue-map';

// Viewing treatments reuse catalog IDs and never enter saved selections.
const treatments = [
  { id: 'magazine', title: '한 장씩, 우리의 매거진', subtitle: '사진과 인터뷰를 넘기는 한 권', symbol: 'Aa', mood: 'paper', hint: '지면을 넘기며 읽는 우리 이야기' },
  { id: 'film', title: '빛으로 이어지는 장면', subtitle: '셔터 사이로 현상되는 사진', symbol: '◧', mood: 'night', hint: '스크롤로 열리는 셔터와 사진 현상' },
  { id: 'greenhouse', title: '마음이 피어나는 정원', subtitle: '꽃처럼 열리는 초대의 순간', symbol: '✿', mood: 'garden', hint: '꽃처럼 펼쳐지는 장면과 계절 선택' },
  { id: 'scrapbook', title: '우리의 종이 추억장', subtitle: '기억을 한 장씩 꺼내보는 시간', symbol: '▱', mood: 'rose', hint: '종이를 넘기며 만나는 사진과 스티커' },
  { id: 'constellation', title: '별빛 사이로, 너에게', subtitle: '두 사람의 밤하늘을 지나는 초대', symbol: '✦', mood: 'night', hint: '별빛의 깊이를 따라 이어지는 우리' },
  { id: 'envelope', title: '당신에게 도착한 편지', subtitle: '접힌 마음을 차례로 펼치는 초대', symbol: '✉', mood: 'paper', hint: '들어 올린 편지처럼 펼쳐지는 장면' },
  { id: 'promenade', title: '같은 길 위의 우리', subtitle: '옆으로 이어지는 둘만의 산책', symbol: '↝', mood: 'sky', hint: '옆으로 이어지는 장면과 그려지는 길' },
  { id: 'vinyl', title: '우리의 날들을 한 바퀴', subtitle: '음반과 함께 이어지는 앨범 속 이야기', symbol: '◎', mood: 'paper', hint: '음반이 돌며 이어지는 두 사람의 앨범' },
  { id: 'museum', title: '두 사람의 전시실 안으로', subtitle: '액자 너머로 이어지는 작은 전시', symbol: '▣', mood: 'paper', hint: '전시실의 벽을 돌아 만나는 우리의 순간' },
  { id: 'festival', title: '우리의 다음 무대로', subtitle: '포스터가 오르며 시작되는 하루의 축제', symbol: '✳', mood: 'rose', hint: '무대가 오르듯 펼쳐지는 우리의 페스티벌' },
];

// Every valid template has a reading treatment, including newly added editions.
export const SCROLL_DESIGNS = Object.freeze(TEMPLATES.map(template => Object.freeze({
  id: template.id, title: template.name, subtitle: template.description,
  symbol: '↕', mood: 'paper', hint: template.experienceHint || '한 장씩 펼쳐 읽는 두 사람의 초대',
  ...treatments.find(treatment => treatment.id === template.id),
})));

export const getScrollDesign = id => SCROLL_DESIGNS.find(design => design.id === id) || null;
export const supportsScrollStory = id => !!getScrollDesign(id);

// State-bearing wrappers remain in place so their native experiences keep working.
const containers = ['pe-edition', 'env-enclosures', 'cs-warm-wishes', 'ticket-document'];
const decorations = ['env-postal-header', 'cs-edition', 'ticket-masthead'];
export function collectStoryNodes(root) {
  if (!root) return [];
  return [...root.children].flatMap(node => {
    if (decorations.some(name => node.classList.contains(name))) return [];
    return containers.some(name => node.classList.contains(name)) ? collectStoryNodes(node) : [node];
  });
}

export function storySceneKey(node, index) {
  if (node.matches('.ticket-editorial-hero')) return 'journey';
  if (node.matches('.cover') || node.querySelector('.cover')) return 'cover';
  if (node.matches('.cs-scenes')) return 'moments';
  if (node.matches('.ed-film-darkroom')) return 'darkroom';
  if (node.matches('.ed-museum-exhibition')) return 'exhibition';
  if (node.querySelector('.invitation-ending') || node.matches('.invitation-ending') || /ending|last-page|finale/.test(node.className)) return 'ending';
  return node.dataset.section || node.querySelector('[data-section]')?.dataset.section || `scene-${index}`;
}

export const STORY_LABELS = Object.freeze({ cover: '이야기의 시작', greeting: '당신에게 보내는 초대', story: '우리라는 이야기', date: '함께할 그날', gallery: '우리의 순간들', directions: '오시는 길', accounts: '감사의 마음', rsvp: '함께해 주세요', guestbook: '축하의 한마디', ending: '오래도록, 함께', moments: '우리의 세 가지 계절', darkroom: '사진을 빛으로 현상해요', exhibition: '두 사람의 작은 전시실', journey: '우리라는 여정의 시작', promise: '오래도록 지킬 약속', 'garden-promise': '당신을 기다리는 정원' });
