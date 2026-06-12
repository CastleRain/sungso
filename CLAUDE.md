# sungso — 프로젝트 루트

성우 & 소희의 결혼 준비 공간. GitHub Pages로 배포되는 정적 사이트 모음.

**배포 URL:** `https://CastleRain.github.io/sungso/`
**저장소:** `https://github.com/CastleRain/sungso` (branch: `master`)

---

## 폴더 구조

```
sungso/
├── index.html       ← 허브 랜딩 페이지 (이 문서의 대상)
├── css/
│   └── style.css    ← index.html 전용 스타일
├── js/
│   ├── app.js       ← 파티클, Flatpickr 초기화, D-day 초기 렌더
│   └── firebase.js  ← Firebase 모듈 (이벤트 CRUD, D-day 카드, 달력)
├── wecost/          ← 결혼 비용 관리 앱 (CLAUDE.md 있음)
└── honeymoon/       ← 몰디브 신혼여행 플래너 (CLAUDE.md 있음)
```

---

## index.html 구성

빌드 도구 없음. 외부 의존성은 CDN으로만 로드. CSS/JS는 별도 파일로 분리.

### 외부 의존성
| 라이브러리 | 용도 | CDN |
|---|---|---|
| Firebase JS SDK v10.12.0 | Firestore 실시간 DB | `gstatic.com/firebasejs/10.12.0` |
| Flatpickr | 날짜 선택 달력 UI | `cdn.jsdelivr.net/npm/flatpickr` |
| Flatpickr 한국어 locale | 월/요일 한국어 표시 | `flatpickr/dist/l10n/ko.js` |

### 스크립트 구조

1. **`js/app.js`** (일반 스크립트) — Firebase 의존성 없는 코드
   - 파티클 생성 (하트/별 16개, CSS 애니메이션)
   - Flatpickr 초기화 (`#formDate`, 한국어, 오늘 이후만 선택)
   - 결혼식 D-day 초기 렌더 (Firebase 연결 전 로딩 상태용)

2. **`js/firebase.js`** (`type="module"`) — Firestore 연동 코드
   - Firebase 초기화 → Firestore `events` 컬렉션 `onSnapshot` 구독
   - `renderDdayCards()` — 핀된 이벤트를 날짜 적게 남은 순으로 카드 렌더
   - `renderList()` — 이벤트 리스트 렌더 (핀 토글, 삭제)
   - `renderCalendar()` — 달력 뷰 렌더
   - 이벤트 추가 (`addDoc`) / 삭제 (`deleteDoc`) / 핀 토글 (`updateDoc`)

### 주요 DOM ID
| ID | 역할 |
|---|---|
| `ddayRow` | D-day 카드들을 담는 flex 컨테이너 |
| `ddayNum` | 로딩 상태용 초기 D-day 숫자 (Firebase 연결 후 전체 교체됨) |
| `eventList` | 이벤트 리스트 렌더 컨테이너 |
| `calGrid` | 달력 그리드 렌더 컨테이너 |
| `calPopup` | 달력 날짜 클릭 시 팝업 |
| `addForm` | 일정 추가 폼 (토글) |
| `formTitle` / `formDate` | 추가 폼 입력 필드 |

### D-day 카드 동작
- 핀된 이벤트가 없으면: 결혼식 D-day 카드 1개 기본 표시
- 핀된 이벤트가 있으면: 핀된 이벤트만 카드로 표시 (날짜 적게 남은 순, 가로 스크롤)
- 이벤트 행 클릭 = 핀 토글 (행 전체 또는 📌 버튼); 핀 상태는 Firestore에 저장

---

## Firebase

**프로젝트:** `sungso-358cb`

```js
// js/firebase.js 에 하드코딩된 config
apiKey:            "AIzaSyBz-P5ycMAjYZBV7hkcZDrmq28EAw7Hsp8"
authDomain:        "sungso-358cb.firebaseapp.com"
projectId:         "sungso-358cb"
storageBucket:     "sungso-358cb.firebasestorage.app"
messagingSenderId: "143797950443"
appId:             "1:143797950443:web:95b0f616246d84aae3bae"
```

**Firestore 컬렉션**

`events` (sungso 루트 — 일정 관리):

| 필드 | 타입 | 예시 |
|---|---|---|
| `date` | string (YYYY-MM-DD) | `"2027-03-06"` |
| `title` | string | `"결혼식"` |
| `emoji` | string | `"💒"` |
| `pinned` | boolean | `true` (없으면 false 취급) |
| `createdAt` | serverTimestamp | — |

`resort_notes/{resortId}/comments` (honeymoon — 댓글 메모):

| 필드 | 타입 | 예시 |
|---|---|---|
| `author` | string | `"성우"` \| `"소희"` |
| `text` | string | `"라군뷰가 정말 예쁘다"` |
| `createdAt` | serverTimestamp | — |

**보안 규칙:** 현재 `allow read, write: if true` (전체 공개)

**이벤트 추가/수정:** Firebase Console → Firestore → `events` 컬렉션에서 직접 편집하거나 페이지 UI를 사용.

**초기 시딩:** 컬렉션이 비어있을 때 페이지 첫 로드 시 자동으로 기본 이벤트 8개 삽입.

---

## 디자인 시스템

