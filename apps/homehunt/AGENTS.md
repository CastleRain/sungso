# HomeHunt 작업 지침

[루트 지침](../../AGENTS.md)을 함께 따른다. 현재 앱은 `apps/homehunt/`, 공개 경로는 `/sungso/homehunt/`다. 이전 전체 지침·릴리스 기록은 [archive/history](../../archive/history/README.md)에 보관한다.

## 경계와 데이터

- 지도·주소는 NAVER Maps Web SDK, 매매·전월세는 국토부 공식 실거래, 분양은 청약홈·LH·SH 공식 자료를 사용한다. 외부 포털은 허용된 링크·어댑터이며 매물 크롤링으로 대체하지 않는다.
- `js/`와 `css/`는 현재 화면 구현이다. 이전 버전 이름의 파일도 현재 로드되므로 이름만 보고 제거하지 않는다. `providers/`는 화면 근거 표시용 어댑터다.
- 화면·서버가 공통 사용한 순수 로직은 `shared/homehunt/`, 금융 계산·목표가격 연결은 `shared/finance/`다. 서비스는 `services/homehunt/`에 있다. 공통 코드와 서버에서 앱 JS를 import하지 않는다.
- 공개 JSON은 `data/`; 전국 원천 단지는 `services/homehunt/data/source/`, 수집 설정은 `services/homehunt/config/`, 알림 장부는 `services/homehunt/state/`다. 공식 공개 자료 외의 데이터를 배포 JSON에 넣지 않는다.
- 공공정보·사용자 입력·추정·미확인을 표시상 구분하고 없는 실제 가격·단지를 만들지 않는다. 지역 비교는 면적 구간, 단지 이력은 실제 전용면적 0.1㎡ 단위를 유지한다.
- 거래 금액은 만원, 면적은 ㎡, `priceP33 = amountManWon * 3.3 / areaM2`. 전망은 자료량·신선도·과거 검증 기준을 통과할 때만 표시하며 조건 부족을 0원이나 확정 예측으로 바꾸지 않는다.

## 저장·인증 계약

- 방문 키 `homehunt_visits_v1`, 비교 키 `homehunt_compare_ids_v1`(방문 ID 최대 3개, JSON 백업 v2), 청약 자가입력 `homehunt_subscription_profile_v1` 등 기존 저장 키를 유지한다.
- 방문 필드: `id, name, address, lat, lng, visitDate, dealType, askingPrice, areaM2, floor, builtYear, households, walkMinutes, direction, status, visitedBy, pros, cons, memo, tags`.
- 개인 기록·회사 조건은 기본적으로 브라우저에 둔다. 공통 Google 회원 확인 전에 앱을 시작하거나 개인 로컬 기록을 표시하지 않는다. 사용자 저장 선택 시 검증된 Google 토큰·`site_members/{uid}` 활성 상태와 `sungwoo`/`sohee` 역할·본인 UID 규칙을 적용한 `homehunt_user_snapshots`에만 백업한다. 로그인·조회만으로 기존 로컬 기록을 덮지 않는다.
- `homehunt-private-cloud` 앱 이름과 기존 백업 UID를 유지한다. API는 관리자 회원 문서의 기존 `householdId`를 사용하며 클라이언트 입력으로 가구·소유자를 바꾸지 않는다. 다른 회원의 본인 UID 백업을 읽거나 덮을 수 없다. 기존 `homehunt_members` 이메일 문서는 사이트 권한의 대체 허용 경로가 아니다.
- 현재 `CLOUD_API_BASE_URL`과 API 버전·함수명·HTTP 인증 경계를 보존한다. 공개 `/healthz`와 인증된 `/api/health`를 구분한다. 4자리 PIN은 제거했으며 서버도 UID 회원을 매 요청 검증한다.
- 새 검색·계정 전환·조건 변경 후 늦게 도착한 응답은 새 결과를 덮지 않는다. 로그아웃·계정 전환 시 구독·메모리·화면을 비우되 기존 localStorage/IndexedDB 개인 기록을 삭제하지 않는다. 실패·오프라인·불완전한 월 자료에서 기존 후보·사용자 입력을 보존한다.
- WeCost 목표가격은 해당 필드 읽기와 기존 연결 신호로만 받는다. 오류로 기존 후보를 지우거나 사용자의 조건을 임의로 바꾸지 않는다.

## 공급자·로컬 상태

