# 구현 결과 — 완료 조건 일부 남음

2026-09-14 기준. 개인 홈·공통 회원 인증·기존 앱 연결의 Pages·Render·규칙 배포와 추가 로그아웃 보강의 공개 반영을 확인했다. NAVER 브라우저 키 제거·회원 서버 경계와 신규 키 재발급/Render 설정은 완료했고 이전 키 폐기는 미완료다. 성우 HomeHunt의 실제 회원 진입·회원 API 접근을 확인했으며 자동 요청 장부 쓰기는 미측정이다. PDF 제한 공유와 소희 전체 앱·성우 Honeymoon의 실제 검증도 남아 이 계획은 `active`에 유지한다.

## 변경

- 흰색·분홍/민트/하늘색 홈에 3개 용도별 그룹·6개 앱, 다가오는 일정 3개, 최근 메모 3개를 구성했다. 홈 순서/그룹/숨김은 두 회원이 공유하고 revision 트랜잭션으로 충돌을 감지한다. 취소·전체 숨김 복원·충돌 초안 보존을 지원한다.
- 기존 events·목록·달력·고정 D-day를 `/sungso/dates/`로 분리했다. 자동 이벤트 시딩을 없앴다. 메모는 500자 일반 텍스트·서버 시각·작성자 UID로 저장하며 작성자만 삭제한다.
- PIN을 공통 Google 인증으로 대체했다. 관리자 관리 회원 문서와 서버 규칙이 권한을 검증하고 기존 다섯 Firebase 앱을 동기화한다. 인증 전 앱 실행/개인 조회를 막고 로그아웃·계정 변경 때 구독·늦은 응답·개인 화면을 정리한다.
- 청첩장 12종·해시 직접 링크·본인 찜 중첩 병합·선택 revision·로컬 초안을 보존했다. 작성자는 인증 역할을 따른다. 실제 하객용 제작은 포함하지 않는다.
- Travel 8개 화면·출발 준비·WeCost 기존 장부 연결·원자적 예산/이력 저장·편집 원본 비교를 보존했다. HomeHunt의 본인 UID 백업과 기존 로컬 기록 키를 유지했다.
- 여행·리조트 개인 기준을 회원 전용 저장소로 옮기고 공개 개인 호환 출력 7개와 브라우저 NAVER 비밀값/공개 프록시를 제거했다. 블로그 검색을 회원 인증을 거친 Render API와 서버 전용 설정으로 연결했다. 사용자 재발급 후 신규 키의 Render 설정·재조회·Live 배포를 확인했으며, 이전 키 폐기는 별도 미완료 조건으로 남긴다. 장부 쓰기가 있는 블로그 API의 실제 QA 호출은 실행하지 않았다.

## 데이터 보존

운영 15개 컬렉션·67개 문서를 비공개 백업하고 dry-run을 검토한 뒤 기준 자료 2개와 회원 2개만 생성했다. 기존 재무 2개는 보존했고 이전 전 문서 67개 전체의 fields 해시가 같았다. 여행 본문·기준 export·리조트 export도 원본과 일치한다. 백업·입력·식별자는 Git 제외 경로에만 보관한다. [이전 근거](PRIVATE-DATA.md)와 [진행 기록](PROGRESS.md)을 참고한다.

## 검증

