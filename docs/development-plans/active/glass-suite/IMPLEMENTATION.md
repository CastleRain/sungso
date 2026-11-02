# sungso 글래스 전환 구현 결과

2026-11-03 · 관리 화면 14개 · 개발 브랜치 `codex/glass-suite-20261103`

관리 화면 14개에 기본 화면과 밝은 글래스 전환을 구현했다. 최초값은 **기본(solid)**이며 글래스는 밝은 색상만 제공한다. 앱별 대표색, 기존 작업 영역과 저장 기능을 유지하면서 글래스에서 공통 사이드바·표면·정보 우선순위를 적용했다. 최신 전체 `npm run check` 기록은 **2,323개 통과, 실패 0개, 건너뜀 0개**다.

이 문서는 소스 구현과 확인된 검사 결과를 정리한다. 14개 관리 앱의 최종 합성 자료 브라우저 QA와 서비스별 커밋·원격 보존을 완료했다. 확인한 화면에서 미해결 P0/P1/P2는 없으며, 모든 실제 공급자·운영 자료·기기를 검증했다는 뜻은 아니다. **master 병합과 Pages 배포는 수행하지 않았다.** 서비스별 복구 기록은 [CHECKPOINTS.md](CHECKPOINTS.md), 원래 범위와 일정 추정은 [PLAN.md](PLAN.md), 화면별 증거와 한계는 저장소 루트 `design-qa.md`의 최신 글래스 섹션에서 관리한다.

## 계획에서 확정·정정한 사항

- **서체:** 계획 당시의 앱별 글꼴 유지 문구보다 최신 사용자 요구를 우선했다. 관리 화면은 기본·글래스 양쪽에서 로컬 Pretendard Variable을 사용하며 버튼·입력·달력·모달에도 적용한다. `Pretendard` 별칭도 같은 로컬 WOFF2를 사용한다. 청첩장 관리 안의 `.invitation` 작품 미리보기는 원래 디자인의 서체를 보존한다. 공개 청첩장 VER2~5와 공개 포트폴리오도 공통 서체 교체 대상이 아니다.
- **Journey 날짜:** 계획에서 큰 D-day라고 부른 영역은 실제로 지도에서 **현재 재생 중인 날짜·시간**이다. 기능을 제거하지 않고 글래스에서 작은 날짜 칩으로 표현했다. 재생 위치와 날짜 갱신을 유지한다.
- **화면 정리:** 사용 빈도를 측정하지 않은 기능을 폐기하지 않았다. 글래스에서 빈 작업실 3탭을 제외하고, 긴 설명·과거 분석은 접고, 기존 메뉴를 업무별로 묶었다. 원본 데이터 삭제·새 장부 복제·저장소 통합은 하지 않았다.
- **입력 UI:** 브라우저 기본 외형에 의존하던 날짜·월·시간·단일 선택을 맞춤 컨트롤로 보강했다. 기존 Flatpickr와 앱 전용 선택기의 소유권을 유지하고, 원래 폼 요소·검증·이벤트를 사용한다.

## Sprint 0~7 결과

아래 파일은 주요 진입점이다. 앱·공통·검사 경로는 저장소 루트 기준이며, `PLAN.md`·`CHECKPOINTS.md`·`references/`는 이 문서와 같은 폴더에 있다. 세부 검증과 후속 수정은 각 앱의 `AGENTS.md` 및 커밋 기록에 남긴다. 단계별 검사 수는 전체 검사에 포함되거나 서로 중복될 수 있으므로 합산하지 않는다.

