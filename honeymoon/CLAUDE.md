# honeymoon — 몰디브 신혼여행 플래너

성우 & 소희의 몰디브 리조트 비교 및 패키지 정보를 정리한 플래너.

**배포 URL:** `https://CastleRain.github.io/sungso/honeymoon/`  
**데이터:** `js/resorts-data.js`에 하드코딩 (12개 리조트, 3개 여행사)

---

## 폴더 구조

```
honeymoon/
├── index.html           ← 5탭 앱 진입점 (HTML 구조 + CDN 로드)
├── maldives_report.html ← 독립 리포트 (별도 단일 파일, 스타일 자체 보유)
├── css/
│   └── styles.css       ← 전체 스타일 (디자인 토큰 + 탭별 컴포넌트)
├── js/
│   ├── app.js           ← 루트 모듈 (탭 init, 상세 오버레이, D-day)
│   ├── resorts-data.js  ← 리조트 전체 데이터 + 유틸 함수 (771줄)
│   ├── tab-cards.js     ← 카드 그리드 + 필터/정렬
│   ├── tab-price.js     ← 가격 비교 테이블
│   ├── tab-map.js       ← SVG 지도 핀 + Leaflet 연동
│   ├── tab-tournament.js← 1:1 토너먼트 브라켓
│   └── tab-pdf.js       ← PDF.js 뷰어
└── data/
    ├── 리조트별/         ← 6개 리조트 견적서 PDF (임소희 님 - 270307 *.pdf)
    └── 패키지/           ← 4개 특가 패키지 PDF
```

---

## 아키텍처

- **빌드 도구 없음** — ES 모듈로 분리된 정적 파일
- **Firebase 없음** — 완전 정적, 데이터는 JS 파일에 하드코딩
- **localStorage:** 토너먼트 진행 상태 및 가중치 저장
- **CDN 의존성:**

| 라이브러리 | 버전 | 용도 |
|---|---|---|
| Leaflet | 1.9.4 | 인터랙티브 지도 |
| pdf.js | 3.11.174 | PDF 렌더링 |

---

## 5개 탭

### 1. 개요 & 카드 (`tab-cards.js`)
- **분할 레이아웃:** 왼쪽=카드 목록(460px), 오른쪽=선택된 리조트 상세 패널
- 정렬 버튼: 워터풀 4박 최저가 / 비치+워터 믹스 / 워터 4박 / 비치 4박
- 필터: 이동 수단 (`seaplane`/`speedboat` 타입 기준) / 지역 / 해먹 여부 / 최대 예산 슬라이더
- 카드 클릭 → 오른쪽 패널에 인라인 상세 렌더 (`openDetailInCards()`, 오버레이 아님)
- 허니문 티어 배지: 최상 / 중간 / 단순

### 2. 가격비교 (`tab-price.js`)
- 전체 리조트 × 4가지 가격 항목 비교 테이블
- 여행사별 원가/할인가 동시 표시
- 최저가 셀 강조 (`최저` 배지)
- 컬럼 헤더 클릭 → 오름차순/내림차순 정렬 토글
- 1인 / 2인 합산 전환 토글 (`coupleMode`)

### 3. 지도 (`tab-map.js`)
- `index.html`에 SVG 지도 하드코딩 (12개 리조트 핀 + 말레 공항)
- 핀 클릭 → 우측 패널에 **바로 전체 리조트 상세** 표시 (`openDetailInMap()`, 중간 요약 단계 없음)
- "인터랙티브 지도 열기" → Leaflet + OpenStreetMap 레이어 지연 로드
- Leaflet 마커 클릭 → 팝업 + 상세 보기 버튼

### 4. 토너먼트 (`tab-tournament.js`)
- 9개 리조트 1:1 랜덤 매칭 → 최종 우승 리조트 도출
- 가중치 슬라이더 (라군뷰·수중환경·프라이빗·다이닝·예산, 0~3단계)
- 진행 상태 localStorage 자동 저장 (`maldives-tournament-state`)
- 결과 화면에서 상세 보기 → `open-detail` 커스텀 이벤트로 오버레이 연결

