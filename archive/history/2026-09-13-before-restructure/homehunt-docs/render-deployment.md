# HomeHunt Render 무료 검색 서버

## 현재 상태

2026-09-09 KST, **GitHub Pages 화면 + Firebase Spark 로그인·DB + Render Free 검색 서버** 배포와 실제 공개 연결을 확인했다. 최종 소스 `f269d0e`의 [master Pages 배포](https://github.com/CastleRain/sungso/actions/runs/34244603656)가 성공했고 Render도 같은 소스로 Live 상태다. Free·Singapore·Node 22를 사용하며 Firebase Spark와 기존 개인 백업을 유지했다. 검색 API 주소는 [`https://sungso-homehunt-api.onrender.com/api`](https://sungso-homehunt-api.onrender.com/api)다.

공개 UI 4.13.1의 로그인 상태·집 찾기/확인한 후보/실거래 메뉴·검색 조작과 1280px 화면의 가로 넘침 없음을 확인했다. 온라인 health에는 공식 단지 17,851곳이 연결됐다. 실제 공개 화면에서 대원칸타빌1을 검색·선택해 최근 1년 실거래 59건을 표시했다. NAVER 장소 검색의 `판교역` 조회도 200·5개 결과로 확인했다. 인증된 시설 API에서는 공식 코드 `A43776501`을 대조해 394세대·주차 292대·지역난방·승강기 11대를 확인했다. 공식명 끝의 차수와 별칭의 `단지` 표현 차이를 수정한 배포를 포함한다.

`/healthz` 200·무로그인 `/api/health` 401·실제 Google 회원 200과 작은 가격 작업 2개월 완료·결과 1개 및 완료 작업 재조회를 검증했다. 공식 역을 이용한 실제 통근 1회가 정상 응답했고 Kakao 사용량은 0→1회, 잔여 999/1,000회로 바뀌었다. Firestore 장부도 클라우드 1회·로컬 0회·미반영 증가분 0회로 일치했다. 경로 소요시간·좌표는 이 문서에 기록하지 않는다. 일반·역 데이터 검사 1,097개, Firestore Emulator 보안·정리 검사 20개와 실제 Render Node 22 빌드를 통과했다.

한국 날짜 2026-09-09의 통근 사용량 전환 표식을 적용했으며 전날 363회는 이월하지 않았다. 운영 한도는 Kakao 1,000회·TMAP 0회이고 로컬 통근 원호출 한도는 0회로 유지한다. 이후 통근 확인은 공개 HomeHunt에서 사용한다. 기존 Google 개인 백업의 UID와 내용을 유지했으며 덮어쓰지 않았다. 복원된 회사는 저장한 주소·비중을 유지하지만 공급자 좌표를 보관하지 않으므로 통근 검색 전 위치를 다시 확인해야 할 수 있다. 전체 회사·모든 후보의 통근을 대신 검증한 것은 아니다.

화면·지도·공개 실거래 집계·분양 공고는 기존 [GitHub Pages](https://castlerain.github.io/sungso/homehunt/)에서 제공한다. Google 로그인과 개인 백업은 기존 Firebase 프로젝트 `sungso-358cb`의 Spark 플랜을 유지한다. Render는 가격 후보·단지 이력·장소 검색·공식 시설·통근 API를 실행한다. Firebase Functions와 Blaze 전환은 현재 선택의 필수 조건이 아니다. [Functions 대안과 저장 정책](firebase-cloud.md), [Firestore 무료 운영](firestore-free-operation.md)을 함께 참고한다.

## Render 설정

설정의 기준은 저장소 루트의 [`render.yaml`](../../render.yaml)이다. 생성 화면을 사용하는 경우에도 같은 값을 입력한다.

| 항목 | 값 |
|---|---|
| 저장소·브랜치 | `CastleRain/sungso` · `master` |
| 서비스 | `sungso-homehunt-api` · Node 웹 서비스 |
| 확인한 API 주소 | `https://sungso-homehunt-api.onrender.com/api` |
| 요금제·리전 | **Free** · **Singapore** |
| Root Directory | 비워 둠: 저장소 루트에서 빌드 |
| Node | `22` (`homehunt/render/package.json`은 `22.x`) |
| Build Command | `npm ci --include=dev --prefix homehunt/render && npm run build --prefix homehunt/render` |
| Start Command | `npm start --prefix homehunt/render` |
| Health Check Path | `/healthz` |
| 자동 배포 | `master` 커밋, `render.yaml`의 `buildFilter` 대상 파일 변경 시 |
| 일반 환경변수 | `NODE_VERSION=22`, `NODE_ENV=production`, `FIREBASE_PROJECT_ID=sungso-358cb` |

빌드에는 개발 의존성인 esbuild가 필요하므로 `--include=dev`를 생략하지 않는다. 서버는 Render의 `PORT`를 사용하며 `0.0.0.0`에서 받는다. 공개 단지 목록을 빌드에 포함하므로 별도의 로컬 데이터 폴더를 업로드할 필요가 없다. 저장소의 `.env`는 읽지 않는다.

다음 두 값만 Render의 비밀 환경변수로 등록한다. 실제 값·키 파일·개인 조건은 문서나 Git에 넣지 않는다.

| 비밀 환경변수 이름 | 용도 |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | 외부 서버에서 Firebase Admin SDK를 인증하는 전용 서비스 계정 JSON |
| `HOMEHUNT_PROVIDER_CONFIG` | 공공데이터·지도·통근 공급자 인증과 선택한 호출 한도를 담은 서버 설정 |

전용 계정 `homehunt-render`에는 `roles/datastore.user`와 `roles/firebaseauth.viewer`만 부여한다. 기존 Owner·Editor 계정의 키를 대체 사용하지 않는다. Admin SDK는 Firestore 클라이언트 보안 규칙을 우회하므로, 서버의 Google 토큰·검증된 이메일·활성 회원 검사를 유지해야 한다. 이 두 역할은 프로젝트 범위이며 특정 HomeHunt 컬렉션만 허용하는 권한이라는 뜻은 아니다. [외부 환경의 Admin SDK 인증](https://firebase.google.com/docs/admin/setup#initialize_the_sdk_in_non-google_environments), [Firestore IAM](https://docs.cloud.google.com/firestore/native/docs/security/iam)

## 첫 배포와 공개 화면 연결

1. **Free·Singapore·Node 22·master**와 위 명령을 확인하고 배포한다. 유료 인스턴스·유료 DB·Blaze 전환을 추가하지 않는다. 빌드 성공과 Render가 실제 발급한 서비스 주소를 기록한다.
2. `<실제 Render 서비스 주소>/healthz`의 200을 확인한다. 이 주소는 프로세스가 살아 있다는 검사이며 Firebase 권한이나 공급자 조회 성공을 보장하지 않는다. 잠든 서비스는 먼저 이 요청으로 깨어날 수 있다.
3. `<실제 Render 서비스 주소>/api/health`에서 무로그인 401, 비회원 403, 허용 Google 계정 200을 확인한다. 회원 응답의 API 버전·공급자 설정·공식 단지 목록을 확인하고, 키 설정 여부와 실제 조회 성공을 구분한다. 토큰·응답의 개인 정보를 문서나 공개 로그에 붙이지 않는다.
4. 작은 가격 조회와 한 단지의 주차·난방·승강기를 확인한다. 같은 공식 자료 재조회, 가격 검색 진행 저장·이어하기, 일부 외부 조회 실패 때 기존 후보 유지도 확인한다. 휴대폰은 로컬 PC 서버에 연결하지 않고 이 주소를 사용해야 한다.
5. 아래 통근 사용량 전환을 마친 뒤 필요한 한 후보의 경로만 확인한다. 공급자 요청 수와 Firestore 장부의 증가가 일치하는지 확인한다. 가격·시설 검사 때문에 통근을 자동 호출하지 않는다.
6. **인증과 실제 데이터 검증을 마친 주소만** `homehunt/js/config.js`의 `CLOUD_API_BASE_URL`에 `<실제 Render 서비스 주소>/api` 형태로 입력한다. 허용 Origin은 공개 `https://castlerain.github.io`와 개발용 localhost로 제한한다. 토큰을 보내는 대상이 이 검증된 API 주소인지 확인한다.
7. 최신 `master`로 Pages를 배포하고 실제 공개 화면·휴대폰에서 로그인, 서버 준비 안내, 가격 검색, 시설 확인, 후보 열기, 개인 백업을 확인한다. 이 검증을 마친 뒤 문서 상단 상태와 실제 API 주소를 갱신한다.

개인 백업은 기존 `homehunt_user_snapshots/{uid}`에 유지된다. 검색 서버 URL을 입력해도 가구 백업으로 자동 이동하거나 다른 계정의 기록과 병합하지 않는다. 로그인·조회만으로 로컬 기록을 덮어쓰지 않는다.

## 통근 호출량 전환

같은 Kakao 키를 로컬과 Render에서 쓰면 공급자의 하루 한도는 함께 소모된다. 서버가 새로 생겼다는 이유로 남은 횟수를 1,000회로 초기화하면 안 된다.

1. 로컬의 신규 통근 호출을 먼저 중지한다. 화면에 이미 받은 결과는 유지한다.
2. **현재 한국 날짜**의 로컬 사용량과 Firestore `homehunt_provider_usage`의 사용량을 읽는다. 자정을 넘었다면 새 날짜를 다시 확인하며 지난 날짜 사용량은 이월하지 않는다.
3. 독립적으로 사용한 로컬 횟수를 클라우드 장부에 전환 표식과 함께 한 번 합산한다. 기존 클라우드 값과 `max`를 취하지 않는다. 재실행할 때는 이미 반영한 로컬 횟수 이후의 증가분만 더한다.
4. 공개 통근을 켠 뒤 같은 키의 요청은 하나의 장부를 사용하게 하거나 로컬 원호출을 비활성화한다. 한 후보 검증 후 실제 요청 수·장부·화면 잔여량을 대조한다.

Kakao·NAVER 경로와 파생 점수는 DB 재사용 대상이 아니다. 원자료 저장이 허용된 공식 가격·시설 캐시 및 TMAP 8시간 캐시와 구분한다. [공급자별 정책](firebase-cloud.md)

## 무료 운영의 범위

- **첫 접속 대기:** Free 서비스는 요청이 없는 상태가 15분 이어지면 잠들고, 다음 요청에서 다시 시작하는 데 약 1분이 걸릴 수 있다. 화면은 서버 준비 중 상태를 안내해야 하며, 이 시간을 후보 0곳이나 조건 불일치로 표시하면 안 된다. 서버를 계속 깨워 두는 별도 주기 호출은 추가하지 않는다. [Render Free](https://render.com/docs/free)
- **월 실행시간:** 워크스페이스의 Free 웹 서비스 전체가 월 750시간을 나눠 쓴다. HomeHunt에만 750시간이 각각 제공되는 것이 아니다. 소진되면 다음 달까지 무료 서비스가 중단될 수 있다. 빌드 시간·외부 전송량에도 별도 한도가 있으며 결제수단 여부에 따라 중단 또는 추가 비용이 발생할 수 있으므로 대시보드 사용량을 확인한다. [Render Free 한도](https://render.com/docs/free)
- **외부 API·DB 통신:** Render는 무료 서비스가 시작한 과도한 외부 통신에 대해 중단할 수 있다고 안내하지만 숫자로 된 임계치는 공개하지 않는다. Firestore와 공공 API를 쓰는 HomeHunt도 해당될 수 있다. 캐시와 호출 제한을 적용해도 무중단을 보장하지 않으며, 중단 시 원인을 확인한 뒤 사용 범위나 배포 방법을 조정한다. 유료 전환을 자동 실행하지 않는다. [Render 외부 트래픽 제한](https://render.com/docs/free)
- **재시작과 저장:** Free 파일시스템은 재배포·재시작·절전 때 유지되지 않는다. 가격 작업·공식 캐시·일일 통근 장부는 Firestore에 저장한다. 개인 회사 위치나 기록을 서버 디스크에 영구 보관하는 구조로 바꾸지 않는다. [Render 파일시스템](https://render.com/docs/free)
- **동시 요청:** 현재 서버는 전체 동시 처리 2개, 큰 가격 작업 1개, 대기열 8개로 제한한다. 혼잡하면 503과 재시도 안내를 반환한다. 무제한 후보·시설·통근 일괄 조회를 동시에 시작하지 않는다.

Firestore Spark도 프로젝트 전체의 무료 한도를 함께 쓴다. 저장 공간 1GiB·일일 읽기 50,000회·쓰기 20,000회·삭제 20,000회는 WeCost·일정·신혼여행과 공유한다. Firestore의 일일 초기화 기준과 통근 장부의 한국 날짜 기준은 다르다. [Firestore 무료 할당량](https://firebase.google.com/docs/firestore/quotas)

현재 무료 구성에는 **관리형 TTL 정책을 만들지 않는다.** 서버 시작 및 실행 중 6시간 간격으로 제한된 정리만 수행하며 한 번에 읽기 최대 500건·삭제 최대 250건이다. 개인 백업은 정리 대상에서 제외한다. 공식 월 자료는 90일 보관, K-apt 목록은 7일·기본/상세는 1일, 검색 작업은 24시간, TMAP 경로는 8시간 기준을 적용한다. 월 자료 보관 기간은 화면에서 최신 가격으로 인정하는 유효기간과 다르다. 정리가 총 저장 공간 1GiB 미만을 강제하는 것은 아니므로 사용량을 확인한다. 세부 범위와 장부 보존은 [Firestore 무료 운영](firestore-free-operation.md)을 따른다.

## 장애 확인 순서

1. Render의 배포·서비스 상태와 `/healthz`를 확인한다. 첫 접속의 준비 대기와 서버 중단을 구분한다.
2. 공개 화면의 Google 로그인·회원 권한, 검증한 API 주소, CORS 허용 Origin을 확인한다. 건강 검사 200만으로 인증 성공을 판단하지 않는다.
3. 공급자 오류 코드와 실제 사용량을 확인한다. 공공데이터 접속 시간 초과·활용 권한·통근 일일 한도를 각각 구분하고, 실패한 월·후보만 이어서 조회한다.
4. Render 실행시간·전송량·외부 통신 제한과 Firestore 무료 사용량을 확인한다. 기존 후보·공개 집계·저장 기록은 유지하고 실패 때문에 전체를 초기화하지 않는다.
5. 서비스를 교체할 때도 통근 장부는 보존한다. 새 API의 인증·데이터 확인 후 프런트 주소를 바꾸며, Firebase Functions를 선택한다면 [별도 Blaze 배포 절차](firebase-cloud.md)를 따른다.