| 단계 | 구현 결과 | 주요 파일 | 검증 및 남은 경계 |
| --- | --- | --- | --- |
| Sprint 0 기준 확정 | 기준 커밋 `4166581`과 태그 `glass-suite-baseline-20261103`를 개발 전에 원격 보존했다. 기존 빌드 산출물과 14개 시안, 앱·라우트·원본 저장 경계를 정리하고 합성 인증/자료 QA 서버를 마련했다. | `PLAN.md`, `references/`, `tests/site/glass-qa-server.mjs`, `tests/site/glass-qa-fixtures.mjs`, `tests/site/glass-qa-README.md` | 보존 기준본과 현재 빌드를 분리한다. 합성 화면은 실제 사용 빈도 조사나 운영 자료의 재현이 아니다. 기준본·개인 캡처는 Git 제외 `.local/glass-qa/`에만 둔다. |
| Sprint 1 공통·우리 홈·Dates | 표시 설정·앱 14개 매핑·전역 분류·현재 업무 메뉴·모바일 서랍·키보드 초점을 구현했다. 홈은 기존 바로가기 최대 4개·다가오는 일정 3개·최근 메모 1개를 사용한다. Dates의 목록·달력·D-day·추가/삭제/핀과 같은 events를 유지한다. | `shared/theme/`의 `suite-boot.js`, `suite-core.mjs`, `suite.mjs`, `suite.css`, `suite-controls.mjs`, `suite-controls.css`; `apps/hub/css/glass.css`, `apps/dates/css/glass.css` | 공통 설정·nav proxy·모드 왕복·인증 종료·컨트롤 검사는 `tests/theme/`, `tests/site/auth.test.mjs`에 포함된다. 홈/일정의 합성 화면과 초안·저장 흐름, 1440/390/320px의 시각 QA를 완료했다. |
| Sprint 2 WeCost | 기존 5탭·표 밀도·금융 계산을 유지했다. 글래스 대시보드의 목표 집값은 저장 결과와 집 시뮬 진입으로 정돈하고 긴 설명을 접는다. 모달·서랍·달력·고정비 144아이콘을 같은 표면에 맞췄다. | `apps/wecost/css/glass.css`, `apps/wecost/js/tab-dashboard.js`, `apps/wecost/js/app.js`, `apps/wecost/tests/glass-dashboard.test.mjs` | 당시 관련 121개 통과. 기존 입력 DOM·미저장 초안·원본 비교값과 설명 펼침 상태를 확인했다. 기본 모바일 하단 메뉴 위에 표시 전환 공간을 확보했다. 운영 금융 자료에 시험 값을 쓰지 않았다. |
| Sprint 3 HomeHunt·HomeHunt VER2 | 탐색과 판단의 다른 목적을 유지하면서 공통 집 그룹으로 연결했다. 지도·목록·조건·방문·백업과 네 판단 축, 출처·전망 보류를 보존했다. 좁은 화면의 조건 행동줄·지역 설명·기본 하단 메뉴와 모달 겹침을 보완했다. | `apps/homehunt/css/glass.css`, `apps/homehunt-v2/css/glass.css`, 기존 앱별 지도/조건 컨트롤러 | 기존 관련 회귀와 합성 자료의 메뉴·조건 초안·방문 취소·복원 흐름을 확인했다. QA 지도는 대역 그리드/타일이므로 실제 지형·공급자 검색·지오코딩·통근 결과의 검증으로 해석하지 않는다. |
| Sprint 4 Travel·Honeymoon | Travel의 원래 8개 화면을 일정·지도 / 예약·이동 / 비용 / 출발 준비로 묶고 변경 기록은 보조에 둔다. 같은 결정 패널 DOM을 기본 도킹과 글래스 서랍에 사용한다. Honeymoon은 현재 여행 요약과 이전 읽기 전용 일정을 분리하고 5개 메뉴·메모 알림·환율 도구를 유지한다. | `apps/travel/glass.css`, `apps/travel/decision-panel.mjs`, `apps/travel/calendar.mjs`, `apps/honeymoon/css/glass.css`, `apps/honeymoon/js/tab-plan.js`, 각 앱 `tests/glass-*.test.mjs` | Travel 기존 42개+신규 2개와 Honeymoon 신규 1개를 함께 실행한 45개 통과. 달력·선택일·초안·원격 비교 기준·종료 정리를 확인했다. 실제 private-content는 변경하지 않았으며 합성 본문, PDF/CDN와 실제 공급자 경계는 아래에 명시한다. |
| Sprint 5 Wedding·Invitation 관리 | Wedding의 하객/준비/청첩장 세 업무와 작업실 연결을 유지했다. Invitation은 29개 디자인 ID와 찜·공동 선택·revision·초안을 유지하면서 반복 카드 설명을 접고 이어가기 행동을 정돈했다. 작품 내부 서체와 고정 꾸미기/저장 행동줄을 보존했다. | `shared/life/glass.css`, `shared/life/ui.mjs`, `apps/wedding/index.html`, `apps/invitation/css/glass.css`, `apps/invitation/js/app.mjs`, `apps/invitation/tests/glass-catalog.test.mjs` | 하객의 초대/참석 구분과 로컬 저장 경계, 카탈로그 DOM 회귀를 확인했다. 공개 VER2~5는 최종 로컬 빌드 기준 소스 322개·출력 256개 차이가 없다. 청첩장 PC의 비교 버튼은 1440×1000px에서 세로 935~969px로 첫 화면에 들어온다. |
| Sprint 6 식탁·발자국·Journey·작업실·매출 | 식탁의 장보기/뭐 먹지/레시피, 발자국의 장소→방문→앨범, Journey의 지도 재생·기간·사진·기록 흐름을 유지했다. 작업실은 글래스에서 빈 3탭을 숨기고 매출을 주 행동으로 삼는다. 매출 4개 주 메뉴·5개 기존 URL·기간·필터·표·차트·규칙 저장·자료 갱신을 유지하고 과거 할인 비교만 접는다. | `shared/life/glass.css`, `shared/life/ui.mjs`, `apps/table/tests/life-glass-ui.test.mjs`, `apps/journey/assets/glass.css`, `apps/journey/js/surface.mjs`, `apps/sohee/build.mjs`, `apps/sohee/workspace/glass.css`, `apps/sohee/sales/src/glass.css`, `apps/sohee/sales/src/glass-disclosure.jsx` | 생활 앱 수량·초안·참조·빈 상태 검사, Journey 기존 제어부 이동과 정리 경계를 확인했다. 매출 61개 및 별도 Mantine 컴포넌트 시나리오 통과. 공개 포트폴리오 관련 5개 출력은 기준본과 SHA-256이 같았다. 실제 차트·공급자·비공개 자료 범위는 별도다. |
| Sprint 7 통합 검증·릴리스 준비 | 공통 연결·인증 종료·숨김/초점·모드 전환·고정 UI 겹침을 검토하고 서비스별 후속 수정을 반영했다. 공개 출력 allowlist와 제외 경계, 서비스별 복구 단위를 정리했다. | `tests/theme/`, `tests/site/`, `scripts/check.mjs`, `scripts/build-site.mjs`, `config/apps.json`, `CHECKPOINTS.md` | 중간 전체 검사 2,313개에서 신규 회귀를 포함한 최종 기록 2,323개 통과로 갱신했다. 최종 시각 QA·서비스별 커밋/원격 목록 대조·17앱 859공개 파일 빌드 검증을 완료했다. master 병합·배포 단계는 실행하지 않았다. |

