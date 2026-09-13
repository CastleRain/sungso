# WeCost 작업 지침

[루트 지침](../../AGENTS.md)을 함께 따른다. `apps/wecost/`는 `/sungso/wecost/`로 출력되는 Firestore 기반 4탭 재무 대시보드다. Sheets 기반 백업은 [archive/wecost](../../archive/wecost/)에 보관하며 현행 안내로 사용하지 않는다.

## 구조·계산

- `js/app.js`가 단일 상태와 5개 Firestore 구독·계산·탭 핸들러를 연결한다. `tab-dashboard`, `tab-cashflow`, `tab-wedding`, `tab-house`와 `css/` 역할을 유지한다.
- 공통 계산은 `shared/finance/financial-calc.mjs`, 목표 집값 연결은 `shared/finance/home-target-price.mjs`다. 각 앱의 실제 소스 import 경로로 가져온다.
- Travel과 연결하는 신혼여행 계산·저장은 `shared/finance/travel-budget-core.mjs`·`travel-budget-store.mjs`다. 결혼비용 탭의 요약에서 `../travel/#budget`으로 이동하고, Travel의 장부 링크는 `?tab=wedding`으로 결혼비용 탭을 연다. 여행 결정 패널은 WeCost에서 로드하지 않는다.
- Firebase·Chart.js의 CDN·초기화 순서와 HTML의 `window._` 핸들러 계약을 유지한다. 공통 공개 설정 추출은 초기화 동작 변경의 근거가 아니다.
- 공통 Google 회원 진입점이 DOM 준비·회원 확인·명명 앱 인증 동기화를 마친 뒤 화면을 실행한다. `[DEFAULT]`·`sungso-travel-budget` 이름을 유지하며 인증 전 재무 구독·조회·저장을 시작하지 않는다. 로그아웃·계정 전환 시 구독·늦은 응답·화면·목표가격 연결을 정리한다.
- 계산 단위·지원금 선택·활성 대출·조정 부호와 상환 방식은 그대로 유지한다. HomeHunt에는 목표 집값 연결과 필요한 읽기만 제공하고 재무 전체를 임의 동기화하지 않는다.

## Firestore 계약

프로젝트 `sungso-358cb`에서 다음 컬렉션을 사용한다.

| 컬렉션/문서 | 필드 |
|---|---|
| `wecost_settings/main` | weddingDate, targetWeddingBudget, targetHousePrice, monthlyPaymentLimit, parentSupportSohee, parentSupportSunwo |
| `wecost_items/{id}` | name, **cat**, planned, deposit, actual, balance, balanceDue, memo, updatedAt |
| `wecost_savings/main` | soheeCurrent, soheeMonthly, sunwoCurrent, sunwoMonthly, updatedAt |
| `wecost_loans/{id}` | name, amount, rate, term, grace, type, enabled, updatedAt |
| `wecost_adjustments/{id}` | name, amount, sign (+/-), updatedAt |

`cat`를 `category`로 바꾸지 않는다. 대출 `type`은 `원리금` / `원금` / `만기` / `company`. settings와 savings가 없어도 문서를 자동 생성하지 않는다. 빈 날짜·0원은 메모리의 빈 화면 기본값이며 실제 재무 데이터나 시딩 결과로 취급하지 않는다. 기존 운영 문서가 우선이며 이전은 백업·원본 대조를 거친 관리자 절차로만 수행한다. 5개 구독의 준비 상태와 pending writes 처리·목표가격 전파 순서를 보존한다.

개인 컬렉션은 검증된 Google 로그인과 관리자 전용 `site_members/{uid}`의 활성 상태·`sungwoo`/`sohee` 역할로 보호한다. PIN이나 브라우저 이메일 목록을 권한으로 사용하지 않으며 두 회원이 기존 공동 재무를 편집한다.

## Travel 신혼여행 예산 연결

- `cat === '✈️신혼여행'`인 기존 `wecost_items/{id}`를 그대로 사용한다. Travel은 이 중 한 항목을 연결하며 별도 여행비를 결혼비용에 복제하지 않는다. 지급액은 `deposit + actual`, 잔금은 `max(planned - deposit - actual, 0)`이다. 예약 완료 상태를 실제 지급액으로 추정하지 않는다.
- 상세 예산은 `itineraries/honeymoon_2027_budget`, 금액 이력은 같은 컬렉션의 `honeymoon_2027_budget_log_…` 문서다. 신혼여행 항목의 기존 편집은 공통 저장소의 `saveTravelLedgerItem`으로 원본 비교 후 장부와 이력을 원자적으로 저장한다. 다른 분류의 비용·저축·대출·조정 저장 계약은 유지한다.
- Travel에서 명시 저장한 세부 합계는 연결한 항목의 `planned`·`balance`에 반영된다. 기존 신혼여행 항목 편집은 별도 세부 예산을 자동 수정하지 않으며, 예상액 차이는 Travel에서 확인·조정한다. 이력은 앱에서 추가만 하며 이전 기록을 수정·삭제하지 않는다.
- 예산 연결 조회와 WeCost 초기 조회는 예산·환율·settings/savings를 시딩하거나 장부 값을 쓰지 않는다. 금액 이력의 작성자는 로그인한 회원에서 얻으며 `actorUid`와 한글 `actor`, 서버 `changedAt`을 저장한다. 과거 작성자·이력을 새 형식으로 덮어쓰지 않는다.

