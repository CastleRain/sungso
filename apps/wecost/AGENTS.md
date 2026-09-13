# WeCost 작업 지침

[루트 지침](../../AGENTS.md)을 함께 따른다. `apps/wecost/`는 `/sungso/wecost/`로 출력되는 Firestore 기반 4탭 재무 대시보드다. Sheets 기반 백업은 [archive/wecost](../../archive/wecost/)에 보관하며 현행 안내로 사용하지 않는다.

## 구조·계산

- `js/app.js`가 단일 상태와 5개 Firestore 구독·계산·탭 핸들러를 연결한다. `tab-dashboard`, `tab-cashflow`, `tab-wedding`, `tab-house`와 `css/` 역할을 유지한다.
- 공통 계산은 `shared/finance/financial-calc.mjs`, 목표 집값 연결은 `shared/finance/home-target-price.mjs`다. 각 앱의 실제 소스 import 경로로 가져온다.
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

검증: 네 탭·계산·저축·대출·조정 저장 흐름과 HomeHunt 목표 집값 연결을 확인한다. 자동 시딩과 저장 검사는 대역에서 실행한다. 여행 결정 패널을 추가하지 않는다.

## 진행 상황

### 2026-09-13 — 재무 앱·공통 계산 분리, 로컬 검사 완료

앱을 `apps/wecost/`, 재무 공통 코드를 `shared/finance/`로 분리하고 기존 공개 URL을 유지했다. 재무 계산·목표가격 연결과 모듈 동일성 검사를 포함한 전체 1,403개 검사를 통과했다. 1440px·390px에서 네 탭 전환·배치와 가로 넘침 없음을 확인했다. 운영 재무 데이터에는 테스트 값을 쓰지 않았으며 Pages 배포 후 공개 화면의 네 탭 전환도 확인했다. [전체 검증 근거](../../docs/restructure-verification.md)를 참고한다.

**다음:** 사용자 로그인 후 HomeHunt 확인이 이어질 때 기존 조건·목표가격 연결을 유지한다.