- `npm run build`·`npm test`를 포함하는 최종 `npm run check`: **1,519/1,519**, 참조 365개·JavaScript 문법 137개 통과.
- Render·HomeHunt Functions·default Functions 서비스 번들 3개 성공. 로컬 Node 24에서 검사했으며 운영/CI는 기존 Node 22를 유지한다.
- Firestore Emulator 36개 통과: 두 회원/비회원·HomeHunt 본인 UID·메모 작성자·청첩장 12종/찜/선택·이력·서버 전용 컬렉션. [보안 근거](SECURITY-VALIDATION.md).
- 대역 UI: 인증 전 개인 조회 0·비회원 거부·두 회원 홈 동기화, 취소·충돌 초안·전체 숨김 복원, 메모 텍스트/더보기/삭제·실패 초안, 날짜 목록·고정·달력, 청첩장 찜·공동 선택 충돌·직접 링크, Travel 8메뉴·출발 준비·예산 3문서 원자 저장·WeCost 연결을 확인했다.
- 1440px/390px 홈·날짜·청첩장·WeCost·Travel·Honeymoon·HomeHunt의 주요 화면을 확인했다. 해당 화면의 가로 넘침은 0이다. 날짜 추가/삭제 뒤 기존 4개 대역 일정 보존과 HomeHunt 권한 회수 뒤 로그인 화면 복귀도 확인했다. 개인 여행 캡처는 비공개 로컬에 두고 [공개 가능한 대역 캡처](evidence/)만 보관한다.
- 당시 소스/산출물 728개 검사에서 이전 브라우저 비밀값·회원 이메일 일치 0. 개인 기준 원문·여행 11일/이동 11개·준비 7개·결정 10개·견적값 보존을 확인했다. 현재 보관 문서와 시안의 추가 정리는 아래 완료 감사를 따른다. PDF 공개 예외와 과거 Git 이력은 별도다.
- 당시 대역·Emulator 검증의 운영 DB 테스트 쓰기는 0이다. 새 로컬 통근 원호출·요금제 전환도 실행하지 않았다. 사용자 승인 실제 마이그레이션 4개 생성은 QA 쓰기와 구분한다. 이후 실제 HomeHunt 진입의 자동 장부 쓰기는 미측정이며 아래 후속 확인의 한계를 따른다.

## 커밋·배포

