# HomeHunt 서비스 작업 지침

[루트 지침](../../AGENTS.md)과 [앱의 데이터 계약](../../apps/homehunt/AGENTS.md)을 함께 따른다.

- `server/`는 플랫폼 공통 API·인증·캐시·가격 작업·시설·통근 코어, `scripts/`는 공급자·수집·로컬 실행, `render/`와 `cloud/`는 배포 진입점이다. 공통 국토부 구현은 `server/molit.cjs`이며 기본 Firebase 함수도 이를 번들에 포함한다.
- 앱의 JS 구현을 서버에서 import하지 않는다. 계산은 `shared/homehunt/` 또는 `shared/finance/`를 사용한다. 앱의 공식 공개 JSON은 데이터 입력으로만 참조한다.
- 파일 위치는 공통 경로 모듈에서 계산한다. 원천자료는 `data/source/`, 수집 설정은 `config/`, 알림 장부는 `state/`, 화면용 결과는 `apps/homehunt/data/`다. 재배치 때문에 캐시와 장부를 새로 만들지 않는다.
- `.env`·`.local/`은 Git 제외. 허용한 환경변수만 읽고 프로세스 값을 우선한다. 실제 키·JSON 자격증명·개인 데이터를 로그·응답·Git·문서에 넣지 않는다. 화면 입력 키는 메모리에만 유지한다.
- API 인증은 Google 토큰·검증된 이메일과 `site_members/{uid}`의 활성 상태·`sungwoo`/`sohee` 역할을 확인한다. 기존 `householdId`를 그대로 이전하며 개인 백업 소유자와 검색 작업/최근 결과 접근 경계를 유지한다. Admin SDK가 Firestore 규칙을 우회하므로 서버 검사를 제거하지 않는다.
- 같은 공급자 키의 KST 일일 사용량을 유지한다. 로컬 원호출 한도 0 유지, 폴더 이동·재시작·배포 때 장부 초기화 금지. 사용량을 전환해야 할 때 현재 한국 날짜의 미반영 증가분만 한 번 합산하고 지난 날짜는 이월하지 않는다.
- 공식 월 자료·시설만 기존 만료 정책으로 캐시한다. Kakao·NAVER 경로와 파생 점수를 DB 재사용 자료에 넣지 않는다. TMAP은 기존 8시간 범위를 유지한다.
- 현재 무료 정리는 서버 실행 중 6시간 간격, 최대 읽기 500·삭제 250건의 기존 한도를 유지한다. 개인 백업은 제외하고 당일·전일 사용량과 원자적 작업 잠금을 보존한다. 관리형 TTL·무료 서버 깨우기·요금제 변경을 추가하지 않는다.
- Render는 Free·Singapore·Node 22, 공개 `/healthz`, 기존 `/api` 계약을 유지한다. 서버 동시성·요청 상한·캐시·잠금·부분 실패 재개는 구조 정리 중 변경하지 않는다.
- 공공자료 자동 수집은 네 GitHub Actions 작업을 사용한다. 공급자 요청 수와 알림 중복 장부를 보존하고, 테스트/수동 검증에서 Telegram 발송을 하지 않는다.

변경 후 루트 검사와 서비스 번들을 확인한다. Emulator는 `demo-homehunt`와 localhost만 사용하며 운영 DB 자격증명으로 대체하지 않는다. 배포·원격 설정 전환과 복구는 [docs/deployment.md](../../docs/deployment.md)를 따른다.

## 진행 상황

### 2026-09-13 — 개인 홈 회원 인증·후기 검색 경계 구현

서버 인증을 사이트 공통 UID 회원으로 연결하고 기존 가구·본인 UID 계약을 보존했다. 서버 비밀 설정만 사용하는 인증된 후기 검색과 분당 10회·한국 날짜 하루 200회 한도, 캐시·메타의 원자 저장을 추가했다. Emulator 36개와 관련 Node 검사 47개·세 서비스 번들을 통과했다. 운영 회원·환경 설정·실제 배포는 [보안 검증 기록](../../docs/development-plans/active/couple-home/SECURITY-VALIDATION.md)과 계획의 최종 결과를 따른다.

후속 운영 확인: 사용자 재발급 키를 기존 공급자 설정의 백업·대조 후 적용했다. 지역 검색 Secret 교체·블로그 검색 ID/Secret 추가로 총 11개 필드이며 다른 기존 8개를 보존했다. `c11ab3a`의 Render `dep-dajbrqvqj5pc73d0p2g0` Live/Free·healthz 200·익명 API health 401과 성우 회원 API 접근을 확인했다. 블로그 API QA는 장부 쓰기 때문에 실행하지 않았다. HomeHunt 실제 진입의 자동 최근 검색/캐시 장부 쓰기는 미측정이므로 운영 쓰기 0으로 기록하지 않는다. [운영 범위](../../docs/development-plans/active/couple-home/OPERATIONS.md)를 따른다.

**다음:** 이전 키 즉시 폐기와 남은 실제 회원 접근을 확인한다. 전체 실제 QA는 자동 최근 검색·시설 조회의 장부/캐시 쓰기를 차단할 대역을 준비한 뒤 수행한다.

### 2026-09-13 — 서비스 경로 분리·Render 공개 배포 성공

세 서비스 번들, 전체 1,403개 검사와 localhost `demo-homehunt`의 Emulator 순차 20개 검사가 통과했다. 운영 DB 쓰기·새 통근 호출·Functions 배포는 수행하지 않았다. Pages 실행 `34737387442`와 Render `dep-daj26bdg1s2s7395duj0`가 같은 `981e50d` 소스로 성공했다. Render의 Build/Start·감시 7개 경로를 변경하고 `/healthz` 200·CORS·무로그인 health/quota 401을 확인했다. [검증 기록](../../docs/restructure-verification.md)의 실제 범위를 따른다.

금리 수집 `34737525979`가 자료 `25c6254`를 커밋하고 Pages `34737535176`을 명시 호출해 성공했다. 네 수집·Pages 워크플로의 active와 Render On Commit 복원을 확인했다. 회원 API는 사용자 로그인 후 수동 확인으로 남겼다.

**다음:** 사용자 로그인 후 회원 API를 확인한다. 재배포 때문에 통근 원호출·사용량 초기화를 실행하지 않는다.
