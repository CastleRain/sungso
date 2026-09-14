import { EDITIONS } from './edition-catalog.mjs?v=20260914-scroll-editions';
const palette = (id, name, paper, ink, accent, soft) => ({ id, name, paper, ink, accent, soft });

export const TEMPLATES = [
  { collection: 'classic', id: 'minimal', name: '단정한 청첩장', english: 'Quiet promise', number: '01', mood: '담백한 · 정갈한', description: '여백 사이에, 가장 소중한 말만.', photoHint: '차분한 세로 사진 1장과 갤러리 사진', galleryLayout: 'grid', palettes: [palette('ivory', '아이보리', '#fbf8f1', '#403c35', '#86734e', '#eeeadf'), palette('blush', '블러시', '#fcf2f1', '#654a4c', '#a36d76', '#f1e1e2'), palette('gray', '그레이', '#f2f3f2', '#3e4543', '#667b72', '#e2e6e3')] },
  { collection: 'classic', id: 'photo', name: '우리의 화보', english: 'All about us', number: '02', mood: '자연스러운 · 시원한', description: '한 장의 사진으로 시작하는 우리의 날.', photoHint: '인물 위에 여백이 있는 세로 사진', galleryLayout: 'slide', palettes: [palette('natural', '내추럴', '#f7f8f3', '#263c33', '#52745d', '#e4eadf'), palette('warm', '웜톤', '#faf3e9', '#513e31', '#9d7351', '#eee1ce'), palette('mono', '모노', '#f8f8f8', '#282828', '#666666', '#e8e8e8')] },
  { collection: 'classic', id: 'garden', name: '봄날의 정원', english: 'A day in bloom', number: '03', mood: '싱그러운 · 로맨틱', description: '꽃이 피는 계절, 함께 피어나는 마음.', photoHint: '야외·정원에서 찍은 밝은 사진', galleryLayout: 'grid', palettes: [palette('sage', '세이지', '#f3f5ec', '#40533d', '#718064', '#e2e8d7'), palette('cream', '크림', '#fbf7e9', '#635d40', '#918658', '#eee7ca'), palette('peach', '피치', '#fff3e9', '#6c5045', '#af8066', '#f3dfcb')] },
  { collection: 'classic', id: 'letter', name: '너에게 보내는 편지', english: 'Dear, our beloved', number: '04', mood: '따뜻한 · 빈티지', description: '오래 간직하고 싶은 한 통의 초대.', photoHint: '일상 사진도 잘 어울리는 편지형', galleryLayout: 'grid', palettes: [palette('parchment', '파치먼트', '#f3ead9', '#594838', '#98634f', '#e8d8bf'), palette('cream', '크림', '#faf5e9', '#554c3d', '#9a8461', '#ece3d0'), palette('rose', '로즈', '#f5e9e5', '#624648', '#a3696d', '#ead5d1')] },
  { collection: 'classic', id: 'sketch', name: '우리 둘의 그림', english: 'Drawn to you', number: '05', mood: '다정한 · 사랑스러운', description: '서툴러도 다정하게, 우리다운 한 페이지.', photoHint: '사진 없는 표지 + 원하는 갤러리 사진', galleryLayout: 'grid', palettes: [palette('cream', '크림', '#fffbef', '#464f74', '#737da5', '#f0ebd8'), palette('sky', '스카이', '#eff6fb', '#425b78', '#718fa8', '#dce9f1'), palette('pink', '핑크', '#fff1f3', '#755266', '#b17890', '#f2dee5')] },
  { collection: 'classic', id: 'cinema', name: '우리라는 영화', english: 'Our forever film', number: '06', mood: '깊이 있는 · 영화 같은', description: '모든 장면의 끝에, 늘 너와 내가.', photoHint: '빛과 그림자가 있는 사진 · 흑백도 좋아요', galleryLayout: 'filmstrip', palettes: [palette('charcoal', '차콜', '#252825', '#f0eee5', '#c3b590', '#343a34'), palette('midnight', '미드나이트', '#222b37', '#edf0f5', '#a6b5cc', '#303d4d'), palette('burgundy', '버건디', '#3c282c', '#f6eae5', '#ceaca0', '#50373d')] },
  { collection: 'special', id: 'envelope', name: '봉투 속 초대', english: 'Sealed with love', number: '07', mood: '설레는 · 입체적인', description: '봉인을 열면, 우리 마음이 천천히 펼쳐져요.', experienceHint: '봉인을 눌러 편지 열기', photoHint: '봉투 안에 담길 세로 사진 1장', galleryLayout: 'grid', palettes: [palette('wax', '왁스 크림', '#f7efe3', '#62443c', '#a3634b', '#e9d4c2'), palette('rose', '로즈', '#faeeed', '#6e4551', '#ad6b7c', '#eed6da'), palette('olive', '올리브', '#f2f1e4', '#4e553d', '#7a8256', '#e2e2c8')] },
  { collection: 'special', id: 'constellation', name: '우리의 별자리', english: 'Written in the stars', number: '08', mood: '몽환적인 · 반짝이는', description: '작은 별을 하나씩 이어, 우리의 밤하늘을 만들어요.', experienceHint: '다섯 별을 눌러 별자리 잇기', photoHint: '밤하늘 속에 나타날 커플 사진', galleryLayout: 'slide', palettes: [palette('indigo', '인디고', '#141c35', '#f2eee5', '#d8bf84', '#232e4b'), palette('plum', '플럼', '#2e2039', '#f7ecf5', '#d3add2', '#45314f'), palette('teal', '딥 틸', '#153138', '#edf5ec', '#a5c9b4', '#23464b')] },
  { collection: 'special', id: 'camera', name: '찰칵, 우리의 순간', english: 'A moment to keep', number: '09', mood: '경쾌한 · 아날로그', description: '셔터를 누르면 오늘의 사진이 한 장씩 나와요.', experienceHint: '셔터를 눌러 즉석사진 꺼내기', photoHint: '같은 커플의 서로 다른 사진 3장', galleryLayout: 'filmstrip', palettes: [palette('butter', '버터', '#f4eacb', '#313b36', '#678a77', '#e5d7b8'), palette('lavender', '라벤더', '#efebf7', '#48445d', '#8574a5', '#ddd5ea'), palette('mint', '민트', '#edf5e9', '#335146', '#6c9785', '#d8e8d3')] },
  { collection: 'special', id: 'storybook', name: '펼치면, 우리', english: 'Our next chapter', number: '10', mood: '동화 같은 · 다정한', description: '책을 펼치면, 종이 정원 속 우리의 이야기가 시작돼요.', experienceHint: '책을 눌러 입체 장면 펼치기', photoHint: '종이 무대에 담길 커플 사진', galleryLayout: 'grid', palettes: [palette('forest', '포레스트', '#f4eee0', '#364c3f', '#7b8c5c', '#e3ddc9'), palette('apricot', '살구', '#fff1df', '#75533f', '#b08359', '#f0dbc2'), palette('lilac', '라일락', '#f4eef7', '#5c4b70', '#9b81b1', '#e6d9ed')] },
  { collection: 'special', id: 'ticket', name: '둘만의 탑승권', english: 'A one-way trip to us', number: '11', mood: '모험 같은 · 그래픽', description: '우리라는 목적지로, 함께 떠나는 편도 여행.', experienceHint: '탑승권을 뜯고 결혼 도장 찍기', photoHint: '여행의 한 장면 같은 커플 사진', galleryLayout: 'filmstrip', palettes: [palette('ocean', '오션', '#f1f3ea', '#284c50', '#468084', '#d9e4db'), palette('sunset', '선셋', '#fff1e5', '#6a4639', '#ba7958', '#f1dbca'), palette('cobalt', '코발트', '#eef1fa', '#344b72', '#617fb5', '#dbe2f3')] },
  { collection: 'special', id: 'curtain', name: '우리의 첫 장면', english: 'The night is ours', number: '12', mood: '극적인 · 우아한', description: '막이 오르는 순간, 당신을 위한 초대가 시작돼요.', experienceHint: '커튼을 열어 첫 장면 만나기', photoHint: '스포트라이트 속 세로 커플 사진', galleryLayout: 'slide', palettes: [palette('velvet', '벨벳', '#341a24', '#fcf1db', '#d0a56c', '#512d39'), palette('emerald', '에메랄드', '#19342d', '#f2efda', '#bbbd81', '#2c4d42'), palette('navy', '네이비', '#1d2940', '#f4f0e6', '#b5bfd2', '#303f58')] },
];

