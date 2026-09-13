# wecost — 결혼 비용 대시보드 구조 가이드

> 이 문서는 wecost 프로젝트의 현재 구현 방식을 기록한 참고자료입니다.
> 향후 Firebase 전환 및 UI/UX 개선 작업의 기준선으로 활용합니다.

---

## 파일 구조

```
wecost/
├── index.html              ← 단일 파일 앱 (HTML + CSS + JS 통합, ~1400줄)
├── CLAUDE.md
├── README.md
├── backup/
│   └── index.html          ← 이전 버전 백업
└── _reference/
    ├── 셋업가이드.md        ← Google Sheets 연동 + 배포 가이드
    ├── 결혼비용_템플릿.csv  ← 54행, 17개 카테고리 템플릿
    └── *.html               ← 참고용 레퍼런스
```

**설계 원칙:** 빌드 도구 없음. 외부 의존성은 Chart.js CDN 하나. 모든 코드가 `index.html` 한 파일에 담겨 있음.

---

## 외부 의존성

| 라이브러리 | 버전 | 용도 |
|---|---|---|
| Chart.js | v4.5.0 | 도넛·바·라인 차트 |

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.js"></script>
```

Firebase 없음. Google Sheets CSV를 직접 파싱하는 방식.

---

## 탭 구성 (3개 페이지 SPA)

| 탭 | page ID | 주요 기능 |
|---|---|---|
| 💍 결혼비용 | `wedding` | CSV 항목 테이블, 카테고리 차트, 잔금 타임라인 |
| 🏦 저축 계획 | `savings` | 소희/성우 월별 누적 저축 계산, 라인 차트 |
| 🏠 집 계획 | `house` | 대출 시뮬레이터, 현금 가용액 계산 |

탭 전환: `showPage(id)` 함수로 DOM 클래스만 토글 (페이지 이동 없음).

---

## Google Sheets 연동 방식 (현재 구조)

### 시트 구성

```
SHEET_ID = '1BzjkHnu6fugv2M2W6itFoXTK2lakgw765AcZvPs4pOQ'

GID_WEDDING  = '567740729'   ← 결혼비용 항목 시트
GID_SETTINGS = '1793910263'  ← 설정값 (예산, 저축, 지원금) 시트
```

### 데이터 수취 흐름

`fetchCSVText(gid)` 함수가 아래 4개 URL을 순서대로 시도. 하나라도 성공하면 중단.

```
1) Google Visualization API
   https://docs.google.com/spreadsheets/d/{ID}/gviz/tq?tqx=out:csv&gid={gid}

2) Google Sheets Export
   https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid={gid}

3) CORS 프록시 (corsproxy.io)
   https://corsproxy.io/?{encodeURIComponent(URL2)}

4) CORS 프록시 (allorigins.win)
   https://api.allorigins.win/raw?url={encodeURIComponent(URL2)}