관리 범위 14개는 **우리 홈, WeCost, HomeHunt, HomeHunt VER2, Travel, Honeymoon, Dates, Invitation 관리, Journey, 우리 식탁, 우리 발자국, 우리 결혼, 소희 작업실, 양정커피 매출**이다. 공개 청첩장 및 공개 포트폴리오를 이 수에 포함하지 않는다.

## 기능 보존 계약

### 표시 전환과 인증

- `sungso.ui.surface.v1`은 표시 설정 전용 키다. 미설정·잘못된 값은 기본 화면으로 정규화한다. 기존 앱 기록·공유 홈 구성·UID별 저장 키와 분리하며 데이터 마이그레이션을 하지 않는다.
- 글래스 메뉴는 원래 버튼/링크를 실행하는 proxy다. 원본 nav와 라우트·hash·뒤로가기는 유지한다. Travel의 4묶음은 원래 8개 진입을 대체 삭제하지 않는다.
- 모드 전환은 `sungso:surface-change`와 resize 경로를 사용한다. 앱 저장소나 편집기를 새로 만들지 않으며 같은 폼·초안·탭·지도·재생 상태를 유지하는 구조다. Travel과 Journey는 원래 DOM을 이동하고 종료 시 구독을 정리한다.
- 기존 회원 인증 gate와 private root 정리 흐름을 유지한다. 개인 화면이 숨겨지면 공통 셸·맞춤 컨트롤도 정리한다. 모바일 메뉴의 키보드 순환에는 실제 보이는 로그아웃 버튼을 포함한다.

### 컨트롤과 업무 데이터

