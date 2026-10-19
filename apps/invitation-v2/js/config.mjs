export const wedding = Object.freeze({
  title: '성우와 소희, 결혼합니다',
  groom: '성우',
  bride: '소희',
  startsAt: '2027-03-06T15:30:00+09:00',
  endsAt: null,
  canonicalUrl: 'https://castlerain.github.io/sungso/invitation-v2/',
  venue: '부산 목화웨딩홀',
  venueSearchName: '목화웨딩컨벤션',
  room: '15층 벨리스홀',
  address: '부산광역시 연제구 중앙대로 1125 시티타워',
  timezone: 'Asia/Seoul',
  map: { timestamp: '1792422272379', key: '3jhadz839rm' },
});

// Add only confirmed details. Empty accounts are omitted from the guest page.
// Parent entries are optional; remove any entry that should not be shared.
export const accountGroups = [
  { id: 'groom', label: '신랑 측', accounts: [
    { relation: '신랑', holder: '성우', bank: '', number: '' },
    { relation: '아버지', holder: '', bank: '', number: '' },
    { relation: '어머니', holder: '', bank: '', number: '' },
  ] },
  { id: 'bride', label: '신부 측', accounts: [
    { relation: '신부', holder: '소희', bank: '', number: '' },
    { relation: '아버지', holder: '', bank: '', number: '' },
    { relation: '어머니', holder: '', bank: '', number: '' },
  ] },
];

export const music = Object.freeze({ title: '하늘빛 약속', description: '잔잔한 피아노', src: null, volume: 0.35 });

export const photos = Object.freeze([
  { id: 'sea', src: './assets/photos/sea-1440.webp', thumb: './assets/photos/sea-640.webp', width: 1440, height: 2159, alt: '푸른 바다 앞에서 빨간 하트 풍선을 들고 마주 보는 성우와 소희' },
  { id: 'bouquet', src: './assets/photos/bouquet-1440.webp', thumb: './assets/photos/bouquet-640.webp', width: 1440, height: 2159, alt: '작은 꽃다발을 사이에 두고 서로를 바라보는 두 사람' },
  { id: 'promise', src: './assets/photos/promise-1440.webp', thumb: './assets/photos/promise-640.webp', width: 1440, height: 2159, alt: '색색의 꽃다발 옆에서 다정하게 손을 포개는 두 사람' },
  { id: 'date', src: './assets/photos/date-1440.webp', thumb: './assets/photos/date-640.webp', width: 1440, height: 2159, alt: '나무 아래에서 결혼 날짜 0306 풍선을 함께 들고 있는 두 사람' },
  { id: 'walk', src: './assets/photos/walk-1440.webp', thumb: './assets/photos/walk-640.webp', width: 1440, height: 2159, alt: '햇살이 비치는 골목에서 손을 잡고 나란히 걷는 두 사람의 뒷모습' },
]);
