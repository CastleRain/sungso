# honeymoon — 몰디브 신혼여행 플래너

성우 & 소희의 몰디브 리조트 비교 및 패키지 정보를 정리한 플래너.

**배포 URL:** `https://CastleRain.github.io/sungso/honeymoon/`  
**데이터:** `js/resorts-data.js`에 하드코딩 (12개 리조트, 3개 여행사)

---

## 폴더 구조

```
honeymoon/
├── index.html              ← 5탭 앱 진입점 (HTML 구조 + CDN 로드)
├── maldives_report.html    ← 독립 리포트 (별도 단일 파일)
├── css/
│   └── styles.css          ← 전체 스타일 (디자인 토큰 + 탭별 컴포넌트)
├── js/
│   ├── app.js              ← 루트 모듈 (탭 init, Detail Sheet, 메모 팝업/센터, D-day)
│   ├── firebase-notes.js   ← Firebase 댓글 메모 CRUD + 메타 카운트
│   ├── firebase-picks.js   ← Firebase 커플 pick + 일정표 CRUD
│   ├── resorts-data.js     ← 리조트 전체 데이터 + 유틸 함수
│   ├── tab-cards.js        ← 카드 그리드 + 필터/정렬
│   ├── tab-plan.js         ← 우리의 플랜 탭 (Pick, 최종확정, 일정표)
│   ├── tab-price.js        ← 가격 비교 테이블
│   ├── tab-map.js          ← SVG 지도 핀 + Leaflet 연동
│   ├── tab-tournament.js   ← 1:1 토너먼트 브라켓
│   └── tab-pdf.js          ← PDF.js 뷰어
└── data/
    ├── 리조트별/            ← 6개 리조트 견적서 PDF
    └── 패키지/              ← 4개 특가 패키지 PDF
```

---

## 아키텍처

- **빌드 도구 없음** — ES 모듈로 분리된 정적 파일
- **Firebase Firestore** — 댓글 메모, 커플 picks, 일정표 저장 (`sungso-358cb` 프로젝트 공유)
- **localStorage** — 토너먼트 진행 상태·가중치, 패널 너비, 대표 이미지 URL 저장
- **CDN 의존성:**

| 라이브러리 | 버전 | 용도 |
|---|---|---|
| Firebase JS SDK | 10.12.0 | Firestore 전반 |
| Leaflet | 1.9.4 | 인터랙티브 지도 |
| pdf.js | 3.11.174 | PDF 렌더링 |

---

## 5개 탭

### 1. 개요 & 카드 (`tab-cards.js`)

- **기본 상태:** 3열 전체 그리드
- **카드 클릭:** Detail Sheet 오픈 (전체 오버레이 형태)
- 정렬 버튼: 워터풀 4박 최저가 / 비치+워터 믹스 / 워터 4박 / 비치 4박
- 필터: 이동 수단 / 지역 / 해먹 여부 / 최대 예산 슬라이더
- 허니문 티어 배지: 최상 / 중간 / 단순
- **카드 메모 배지**: 우하단 `💬 N` 배지 (댓글 수 실시간 반영)

### 2. 가격비교 (`tab-price.js`)

- 전체 리조트 × 4가지 가격 항목 비교 테이블
- 여행사별 원가/할인가 동시 표시, 최저가 셀 강조
- 컬럼 헤더 클릭 → 오름차순/내림차순 정렬 토글
- 1인 / 2인 합산 전환 토글 (`coupleMode`)

### 3. 지도 (`tab-map.js`)

- `index.html`에 SVG 지도 하드코딩 (12개 리조트 핀 + 말레 공항)
- 핀 클릭 → Detail Sheet 오픈 (중간 요약 단계 없음)
- 좌우 패널 너비 드래그 조절 가능 (localStorage 저장)
- "인터랙티브 지도 열기" → Leaflet + OpenStreetMap 레이어 지연 로드

### 4. 토너먼트 (`tab-tournament.js`)

