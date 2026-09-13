# Hub

성우·소희의 밝은 개인 홈이다. `/sungso/`에서 Google 회원 인증 후 용도별 앱 바로가기, 다가오는 일정 3개, 최근 공유 메모 3개를 표시한다.

- `js/entry.mjs`: 화면, 홈 편집 초안, 메모 입력과 실시간 구독.
- `shared/home/home-core.mjs`·`home-store.mjs`: 앱 등록·KST 날짜·revision 트랜잭션·작성자 메모 계약.
- 홈 구성은 `site_home/shared`, 메모는 `home_notes`, 일정 요약은 기존 `events`를 사용한다. 읽기 시 자동 생성/시딩은 없다.
- 기존 날짜·달력·D-day·일정 추가/삭제/고정은 [Dates](../dates/README.md)의 `/sungso/dates/`에서 제공한다.

[작업 지침](AGENTS.md) · [개발 계획](../../docs/development-plans/active/couple-home/README.md)