최신 master `620c1fc`를 기준으로 별도 `codex/couple-home` 작업 공간에서 구현했다. 원래 작업 공간의 미커밋 변경은 건드리지 않았다. 구현 커밋은 [`19351183bb2c4e37406c41edb91b2edc5261b044`](https://github.com/CastleRain/sungso/commit/19351183bb2c4e37406c41edb91b2edc5261b044)이며 최신 master 재확인 후 fast-forward push했다.

- [Pages 34745590531](https://github.com/CastleRain/sungso/actions/runs/34745590531): Node 22 검사·서비스 빌드·배포 성공(07:35:53 UTC). 공개 산출물 218/218이 검증 결과와 일치했다. HTML/JS/CSS는 Windows CRLF 차이를 LF로 정규화하고, PDF 10개는 byte 그대로 대조했다. 제거한 개인 호환 경로 7개는 모두 404다.
- [Render 배포](https://dashboard.render.com/web/srv-dag27je7bikc73e2cjtg/deploys/dep-daj549ek1f9s73fhfia0): 같은 `1935118`, Auto-Deploy, 1m02s, Live. Free·기존 Singapore/Node 22 구성을 유지했다. 공개 healthz 200·비회원 API 401을 재확인했다.
- 배포 후 07:40:16 UTC에 운영 문서 67개를 다시 읽어 변경 0·누락 0을 확인했다. 세부 근거는 [OPERATIONS](OPERATIONS.md)에 남겼다.
- 실제 성우 Google 세션이 공통 인증으로 복구되어 홈·날짜(기존 3개)·WeCost(기존 23행)·Travel(8메뉴/예산 6행)·청첩장 직접 링크 읽기에 성공했다. 실제 로그아웃 뒤 개인 루트와 미리보기가 보이지 않는 것을 확인했다. 재로그인 버튼은 Google 인증 절차가 필요하며 사용자 조작 없이 두 번째 계정 로그인을 완료하지 않았다. Honeymoon 운영 자동 환율 쓰기를 피하기 위해 해당 앱의 실제 로그인 후 QA는 대역과 자산 대조로 한정했다.

Firestore 규칙은 07:24:35 UTC 배포 성공. 배포 소스 SHA-256 `b54aa098f17328743c1ceed58bb17581f37feba0840dea4ed1a59513ef00e583`가 로컬과 같고 개인 컬렉션 11종의 실제 익명 조회가 모두 403이다. Render 공개 healthz 200·인증 API 무로그인 401. 운영 Functions는 0개, 청구 비활성 상태를 확인했으며 새 Functions/Blaze를 추가하지 않았다.

## 남은 작업과 필요한 입력

1. **PDF:** 사용자 변경 지시로 PDF 10개(4,922,926 bytes)를 GitHub에 그대로 둔다. 현재 공개 URL은 인증으로 보호되지 않는다. 이후 Drive 소유 계정 로그인·두 회원 제한 공유·회원 전용 링크 이전·공개 원본 제거와 접근 검증이 필요하다.
2. **NAVER 신규 키 재발급·설정 — 완료:** 사용자가 재발급한 뒤 기존과 같은 Client ID·변경된 Secret을 확인했다. 기존 `HOMEHUNT_PROVIDER_CONFIG`를 백업·검증하고 `NAVER_LOCAL_SEARCH_CLIENT_SECRET`을 교체했으며 `NAVER_SEARCH_CLIENT_ID`·`NAVER_SEARCH_CLIENT_SECRET`을 추가했다. 총 11개 필드 중 다른 기존 8개는 동일하다. 2026-09-13 15:16:47.553 UTC 환경설정 재조회에서 신규 키 일치와 보존을 검증했고 `c11ab3a`의 Render `dep-dajbrqvqj5pc73d0p2g0`가 Deploy succeeded·Live·Free임을 확인했다. 실제 값은 기록하지 않는다. 상세 근거는 아래 운영 확인과 [OPERATIONS](OPERATIONS.md)를 따른다.
3. **이전 NAVER 키 폐기:** 신규 키 적용과 별도 완료 조건이다. [NAVER 공식 공지](https://developers.naver.com/notice/article/33626)에 따라 2026-08-26 이후에는 재발급 후 이전 Client Secret도 30일 동안 유효하며, 즉시 삭제는 NAVER 개발자센터에 별도로 문의해야 한다. 교체나 재발급만으로 노출된 이전 키의 폐기를 완료 처리하지 않는다. 이전 키 폐기는 아직 미완료다. [미발송 문의 초안과 필요한 완료 근거](NAVER-KEY-REVOCATION.md)를 따른다.
4. **실회원 검증:** 성우의 홈·날짜·WeCost·Travel·청첩장 실제 읽기와 로그아웃, 홈 로그인 복구 및 HomeHunt 실제 회원 진입·회원 API 접근을 확인했다. 앞서 HomeHunt 시간 초과로 기록한 것은 숨겨진 안내 문구를 읽은 오탐이었다. 실제 연결 패널은 온라인 서버 정상·공식 단지 17,851개·계정 전용 저장을 표시하며 표시 중인 경고는 0개였다. 백업 저장·복원 버튼과 통근 실행은 누르지 않았다. 자동 진입 요청의 장부 쓰기 발생 여부는 미측정이므로 이번 실제 확인을 운영 DB 쓰기 0으로 기록하지 않는다. 남은 실제 접근 QA는 성우 Honeymoon과 소희 전체 앱이다. Honeymoon의 자동 환율 저장·공급자 호출과 HomeHunt의 자동 요청을 차단할 대역을 준비하기 전에는 전체 실제 QA를 진행하지 않는다.
5. **과거 노출:** 현재 파일/배포에서 제거한 여행·재무/리조트 자료와 키는 과거 Git 커밋·외부 복사본에 남을 수 있다. 이력 재작성은 별도 후속 작업이며 이번에 실행하지 않았다. 현재 제거를 과거 노출 해결로 간주하지 않는다.

## CLI 인증 출력 사고와 처리

초기 `firebase login:list --json`이 예상과 달리 인증 토큰을 도구 출력에 포함했다. 비밀값을 이 문서나 Git에 기록하지 않았다. 최초 전체 CLI 계정 폐기 시도는 자동 승인 검토가 범위 초과로 거부했으며 실행되지 않았다. 이후 읽기 전용으로 계정이 1개·사용자 지정 계정 일치·다른 계정 0개임을 확인하고, 해당 조건이 바뀌면 중단하는 현재 계정 전용 폐기를 실행했다.

07:44:44 UTC 원격 폐기 성공, CLI 남은 계정 0개. 이 CLI 처리에서는 서버 서비스 계정·운영 키·사이트 Google 인증 설정을 변경하지 않았다. 다음 Firebase 관리자/규칙 배포 작업은 `firebase login`으로 CLI에 다시 로그인해야 한다. 이 처리는 NAVER 키 교체·이전 키 폐기의 근거와 별개다.

모든 완료 조건을 실제로 확인하기 전에는 `completed/couple-home/`으로 옮기지 않는다. 이 결과·추가 QA 캡처를 기록한 후속 문서 커밋은 구현 커밋 뒤에 별도로 push한다.

## 후속 요청 — 청첩장 시그니처 3종

기존 12종 중 봉투·별자리·탑승권을 시그니처 에디션으로 확장했다. 접힌 편지·세 장면 화보·하객 여정과 교통 전환·가상 참석 티켓을 제공한다. 실제 하객용 제작/응답 수집은 포함하지 않는다. 기존 초안·선택 섹션·찜·공동 저장 계약과 Google 인증을 유지한다.

루트 검사 1,542개·Invitation 51개·localhost Emulator 18개를 통과했고, 기존 9종 × 3설정 HTML 27개와 12종의 이전 옵션/초안이 일치했다. 1440px/390px 화면·체험 상태 복원·숨김·사진 확대·공동 선택 충돌·로그아웃을 대역에서 확인했다. 체험 중 쓰기 0회, 명시적 찜/선택 이후 대역 쓰기 2회이며 운영/공급자 호출은 0이다. [상세 검증](../../../invitation-verification.md)과 evidence의 `signature-*` 캡처를 따른다. 위 개인 홈 계획의 남은 조건은 그대로 유지한다.

구현 커밋 [`6d8667f`](https://github.com/CastleRain/sungso/commit/6d8667fec1755d91a548be614b5a55a4d4394f48)를 최신 master에 fast-forward push했다. [Pages 34747581063](https://github.com/CastleRain/sungso/actions/runs/34747581063)의 Node 22 검사·서비스 번들 3개·배포가 성공했다(08:24:40 UTC). 08:25:55 UTC 공개 청첩장 자산 **28/28개**가 HTTP 200이며 로컬 `dist`와 해시가 일치했다. 텍스트의 CRLF만 LF로 정규화하고 이미지 바이트는 그대로 비교했다. 공개 `#preview/envelope` 직접 링크는 인증 전 개인 루트를 숨긴다. 운영 로그인 후 새 체험은 대역 검증과 구분하며 실제 운영 저장을 실행하지 않았다.

이번 변경은 웹 예시·검증만 수정하여 Render 서버·Firestore 규칙 재배포나 데이터 이전이 필요하지 않았다. 기존 무료 운영·인증 경계·PDF 공개 보류를 유지한다. 정적 자산 원본 근거는 Git 제외 로컬 `signature-public-evidence.json`, Emulator 근거는 `signature-emulator.log`에 있다.

## 완료 감사 — 로그아웃 실패·현재 문서 보강

기본 또는 명명 SDK의 로그아웃 거절을 성공으로 처리하던 경로를 수정했다. 즉시 개인 화면·구독을 제거하고 별도 비식별 잠금을 두어 새로고침·직접 링크·다른 탭에서 회원이 자동 복구되지 않게 한다. 모든 SDK의 로그아웃과 필요한 잠금 제거가 성공한 뒤에만 페이지를 다시 연다. 실패하면 `로그아웃 다시 시도`를 제공한다. HomeHunt 계정 패널도 이 공통 흐름으로 연결했고 로컬 기록·초안 키는 보존한다.

저장소 제한 시 같은 탭과 새 탭의 보장 범위를 구분한다. 두 저장소 모두 사용할 수 없으면 현재 화면은 차단하지만 새로고침/새 탭의 실패 잠금 보존은 보장할 수 없음을 안내한다. 잠금을 저장하지 못한 저장소의 삭제 오류 때문에 정상 로그아웃이 막히거나, 완료된 과거 탭 이벤트가 새 로그인을 다시 종료하지 않도록 회귀 검증했다.

- 최종 `npm run check`: **1,556/1,556**, 참조 382개·JavaScript 문법 142개. 인증 생명주기 18개와 HomeHunt 세션 30개를 포함한다.
- 1440px/390px 대역에서 실패 즉시 화면 제거·동시에 열린 회원 탭 정리·새로고침·청첩장 직접 링크 차단·재시도 후 같은 미리보기 복구를 확인했다. HomeHunt 자체 로그아웃도 실패/복구를 확인했다. 대역 쓰기·운영 DB 요청·공급자 호출·브라우저 오류·가로 넘침은 0이다. `evidence/logout-failed-*.png`가 오류 화면 근거다.
- 문서 8개·프로토타입 HTML 2개의 실제 개인 날짜/시각/견적을 일반화했다. 원본 13파일을 비공개 백업·해시 확인했고 기존 PNG 3개와 보호 저장소 자료를 보존했다. 추가 검사 당시 텍스트 750개에서 이전 키·회원 이메일·실여행 ISO 날짜 일치 0. [정리 범위와 한계](PRIVATE-DATA.md)를 따른다.

이 로그아웃 보강은 웹 인증·HomeHunt 웹 연결·검증/문서만 변경했다. 당시 서버·Firestore 규칙은 그대로여서 기존 서비스 빌드/Emulator 근거를 유지하고 새 서버/규칙 배포를 수행하지 않았다. NAVER 키 교체와 실제 회원 확인은 당시 로그인 준비가 필요했으며 후속 결과를 아래에 기록했다. PDF는 사용자의 보류 지시를 유지하고 이 계획은 active에 남긴다.

보강 커밋 [`ea578cb`](https://github.com/CastleRain/sungso/commit/ea578cb411ad004b6a980d28a7c024c3fcf36a30)은 master에 push했다. [Pages 34748753391](https://github.com/CastleRain/sungso/actions/runs/34748753391)은 08:58:50 UTC 이후 `queued`·작업 0개로 조회되었다. 8분 이상 대기 후 해당 실행만 취소하여 재시도하려 했으나 GitHub가 이미 완료된 실행이라며 거절했다. 취소는 실행되지 않았고, 캐시를 우회한 후속 조회도 `queued`여서 완료로 처리하지 않았다.

2026-09-13 09:09:03 UTC 공개 파일 11개 대조에서는 기존 진입 HTML 7개가 일치했지만 변경된 인증 모듈 2개와 HomeHunt JS 2개는 불일치했다. 이어 같은 master의 수동 Pages 실행을 한 번 요청했으나 GitHub API가 HTTP 500을 반환했다. 이 시점에는 보강의 공개 배포를 미완료로 기록했다. 운영 서버·DB·요금제는 변경하지 않았다.

## 재개 후 추가 보강 공개 배포 확인

`6e7c0c7` 이후 추가된 자동 공공 `home-supply.json` 갱신 커밋 1개를 fast-forward로 보존했다. 확인한 최신 HEAD는 [`c11ab3a1912d9d66a8a5e12813eb5f7110ac9521`](https://github.com/CastleRain/sungso/commit/c11ab3a1912d9d66a8a5e12813eb5f7110ac9521)이다.

- 이 HEAD의 `workflow_dispatch` 실행 [Pages 34761005184](https://github.com/CastleRain/sungso/actions/runs/34761005184)가 성공했다. 2026-09-13 13:52:08 UTC validate에서 루트 check와 서비스 번들 3개를 통과했고 13:52:20 UTC deploy가 성공했다.
- 같은 HEAD를 빌드한 뒤 2026-09-13 14:52:36.736 UTC 공개 진입 HTML 7개·공통 인증 모듈 2개·HomeHunt JS 2개를 다시 대조했다. **11/11개가 HTTP 200이며 LF로 정규화한 SHA-256이 일치**한다. 앞서 미반영이었던 변경 JS 4개의 공개 반영도 확인했다. 원본 파일별 근거는 Git 제외 `.private-migration/completion-public-evidence.json`에 보관한다.
- 기존 대기 실행 2개(`34748753391` 포함)는 재개 후에도 `queued`다. 이 두 실행을 성공으로 처리하지 않으며, 후속 성공 실행과 자산 대조로 추가 보강의 배포 차단이 해소됐음을 기록한다.

추가 로그아웃 보강의 공개 배포 조건은 충족했다. NAVER는 브라우저 키 제거·회원 서버 경계 구현, 신규 키 재발급/Render 설정, 이전 키 폐기를 분리해 기록한다. 앞의 두 조건은 완료했고 이전 키 폐기와 남은 실제 회원 QA는 미완료다. 사용자 지시로 PDF를 GitHub에 유지하는 예외도 그대로이므로 계획 폴더를 `active`에 둔다.

## NAVER 신규 키 운영 반영·HomeHunt 실제 접근 범위

- 사용자 재발급 후 Client ID 유지·Secret 변경을 확인하고, 기존 Render 공급자 설정의 비공개 백업과 검증을 거쳐 신규 키를 반영했다. 총 11개 필드와 무관한 기존 8개 필드 보존을 2026-09-13 15:16:47.553 UTC에 재조회했다. 비민감 근거는 Git 제외 `.private-migration/naver-rotation-evidence.json`이다.
- 소스 `c11ab3a`의 [Render dep-dajbrqvqj5pc73d0p2g0](https://dashboard.render.com/web/srv-dag27je7bikc73e2cjtg/deploys/dep-dajbrqvqj5pc73d0p2g0)가 Deploy succeeded·Live이며 Free 요금제를 유지한다. 공개 `/healthz` 200과 익명 `/api/health` 401을 확인했다. 블로그 API는 요청 장부를 쓰므로 이번 QA에서 호출하지 않았다. 따라서 설정 일치·배포·익명 차단 근거와 실제 블로그 공급자 응답 검증을 구분한다.
- 2026-09-13 15:19:54.685 UTC 성우 HomeHunt의 실제 연결 패널에서 회원 API 정상 연결·공식 단지 17,851개·계정 전용 저장 표시와 표시 중인 경고 0개를 확인했다. 원본은 Git 제외 `.private-migration/real-homehunt-read-evidence.json`이다. 숨겨진 시간 초과 안내 문구를 장애로 읽었던 앞선 판단을 정정한다.
- 실제 HomeHunt 확인에서는 명시적 개인 저장·백업 복원·통근 실행을 하지 않았다. 자동 진입의 `/recommendations/recent` GET은 요청 제한 장부를 쓸 수 있고, 저장 후보의 `/kapt/complex` 자동 조회는 캐시를 쓸 수 있다. 화면의 저장 후보는 0개였지만 해당 자동 요청과 장부 쓰기 발생 여부는 측정하지 않았다. 이 한계를 과거 대역 검증의 쓰기 0회와 합치지 않으며, 개인 데이터 변경·훼손이 있었다고 추정하지 않는다. 자체 백업 복원 검증으로도 표현하지 않는다. 이후 전체 실제 HomeHunt QA는 자동 요청을 차단하는 대역을 마련한 뒤 진행한다.

신규 키 설정 완료는 30일 동안 유효할 수 있는 이전 키의 폐기를 뜻하지 않는다. 이전 키 즉시 폐기, 성우 Honeymoon·소희 전체 앱의 실제 접근, 보류한 PDF 제한 공유가 남았다.

## 재개 작업 기록 커밋·Pages 확인

검증한 기록 11개를 [`5ebc25e`](https://github.com/CastleRain/sungso/commit/5ebc25e017bd423a871b873ea3b2fdf070df7d95)로 커밋하고 최신 master에 fast-forward push했다. 원래 작업 공간의 미커밋 변경 4개는 보존했다. [Pages 34765783215](https://github.com/CastleRain/sungso/actions/runs/34765783215)의 validate가 2026-09-13 15:30:41 UTC, deploy가 15:30:54 UTC에 성공했다. 15:32:19.755 UTC 공개 자산 11/11개의 HTTP 200·LF 정규화 SHA-256 일치를 재확인했다.

원본 근거는 Git 제외 `resumed-record-release.json`·`resumed-record-public-evidence.json`에 보관한다. 이 기록의 후속 문서 수정은 서비스 코드·규칙·환경 설정을 바꾸지 않는다. 이전 NAVER 키 폐기·남은 실제 회원 QA·사용자 보류 PDF 보호가 남아 계획은 active에 유지한다.
