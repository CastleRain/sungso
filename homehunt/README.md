# 우리집 레이더 (HomeHunt)

성우와 소희가 직접 본 아파트를 지도에 기록하고, 최대 4개 회사·주요 목적지 사이에서 서울·경기 아파트의 같은 전용면적 실거래와 조건 맞춤 후보를 확인하는 앱입니다. 화면은 GitHub Pages에 배포할 수 있고, 개발 중에는 로컬 실행기가 Git에서 제외된 `homehunt/.env`를 읽어 로컬 전용 서버에 실제 가격·장소·경로 조회 키를 전달합니다.

현재 화면과 로컬 API의 계약 버전은 **2.5.0**입니다. 화면에 `서버 재시작 필요`가 보이면 실행 중인 이전 서버를 종료한 뒤 다시 시작합니다.

UI는 **Tabler UI 1.4.0 + Tabler Icons 3.46.0**을 기반으로 하며, 기존 네이티브 폼과 데이터 로직을 유지한 채 `css/ui-kit.css`와 `js/ui-kit.js`에서 HomeHunt 전용 부동산 테마를 적용합니다.

현재 화면·기능·데이터 원리와 다음 고도화 기준은 [`docs/homehunt-2.5-handoff/README.md`](./docs/homehunt-2.5-handoff/README.md)에 캡처와 함께 정리되어 있습니다.

## 처음 사용하는 순서

상단의 `사용 안내`를 열면 아래 여섯 기능과 데이터가 저장되는 위치를 한 화면에서 확인할 수 있습니다. 처음에는 전부 설정하려 하지 말고 `목적지 등록 → 집 찾기 → 방문 기록 → 실거래 확인` 순서로 시작하는 것이 가장 쉽습니다.

1. **집 찾기** — 회사·부모님 댁처럼 자주 가는 목적지를 최대 4곳 등록하고 예산·면적·세대수·연식 조건을 정합니다. 방문하지 않은 아파트까지 포함한 조건 후보를 지도에서 먼저 보고, 필요한 후보의 실제 통근 경로를 확인합니다.
2. **내 기록** — 실제 방문한 집과 관심 후보를 지도·목록·비교 보기로 관리합니다. 현장에서 확인한 가격, 전용면적, 장단점과 메모를 저장하고 방문 당시와 이후 실거래를 이어서 봅니다.
3. **실거래** — 단지와 정확한 전용면적을 고르면 실제 거래의 평균 가격·평당가격·거래량과 1·3·5년 흐름을 봅니다. 예측은 검증 조건을 통과한 경우에만 참고값으로 표시합니다.
4. **분양·청약** — 서울·경기의 청약홈·LH·SH 공고를 한데 모아 봅니다. 지역·동네·가격·면적·공급 세대수와 신혼 관련 조건을 저장하고 관심 공고만 추릴 수 있습니다.
5. **사용 안내** — 처음 사용하는 순서, 여섯 메뉴의 역할, 데이터 의미와 저장 위치를 확인합니다.
6. **연결 상태** — 지도·실거래·회사 검색·통근·분양 공급원이 실제로 연결됐는지 확인합니다. `확인 필요`나 `서버 재시작 필요`가 보이면 이 화면의 안내를 먼저 따릅니다.

처음 보는 사람을 위한 `사용 안내` 화면에는 빠른 시작 순서, 기능별 바로가기, 데이터 출처, 휴대폰 알림 설정과 아래의 청약 준비도 입력이 함께 있습니다. 방문 기록·목적지·청약 프로필은 기본적으로 현재 브라우저에만 저장되므로 다른 휴대폰이나 브라우저에는 자동 동기화되지 않습니다.

## 지금 되는 것

