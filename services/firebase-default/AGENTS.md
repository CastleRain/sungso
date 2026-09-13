# 기본 Firebase 함수 작업 지침

[루트 지침](../../AGENTS.md)을 따른다. 기존 `default` 코드베이스, 함수 이름·리전·런타임·비밀키 이름·HTTP 계약은 구조 정리 때문에 바꾸지 않는다.

공유 국토부 구현은 `../homehunt/server/molit.cjs`에서 가져오고 빌드 산출물에 포함한다. 배포는 루트 `firebase.json`의 source/predeploy와 일치해야 한다. 웹 `dist/`에는 이 디렉터리와 서버 번들을 넣지 않는다.

의존성 설치 후 `npm run build:services`로 번들을 확인한다. 데이터·보안 규칙·요금제 변경과 Functions 운영 배포를 빌드의 부수효과로 실행하지 않는다.

## 진행 상황

### 2026-09-13 — 기존 HTTP 함수의 UID 회원 보호 구현

`naverBlogSearch`·`apartmentHistory` 앞에서 검증된 Google 토큰과 활성 사이트 UID 회원을 확인하도록 보호했다. 캐시·요청 한도·공급자 호출 전에 거부하며 오류에 원래 공급자 예외를 노출하지 않는다. default 번들과 공통 회원·두 함수 보호 대역 검사를 통과했다. 이 기록은 운영 배포나 노출 자격증명 폐기 완료를 의미하지 않는다.

**다음:** 실제 함수의 운영 사용 여부와 무료 요금제에서 가능한 보호 배포·중단 상태를 확인하고 계획의 RESULTS에 남긴다.

### 2026-09-13 — 서비스 경로 분리·번들 검증 완료

세 서비스 번들, 전체 1,403개 검사와 localhost `demo-homehunt`의 Emulator 순차 20개 검사가 통과했다. 운영 DB 쓰기·새 통근 호출·Functions 배포는 수행하지 않았다. 같은 릴리스 `981e50d`의 Pages·Render 공개 배포는 성공했으며 이 default Functions는 번들 검증만 수행했다. 금리 수집→Pages 재배포와 네 수집·Render 자동 실행 재개도 확인했다. 로그인한 HomeHunt의 회원 API·개인 기록만 수동 확인으로 남아 있다. [검증 기록](../../docs/restructure-verification.md)의 실제 범위를 따른다.

**다음:** 기존 공개 구성을 유지하며 사용자 로그인 후 HomeHunt 회원 확인 결과를 기록한다.
