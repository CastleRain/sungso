# honeymoon — 몰디브 신혼여행 플래너

성우 & 소희의 몰디브 리조트 비교 및 패키지 정보를 정리한 플래너.

**배포 URL:** `https://CastleRain.github.io/sungso/honeymoon/`  
**데이터:** `js/resorts-data.js`에 하드코딩 (9개 리조트, 2개 여행사)

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
- 리조트 카드 그리드 (이미지, 평점, 최저가 표시)
- 정렬 버튼: 워터풀 4박 최저가 / 비치+워터 믹스 / 워터 4박 / 비치 4박
- 필터: 이동 수단 (수상비행기/스피드보트) / 아톨 / 해먹 빌라 여부
- 카드 클릭 → 상세 오버레이 (`openDetail()`)
- 허니문 티어 배지: 최상 / 중간 / 단순

### 2. 가격비교 (`tab-price.js`)
- 전체 리조트 × 4가지 가격 항목 비교 테이블
- 여행사별 원가/할인가 동시 표시
- 최저가 셀 강조 (`최저` 배지)
- 컬럼 헤더 클릭 → 오름차순/내림차순 정렬 토글
- 1인 / 2인 합산 전환 토글 (`coupleMode`)

### 3. 지도 (`tab-map.js`)
- `index.html`에 SVG 지도 하드코딩 (9개 리조트 핀 + 말레 공항)
- 핀 클릭 → 우측 패널에 리조트 요약 (가격·평점·이동수단)
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

## 상세 오버레이 (`app.js`)

`openDetail(resortId)` / `closeDetail()` 로 제어.

`renderResortDetail(resort)` 가 생성하는 HTML 구조:
- 리조트 이미지 헤더
- 아톨, 이동 수단, 여행사 배지
- 평점 4항목 (라군/수중/프라이빗/다이닝)
- 여행사별 가격표 (원가 → 할인가, 허니문 혜택)
- 장단점 목록
- PDF 보기 버튼 → `window.openPdfFromDetail()` → `open-pdf` 이벤트 발송

---

## 리조트 데이터 (`resorts-data.js`)

### 내보내기
```js
export const RESORTS       // 리조트 배열 (9개)
export const TRIP_INFO     // 여행 일정 정보 (출발일: 2027-03-08 등)
export const AGENCIES      // 여행사 정보 (2개)
export function getBestPrice(resort, priceKey)
export function sortByPrice(resorts, priceKey)
export function getResortById(id)
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
    honeymoonresort: { ... }  // 일부 리조트만
  },
  pdfs,               // 연결 PDF 파일 경로 배열
  coords: { lat, lon },
  svg_pin: { x, y, color },
  tags, pros, cons,
  image_urls,
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

### 9개 리조트 목록
| id | 이름 | 아톨 | 이동 |
|---|---|---|---|
| `cora_cora` | 코라코라 | 라무 아톨 | 수상비행기 |
| `ananea` | 아나네아 | 바 아톨 | 수상비행기 |
| `veligandu` | 벨리간두 | 아리 아톨 | 수상비행기 |
| `dhigufaru` | 디구파루 | 바 아톨 | 수상비행기 |
| `furaveri` | 푸라베리 | 라무 아톨 | 수상비행기 |
| `fushifaru` | 푸시파루 | 라무 아톨 | 수상비행기 |
| `raaya` | 라야 | 라무 아톨 | 수상비행기 |
| `varu` | 앳모스피어바루 | 북말레 아톨 | 스피드보트 40분 |
| `saii_so` | 사이라군+SO | 북말레 아톨 | 스피드보트 40분 |

### 2개 여행사
| id | 이름 | 특이사항 |
|---|---|---|
| `realmaldives` | 리얼몰디브 | 기본 여행사 |
| `honeymoonresort` | 허니문리조트 | $200 추가 할인 (기간 한정) |

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

## 진행 상황

| 날짜 | 작업 |
|---|---|
| 2026-06-12 | CLAUDE.md 최초 작성 — 파일 구조, 탭별 기능, 데이터 구조 문서화 |
