# sungso — 저장소 작업 지침

성우·소희의 결혼 준비 앱 모음. 운영 저장소는 `CastleRain/sungso`, 배포 브랜치는 `master`, 공개 주소는 `https://CastleRain.github.io/sungso/`다.

## 시작할 때

[README](README.md), [구조](docs/architecture.md), 해당 앱·서비스의 `AGENTS.md`를 읽는다. 현행 지침은 이 파일과 하위 `AGENTS.md`가 기준이며 `CLAUDE.md`는 연결 문서다. 과거 작업 기록은 [archive/history](archive/history/README.md)에 보관한다.

## 폴더와 의존성

- `apps/{hub,dates,invitation,wecost,honeymoon,travel,homehunt}`: 브라우저 화면, 앱 자산, 공개 데이터, 앱 테스트.
- `shared/{firebase,home,finance,travel,homehunt}`: 인증·공개 설정·실제 공통 코드. `shared` 또는 서버가 `apps`의 구현 모듈을 import하지 않는다. 서버가 앱의 공개 JSON을 빌드에 포함하는 것은 허용한다.
- `services/homehunt`: 검색 API, 수집기, Render/Firebase 진입점, 원천자료·수집 설정·알림 장부. `services/firebase-default`: 기존 Firebase 함수.
- `config/apps.json`의 명시적 배포 목록으로 `dist/`를 생성한다. `dist/`는 Git 제외이며 직접 수정하지 않는다. 서비스·테스트·비밀 설정·archive 전체를 웹에 복사하지 않는다.
- JS import는 실제 소스 파일 위치를 기준으로 쓴다. 빌드는 소스→공개 경로 매핑으로 기존 URL에 직접 출력한다. 금융·여행 공통 모듈은 기존 `shared/` 파일명, HomeHunt 공통 모듈은 기존 `homehunt/js/`, 여행 패널은 기존 `shared/decision-panel.*` URL을 유지한다. wrapper·새 별칭·query 제거로 모듈 동일성을 바꾸지 않는다. HTML·CSS의 URL, CDN·버전 query·지연 초기화 순서를 보존한다.
- 루트의 `firebase.json`, `firestore.rules`, `render.yaml`, `.github/`는 도구가 찾는 위치를 유지한다.

## 기능·데이터 보존

- 기존 공개 주소와 직접 링크, localStorage/IndexedDB 키, API·Firestore 계약을 보존한다. PIN 대신 공통 Google 로그인과 관리자 관리 `site_members/{uid}`의 활성 회원 검증을 적용한다.
- Firebase 프로젝트는 `sungso-358cb`. `shared/firebase/boot.mjs`가 인증 후 앱 스크립트를 순서대로 실행한다. 기존 다섯 Firebase 앱 이름·SDK 10.12.0을 유지하며 `syncAppAuth` 이후에만 구독한다. 계정 전환 시 구독·늦은 응답·개인 DOM을 정리하고 로컬 초안을 임의 삭제하지 않는다. 개인 데이터 자동 시딩은 금지한다.
- WeCost는 Firestore로 마이그레이션 완료했다. Sheets 기반 파일은 archive의 과거 자료다.
- 여행 예산은 기존 `wecost_items`의 신혼여행 항목 하나를 연결한다. 세부안 `itineraries/honeymoon_2027_budget`을 새 결혼비용으로 복제하지 않으며 금액 이력은 `honeymoon_2027_budget_log_` 접두사 문서에 추가만 한다. 공통 계산·저장은 `shared/finance/travel-budget-{core,store}.mjs`를 사용하고 명시적 저장·원본 비교·원자적 이력 계약을 유지한다.
- 현재 여행은 `itineraries/honeymoon_2027`; `itineraries/main`은 Honeymoon의 이전 일정 기록이며 읽기 전용 UI를 유지한다. 여행 결정 패널은 Travel에서만 로드한다.
- HomeHunt 개인 백업은 Google 검증·회원·본인 UID 규칙을 적용한 `homehunt_user_snapshots`. 공개 공공 JSON에 개인 기록·회사 위치·키를 넣지 않는다.
- `.env`, 캐시·통근 사용량 장부, 기존 사용자 데이터는 폴더 정리 과정에서 초기화하지 않는다. 실비밀값을 Git·문서·출력·캡처에 넣지 않는다. 로컬 통근 원호출은 0회로 유지한다.
- 개인 기준은 회원 전용 `private_data`에서 읽는다. 이전은 비공개 백업·dry-run·원본 해시 검증 후 없는 문서만 생성한다. 회원 UID·이메일·백업을 Git·문서에 넣지 않는다. PDF는 사용자가 GitHub 유지를 요청한 예외이며 Drive 이전·과거 Git 노출 후속을 완료로 처리하지 않는다.
- Firebase Spark·Render Free를 유지하고 새 과금·Blaze 전환은 하지 않는다. 인증·규칙 변경은 명시된 개인 홈 계획 범위에서만 수행한다.

