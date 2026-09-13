# 배포와 복구

소스는 `apps/`·`shared/`·`services/`로 관리하고, 웹은 생성된 `dist/`를 GitHub Pages로 배포한다. 공개 주소 `/sungso/`와 네 앱의 기존 하위 주소, Firebase 데이터·인증·함수명, Render API 주소를 유지한다.

이 문서는 구조 전환과 이후 배포 절차다. **실제 전환·배포 완료 여부는 [루트 진행 상황](../AGENTS.md#진행-상황)의 이번 검증 결과를 따른다.** 소스 설정을 바꾼 사실만으로 원격 설정이나 배포 성공을 뜻하지 않는다.

로컬 검사 1,403개·Emulator 20개·세 서비스 번들 검증은 완료했다. 공개 전환은 아직 진행 중이며 [검증 기록](restructure-verification.md)과 최종 진행 상황을 함께 확인한다.

## GitHub Pages

- 저장소·브랜치: `CastleRain/sungso`의 `master`.
- Pages의 Source는 GitHub Actions다. 워크플로에서 Node 의존성을 설치하고 검사·빌드한 `dist/`를 Pages artifact로 올려 배포한다.
- 웹 출력은 `config/apps.json`의 허용 목록을 따른다. `services/`, 원천자료, 비밀 설정, 테스트, archive 전체를 업로드하지 않는다.
- 공통 모듈·여행 패널은 wrapper 없이 기존 공개 URL에 직접 출력하며 버전 query를 유지한다. 캐시된 기존 페이지와 새 산출물을 함께 읽는 경우의 모듈 동일성도 검증한다.
- 이전 소스 폴더를 Pages 배포 루트로 선택하거나 일반 branch 기반 빌드를 수집 작업에서 다시 호출하지 않는다.
- 배포 후 실제 공개 다섯 페이지와 소스→공개 경로 매핑으로 유지한 공통 모듈의 기존 주소, 독립 보고서·PDF·명시한 백업 주소를 확인한다.

GitHub Actions 토큰이 만든 커밋에 일반 push 실행을 기대하지 않는다. 수집 워크플로는 변경이 있을 때 Pages 배포 워크플로를 명시적으로 호출한다. [Pages custom workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [워크플로 실행 조건](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

## 네 공공자료 수집 작업

워크플로 이름·기존 주기·키 이름·공급자 요청 범위를 유지한다. 수집 소스는 `services/homehunt/scripts/`, 화면 결과는 `apps/homehunt/data/`다.

| 워크플로 | 실행기 | 결과 |
|---|---|---|
| `update-homehunt-market.yml` | `fetch-market-data.mjs` | market-summary.json, apartment-history.json |
| `update-homehunt-supply.yml` | `fetch-home-supply.mjs` | home-supply.json; 알림 장부는 services/homehunt/state/ |
| `update-homehunt-finance.yml` | `fetch-finance-data.mjs` | finance-dashboard.json |
| `update-homehunt-law-codes.yml` | `update-law-districts.ps1` | law-districts.json |

데이터 커밋 경로·변경 감지와 명시적 재배포 호출을 함께 수정해야 한다. 수집 실패 때 이전 정상 자료·기준일을 유지한다. 분양 검증은 dry-run을 사용하며 Telegram을 임의 발송하지 않는다. 키는 기존 Repository Secrets, 비민감 알림 필터는 기존 Variables에 둔다. 알림 중복 장부를 웹에 배포하지 않는다.

## Render와 Firebase

현재 HomeHunt 검색 서비스는 `https://sungso-homehunt-api.onrender.com/api`다. 루트 `render.yaml`이 기준이며 기존 Free·Singapore·Node 22·master, 환경변수와 인증을 유지한다.

| 항목 | 저장소 루트 기준 값 |
|---|---|
| Root Directory | 비워 둠 |
| Build Command | `npm ci --include=dev --prefix services/homehunt/render && npm run build --prefix services/homehunt/render` |
| Start Command | `npm start --prefix services/homehunt/render` |
| Health Check | `/healthz` |
| 빌드 감시 | 서비스·shared·필요한 공개 단지자료·render.yaml |

관리 화면에 수동 등록한 명령은 저장소 파일 이동만으로 자동 갱신됐다고 가정하지 않는다. Blueprint 연결 상태와 실제 Build/Start 값을 확인한다. `FIREBASE_SERVICE_ACCOUNT_JSON`·`HOMEHUNT_PROVIDER_CONFIG`의 기존 비밀값과 Firestore 사용량·캐시는 보존한다.

`/healthz`는 프로세스 확인이며 `/api/health`의 무로그인 401·회원 인증·실제 데이터 계약과 별도로 확인한다. 구조 정리 검증 때문에 새 통근을 호출하지 않는다. 상세한 기존 인증·공급자·정리 정책은 [Render](../apps/homehunt/docs/render-deployment.md), [Firebase](../apps/homehunt/docs/firebase-cloud.md), [Firestore 운영](../apps/homehunt/docs/firestore-free-operation.md)을 따른다.

루트 `firebase.json`은 `services/firebase-default`의 기존 default 코드베이스와 `services/homehunt/cloud`의 homehunt 코드베이스를 가리킨다. 기본 함수는 공유 국토부 코드를 번들에 포함하고 Cloud는 플랫폼 공통 API를 번들에 포함한다. 빌드·Emulator 검증은 운영 Functions 배포나 Blaze 전환을 하지 않는다. 운영 Functions를 사용하지 않는 현재 Render 구성에 Firebase 배포를 추가할 필요는 없다.

## 구조 전환 순서

1. 이전 운영 커밋·웹 산출물·Render 배포 ID와 Build/Start/자동배포 설정, 네 수집 작업의 활성 상태를 기록한다. DB·공급자 키를 복구용 웹 산출물에 넣지 않는다.
2. 로컬 `npm run check`, 서비스 번들, Emulator와 1440px/390px 기능 검증을 마친다. 이전/새 웹 산출물을 복구 가능한 작업 위치에 보관한다.
3. 수집 작업과 Render 자동 배포를 잠시 중지하고 실행 중인 수집 작업의 완료를 확인한다. 현재 공개 서비스는 유지한다. 변경 중 새 데이터 커밋이 생겼으면 변경 내용을 보존해 통합한다.
4. 검증된 소스를 master에 반영하고 Pages Source·워크플로 및 Render의 실제 경로 설정을 전환한다. 같은 릴리스 소스의 웹과 서버를 배포한다. Render 관리 화면이 로그아웃 상태이면 설정 변경에 사용할 로그인이 먼저 필요하다.
5. 공개 다섯 페이지·기존 주소·기존 사용자 기록·API 인증 경계·현재 데이터 연결을 확인한다. 운영 DB 쓰기·통근 원호출 없이 확인 가능한 범위를 우선한다.
6. 네 수집 작업의 새 경로와 자동 수집→배포 연결을 확인한 뒤 원래 활성 상태와 Render 자동 배포를 복원한다. 결과·배포 ID·검증하지 못한 항목을 진행 상황에 기록한다.

## 실패와 복구

웹 실패는 보관한 이전 산출물을 배포하고 Render 실패는 이전 성공 버전과 명령으로 되돌린다. 경로를 되돌릴 때 새 구조용 자동 수집을 그대로 실행하지 않는다. 원래 코드·설정과 일치하는 워크플로 상태를 복원한다.

DB·개인 기록·실제 사용량·새로 수집된 정상 자료는 복구 대상 웹 소스와 별개다. 이전 Git 커밋으로 복구하면서 이 데이터를 덮어쓰거나 일일 장부를 초기화하지 않는다. 공개 확인이 끝나기 전 완료로 기록하지 않는다.