### 5. PDF 뷰어 (`tab-pdf.js`)
- 좌측 사이드바: 리조트별 견적서 6개 + 특가 패키지 4개
- `data/` 폴더의 PDF 파일을 canvas에 렌더링 (pdf.js)
- 페이지 이동 컨트롤 (이전/다음/직접 입력)
- **로컬 서버 필요:** `file://` 프로토콜에서는 PDF 로드 불가 → VS Code Live Server 필요
- `open-pdf` 커스텀 이벤트로 다른 탭에서 PDF 열기 가능

---

## 상세 패널 / 오버레이 (`app.js`)

| 함수 | 렌더 위치 | 용도 |
|---|---|---|
| `openDetailInCards(id)` | `#cardsDetailPanel` (카드 탭 오른쪽) | 카드 클릭 |
| `openDetailInMap(id)` | `#mapInfoPanel` (지도 탭 오른쪽) | SVG 핀 클릭 |
| `openDetail(id)` | `#detailOverlay` (전체화면 오버레이) | 토너먼트 결과에서 상세보기 |

`renderResortDetail(resort)` 공통 HTML 구조:
- 이미지 갤러리 (썸네일 hover → ⭐ 클릭 시 대표 이미지 설정, localStorage 저장)
- 아톨, 이동 수단, 여행사 배지
- 평점 4항목 (라군/수중/프라이빗/다이닝)
- 여행사별 가격표 (원가 → 할인가, 허니문 혜택)
- 장단점 목록
- 유튜브 영상 섹션
- PDF 보기 버튼 → `openPdfFromDetail()` → `open-pdf` 이벤트 발송

---

## 리조트 데이터 (`resorts-data.js`)

### 내보내기
```js
export const RESORTS       // 리조트 배열 (12개)
export const TRIP_INFO     // 여행 일정 정보 (출발일: 2027-03-08 등)
export const AGENCIES      // 여행사 정보 (3개: realmaldives, honeymoonresort, tourmin)
export function getBestPrice(resort, priceKey)
export function sortByPrice(resorts, priceKey)
export function getResortById(id)
export function getFeaturedImage(resort)  // localStorage 저장값 우선, 없으면 featured_image, 없으면 image_urls[0]
```

### 리조트 객체 구조
```js
{
  id, name_ko, name_en, atoll,
  transfer_type,      // 'seaplane' | 'speedboat'
  transfer_minutes,   // 이동 시간 (분)
  distance_km,
  has_hammock,        // 해먹 빌라 여부
  ratings: { lagoon, underwater, privacy, dining }, // 1~5
  honeymoon_tier,     // '최상' | '중간' | '단순'
  agencies: {
    realmaldives: { meal_plan, meal_plan_name, beach_4n, water_4n, water_pool_4n, mix_4n, *_disc, honeymoon_benefits },
    honeymoonresort: { ... },  // 일부 리조트만
    tourmin: { ... }           // 투어민 3개 리조트 (PDF 없음)
  },
  pdfs,               // 연결 PDF 파일 경로 배열 (tourmin 리조트는 [])
  coords: { lat, lon },
  svg_pin: { cx, cy, color }, // SVG 지도 핀 좌표
  tags, pros, cons,
  image_urls,
  featured_image,     // '' 기본값. getFeaturedImage()는 localStorage 저장값 우선 사용
  youtube_ids,        // YouTube 영상 ID 배열
  description
}
```

### 가격 키
| 키 | 설명 |
|---|---|
| `beach_4n` | 비치빌라 4박 1인 USD |
| `water_4n` | 워터빌라 4박 1인 USD |
| `water_pool_4n` | 워터풀빌라 4박 1인 USD |
| `mix_4n` | 비치+워터 믹스 4박 1인 USD |
| `*_disc` | 할인 적용 후 가격 (없으면 원가 사용) |

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

## D-day 배지