## 검증과 기록

루트에서 `npm run build`, `npm test`, `npm run check`; 서버 변경은 의존성 설치 후 `npm run build:services`와 [Emulator 검사](docs/development.md#firestore-emulator)를 실행한다. 새 검사는 동작·경로·배포 경계를 검증하며, 단순 파일 배치의 복제 테스트는 피한다.

브라우저는 생성된 사이트를 `/sungso/` 경로로 열고 1440px·390px에서 관련 앱과 연결 앱을 확인한다. 자동 시딩·환율 갱신도 운영 DB 쓰기다. 검증은 테스트 대역·Emulator를 사용하고 운영 저장·추가 통근 호출을 하지 않는다. 검증하지 못한 기능·원격 배포를 완료로 기록하지 않는다.

의미 있는 변경·완료가 생기면 매번 묻지 않고 아래 진행 상황을 갱신한다. 큰 작업 뒤에는 다음에 할 일을 한 줄 남긴다. 배포는 [배포·복구 안내](docs/deployment.md)를 따른다.

## 진행 상황

### 2026-09-13 — 개인 홈·두 회원 인증 구현과 보호 규칙 전환

- 밝은 공유 홈과 편집·메모, `/dates/`의 기존 일정, 공통 Google 인증을 구현했다. 청첩장 12종·Travel 8화면·WeCost 원자 저장·HomeHunt 본인 UID/로컬 기록을 보존하고 계정 변경 중 늦은 응답을 차단했다.
- 운영 67개 문서를 백업·해시 비교해 유지하면서 기준 자료 2개·회원 2개만 생성했다. 공개 개인 호환 사본·브라우저 검색 비밀값은 제거했고 PDF 10개는 사용자 지시로 유지했다.
- 최종 check 1,519개·참조 365개·문법 137개·서비스 번들 3개·Emulator 36개 통과. 07:24 UTC 회원 규칙 배포 후 실제 개인 컬렉션 11종 익명 403을 확인했다. 웹·서버 릴리스와 실제 회원 검증은 [활성 계획 결과](docs/development-plans/active/couple-home/RESULTS.md)에 이어 기록한다.

**다음:** 웹/Render 배포를 검증하고 외부 검색 키 교체·실회원 로그인·PDF 제한 공유를 마칠 때까지 계획을 active에 유지한다.

### 2026-09-13 — 개인 홈 개발 계획 인계

- [개발 계획](docs/development-plans/active/couple-home/README.md)에 Google 두 계정 인증, 밝은 용도별 홈과 편집, 날짜 분리, 청첩장·여행 예산 보존, 개인 파일 보호 계획과 프로토타입을 보관했다.
- 다른 컴퓨터용 실행 프롬프트·검증 체크리스트와 completed 이동 조건을 포함했다. 이번 변경은 문서 인계이며 기능·인증·운영 데이터 변경은 아니다.
- 문서 상대 링크·독립 HTML 내보내기·배포 제외를 확인하고 build, test, check의 1,447개 검사를 통과했다. 로컬 서버 권한 제한으로 최초 검사는 실패했으며 권한 허용 후 같은 검사를 통과했다.

**다음:** 계획의 README부터 읽고 구현·검증·배포를 진행한 뒤 완료 조건을 충족하면 completed로 이동한다.


### 2026-09-13 — 청첩장 12종 GitHub 반영·Pages 배포 완료

- 사용자 확정 후 최신 master에 청첩장·홈 연결 변경만 `4014d00`으로 반영했다. [Pages 34742479321](https://github.com/CastleRain/sungso/actions/runs/34742479321)의 전체 검사·서비스 번들·배포 성공을 확인했다.
- 공개 청첩장·홈 파일 21개가 HTTP 200이고 검증한 산출물과 SHA-256이 일치했다. 이번 원격 확인은 정적 파일 조회로 수행했으며 운영 DB 쓰기는 없었다. 실제 기기와 운영 공동 저장 검증은 별도다.

**다음:** 공개 청첩장에서 두 사람의 디자인을 고르고 실제 제작·하객용 페이지를 별도 구성한다.

### 2026-09-13 — 청첩장 특별한 인터랙션 6종 추가

- 기본 6종에 봉투·별자리·즉석사진·입체 책·탑승권·무대 커튼을 더해 총 12종을 제공한다. 컬렉션 필터와 재생·다시 보기, 키보드 조작·모션 감소를 지원하며 체험 상태는 공동 선택에 저장하지 않는다.
- `npm run build`·`npm test`·`npm run check`의 1,447개 검사와 참조 331개·JS 문법 127개, Invitation 단위 검사 25개·Firestore Emulator 5개가 통과했다. 새 여섯 디자인의 1440px·390px 전체 스크롤·조작·설정·찜·공동 저장·복사와 기존 목록 복원을 대역에서 확인했다. 기존 로컬 미리보기의 선택을 보존했고 운영 DB에 테스트 기록을 쓰지 않았다. [검증 기록](docs/invitation-verification.md)을 참고한다.

**다음:** 12종을 함께 비교해 선택하고 실제 제작·하객용 페이지와 공개 배포를 별도 진행한다.

### 2026-09-13 — 여행 이동 국가·예산 연동·출발 준비, Pages 배포 완료

- 여행 달력 칸에 이동 국가를 함께 표시하고 여행 비용·출발 준비를 더해 여덟 화면으로 확장했다. 기존 WeCost 신혼여행 항목을 공유해 예상액·지급액·남은 지출·준비금·증감과 금액 이력을 보여준다.
- 상세 예산과 장부는 사용자 저장 시 함께 반영하고 조회·후보 가격 미리보기는 저장하지 않는다. 미확인 금액·환율이 있으면 장부 총액 저장을 막는다. [여행](apps/travel/AGENTS.md)·[WeCost](apps/wecost/AGENTS.md)의 동시 편집·이력 계약을 정리했다.
- `npm run build`와 `npm run check`의 1,422개 검사·배포 참조·문법 검사를 통과했다. 테스트 대역 1440px/390px에서 여덟 화면·이동 국가·비용 6항목, Travel↔WeCost 금액·지급·이력·동시 편집·실패 보존·오프라인을 확인했고 운영 DB 요청은 0이었다. 운영 저장 검증은 테스트 대역에서만 실행했다.
- `eb8bea8`의 [Pages 34740618135](https://github.com/CastleRain/sungso/actions/runs/34740618135) 검증·서비스 번들·배포 성공을 확인했다. 공개 파일 23개가 HTTP 200·검증 산출물 해시 일치였고, 실제 공동 일정·WeCost를 읽은 1440px/390px에서 이동 국가·여덟 화면·기존 금액·견적 미리보기·출발 준비를 확인했다. SDK/네트워크 쓰기 차단 상태에서 운영 DB 쓰기·JS 오류·가로 넘침 0이었다. 임시 검증 근거는 `/private/tmp/sungso-travel-budget/`의 `qa-report.json`, `qa-public-report.json`, `public-files.json`에 보관한다.

**다음:** 실제 견적과 남은 여행용 준비금을 입력하고, 발권·리조트 이동·입국 신고 등 준비 상태를 함께 갱신한다.

### 2026-09-13 — 결혼 전 홈 구성과 모바일 청첩장 선택 구현

- 홈 첫 묶음을 결혼 전으로 변경하고 청첩장·Honeymoon·여행 일정 순서로 배치했다. `apps/invitation/`을 `/sungso/invitation/`에 등록하고 여섯 예시·임시 꾸미기·사람별 찜·공동 선택·선택서 출력을 구현했다.
- 기존 PIN·일정·D-day·달력과 공개 경로를 보존했다. 전용 `couplePicks/invitation_templates` 문서만 사용하며 조회 시 시딩하지 않는다. 실사진·연락처·계좌·하객 응답은 취급하지 않는다.
- 1440px·390px에서 여섯 전체 스크롤과 홈 왕복·패널·갤러리, 대역의 새로고침·충돌·실패 흐름, 내려받은 JSON을 확인했다. Firestore Emulator 4개가 통과했고 운영 DB에 테스트 기록을 쓰지 않았다. [검증 결과](docs/invitation-verification.md)를 참고한다.

**다음:** 공개 배포와 선택서를 기반으로 한 실제 제작·하객용 페이지를 별도 작업한다.

### 2026-09-13 — 여행 귀국편을 몰디브 밤 출발 후보로 변경

- 사용자 캡처 기준 3/16 몰디브 23:30 → 3/17 싱가포르 07:15, 14:35 싱가포르 → 22:00 인천, 환승 7시간 20분과 2인 3,355,600원 후보를 일정·달력·항공표·이동 안내·결정 메모에 반영했다. 리조트 4박과 앞선 일정은 유지한다.
- 공동 여행의 해당 이틀·메모 두 항목과 변경 이력 4건을 원자적으로 저장하고 관련 없는 데이터 보존을 재조회했다. 1,403개 검사와 1440px/390px Travel·Honeymoon 연결 화면 대역 검증을 통과했다. QA 중 운영 DB 쓰기는 없으며 사용자 요청에 따른 실제 일정 저장과 구분한다. [여행 앱 기록](apps/travel/AGENTS.md#진행-상황)을 따른다.
- 사용자 배포 승인 후 `b4a7bbe`를 master에 반영했고 [Pages 34739072900](https://github.com/CastleRain/sungso/actions/runs/34739072900)의 검증·배포 성공을 확인했다. 공개 다섯 앱 진입점과 변경된 여행·공통 파일 등 11개가 HTTP 200·로컬 해시 일치다. 공개 Travel 1440px/390px의 실제 공동 일정·항공표·달력·이동·변경 기록과 JS 오류·가로 넘침·DB 쓰기 0을 확인했다.

**다음:** 항공 발권 전 연결 수하물과 리조트 퇴실 후 이용·수상비행기 시간을 확인한다.

### 2026-09-13 — 앱·공통 코드·서비스 분리, Pages·Render 배포 성공

- 앱 소스·공통 도메인·서버/수집·과거 자료를 분리하고 앱 등록부·루트 빌드/미리보기/검사와 현행 문서를 정리했다. 공통 모듈은 기존 공개 URL에 직접 출력하고 query·모듈 동일성을 보존한다.
- `npm run check` 1,403개와 정적 참조 294개·JS 문법 113개, Firestore Emulator 순차 검사 20개, Render·HomeHunt Cloud·default Firebase 번들을 통과했다. 수집 재개 전 데이터/PDF 22개·CSS 46개·Firestore 규칙의 해시가 유지됐다.
- 읽기 전용 QA의 1440px·390px에서 홈 PIN/직접 복귀·일정·달력, WeCost 네 탭, 여행 여섯 화면·날짜 선택 스크롤 유지·패널·이력, 리조트 비교·토너먼트·현재/이전 여행·PDF 10개 canvas, HomeHunt 여섯 메뉴·지도·조건 보존을 확인했다. 가로 넘침·운영 DB 쓰기·새 통근 호출은 없었다. 사용자의 원래 HomeHunt 로그인·개인 기록은 새 QA origin에서 재검증하지 않았다. 로그인한 공개 HomeHunt의 개인 기록·회원 API는 사용자 로그인 후 수동 확인으로 남겼다. [검증 근거와 한계](docs/restructure-verification.md)를 참고한다.

- `981e50d`의 [Pages 배포 34737387442](https://github.com/CastleRain/sungso/actions/runs/34737387442)와 같은 소스의 Render `dep-daj26bdg1s2s7395duj0` Live를 확인했다. 공개 파일 189개가 모두 HTTP 200·로컬 해시 일치, 내부 경로 18개는 404다. Render `/healthz` 200·CORS와 무로그인 health/quota 401, 공개 홈의 기존 일정·D-day·달력 보존을 확인했다.
- 금리 수집 [34737525979](https://github.com/CastleRain/sungso/actions/runs/34737525979)가 정상 자료 `25c6254`를 커밋하고 [Pages 34737535176](https://github.com/CastleRain/sungso/actions/runs/34737535176)을 명시 호출해 배포 성공까지 확인했다. 네 수집·Pages 워크플로 active와 Render On Commit 복원을 확인했고 로컬에도 새 금리 자료를 유지했다.
- 공개 WeCost 네 탭·Travel 여섯 화면/hash·390px 배치, HomeHunt 공식 단지 17,851곳·지도·로그인 전 경계를 확인했다. Honeymoon 공개 브라우저 로드는 자동 환율 쓰기를 피하기 위해 생략하고 공개 파일 해시·로컬 읽기 전용 화면/PDF로 확인했다. 남은 수동 확인은 로그인한 HomeHunt의 원래 개인 기록·회원 API다.

**다음:** 사용자 로그인 후 HomeHunt의 기존 기록·회원 API를 읽기 위주로 확인하고, 새 앱은 등록부와 앱 폴더로 추가한다.
