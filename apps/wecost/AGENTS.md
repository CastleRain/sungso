# WeCost 작업 지침

[루트 지침](../../AGENTS.md)을 함께 따른다. `apps/wecost/`는 `/sungso/wecost/`로 출력되는 Firestore 기반 4탭 재무 대시보드다. Sheets 기반 백업은 [archive/wecost](../../archive/wecost/)에 보관하며 현행 안내로 사용하지 않는다.

## 구조·계산

- `js/app.js`가 단일 상태와 5개 Firestore 구독·계산·탭 핸들러를 연결한다. `tab-dashboard`, `tab-cashflow`, `tab-wedding`, `tab-house`와 `css/` 역할을 유지한다.
- 공통 계산은 `shared/finance/financial-calc.mjs`, 목표 집값 연결은 `shared/finance/home-target-price.mjs`다. 각 앱의 실제 소스 import 경로로 가져온다.
- Travel과 연결하는 신혼여행 계산·저장은 `shared/finance/travel-budget-core.mjs`·`travel-budget-store.mjs`다. 결혼비용 탭의 요약에서 `../travel/#budget`으로 이동하고, Travel의 장부 링크는 `?tab=wedding`으로 결혼비용 탭을 연다. 여행 결정 패널은 WeCost에서 로드하지 않는다.
- Firebase·Chart.js의 CDN·초기화 순서와 HTML의 `window._` 핸들러 계약을 유지한다. 공통 공개 설정 추출은 초기화 동작 변경의 근거가 아니다.
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

`cat`를 `category`로 바꾸지 않는다. 대출 `type`은 `원리금` / `원금` / `만기` / `company`. settings와 savings가 없을 때만 기존 기본 문서를 생성한다. 5개 구독의 준비 상태와 pending writes 처리·목표가격 전파 순서를 보존한다.

## Travel 신혼여행 예산 연결

- `cat === '✈️신혼여행'`인 기존 `wecost_items/{id}`를 그대로 사용한다. Travel은 이 중 한 항목을 연결하며 별도 여행비를 결혼비용에 복제하지 않는다. 지급액은 `deposit + actual`, 잔금은 `max(planned - deposit - actual, 0)`이다. 예약 완료 상태를 실제 지급액으로 추정하지 않는다.
- 상세 예산은 `itineraries/honeymoon_2027_budget`, 금액 이력은 같은 컬렉션의 `honeymoon_2027_budget_log_…` 문서다. 신혼여행 항목의 기존 편집은 공통 저장소의 `saveTravelLedgerItem`으로 원본 비교 후 장부와 이력을 원자적으로 저장한다. 다른 분류의 비용·저축·대출·조정 저장 계약은 유지한다.
- Travel에서 명시 저장한 세부 합계는 연결한 항목의 `planned`·`balance`에 반영된다. 기존 신혼여행 항목 편집은 별도 세부 예산을 자동 수정하지 않으며, 예상액 차이는 Travel에서 확인·조정한다. 이력은 앱에서 추가만 하며 이전 기록을 수정·삭제하지 않는다.
- 예산 연결 조회는 예산·환율 문서를 시딩하거나 장부 값을 쓰지 않는다. 기존 WeCost settings/savings의 시딩과는 구분한다. 새로운 여행 연결에서도 Firebase 규칙·인증·기존 컬렉션 필드를 임의 변경하지 않는다.

검증: 네 탭·계산·저축·대출·조정 저장 흐름과 HomeHunt 목표 집값 연결을 확인한다. 1440px/390px에서 신혼여행 요약·Travel 왕복 링크와 같은 장부 항목의 지급·예상액 반영을 확인한다. 자동 시딩과 저장 성공·실패·동시 변경·이력 검사는 테스트 대역에서 실행하며 운영 데이터에 검증 값을 쓰지 않는다. 여행 결정 패널을 추가하지 않는다.

## 진행 상황

### 2026-09-13 — Travel 신혼여행 세부 예산 연결, 로컬 검증 완료

결혼비용 탭에 신혼여행 요약과 Travel 세부 예산 링크를 더하고, 기존 신혼여행 항목 편집을 공통 원자적 저장·금액 이력에 연결했다. 같은 `wecost_items` 항목을 사용하며 기존 네 탭과 다른 재무 데이터 계약을 유지한다. `npm run build`·`npm run check`의 1,422개 검사와 배포 참조·문법 검사를 통과했다. 1440px/390px 테스트 대역에서 Travel과의 금액·지급·이력, 동시 편집·실패 시 초안 보존·오프라인을 확인했으며 운영 DB 요청은 0이었다. 운영 저장·원격 배포 결과는 이 로컬 검증에 포함하지 않는다.

**다음:** 배포 후 WeCost·Travel의 공개 연결 화면을 읽기 위주로 확인하고 결과를 기록한다.

### 2026-09-13 — 재무 앱·공통 계산 분리, 로컬 검사 완료

앱을 `apps/wecost/`, 재무 공통 코드를 `shared/finance/`로 분리하고 기존 공개 URL을 유지했다. 재무 계산·목표가격 연결과 모듈 동일성 검사를 포함한 전체 1,403개 검사를 통과했다. 1440px·390px에서 네 탭 전환·배치와 가로 넘침 없음을 확인했다. 운영 재무 데이터에는 테스트 값을 쓰지 않았으며 Pages 배포 후 공개 화면의 네 탭 전환도 확인했다. [전체 검증 근거](../../docs/restructure-verification.md)를 참고한다.

**다음:** 사용자 로그인 후 HomeHunt 확인이 이어질 때 기존 조건·목표가격 연결을 유지한다.
