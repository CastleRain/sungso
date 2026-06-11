# wecost — 결혼 비용 대시보드

성우 & 소희의 결혼 준비 비용을 항목별로 관리하고 저축/집 계획을 시뮬레이션하는 단일 파일 앱.

**배포 URL:** `https://CastleRain.github.io/sungso/wecost/`  
**데이터 소스:** Google Sheets (CSV 웹 게시)

---

## 폴더 구조

```
wecost/
├── index.html           ← 앱 전체 (HTML + CSS + JS 단일 파일, 약 1400줄)
├── README.md
├── backup/
│   └── index.html       ← 이전 버전 백업
└── _reference/
    ├── 셋업가이드.md      ← 구글 시트 연결·배포 방법 설명
    ├── 결혼비용_템플릿.csv ← 구글 시트에 가져올 컬럼 템플릿
    ├── index.html        ← 참고용 레퍼런스
    └── wedding-dashboard.html ← 참고용 레퍼런스
```

---

## 아키텍처

- **빌드 도구 없음** — `index.html` 하나로 완결
- **외부 의존성 CDN:** Chart.js v4.5.0 (`cdn.jsdelivr.net/npm/chart.js@4.5.0`)
- **Firebase 없음** — Google Sheets를 CSV로 웹 게시하여 데이터 소스로 사용
- **백엔드 없음** — CORS 우회를 위해 여러 프록시 URL 시도 (`fetchCSVText()`)
- **localStorage** — UI 상태 및 사용자 입력값 영속화

---

## Google Sheets 연동

```js
const SHEET_ID    = '1BzjkHnu6fugv2M2W6itFoXTK2lakgw765AcZvPs4pOQ';
const GID_WEDDING = '567740729';   // 결혼비용 시트
const GID_SETTINGS = '1793910263'; // 설정 시트 (예산·저축 파라미터)
```

`fetchCSVText(gid)` 함수가 4개 URL 후보를 순서대로 시도:
1. `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`
2. `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`
3. `https://corsproxy.io/?...` (CORS 프록시)
4. 사용자가 localStorage에 저장한 커스텀 CSV URL

### 결혼비용 시트 컬럼 (`parseWeddingCSV()`)
| 컬럼 | 설명 |
|---|---|
| 이름 | 항목명 |
| 카테고리 | 고정 값 (17가지, `CAT_COLOR` 맵 참조) |
| 예정금액 | 예상 지출 (원 단위 숫자) |
| 지출금액 | 실제 지출 |
| 계약금 | 계약금 납부액 |
| 계약금지급일 | YYYY-MM-DD |
| 잔금 | 남은 잔금 |
| 잔금지급일 | YYYY-MM-DD |
| 메모 | 자유 입력 |

### 설정 시트 (`parseSettingsCSV()` + `findSetting(key)`)
설정 키-값 쌍으로 구성. 주요 키:
| 키 | 설명 |
|---|---|
| `예산` | 전체 결혼 예산 |
| `소희부모님지원` | 소희 부모님 지원금 |
| `성우부모님지원` | 성우 부모님 지원금 |
| `회사대출` | 회사 대출 금액 |
| `소희저축` | 소희 월 저축액 |
| `성우저축` | 성우 월 저축액 |
| `목표월` | 저축 목표 연월 |
| `집예산` | 집 예산 |

---

## 상태 관리

`updateAll()` 이 호출될 때마다 `st` 객체가 재계산됨. `computeSavings()` + `renderWedding()` + `renderSavings()` + `renderHouse()` 를 차례로 실행.

### `st` 상태 객체 주요 필드
```js
st = {
  items,           // CSV에서 파싱한 항목 배열
  targetBudget,    // 설정 시트의 '예산'
  houseBudget,     // 설정 시트의 '집예산'
  parentSohee,     // 소희 부모님 지원금
  parentSunwo,     // 성우 부모님 지원금
  companyLoanAmt,  // 회사 대출금
  loans,           // 자체 추가 대출 배열
  soheeFinal,      // 소희 최종 보유액
  sunwoFinal,      // 성우 최종 보유액
  coupleSavings,   // 합계 저축액
  totalPlanned,    // 전체 예정 지출액
  totalPaid,       // 전체 실제 지출액
}
```

---

## 3개 페이지

### 1. 결혼비용 (wedding)
- CSV에서 불러온 항목 테이블 (카테고리별 색상 구분)
- 요약 카드: 전체 예산 / 예정 지출 / 실제 지출 / 잔액
- 카테고리별 도넛 차트 (Chart.js)
- 잔금 일정 타임라인
- `CAT_COLOR` 맵: 17개 결혼 카테고리별 색상 정의

### 2. 저축계획 (savings)
- 소희/성우 개인 저축 현황 바
- 커플 합산 저축 목표 vs 실제
- 월별 저축 필요액 계산
- 지원금 + 대출 합산 시뮬레이션

### 3. 집계획 (house)
- `calcLoanMonthly(principal, annualRate, months)` — 대출 월 상환액 계산
- 프리셋 카드: 1억~6억 전셋값 기준 시뮬레이션
- 멀티 대출 그리드: 여러 대출 시나리오 동시 비교
- 커플 보유액 대비 필요 대출액 계산

---

## localStorage 키

| 키 | 내용 |
|---|---|
| `wedding_sheet_url` (`LS_KEY`) | 사용자가 직접 입력한 커스텀 CSV URL |
| `wedding_ui_v2` (`LS_UI`) | UI 상태 (활성 페이지, 확장/접힘 등) |
| `maldives-tournament-state` | 토너먼트 진행 상태 (honeymoon 앱) |

---

## 자동 새로고침

`silentRefresh()` — 5분마다 백그라운드에서 CSV 재요청 후 `updateAll()` 호출. 사용자 입력 방해 없이 데이터 갱신.

---

## 디자인 시스템

```css
:root {
  --purple: #6c63ff;    /* 메인 액센트 */
  --green:  #2ecc71;    /* 긍정/완료 */
  --red:    #e74c3c;    /* 경고/초과 */
  --bg:     #f4f5fb;    /* 배경 */
}
```

- 사이드바 고정 네비게이션 (데스크탑) / 상단 탭 네비게이션 (모바일)
- 반응형: `max-width: 768px` 기준 모바일 레이아웃 전환
- 카드 `border-radius: 12px`, 그림자: `0 2px 8px rgba(0,0,0,0.08)`

---

## 주요 DOM ID

| ID | 역할 |
|---|---|
| `settingsModal` | 구글 시트 URL 입력 모달 |
| `totalBudget` | 전체 예산 표시 |
| `totalSpent` | 실제 지출 표시 |
| `itemsTable` | 결혼비용 항목 테이블 |
| `categoryChart` | 도넛 차트 캔버스 |
| `savingsBars` | 저축 현황 바 컨테이너 |
| `houseSimulator` | 집 대출 시뮬레이터 |

---

## 데이터 수정 방법

Google Sheets에서 직접 편집 → 자동 새로고침 또는 수동 새로고침으로 반영.  
GitHub 코드 편집으로는 항목 데이터 변경 불가 (DB가 Google Sheets).

---

## 진행 상황

| 날짜 | 작업 |
|---|---|
| 2026-06-12 | CLAUDE.md 최초 작성 — 파일 구조 및 주요 기능 문서화 |