`app.js`의 `updateDDay()` — 여행 출발일 `2027-03-08` 기준으로 헤더 D-day 뱃지 업데이트.  
DOM ID: `#ddayBadge`

---

## 탭 지연 초기화

`app.js`에서 각 탭은 **처음 클릭될 때 한 번만** 초기화 (`tabInited` Set 체크).  
초기 로드 시에는 카드 탭만 초기화됨.

---

## 디자인 시스템 (`css/styles.css`)

```css
:root {
  --ocean-deep:    #0c447c;  /* 헤더 배경 */
  --ocean-mid:     #185FA5;  /* 강조 블루 */
  --ocean-light:   #E6F1FB;
  --ocean-pale:    #f0f7ff;
  --teal:          #1D9E75;  /* 가격 강조 */
  --teal-light:    #E1F5EE;
  --coral:         #D85A30;  /* 경고/리얼몰디브 배지 */
  --coral-light:   #FAECE7;
  --purple:        #7F77DD;  /* 허니문리조트 배지 */
  --amber:         #BA7517;
  --gray-50:       #f8f7f5;  /* 배경 */
  --radius:        8px;
  --radius-lg:     12px;
  --shadow:        0 2px 8px rgba(0,0,0,0.08);
}
```

- 폰트: `'Apple SD Gothic Neo', 'Pretendard', -apple-system, 'Malgun Gothic'`
- 레이아웃: `body { display: flex; flex-direction: column; overflow: hidden; }` → 헤더 + 탭바 + 스크롤 콘텐츠 영역

---

## 데이터 수정 방법

리조트 정보 변경 → `js/resorts-data.js` 직접 편집.  
PDF 파일 추가 → `data/리조트별/` 또는 `data/패키지/`에 파일 추가 후 `tab-pdf.js`의 `PDF_FILES` 배열에 항목 추가.

---

## 디자인 시스템 (`css/styles.css`)

sungso 루트 사이트와 통일된 핑크/로즈 테마:
- 배경: `linear-gradient(135deg, #FFF5F7 0%, #FFF0EA 100%)`
- 헤더: `#C44B6A → #FF6B9D` 그라디언트
- 주요 변수: `--primary: #FF6B9D`, `--primary-deep: #C44B6A`
- `--ocean-*` 변수는 핑크로 리매핑 (backward compat)
- 카드 탭: `.cards-split-layout` (460px 왼쪽 + flex:1 오른쪽)

## 대표 이미지 설정 방법

1. **코드로 설정:** `resorts-data.js`에서 해당 리조트의 `featured_image: 'https://...'`에 URL 직접 입력
2. **UI로 설정:** 리조트 상세 > 이미지 갤러리 > 썸네일 hover > ⭐ 클릭
   - `localStorage['featured_img_' + resortId]`에 저장됨
   - 브라우저 캐시 삭제 시 초기화됨

## 리조트 메모 (Firebase)

`js/firebase-notes.js` — `resort_notes` Firestore 컬렉션 연동 (신규 파일)

| 함수 | 설명 |
|---|---|
| `loadNote(resortId)` | 문서 ID = resortId, `note` 필드 읽기 |
| `saveNote(resortId, text)` | `{ note, updatedAt: serverTimestamp() }` 병합 저장 |

- 모든 상세 패널(카드·지도·오버레이)에서 리조트를 열면 자동 로드
- textarea `input` 시 1.5초 debounce 자동저장 + 수동 저장 버튼

---

## 진행 상황

| 날짜 | 작업 |
|---|---|
| 2026-06-12 | CLAUDE.md 최초 작성 |
| 2026-06-12 | 핑크 테마 전환, 리조트 3개 추가(투어민), featured_image 지원 |
| 2026-06-12 | UX 7종 개선: 분할레이아웃·지도 핀 직접 상세·토너먼트 버그·필터 단순화·2인합산 수정·대표이미지 UI |
| 2026-06-12 | UX 5종 추가: 카드→분할 전환·홈 내비바·스크롤 픽스·리조트 메모(Firebase)·토너먼트 상세보기 |
