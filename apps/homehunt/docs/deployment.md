# HomeHunt 배포 안내

전체 저장소의 현행 배포·전환·복구 절차는 [docs/deployment.md](../../../docs/deployment.md)를 따른다. 웹 소스는 `apps/homehunt/`, 검색·수집은 `services/homehunt/`에 두고 웹은 `dist/homehunt/`로 출력한다. 기존 `/sungso/homehunt/`와 Render API 주소는 유지한다.

- [Render 설정·운영 정책](render-deployment.md)
- [Firebase 인증·Functions 대안](firebase-cloud.md)
- [Firestore 보관·정리](firestore-free-operation.md)
- [이전 배포·검증 기록 원문](../../../archive/history/2026-09-13-before-restructure/homehunt-docs/deployment.md)

GitHub Pages는 생성한 artifact를 배포한다. 네 수집 작업은 새 공개 JSON 위치를 커밋하고 배포 워크플로를 명시 호출한다. 이전 branch 기반 Pages build API 안내를 새 구조에 적용하지 않는다. 실제 완료 여부는 [루트 진행 상황](../../../AGENTS.md#진행-상황)의 이번 결과를 확인한다.