- 12개 리조트 1:1 랜덤 매칭 → 최종 우승 리조트 도출
- 가중치 슬라이더 (라군뷰·수중환경·프라이빗·다이닝·예산, 0~3단계)
- 매치 화면 각 카드에 "📋 상세" 버튼 → Detail Sheet 오픈
- 진행 상태 localStorage 자동 저장 (`maldives-tournament-state`)

### 5. PDF 뷰어 (`tab-pdf.js`)

- 좌측 사이드바: 리조트별 견적서 6개 + 특가 패키지 4개
- `data/` 폴더의 PDF 파일을 canvas에 렌더링 (pdf.js)
- **로컬 서버 필요:** `file://` 프로토콜에서는 PDF 로드 불가 → VS Code Live Server 필요
- `open-pdf` 커스텀 이벤트로 다른 탭에서 PDF 열기 가능

### 6. 우리의 플랜 (`tab-plan.js`)

별도 섹션 참고.

---

## Detail Sheet (`app.js`)

모든 리조트 상세는 **Detail Sheet** 하나로 통일 (분할 패널 방식 제거).

```js
window._openDetailSheet(resortId)  // 오픈 (어느 탭에서든)
window._closeDetailSheet()         // 닫기
```

- `#dsBackdrop` (z-index 4400) + `.detail-sheet` (z-index 4500)
- 데스크톱: 우측 슬라이드 패널 (`width: min(640px, 55vw)`)
- 모바일: 바텀 시트 (`height: 94svh`, translateY 애니메이션)
- 닫기: × 버튼 / Backdrop 클릭 / Esc 키

**`renderResortDetail(resort)`** 공통 HTML 구조:
- 헤더 우측 "💬 메모 N" 버튼 → 메모 팝업 오픈 (N = 댓글 수)
- 이미지 갤러리 (썸네일 hover → ⭐ 클릭 시 대표 이미지 설정)
- Pick 버튼 → Pick 모달 오픈
- 아톨, 이동 수단, 여행사 배지 / 평점 4항목
- 여행사별 가격표 (원가 → 할인가, 허니문 혜택)
- 장단점 목록 / 유튜브 영상 섹션
- PDF 보기 버튼 → `open-pdf` 이벤트 발송

---

## 우리의 플랜 탭 (`tab-plan.js`)

### 섹션 구성

1. **여행 요약 헤더** — 2027.03.07~14, 8일 7박, 준비 중 배지
2. **여정 개요 Route Strip** — 인천→싱가폴(2박)→몰디브(5박)→인천
3. **🏆 우리의 리조트** — 확정 리조트 히어로 카드 (Firebase에 저장된 경우만 표시)
4. **커플 Top 3** — 소희/성우 각 3위까지 Pick 슬롯
5. **최종 협의 후보** — finalCandidates 목록 + "✓ 이 리조트로 확정" 버튼
6. **여행 일정표** — Day 카드 타임라인

### Firebase 연동

```js
// firebase-picks.js
subscribePicks(cb)           // couplePicks/main 실시간 구독
subscribeItinerary(cb)       // itineraries/main 실시간 구독
setPick(person, rank, id)    // 개인 pick 저장
removePick(person, rank)     // pick 해제
setFinalCandidates(ids[])    // 최종 후보 저장
setConfirmedResort(id|null)  // 리조트 확정/취소
setItinerary(days[])         // 일정표 저장
```

### 일정표 편집 모드

**자동 생성:** "📅 기본 일정 자동 생성" 버튼 → 싱가폴 2박 + 몰디브 5박 8일 템플릿 삽입

**Day 카드 — View 모드:**
- 타입 chip으로 항목 표시 (아이콘 + 색상)
- 이동수단·숙박 chip
- 빠른 항목 추가 (Enter key / + 버튼)
- ✏️ 편집 버튼 → Edit 모드 전환

**Day 카드 — Edit 모드:**
- 제목·날짜·도시/지역·이동수단·숙박·오늘의 무드 인라인 편집
- 항목별: 타입 아이콘 클릭(순환), 시간 입력, 텍스트 수정, ↑↓ 순서 변경, × 삭제
- 타입 select + 내용/시간 입력 → + 버튼으로 항목 추가
- "완료" 버튼 → View 모드 복귀

