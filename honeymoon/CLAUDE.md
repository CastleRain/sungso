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
│   ├── app.js              ← 루트 모듈 (탭 init, 상세 렌더, 메모 팝업, D-day, 리사이즈)
│   ├── firebase-notes.js   ← Firebase 댓글 메모 CRUD (서브컬렉션)
│   ├── resorts-data.js     ← 리조트 전체 데이터 + 유틸 함수
│   ├── tab-cards.js        ← 카드 그리드 + 필터/정렬
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
- **Firebase Firestore** — 리조트 댓글 메모 저장 (`sungso-358cb` 프로젝트 공유)
- **localStorage** — 토너먼트 진행 상태·가중치, 패널 너비, 대표 이미지 URL 저장
- **CDN 의존성:**

| 라이브러리 | 버전 | 용도 |
|---|---|---|
| Firebase JS SDK | 10.12.0 | Firestore 댓글 메모 |
| Leaflet | 1.9.4 | 인터랙티브 지도 |
| pdf.js | 3.11.174 | PDF 렌더링 |

---

## 5개 탭

### 1. 개요 & 카드 (`tab-cards.js`)

- **기본 상태:** 3열 전체 그리드
- **카드 클릭 시:** 좌우 분할 레이아웃 전환 — 왼쪽 카드 목록(기본 460px, 드래그 조절 가능) + 오른쪽 상세 패널
- **목록 복귀:** 왼쪽 영역(툴바·그리드 빈 공간) 클릭 OR "← 목록으로" 버튼
- 정렬 버튼: 워터풀 4박 최저가 / 비치+워터 믹스 / 워터 4박 / 비치 4박
- 필터: 이동 수단 (`seaplane`/`speedboat`) / 지역 / 해먹 여부 / 최대 예산 슬라이더
- 허니문 티어 배지: 최상 / 중간 / 단순

### 2. 가격비교 (`tab-price.js`)

- 전체 리조트 × 4가지 가격 항목 비교 테이블
- 여행사별 원가/할인가 동시 표시, 최저가 셀 강조
- 컬럼 헤더 클릭 → 오름차순/내림차순 정렬 토글
- 1인 / 2인 합산 전환 토글 (`coupleMode`) — 상단 요약 카드에도 반영

### 3. 지도 (`tab-map.js`)

- `index.html`에 SVG 지도 하드코딩 (12개 리조트 핀 + 말레 공항)
- 핀 클릭 → 우측 패널에 **바로** 전체 리조트 상세 표시 (중간 요약 단계 없음)
- 좌우 패널 너비 드래그 조절 가능 (localStorage 저장)
- "인터랙티브 지도 열기" → Leaflet + OpenStreetMap 레이어 지연 로드

### 4. 토너먼트 (`tab-tournament.js`)

- 12개 리조트 1:1 랜덤 매칭 → 최종 우승 리조트 도출
- 가중치 슬라이더 (라군뷰·수중환경·프라이빗·다이닝·예산, 0~3단계)
- 매치 화면 각 카드에 "📋 상세" 버튼 → 전체화면 오버레이로 리조트 상세 표시
- 진행 상태 localStorage 자동 저장 (`maldives-tournament-state`)
- 결과 화면에서 상세 보기 → `open-detail` 커스텀 이벤트

### 5. PDF 뷰어 (`tab-pdf.js`)

- 좌측 사이드바: 리조트별 견적서 6개 + 특가 패키지 4개
- `data/` 폴더의 PDF 파일을 canvas에 렌더링 (pdf.js)
- **로컬 서버 필요:** `file://` 프로토콜에서는 PDF 로드 불가 → VS Code Live Server 필요
- `open-pdf` 커스텀 이벤트로 다른 탭에서 PDF 열기 가능

---

## 상세 패널 / 오버레이 (`app.js`)

| 함수 | 렌더 위치 | 용도 |
|---|---|---|
| `openDetailInCards(id)` | `#cardsDetailPanel` (카드 탭 오른쪽) | 카드 클릭 |
| `openDetailInMap(id)` | `#mapInfoPanel` (지도 탭 오른쪽) | SVG 핀 클릭 |
| `openDetail(id)` | `#detailOverlay` (전체화면 오버레이) | 토너먼트 상세보기 |
| `window.closeCardDetail()` | — | 카드 탭 상세 닫기 + 그리드 복귀 |

`renderResortDetail(resort)` 공통 HTML 구조:
- 헤더 우측 "💬 메모" 버튼 → 메모 팝업 오픈
- 이미지 갤러리 (썸네일 hover → ⭐ 클릭 시 대표 이미지 설정)
- 아톨, 이동 수단, 여행사 배지 / 평점 4항목
- 여행사별 가격표 (원가 → 할인가, 허니문 혜택)
- 장단점 목록 / 유튜브 영상 섹션
- PDF 보기 버튼 → `openPdfFromDetail()` → `open-pdf` 이벤트 발송

---

## 패널 리사이즈 (`app.js` — `initResizeHandle`)

