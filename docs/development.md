# 개발과 검증

모든 명령은 별도 표기가 없으면 저장소 루트에서 실행한다. Node.js 22와 npm을 사용한다. 앱은 정적 HTML·브라우저 ES 모듈 구조이며 외부 라이브러리는 기존 CDN으로 가져온다.

현재 개인 홈·인증 전환의 진행 상황과 미확인 범위는 [활성 계획](development-plans/active/couple-home/README.md)·[체크리스트](development-plans/active/couple-home/CHECKLIST.md)·[보안 검증](development-plans/active/couple-home/SECURITY-VALIDATION.md)에 기록한다. 이전 폴더 구조 정리의 결과는 [구조 정리 검증 기록](restructure-verification.md)이며 현재 인증 정책의 근거로 사용하지 않는다.

## 웹 실행

```sh
npm ci
npm run dev
```

기본 주소는 `http://127.0.0.1:8000/sungso/`다. 미리보기는 먼저 빌드하고 변경을 감시하며 `dist/`만 제공한다. `apps/` 또는 저장소 루트를 일반 정적 서버로 제공하거나 `file://`로 소스를 열지 않는다. 소스·공개 출력의 import 깊이가 다르고 PDF·ES 모듈도 HTTP가 필요하다.

`npm run build`는 등록한 파일만 복사하고 JS import를 소스→공개 경로 매핑에 맞춘다. 공통 모듈은 기존 공개 URL로 직접 출력하며 버전 query를 보존한다. wrapper나 새 별칭으로 우회하지 않는다. `dist/` 파일은 직접 수정하거나 커밋하지 않는다. 미리보기의 호스트·포트를 바꾸면 터미널에 표시된 실제 주소를 사용한다.

모든 개인 앱은 `shared/firebase/boot.mjs`가 DOM 준비·Google 회원 확인·명명 Firebase 앱의 인증 동기화를 마친 뒤 지연 스크립트를 순서대로 실행한다. `application/x-sungso-script`·`data-src`를 일반 실행 스크립트로 바꾸면 인증 전 초기화가 발생하므로 유지한다. 나중에 불러오는 초기화 코드는 이미 지난 `DOMContentLoaded` 이벤트만 기다리지 않도록 직접 실행하거나 `document.readyState`를 함께 확인한다.

회원은 관리자 전용 `site_members/{uid}`의 활성 상태와 `sungwoo`/`sohee` 역할로 확인한다. PIN·브라우저 이메일 허용 목록·과거 로컬 플래그는 권한이 아니다. 테스트용 회원을 운영 프로젝트에 만들지 않는다. 계정 전환·로그아웃 시 개인 화면·구독·비동기 응답을 정리하지만 기존 로컬 초안·개인 기록은 임의 삭제하지 않는다.

## 루트 명령

| 명령 | 역할 |
|---|---|
| `npm run build` | 앱·공통 모듈·명시한 호환 자산을 `dist/`에 생성 |
| `npm run dev` | 최초 빌드·변경 감시·배포 구조 미리보기 |
| `npm test` | 여행 공통·HomeHunt·역 자료·사이트 구조 회귀 검사 |
| `npm run check` | 빌드·테스트·런타임/도구 문법·정적 자산/import 경로 검사 |
| `npm run build:services` | 설치된 서비스 의존성으로 배포 번들 검증; 배포하지 않음 |

원하는 범위만 확인할 때는 기존 Node 테스트를 직접 실행한다.

```sh
node --test tests/*.test.mjs
node --test apps/homehunt/tests/*.test.mjs
node --test services/homehunt/scripts/build-rail-stations.test.mjs
node --test tests/site/*.test.mjs
```

구조 변경에서는 이전 검사 결과와 비교하고 공개 경로·import와 query·자산·배포 제외 범위를 확인한다. 기존 URL과 새 산출물을 섞어 불러와도 공통 모듈의 클래스 동일성과 상태 공유가 보존되는지 확인한다. 같은 소스로 두 번 빌드한 파일 내용이 같아야 한다. 검사 통과 횟수는 실제 이번 실행 결과로 기록하며 이전 릴리스 수치를 재사용하지 않는다.

## 서비스 빌드

웹 의존성 설치와 서비스 의존성 설치는 별도다. 최초 설치 또는 lockfile 변경 시 필요한 패키지에서 실행한다.

```sh
npm ci --include=dev --prefix services/homehunt/render
npm ci --include=dev --prefix services/homehunt/cloud
npm ci --include=dev --prefix services/firebase-default
npm run build:services
```

Render·Cloud 빌드에는 esbuild가 필요하다. `build:services`는 각 서비스의 `build.mjs`를 현재 Node로 실행하며 의존성을 자동 설치하거나 서비스·DB·공급자 API를 호출하지 않는다. 배포 설정의 predeploy/build 명령과 실제 번들 입력을 함께 확인한다. Firebase Functions 번들 검증과 실제 Functions 배포는 별개이며 기존 무료 요금제를 변경하지 않는다.