- `.env`와 `.local/`은 `services/homehunt/`에 계승한다. 값·캐시·KST 일일 통근 장부를 초기화하지 않는다. 프로세스 환경변수가 파일보다 우선하고 화면 입력 키는 서버 메모리에만 둔다.
- 로컬 API 포트는 `8787`. 지도에는 Client ID만 사용하고 Client Secret은 서버에 둔다. 자세한 환경변수는 서비스 `.env.example`과 [API 안내](docs/api-keys.md)를 따른다.
- 로컬 통근 원호출 한도는 0을 유지하고 실제 통근은 공개 서비스의 공동 장부를 사용한다. 같은 키의 로컬/서버 사용량을 독립 한도로 취급하지 않는다.
- Kakao·NAVER 경로/파생 점수와 공식 공공자료 캐시를 구분한다. TMAP 재사용·회원/소유자 규칙·Firestore 정리 정책은 [서비스 안내](../../services/homehunt/AGENTS.md)와 기존 공급자 정책을 따른다.
- 회사/업체 POI 검색은 NAVER Developers 지역 검색 계약이다. Maps 키와 혼동하지 않는다. 2027-06-30 종료 예정인 기존 계약은 이후 공식 전환 확인이 필요하다.

## 검증

루트 `npm test`, `npm run check`, 서비스 번들·Emulator 검사를 따른다. 브라우저에서는 지도·검색·기존 후보/조건 복원·면적별 실거래·확인한 후보·내 기록·분양·대시보드와 1440px/390px 배치를 확인한다. 두 회원·비회원·직접 링크·로그아웃·본인/상대 UID 격리는 대역·Emulator로 검증하고 실제 운영 접근 확인과 구분한다. QA에 운영 DB 쓰기·새 로컬 통근 원호출을 사용하지 않는다. 여행 결정 패널을 이 앱에 로드하지 않는다.

## 진행 상황

### 2026-09-13 — 내부 로그아웃의 공통 실패 보호 연결

계정 패널의 로그아웃도 공통 회원 인증의 전체 SDK 로그아웃·즉시 화면 정리·실패 잠금/재시도로 연결했다. 기존 독립 세션 기본 동작·본인 UID·로컬 기록은 유지한다. 인증 18개/HomeHunt 세션 30개와 390px 대역의 내부 버튼 실패·복구를 검증했고, 운영 DB 쓰기·공급자 호출은 없다.

**다음:** 계획 RESULTS의 배포 근거와 실제 회원 접근 미완료 항목을 확인한다.

### 2026-09-13 — 공통 Google 회원 진입·본인 UID 보존

개인 홈의 공통 인증을 진입과 연결하고 서버·Firestore 권한을 UID 회원으로 통일했다. 기존 가구 연결·개인 백업 UID·브라우저 저장 키·검색 API 계약을 유지한다. 두 회원과 비회원의 서버 경계·UID 격리는 [보안 검증](../../docs/development-plans/active/couple-home/SECURITY-VALIDATION.md)을, 실제 운영 접근·배포와 남은 사용자 확인은 [진행 중 계획](../../docs/development-plans/active/couple-home/README.md)을 따른다.

**다음:** 실제 두 회원의 저장 기록·최근 검색을 읽기 위주로 확인하고 운영 서버의 접근 결과를 계획에 남긴다.

### 2026-09-13 — 앱·공통 로직·서비스 분리, 공개 코드 배포 성공

화면은 `apps/homehunt/`, 공통 로직은 `shared/homehunt/`, 검색·수집·배포는 `services/homehunt/`로 분리했다. 기존 공개 모듈 URL·query·API와 저장 계약을 유지한다. 전체 검사 1,403개·Emulator 20개와 세 서비스 번들이 통과했다.

1440px·390px에서 여섯 메뉴·NAVER 지도·메뉴 왕복 뒤 가격/면적 조건 유지와 가로 넘침 없음을 확인했다. 운영 DB 쓰기·새 통근 호출은 없었다. 새 QA origin에서 원래 사용자의 로그인·개인 후보/조건 복원을 재검증한 것은 아니다. [검증 기록](../../docs/restructure-verification.md)에 근거와 한계를 구분했다.

`981e50d`의 Pages 실행 `34737387442`와 같은 소스의 Render 배포 `dep-daj26bdg1s2s7395duj0`가 성공했다. 공개 산출물 189개 HTTP 200·로컬 해시 일치와 내부 경로 18개 404, `/healthz` 200·CORS·무로그인 health/quota 401을 확인했다. 회원 API·기존 기록은 로그인 후 확인이 남아 있다.

금리 수집 `34737525979`→자료 `25c6254`→Pages `34737535176` 성공을 확인했다. 금리·법정동·실거래·분양과 Pages 워크플로는 모두 active, Render는 On Commit으로 복원했다. 공개 화면의 공식 단지 17,851곳·NAVER 지도·로그인 전 경계도 확인했다.

**다음:** 사용자 로그인 후 기존 개인 기록·회원 API를 수동 확인한다. 확인 전까지 회원 검색·개인 기록 복원을 검증 완료로 표현하지 않는다.
