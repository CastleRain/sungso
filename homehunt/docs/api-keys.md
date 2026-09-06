# HomeHunt API 키 발급·설정 가이드

기준일: 2026-09-05

로컬 비밀값은 `homehunt/.env`에만 둔다. 이 파일은 저장소의 `.gitignore`에 포함되어 GitHub에 올라가지 않는다. 공개 예시는 `homehunt/.env.example`에 있다. Telegram처럼 GitHub Actions에서만 쓰는 값은 `.env`가 아니라 저장소의 Actions Secrets에 둔다.

## 필요한 값

| 환경변수 | 필요도 | 용도 | 발급처 |
|---|---:|---|---|
| `MOLIT_SERVICE_KEY` | 필수 | 아파트 매매·전월세 실거래, 청약홈·LH 분양 공고 | 공공데이터포털 |
| `NAVER_MAPS_CLIENT_ID` | 자동차 사용 시 필수 | 로컬 서버의 Directions 5 인증 | NAVER Cloud Maps |
| `NAVER_MAPS_CLIENT_SECRET` | 자동차 사용 시 필수 | 서버의 Directions 5 인증 | NAVER Cloud Maps |
| `NAVER_LOCAL_SEARCH_CLIENT_ID` | 회사명 검색 시 필수 | 회사·상호·기관·지점명 검색 | NAVER Developers 기존 키 |
| `NAVER_LOCAL_SEARCH_CLIENT_SECRET` | 회사명 검색 시 필수 | NAVER Developers 서버 인증 | NAVER Developers 기존 키 |
| `KAKAO_REST_API_KEY` | 대중교통 권장 | 카카오 버스·지하철 경로 | Kakao Developers |
| `KAKAO_DAILY_LIMIT` | 선택 | 로컬 Kakao 일일 원호출 상한(기본 1,000) | 로컬 설정 |
| `TMAP_APP_KEY` | 대중교통 대체 | 출발시각 기반 버스·지하철 경로 | SK open API의 TMAP 대중교통 |
| `TRANSIT_PROVIDER` | 선택 | `auto`, `kakao`, `tmap` 공급자 선택 | 로컬 설정 |
| `TMAP_DAILY_LIMIT` | 선택 | 로컬 TMAP 일일 원호출 상한(기본 10) | 로컬 설정 |
| `TRANSIT_CACHE_HOURS` | 선택 | 대중교통 결과 캐시 시간(기본 8, 24 미만) | 로컬 설정 |
| `TRANSIT_CONCURRENCY` | 선택 | 동시 대중교통 호출 수(기본 2) | 로컬 설정 |

`HOMEHUNT_LOCAL_API_PORT=8787`은 인증키가 아니라 로컬 서버 설정이다. 프런트도 8787을 사용하므로 단독으로 바꾸지 않는다.

```dotenv
MOLIT_SERVICE_KEY=
NAVER_MAPS_CLIENT_ID=
NAVER_MAPS_CLIENT_SECRET=
NAVER_LOCAL_SEARCH_CLIENT_ID=
NAVER_LOCAL_SEARCH_CLIENT_SECRET=
KAKAO_REST_API_KEY=
KAKAO_DAILY_LIMIT=1000
TRANSIT_PROVIDER=auto
TMAP_APP_KEY=
TMAP_DAILY_LIMIT=10
TRANSIT_CACHE_HOURS=8
TRANSIT_CONCURRENCY=2
HOMEHUNT_LOCAL_API_PORT=8787
```

`.env.example`은 필요한 변수명만 설명한다. 실제 값은 `homehunt/.env`에 입력하며, `.env`는 Git에 커밋하지 않는다. 기존 값이 있다면 비어 있는 항목만 추가한다. 화면에 노출된 적이 있는 Client Secret은 재발급하고 이 문서나 채팅에는 실제 값을 기록하지 않는다.

## 1. 국토부 아파트 실거래 키

하나의 공공데이터 서비스키를 쓸 수 있지만 아래 두 API는 각각 활용신청해야 한다.