```

> **CORS 이슈**: 구글 시트는 브라우저 직접 접근 시 CORS 헤더가 없어서 공개 프록시 경유.
> 이 방식이 Firebase로 전환하는 주된 이유 중 하나.

### 사용자 커스텀 URL

`localStorage['wedding_sheet_url']`에 저장. "⚙️ 시트 설정" 패널에서 직접 입력 가능.

---

## 데이터 구조

### 결혼비용 시트 (GID_WEDDING)

CSV 파싱 결과 → `st.items[]` 배열

| CSV 컬럼 | JS 필드 | 타입 | 예시 |
|---|---|---|---|
| 이름 | `name` | string | "웨딩홀" |
| 카테고리 | `cat` | string | "🏰웨딩홀" |
| 예정금액 | `planned` | number | 5000000 |
| 지출금액 | `actual` | number | 2500000 |
| 계약금 | `deposit` | number | 500000 |
| 계약금지급일 | — | date string | "2026-03-15" |
| 잔금 | `balance` | number | 4500000 |
| 잔금지급일 | `balanceDue` | date string | "2026-08-01" |
| 메모 | `memo` | string | "강남구" |

### 설정 시트 (GID_SETTINGS)

키-값 쌍 구조. `findSetting(parsed, ...keys)`로 부분 키 매칭.

| 키 | `st` 필드 | 예시값 |
|---|---|---|
| 총결혼예산 | `st.targetBudget` | 50000000 |
| 집예산 | `st.houseBudget` | 300000000 |
| 소희부모님지원 | `st.parentSohee` | 50000000 |
| 성우부모님지원 | `st.parentSunwo` | 50000000 |
| 회사대출금액 | `st.companyLoanAmt` | 100000000 |
| 소희현재저축 | UI 입력 초기값 | 30000000 |
| 소희월저축 | UI 입력 초기값 | 2000000 |
| 성우현재저축 | UI 입력 초기값 | 40000000 |
| 성우월저축 | UI 입력 초기값 | 3000000 |
| 결혼예정일 | UI 입력 초기값 | "2027-03-06" |

---

## 전역 상태 (`st` 객체)

```js
const st = {
  // CSV에서 로드
  items: [],            // 결혼비용 항목 배열
  targetBudget: 0,
  houseBudget: 0,
  parentSohee: 0,
  parentSunwo: 0,
  companyLoanAmt: 0,

  // 사용자가 추가한 대출 목록 (UI 입력)
  loans: [],

  // 계산 결과 (computeSavings()에서 갱신)
  soheeFinal: 0,        // 소희 총 저축 예상액
  sunwoFinal: 0,        // 성우 총 저축 예상액
  coupleSavings: 0,     // 부부 합계

  // 렌더링 중 계산
  totalPlanned: 0,      // 결혼비용 예정 합계
  totalPaid: 0,         // 결혼비용 실지출 합계
};
```

---

## 데이터 흐름

```
Google Sheets (CSV 공개 게시)
        │
        ▼
fetchCSVText(gid)  ← 4개 URL 순차 시도
        │
        ├─ parseWeddingCSV()  → st.items[]
        └─ parseSettingsCSV() → applySettings()
                                  → UI 입력값 초기화
        │
        ▼
updateAll()
  ├─ saveUIState()         → localStorage 저장
  ├─ computeSavings()      → st.soheeFinal / sunwoFinal / coupleSavings
  ├─ renderWedding()       → 요약카드, 차트, 타임라인, 테이블
  ├─ renderSavings()       → 라인 차트
  └─ renderHouse()         → 가용현금, 대출 시뮬레이터