검증: 네 탭·계산·저축·대출·조정 저장 흐름과 HomeHunt 목표 집값 연결을 확인한다. 1440px/390px에서 신혼여행 요약·Travel 왕복 링크와 같은 장부 항목의 지급·예상액 반영을 확인한다. 두 회원·비회원·로그아웃, 빈 문서의 자동 시딩 없음, 저장 성공·실패·동시 변경·이력은 대역·Emulator에서 검증하며 운영 데이터에 테스트 값을 쓰지 않는다. 여행 결정 패널을 추가하지 않는다.

## 진행 상황

### 2026-09-13 — 개인 홈 인증 연결·재무 자동 시딩 제거

공통 Google 회원 확인 이후 앱을 시작하고 기존 재무 문서와 5개 구독·목표가격 연결을 유지한다. 정적 개인 기본값·자동 시딩을 제거하고 Travel 예산의 원본 비교·원자적 장부/이력 저장에 인증된 작성자를 연결했다. 최신 검증·운영 전환과 미완료 사항은 [개인 홈 계획](../../docs/development-plans/active/couple-home/README.md)·[보안 검증](../../docs/development-plans/active/couple-home/SECURITY-VALIDATION.md)을 따른다.

**다음:** 실제 두 계정의 기존 재무·여행 예산 연결을 읽기 위주로 확인하고 배포·사용자 확인 결과를 계획에 남긴다.

### 2026-09-13 — Travel 신혼여행 세부 예산 연결, Pages 배포 완료

결혼비용 탭에 신혼여행 요약과 Travel 세부 예산 링크를 더하고, 기존 신혼여행 항목 편집을 공통 원자적 저장·금액 이력에 연결했다. 같은 `wecost_items` 항목을 사용하며 기존 네 탭과 다른 재무 데이터 계약을 유지한다. `npm run build`·`npm run check`의 1,422개 검사와 배포 참조·문법 검사를 통과했다. 1440px/390px 테스트 대역에서 Travel과의 금액·지급·이력, 동시 편집·실패 시 초안 보존·오프라인을 확인했으며 운영 DB 요청은 0이었다. 운영 저장·원격 배포 결과는 이 로컬 검증에 포함하지 않는다.

`eb8bea8`의 [Pages 34740618135](https://github.com/CastleRain/sungso/actions/runs/34740618135) 검증·서비스 번들·배포 성공을 확인했다. 공개 파일 23개가 HTTP 200·검증 산출물 해시 일치였고, 실제 공동 일정·WeCost를 읽은 1440px/390px에서 이동 국가·여덟 화면·기존 금액·견적 미리보기·출발 준비를 확인했다. SDK/네트워크 쓰기 차단 상태에서 운영 DB 쓰기·JS 오류·가로 넘침 0이었다. 임시 검증 근거는 `/private/tmp/sungso-travel-budget/`의 `qa-report.json`, `qa-public-report.json`, `public-files.json`에 보관한다.

**다음:** 실제 지급·견적 변경을 같은 신혼여행 항목에 기록하고 Travel의 세부 합계 차이를 확인한다.

### 2026-09-13 — 재무 앱·공통 계산 분리, 로컬 검사 완료

앱을 `apps/wecost/`, 재무 공통 코드를 `shared/finance/`로 분리하고 기존 공개 URL을 유지했다. 재무 계산·목표가격 연결과 모듈 동일성 검사를 포함한 전체 1,403개 검사를 통과했다. 1440px·390px에서 네 탭 전환·배치와 가로 넘침 없음을 확인했다. 운영 재무 데이터에는 테스트 값을 쓰지 않았으며 Pages 배포 후 공개 화면의 네 탭 전환도 확인했다. [전체 검증 근거](../../docs/restructure-verification.md)를 참고한다.

**다음:** 사용자 로그인 후 HomeHunt 확인이 이어질 때 기존 조건·목표가격 연결을 유지한다.
