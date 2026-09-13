# wecost — 결혼 재무 대시보드

성우 & 소희의 결혼 준비 비용을 항목별로 관리하고 저축/집 계획을 시뮬레이션하는 4탭 SPA.

**배포 URL:** `https://CastleRain.github.io/sungso/wecost/`  
**데이터 소스:** Firebase Firestore (`sungso-358cb` 프로젝트, 동일 앱)

---

## 폴더 구조

```
wecost/
├── index.html          ← 4탭 HTML 뼈대 (Chart.js CDN + app.js module)
├── css/
│   ├── base.css        ← CSS 변수, 리셋, 공통 유틸
│   ├── layout.css      ← 사이드바/탭바, 카드, 지표 그리드, 반응형
│   ├── dashboard.css   ← 대시보드 전용 (흐름바, upcoming, 시뮬레이터)
│   ├── cashflow.css    ← 현금흐름 전용 (저축 요약 카드, 인물 카드)
│   ├── wedding.css     ← 결혼비용 전용 (카테고리 바, 상태 뱃지, 접기)
│   └── house.css       ← 집 시뮬 전용 (대출 카드, 프리셋 카드, 조정 항목)
├── js/
│   ├── app.js          ← 진입점 (type="module"): 구독·계산·탭·핸들러
│   ├── firebase.js     ← Firebase 초기화, subscribeAll, CRUD
│   ├── calc.js         ← computeAll, calcLoanMonthly (순수 계산)
│   ├── utils.js        ← won, wonFull, wonDetailed, dday, fmtComma 등
│   ├── tab-dashboard.js← 대시보드 탭 렌더 + target price 핸들러
│   ├── tab-cashflow.js ← 현금흐름 탭 렌더 + 저축 입력 debounce
│   ├── tab-wedding.js  ← 결혼비용 탭 렌더 (4카드+카테고리바+타임라인+테이블)
│   └── tab-house.js    ← 집 시뮬 탭 렌더 + 대출/조정 CRUD 핸들러
├── index.old.html      ← 구버전 백업 (Google Sheets 기반 단일 파일)
└── _reference/         ← 참고용 파일들 (삭제 금지)
```

---

## Firebase 스키마

컬렉션 이름은 모두 `wecost_` 접두사로 sungso 루트의 `events` 컬렉션과 구분.

| 컬렉션 | 문서 ID | 주요 필드 |
|---|---|---|
| `wecost_settings` | `main` | weddingDate, targetWeddingBudget, targetHousePrice, monthlyPaymentLimit, parentSupportSohee, parentSupportSunwo |
| `wecost_items` | auto-ID | name, cat, planned, deposit, actual, balance, balanceDue, memo, updatedAt |
| `wecost_savings` | `main` | soheeCurrent, soheeMonthly, sunwoCurrent, sunwoMonthly, updatedAt |
| `wecost_loans` | auto-ID | name, amount, rate, term, grace, type, enabled, updatedAt |
| `wecost_adjustments` | auto-ID | name, amount, sign (+/-), updatedAt |

**항목 필드 주의:** `category` 아닌 **`cat`** 사용. `loan.type` 값: `원리금` / `원금` / `만기` / `company`.

**초기 시딩:** `wecost_settings/main`, `wecost_savings/main`이 없으면 첫 로드 시 자동 생성.

---

## 아키텍처

- **빌드 도구 없음** — 외부 의존성은 CDN만 (Chart.js, Firebase)
- **ES Module 패턴** — `<script type="module" src="js/app.js">` 1개; 나머지는 `import/export`
- **실시간 구독** — `subscribeAll()` 내 5개 `onSnapshot`이 모두 응답하면 `onUpdate` 콜백
- **전역 상태 (`st`)** — app.js에서 단일 객체로 관리; Firebase 데이터 + `computeAll` 결과
- **window._ 패턴** — HTML 인라인 `onclick="window._xxx()"` → app.js 또는 tab-*.js에서 등록

---

## 4탭 구조

| 탭 | 역할 | 주요 DOM ID |
|---|---|---|
| 대시보드 | 결론 4카드 + 흐름바 + 다음 일정 + 목표가 시뮬 | `db-avail-cash`, `db-house-budget`, `db-monthly`, `db-status-val`, `db-flow-bar`, `db-upcoming`, `db-target-price` |
| 현금흐름 | 소희/성우 저축 입력 + 합산 + 월별 차트 | `inp-sohee-cur/mon`, `inp-sunwo-cur/mon`, `savings-chart`, `res-couple-tot` |
| 결혼비용 | 4카드 요약 + 카테고리바 + 잔금 타임라인 + 상세 테이블 | `s-total/paid/remain/soon`, `cat-rows`, `timeline`, `tbl-body` |
| 집 시뮬 | 가용현금 계산 + 대출 CRUD + 프리셋 카드 | `cash-available`, `loan-grid`, `preset-grid`, `tl-total/status` |

---

## CSS 색상 시스템

| 토큰 | 값 | 의미 |
|---|---|---|
| `--income` | `#16a34a` | 저축, 수입, 여유 현금 |
| `--expense` | `#dc2626` | 결혼비용, 지출, 부족 |
| `--warning` | `#d97706` | 임박 잔금, 주의 상태 |
| `--house` | `#0f766e` | 집 예산, 가용현금 |
| `--loan` | `#7c3aed` | 대출, 월 상환액 |
| `--primary` | `#2563eb` | 버튼, 활성 탭, 포커스 |

카드 강조 방식: `border-left: 3px solid <token>` + 숫자 큰 폰트 (`font-size: 22px; font-weight: 900`).

---

## 계산 흐름

```
Firebase onSnapshot → st.savings/items/loans/adjustments/settings 업데이트
→ computeAll(st):
    soheeFinal = soheeCurrent + soheeMonthly × monthsLeft
    sunwoFinal = sunwoCurrent + sunwoMonthly × monthsLeft
    coupleSavings = soheeFinal + sunwoFinal
    availCash = coupleSavings - totalPlanned + 지원금(체크박스) + 조정항목
    totalMonthly = 활성 대출 월납입 합계
    houseBudget = availCash + 활성 대출 총액
    status = 'idle'|'safe'|'caution'|'over'
→ rerender() → 각 탭 렌더 함수 호출
```

---

## 데이터 수정 방법

현재 `wecost_items` 항목 추가/수정은 **Firebase Console에서 직접** 해야 함.  
저축액·대출·조정항목은 앱 UI에서 편집 가능.

---

## 진행 상황

| 날짜 | 작업 |
|---|---|
| 2026-06-12 | CLAUDE.md 최초 작성 (구버전 기준) |
| 2026-06-13 | 전면 리팩토링: Google Sheets → Firebase, 단일 파일 → CSS/JS 모듈, 4탭 재무 대시보드로 전환 |

**다음:** 결혼비용 항목 추가/편집 UI 구현 (현재 Firebase Console 직접 편집만 가능).