```

---

## localStorage 저장 항목

키: `wedding_ui_v2` (JSON)

```js
{
  wedDate: "2027-03-06",
  soheeCur: 30000000,
  soheeMon: 2000000,
  sunwoCur: 40000000,
  sunwoMon: 3000000,
  loanLimit: 0,
  incSohee: false,      // 소희 부모 지원 포함 여부
  incSunwo: false,      // 성우 부모 지원 포함 여부
  loans: [],            // 추가된 대출 배열
  extras: [],           // 조정 항목 (+지출 / -수입)
}
```

---

## 주요 함수 목록

### 데이터 로딩

| 함수 | 역할 |
|---|---|
| `init(force)` | 앱 시작, CSV 로드 |
| `fetchCSVText(gid)` | 4개 URL 시도 후 CSV 텍스트 반환 |
| `parseWeddingCSV(text)` | 결혼비용 CSV → `st.items` |
| `parseSettingsCSV(text)` | 설정 CSV → 객체 |
| `applySettings(parsed, force)` | 설정값을 UI 입력에 반영 |
| `manualRefresh()` | 수동 새로고침 버튼 |
| `silentRefresh()` | 5분 자동 백그라운드 새로고침 |

### 계산

| 함수 | 역할 |
|---|---|
| `computeSavings()` | 저축 탭 계산 (소희/성우/합계) |
| `calcLoanMonthly(loan)` | 대출 월 상환액 계산 |
| `monthsBetween(dateStr)` | 결혼일까지 개월 수 |
| `dday(dateStr)` | D-day 계산 |

대출 계산 방식 4종:
- **원리금균등**: `P * r(1+r)^n / ((1+r)^n - 1)`
- **원금균등**: 첫 달 최대, 이후 점감
- **만기일시**: 이자만 납부
- **사내대출**: 무이자 거치 후 원리금균등

### 렌더링

| 함수 | 역할 |
|---|---|
| `renderWedding()` | 결혼비용 탭 전체 |
| `renderSavings()` | 저축 계획 탭 전체 |
| `renderHouse()` | 집 계획 탭 전체 |
| `renderPresetCards()` | 1억~6억 프리셋 카드 6개 |
| `renderLoans(availCash)` | 추가된 대출 카드 목록 |

### 숫자 포맷

| 함수 | 출력 예시 |
|---|---|
| `won(n)` | "₩5억", "₩200만" (축약) |
| `wonFull(n)` | "₩5,000,000" (전체) |
| `wonDetailed(n)` | "₩1억 2,345만" |
| `parseNum(s)` | "₩205,000,000" → 205000000 |

---

## 탭별 렌더링 로직

### 💍 결혼비용 탭

1. **요약 카드** — 총예산 / 지출완료 / 잔액
2. **진행률 바** — `totalPaid / totalPlanned * 100%` (width 애니메이션)
3. **자산 배분 밴드** — 부부 저축 대비 집:결혼:여유 비율 (CSS transition)
4. **파이 차트** — 카테고리별 예정금액 (상위 10개, Chart.js 도넛)
5. **바 차트** — 예정 vs 지출 비교 (상위 8개, Chart.js 바)
6. **잔금 타임라인** — `balance > 0` 항목, D-day 오름차순 정렬
   - 색상: `past`(회색) / `urgent`(D-7, 빨강) / `soon`(D-30, 주황) / `normal`(보라)
7. **카테고리 요약** — 17개 카테고리별 바 그래프
8. **상세 테이블** — 전체 항목, 예정금액 내림차순

### 🏦 저축 계획 탭

계산: `soheeFinal = soheeCur + soheeMon × months`

1. **결혼까지 N개월** 표시
2. **요약 3카드** — 소희 / 성우 / 합계
3. **라인 차트** — 월별 누적 저축 (3개 선: 소희·성우·합계, 최대 60개월)

### 🏠 집 계획 탭

**가용 현금 계산:**
```
availCash = coupleSavings
          - totalPlanned
          + (incSohee ? parentSohee : 0)
          + (incSunwo ? parentSunwo : 0)
          + sum(extras의 +/- 조정항목)
```

1. **가용 현금 섹션** — 계산 과정 행 단위 표시
2. **프리셋 카드** — 1억~6억 대출 시나리오 (가용현금 + 대출 = 집 예산)
3. **슬라이더로 대출 추가** — 0~10억, 1000만 단위
4. **대출 카드** — 금액·금리·기간·상환방식 입력 → 월 상환액 자동 계산
5. **월 감당액 바** — 총 월납입 vs 설정 한도

---

## DOM 주요 ID 맵

### 공통
| ID | 역할 |
|---|---|
| `#dash` | 메인 대시보드 컨테이너 |
| `#loading-screen` | 로딩/에러 화면 |
| `#config-panel` | 구글 시트 URL 설정 모달 |
| `#sidebar` | 좌측 네비게이션 (데스크탑) |

### 결혼비용 탭
| ID | 역할 |
|---|---|
| `#s-total`, `#s-paid`, `#s-remain` | 요약 카드 3개 |
| `#prog-fill` | 진행률 바 |
| `#band-house`, `#band-wedding`, `#band-remain` | 자산 배분 밴드 세그먼트 |
| `#pie`, `#bar` | Chart.js 캔버스 |
| `#timeline` | 잔금 타임라인 |
| `#cat-rows` | 카테고리 요약 |
| `#tbl-body` | 상세 테이블 |

### 저축 계획 탭
| ID | 역할 |
|---|---|
| `#inp-wed-date` | 결혼 예정일 |
| `#inp-sohee-cur`, `#inp-sohee-mon` | 소희 현재/월 저축 |
| `#inp-sunwo-cur`, `#inp-sunwo-mon` | 성우 현재/월 저축 |
| `#res-sohee-tot`, `#res-sunwo-tot`, `#res-couple-tot` | 결과 카드 |
| `#savings-chart` | 라인 차트 캔버스 |

