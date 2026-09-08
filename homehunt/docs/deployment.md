# HomeHunt 배포 방법과 공개 기능 범위

**4.13.1 공개 검색 연결(2026-09-09):** `f269d0e`의 [master Pages 배포](https://github.com/CastleRain/sungso/actions/runs/34244603656)와 같은 소스의 **Render Free·싱가포르·Node 22**가 정상 운영 상태다. API는 [`https://sungso-homehunt-api.onrender.com/api`](https://sungso-homehunt-api.onrender.com/api)이며 Firebase Spark 로그인·기존 UID 개인 백업을 유지했다. 실제 공개 UI 4.13.1에서 로그인·집 찾기/확인한 후보/실거래 메뉴·대원칸타빌1 검색과 최근 1년 실거래 59건 표시를 확인했다. 1280px에서 가로 넘침이 없고 기존 WeCost 예산·회사 조건을 보존했다.

공개 health 200·무로그인 API 401·Google 회원 API 200·공식 단지 17,851곳과 2개월 가격 작업 완료·결과 1개 및 재조회 일치를 검증했다. 공식 시설 응답은 394세대·주차 292대·지역난방·승강기 11대다. 실제 공식 역 통근 1회 성공 후 Kakao 장부와 화면은 1회 사용·999/1,000회 남음으로 일치했다. 당일 전환 표식 적용·로컬 통근 0회·미반영 증가분 0회를 확인했고 전날 사용량은 이월하지 않았다. 일반·역 자료 1,097개, Firestore Emulator 보안·정리 20개와 Render 빌드를 통과했다.

새 통근은 공개 HomeHunt에서 사용한다. 복원한 회사의 주소·비중은 유지되며 필요한 위치 재확인을 마친 뒤 조회한다. 무료 서버는 첫 접속에 약 1분이 걸릴 수 있고 월 750시간은 같은 워크스페이스의 무료 서비스와 공유한다. 결제·Blaze 전환은 하지 않았다. [Render 배포 절차와 한도](render-deployment.md), [Firestore 무료 운영](firestore-free-operation.md), [Functions 대안과 저장 정책](firebase-cloud.md)을 참고한다.

**4.12.2 연결 상태(2026-09-08):** 기존 공공데이터 키를 GitHub Actions 비밀 설정 3개에 등록했다. [분양 수집](https://github.com/CastleRain/sungso/actions/runs/34232464658)은 청약홈 1,136건·LH 21건·SH 정상 0건, 총 1,157건을 공개 반영했다. [실거래 수집](https://github.com/CastleRain/sungso/actions/runs/34233286247)은 9개 지역의 2023-05~2026-08, 40개월 매매·전월세 491,000건을 집계했다. 491,000은 거래 수이며 후보 집 수가 아니다. 추적 단지 설정은 비어 있어 개별 단지 정적 이력은 0곳이다.

`72aaf1f` master Pages 배포 성공과 공개 HTML 4.12.2, 실제 연결 화면의 공식 실거래 집계·공고 연결·개인 계정 백업 표시를 확인했다. 온라인 검색 API 미배포와 공개 집계를 구분해서 표시한다.

GitHub 실행 서버 일부에서 `apis.data.go.kr` 접속 시간 초과가 발생했지만 새 실행 서버에서 수집 성공했다. 대량 수집 전 인증키 없는 접속 검사, 기존 파일 보존, 빈 전용 키의 공통 키 대체, LH 키 전달과 Pages 재빌드를 추가했다. 클라우드 K-apt·개인 백업 유지·로그인 시설 대기열을 포함해 자동 검사 1,066개, 실제 Firestore 보안 16개 및 번들 빌드를 통과했다. 4.12.2 공개 당시 검색 서버는 미배포였고, 이후 Render 무료 서버를 배포하며 Firebase Spark를 유지했다.

**4.12.1 릴리스 범위:** 확인한 후보 페이지·통근 충족 지도·작은 조건창·분양 위치 지도와 시설 자동 확인 반복 방지를 포함한다. 최신 `master`의 공개 분양·법정동 JSON을 유지하고 관련 코드만 통합한다. Firebase 개인 백업은 기존 연결을 유지하며, 가격·통근·공식 시설 검색 API의 공개 배포는 별도다.

**4.12.1 배포 이력:** 2026-09-08, 릴리스 `bb8a825`의 [Pages 배포](https://github.com/CastleRain/sungso/actions/runs/34223589734)가 성공했다. 공개 HTML 4.12.1·연결 CSS/JS 40개·수정 모듈 5개의 HTTP 200과 릴리스 코드 일치를 확인했다. 실제 공개 지도·예산 팝업 열기/취소·확인한 후보·분양 메뉴와 1280px 가로 넘침 없음 검증. 통합 릴리스에서 1,042개 검사가 통과했다. 당시 공개 가격·통근·시설 API는 미연결이었고 청약홈·LH 인증도 실패했다. 분양 인증과 공개 수집은 이후 4.12.2에서 해결했다.

> 아래 4.4.0·4.2.1 검증은 이전 배포 이력이다. 현재 검색 서버 준비는 [Render 배포 문서](render-deployment.md), 저장·인증 정책은 [클라우드 문서](firebase-cloud.md)를 우선 참고한다.

**4.4.0 공개 확인:** `5978806`의 Pages 배포가 성공했고 공개 HTML·클라우드 JS·CSS와 실제 화면을 검증했다. Google 로그인·허용 계정 개인 백업은 Firebase 무료 플랜에서 활성화했다. 새 가격·통근 검색 API는 아직 로컬 전용이다.

## 현재 배포 경로

- 저장소: [CastleRain/sungso](https://github.com/CastleRain/sungso)
- 서비스: [HomeHunt](https://castlerain.github.io/sungso/homehunt/)
- GitHub Settings → Pages: **Deploy from a branch → master → / (root)**
- HTML·CSS·JS·공개 JSON을 그대로 배포한다. 프런트엔드 빌드 명령은 없다.

2026-09-06에 GitHub API로 위 Pages 설정과 저장소 쓰기 권한을 확인했다. 당시 릴리스는 HomeHunt 4.2.1과 공용 재무 계산, WeCost 집 탭 연결을 포함했다. 이후 릴리스도 신혼여행 앱·개인 IDE 설정의 무관한 변경과 분리하며, master에 자동 수집된 최신 공개 JSON을 보존한다.

**배포 확인:** 2026-09-06 11:52 KST에 릴리스 `0346b7420a33b5cb431039a023bc92c64dce31e2`의 [Pages 빌드·배포](https://github.com/CastleRain/sungso/actions/runs/34007580909)가 성공했다. 전체 자동 테스트 367개를 통과했고 공개 HTML 4.2.1, CSS·공용 모듈·역 데이터 HTTP 200, 네이버 지도와 단지 상세 연결, 390px 가로 넘침 없음·브라우저 오류 없음을 확인했다. 공개 실거래 데이터와 검색 서버의 미연결 상태도 화면에서 검증했다.

GitHub Pages는 HTML·CSS·JavaScript를 제공하는 정적 호스팅이다. PC에서 실행 중인 Node 서버를 함께 실행해 주지 않는다. [GitHub 공식 설명](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 지금 공개되는 것

| 기능 | 현재 Pages 배포 |
|---|---|
| 새 화면·지도 핀·조건 입력·공식 단지 검색 | 가능. 지도는 NAVER 등록 도메인 설정 필요 |
| 방문 기록·관심·비교·직접 입력한 자금 계획 | 해당 브라우저에 저장하며 사용 가능 |
| 정적 실거래·분양 JSON 열람 | 연결됨. 4.12.2 수집 당시 거래 491,000건 집계·공고 1,157건이며 실제 수집 범위만 제공 |
| 추천 점수 | 회사별 실제 통근과 확인한 가격·역·연식·규모·주차 근거로 계산. 경로 미확인은 점수 보류 |
| 새 조건의 실거래 후보 검색·단지 이력 | 연결됨. Render 가격 작업·재조회 및 공개 화면의 실제 단지 이력 확인 |
| 회사명 검색·실제 통근·호출 쿼터 확인 | 연결됨. NAVER 장소 검색 200·5개 결과, 공식 역 통근 1회·실제 장부/잔여량 일치 확인. 복원 회사는 필요한 위치 재확인 |
| 공식 주차·난방·승강기 자동 확인 | 온라인 연결. 단지 이름 대조 수정 후 공식 시설 실응답 확인. 원자료 누락·통합 단지는 미확인 구분 유지 |
| Google 로그인·개인 기록 백업·WeCost 목표가격 | 연결됨. 계정별 백업이며 서로 다른 계정 간 자동 공동 편집은 별도 |

`js/config.js`는 localhost에서 `127.0.0.1:8787` API를 사용하고 공개 도메인에서는 검증한 Render `CLOUD_API_BASE_URL`을 사용한다. Google 회원 인증·Firestore 작업 저장·공유 호출 장부·호출 제한을 적용하고 실제 공개 화면과 서버 조회를 확인했다. 로컬 통근 원호출은 0회로 막아 같은 키의 독립 장부가 다시 생기지 않도록 했다. Render의 프로세스 확인 `/healthz`와 인증된 실제 API `/api/health`는 구분한다.

localhost의 기록과 공개 도메인의 기록은 서로 다른 브라우저 저장 공간이다. 사용자가 내보낸 JSON을 공개 사이트에서 복원하는 방식으로 옮길 수 있다. 방문·회사·재무 기록을 배포 파일에 넣지 않는다.

## 다음 화면 변경을 배포하는 순서

1. HomeHunt 관련 변경과 필요한 `shared/financial-calc.mjs`, WeCost 연동 파일만 커밋한다. `.env`와 `homehunt/.local/`은 Git 제외 상태를 유지한다.
2. 최신 master에 변경을 병합하고 아래 검증을 실행한다. 자동 수집된 공개 JSON을 예전 로컬 파일로 덮어쓰지 않는다.
3. 검증한 master를 push하면 기존 Pages 배포가 실행된다. GitHub Actions의 `pages build and deployment` 성공과 실제 서비스 버전을 확인한다.

```powershell
# 인증 확인: 필요한 경우 gh auth login 실행
gh auth status
git fetch origin

# 검증
node --test homehunt/tests/*.test.mjs homehunt/scripts/build-rail-stations.test.mjs
node --check homehunt/js/app.js
node --check homehunt/js/naver-map.js
git diff --check

# 최신 master와 통합한 릴리스 체크아웃에서 실행
git push origin HEAD:master

# 배포 확인
gh api repos/CastleRain/sungso/pages/builds/latest
```

실제 배포 시에는 기존 작업 브랜치와 수정 중인 다른 앱을 보존하려고 별도 Git worktree에서 최신 master와 통합한다. master가 그 사이 갱신되면 다시 통합·검증한 뒤 정상 push한다. force push는 사용하지 않는다.

## 공개 데이터 자동 갱신

GitHub Settings → Secrets and variables → Actions에 아래 세 공급원 인증정보를 등록했으며 2026-09-08 실제 수집을 확인했다. 키를 교체할 때도 같은 이름을 사용한다. 이 문서에는 값이 들어가지 않는다.

- 국토부 실거래: `DATA_GO_KR_SERVICE_KEY`
- 청약홈: `APPLYHOME_SERVICE_KEY` 또는 워크플로의 공통 공공데이터 키
- LH: `LH_SUPPLY_SERVICE_KEY` — 실제 활용승인을 받은 공급원 키
- Telegram은 별도 선택 기능이며 배포 확인을 위해 메시지를 보내지 않는다.

2026-09-06 배포 준비 시 저장소 Actions Secrets 목록은 비어 있었다. 당시 master의 실거래 집계·단지 이력은 미수집 상태였고, 분양은 SH 정상 조회 0건·청약홈 조회 실패·LH 인증정보 없음으로 부분 성공 0건이었다. PC 로컬 화면의 6개 분양이나 993개 후보가 이 공개 파일에 자동 복사되는 구조는 아니다.

수동 검증은 Actions에서 `Update HomeHunt market data` 또는 `Update HomeHunt supply notices`를 실행한다. 분양 수동 실행의 `notify`는 기본 false로 둔다. 공급원 실패를 성공·공고 없음으로 오인하지 말고 수집 요약을 확인한다.

실거래·분양 워크플로 모두 데이터 변경 후 Pages 재빌드를 요청한다. 수집 요약·JSON 커밋·Pages 반영을 각각 확인하고, 필요한 경우에만 아래 재빌드를 실행한다. 공공데이터 실행 서버의 일시 접속 실패는 인증 실패와 구분하며 기존 공개 파일을 보존한다.

```powershell
gh api --method POST repos/CastleRain/sungso/pages/builds
```

## 휴대폰에서도 전체 검색을 사용하려면

1. [`render.yaml`](../../render.yaml)의 **Free·Singapore·Node 22·master** 설정과 실제 build/start 명령으로 Render 웹 서비스를 배포한다. Firebase는 기존 Spark Google 로그인·DB를 유지한다. [상세 절차](render-deployment.md)
2. Render에 전용 Firebase 인증과 공급자 설정을 비밀 환경변수로 등록한다. 기존 Google 토큰·활성 회원·호출 제한 검사를 유지한다. 페이지 접근 코드는 서버 인증을 대신하지 않는다.
3. 첫 접속의 약 1분 준비 대기를 포함해 `/healthz`, 무로그인/회원 API, 작은 가격 조회, 공식 시설 조회를 검증한다. Render 월 750시간은 같은 워크스페이스의 무료 서비스끼리 공유하며 외부 API·DB 통신 제한도 확인한다. [Render Free](https://render.com/docs/free)
4. 로컬 통근 원호출을 중지하고 현재 한국 날짜의 사용량을 클라우드 장부에 중복 없이 합산한다. 한 후보만 확인해 실제 사용량·잔여량을 대조한 뒤 검증한 `/api` 주소를 `CLOUD_API_BASE_URL`에 연결한다.
5. Pages 배포 후 실제 휴대폰에서 로그인→서버 준비 안내→조건 검색→시설·후보 상세→필요한 통근 확인→개인 백업을 검증한다. 무료 Firestore는 [관리형 TTL 없이 제한된 자체 정리](firestore-free-operation.md)를 사용한다. 이 검증을 마친 다음 전체 검색 연결 완료로 표시한다.

Firebase Functions로 옮기려면 별도 Blaze 선택과 [Functions 대안 절차](firebase-cloud.md)가 필요하다. 기존 `functions/index.js`의 단지 이력 함수만 배포하면 추천·통근·시설까지 배포되는 것은 아니다.

NAVER Maps Web 서비스 URL에는 `https://castlerain.github.io`가 등록돼 있어야 한다. 비밀키를 Pages의 JS나 JSON에 넣거나 PC localhost 서버를 그대로 포트 개방하는 방식으로 대체하지 않는다.