TEMPLATES.push(...EDITIONS);
export const COLLECTIONS = {
  immersive: { name: '새로운 이야기', title: '한 장을 넘어, 하나의 이야기', english: 'THE STORY EDITIONS', description: '잡지부터 음반, 전시와 축제까지. 끝까지 서로 다른 구성을 만나보세요.' },
  special: { name: '손으로 여는 초대', title: '직접 열어보는 초대', english: 'THE PLAYFUL COLLECTION', description: '봉투·별자리·탑승권의 전체 이야기와 사진·책·커튼의 오프닝.' },
  classic: { name: '사진과 여백', title: '오래 보아도 좋은 초대', english: 'THE CLASSIC COLLECTION', description: '여백과 사진, 서체로 전하는 담백한 초대.' },
};

export const PEOPLE = { sungwoo: '성우', sohee: '소희' };
export const SIGNATURES = Object.freeze({
  envelope: { label: 'PAPER ATELIER', title: '손끝에 닿는 초대', description: '봉투를 열고, 접힌 편지와 사진을 한 장씩.', features: '입체 봉투 · 펼치는 편지 · 페이퍼 화보', sections: { story: true } },
  constellation: { label: 'AFTER THE STARS', title: '별빛으로 쓰는 이야기', description: '우리의 별자리를 잇고, 세 장면의 밤을 건너요.', features: '별자리 잇기 · 장면 선택 · 밤하늘 화보', sections: { story: true } },
  ticket: { label: 'DESTINATION: US', title: '함께 떠나는 우리의 날', description: '초대부터 도착까지, 한 장의 여행처럼.', features: '탑승 도장 · 하객 여정 · 참석 티켓 체험', sections: { story: true, rsvp: true } },
});
export const GALLERIES = { grid: '격자', slide: '슬라이드', filmstrip: '필름 스트립' };
export const SECTIONS = { story: '우리 이야기', gallery: '갤러리', directions: '오시는 길', accounts: '마음 전하실 곳', rsvp: '참석 여부', guestbook: '방명록' };
export const DEFAULT_SECTIONS = { story: false, gallery: true, directions: true, accounts: true, rsvp: false, guestbook: false };
export const PHOTOS = [
  { src: './assets/couple-garden.webp', alt: '정원에서 손을 잡은 가상 커플의 웨딩 예시 사진' },
  { src: './assets/couple-walk.webp', alt: '함께 걸으며 웃는 가상 커플의 웨딩 예시 사진' },
  { src: './assets/couple-close.webp', alt: '서로를 바라보는 가상 커플의 웨딩 예시 사진' },
];
export const getTemplate = id => TEMPLATES.find(template => template.id === id);
