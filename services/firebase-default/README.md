# 기존 Firebase 함수

기존 `default` 코드베이스와 함수 이름을 보존하는 Firebase 배포 패키지다. 진입점은 `index.js`, 공유 국토부 구현은 `services/homehunt/server/molit.cjs`이며 빌드가 필요한 코드를 배포 패키지에 포함한다.

저장소 루트의 `firebase.json`이 소스 위치·런타임·predeploy를 지정한다. 의존성 설치 후 루트 `npm run build:services`로 함께 빌드한다. 빌드 성공은 운영 Functions 배포 완료를 뜻하지 않는다. 현재 HomeHunt 검색 서버는 Render이며 이 패키지를 배포한다고 전체 검색 서버로 대체되지 않는다.

[개발·검증](../../docs/development.md) · [배포·복구](../../docs/deployment.md)