- [국토교통부 아파트 매매 실거래가 자료](https://www.data.go.kr/data/15126469/openapi.do)
- [국토교통부 아파트 전월세 실거래가 자료](https://www.data.go.kr/data/15126474/openapi.do)

1. [공공데이터포털](https://www.data.go.kr/)에 로그인한다.
2. 매매 API 페이지에서 `활용신청`을 누른다.
3. 개인 로컬 프로젝트라면 `개인 서비스키`를 선택한다. 팀·기업 단위로 운영하면 `프로젝트 서비스키`가 관리하기 편하다.
4. 활용 목적에는 `개인용 아파트 실거래 조회 및 통근 조건 비교`처럼 실제 목적을 적고 신청한다.
5. 전월세 API 페이지에서도 같은 서비스키를 선택해 별도로 활용신청한다.
6. `마이페이지 → 데이터 활용 → Open API → 활용신청 현황`에서 두 API가 모두 승인 상태인지 확인한다.
7. 일반 인증키를 `MOLIT_SERVICE_KEY`에 넣는다. 포털에 Encoding/Decoding 키가 함께 나오면 `+`, `/`, `=`가 보이는 Decoding 원문 키를 권장한다. 현재 코드는 인코딩된 키도 한 번 디코딩해 처리한다.

두 API의 공식 페이지는 개발·운영 단계 자동승인, 개발계정 일 10,000건을 안내한다. 오류 20은 키 누락·권한, 30은 미등록 키, 31은 만료 키이므로 승인 상태와 이용 기간을 함께 확인한다.

## 2. 청약홈·LH 분양 공고 API

실거래에 쓰던 공공데이터 일반 인증키를 그대로 사용할 수 있지만, 아래 두 서비스의 활용신청을 각각 추가해야 한다.

- [한국부동산원 청약홈 분양정보 조회 서비스](https://www.data.go.kr/data/15098547/openapi.do)
- [한국토지주택공사 분양임대공고 조회 서비스](https://www.data.go.kr/data/15058530/openapi.do)

1. 두 링크를 차례로 열어 로그인하고 `활용신청`을 누른다.
2. 기존 실거래에서 사용한 개인 또는 프로젝트 서비스키를 선택한다.
3. 활용 목적에는 `서울·경기 아파트 분양 및 신혼부부 특별공급 일정 알림`처럼 실제 용도를 적는다.
4. `마이페이지 → 데이터 활용 → Open API → 활용신청 현황`에서 두 서비스가 모두 승인인지 확인한다.
5. 로컬에서는 기존 `.env`의 `MOLIT_SERVICE_KEY`를 그대로 둔다. 새 키 변수는 필요 없다.
6. GitHub Actions에서는 저장소 `Settings → Secrets and variables → Actions`에 `DATA_GO_KR_SERVICE_KEY`를 같은 값으로 저장한다. 선택적으로 `APPLYHOME_SERVICE_KEY`를 별도로 두면 청약홈 수집이 그 값을 우선 사용한다.
7. 로컬 서버를 재시작하고 HomeHunt `분양 알림`에서 `공고 새로고침`을 눌러 청약홈·LH 상태가 각각 수집 완료인지 확인한다.

수집 범위는 다음처럼 의도적으로 나뉜다.

- 청약홈: APT 분양, 잔여세대, 임의공급의 상세·주택형. 공급 주소가 서울·경기인 공고만 저장한다.
- LH: 지역 코드 서울 `11`, 경기 `41`의 분양주택 `05`, 신혼희망타운 `39`. 임대주택 `06`은 “분양” 목록과 혼동하지 않도록 기본 수집에서 제외한다.
- SH: [SH가 공개한 공식 RSS](https://www.i-sh.co.kr/app/lay2/S1T1272C1408/contents.do)를 서버/Actions에서 함께 읽는다. 별도 키는 없지만 공고·공지 전체가 섞인 RSS라 SH 주택분양 게시판 링크와 명확한 분양 문구가 있는 항목만 보수적으로 포함한다.
- 신혼부부: 청약홈 주택형의 신혼부부 배정 세대 필드 또는 LH 신혼희망타운 코드가 있을 때만 확정 표시한다. 제목에 `신혼`이 들어간 것만으로 자격을 만들지 않는다.

청약홈 서비스는 공식 안내상 REST JSON/XML과 1일 40,000건 개발 호출을 제공한다. LH 응답은 공고 목록 중심이라 접수일·가격·주택형이 구조화되어 있지 않은 항목은 임의로 만들어내지 않고 공식 원문 확인으로 표시한다. API 정책과 한도는 바뀔 수 있으므로 각 공식 페이지의 최신 값을 우선한다.

SH 자체 공고는 청약홈과 공급주체가 달라 공식 RSS를 병행한다. RSS에는 접수일·가격·세대수 같은 구조화 필드가 없으므로 확인되지 않은 값을 만들지 않고 원문으로 연결한다. [SH 주택분양 공급계획 데이터](https://www.data.go.kr/data/15008820/fileData.do)는 2026년 4행의 1회성 예정 자료이므로 신규 공고 알림원이 아니라 추후 예정 레이더 보조자료로만 본다.

GH에는 확인된 공식 실시간 RSS/JSON 공고 피드가 없다. [GH 아파트분양임대현황](https://www.data.go.kr/data/15112598/fileData.do)은 분기 갱신 스냅샷이라 즉시 알림원으로 쓰지 않는다. HomeHunt는 [GH 분양·임대 공고판](https://www.gh.or.kr/gh/announcement-of-salerental001.do?mode=list)과 본인인증 후 기관이 직접 보내는 [GH 분양·임대 공식 문자알림](https://www.gh.or.kr/gh/saleslease-notification.do)을 보완 경로로 제공한다. 따라서 화면 표현은 `공식 연동 공고`이며 누락이 전혀 없다고 보장하지 않는다.

## 3. Telegram 휴대폰 알림

Telegram 알림은 `homehunt/.env`나 브라우저가 아니라 GitHub Actions에서 동작합니다. 휴대폰에 Telegram을 설치하고 비공개 그룹 알림을 허용하면 HomeHunt 페이지가 닫혀 있어도 새 분양 공고와 의미 있는 변경을 받을 수 있습니다. [Telegram 공식 봇 튜토리얼](https://core.telegram.org/bots/tutorial)과 [Bot API `sendMessage`](https://core.telegram.org/bots/api#sendmessage)를 기준으로 설정합니다.

### 3-1. 봇과 비공개 그룹 만들기

1. Telegram에서 공식 [@BotFather](https://t.me/BotFather)를 열고 `/newbot`을 보냅니다.
2. 안내에 따라 표시 이름과 `bot`으로 끝나는 사용자 이름을 정합니다.
3. BotFather가 돌려준 토큰은 비밀번호처럼 보관합니다. 문서, 소스, `.env.example`, 이슈, 채팅이나 화면 캡처에 넣지 않습니다.
4. 성우·소희만 참여하는 비공개 Telegram 그룹을 만들고 방금 만든 봇을 구성원으로 추가합니다.
5. 봇을 추가한 **다음** 그룹에서 `/start@봇사용자이름`처럼 봇에게 보내는 명령을 한 번 보냅니다. Privacy Mode가 켜진 봇은 일반 대화를 받지 않으므로 봇을 명시한 명령이어야 `getUpdates`에서 그룹을 안정적으로 찾을 수 있습니다.

### 3-2. `chat_id` 확인하기

Telegram Bot API의 [`getUpdates`](https://core.telegram.org/bots/api#getupdates)를 로컬 터미널에서 한 번 호출합니다. 아래 값은 변수에만 입력하고 파일로 저장하지 않습니다.

```powershell
$telegramToken = Read-Host "BotFather token"
$telegramUpdates = Invoke-RestMethod -Uri ("https://api.telegram.org/bot{0}/getUpdates" -f $telegramToken)
$telegramUpdates.result.message.chat | Select-Object id,title,type
Remove-Variable telegramToken,telegramUpdates
```

출력에서 방금 만든 그룹의 `title`을 찾고 `id`를 복사합니다. 그룹 `chat_id`는 보통 `-100...`처럼 음수입니다. 결과가 비어 있으면 그룹에서 봇을 명시한 명령을 하나 더 보낸 뒤 다시 호출합니다. 봇의 Privacy Mode를 끄거나 관리자 권한을 줄 필요는 없습니다. 토큰이 브라우저 주소 기록·터미널 캡처·공유 로그에 노출됐다면 BotFather에서 즉시 폐기하고 재발급합니다.

### 3-3. GitHub Actions Secrets 저장하기

저장소의 `Settings → Secrets and variables → Actions → New repository secret`에서 두 값을 각각 만듭니다.

| Secret 이름 | 값 |
|---|---|
| `TELEGRAM_BOT_TOKEN` | BotFather가 발급한 봇 토큰 |
| `TELEGRAM_CHAT_ID` | `getUpdates`에서 확인한 비공개 그룹 ID |

GitHub CLI를 사용한다면 저장소 루트에서 아래 명령을 각각 실행하고 프롬프트가 뜰 때 값을 입력합니다. 명령행 인수로 토큰을 직접 붙이지 않으므로 셸 기록에 비밀값을 남기지 않습니다.

```powershell
gh secret set TELEGRAM_BOT_TOKEN
gh secret set TELEGRAM_CHAT_ID
```

### 3-4. 휴대폰 알림 조건 저장하기

브라우저의 `내 조건`은 현재 기기의 `localStorage`에만 있어 GitHub Actions와 자동 동기화되지 않습니다. 같은 `Settings → Secrets and variables → Actions → Variables`에서 필요한 조건만 Repository Variable로 한 번 저장합니다. 이 값들은 비밀값이 아니므로 회사·집 주소나 소득·자산·청약통장 같은 개인 정보는 넣지 않습니다.

| Variable | 허용 예시 | 비어 있을 때 |
|---|---|---|
| `HOMEHUNT_ALERT_REGIONS` | `서울,경기`, `서울` | 서울·경기 |
| `HOMEHUNT_ALERT_DISTRICTS` | `성남,하남,송파` | 동네 제한 없음 |
| `HOMEHUNT_ALERT_NEWLYWED_ONLY` | `true` / `false` | `false` |
| `HOMEHUNT_ALERT_MAX_PRICE_EOK` | `6` | 가격 제한 없음 |
| `HOMEHUNT_ALERT_MIN_PYEONG` | `20` | 최소 면적 없음 |
| `HOMEHUNT_ALERT_MAX_PYEONG` | `34` | 최대 면적 없음 |
| `HOMEHUNT_ALERT_MIN_UNITS` | `500` | 최소 세대수 없음 |
| `HOMEHUNT_ALERT_INCLUDE_UNKNOWN_PRICE` | `true` / `false` | `true` |
| `HOMEHUNT_ALERT_INCLUDE_UNKNOWN_AREA` | `true` / `false` | `true` |
| `HOMEHUNT_ALERT_INCLUDE_UNKNOWN_UNITS` | `true` / `false` | `true` |

`NEWLYWED_ONLY=true`는 제목에 신혼이라는 단어가 있는 공고가 아니라 공식 신혼부부 배정 필드 또는 신혼희망타운 유형 코드가 확인된 공고만 남깁니다. 미공개 포함을 `false`로 두면 조건을 초과한 공고뿐 아니라 그 숫자를 아직 제공하지 않은 공고도 빠집니다. 처음에는 `true`로 두고 원문에서 확인하는 편이 안전합니다. 잘못된 숫자·boolean·지역 값은 전송을 실패시키지 않고 해당 조건을 무시하거나 기본값으로 되돌리며 Actions Summary에 비밀값 없는 경고를 남깁니다.

Actions의 `Update HomeHunt supply notices`를 수동 실행해 수집 성공 여부를 먼저 확인합니다. 수동 실행의 `notify` 입력은 기본값이 `false`라 전송 대상 미리보기만 만들고 메시지와 중복 장부를 바꾸지 않습니다. 첫 정상 수집은 기존 공고 전체를 보내지 않고 공급원별 기준선만 만듭니다. 이후 꼭 필요한 수동 실행에서만 `notify=true`를 선택하고, 예약 실행은 자동으로 알림을 켭니다. 새로 생긴 공고와 실제 필드가 바뀐 공고만 보내며 마감·삭제 항목, 오래된 기준 자료와 실패 공급원의 stale 자료는 전송하지 않습니다. 한 번에 메시지는 최대 5개까지만 보내고 초과분은 HomeHunt 확인 링크가 있는 요약으로 묶어 알림 폭주를 막습니다. 휴대폰에서 Telegram 앱 알림과 해당 그룹의 음소거 해제를 함께 확인합니다.

브라우저의 지역·동네·가격·면적·세대수 조건과 두 사람 청약 프로필은 `localStorage` 전용이며 GitHub Actions에 전송하지 않습니다. Telegram은 위 Repository Variables의 공고 조건만 별도로 적용합니다. 두 사람별 기기 조건을 자동 동기화하려면 먼저 로그인과 비공개 구독 저장소를 도입해야 합니다.

GitHub의 예약 workflow는 정확한 실행 시각을 보장하지 않습니다. 부하가 높으면 지연되거나 일부 실행이 누락될 수 있고, 공개 저장소가 60일간 활동이 없으면 예약 workflow가 자동 비활성화될 수 있습니다. 자세한 제약은 [GitHub Actions `schedule` 공식 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)를 확인합니다. HomeHunt 자동 수집에 포함되지 않는 GH 공고는 [GH 공식 분양·임대 문자알림](https://www.gh.or.kr/gh/saleslease-notification.do)을 함께 신청하는 편이 안전합니다.

### FCM은 장기안

Firebase Cloud Messaging을 붙이면 로그인한 두 사람의 기기별 조건 푸시로 발전시킬 수 있지만, [FCM Web 시작 가이드](https://firebase.google.com/docs/cloud-messaging/web/get-started)에 따라 HTTPS, 서비스 워커, VAPID 키와 신뢰할 수 있는 서버 발송 환경이 필요합니다. iPhone·iPad는 iOS/iPadOS 16.4 이상에서 홈 화면에 설치된 웹 앱이 사용자 동작으로 권한을 요청해야 합니다([Apple Web Push 안내](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)).

현재 sungso Firestore 규칙은 기존 기능 호환 때문에 일부 컬렉션이 공개 상태입니다. Firebase Authentication과 사용자별 비공개 보안 규칙을 적용하기 전에는 FCM 등록 토큰이나 청약 프로필을 Firestore에 저장하지 않습니다. FCM 서버 키·서비스 계정도 프런트엔드, 공개 저장소, 브라우저 저장소에 두지 않습니다.

## 4. NAVER 지도·주소·자동차 경로 키

새 NAVER Cloud Maps Application 하나에 다음 네 API를 함께 선택하면 같은 Client ID/Secret을 사용할 수 있다.

- Dynamic Map
- Geocoding
- Reverse Geocoding
- Directions 5

1. [NAVER Cloud Platform 콘솔](https://console.ncloud.com)에 로그인한다.
2. `Menu → All Services → Application Services → Maps`로 이동한다.
3. 처음 이용한다면 `Subscription → 서비스 이용 신청`에서 약관 동의를 완료한다.
4. `Application → Application 등록`을 누르거나 기존 새 Maps 앱의 `Application 수정`을 연다.
5. 위 네 API를 선택한다. Directions 5는 자동차 경로 전용이다.
6. Dynamic Map용 Web 서비스 URL은 포트와 경로를 제외한 호스트만 등록한다. 현재 프로젝트 기준으로 `http://127.0.0.1`, 필요하면 `http://localhost`, 배포용 `http://castlerain.github.io`를 등록한다. `http://127.0.0.1:8000/homehunt/`처럼 `:8000`이나 `/homehunt/`를 붙이지 않는다. NAVER는 HTTP와 HTTPS를 구분하지 않는다.
7. 저장 후 `인증 정보`에서 Client ID와 Client Secret을 확인한다.
8. 두 값을 각각 `.env`의 `NAVER_MAPS_CLIENT_ID`, `NAVER_MAPS_CLIENT_SECRET`에 넣는다. 새 Client ID를 발급했다면 브라우저 지도용 `homehunt/js/config.js`의 `APP_CONFIG.naverMapClientId`도 같은 ID로 바꾼다. Client Secret은 브라우저 JavaScript에 절대 넣지 않는다.
9. `한도 및 알림 설정`에서 일·월 한도와 알림을 설정해 예상치 못한 과금을 막는다.

공식 문서: [Maps Application 등록·수정](https://guide.ncloud-docs.com/docs/application-maps-app-vpc), [Directions 5](https://api.ncloud-docs.com/docs/application-maps-directions5)

기존 앱이 `AI·NAVER API → Application`에 있다면 구형 지도 상품일 수 있다. 새 API 추가가 막힌 앱에서는 `Application Services → Maps`에 새 앱을 만들고 위 네 API를 다시 선택한다. 기존에 화면에 공유된 Secret은 새 Maps 앱의 `인증 정보 → 재발급`으로 바꾸는 것을 권장한다.

## 5. NAVER 회사·상호·지점 검색 키

이 키는 Maps 키와 다른 NAVER Developers Application에서 발급한 기존 검색 API 키다. 현재 HomeHunt 어댑터는 `https://openapi.naver.com/v1/search/local.json`과 `X-Naver-Client-Id`, `X-Naver-Client-Secret` 헤더를 사용한다. NAVER Cloud Maps나 NAVER API HUB의 Client ID·Secret과 서로 바꿔 쓸 수 없다.

1. [NAVER Developers 내 애플리케이션](https://developers.naver.com/apps/)에서 기존 `성우소희` 앱을 연다.
2. `API 설정`에서 `검색`이 사용 API로 선택되어 있는지 확인한다.
3. 앱의 Client ID와 Client Secret을 각각 `NAVER_LOCAL_SEARCH_CLIENT_ID`, `NAVER_LOCAL_SEARCH_CLIENT_SECRET`에 넣는다.
4. 로컬 서버를 재시작하고 연결 상태 또는 회사 위치 검색에서 실제 결과를 확인한다.

공식 문서: [NAVER Developers 지역 검색 API](https://developers.naver.com/docs/serviceapi/search/local/local.md), [검색 API의 NAVER API HUB 이관 공지](https://developers.naver.com/notice/article/32530)

이관 공지에 따라 2026년 7월 30일 24:00까지 신청한 Developers 검색 API 기존 이용자는 2027년 6월 30일까지 현행 키를 사용할 수 있다. 2026년 7월 31일부터 Developers 신규 신청은 중단됐고, 유예 종료 뒤에는 NAVER API HUB만 지원된다. 따라서 2027년 6월 30일 전에 HomeHunt 어댑터를 API HUB 엔드포인트·인증 헤더로 바꾸고 API HUB에서 발급한 새 키로 이관해야 한다. 현재 두 인증 체계는 호환되지 않는다.

이 키가 없어도 HomeHunt는 키가 필요 없는 공식 주소 DB로 등록 건물명·법인명을 찾고 NAVER 지도 좌표로 확인한다. 다만 건물에 입점한 상호, 매장, 세부 지점까지 폭넓게 찾으려면 NAVER 지역 검색이 필요하다.

## 6. Kakao 버스·지하철 경로 키

HomeHunt의 기본값 `TRANSIT_PROVIDER=auto`는 `KAKAO_REST_API_KEY`가 있으면 Kakao를 먼저 사용하고, 없을 때만 TMAP을 사용한다. 지도는 계속 NAVER 지도를 사용하며 Kakao 키는 로컬 서버의 대중교통 경로 호출에만 쓰인다.

1. [Kakao Developers](https://developers.kakao.com/)에 로그인하고 앱을 만든다.
2. 앱 관리에서 `카카오맵 → 사용 설정`의 상태를 `ON`으로 설정한다.
3. `앱 → 플랫폼 키 → REST API 키`에서 사용할 키를 확인한다.
4. 해당 값을 `.env`의 `KAKAO_REST_API_KEY`에 넣는다. REST API 키는 브라우저 코드나 URL에 넣지 않고 로컬 서버가 `Authorization: KakaoAK …` 헤더로만 전송한다.
5. 앱 관리의 `통계 → 쿼터`에서 실제 사용량을 확인한다. 필요하면 REST API 키의 호출 허용 IP를 설정한다.

공식 문서: [카카오맵 시작·이용 정책](https://developers.kakao.com/docs/ko/kakaomap/common), [대중교통 경로 API](https://developers.kakao.com/docs/ko/kakaomap/rest-api#route-public-transit), [공식 쿼터·요금](https://developers.kakao.com/docs/ko/getting-started/quota), [앱·REST API 키 설정](https://developers.kakao.com/docs/ko/app-setting/app#platform-key-rest-api-key)

2026-09-05 공식 문서 기준 대중교통 경로의 무료 쿼터는 1,000건/일이며, 개발자 계정에서 카카오맵 API를 첫 번째로 활성화한 앱에만 무료 쿼터가 제공된다. 무료량을 넘겨 유료 API를 활성화하면 대중교통 경로는 10원/건이다. 정책과 요금은 바뀔 수 있으므로 배포 전 공식 쿼터 페이지를 다시 확인한다.

Kakao 대중교통 API는 여러 경로를 반환하며 HomeHunt는 `totalTime`이 가장 짧은 경로를 사용한다. 응답의 환승 수·요금과 `WALKING` 단계의 시간·거리를 합산한다. 공식 요청에는 출발 시각 파라미터가 없으므로, 사용자가 입력한 `08:00` 같은 시각에 맞춘 미래 시간표 조회라고 해석하면 안 된다.

HomeHunt는 캐시에 없는 실제 Kakao 원호출 시도만 KST 날짜별 `homehunt/.local/kakao-transit-usage.json`에 기록한다. 기본 `KAKAO_DAILY_LIMIT=1000`을 넘는 호출은 Kakao에 보내기 전에 차단한다. 이 로컬 장부에는 키나 API 응답 원문을 저장하지 않으며, Kakao Developers의 실제 계정 쿼터를 대체하지 않는다.

## 7. TMAP 버스·지하철 경로 키

일반 TMAP 자동차 상품이 아니라 `TMAP 대중교통` 상품을 신청해야 한다. HomeHunt는 그중 `대중교통 요약정보 API`를 사용한다.

1. [SK open API](https://openapi.sk.com/)에 T아이디로 회원가입·로그인한다.
2. `대시보드 → 앱 → 앱 만들기`에서 앱을 생성한다.
3. `PRODUCTS → 교통/위치 → TMAP 대중교통`으로 이동한다.
4. 개인 테스트는 `FREE → 사용하기`를 선택한다.
5. 방금 만든 앱을 선택하고 약관 동의 후 `사용 신청하기`를 누른다.
6. `대시보드 → 앱 → 해당 앱 상세`에서 AppKey를 복사한다.
7. 값을 `TMAP_APP_KEY`에 넣는다.

공식 문서: [TMAP 대중교통 이용 절차](https://transit.tmapmobility.com/guide/procedure), [대중교통 요약정보 API](https://transit.tmapmobility.com/docs/routes/sub), [상품·요금](https://transit.tmapmobility.com/)

현재 공식 FREE 한도는 대중교통 요약정보 API 10건/일이다. 더 자주 사용하려면 종량제로 상품을 변경해야 하며, 현재 요약정보 API 단가는 0.55원/건이다. 요금과 한도는 변경될 수 있으므로 [공식 상품·요금](https://transit.tmapmobility.com/)을 최종 기준으로 확인한다.

HomeHunt는 캐시에 없는 실제 TMAP 원호출만 서울 시간 날짜별로 `homehunt/.local/tmap-transit-usage.json`에 기록한다. `TMAP_DAILY_LIMIT`을 넘는 호출은 공급자에 보내기 전에 차단한다. 배치 요청은 출발지 최대 10개·도착지 최대 4개를 받지만, 중복 좌표를 제거한 뒤 필요한 원호출이 선택 공급자의 남은 일일 한도를 넘으면 전체 요청을 사전 차단한다.

`TRANSIT_CACHE_HOURS`는 0보다 크고 24보다 작아야 하며 기본 8시간이다. `TRANSIT_CONCURRENCY` 기본값은 2다. 긴 캐시는 호출량을 아끼지만 교통 변경 반영이 늦어지므로 24시간 이상은 허용하지 않는다.

공급자 선택은 다음과 같다.

- `auto`: Kakao 키가 있으면 Kakao, 없으면 TMAP
- `kakao`: Kakao만 사용하며 키가 없으면 미연결로 표시
- `tmap`: TMAP만 사용하며 키가 없으면 미연결로 표시

로컬 통근 API는 다음 계약을 사용한다.

- `GET /api/commute/quota`: 현재 선택 공급자, 연결 여부, KST 기준 Kakao·TMAP 각각의 `date`·`used`·`limit`·`remaining` 반환
- `POST /api/commute`: 기존 단일 출발지·도착지 조회 유지
- `POST /api/commute/batch`: `origins` 최대 10개와 `destinations` 최대 4개를 받아 모든 조합을 조회하고 `originId`·`destinationId`·`routes`·`departureTime`으로 돌려줌. 요청 본문의 선택적 `transitProvider: "kakao" | "tmap"`으로 `auto` 기본 공급자를 한 요청에만 덮어쓸 수 있어, Kakao 광역 선별 뒤 TMAP 최종 후보 재검증을 서버 재시작 없이 수행함

배치 본문의 `maxTransitCalls`는 캐시에 없는 대중교통 원호출의 요청별 안전 상한이다. 서버는 같은 좌표·교통수단·출발시각 조합을 먼저 합치고, 예상 원호출이 이 값이나 선택된 Kakao·TMAP 공급자의 남은 로컬 일일 한도를 넘으면 공급자에 호출하기 전에 전체 배치를 거부한다.

## 8. 적용과 확인

`.env`를 저장한 뒤 브라우저만 새로고침해서는 서버 값이 바뀌지 않는다. 기존 로컬 API 서버를 종료하고 아래 명령으로 다시 시작한다.

```powershell
powershell -ExecutionPolicy Bypass -File homehunt/scripts/start-local-market.ps1
```

실행기는 `homehunt/.env`를 자동으로 읽는다. `MOLIT_SERVICE_KEY`가 비어 있을 때만 기존 보안 입력창으로 물어본다. 명시적으로 설정된 프로세스 환경변수가 있으면 `.env`보다 우선한다.

HomeHunt의 `연결 상태`에서 아래를 확인한다.

- `국토부 키 .env/환경변수 자동 연결`
- `Kakao 또는 TMAP 버스·지하철 실제 경로 연결`
- `NAVER Directions 5 자동차 연결`
- `NAVER 회사·건물명 검색 연결`
- `청약홈·LH 서울·경기 분양 공고 연결`

웹 화면의 키 연결 창에 직접 넣는 방법도 계속 지원하지만, 그 값은 서버 메모리에만 남아 재시작하면 사라진다.

## 배포 시 이름

로컬 `.env`를 GitHub나 Firebase에 업로드하지 않는다. 배포 플랫폼에는 각 비밀 저장소를 사용한다.

| 대상 | 비밀 이름 |
|---|---|
| 로컬·Firebase Function 국토부 | `MOLIT_SERVICE_KEY` |
| GitHub Actions 국토부 | `DATA_GO_KR_SERVICE_KEY` |
| GitHub Actions 청약홈 선택 별도키 | `APPLYHOME_SERVICE_KEY` |
| GitHub Actions Telegram 봇 | `TELEGRAM_BOT_TOKEN` |
| GitHub Actions Telegram 비공개 그룹 | `TELEGRAM_CHAT_ID` |
| 로컬 NAVER 자동차 | `NAVER_MAPS_CLIENT_ID`, `NAVER_MAPS_CLIENT_SECRET` |
| 로컬 NAVER 장소 | `NAVER_LOCAL_SEARCH_CLIENT_ID`, `NAVER_LOCAL_SEARCH_CLIENT_SECRET` |
| 로컬 Kakao 대중교통 | `KAKAO_REST_API_KEY` |
| 로컬 TMAP 대중교통 | `TMAP_APP_KEY` |