### 집 계획 탭
| ID | 역할 |
|---|---|
| `#cash-savings`, `#cash-wedding` | 가용액 계산 행 |
| `#chk-sohee-sup`, `#chk-sunwo-sup` | 부모 지원 체크박스 |
| `#extra-expenses-list` | 조정 항목 리스트 |
| `#cash-available` | 최종 가용 현금 |
| `#preset-grid` | 프리셋 카드 컨테이너 |
| `#add-loan-slider`, `#add-loan-amt-inp` | 대출 추가 슬라이더/입력 |
| `#loan-grid` | 추가된 대출 카드 목록 |
| `#inp-loan-limit`, `#tl-total`, `#tl-status` | 월 감당 한도 / 상태 |

---

## 카테고리 시스템

17개 고정 카테고리, 각각 색상 맵 보유:

```
🏰웨딩홀 / 👗스드메 / 🤵🏻예복 / 💍예물예단 / 📷본식스냅영상
💄관리비용 / 👥청첩장모임 / 🎞️스냅촬영 / 🎁선물답례 / ✈️신혼여행
🚘차(교통비) / 🏠집 / 🛠️인테리어 / 🧴생활용품 / 🔌가전 / 🛏️가구 / ✨기타
```

---

## CSS 디자인 시스템

```css
:root {
  --purple: #6c63ff;   /* 결혼 관련, 액센트 */
  --green:  #2ecc71;   /* 완료, 수입, 안전 */
  --red:    #e74c3c;   /* 경고, 초과, 지출 */
  --orange: #f39c12;   /* 임박 주의 */
  --blue:   #3498db;   /* 집, 자산 */
  --bg:     #f4f5fb;   /* 페이지 배경 */
  --card:   #ffffff;   /* 카드 배경 */
  --text:   #1a1a2e;   /* 본문 */
  --sub:    #888;      /* 보조 */
  --sb-w:   220px;     /* 사이드바 너비 */
}
```

반응형 분기점: `max-width: 768px` — 사이드바가 상단 탭 네비로 전환

---

## Firebase 전환 시 바뀌는 것 (예정)

현재 방식과 Firebase 방식 대응표:

| 현재 (Google Sheets CSV) | Firebase 전환 후 |
|---|---|
| `fetchCSVText()` 4개 URL 시도 | Firestore `getDoc` / `onSnapshot` |
| `parseWeddingCSV()` 직접 파싱 | Firestore 문서 구조로 저장 |
| `parseSettingsCSV()` 키-값 파싱 | Firestore 설정 문서 |
| CORS 프록시 경유 | Firebase SDK 직접 호출 |
| `localStorage` UI 상태 저장 | 유지 (UI 상태는 로컬이 적절) |
| `silentRefresh()` 5분 폴링 | `onSnapshot` 실시간 구독으로 대체 |
| 읽기 전용 (시트 직접 편집) | 앱에서 직접 추가/수정/삭제 가능 |

**Firestore 컬렉션 설계안 (미확정):**
```
wecost_items/{docId}         ← 결혼비용 항목 (현재 st.items 각 행)
wecost_settings/main         ← 설정값 (현재 GID_SETTINGS 내용)
```

---

## 알려진 제약사항

1. **데이터 편집 불가** — 시트 직접 접근으로 읽기만 가능. 앱에서 항목 추가/수정/삭제 없음.
2. **CORS 의존성** — 공개 프록시 서비스 상태에 따라 로딩 실패 가능성.
3. **단일 파일** — 코드가 1400줄 한 파일. 기능 추가 시 유지보수 난이도 증가.
4. **Chart.js 인스턴스 관리** — `renderWedding()` 재호출 시 기존 차트 destroy 후 재생성.
5. **저축/집 탭 데이터** — 구글 시트와 무관. 100% localStorage + UI 입력값 기반.