**색상**
- 메인 핑크: `#FF6B9D`
- 연한 핑크: `#FF85B3`, `#FFB3CC`, `#FFCCE0`, `#FFF0F5`
- 배경 그라디언트: `#FFF5F7` → `#FFF0EA`
- 텍스트: `#1a1a1a` (제목), `#333` (본문), `#aaa` (서브), `#ccc` (힌트)

**공통 패턴**
- 카드 border-radius: `22px` (프로젝트 카드), `16px` (이벤트 행), `28px` (D-day 카드)
- 그림자: `box-shadow: 0 2px 14px rgba(0,0,0,0.055)`
- hover: `translateY(-5px)` + shadow 강화 + 핑크 border

---

## 서브 프로젝트 (간략)

| 폴더 | URL | 데이터 소스 | 설명 |
|---|---|---|---|
| `wecost/` | `/sungso/wecost/` | Google Sheets CSV | 결혼 비용·저축·집 계획 3페이지 SPA |
| `honeymoon/` | `/sungso/honeymoon/` | JS 하드코딩 + Firebase | 몰디브 12개 리조트 비교, 토너먼트, PDF 뷰어 |

각 서브 프로젝트는 독립적인 `index.html` 보유. 세부 내용은 각 폴더의 `CLAUDE.md` 참조.

**중요:** `wecost`는 Firebase를 쓰지 않고 Google Sheets를 CSV로 웹 게시해 데이터 소스로 사용. `honeymoon`은 리조트 데이터는 JS 하드코딩이지만, **댓글 메모·커플 picks·일정표는 Firebase Firestore 사용** (세부 컬렉션은 `honeymoon/CLAUDE.md` 참조).

---

## 작업 규칙
- 의미 있는 변경/완료 항목이 생기면, 매번 사용자에게 묻지 말고
  "진행 상황" 섹션을 알아서 업데이트할 것
- 큰 작업 끝나면 "다음에 뭐 할지" 도 한 줄 남겨둘 것

---

## 진행 상황

### 2026-06-12

**멀티 D-day 핀 기능 + 파일 구조 분리**

- **D-day 카드 멀티 표시:** 이벤트 행 클릭 시 D-day 카드가 교체되는 방식 → 카드가 상단에 추가되는 방식으로 전환. 2개, 3개 동시에 가로로 나열, 초과 시 가로 스크롤.
- **Firebase 핀 상태 저장:** 이벤트 문서에 `pinned: boolean` 필드 추가. `updateDoc`으로 토글. 새로고침 후에도 유지됨.
- **정렬:** 핀된 카드를 날짜 적게 남은 순 (미래 이벤트 우선, 동일 그룹 내 오름차순) 으로 정렬.
- **결혼식 중복 카드 버그 수정:** HTML 하드코딩 카드 + Firebase 핀 카드가 동시에 렌더되던 문제 해결. `renderDdayCards()`가 행 전체를 초기화 후 재렌더하도록 변경. 핀된 이벤트가 없을 때만 기본 결혼식 카드 표시.
- **파일 분리:** `index.html` 단일 파일에 있던 CSS/JS를 `css/style.css`, `js/app.js`, `js/firebase.js` 로 분리.

**다음:** wecost / honeymoon 각각 CLAUDE.md 작성 완료.

### 2026-06-12 (honeymoon 집중 개발)

honeymoon 앱 대규모 UX 개선 — 상세 내용은 `honeymoon/CLAUDE.md` 참조.

- 리조트 12개 / 여행사 3개로 확장 (투어민 추가)
- 핑크/로즈 테마로 전환 (sungso 메인과 통일)
- 5탭 UX 전면 개선: 카드 그리드↔분할 전환, 드래그 리사이즈, 지도 핀 직접 상세
- Firebase 연동 추가: `resort_notes` 서브컬렉션으로 성우/소희 댓글 메모 저장
- 메모 팝업: 상세 헤더 "💬 메모" 버튼 → 플로팅 채팅 UI
- 토너먼트: 매치 중 상세보기 버튼, 버그 수정
- sungso 홈으로 돌아가는 내비 바 추가

### 2026-06-13 (honeymoon 플랜 탭 + 편집 UX)

- **Detail Sheet 통일:** 모든 리조트 상세를 우측 슬라이드 패널(모바일: 바텀시트)로 단일화. `openDetailSheet` / `closeDetailSheet` API.
- **메모 UX 개선:** z-index 수정(5400), 메모 카운트 배지(카드/Pick슬롯/상세헤더), `resort_note_meta` 컬렉션 추가, 메모 알림 센터 드로어 추가
- **플랜 탭 (`tab-plan.js`):** 커플 Top3 Pick 슬롯, 최종 후보 + 확정, "🏆 우리의 리조트" 히어로 카드, 기본 일정 8일 자동 생성
- **일정표 편집 UX:** Day 카드 View/Edit 모드, 7종 항목 타입 시스템(항공/숙박/이동/식사/액티비티/휴식/메모), 자동저장(800ms debounce), ↑↓ 순서변경, 미정 pill, Firebase 콜백 억제
- **새 Firebase 컬렉션:** `couplePicks/main` (pick + 확정), `itineraries/main` (세부일정), `resort_note_meta/{id}` (댓글 수 캐시)