```js
initResizeHandle(handle, leftEl, storageKey, min, max)
```

- 카드 탭: `#cardsResizeHandle` / `.cards-left-col` / `'cards-left-w'` / 240~700px
- 지도 탭: `#mapResizeHandle` / `.map-tab-left` / `'map-left-w'` / 180~520px
- 너비는 localStorage에 저장, 다음 방문 시 복원
- 카드 탭 핸들은 `detail-open` 상태가 아닐 때 `display:none`

**주의:** 카드 탭은 `detail-open` 제거 시 `#tab-cards:not(.detail-open) .cards-left-col { width: 100% !important }`로 인라인 스타일을 강제 초기화 (리사이즈 핸들의 인라인 width가 잔류하는 문제 방지)

---

## 리조트 메모 — 댓글 스레드 (`firebase-notes.js`)

### Firestore 스키마

```
resort_notes/{resortId}/comments/{commentId}
{
  author: '성우' | '소희',
  text: string,
  createdAt: serverTimestamp()
}
```

### API

| 함수 | 설명 |
|---|---|
| `subscribeComments(resortId, cb)` | 실시간 구독 (`onSnapshot`), 반환값 = unsubscribe 함수 |
| `addComment(resortId, author, text)` | 댓글 추가 (`addDoc`) |
| `deleteComment(resortId, commentId)` | 댓글 삭제 (`deleteDoc`) |

### 메모 팝업 동작 (`app.js`)

- 리조트 상세 헤더 우측 "💬 메모" 버튼 클릭 → 화면 우하단 플로팅 팝업 표시
- 팝업 내 작성자 선택: 🧑 성우 / 👩 소희 아이콘 버튼
- 소희 댓글 = 핑크 말풍선 (오른쪽 정렬), 성우 댓글 = 회색 말풍선 (왼쪽 정렬)
- 댓글에 마우스 올리면 🗑 삭제 버튼 표시
- `onSnapshot`으로 실시간 반영 (두 기기에서 동시 접속 시 즉시 업데이트)
- Esc 키 또는 팝업 바깥 클릭으로 닫기

### 주요 window 함수

| 함수 | 설명 |
|---|---|
| `window._openMemo(resortId)` | 메모 팝업 열기 + 실시간 구독 시작 |
| `window._closeMemo()` | 팝업 닫기 + 구독 해제 |
| `window._sendMemo()` | 선택된 작성자로 댓글 전송 |
| `window._deleteMemo(commentId)` | 댓글 삭제 |

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
  distance_km,
  has_hammock,
  ratings: { lagoon, underwater, privacy, dining }, // 1~5
  honeymoon_tier,     // '최상' | '중간' | '단순'
  agencies: {
    realmaldives: { meal_plan, meal_plan_name, beach_4n, water_4n, water_pool_4n, mix_4n, *_disc, honeymoon_benefits },
    honeymoonresort: { ... },
    tourmin: { ... }
  },
  pdfs,               // 연결 PDF 파일 경로 배열 (tourmin 리조트는 [])
  coords: { lat, lon },
  svg_pin: { cx, cy, color },
  tags, pros, cons,
  image_urls,
  featured_image,
  youtube_ids,
  description
}
```

### 12개 리조트 목록

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
| `tourmin` | 투어민 | PDF 없음. 3개 리조트 전담. outrigger는 2026년 가격 참고치 주의 |

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

`app.js`의 `updateDDay()` — 여행 출발일 `2027-03-08` 기준으로 헤더 D-day 배지 업데이트.  
DOM ID: `#ddayBadge`

---

## 탭 지연 초기화

`app.js`에서 각 탭은 **처음 클릭될 때 한 번만** 초기화 (`tabInited` Set 체크).  
초기 로드 시에는 카드 탭만 초기화됨. 지도 탭 초기화 시 `initResizeHandle`도 함께 호출.

---

## 데이터 수정 방법

- 리조트 정보 변경 → `js/resorts-data.js` 직접 편집
- PDF 파일 추가 → `data/리조트별/` 또는 `data/패키지/`에 파일 추가 후 `tab-pdf.js`의 `PDF_FILES` 배열에 항목 추가

---

## 진행 상황

| 날짜 | 작업 |
|---|---|
| 2026-06-12 | CLAUDE.md 최초 작성 |
| 2026-06-12 | 핑크 테마 전환, 리조트 3개 추가(투어민), featured_image 지원 |
| 2026-06-12 | UX 7종: 분할레이아웃·지도 핀 직접 상세·토너먼트 버그·필터 단순화·2인합산 수정·대표이미지 UI |
| 2026-06-12 | UX 5종: 카드↔그리드 전환·홈 내비바·스크롤 픽스·리조트 메모(Firebase)·토너먼트 상세보기 |
| 2026-06-12 | UX 5종 2차: 패널 드래그 리사이즈·댓글 스레드 메모·메모 팝업·그리드 클릭 목록복귀·패널 전환 버그 수정 |
