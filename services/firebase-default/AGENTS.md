# 기본 Firebase 함수 작업 지침

[루트 지침](../../AGENTS.md)을 따른다. 기존 `default` 코드베이스, 함수 이름·리전·런타임·비밀키 이름·HTTP 계약은 구조 정리 때문에 바꾸지 않는다.

공유 국토부 구현은 `../homehunt/server/molit.cjs`에서 가져오고 빌드 산출물에 포함한다. 배포는 루트 `firebase.json`의 source/predeploy와 일치해야 한다. 웹 `dist/`에는 이 디렉터리와 서버 번들을 넣지 않는다.

의존성 설치 후 `npm run build:services`로 번들을 확인한다. 데이터·보안 규칙·요금제 변경과 Functions 운영 배포를 빌드의 부수효과로 실행하지 않는다.

## 진행 상황

### 2026-09-13 — 서비스 경로 분리·번들 검증 완료

세 서비스 번들, 전체 1,403개 검사와 localhost `demo-homehunt`의 Emulator 순차 20개 검사가 통과했다. 운영 DB 쓰기·새 통근 호출·Functions 배포는 수행하지 않았다. Pages·Render 공개 전환 확인은 진행 중이며 [검증 기록](../../docs/restructure-verification.md)의 실제 범위를 따른다.

**다음:** 공개 전환 결과와 자동 수집→배포 연결을 확인한다.