- 네이버 Dynamic Map, 주소 검색, 선택형 역지오코딩, 방문 기록 마커
- 매매·전세·월세/가격/면적/상태/함께 방문 여부 필터
- 방문 기록 추가·수정·삭제, 지도 위치 선택, JSON 백업·복원
- 첫 실행 때 가상 방문 기록을 만들지 않으며, 사용자가 저장한 실제 방문 기록만 지도·목록·비교에 표시
- 최대 3곳 후보 비교함, 확인 가격·전용면적·역 거리·연식·장단점·현장 메모의 사실 기반 나란히 비교
- 방문 카드에서 해당 시군구·거래유형·가장 가까운 실제 전용면적 실거래로 바로 이동
- 방문일 이전 90일 동일면적 실거래 기준과 방문 이후 최근 실거래 기준의 시장 변화를 계산하고, 저장한 현장 확인가와 당시 시장의 차이는 별도 표시
- 한국부동산원 공식 목록 중 서울·경기 17,851개 단지를 지역 선택 없이 검색 (`레미안` 입력도 `래미안` 후보로 보정)
- `지역 + 단지명` 다중 검색, 동명 단지 후보 선택, 같은 지역·브랜드의 비슷한 단지 추천
- 공식 법정동 대조표로 선택 단지의 시군구를 확정하고 매매/전세·실제 전용면적별 이력 조회
- 검색한 단지·거래유형·정확한 전용면적의 월 평균 거래가격, 평균 평당가격, 거래량, 전월 변화, 최근 거래 비교
- 기본 60개월 이력에서 신고 진행 중인 현재·직전월을 제외하고, 시간순 백테스트가 무변화 기준보다 5% 이상 나을 때만 보여주는 6개월 통계적 참고 예측
- 국토부 CSV 수동 가져오기와 IndexedDB 저장
- 자연어/직접 입력 조건으로 세대수·준공연도 후보를 줄이고, 전용면적별 실제 매매 산술평균으로 예산 판정
- 국토부 호출 속도 제한, 실패 요청 재시도, 월 원자료 파일 캐시와 부분 실패 시 해당 시군구 후보 전체 제외
- Git에서 제외된 `homehunt/.env` 자동 로딩, 프로세스 환경변수 우선 적용, 국토부 키 보안 입력 fallback
- 관심 후보 로컬 저장·다시 보기, 지도 이동, 단지 최근 1·3·5년 실거래 연결
- 회사·주요 목적지를 최대 4개 A~D로 등록하고 주당 방문일·교통수단·허용시간을 반영해, 모든 필수 목적지의 실제 경로가 제한 안에 든 후보만 통근 충족으로 판정
- 직선거리는 경로 호출 전 선별에만 사용하고, 가장 불리한 통근을 먼저 최소화한 뒤 가중 평균·도보·환승 부담으로 균형 순위 계산
- Kakao 대중교통으로 넓게 선별한 뒤 사용자가 고른 최종 후보를 같은 출근시각의 TMAP 경로로 재검증하고, 자동차 선택 시 NAVER Directions 5를 병행
- 통근 결과를 `모든 목적지 충족`·`시간 초과`·`경로 미확인`으로 분리하고 Kakao 선별 결과를 TMAP 최종 판정으로 오인하지 않도록 단계 표시
- 맞춤 후보 지도에 목적지 A~D 핀·가격 핀·방문 핀·줌별 후보 수 클러스터를 표시하고, 서로 다른 판정이 섞인 클러스터는 혼합 상태로 표현
- Kakao·TMAP 캐시 미스 원호출을 각각 서울 날짜 일일 장부에 기록하고, 배치 실행 전에 예상 호출 수와 각 공급자의 남은 한도를 검사
- 모든 가격을 억·만원, 모든 전용면적을 ㎡·평으로 함께 표시
- 서울·경기 청약홈 아파트·잔여세대·임의공급, LH 분양주택·신혼희망타운, SH 자체 분양 공고를 한 화면에서 검색하고 접수 중·예정·신혼 관련·관심 공고로 필터
- 분양 공고를 지역·동네 키워드·최대 가격·최소/최대 면적·최소 공급 세대수로 거르고, 가격·면적·세대수 미공개 공고를 포함할지 각각 선택
- 공식 주택형별 신혼부부 배정 세대, 분양가, 면적, 접수·발표·계약 일정과 원문 링크를 표시하고 브라우저 관심·읽음·알림 조건을 로컬 저장
- 두 사람의 자가입력 민영 일반공급 기본 84점 참고값과 신혼부부 특별공급·신혼희망타운 준비 상태를 브라우저에만 저장해 확인하되 당첨 확률은 만들지 않음
- GitHub Actions가 분양 공고를 하루 3회 갱신하고 첫 수집은 기준선으로만 저장한 뒤 신규·변경 공고를 구분
- 비공개 Telegram 그룹을 선택적으로 연결해 사이트가 닫혀 있어도 서울·경기 신규·의미 있는 변경 공고를 휴대폰으로 알림
- GitHub Actions 일일 집계, Firebase 원자료·단지 캐시, 브라우저 IndexedDB 검색 이력

서울·경기 단지 검색 목록은 2025-09-18 공개된 공식 데이터로 채워져 있습니다. `localhost`에서는 로컬 실거래 서버가 켜져 있으면 단지 매매·전월세와 추천 후보의 실제 가격을 바로 조회합니다. GitHub Pages에서는 Firebase Function 배포 전까지 원격 단지 조회가 꺼져 있습니다. 방문 기록에는 가상 샘플을 넣지 않고 빈 상태에서 시작합니다. 별도의 `필터 동작 체험`은 매매·전세와 59.9㎡·84.9㎡ 차트 반응만 확인하는 메모리상 가상 시장 데이터이며 방문 목록이나 실제 시세 저장소에 기록하지 않습니다.

## 데이터 흐름

```text
네이버 Maps ── 위치·주소만 제공
네이버 부동산 ── 저장한 단지의 검색 링크만 제공
행정표준코드관리시스템 ── 주 1회 → data/law-districts.json
한국부동산원 공동주택 단지정보 ── scripts/build-apartment-catalog.mjs
                                  ├─ data/apartment-catalog.json
                                  └─ data/apartment-catalog-meta.json

국토부 매매·전월세 API
  ├─ localhost 로컬 서버 → .env 또는 실행 메모리의 키로 즉시 조회
  │                       └─ homehunt/.local/ 공개 실거래 캐시
  ├─ GitHub Actions(매일) → data/market-summary.json
  │                         data/apartment-history.json
  └─ Firebase Function(첫 단지 검색) → Firestore 월 원자료·단지 캐시

청약홈·LH API·SH 공식 RSS 분양 공고
  ├─ localhost 로컬 서버 → .env의 공공데이터 서비스키로 즉시 조회
  │                       └─ .local/market-cache/home-supply.json (3시간 캐시)
  ├─ GitHub Actions(하루 3회) → data/home-supply.json
  │                              └─ 선택 연결한 비공개 Telegram 그룹 알림
  └─ 브라우저 → 관심 공고·읽음·알림 조건·청약 준비도 localStorage

회사·주요 목적지 A~D
  ├─ NAVER API HUB 지역 검색·NAVER Geocoding → 목적지 좌표 확인
  ├─ Kakao 대중교통 REST → 넓은 후보 선별
  │                         └─ .local/kakao-transit-usage.json 일일 원호출 장부
  ├─ TMAP 대중교통 요약 → 선택한 최종 후보의 출근시각 재검증
  │                       └─ .local/tmap-transit-usage.json 일일 원호출 장부
  └─ NAVER Directions 5 → 자동차 경로 검증

방문 주소·현장 메모 → 사용 중인 브라우저 localStorage
후보 비교 선택 → 사용 중인 브라우저 localStorage + 방문 기록 JSON 백업
CSV로 가져온 실거래 → 사용 중인 브라우저 IndexedDB
한 번 조회한 단지 이력 → 사용 중인 브라우저 IndexedDB
```