기존 로컬 서버가 필요하면 `.env.example`의 허용 키를 `services/homehunt/.env`에 준비하고 다음 실행기를 사용한다. 기존 값이 있으면 그대로 계승하고 실제 키를 출력하지 않는다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File services/homehunt/scripts/start-local-market.ps1
```

API는 `127.0.0.1:8787`을 유지한다. 프로세스 환경변수가 `.env`보다 우선한다. 키 설정 여부는 실제 공급자 응답 성공과 다르다. `.local/` 캐시·일일 사용량 장부는 재시작·재배치 시 초기화하지 않으며 로컬 통근 원호출은 0회를 유지한다.

## Firestore Emulator

Firebase CLI와 호환되는 Java가 필요하며 Cloud 테스트 의존성을 먼저 설치한다. 테스트 프로젝트는 `demo-homehunt`, 연결은 localhost Emulator로 고정한다. 운영 Firebase 프로젝트·사용자 토큰·서비스 계정으로 검사하지 않는다.

```sh
firebase emulators:exec --only firestore --project demo-homehunt "node --test --test-concurrency=1 services/homehunt/cloud/tests/*.test.mjs apps/invitation/tests/firestore.emulator.mjs"
```

각 테스트 파일이 Emulator 데이터를 초기화하므로 파일 간 동시 실행을 막는다. CLI가 제공하는 `FIRESTORE_EMULATOR_HOST`가 없거나 localhost가 아니면 테스트가 실패하는 것이 정상이다. 두 회원·비회원·비로그인·본인 UID 경계, 관리자 전용 회원 관리, 홈 revision·메모 작성자, 청첩장 12종 찜/공동 선택, 변경 이력의 작성자·추가 전용 권한과 원자적 저장·제한된 서버 정리를 확인한다. 겹치는 match가 특별 권한을 우회하지 않는지도 검사한다. 루트 `npm test`만으로 실제 Emulator 검증을 대신했다고 기록하지 않는다.

## 브라우저 회귀 확인

1440px 데스크톱·390px 휴대폰에서 `/sungso/`의 아래 동작을 확인한다. 직접 주소·새로고침·뒤로/앞으로·홈 복귀·가로 넘침·콘솔 오류·누락 요청을 함께 확인한다.

| 앱 | 확인할 기능 |
|---|---|
| Hub | Google 회원 확인·용도별 6개 앱·홈 공동 편집/취소/충돌/전체 숨김 복원·다가오는 일정 3개·최근 메모 3개/더보기/작성자 삭제 |
| Dates | `/sungso/dates/` 직접 진입·기존 events·핀·D-day·목록/달력·추가/삭제·빈 컬렉션 자동 시딩 없음 |
| Invitation | `/sungso/invitation/`과 hash 직접 진입·12종 미리보기·인증 역할의 찜·공동 선택 revision·모션/스크롤·로컬 초안 보존 |
| WeCost | 네 탭·재무 계산·저축/대출/조정 저장 흐름·HomeHunt 목표 집값·Travel 신혼여행 예산 왕복 연결 |
| Honeymoon | 여섯 탭·비교·토너먼트·메모/picks·PDF 10개·현재/이전 여행 |
| Travel | 여덟 화면·달력 이동 국가·날짜 선택의 스크롤 유지·지도·숙소·결정 패널·예산/지급/준비금·출발 준비·일정/금액 이력 |
| HomeHunt | 지도·검색·후보/조건 복원·면적별 실거래·분양·대시보드·인증 |

저장 성공·실패·오프라인·동시 편집은 대역 또는 Emulator로 검증한다. 실제 데이터를 읽는 검증은 Firebase 쓰기를 네트워크/SDK 대역에서 차단하고 운영 데이터에 테스트 기록을 넣지 않는다. **날짜·WeCost는 자동 시딩하지 않으며 빈 저장소를 개인 기본값으로 채우지 않는다. Honeymoon의 로그인 후 자동 환율 갱신은 여전히 쓰기**이므로 QA에서 차단한다. 단순 화면 열기만으로 쓰기가 없다고 가정하지 않는다.

정적 개인 기본값의 이전은 QA와 분리한 관리자 작업이다. 기존 운영 값이 우선이며 비공개 백업·건수·비민감 해시·dry-run을 비교하고 재실행 시 덮어쓰지 않는다. 실제 데이터·회원 UID·이메일·토큰·서버 자격증명은 Git·검증 문서·캡처·로그에 포함하지 않는다. 개인 PDF의 Drive 이전은 사용자 보류 상태를 [체크리스트](development-plans/active/couple-home/CHECKLIST.md)에 유지한다. 현재 공개 PDF를 인증 보호 완료로 기록하지 않는다.

Travel–WeCost 예산의 계산·저장 대역은 `tests/travel-budget-core.test.mjs`·`tests/travel-budget-store.test.mjs`로 확인한다. 브라우저에서는 `#budget`·`#readiness`·WeCost `?tab=wedding` 직접 진입과 왕복 이동, 조회·후보 금액 적용 시 쓰기 0, 명시 저장의 장부·예산·이력 일괄 반영을 확인한다. 미입력 금액·환율, 여러 신혼여행 항목 중 선택, 장부와 세부 합계의 차이, 오프라인·실패·동시 편집 시 초안 보존도 대역으로 검증한다. 운영 Firebase에서 테스트 예산이나 금액 이력을 만들지 않는다.

기존 사용자 탭·조건·브라우저 저장 기록을 보존한다. 별도 테스트 저장소를 사용하고 실제 통근·Telegram 발송을 검증에 끼워 넣지 않는다. Google·NAVER 지도나 회원 인증을 대역으로만 확인했다면 실제 운영 확인과 구분해 기록한다.