**7가지 항목 타입:**
| 타입 | 아이콘 | 색상 |
|---|---|---|
| flight | ✈ | 파랑 `#4A90D9` |
| hotel | 🏨 | 보라 `#7B68EE` |
| transport | 🚌 | 주황 `#E67E22` |
| meal | 🍽 | 녹색 `#27AE60` |
| activity | 🏄 | 청록 `#1D9E75` |
| rest | 😴 | 회색 `#8E8E93` |
| memo | 📝 | 연회색 `#888` |

**자동 저장 (800ms debounce):**
- 수정 즉시 `_currentDays` in-memory 업데이트
- 800ms 후 `setItinerary()` → Firebase
- 저장 상태 표시: `저장 중...` → `✓ 저장됨`

**Firebase 콜백 억제 (편집 중 re-render 방지):**
```js
subscribeItinerary(days => {
  if (Date.now() - _lastSaveTime < 3000) return;   // 자체 저장 후 3초
  if (Object.values(_editMode).some(Boolean)) return; // 편집 중 Day 존재
  _renderItinerary(days);
});
```

**"미정" 항목:** `item.text`가 비어있거나 "미정" 포함 → opacity 0.42 + `추후 입력` pill 표시

**스키마 마이그레이션:** `normalizeItem()` — 기존 `string` 항목을 `{ type:'memo', text, time:'' }` 로 변환 (하위 호환)

### 전역 핸들러 (window에 등록)

| 핸들러 | 설명 |
|---|---|
| `_toggleDayEdit(dayIndex)` | 편집 모드 토글 + 해당 Day만 재렌더 |
| `_updateDayField(dayIndex, field, value)` | Day 필드 수정 + 자동저장 |
| `_updateItemField(dayIndex, itemIndex, field, value)` | 항목 필드 수정 + 자동저장 |
| `_cycleItemType(dayIndex, itemIndex)` | 타입 순환 + 재렌더 |
| `_moveItemUp/Down(dayIndex, itemIndex)` | 순서 변경 + 자동저장 |
| `_addDayItem(dayIndex)` | 편집 모드 항목 추가 (DOM 읽기) |
| `_addDayItemQuick(dayIndex, text)` | 뷰 모드 빠른 항목 추가 |
| `_removeDayItem(dayIndex, itemIndex)` | 항목 삭제 + 자동저장 |
| `_autoFillItinerary()` | 기본 8일 템플릿 자동 생성 |
| `_confirmResort(id\|null)` | 리조트 확정/취소 |
| `_toggleFinalCandidate(id)` | 최종 후보 추가/제거 |

---

## 메모 시스템 (`firebase-notes.js` + `app.js`)

### Firestore 스키마

```
resort_notes/{resortId}/comments/{commentId}
{
  author: '성우' | '소희',
  text: string,
  resortId: string,     // 알림 센터용
  resortName: string,   // 알림 센터용
  createdAt: serverTimestamp()
}

resort_note_meta/{resortId}
{
  commentCount: number,   // increment로 관리
  lastComment: string,    // 최근 댓글 텍스트
  lastAuthor: string,
  lastAt: serverTimestamp()
}
```

### API (`firebase-notes.js`)

| 함수 | 설명 |
|---|---|
| `subscribeComments(resortId, cb)` | 댓글 실시간 구독 |
| `addComment(resortId, resortName, author, text)` | 댓글 추가 + 메타 카운트 증가 |
| `deleteComment(resortId, commentId)` | 댓글 삭제 + 메타 카운트 감소 |
| `subscribeAllMetaCounts(cb)` | `resort_note_meta` 전체 실시간 구독 → `cb({ resortId: metaData })` |

### 메모 팝업 (`app.js`)

- 리조트 상세 헤더 우측 "💬 메모 N" 버튼 클릭 → 화면 우하단 플로팅 팝업
- 작성자: 🧑 성우(회색 말풍선, 왼쪽) / 👩 소희(핑크 말풍선, 오른쪽)
- Esc / 바깥 클릭으로 닫기

### 메모 배지 (`_refreshMemoCountBadges()`)

