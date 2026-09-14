// Viewing treatments reuse existing design IDs and never enter saved selections.
export const SCROLL_DESIGNS = Object.freeze([
  { id: 'magazine', title: '한 장씩, 우리의 매거진', subtitle: '사진과 인터뷰를 넘기는 한 권', symbol: 'Aa', mood: 'paper', hint: '지면을 넘기며 읽는 우리 이야기' },
  { id: 'film', title: '빛으로 이어지는 장면', subtitle: '셔터 사이로 현상되는 사진', symbol: '◧', mood: 'night', hint: '스크롤로 열리는 셔터와 사진 현상' },
  { id: 'greenhouse', title: '마음이 피어나는 정원', subtitle: '꽃처럼 열리는 초대의 순간', symbol: '✿', mood: 'garden', hint: '꽃처럼 펼쳐지는 장면과 계절 선택' },
  { id: 'scrapbook', title: '우리의 종이 추억장', subtitle: '기억을 한 장씩 꺼내보는 시간', symbol: '▱', mood: 'rose', hint: '종이를 넘기며 만나는 사진과 스티커' },
  { id: 'constellation', title: '별빛 사이로, 너에게', subtitle: '두 사람의 밤하늘을 지나는 초대', symbol: '✦', mood: 'night', hint: '별빛의 깊이를 따라 이어지는 우리' },
  { id: 'envelope', title: '당신에게 도착한 편지', subtitle: '접힌 마음을 차례로 펼치는 초대', symbol: '✉', mood: 'paper', hint: '들어 올린 편지처럼 펼쳐지는 장면' },
  { id: 'promenade', title: '같은 길 위의 우리', subtitle: '옆으로 이어지는 둘만의 산책', symbol: '↝', mood: 'sky', hint: '옆으로 이어지는 장면과 그려지는 길' },
].map(Object.freeze));

export const getScrollDesign = id => SCROLL_DESIGNS.find(design => design.id === id) || null;
export const supportsScrollStory = id => !!getScrollDesign(id);

// State-bearing wrappers remain in place so their native experiences keep working.
const containers = ['pe-edition', 'env-enclosures', 'cs-warm-wishes'];
const decorations = ['env-postal-header', 'cs-edition'];
export function collectStoryNodes(root) {
  if (!root) return [];
  return [...root.children].flatMap(node => {
    if (decorations.some(name => node.classList.contains(name))) return [];
    return containers.some(name => node.classList.contains(name)) ? collectStoryNodes(node) : [node];
  });
}

export function storySceneKey(node, index) {
  if (node.matches('.cover') || node.querySelector('.cover')) return 'cover';
  if (node.matches('.cs-scenes')) return 'moments';
  if (node.matches('.ed-film-darkroom')) return 'darkroom';
  if (node.querySelector('.invitation-ending') || node.matches('.invitation-ending') || /ending|last-page|finale/.test(node.className)) return 'ending';
  return node.dataset.section || node.querySelector('[data-section]')?.dataset.section || `scene-${index}`;
}

export const STORY_LABELS = Object.freeze({ cover: '이야기의 시작', greeting: '당신에게 보내는 초대', story: '우리라는 이야기', date: '함께할 그날', gallery: '우리의 순간들', directions: '오시는 길', accounts: '감사의 마음', rsvp: '함께해 주세요', guestbook: '축하의 한마디', ending: '오래도록, 함께', moments: '우리의 세 가지 계절', darkroom: '사진을 빛으로 현상해요' });
