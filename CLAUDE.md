# sungso — 프로젝트 루트

성우 & 소희의 결혼 준비 공간. GitHub Pages로 배포되는 정적 사이트 모음.

**배포 URL:** `https://CastleRain.github.io/sungso/`
**저장소:** `https://github.com/CastleRain/sungso` (branch: `master`)

---

## 폴더 구조

```
sungso/
├── index.html       ← 허브 랜딩 페이지 (이 문서의 대상)
├── wecost/          ← 결혼 비용 관리 앱 (별도 CLAUDE.md 예정)
└── honeymoon/       ← 몰디브 신혼여행 플래너 (별도 CLAUDE.md 예정)
```

---

## index.html 구성

단일 HTML 파일. 빌드 도구 없음. 외부 의존성은 CDN으로만 로드.

### 외부 의존성
| 라이브러리 | 용도 | CDN |
|---|---|---|
| Firebase JS SDK v10.12.0 | Firestore 실시간 DB | `gstatic.com/firebasejs/10.12.0` |
| Flatpickr | 날짜 선택 달력 UI | `cdn.jsdelivr.net/npm/flatpickr` |
| Flatpickr 한국어 locale | 월/요일 한국어 표시 | `flatpickr/dist/l10n/ko.js` |

### 스크립트 구조
`index.html` 안에 스크립트가 두 블록으로 분리되어 있음:

1. **`<script>` (일반)** — Firebase 의존성 없는 코드
   - 파티클 생성 (하트/별 16개, CSS 애니메이션)
   - Flatpickr 초기화 (`#formDate`, 한국어, 오늘 이후만 선택)
   - 결혼식 D-day 초기 계산 (2027-03-06 기준)

2. **`<script type="module">` (Firebase)** — Firestore 연동 코드
   - Firebase 초기화 → Firestore `events` 컬렉션 구독
   - 이벤트 목록 실시간 렌더 (리스트 / 달력 탭)
   - 이벤트 추가 (`addDoc`) / 삭제 (`deleteDoc`)
   - 이벤트 클릭 시 D-day 카드 업데이트

### 주요 DOM ID
| ID | 역할 |
|---|---|
| `ddayLabel` | D-day 카드 레이블 (클릭된 이벤트 제목으로 바뀜) |
| `ddayNum` | D-day 숫자 표시 |
| `ddayDate` | D-day 날짜 텍스트 |
| `eventList` | 이벤트 리스트 렌더 컨테이너 |
| `calGrid` | 달력 그리드 렌더 컨테이너 |
| `calPopup` | 달력 날짜 클릭 시 팝업 |
| `addForm` | 일정 추가 폼 (토글) |
| `formTitle` / `formDate` | 추가 폼 입력 필드 |

---

## Firebase

**프로젝트:** `sungso-358cb`

```js
// index.html 안에 하드코딩된 config
apiKey:            "AIzaSyBz-P5ycMAjYZBV7hkcZDrmq28EAw7Hsp8"
authDomain:        "sungso-358cb.firebaseapp.com"
projectId:         "sungso-358cb"
storageBucket:     "sungso-358cb.firebasestorage.app"
messagingSenderId: "143797950443"
appId:             "1:143797950443:web:95b0f616246d84aae3bae"
```

**Firestore 컬렉션:** `events`

| 필드 | 타입 | 예시 |
|---|---|---|
| `date` | string (YYYY-MM-DD) | `"2027-03-06"` |
| `title` | string | `"결혼식"` |
| `emoji` | string | `"💒"` |
| `createdAt` | serverTimestamp | — |

**보안 규칙:** 현재 `allow read, write: if true` (전체 공개)

**이벤트 추가/수정:** GitHub 웹 UI에서 직접 수정 불가 (DB이므로). Firebase Console → Firestore → `events` 컬렉션에서 직접 편집하거나 페이지 UI를 사용.

**초기 시딩:** 컬렉션이 비어있을 때 페이지 첫 로드 시 자동으로 기본 이벤트 8개 삽입 (`getDocs` → empty 체크 후 `addDoc` 루프).

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

| 폴더 | URL | 설명 |
|---|---|---|
| `wecost/` | `/sungso/wecost/` | 결혼 비용 항목별 관리, 예산 트래킹 |
| `honeymoon/` | `/sungso/honeymoon/` | 몰디브 리조트 비교 및 패키지 플래너 |

각 서브 프로젝트는 독립적인 `index.html` 보유. 세부 내용은 각 폴더의 `CLAUDE.md` 참조.