카운트 변경 시 3곳을 실시간 업데이트:
1. 카드 그리드 → `.card-memo-badge` 이미지 위 우하단
2. 플랜 탭 Pick 슬롯 → `.psc-memo-badge` 리조트명 옆
3. Detail Sheet 헤더 → "💬 메모 N" 버튼 텍스트

### 메모 알림 센터 (탭 네비 우측 드로어)

- 내비 바 우측 "💬 N" 버튼 → 오른쪽 슬라이드 드로어 (`width: 320px`, z-index 5200)
- 최근 댓글 있는 리조트 목록 표시 (최신순)
- 항목 클릭 → 해당 리조트 Detail Sheet 오픈 → 320ms 후 메모 팝업 오픈

---

## z-index 스택

| 레이어 | z-index | 설명 |
|---|---|---|
| `.ds-backdrop` | 4400 | Detail Sheet 배경 |
| `.detail-sheet` | 4500 | 리조트 상세 슬라이드 패널 |
| `.pick-modal-backdrop` | 4999 | Pick 모달 배경 |
| `.pick-modal` | 5000 | Pick 위치 선택 모달 |
| `.memo-center-backdrop` | 5100 | 메모 센터 배경 |
| `.memo-center-drawer` | 5200 | 메모 알림 센터 드로어 |
| `.memo-popup-backdrop` | 5300 | 메모 팝업 배경 |
| `.memo-popup` | 5400 | 리조트 댓글 팝업 |
| `.toast-msg` | 9999 | 토스트 알림 |

---

## Firebase (`firebase-fx.js`)

**`honeymoon_fx/usd_krw`** — USD/KRW 환율

| 필드 | 타입 | 설명 |
|---|---|---|
| `rate` | number | 환율 (예: 1380) |
| `fetchedAt` | serverTimestamp | 마지막 조회 시각 |

- `open.er-api.com/v6/latest/USD` API로 무료 조회 (API 키 불필요)
- 탭 네비 우측 FX 위젯에서 ⟳ 버튼 클릭 시 갱신, 1시간 이상 지나면 자동 갱신
- `window._krwMode` / `window._fxRate` / `window._fmtUSD()` 전역으로 카드·가격표·상세 가격 전환

---

## Firebase (`firebase-picks.js`)

### Firestore 컬렉션

**`couplePicks/main`** — 커플 pick + 최종 후보 + 확정 리조트

| 필드 | 타입 | 예시 |
|---|---|---|
| `sohee` | string[3] | `['cora_cora', null, 'veligandu']` |
| `sungwoo` | string[3] | `['cora_cora', 'furaveri', null]` |
| `finalCandidates` | string[] | `['cora_cora', 'furaveri']` |
| `confirmedResort` | string\|null | `'cora_cora'` |
| `updatedAt` | serverTimestamp | — |

**`itineraries/main`** — 여행 세부 일정

| 필드 | 타입 | 설명 |
|---|---|---|
| `days` | DayObject[] | Day 카드 배열 |
| `updatedAt` | serverTimestamp | — |

DayObject 구조:
```js
{
  day: number,        // 1~8
  date: 'YYYY-MM-DD',
  city: string,
  title: string,
  transport: string|null,
  stay: string|null,
  mood: string|null,  // 오늘의 무드
  items: [            // 항목 (구 string[] 하위 호환)
    { type: 'flight'|'hotel'|'transport'|'meal'|'activity'|'rest'|'memo',
      text: string,
      time: string }
  ]
}
```

---

## 리조트 메모 — API 변경 이력

`addComment` 시그니처 변경:
```js
// 구버전
addComment(resortId, author, text)
// 현재
addComment(resortId, resortName, author, text)  // resortName 추가 (알림 센터용)
```

---

## 패널 리사이즈 (`app.js` — `initResizeHandle`)

```js
initResizeHandle(handle, leftEl, storageKey, min, max)
```

- 지도 탭: `#mapResizeHandle` / `.map-tab-left` / `'map-left-w'` / 180~520px
- 너비는 localStorage에 저장, 다음 방문 시 복원

**주의:** 카드 탭은 Detail Sheet 방식으로 전환되어 분할 패널 없음.