- 맞춤 컨트롤은 원래 input/select의 `type`, `name`, `min`, `max`, `step`, `required`와 입력·변경 이벤트를 사용한다. readOnly·다중 선택·기존 Flatpickr·앱별 전용 위젯은 적용 대상에서 구분한다. 컨트롤 자체는 네트워크나 앱 기록 저장을 추가하지 않는다.
- WeCost 계산·지급/환불·외화·이력·다중 대출·고정비와 Travel의 공유 여행 비용은 기존 원본을 유지한다. 목표 집값의 글래스 표현 정리는 숨겨진 기존 초안이나 동시 수정 비교 기준을 초기화하지 않는다.
- 두 HomeHunt의 조건·판단 축·공유 기록·출처·보류는 독립성을 유지한다. 테마 변경으로 검색·통근 요청이나 클라우드 복원을 자동 실행하지 않는다.
- 생활 앱의 UID별 브라우저 저장과 백업, Journey의 공동 API·사진·가져오기 경계는 유지한다. 표시가 같아져도 서로의 기록을 자동 이관하거나 생활 기록을 공동 클라우드 자료로 표현하지 않는다.
- 매출의 기간/필터·단위·표본 부족·부분일·큰 주문 표시·원본 검토 후 명시 저장·메뉴 규칙 revision을 유지한다. 접힌 과거 비교도 같은 DOM을 유지하며 모드 왕복으로 사용자가 펼친 선택을 잃지 않는다.
- 하객 노트와 실제 RSVP의 자동 통합, 새 작업실 프로젝트 저장, 매출 자동 수집, 신규 분석 추적과 예시 데이터 자동 시딩은 추가하지 않았다.

## 검증 기록과 해석

| 확인 자료 | 결과 | 해석 범위 |
| --- | --- | --- |
| `.local/glass-qa/final-check.log` | `npm run check`: 로컬 참조 1,075개, JavaScript 288개 확인. 테스트 **2,323 pass / 0 fail / 0 skipped** | 소스 함수·계약·DOM 및 기존 회귀의 합계다. 중간 2,313개 기록을 대체하며 앱별 실행 수를 더하지 않는다. Node의 기존 모듈 형식 추론 경고는 있어 “경고 0”으로 표현하지 않는다. |
| `tests/site/glass-qa-README.md`와 합성 QA 서버 | 회원/비회원/로그아웃·권한 상실·충돌/실패를 로컬 메모리 자료로 재현 | 운영 DB 쓰기·실제 개인 자료 복제 없이 조작 경로를 확인한다. 실제 Firebase 보안 규칙·운영 저장·외부 공급자 결과를 대신 검증하지 않는다. |
| 매출 `npm test`, `npm run test:components` | 61개 통과 및 별도 컴포넌트 시나리오 통과 | 실제 Mantine 폼·기간·라우트·저장/정리 흐름을 확인했다. 컴포넌트 검사에서 차트는 대역이므로 Recharts 축·모바일 배치는 브라우저 QA에서 별도로 확인한다. |
| `.local/glass-qa/sales-boundary.log` | 공개 allowlist·인증 전용 셸·공통 인증 경로·QA fixture/source map 제외 검사 통과 | **비공개 원본 archive가 없어 private numeric sentinel scan은 건너뛰었다.** 이는 위 Node 테스트의 0 skipped와 별도 스크립트의 제한이다. 실제 비공개 수치가 번들에 없는지 해당 sentinel 기준으로 완전 검증했다고 주장하지 않는다. |
| `.local/glass-qa/public-invitation-hashes.json` | 기준 태그 대비 공개 청첩장 소스 **322개**, 출력 **256개** 차이 0 | 소스는 Git clean-filter로 Windows 줄바꿈을 정규화한 blob 해시 비교다. 출력은 VER2 36개, VER3 60개, VER4 63개, VER5 97개다. 최종 로컬 빌드 산출물로 재대조했다. |
| 포트폴리오 산출물 비교 | 공개 HTML 3개와 공용 작업실 JS/CSS 2개, 합계 5개 SHA-256 동일 | 회원 작업실 두 경로에만 suite/별도 glass CSS를 넣는 build 경계를 확인했다. 운영 배포 후 네트워크 응답 해시까지 확인한 결과는 아니다. |

