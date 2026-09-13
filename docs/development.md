# 개발과 검증

모든 명령은 별도 표기가 없으면 저장소 루트에서 실행한다. Node.js 22와 npm을 사용한다. 앱은 정적 HTML·브라우저 ES 모듈 구조이며 외부 라이브러리는 기존 CDN으로 가져온다.

이번 구조 정리의 실제 실행 결과와 미확인 범위는 [검증 기록](restructure-verification.md)에 구분한다.

## 웹 실행

```sh
npm ci
npm run dev
```

기본 주소는 `http://127.0.0.1:8000/sungso/`다. 미리보기는 먼저 빌드하고 변경을 감시하며 `dist/`만 제공한다. `apps/` 또는 저장소 루트를 일반 정적 서버로 제공하거나 `file://`로 소스를 열지 않는다. 소스·공개 출력의 import 깊이가 다르고 PDF·ES 모듈도 HTTP가 필요하다.

`npm run build`는 등록한 파일만 복사하고 JS import를 소스→공개 경로 매핑에 맞춘다. 공통 모듈은 기존 공개 URL로 직접 출력하며 버전 query를 보존한다. wrapper나 새 별칭으로 우회하지 않는다. `dist/` 파일은 직접 수정하거나 커밋하지 않는다. 미리보기의 호스트·포트를 바꾸면 터미널에 표시된 실제 주소를 사용한다.

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

Render·Cloud 빌드에는 esbuild가 필요하다. `build:services`는 의존성을 자동 설치하거나 서비스·DB·공급자 API를 호출하지 않는다. 배포 설정의 predeploy/build 명령과 실제 번들 입력을 함께 확인한다.

기존 로컬 서버가 필요하면 `.env.example`의 허용 키를 `services/homehunt/.env`에 준비하고 다음 실행기를 사용한다. 기존 값이 있으면 그대로 계승하고 실제 키를 출력하지 않는다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File services/homehunt/scripts/start-local-market.ps1
```

API는 `127.0.0.1:8787`을 유지한다. 프로세스 환경변수가 `.env`보다 우선한다. 키 설정 여부는 실제 공급자 응답 성공과 다르다. `.local/` 캐시·일일 사용량 장부는 재시작·재배치 시 초기화하지 않으며 로컬 통근 원호출은 0회를 유지한다.

## Firestore Emulator

Firebase CLI와 호환되는 Java가 필요하며 Cloud 테스트 의존성을 먼저 설치한다. 테스트 프로젝트는 `demo-homehunt`, 연결은 localhost Emulator로 고정한다. 운영 Firebase 프로젝트·사용자 토큰·서비스 계정으로 검사하지 않는다.

```sh
firebase emulators:exec --only firestore --project demo-homehunt "node --test --test-concurrency=1 services/homehunt/cloud/tests/*.test.mjs"
```

두 테스트 파일이 Emulator 데이터를 초기화하므로 파일 간 동시 실행을 막는다. CLI가 제공하는 `FIRESTORE_EMULATOR_HOST`가 없거나 localhost가 아니면 테스트가 실패하는 것이 정상이다. 검사는 본인 UID·회원·비회원·비로그인 경계, 원자적 저장·충돌과 제한된 서버 정리를 확인한다. 루트 `npm test`만으로 이 실제 Emulator 검증을 대신했다고 기록하지 않는다.

## 브라우저 회귀 확인

1440px 데스크톱·390px 휴대폰에서 `/sungso/`의 아래 동작을 확인한다. 직접 주소·새로고침·뒤로/앞으로·홈 복귀·가로 넘침·콘솔 오류·누락 요청을 함께 확인한다.

| 앱 | 확인할 기능 |
|---|---|
| Hub | PIN·일정·핀·D-day·달력·다섯 앱 연결 |
| WeCost | 네 탭·재무 계산·저축/대출/조정 저장 흐름·HomeHunt 목표 집값 |
| Honeymoon | 여섯 탭·비교·토너먼트·메모/picks·PDF 10개·현재/이전 여행 |
| Travel | 여섯 화면·달력 날짜 선택의 스크롤 유지·지도·숙소·결정 패널·이력 |
| HomeHunt | 지도·검색·후보/조건 복원·면적별 실거래·분양·대시보드·인증 |

저장 성공·실패·오프라인·동시 편집은 대역 또는 Emulator로 검증한다. 실제 데이터를 읽는 검증은 Firebase 쓰기를 네트워크/SDK 대역에서 차단하고 운영 데이터에 테스트 기록을 넣지 않는다. **홈·WeCost의 기본 시딩과 Honeymoon의 자동 환율 갱신도 쓰기**다. 단순 화면 열기만으로 쓰기가 없다고 가정하지 않는다.

기존 사용자 탭·조건·브라우저 저장 기록을 보존한다. 별도 테스트 저장소를 사용하고 실제 통근·Telegram 발송을 검증에 끼워 넣지 않는다. Google·NAVER 지도나 회원 인증을 대역으로만 확인했다면 실제 운영 확인과 구분해 기록한다.