---

## 탭 지연 초기화

`app.js`에서 각 탭은 **처음 클릭될 때 한 번만** 초기화 (`tabInited` Set 체크).  
초기 로드 시에는 카드 탭만 초기화됨. 지도 탭 초기화 시 `initResizeHandle`도 함께 호출.

---

## 대표 이미지 설정

1. **코드로 설정:** `resorts-data.js`에서 `featured_image: 'https://...'` 직접 입력
2. **UI로 설정:** 리조트 상세 > 이미지 갤러리 > 썸네일 hover > ⭐ 클릭
   - `localStorage['featured_img_' + resortId]`에 저장
   - 브라우저 캐시 삭제 시 초기화

`getFeaturedImage(resort)` — localStorage 저장값 우선, 없으면 `featured_image`, 없으면 `image_urls[0]`

---

## 리조트 데이터 (`resorts-data.js`)

### 내보내기

```js
export const RESORTS       // 리조트 배열 (12개)
export const TRIP_INFO     // 여행 일정 정보 (출발일: 2027-03-08 등)
export const AGENCIES      // 여행사 정보 (3개)
export function getBestPrice(resort, priceKey)
export function sortByPrice(resorts, priceKey)
export function getResortById(id)
export function getFeaturedImage(resort)
```

### 리조트 객체 구조

```js
{
  id, name_ko, name_en, atoll,
  transfer_type,      // 'seaplane' | 'speedboat'
  transfer_minutes,
  has_hammock,
  ratings: { lagoon, underwater, privacy, dining }, // 1~5
  honeymoon_tier,     // '최상' | '중간' | '단순'
  agencies: {
    realmaldives: { meal_plan, beach_4n, water_4n, water_pool_4n, mix_4n, *_disc, honeymoon_benefits },
    honeymoonresort: { ... },
    tourmin: { ... }
  },
  pdfs, coords, svg_pin, tags, pros, cons,
  image_urls, featured_image, youtube_ids, description
}
```

### 12개 리조트

| # | id | 이름 | 아톨 | 이동 | 여행사 |
|---|---|---|---|---|---|
| 1 | `cora_cora` | 코라코라 | 라아 아톨 | 수상비행기 45분 | 리얼몰디브 |
| 2 | `ananea` | 아나네아 | 바아 아톨 | 수상비행기 20분 | 리얼몰디브 |
| 3 | `veligandu` | 벨리간두 | 노스 아리 아톨 | 수상비행기 20분 | 리얼몰디브 |
| 4 | `dhigufaru` | 디구파루 | 바아 아톨 | 수상비행기 40분 | 리얼몰디브 |
| 5 | `furaveri` | 푸라베리 | 라아 아톨 | 수상비행기 45분 | 리얼몰디브 |
| 6 | `fushifaru` | 푸시파루 | 라비야니 아톨 | 수상비행기 35분 | 리얼몰디브 |
| 7 | `raaya` | 라야 | 라아 아톨 | 수상비행기 45분 | 리얼몰디브 |
| 8 | `varu` | 앳모스피어바루 | 노스 말레 아톨 | 스피드보트 40분 | 리얼몰디브+허니문 |
| 9 | `saii_so` | 사이라군+SO | 노스 말레 아톨 | 스피드보트 40분 | 리얼몰디브+허니문 |
| 10 | `emerald` | 에메랄드 파스멘두 | 라아 아톨 | 수상비행기 50분 | 투어민 |
| 11 | `oblu_sangeli` | 오블루 상겔리 | 노스 말레 아톨 | 스피드보트 50분 | 투어민 |
| 12 | `outrigger` | 아웃리거 마푸시바루 | 사우스 아리 아톨 | 수상비행기 25분 | 투어민 |

### 3개 여행사

| id | 이름 | 특이사항 |
|---|---|---|
| `realmaldives` | 리얼몰디브 | 기본 여행사 |
| `honeymoonresort` | 허니문리조트 | $200 추가 할인 (기간 한정) |
| `tourmin` | 투어민 | PDF 없음. outrigger는 2026년 가격 참고치 주의 |

