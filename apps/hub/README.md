# Hub

전체 앱을 연결하는 홈이다. 결혼 준비 일정·달력·D-day를 Firestore `events`에 연결한다.

- 소스: `index.html`, `css/style.css`, `js/app.js`, `js/firebase.js`.
- 공개 경로: `/sungso/`.
- 공통 의존성: `shared/firebase/`의 공개 설정. UI·PIN·구독 순서는 홈에서 관리한다.
- D-day 아래 결혼 전(모바일 청첩장·Honeymoon·여행 일정), 그 아래 살림·집 준비 순서다.
- 홈의 앱 카드와 각 앱의 홈 링크는 기존 공개 경로로 이동한다.

저장소 루트에서 `npm run dev`로 열고 [작업 지침](AGENTS.md)과 [검증 안내](../../docs/development.md)를 따른다.