개별 브라우저 확인은 수행한 화면·폭·자료 조건과 함께 기록한다. 합성 1440/390/320px 검사나 관측된 콘솔 결과를 모든 기기·모든 운영 입력의 보증으로 확대하지 않는다. 이번 작업에서는 운영 DB에 검증용 레코드를 쓰지 않았다.

## 공개 산출물과 제외 범위

빌드는 `config/apps.json`의 공개 allowlist를 사용한다. 실제 런타임 suite·앱 glass 자산은 포함하되, `.local`·보존 baseline·개인 캡처·QA 서버와 fixture·테스트·개발 계획·참조 시안·AGENTS·서버 소스·매출 비공개 입력과 소스맵은 공개 출력에서 제외한다. 저장소 루트를 통째로 배포하지 않는다.

기존 호환성 예외인 `homehunt/docs/personalized-recommendations.md`, `homehunt/docs/rail-station-data.md`는 명시적인 공개 문서다. 따라서 “모든 docs 파일이 배포에서 제외된다”고 기록하지 않는다. 이 개발 문서와 `references/`는 공개 대상이 아니다.

공개 청첩장 VER2~5의 작품·기존 URL·해당 버전 관리 경로와 공개 포트폴리오는 공통 표면 교체 범위에서 제외했다. 공개 파일 해시 비교는 이 보존 경계의 근거이며, 최종 빌드 이후에도 같은 비교를 유지해야 한다.

## 완료한 로컬 검증과 남은 실환경 경계

1. **최종 시각 QA 완료:** 14개 진입의 양 모드와 대표 작업에서 현재 탭·초안·필터·모달·지도/재생의 유지 여부를 확인하고 관측 범위를 `design-qa.md`에 기록했다. 작은 화면의 표시 전환·하단 메뉴·방문 추가·편집 모달·청첩장 행동줄 겹침, 메뉴 초점, 글자 대비·버튼 줄바꿈을 수정하고 재확인했다.
2. **소스/출력 보존 확인:** 서비스별 신규 파일과 후속 수정은 각각 커밋해 작업 브랜치에 push했다. CHECKPOINTS에 앱별 커밋·공통 의존성·역순 revert 절차를 정리했다. 공개 청첩장 322개 소스/256개 출력과 포트폴리오 제외 경계, 런타임 자산 참조·캐시 버전·공개 allowlist를 로컬 빌드 기준으로 확인했다.
3. **Travel 실제 본문:** QA는 합성 일정·예약 자료와 테스트 fixture로 기존 화면을 연다. 실제 private-content를 바꾸지 않았지만 긴 예약 문구·사진·실제 내용 밀도의 배치는 이번 합성 결과만으로 완료 처리하지 않는다.
4. **지도·PDF·CDN·공급자:** HomeHunt 지도 대역 그리드, Journey 지도/사진 대역, Google iframe·리조트 지도 대역은 UI 조작 경계를 확인한다. 실제 지도 타일·검색·지오코딩·통근·사진 API·환율 공급자와 모든 PDF의 실제 CDN/canvas 렌더는 실환경에서 별도 확인할 항목이다. 차단되거나 대역 처리된 요청을 공급자 성공으로 세지 않는다.
5. **비공개 매출 자료:** 원본 archive가 있는 승인된 환경에서 numeric sentinel scan을 다시 실행해야 그 경계를 마감할 수 있다. 운영 수치·실제 원본 수집·규칙 저장은 기존 권한과 자료로 별도 검증하며 현재 합성 fixture 결과로 대체하지 않는다.
6. **출시 및 복구:** master 병합·Pages 배포는 아직 실행하지 않았다. 실행하는 경우 배포 작업 결과·제공 자산 해시·내부 경로 미공개를 별도 기록한다. 서비스별 되돌림은 CHECKPOINTS의 앱 커밋과 해당 후속 수정을 최신 순서부터 되돌리고 공통 기반 의존성을 유지한다. Git 되돌림은 운영 DB나 사용자 기록을 되돌리지 않는다.

다음 작업은 실제 비공개 자료·외부 공급자를 연결하는 릴리스 전 읽기 검증과 사용자 피드백 반영이다. 구현·로컬 검증·서비스별 원격 체크포인트는 완료했으며 운영 병합·배포와 실환경 확인은 별도 릴리스 단계로 남긴다.