---

## 디자인 시스템 (`css/styles.css`)

sungso 루트 사이트와 통일된 핑크/로즈 테마:
- 배경: `linear-gradient(135deg, #FFF5F7 0%, #FFF0EA 100%)`
- 헤더: `#C44B6A → #FF6B9D` 그라디언트
- 주요 변수: `--primary: #FF6B9D`, `--primary-deep: #C44B6A`
- `--ocean-*` 변수는 핑크로 리매핑 (backward compat)
- 폰트: `'Apple SD Gothic Neo', 'Pretendard', -apple-system, 'Malgun Gothic'`

---

## D-day 배지

`app.js`의 `updateDDay()` — 여행 출발일 `2027-03-08` 기준.  
DOM ID: `#ddayBadge`

---

## 데이터 수정 방법

- 리조트 정보 변경 → `js/resorts-data.js` 직접 편집
- PDF 파일 추가 → `data/리조트별/` 또는 `data/패키지/`에 파일 추가 후 `tab-pdf.js`의 `PDF_FILES` 배열에 항목 추가
- 일정 수정 → Firebase Console `itineraries/main` 직접 편집 또는 플랜 탭 UI 사용

---

## 진행 상황

| 날짜 | 작업 |
|---|---|
| 2026-06-12 | CLAUDE.md 최초 작성 |
| 2026-06-12 | 핑크 테마 전환, 리조트 3개 추가(투어민), featured_image 지원 |
| 2026-06-12 | UX 7종: 분할레이아웃·지도 핀 직접 상세·토너먼트 버그·필터 단순화·2인합산 수정·대표이미지 UI |
| 2026-06-12 | UX 5종: 카드↔그리드 전환·홈 내비바·스크롤 픽스·리조트 메모(Firebase)·토너먼트 상세보기 |
| 2026-06-12 | UX 5종 2차: 패널 드래그 리사이즈·댓글 스레드 메모·메모 팝업·그리드 클릭 목록복귀·패널 전환 버그 수정 |
| 2026-06-12 | Detail Sheet 통일: 전 탭 리조트 상세를 우측 슬라이드 패널(모바일: 바텀시트)로 단일화 |
| 2026-06-12 | 메모 UX 개선: z-index 수정(5400), 메모 카운트 배지(카드/Pick슬롯/상세헤더), `resort_note_meta` 컬렉션 추가, 메모 알림 센터 드로어 추가 |
| 2026-06-12 | 플랜 탭 1차: 커플 Top3 Pick 슬롯, 최종 후보, 리조트 확정, 기본 일정 자동 생성, Day 항목 추가/삭제 |
| 2026-06-13 | 일정표 편집 UX 전면 개선: Day 카드 View/Edit 모드, 7종 항목 타입 시스템, 자동저장(800ms debounce), ↑↓ 순서변경, 미정 pill, Firebase 콜백 억제 |
| 2026-06-13 | 새로고침 탭 복원: `honeymoon_tab` localStorage 저장 → 재방문 시 마지막 탭 복귀 |
| 2026-06-13 | 배지 겹침 수정: 순위·Pick·블로그수 배지를 `.card-bl-badges` flex 컨테이너로 세로 적층 |
| 2026-06-13 | 순위 배지 시각적 개선: 색상별 강조 → 단색 반투명 pill(rgba 0,0,0,0.32)로 통일 |
| 2026-06-14 | 상세 패널 Leaflet 지도: "위치 & 이동" 아래 200px 지도, 리조트·공항 핀 + 점선 경로, 구글지도 링크 |
| 2026-06-14 | 지도 버그 수정: `_minimapShowWithPin`의 `closeCardDetail`(미존재) → `closeDetailSheet` 수정 |
| 2026-06-14 | USD/KRW 환율 토글: `firebase-fx.js` 신규, `honeymoon_fx/usd_krw` 컬렉션, 탭 네비 FX 위젯 |
| 2026-06-14 | 아나네아 가격 수정: 허니문리조트 HB→AI(HB+) 기준, 비치풀$3,169·워터풀$3,322·믹스$3,246 |