GitHub Pages는 정적 호스팅이라 브라우저에서 저장소 파일을 직접 수정할 수 없습니다. 검색 직후 재사용은 브라우저 IndexedDB와 Firestore 캐시가 담당하고, GitHub에 남길 공개 실거래 집계는 Actions가 JSON으로 갱신합니다. 개인 방문 기록은 공개 저장소나 현재 공개 Firestore에 올리지 않습니다.

단지 목록을 갱신할 때는 공공데이터포털의 [한국부동산원 전국 공동주택 단지정보](https://www.data.go.kr/data/15106861/fileData.do) CSV로 전체 카탈로그를 만든 뒤 서울·경기 파일을 생성합니다. 결과에는 공개 단지 메타데이터만 들어가며 개인 기록이나 API 키는 포함되지 않습니다.

```powershell
node homehunt/scripts/build-apartment-catalog.mjs <다운로드한 CSV 경로>
node homehunt/scripts/build-seoul-gyeonggi-catalog.mjs
```

## 1. 네이버 지도 설정

1. Ncloud Maps Application에서 `Dynamic Map`, `Geocoding`을 선택합니다. `Reverse Geocoding`은 지도 중심을 방문 기록으로 만들 때 주소를 자동 채우려면 추가합니다. 단지 검색의 시군구 코드는 공식 법정동 대조표로 제공하므로 Reverse Geocoding이 필수는 아닙니다.
2. Web 서비스 URL에는 포트와 경로를 제외한 개발 호스트와 운영 도메인을 등록합니다.
   - `http://127.0.0.1`
   - `http://localhost` (계속 사용할 경우)
   - `http://castlerain.github.io`
3. 브라우저에는 Client ID만 사용합니다. Client Secret은 코드에 넣지 않습니다.

첨부 화면에 Client Secret이 노출되었으므로 콘솔의 **재발급** 버튼으로 바꾸는 것을 권장합니다. 재발급한 값도 이 저장소나 채팅에 붙여넣지 마세요.

## 2. 국토부 실거래 데이터 연결

공공데이터포털에서 아래 두 API의 활용 신청을 완료합니다.

- 아파트 매매 실거래가 자료: `15126469`
- 아파트 전월세 실거래가 자료: `15126474`

두 API에는 같은 공공데이터 서비스키를 사용할 수 있지만 매매·전월세 활용신청은 각각 필요합니다. 로컬·GitHub Actions·Firebase 배포 위치별 이름과 전체 발급 절차는 [`docs/api-keys.md`](./docs/api-keys.md)에 정리했습니다.

### 로컬에서 실제 가격 바로 보기

`homehunt/.env.example`을 참고해 Git에서 제외된 `homehunt/.env`에 키를 넣은 뒤 저장소 루트에서 아래 스크립트를 실행합니다. 실행기는 HomeHunt가 허용한 키 이름만 `.env`에서 자동으로 읽고, 이미 설정된 프로세스 환경변수를 우선합니다. `MOLIT_SERVICE_KEY`가 비어 있을 때만 화면에 표시되지 않는 보안 입력창으로 묻습니다. 월별 공개 실거래 캐시는 `homehunt/.local/`에 저장되며 Git에서 제외됩니다.

`.env`는 Git에서 제외되지만 로컬 디스크에는 평문으로 남습니다. 저장소에 강제로 추가하거나 채팅·메일·화면 캡처로 공유하지 않습니다. 웹 화면의 키 연결 창에 직접 입력한 값은 `.env`를 수정하지 않으며 해당 서버 프로세스가 종료될 때 사라집니다.

```powershell
powershell -ExecutionPolicy Bypass -File homehunt/scripts/start-local-market.ps1
```

그다음 별도 터미널에서 정적 서버를 실행하고 `http://127.0.0.1:8000/homehunt/`을 엽니다. 로컬 화면은 자동으로 `127.0.0.1:8787`의 상태를 확인합니다.

화면 버전이 바뀐 뒤 연결 상태에 `서버 재시작 필요`가 보이면 기존 로컬 실거래 서버를 종료하고 위 스크립트를 다시 실행합니다. 기존 프로세스가 계속 떠 있으면 새 1·3·5년 조회 규칙과 통근 경로 판정이 적용되지 않습니다.

### 서울·경기 분양 공고와 신혼 공급

`분양·청약` 화면은 [청약홈 분양정보 조회 서비스](https://www.data.go.kr/data/15098547/openapi.do)의 아파트·잔여세대·임의공급, [LH 분양임대공고 조회 서비스](https://www.data.go.kr/data/15058530/openapi.do)의 분양주택(`05`)·신혼희망타운(`39`), [SH 공식 RSS](https://www.i-sh.co.kr/app/lay2/S1T1272C1408/contents.do)의 SH 자체 주택분양 공고를 서울·경기 범위로 합칩니다. 청약홈과 LH는 실거래 API와 같은 공공데이터 일반 인증키를 쓸 수 있지만 **각 API 페이지에서 활용신청은 별도로** 해야 하고, SH RSS는 별도 키가 없습니다.

신혼부부 표시는 단지명 키워드가 아니라 청약홈의 주택형별 `NWWDS_HSHLDCO` 또는 LH의 신혼희망타운 유형 코드처럼 구조화된 공식 근거가 있을 때만 확정합니다. 소득·자산·무주택·혼인기간·거주지 자격은 공고마다 다르므로 화면 숫자는 자격 판정이 아니며 공식 모집공고 원문을 최종 기준으로 봅니다.

로컬에서는 `공고 새로고침`이 `/api/supply`를 통해 즉시 수집하고 3시간 파일 캐시를 사용합니다. 배포본은 `.github/workflows/update-homehunt-supply.yml`이 공개 JSON을 갱신한 뒤 branch 기반 GitHub Pages 빌드를 명시적으로 요청합니다. Actions의 `GITHUB_TOKEN` 커밋만으로는 Pages 빌드가 자동 시작되지 않는 제약을 우회하지 않고 공식 Pages build API로 갱신합니다. 알림 조건과 읽음 상태는 현재 브라우저에만 저장되고, 브라우저 알림은 사용자가 직접 권한을 허용했으며 사이트가 열려 있을 때 작동합니다. 사이트를 닫아도 받으려면 아래 Telegram 알림을 사용합니다.

초기 `data/home-supply.json`은 실제 공고처럼 보이는 샘플을 넣지 않은 빈 기준 파일입니다. 청약홈·LH 두 활용신청이 승인되고 SH RSS가 연결된 뒤 각 공급원의 첫 성공 수집은 기준선만 세우며, 이후 추가·변경된 공고부터 새 알림으로 표시합니다. 현재 키의 활용 권한이 없으면 로컬 서버는 해당 API 실패를 15분 동안 기억해 반복 호출을 막고, 동시에 키 없이 동작하는 SH 수집 결과와 저장본을 우선 보여줍니다.

SH RSS는 공고·공지 전체가 섞여 있고 가격·세대·접수 일정이 구조화되지 않아, SH 주택분양 게시판 링크 또는 명확한 분양 근거가 있는 항목만 보수적으로 넣고 나머지 값은 원문 확인으로 둡니다. GH는 확인된 실시간 공식 RSS/JSON이 없고 [공공 분양·임대 현황](https://www.data.go.kr/data/15112598/fileData.do)도 분기 스냅샷이라 즉시 알림원으로 쓰지 않습니다. 공식 공고판 HTML은 `robots.txt`가 전체 자동 수집을 차단하므로 크롤링하지 않고, [GH 공식 공고판](https://www.gh.or.kr/gh/announcement-of-salerental001.do?mode=list)과 본인인증으로 기관이 직접 보내는 [GH 공식 문자알림](https://www.gh.or.kr/gh/saleslease-notification.do)을 화면에서 함께 제공합니다. 따라서 서비스는 `공식 연동 공고` 범위를 표시하며 누락 없음으로 과장하지 않습니다.

#### 내 조건으로 분양 걸러보기

`분양·청약 → 내 조건`에서 다음 항목을 저장합니다. 이 조건은 두 사람의 현재 브라우저에만 남고 공개 JSON이나 GitHub Actions로 전송되지 않습니다.

- **지역·동네:** 서울/경기를 고른 뒤 구·시·동 키워드를 쉼표로 구분합니다. 단지명은 화면의 자유 검색창으로 다시 좁힙니다.
- **가격:** 최대 분양가를 억 단위로 입력합니다. 공식 피드가 가격을 제공하지 않은 공고까지 놓치고 싶지 않다면 `가격 미공개 포함`을 켭니다.
- **면적:** 최소·최대 평형을 정합니다. 내부 비교는 전용면적 ㎡로 환산하며, 면적이 공개되지 않은 공고의 포함 여부를 따로 고릅니다.
- **공급 규모:** 최소 공급 세대수를 정합니다. SH·LH 원문처럼 세대수가 구조화되지 않은 공고의 포함 여부를 따로 고릅니다.
- **신혼 관련:** 신혼부부 특별공급 또는 신혼희망타운이라는 공식 근거가 있는 공고만 좁혀 볼 수 있습니다.

`미공개 포함`을 끄면 조건에 맞지 않는 공고뿐 아니라 해당 값을 아직 제공하지 않은 공고도 제외됩니다. 공고 누락을 줄이려면 처음에는 켜 두고 상세 원문에서 확인하는 편이 안전합니다.

#### 두 사람 청약 준비도와 점수

`사용 안내 → 우리 청약 준비도`에는 성우·소희 각자의 무주택기간, 부양가족 수, 청약통장 가입기간·납입 횟수와 공통 신혼 조건을 직접 입력할 수 있습니다. 입력값은 `homehunt_subscription_profile_v1`로 현재 브라우저의 `localStorage`에만 저장하며 주민등록번호, 청약통장 번호, 소득 증빙 파일이나 정확한 회사·집 주소는 받지 않습니다.

- **민영주택 일반공급:** 무주택기간 32점, 부양가족 35점, 청약통장 가입기간 17점의 기본 84점 틀로 자가입력 참고값을 보여줍니다. 배우자 통장 가점, 무주택기간 시작일, 법정 부양가족 인정 여부와 공고일별 경과 규정까지 자동 판정하지 않으므로 공식 가점과 다를 수 있습니다.
- **국민주택 일반공급:** 민영주택 84점 가점제를 적용하지 않고 납입 인정금액·납입 횟수 등 공고별 순차 기준을 사용하므로 위 점수를 재사용하지 않습니다.
- **신혼부부 특별공급:** 혼인기간·무주택·통장·소득/자산 확인 여부와 자녀 조건을 바탕으로 `확인 필요/신청 준비`와 해당할 수 있는 공급 구간·순위만 안내합니다.
- **신혼희망타운:** 공고일의 혼인·자녀·무주택·통장·소득·자산 기준과 별도 배점표를 확인하도록 안내합니다. 지역 거주기간과 공고별 기준이 없으면 9점·12점 배점을 임의 계산하지 않습니다.

화면은 **당첨 확률을 표시하지 않습니다.** 모집 주택형별 공급 수, 실제 신청자 분포, 무효·중복 신청, 동점 추첨 자료가 접수 전에는 없기 때문입니다. 특별공급의 `50%·20%·30%`, 신혼희망타운의 `30%·60%·10%` 같은 숫자는 개인 확률이 아니라 공급 물량을 나누는 구간입니다. 최종 판단은 각 공고의 모집공고일 기준 원문과 청약홈 자격확인을 따릅니다. 2026-06-15 이전 공고처럼 개정 전 경과 규정을 적용하는 경우도 현재 기준으로 다시 계산하지 않습니다. 현재 규정은 [주택공급에 관한 규칙](https://www.law.go.kr/법령/주택공급에관한규칙), 민영 일반공급 가점표는 [별표 1](https://www.law.go.kr/법령별표서식/(주택공급에%20관한%20규칙,20260615,별표1)), 신혼희망타운 기준은 [공공주택 특별법 시행규칙 별표 6의3](https://www.law.go.kr/법령별표서식/(공공주택%20특별법%20시행규칙,20260824,별표6의3))을 참고합니다.

#### 휴대폰으로 Telegram 알림 받기

현재 가장 단순하고 안전한 백그라운드 알림 경로는 **비공개 Telegram 그룹 + GitHub Actions**입니다. 휴대폰에 Telegram을 설치하고 그룹 알림을 켜 두면 HomeHunt 페이지를 닫은 상태에서도 수집된 새 공고와 의미 있는 변경 알림을 받을 수 있습니다. 토큰과 그룹 ID는 브라우저나 공개 Firestore가 아니라 GitHub Actions Secrets에만 둡니다.

1. Telegram의 공식 [@BotFather](https://t.me/BotFather)에서 `/newbot`을 실행해 봇을 만들고 토큰을 발급받습니다.
2. 성우·소희만 참여하는 비공개 그룹을 만들고 봇을 추가한 뒤, 그룹에서 `/start@봇사용자이름`처럼 봇에게 보내는 명령을 한 번 보냅니다.
3. Telegram Bot API의 [`getUpdates`](https://core.telegram.org/bots/api#getupdates) 응답에서 그 메시지의 `message.chat.id`를 확인합니다. 그룹 ID는 보통 음수입니다.
4. GitHub 저장소 `Settings → Secrets and variables → Actions → New repository secret`에서 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` 두 값을 각각 저장합니다.
5. 같은 화면의 `Variables`에 아래 `HOMEHUNT_ALERT_*` 값을 필요한 만큼 저장합니다. 비어 있으면 서울·경기 전체와 미공개 항목 포함이 기본입니다.
6. `Update HomeHunt supply notices`를 수동 실행해 수집 상태를 먼저 확인합니다. 첫 정상 수집은 기준선을 만드는 실행이라 기존 공고를 한꺼번에 보내지 않습니다. 예약 실행부터 새 공고·의미 있는 변경만 전송합니다.

| Repository Variable | 예시 | 역할 |
|---|---|---|
| `HOMEHUNT_ALERT_REGIONS` | `서울,경기` | 서울·경기 중 받을 지역 |
| `HOMEHUNT_ALERT_DISTRICTS` | `성남,하남,송파` | 시·구·동 키워드 중 하나가 맞는 공고 |
| `HOMEHUNT_ALERT_NEWLYWED_ONLY` | `true` | 공식 근거가 있는 신혼부부·신혼희망타운만 |
| `HOMEHUNT_ALERT_MAX_PRICE_EOK` | `6` | 최고 분양가 6억원 이하 |
| `HOMEHUNT_ALERT_MIN_PYEONG` / `HOMEHUNT_ALERT_MAX_PYEONG` | `20` / `34` | 실제 주택형 중 전용면적 범위가 맞는 공고 |
| `HOMEHUNT_ALERT_MIN_UNITS` | `500` | 총 공급 500세대 이상 |
| `HOMEHUNT_ALERT_INCLUDE_UNKNOWN_PRICE` | `true` | 가격 미공개 포함 여부 |
| `HOMEHUNT_ALERT_INCLUDE_UNKNOWN_AREA` | `true` | 면적 미공개 포함 여부 |
| `HOMEHUNT_ALERT_INCLUDE_UNKNOWN_UNITS` | `true` | 세대수 미공개 포함 여부 |

토큰을 README, `.env.example`, 소스, 이슈, Actions 로그나 채팅에 붙여넣지 않습니다. 노출되면 BotFather에서 즉시 폐기하고 새로 발급합니다. 브라우저의 `내 조건`은 로컬 전용이라 Telegram과 자동 동기화되지 않으므로 같은 조건을 Repository Variables에 한 번 옮겨 적습니다. Variables에는 동네·예산 같은 넓은 공고 조건만 두고 회사·집 주소나 개인 청약정보는 넣지 않습니다. 자세한 명령과 보안 주의사항은 [`docs/api-keys.md`](./docs/api-keys.md#3-telegram-휴대폰-알림)에 있습니다.

GitHub 예약 작업은 정확한 시각 실행을 보장하지 않고, 부하가 높으면 지연되거나 드물게 누락될 수 있습니다. 공개 저장소가 60일간 활동이 없으면 예약 workflow가 자동 비활성화될 수도 있으므로 [GitHub의 `schedule` 제한](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)을 함께 확인합니다. GH 공고는 HomeHunt 자동 수집 범위 밖이므로 [GH 공식 문자알림](https://www.gh.or.kr/gh/saleslease-notification.do)도 병행하는 편이 안전합니다.

Firebase Cloud Messaging은 앱 안에서 기기별 조건 푸시를 제공할 수 있는 장기안입니다. 다만 HTTPS, 서비스 워커, VAPID, Firebase Authentication과 비공개 토큰 저장소가 먼저 필요합니다. 현재 Firestore 규칙이 일부 공개 상태이므로 FCM 등록 토큰을 저장하면 안 됩니다. iPhone/iPad의 Web Push는 iOS/iPadOS 16.4 이상에서 홈 화면에 설치한 웹 앱이 사용자 동작으로 권한을 요청해야 합니다. 구현 전 [Firebase Web FCM 시작 가이드](https://firebase.google.com/docs/cloud-messaging/web/get-started)와 [Apple Web Push 안내](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)를 기준으로 인증 구조부터 바꿉니다.

### 여러 목적지 통근 실제 경로 연결

맞춤 찾기에는 회사·주요 목적지를 최대 4개까지 A~D로 등록할 수 있습니다. 각 목적지의 주당 방문일·교통수단·허용시간을 보존하고, 모든 필수 목적지에서 실제 경로가 확인되어 제한 안에 들어온 경우만 통근 충족으로 판정합니다. 직선거리는 후보 호출 순서를 정하는 프록시일 뿐 통근시간으로 바꾸지 않습니다. 순위는 가장 불리한 `실제시간 / 허용시간` 비율을 먼저 최소화하고, 주당 방문일 가중 평균과 도보·환승 부담을 다음 기준으로 사용합니다.

정확한 주소를 외울 필요 없이 도로명·지번 일부로 나온 후보를 고르거나 NAVER 지도에서 건물을 직접 찍어 좌표를 확정합니다. 지도에서 역지오코딩한 공식 건물·도로명은 입주 회사명과 다르게 보일 수 있지만 실제 경로에는 선택한 좌표를 사용합니다.

현재 [Maps Web SDK의 Geocoder](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Service.html)는 주소와 좌표 변환용입니다. 회사명·상호명은 [NAVER API HUB의 `지역 검색`](https://api.ncloud-docs.com/docs/naver-api-hub-search-local)을 별도 Application/키로 신청해 로컬 서버에서 조회합니다. 키가 없어도 [Kakao 우편번호 서비스](https://postcode.map.kakao.com/guide)의 공식 주소 DB를 모달 안에 열어 `KT` 같은 등록 건물명·법인명과 도로명·지번을 찾고, 선택 주소를 NAVER 지도 좌표로 다시 확인합니다. 입점 상호·지점까지 폭넓게 찾으려면 NAVER 지역 검색 키가 필요합니다.

회사 위치 입력은 더 이상 아파트 카탈로그로 추측하지 않습니다. `KT`가 `정자KTe-편한세상`에 부분 일치하던 것처럼 회사명이 아파트명 일부와 우연히 겹치는 오인을 차단했습니다. 아파트 검색은 실거래·지도 화면의 전용 검색창에서 수행합니다.

- 넓은 버스·지하철 선별: Kakao Developers REST API 키
- 출근시각 최종 확인: TMAP 대중교통 API의 `appKey`
- 자동차: NAVER Maps Directions 5의 Client ID와 Client Secret
- 회사·건물명: NAVER API HUB 검색 API `지역 검색`의 별도 Client ID와 Client Secret

재시작 후에도 자동 연결하려면 `homehunt/.env`에 저장합니다. HomeHunt의 `설정` → `경로 키 연결` 또는 목적지 위치 창의 `장소 검색 연결`에서 직접 입력한 값은 실행 중인 서버 메모리에만 남습니다. 장소 검색 환경변수는 `NAVER_LOCAL_SEARCH_CLIENT_ID`, `NAVER_LOCAL_SEARCH_CLIENT_SECRET`이고 대중교통 환경변수는 `KAKAO_REST_API_KEY`, `TMAP_APP_KEY`, `TRANSIT_PROVIDER`입니다.

`TRANSIT_PROVIDER=auto`는 Kakao가 연결되어 있으면 넓은 후보 선별에 먼저 사용합니다. 선택한 최종 후보는 화면의 TMAP 재검증 동작으로 동일한 `searchDttm` 기준을 확인합니다. 경로 응답이 없거나 키가 연결되지 않은 후보는 `통근 미확인`으로 분리하며, 설정한 시간 조건을 충족한 것으로 계산하지 않습니다.

로컬 서버는 실제 공급자까지 간 캐시 미스 호출만 `homehunt/.local/kakao-transit-usage.json`과 `homehunt/.local/tmap-transit-usage.json`에 KST 날짜별로 기록합니다. 기본 한도는 각각 1,000건과 10건이며 키나 경로 응답 원문은 장부에 저장하지 않습니다. `GET /api/commute/quota`에서 남은 한도를 읽고, `POST /api/commute/batch`는 예상 호출 수가 요청 상한 또는 선택 공급자의 남은 일일량을 넘으면 외부 호출 전에 전체 거부합니다. 이 로컬 장부는 각 공급자 계정 콘솔의 실제 사용량을 대체하지 않습니다.

### 매일 지역 집계 갱신

GitHub 저장소의 Settings → Secrets and variables → Actions에서:

```text
DATA_GO_KR_SERVICE_KEY = 발급받은 서비스키
```

그다음 Actions의 `Update HomeHunt market data`를 한 번 수동 실행합니다. 이후 매일 자동 실행되며 공개 실거래 집계 JSON만 커밋합니다.

### 처음 검색한 단지 즉시 캐시

로컬 터미널에서 키 값을 파일에 남기지 않고 Firebase Secret Manager에 입력합니다.

```powershell
firebase functions:secrets:set MOLIT_SERVICE_KEY
firebase deploy --only functions:apartmentHistory
```

배포가 성공해 함수 URL에서 CORS가 포함된 응답을 확인한 뒤 `homehunt/js/config.js`의 `apartmentHistoryEnabled`를 `true`로 바꿉니다. 함수가 없는 상태에서 먼저 켜면 브라우저가 404 응답을 CORS 네트워크 오류로만 볼 수 있습니다.

함수는 IP별 하루 20회·전체 하루 60회로 제한하고, 시군구·월·거래유형 원자료와 단지 결과를 Firestore에 서버 서명과 함께 저장합니다. 일부 월 API가 실패해도 성공한 월은 돌려주며, 상류 API 장애 때는 검증된 이전 캐시를 재사용합니다. 브라우저도 성공한 단지 이력을 IndexedDB에 보관합니다. CORS 자체는 인증이 아니므로 아래 Firestore 규칙도 함께 배포해야 합니다.

```powershell
firebase deploy --only firestore:rules
```

이 규칙은 HomeHunt 서버 캐시를 잠그지만 기존 sungso 일정·재무·여행 컬렉션은 호환성을 위해 아직 공개 상태입니다. 화면의 4자리 PIN은 Firebase 인증이 아니므로 민감한 개인정보를 기존 Firestore에 추가하지 말고, 전체 비공개화는 Firebase Authentication 도입과 함께 별도 진행해야 합니다.

서비스키는 브라우저 응답과 Git에 포함되지 않습니다. 기존 저장소에 노출돼 있던 네이버 검색 API 키도 재발급한 뒤 Secret Manager에 옮깁니다.

```powershell
firebase functions:secrets:set NAVER_SEARCH_CLIENT_ID
firebase functions:secrets:set NAVER_SEARCH_CLIENT_SECRET
firebase deploy --only functions:naverBlogSearch
```

## 3. GitHub에 계속 보관할 단지

[`config/tracked-apartments.json`](./config/tracked-apartments.json)에 공개 실거래 이력을 계속 만들 단지를 추가합니다.

```json
{
  "apartments": [
    {
      "id": "jamsil-els",
      "name": "잠실엘스",
      "lawdCd": "11710",
      "aptSeq": "공식 응답의 아파트 일련번호",
      "regionName": "서울 송파구"
    }
  ]
}
```

다음 Actions 실행부터 해당 단지의 최근 40개월 매매·전세가 `data/apartment-history.json`에 포함됩니다. 로컬 직접 검색은 화면에서 최근 1·3·5년 중 선택할 수 있습니다. 동명 단지 혼합을 막기 위해 `aptSeq` 입력을 권장합니다. 이 파일에는 공공 실거래만 넣고 개인 방문 메모는 넣지 않습니다.

## 가격 비교 원칙

- 지역 비교는 전용면적을 `40㎡ 미만`, `40–60㎡`, `60–85㎡`, `85–102㎡`, `102㎡ 이상`으로 분리합니다.
- 개별 단지는 `59.9㎡`, `84.9㎡`처럼 실제 전용면적을 0.1㎡ 단위로 선택해 총액을 섞지 않습니다.
- 부분 단지명이 여러 곳과 일치하면 후보를 먼저 고르게 하며 동명 단지를 하나로 합치지 않습니다.
- 화면 대표값은 사용자가 이해하기 쉬운 **실제 거래의 산술평균 가격**과 **평균 평당가격**입니다. 평당가격은 각 거래를 `거래금액 × 3.3 ÷ 전용면적`으로 바꾼 뒤 평균하며, 1평은 약 3.3㎡입니다.
- 평균은 유난히 높거나 낮은 한 건에도 움직일 수 있으므로 거래 건수와 최근 개별 거래를 같은 화면에 함께 표시합니다.
- 전월 변화는 정확한 전월 데이터가 있을 때만 표시합니다.
- 최근 신고월은 잠정치이며 취소·정정 거래 때문에 다음 수집 때 달라질 수 있습니다.
- 단지 이력은 최근 60개월이 기본이며 12·36·60개월을 선택할 수 있습니다. 현재월과 직전월은 신고 진행 자료로 보고 예측 학습에서 제외합니다.
- 예측은 최소 관측월·거래량·기간 커버리지·최신성·변동성을 통과해야 계산합니다. 6개월 고정 구간의 시간순 rolling-origin 표본이 부족하거나 무변화 기준보다 MAE가 5% 이상 개선되지 않으면 예측을 보류합니다. 표시 범위는 과거 오차의 경험적 conformal 참고범위이며 미래 확률을 보장하지 않습니다.
- 추천 수집에서 어느 월이 끝내 실패한 시군구는 그 지역의 성공 월만으로 가격이 있는 것처럼 보이지 않도록 해당 실행의 후보와 거래를 모두 제외하고 제외 건수를 표시합니다.
- 방문 당시 비교는 방문일 이전 90일 동일면적 실거래를 기준으로 하고, 현재 기준의 최근 달력월·latest-N fallback은 모두 방문일 이후 거래만 사용합니다. 방문 후 표본이 1~2건이면 낮은 신뢰도로 표시하고 방문 후 거래가 없으면 변화율을 보류합니다.

## 로컬 실행과 검증

저장소 루트에서 로컬 실거래 서버와 정적 서버를 각각 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File homehunt/scripts/start-local-market.ps1
python -m http.server 8000 --bind 127.0.0.1
```

브라우저에서 `http://localhost:8000/homehunt/`을 엽니다.

```powershell
node --test homehunt/tests/*.test.mjs
node --check homehunt/js/app.js
node --check homehunt/js/naver-map.js
node --check functions/molit.js
```

## 파일 구조

```text
homehunt/
├─ index.html                    포털형 UI와 모달
├─ css/styles.css                데스크톱·모바일 반응형 스타일
├─ css/ui-kit.css                Tabler 기반 HomeHunt 디자인 시스템·반응형 보강
├─ js/app.js                     화면 상태와 방문/시장 기능
├─ js/supply-core.mjs             분양 공고 정규화·필터·상태·알림 판정
├─ js/subscription-readiness-core.mjs 자가입력 일반공급 점수·신혼 청약 준비도 계산
├─ js/ui-kit.js                  정적·동적 UI에 Tabler 컴포넌트 클래스·아이콘 연결
├─ js/naver-map.js               네이버 지도 어댑터
├─ js/apartment-search-core.mjs  전국 단지명 정규화·후보·유사 단지 검색
├─ js/complex-availability-core.mjs 단지 가격 서버 오류 분류·안내 문구
├─ js/market-core.mjs            정규화·집계·예측 순수 함수
├─ js/display-format.mjs         억·만원 가격, ㎡·평 표시 형식
├─ js/transport-core.mjs         직선거리·실제 경로 판정과 통근 정렬
├─ js/commute-balance-core.mjs   최대 4개 목적지 정규화·minimax 균형 점수·쿼터 계산
├─ js/recommendation-verification-core.mjs Kakao 선별/TMAP 최종 판정·목적지 변경 무효화
├─ js/visit-benchmark-core.mjs   방문 당시·방문 후 동일면적 실거래와 현장 확인가 분리
├─ js/company-search-core.mjs    회사 위치 검색 공급자·아파트 fallback 안전 분기
├─ js/comparison-core.mjs        후보 비교·3.3㎡ 환산 순수 함수
├─ js/recommendation-core.mjs    자연어 조건·단지 필터·실거래 매칭 순수 함수
├─ js/storage.js                 방문·비교 localStorage, 실거래 IndexedDB, 백업
├─ config/regions.json           일일 수집 지역
├─ config/tracked-apartments.json 정적 보관 단지
├─ data/apartment-catalog-seoul-gyeonggi*.json 서울·경기 공식 단지 목록·상태
├─ data/market-summary.json      Actions가 만드는 공개 지역 집계
├─ scripts/build-apartment-catalog.mjs 공식 단지 CSV 변환기
├─ scripts/build-seoul-gyeonggi-catalog.mjs 서울·경기 카탈로그 생성기
├─ .env.example                  Git에 올릴 수 있는 키 이름 템플릿
├─ docs/api-keys.md              키별 공식 발급·설정 가이드
├─ scripts/local-market-server.mjs 실거래·추천·장소·단일/배치 경로·쿼터 localhost API
├─ scripts/fetch-home-supply.mjs  청약홈·LH·SH 서울·경기 분양 수집·변경 감지
├─ scripts/send-supply-telegram.mjs 신규·중요 변경 공고의 Telegram 알림·중복 방지
├─ scripts/lh-supply-provider.mjs LH 공식 목록 API 페이지네이션·오류 처리
├─ scripts/lh-supply-adapter.mjs  LH 공고를 공통 분양 스키마로 변환
├─ scripts/sh-supply-provider.mjs SH 공식 RSS EUC-KR 파싱·보수적 분양 분류
├─ scripts/commute-provider.mjs  Kakao·TMAP 대중교통, NAVER 자동차와 두 일일 장부
├─ scripts/commute-time.mjs      동일한 평일 출근시각 계산
├─ scripts/naver-local-search.mjs NAVER API HUB 지역 검색 서버 어댑터
├─ scripts/recommendation-data-safety.mjs 실패 월이 있는 시군구 후보·거래 제외
├─ scripts/start-local-market.ps1 .env 자동 로딩·보안 입력 fallback·로컬 서버 실행
├─ scripts/fetch-market-data.mjs 국토부 수집·집계 작업
├─ scripts/update-law-districts.ps1 공식 법정동 시군구 대조표 생성
└─ tests/*.test.mjs              가격 집계·예측·후보 비교 테스트
```

실거래 범위, 단지 메타데이터, 경로 API와 예측 방법의 공식 근거·제약은 [`docs/report-source.md`](./docs/report-source.md)에 정리했습니다.

단지별 현재 매물은 네이버 부동산에서 직접 확인하도록 링크만 엽니다. 공식 매물 API가 없는 화면을 자동 크롤링하면 약관·차단·마크업 변경에 취약하므로 이 프로젝트의 가격 분석에는 사용하지 않습니다.
