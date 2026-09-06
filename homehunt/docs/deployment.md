# HomeHunt 배포 방법과 공개 기능 범위

## 현재 배포 경로

- 저장소: [CastleRain/sungso](https://github.com/CastleRain/sungso)
- 서비스: [HomeHunt](https://castlerain.github.io/sungso/homehunt/)
- GitHub Settings → Pages: **Deploy from a branch → master → / (root)**
- HTML·CSS·JS·공개 JSON을 그대로 배포한다. 프런트엔드 빌드 명령은 없다.

2026-09-06에 GitHub API로 위 Pages 설정과 저장소 쓰기 권한을 확인했다. 이번 릴리스는 HomeHunt 4.2.1과 공용 재무 계산, WeCost 집 탭 연결을 포함한다. 신혼여행 앱·개인 IDE 설정 변경은 포함하지 않는다. master에 자동 수집된 최신 공개 JSON은 보존한다.

**배포 확인:** 2026-09-06 11:52 KST에 릴리스 `0346b7420a33b5cb431039a023bc92c64dce31e2`의 [Pages 빌드·배포](https://github.com/CastleRain/sungso/actions/runs/34007580909)가 성공했다. 전체 자동 테스트 367개를 통과했고 공개 HTML 4.2.1, CSS·공용 모듈·역 데이터 HTTP 200, 네이버 지도와 단지 상세 연결, 390px 가로 넘침 없음·브라우저 오류 없음을 확인했다. 공개 실거래 데이터와 검색 서버의 미연결 상태도 화면에서 검증했다.

GitHub Pages는 HTML·CSS·JavaScript를 제공하는 정적 호스팅이다. PC에서 실행 중인 Node 서버를 함께 실행해 주지 않는다. [GitHub 공식 설명](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 지금 공개되는 것

| 기능 | 현재 Pages 배포 |
|---|---|
| 새 화면·지도 핀·조건 입력·공식 단지 검색 | 가능. 지도는 NAVER 등록 도메인 설정 필요 |
| 방문 기록·관심·비교·직접 입력한 자금 계획 | 해당 브라우저에 저장하며 사용 가능 |
| 정적 실거래·분양 JSON 열람 | 저장소에 실제 수집된 범위만 가능 |
| 역·강남 거리 점수 | 좌표와 실거래 후보 자료를 확보한 후보에 대해 계산 가능 |
| 새 조건으로 993곳 같은 실거래 후보 검색 | 현재 localhost 전용. 공개 추천 API가 아직 없음 |
| 회사명 검색·실제 통근·호출 쿼터 확인 | 현재 localhost 전용 |
| 모든 단지의 실시간 이력 조회 | 공개 Firebase 함수 활성화·Secret 연결·검증 필요 |
| 두 사람의 기록 공유·WeCost 자동 연동 | 인증·가구별 권한·공유 저장소 연결 필요 |

`js/config.js`는 localhost에서만 `127.0.0.1:8787` API를 사용한다. 공개 도메인에서는 추천·경로·회사 검색 URL이 비어 있고 원격 단지 이력 요청도 꺼져 있다. 이는 URL만 교체하면 완료되는 서버 배포 상태가 아니다. 현재 로컬 서버에는 localhost 바인딩·Origin 제한과 메모리 작업 관리가 있으므로 인터넷 공개용 인증·저장·호출 제한을 함께 구현해야 한다.

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

GitHub Settings → Secrets and variables → Actions에 공급원 인증정보를 등록한다. 이 문서에는 값이 들어가지 않는다.

- 국토부 실거래: `DATA_GO_KR_SERVICE_KEY`
- 청약홈: `APPLYHOME_SERVICE_KEY` 또는 워크플로의 공통 공공데이터 키
- LH: 실제 활용승인을 받은 공급원 키가 수집기에 전달되도록 연결
- Telegram은 별도 선택 기능이며 배포 확인을 위해 메시지를 보내지 않는다.

2026-09-06 배포 준비 시 저장소 Actions Secrets 목록은 비어 있었다. 당시 master의 실거래 집계·단지 이력은 미수집 상태였고, 분양은 SH 정상 조회 0건·청약홈 조회 실패·LH 인증정보 없음으로 부분 성공 0건이었다. PC 로컬 화면의 6개 분양이나 993개 후보가 이 공개 파일에 자동 복사되는 구조는 아니다.

수동 검증은 Actions에서 `Update HomeHunt market data` 또는 `Update HomeHunt supply notices`를 실행한다. 분양 수동 실행의 `notify`는 기본 false로 둔다. 공급원 실패를 성공·공고 없음으로 오인하지 말고 수집 요약을 확인한다.

분양 워크플로에는 데이터 변경 후 Pages 재빌드 요청이 있다. 실거래 워크플로는 현재 JSON 커밋까지 있으므로 데이터가 갱신된 뒤 Pages 반영 여부를 확인하고, 필요하면 아래 재빌드 요청을 실행한다.

```powershell
gh api --method POST repos/CastleRain/sungso/pages/builds
```

## 휴대폰에서도 전체 검색을 사용하려면

1. 기존 Firebase 프로젝트의 서버 배포 권한·결제 설정과 지원 Node 런타임을 확인한다. 현재 저장소의 함수 설정은 Node 20이므로 실제 배포 시 지원 상태와 SDK를 먼저 맞춘다. [Firebase 함수 관리 문서](https://firebase.google.com/docs/functions/manage-functions)
2. 로그인·가구 권한을 확인하는 HTTPS API를 구현한다. 추천 작업/취소/진행 조회, 장소 검색, 단지 이력, 통근 배치·쿼터·캐시를 서버 환경으로 옮긴다. 브라우저용 PIN 화면은 서버 인증을 대신하지 않는다.
3. 국토부·NAVER·Kakao·TMAP 키는 서버 Secret에 저장하고, 사용자별 호출 제한과 기존 일일 한도·캐시 정책을 유지한다. 공급자 유료 호출이나 요금제는 사용자가 정한 범위에서 연결한다.
4. 공개 API 주소와 허용 Origin을 설정하고 `js/config.js`의 공개 URL/활성화 값을 실제 검증된 엔드포인트로 바꾼다. 기존 `functions/index.js`의 단지 이력 함수만 배포하면 추천·통근까지 배포되는 것은 아니다.
5. 실제 휴대폰에서 로그인→조건 검색→지역/입지 점수→선택 후보 통근 확인을 검증한 다음 전체 기능 공개 완료로 표시한다.

NAVER Maps Web 서비스 URL에는 `https://castlerain.github.io`가 등록돼 있어야 한다. 비밀키를 Pages의 JS나 JSON에 넣거나 PC localhost 서버를 그대로 포트 개방하는 방식으로 대체하지 않는다.
