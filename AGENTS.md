# sungso — 저장소 작업 지침

성우·소희의 결혼 준비 앱 모음. 운영 저장소는 `CastleRain/sungso`, 배포 브랜치는 `master`, 공개 주소는 `https://CastleRain.github.io/sungso/`다.

## 시작할 때

[README](README.md), [구조](docs/architecture.md), 해당 앱·서비스의 `AGENTS.md`를 읽는다. 현행 지침은 이 파일과 하위 `AGENTS.md`가 기준이며 `CLAUDE.md`는 연결 문서다. 과거 작업 기록은 [archive/history](archive/history/README.md)에 보관한다.

## 폴더와 의존성

- `apps/{hub,wecost,honeymoon,travel,homehunt}`: 브라우저 화면, 앱 자산, 공개 데이터, 앱 테스트.
- `shared/{firebase,finance,travel,homehunt}`: 공개 설정·실제 공통 코드. `shared` 또는 서버가 `apps`의 구현 모듈을 import하지 않는다. 서버가 앱의 공개 JSON을 빌드에 포함하는 것은 허용한다.
- `services/homehunt`: 검색 API, 수집기, Render/Firebase 진입점, 원천자료·수집 설정·알림 장부. `services/firebase-default`: 기존 Firebase 함수.
- `config/apps.json`의 명시적 배포 목록으로 `dist/`를 생성한다. `dist/`는 Git 제외이며 직접 수정하지 않는다. 서비스·테스트·비밀 설정·archive 전체를 웹에 복사하지 않는다.
- JS import는 실제 소스 파일 위치를 기준으로 쓴다. 빌드는 소스→공개 경로 매핑으로 기존 URL에 직접 출력한다. 금융·여행 공통 모듈은 기존 `shared/` 파일명, HomeHunt 공통 모듈은 기존 `homehunt/js/`, 여행 패널은 기존 `shared/decision-panel.*` URL을 유지한다. wrapper·새 별칭·query 제거로 모듈 동일성을 바꾸지 않는다. HTML·CSS의 URL, CDN·버전 query·지연 초기화 순서를 보존한다.
- 루트의 `firebase.json`, `firestore.rules`, `render.yaml`, `.github/`는 도구가 찾는 위치를 유지한다.

## 기능·데이터 보존

- 기존 공개 주소와 직접 링크, PIN 정책·실행 순서, localStorage/IndexedDB 키, API·Firestore 계약을 임의로 바꾸지 않는다. PIN은 화면 진입 장치이며 DB 인증이 아니다.
- Firebase 프로젝트는 `sungso-358cb`. 공통 공개 설정만 `shared/firebase/`에서 가져오고, 앱 이름·SDK 버전·구독·시딩 시점은 앱별로 유지한다.
- WeCost는 Firestore로 마이그레이션 완료했다. Sheets 기반 파일은 archive의 과거 자료다.
- 현재 여행은 `itineraries/honeymoon_2027`; `itineraries/main`은 Honeymoon의 이전 일정 기록이며 읽기 전용 UI를 유지한다. 여행 결정 패널은 Travel에서만 로드한다.
- HomeHunt 개인 백업은 Google 검증·회원·본인 UID 규칙을 적용한 `homehunt_user_snapshots`. 공개 공공 JSON에 개인 기록·회사 위치·키를 넣지 않는다.
- `.env`, 캐시·통근 사용량 장부, 기존 사용자 데이터는 폴더 정리 과정에서 초기화하지 않는다. 실비밀값을 Git·문서·출력·캡처에 넣지 않는다. 로컬 통근 원호출은 0회로 유지한다.
- 실제 과금·인증·보안 규칙·데이터 마이그레이션은 이 구조 정리의 부수 작업으로 변경하지 않는다.

## 검증과 기록

루트에서 `npm run build`, `npm test`, `npm run check`; 서버 변경은 의존성 설치 후 `npm run build:services`와 [Emulator 검사](docs/development.md#firestore-emulator)를 실행한다. 새 검사는 동작·경로·배포 경계를 검증하며, 단순 파일 배치의 복제 테스트는 피한다.

브라우저는 생성된 사이트를 `/sungso/` 경로로 열고 1440px·390px에서 관련 앱과 연결 앱을 확인한다. 자동 시딩·환율 갱신도 운영 DB 쓰기다. 검증은 테스트 대역·Emulator를 사용하고 운영 저장·추가 통근 호출을 하지 않는다. 검증하지 못한 기능·원격 배포를 완료로 기록하지 않는다.

의미 있는 변경·완료가 생기면 매번 묻지 않고 아래 진행 상황을 갱신한다. 큰 작업 뒤에는 다음에 할 일을 한 줄 남긴다. 배포는 [배포·복구 안내](docs/deployment.md)를 따른다.

## 진행 상황

### 2026-09-13 — 앱·공통 코드·서비스 분리, 로컬 검증 완료

- 앱 소스·공통 도메인·서버/수집·과거 자료를 분리하고 앱 등록부·루트 빌드/미리보기/검사와 현행 문서를 정리했다. 공통 모듈은 기존 공개 URL에 직접 출력하고 query·모듈 동일성을 보존한다.
- `npm run check` 1,403개와 정적 참조 294개·JS 문법 113개, Firestore Emulator 순차 검사 20개, Render·HomeHunt Cloud·default Firebase 번들을 통과했다. 변경 전 데이터/PDF 22개·CSS 46개·Firestore 규칙의 해시가 유지됐다.
- 읽기 전용 QA의 1440px·390px에서 홈 PIN/직접 복귀·일정·달력, WeCost 네 탭, 여행 여섯 화면·날짜 선택 스크롤 유지·패널·이력, 리조트 비교·토너먼트·현재/이전 여행·PDF 10개 canvas, HomeHunt 여섯 메뉴·지도·조건 보존을 확인했다. 가로 넘침·운영 DB 쓰기·새 통근 호출은 없었다. 사용자의 원래 HomeHunt 로그인·개인 기록은 새 QA origin에서 재검증하지 않았다. 공개 배포·최종 운영 확인은 진행 중이다. [검증 근거와 한계](docs/restructure-verification.md)를 참고한다.

**다음:** 공개 Pages·Render 전환과 전체 화면·자동 수집→배포 연결을 확인하고 실제 결과를 기록한다.
