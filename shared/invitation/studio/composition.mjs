import { normalizeFineTuning, normalizeSectionTuning } from './fine-tuning.mjs';
/** Only visual choices may cross the editor/preview boundary. Never accepts data mode or URLs. */
export const OPTIONAL_SECTIONS = Object.freeze([
  {id:'couple-profile',label:'두 사람 소개 · 인터뷰',key:'profileStyle',detail:'직접 적은 일문일답과 사진을 넘겨 봐요.',group:'sentiment'},
  {id:'wedding-quiz',label:'우리의 작은 퀴즈',key:'quizStyle',detail:'두 사람이 적은 질문과 답으로 함께해요.',group:'sentiment'},
  {id:'busan-guide',label:'두 사람이 추천하는 부산',key:'busanStyle',detail:'직접 추천한 장소와 지도 링크를 모아요.',group:'utility'},
  {id:'playlist',label:'우리의 플레이리스트',key:'playlistStyle',detail:'직접 준비한 음악과 공식 링크를 함께 들어요.',group:'sentiment'},
  {id:'time-machine',label:'그때와 지금',key:'portraitStyle',detail:'두 장의 사진을 슬라이더로 겹쳐 봐요.',group:'sentiment'},
  { id: 'day-pass', label: '당일 안내 패스', key: 'dayPass', detail: '시간·층·주소와 길찾기를 한 장에서 바로 확인해요.', group: 'utility' },
  { id: 'guest-guide', label: '하객 안내', key: 'guestGuide', detail: '교통과 등록된 주차·식사 정보를 한곳에 모아요.', group: 'utility' },
  { id: 'day-checklist', label: '당일 체크리스트', key: 'checklist', detail: '일정과 교통편을 확인하며 가볍게 체크해요.', group: 'utility' },
  { id: 'keepsake', label: '간직하는 초대', key: 'keepsake', detail: '예식 정보를 이미지나 일정으로 간직해요.', group: 'utility' },
  { id: 'promises', label: '우리의 약속', key: 'promiseStyle', detail: '함께할 일상을 담은 제안 문구를 비교해요.', group: 'sentiment' },
  { id: 'couple-notes', label: '우리의 한 문장', key: 'noteStyle', detail: '함께라면 뭐든 할 수 있겠다는 마음을 담아요.', group: 'sentiment' },
  { id: 'thank-you', label: '감사 인사', key: 'thanksStyle', detail: '와 주실 분들에게 전하는 짧은 제안 문구예요.', group: 'sentiment' },
].map(section => Object.freeze(section)));
export const ORDER_SECTIONS = Object.freeze([
  { id: 'invitation', label: '초대글 · 가족 소개' },
  { id: 'wedding-day', label: '예식 날짜' },
  { id: 'location', label: '오시는 길' },
  { id: 'our-story', label: '우리의 이야기' },
  { id: 'gallery', label: '사진첩' },
  { id: 'accounts', label: '마음 전하실 곳' },
  { id: 'guestbook', label: '축하의 편지' },
  ...OPTIONAL_SECTIONS,
].map(section => Object.freeze(section)));
export const DEFAULT_ORDER = Object.freeze(ORDER_SECTIONS.filter(section => !section.group).map(section => section.id));
export const DEFAULT_COMPOSITION = Object.freeze({ profileStyle:'interview',quizStyle:'balance',busanStyle:'postcards',playlistStyle:'records',portraitStyle:'slider',palette: 'mist', font: 'letter', textSize: 'original', textScale: 1, lineScale: 1, sectionSpace: 1, sectionTuning: '', lineSpace: 'original', photoTone: 'original', coverFocus: 'original', albumColumns: 'auto', albumRatio: 'auto', ending: 'original', calendarMark: 'original', dayPass: 'boarding', motion: 'signature', motionSpeed: 1, motionStrength: 1, spacing: 'balanced', divider: 'none', cover: 'cinema', opening: 'ink', intro: 'letter', date: 'ticket', story: 'chapters', album: 'stack', arrival: 'unfold', gifting: 'card', wishes: 'envelope', navigation: 'dock', guestGuide: 'folded', checklist: 'list', keepsake: 'ticket', promiseStyle: 'lines', noteStyle: 'conversation', thanksStyle: 'letter', extras: Object.freeze([]), order: DEFAULT_ORDER });
export const CHOICES = Object.freeze({
  profileStyle:[{id:'interview',label:'서로에게 묻는 말',detail:'한 질문씩 넘기는 인터뷰.'},{id:'magazine',label:'두 사람의 작은 매거진',detail:'답과 사진을 차분히 모아 봐요.'}],
  quizStyle:[{id:'balance',label:'두 가지 중에 하나',detail:'답을 고르면 작은 이야기가 열려요.'},{id:'cards',label:'한 장씩 퀴즈',detail:'질문을 카드로 넘기며 맞혀 봐요.'}],
  busanStyle:[{id:'postcards',label:'부산의 작은 엽서',detail:'직접 추천한 곳을 엽서처럼 담아요.'},{id:'list',label:'짧은 여행 목록',detail:'이름과 지도 링크를 간결하게 읽어요.'}],
  playlistStyle:[{id:'records',label:'작은 레코드 가게',detail:'준비한 곡을 한 곡씩 들어요.'},{id:'list',label:'우리의 음악 목록',detail:'곡과 공식 재생 링크를 한눈에.'}],
  portraitStyle:[{id:'slider',label:'그때에서 지금으로',detail:'손잡이를 움직여 두 순간을 겹쳐요.'},{id:'pair',label:'나란히 놓인 순간',detail:'두 사진을 함께 바라봐요.'}],
  textSize: Object.freeze([
    { id: 'original', label: '지금의 글자 크기', detail: '기존의 섬세한 균형을 그대로 유지해요.' },
    { id: 'comfortable', label: '조금 더 편안하게', detail: '본문과 안내를 한 단계 키워 읽기 편하게 해요.' },
    { id: 'large', label: '또렷한 큰 글씨', detail: '이름과 안내를 넉넉하게 읽어요. 손글씨의 모습은 유지해요.' },
  ]),
  lineSpace: Object.freeze([
    { id: 'original', label: '지금의 문장 간격', detail: '현재의 줄 간격을 유지해요.' },
    { id: 'relaxed', label: '숨 쉬는 문장', detail: '본문 줄 사이를 조금 더 띄워 천천히 읽어요.' },
  ]),
  photoTone: Object.freeze([
    { id: 'original', label: '사진 그대로', detail: '촬영한 사진의 색을 그대로 보여줘요.' },
    { id: 'soft', label: '부드러운 빛', detail: '사진의 대비를 살짝 낮춰 부드럽게 연결해요.' },
    { id: 'mono', label: '흑백의 순간', detail: '사진만 흑백으로 바꾸고 글과 강조색은 유지해요.' },
  ]),
  coverFocus: Object.freeze([
    { id: 'original', label: '지금의 사진 구도', detail: '기존 첫 사진의 구도를 유지해요.' },
    { id: 'upper', label: '위쪽을 조금 더', detail: '표지에서 사진의 위쪽 풍경을 더 보여줘요.' },
    { id: 'lower', label: '두 사람에게 가까이', detail: '사진의 아래쪽 인물과 손을 중심에 가까이 둬요.' },
  ]),
  albumColumns: Object.freeze([
    { id: 'auto', label: '배열에 어울리게', detail: '격자는 3열, 원본 비율 사진첩은 2열로 보여줘요.' },
    { id: 'two', label: '넉넉한 두 줄', detail: '격자와 원본 사진첩에서 한 줄에 두 장씩 보여줘요.' },
    { id: 'three', label: '한눈에 세 줄', detail: '격자와 원본 사진첩에서 한 줄에 세 장씩 보여줘요.' },
  ]),
  albumRatio: Object.freeze([
    { id: 'auto', label: '배열의 기본 비율', detail: '격자는 세로, 원본 사진첩은 촬영한 비율을 사용해요.' },
    { id: 'portrait', label: '세로로 길게', detail: '사진을 세로 프레임 안에 정돈해요.' },
    { id: 'square', label: '반듯한 정사각', detail: '같은 크기로 정리해 사진을 빠르게 골라요.' },
    { id: 'original', label: '원본 비율 그대로', detail: '사진 가장자리를 자르지 않고 촬영한 구도를 살려요.' },
  ]),
  ending: Object.freeze([
    { id: 'original', label: '지금의 마지막 인사', detail: '짧은 문구와 서명으로 차분히 마무리해요.' },
    { id: 'glass', label: '사진 위의 편지', detail: '마지막 사진 위에 반투명 편지가 떠오르며 끝나요.' },
    { id: 'letter', label: '사진을 간직한 인사', detail: '작은 사진과 넉넉한 흰 여백으로 인사를 남겨요.' },
  ]),
  calendarMark: Object.freeze([
    { id: 'original', label: '지금의 날짜 표시', detail: '기존 달력의 예식일 표시를 유지해요.' },
    { id: 'ring', label: '가느다란 동그라미', detail: '가는 테두리로 3월 6일을 둘러요.' },
    { id: 'underline', label: '작은 밑줄', detail: '날짜 아래 선을 그어 담백하게 표시해요.' },
  ]),
  dayPass: Object.freeze([
    { id: 'receipt', label: '카페에서 온 초대', detail: '영수증처럼 펼쳐지는 한 장에 예식과 길찾기를 담아요.', source: 'V2 · NEW' },
    { id: 'boarding', label: '한 장의 당일 패스', detail: '날짜·시간·홀·길찾기를 티켓처럼 한곳에 모아요.' },
    { id: 'concise', label: '빠르게 보는 예식 안내', detail: '큰 시간과 꼭 필요한 정보로 간결하게 읽어요.' },
  ]),
  palette: Object.freeze([
    { id: 'mist', label: '안개 블루', detail: '지금의 차분한 블루와 맑은 종이색을 유지해요.', source: 'ORIGINAL · 색감' },
    { id: 'azure', label: '맑은 블루', detail: '깨끗한 화이트에 조금 더 선명한 파랑을 더해요.', source: 'BLUE · 색감' },
    { id: 'rose', label: '은은한 로즈', detail: '하얀 종이에 조용한 장밋빛을 살짝 담아요.', source: 'ROSE · 색감' },
    { id: 'midnight', label: '밤빛 네이비', detail: '밝은 바탕과 깊은 남색으로 또렷하게 보여요.', source: 'NAVY · 색감' },
    { id: 'lilac', label: '라일락 안개', detail: '맑은 화이트에 연한 보랏빛을 담아요.', source: 'LILAC · 색감' },
    { id: 'mono', label: '모노 화이트', detail: '사진의 색은 살리고 글과 선은 담백하게 정리해요.', source: 'MONO · 색감' },
  ]),
  spacing: Object.freeze([
    { id: 'compact', label: '가까운 간격', detail: '장면 사이 여백을 줄여 빠르게 읽어요.' },
    { id: 'balanced', label: '지금의 여백', detail: '현재의 편안한 장면 간격을 유지해요.' },
    { id: 'airy', label: '넉넉한 여백', detail: '장면 사이에 쉬어 갈 공간을 더해요.' },
  ]),
  divider: Object.freeze([
    { id: 'breath', label: '사진 앞의 작은 숨', detail: '사진첩 앞에서만 가는 선이 나비로 이어져요. 짧게 한 번, 스크롤에 맞춰 그려져요.' },
    { id: 'none', label: '자연스럽게 연결', detail: '추가 구분 없이 사진과 글이 이어져요.' },
    { id: 'line', label: '가는 구분선', detail: '장면 사이에 가느다란 선을 더해요.' },
    { id: 'chapter', label: '작은 장 번호', detail: '읽는 순서대로 작은 번호를 붙여요.' },
  ]),
  guestGuide: Object.freeze([
    { id: 'folded', label: '접어 둔 안내', detail: '필요한 안내를 펼쳐 읽어요.' },
    { id: 'cards', label: '한눈에 보는 안내', detail: '교통과 등록된 안내를 나란히 정리해요.' },
    { id: 'slider', label: '한 장씩 넘기는 안내', detail: '필요한 안내를 한 장씩 골라 읽어요.' },
  ]),
  checklist: Object.freeze([
    { id: 'list', label: '작은 확인 목록', detail: '하나씩 체크하며 준비한 내용을 확인해요.' },
    { id: 'steps', label: '세 걸음의 준비', detail: '단계별로 확인하고 진행 상태를 살펴봐요.' },
  ]),
  keepsake: Object.freeze([
    { id: 'ticket', label: '간직할 티켓', detail: '날짜와 장소를 티켓처럼 담아 저장해요.' },
    { id: 'postcard', label: '한 장의 초대', detail: '여유로운 엽서 구성에서 정보를 간직해요.' },
    { id: 'qr', label: 'QR로 이어 보는 초대', detail: '고른 조합을 휴대폰으로 열거나 QR 이미지로 보관해요.' },
  ]),
  promiseStyle: Object.freeze([
    { id: 'lines', label: '한 줄씩 약속', detail: '일상에 대한 짧은 약속을 차분히 읽어요. 문구는 제안 초안이에요.' },
    { id: 'paired', label: '마주 놓인 약속', detail: '두 사람의 약속을 마주 보는 구성으로 담아요. 문구는 제안 초안이에요.' },
  ]),
  noteStyle: Object.freeze([
    { id: 'conversation', label: '마음을 건네듯', detail: '함께라면 뭐든 할 수 있겠다는 마음을 전해요.' },
    { id: 'pages', label: '한 문장의 페이지', detail: '짧은 문장을 넉넉한 여백 안에 담아요.' },
  ]),
  thanksStyle: Object.freeze([
    { id: 'letter', label: '감사의 편지', detail: '소중한 발걸음에 전하는 짧은 제안 문구예요.' },
    { id: 'signature', label: '두 사람의 인사', detail: '큰 이름과 손글씨를 중심으로 인사해요. 문구는 제안 초안이에요.' },
  ]),
  font: Object.freeze([
    { id: 'letter', label: '단정한 편지', detail: '부드러운 리디바탕 본문과 또렷한 함렛 제목.', source: 'ORIGINAL · 글씨체' },
    { id: 'editorial', label: '또렷한 세리프', detail: '함렛의 단단한 획으로 이름과 문장을 선명하게.', source: 'SERIF · 글씨체' },
    { id: 'modern', label: '가벼운 모던', detail: '정돈된 프리텐다드 본문에 기존 손글씨를 함께.', source: 'MODERN · 글씨체' },
  ]),
  motion: Object.freeze([
    { id: 'signature', label: '장면 고유 효과만', detail: '리본·날짜 넘김 등 고른 장면의 연출만 사용해요. 공통 움직임은 더하지 않아요.', source: 'ORIGINAL · 스크롤' },
    { id: 'rise', label: '아래에서 올라오기', detail: '본문이 아래쪽에서 위로 올라와 자리를 잡아요. 크기와 초점은 그대로예요.', source: 'RISE · 스크롤' },
    { id: 'focus', label: '작게 시작해 선명하게', detail: '작고 흐릿하게 시작한 본문이 커지면서 초점을 맞춰요.', source: 'FOCUS · 스크롤' },
    { id: 'drift', label: '양옆에서 들어오기', detail: '왼쪽, 오른쪽을 번갈아 지나 본문이 가운데로 들어와요.', source: 'DRIFT · 스크롤' },
    { id: 'unveil', label: '왼쪽부터 드러나기', detail: '본문 위의 얇은 커튼이 왼쪽에서 오른쪽으로 걷혀요.', source: 'UNVEIL · 스크롤' },
    { id: 'breathe', label: '크게 시작해 제자리로', detail: '조금 크게 보이던 본문이 작아지며 여백 안에 들어와요. 흐림 효과는 없어요.', source: 'BREATHE · 스크롤' },
    { id: 'still', label: '스크롤 움직임 없이', detail: '스크롤에 따른 움직임을 모두 쉬어요. 첫 손글씨와 클릭 동작은 유지돼요.', source: 'STILL · 스크롤' },
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
    { id: 'film', label: '한 컷씩, 필름 사진첩', detail: '필름 프레임 안의 사진을 옆으로 넘겨요. 아래 작은 사진으로도 바로 골라요.', source: 'V2 · NEW' },
    { id: 'stack', label: '겹쳐지는 사진', detail: '여러 순간이 한 장의 사진첩으로 모여요.', source: 'F · 사진첩' },
    { id: 'contact', label: '펼쳐지는 필름', detail: '사진들이 가볍게 펼쳐지고 한 장을 골라요.', source: 'G · 사진첩' },
    { id: 'grid', label: '한눈에 보는 사진첩', detail: '모든 순간을 차분한 격자로 살펴봐요.', source: 'VER6 · 사진첩' },
    { id: 'masonry', label: '구도를 살리는 사진첩', detail: '사진 원본의 비율을 살려 자연스럽게 이어 놓아요.', source: 'NEW · 사진첩' },
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
    { id: 'polaroid', label: '한 장의 축하', detail: '남겨 주신 이름과 메시지를 작은 인화지처럼 모아요.', source: 'V2 · NEW' },
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
  { id: 'recommended-balance', featured: true, badge: '가장 추천', label: '01 · 우리다운 균형', detail: '차분한 블루와 원래 손글씨, 편안한 본문. 예식 안내 뒤 사진과 이야기가 이어져요.', composition: Object.freeze({ ...DEFAULT_COMPOSITION, textSize: 'comfortable', lineSpace: 'relaxed', photoTone: 'soft', cover: 'curtain', intro: 'together', date: 'orbit', album: 'masonry', albumColumns: 'two', albumRatio: 'original', calendarMark: 'underline', ending: 'letter', motion: 'rise', motionSpeed: .75, motionStrength: .75, order: Object.freeze(['invitation', 'wedding-day', 'location', 'gallery', 'our-story', 'accounts', 'guestbook']) }) },
  { id: 'recommended-cinema', featured: true, badge: '모션 중심', label: '02 · 천천히 열리는 영화', detail: '창처럼 열리는 표지와 흐르는 손글씨, 넘겨지는 날짜와 필름 사진첩. 공통 효과는 덜었어요.', composition: Object.freeze({ ...DEFAULT_COMPOSITION, font: 'editorial', textSize: 'comfortable', photoTone: 'soft', cover: 'aperture', opening: 'flow', intro: 'ribbon', date: 'flip', album: 'contact', ending: 'glass', calendarMark: 'ring', motion: 'signature', order: Object.freeze(['invitation', 'wedding-day', 'location', 'gallery', 'our-story', 'accounts', 'guestbook']) }) },
  { id: 'recommended-photo', featured: true, badge: '사진 중심', label: '03 · 맑은 블루 사진집', detail: '화이트와 선명한 블루, 원본 구도의 두 줄 사진첩. 초대글 다음 사진을 먼저 만나요.', composition: Object.freeze({ ...DEFAULT_COMPOSITION, palette: 'azure', textSize: 'comfortable', cover: 'curtain', opening: 'light', album: 'masonry', albumColumns: 'two', albumRatio: 'original', ending: 'letter', calendarMark: 'ring', motion: 'breathe', motionSpeed: .75, motionStrength: .5, spacing: 'compact', order: Object.freeze(['invitation', 'gallery', 'wedding-day', 'location', 'our-story', 'accounts', 'guestbook']) }) },
  { id: 'recommended-guest', featured: true, badge: '읽기 편하게', label: '04 · 한눈에 편안한 안내', detail: '큰 세리프 글씨와 넉넉한 줄 간격. 날짜와 길찾기를 먼저 보고, 읽는 동안 움직임은 쉬어요.', composition: Object.freeze({ ...DEFAULT_COMPOSITION, palette: 'midnight', font: 'editorial', textSize: 'large', lineSpace: 'relaxed', intro: 'together', album: 'grid', albumColumns: 'two', albumRatio: 'portrait', calendarMark: 'underline', motion: 'still', spacing: 'compact', divider: 'line', order: Object.freeze(['invitation', 'wedding-day', 'location', 'gallery', 'our-story', 'accounts', 'guestbook']) }) },
  { id: 'flow', label: '01 · 잔잔하게 이어지는', detail: '기존 F의 분위기에서 새 초대글을 더했어요.', composition: DEFAULT_COMPOSITION },
  { id: 'light', label: '02 · 빛이 열리는', detail: '빛으로 드러나는 손글씨와 커튼, 둥근 날짜의 조합.', composition: Object.freeze({ ...DEFAULT_COMPOSITION, cover: 'curtain', opening: 'light', intro: 'together', date: 'orbit', story: 'line', album: 'contact' }) },
  { id: 'letter', label: '03 · 우리의 작은 영화', detail: '흐르는 손글씨와 열리는 창, 커피 한 잔의 이야기.', composition: Object.freeze({ ...DEFAULT_COMPOSITION, cover: 'aperture', opening: 'flow', intro: 'ribbon', date: 'flip', story: 'cafe', album: 'stack' }) },
  { id: 'readable', label: '04 · 편안하게 읽는 초대', detail: '큰 글씨, 넉넉한 문장 간격, 한 장씩 읽는 안내.', composition: Object.freeze({ ...DEFAULT_COMPOSITION, textSize: 'large', lineSpace: 'relaxed', guestGuide: 'slider', extras: Object.freeze(['guest-guide']), order: Object.freeze([...DEFAULT_ORDER, 'guest-guide']) }) },
  { id: 'photo-edit', label: '05 · 흑백으로 남긴 순간', detail: '흑백 사진, 원본 비율 사진첩, 마지막 사진 편지.', composition: Object.freeze({ ...DEFAULT_COMPOSITION, palette: 'mono', photoTone: 'mono', album: 'masonry', ending: 'glass', cover: 'curtain' }) },
  { id: 'guest-first', label: '06 · 하객을 위한 작은 배려', detail: '당일 패스와 QR 초대를 넣어 필요한 정보를 간직해요.', composition: Object.freeze({ ...DEFAULT_COMPOSITION, dayPass: 'concise', keepsake: 'qr', extras: Object.freeze(['day-pass', 'keepsake']), order: Object.freeze(['invitation', 'day-pass', ...DEFAULT_ORDER.slice(1), 'keepsake']) }) },
]);
export const SECTION_IDS = Object.freeze({ palette: 'invitation', font: 'invitation', textSize: 'invitation', lineSpace: 'invitation', photoTone: 'gallery', coverFocus: 'top', albumColumns: 'gallery', albumRatio: 'gallery', ending: 'closing', calendarMark: 'wedding-day', motion: 'invitation', spacing: 'invitation', divider: 'invitation', cover: 'top', opening: 'top', intro: 'invitation', date: 'wedding-day', story: 'our-story', album: 'gallery', arrival: 'location', gifting: 'accounts', wishes: 'guestbook', navigation: 'location', ...Object.fromEntries(OPTIONAL_SECTIONS.map(section => [section.key, section.id])) });
export function normalizeExtras(input) {
  const values = typeof input === 'string' ? input.slice(0, 256).split(',') : Array.isArray(input) ? input.slice(0, 32) : [];
  // Canonical order keeps equality and saved records stable regardless of checkbox order.
  return OPTIONAL_SECTIONS.map(section => section.id).filter(id => values.includes(id));
}
export function normalizeMotionTuning(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^(?:0\.[0-9]+|1(?:\.[0-9]+)?)$/.test(value))) return 1;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.min(1.5, Math.max(0.5, number)) * 4) / 4 : 1;
}
/** Every required section occurs once. Cover and closing never enter the movable list. */
export function normalizeOrder(input, extras = []) {
  const values = typeof input === 'string' ? input.slice(0, 512).split(',') : Array.isArray(input) ? input.slice(0, 64) : [];
  const allowed = [...DEFAULT_ORDER, ...normalizeExtras(extras)];
  const selected = values.filter(value => typeof value === 'string' && allowed.includes(value));
  return [...new Set([...selected, ...allowed])];
}
export function moveSection(input, section, position, extras = []) {
  const order = normalizeOrder(input, extras);
  if (!order.includes(section) || !Number.isInteger(position) || position < 0 || position >= order.length) return order;
  order.splice(order.indexOf(section), 1); order.splice(position, 0, section); return order;
}
export function normalizeComposition(input) {
  const result = { ...DEFAULT_COMPOSITION, extras: [], order: [...DEFAULT_ORDER] };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  if (Object.hasOwn(input, 'version') && String(input.version) !== '1') return result;
  const candidate = Object.hasOwn(input, 'composition') && input.composition && typeof input.composition === 'object' && !Array.isArray(input.composition) ? input.composition : input;
  for (const key of CHOICE_KEYS) {
    if (Object.hasOwn(candidate, key) && typeof candidate[key] === 'string' && CHOICES[key].some(choice => choice.id === candidate[key])) result[key] = candidate[key];
  }
  for (const key of ['motionSpeed', 'motionStrength']) if (Object.hasOwn(candidate, key)) result[key] = normalizeMotionTuning(candidate[key]);
  if (Object.hasOwn(candidate, 'textScale')) result.textScale = normalizeTextScale(candidate.textScale);
  if (Object.hasOwn(candidate, 'lineScale')) result.lineScale = normalizeFineTuning(candidate.lineScale,{min:.9,max:1.4,step:.05});
  if (Object.hasOwn(candidate, 'sectionSpace')) result.sectionSpace = normalizeFineTuning(candidate.sectionSpace,{min:.7,max:1.4,step:.05});
  if (Object.hasOwn(candidate, 'sectionTuning')) result.sectionTuning = normalizeSectionTuning(candidate.sectionTuning);
  if (Object.hasOwn(candidate, 'extras')) result.extras = normalizeExtras(candidate.extras);
  result.order = normalizeOrder(Object.hasOwn(candidate, 'order') ? candidate.order : [], result.extras);
  return result;
}
export function readComposition(search = '') {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(typeof search === 'string' ? search.slice(0, 4096) : '');
  return normalizeComposition(Object.fromEntries(params));
}
export function compositionParams(input) {
  const result = normalizeComposition(input);
  return new URLSearchParams({ version: '1', ...result, extras: result.extras.join(','), order: result.order.join(',') });
}
export function sameComposition(left, right) {
  return [...CHOICE_KEYS, 'motionSpeed', 'motionStrength', 'textScale', 'lineScale', 'sectionSpace', 'sectionTuning'].every(key => left?.[key] === right?.[key]) && ['extras', 'order'].every(key => Array.isArray(left?.[key]) && Array.isArray(right?.[key]) && left[key].length === right[key].length && left[key].every((id, index) => id === right[key][index]));
}

export function normalizeTextScale(value) {
  if (!['number', 'string'].includes(typeof value) || value === '') return 1;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.min(1.2, Math.max(.9, number)) * 20) / 20 : 1;
}
