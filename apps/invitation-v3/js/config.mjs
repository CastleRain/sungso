import { defaultPhotos } from '../../../shared/invitation/album-core.mjs?v=3.4.0';
export const wedding = Object.freeze({
  title: '성우와 소희, 결혼합니다', groom: '성우', bride: '소희',
  startsAt: '2027-03-06T15:30:00+09:00', endsAt: null, timezone: 'Asia/Seoul',
  canonicalUrl: 'https://castlerain.github.io/sungso/invitation-v3/',
  venue: '부산 목화웨딩홀', venueSearchName: '목화웨딩컨벤션', room: '15층 벨리스홀',
  address: '부산광역시 연제구 중앙대로 1125 시티타워', phone: '051-714-2243',
  map: { timestamp: '1792422272379', key: '3jhadz839rm' },
});
export const content = Object.freeze({
  invitation: ['3월 6일, 저희 결혼식에 초대합니다.', '함께해 주시면 정말 기쁠 것 같아요.', '그날, 반가운 얼굴로 만나요.'],
  ourStory: {
    meeting: { title: '처음 마주한 곳은, 커피숍.', text: '소개로 만난 저희의 첫 만남은 커피숍이었어요.' },
    quote: ['이 사람이랑은', '뭘 해도 되겠다.'],
    byline: '성우의 이야기',
    paragraphs: [
      '소희가 카페를 운영하는 모습을 보면서, 이런 생각이 들었어요.',
      '함께하는 미래를 떠올리게 된 건 그때였어요. 그렇게 소희와 결혼하고 싶어졌어요.',
    ],
    closing: '그 마음으로, 이제 결혼합니다.',
  },
  questions: [], // Optional { question, answer }; use only the couple's actual answers.
  promises: [],
  faq: [
    { question: '예식은 몇 층에서 하나요?', answer: '시티타워 15층 벨리스홀입니다. 예식은 오후 3시 30분에 시작해요.' },
    { question: '가까운 지하철역은 어디인가요?', answer: '부산 지하철 1·3호선 연산역 7번 출구 인근입니다. 정확한 도보 경로는 지도 앱에서 확인해 주세요.' },
    { question: '주차·식사 등 이용 안내가 궁금해요.', answer: '예식장 안내를 확인해 주세요. 아래 번호를 누르면 목화웨딩컨벤션으로 연결됩니다.', phone: true },
  ],
});
// User-provided full playlist. An empty source hides the audio controls.
export const music = Object.freeze({
  title: 'Wedding Day', artist: 'NUUM FM', src: './assets/audio/wedding-day.mp3',
  tracks: [
    { startsAt: 0, title: 'Ever After, Us' }, { startsAt: 102, title: 'Just Married!' },
    { startsAt: 192, title: 'Still Falling' }, { startsAt: 334, title: 'Always, Gently' },
    { startsAt: 515, title: 'Still in Bloom' }, { startsAt: 599, title: 'Happily, Right Now' },
    { startsAt: 711, title: 'Just Like Today' }, { startsAt: 907, title: 'Right Here, With You' },
    { startsAt: 1020, title: 'Just a Lovely Moment' }, { startsAt: 1161, title: 'It’s a Lovely Day' },
  ],
});
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
export const photos = defaultPhotos;
