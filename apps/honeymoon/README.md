# Honeymoon

몰디브 리조트 12곳을 카드·가격·지도·토너먼트로 비교하고, 견적 PDF 10개와 댓글·커플 picks를 함께 보는 앱이다.

- 소스: `index.html`, `css/`, `js/`, 공개 견적 `data/`.
- 공개 경로: `/sungso/honeymoon/`.
- 리조트 기준 정보는 회원 전용 `private_data/honeymoon_reference`를 `js/resorts-data.js`에서 읽고, 댓글·picks·환율은 Firestore를 사용한다.
- 현재 여행은 [Travel](../travel/README.md)의 공통 저장소를 읽는다. 이전 8일 일정은 `itineraries/main`의 기록으로 보존한다.
- 이전 독립 보고서·원천 XML의 개인 원문은 검증된 비공개 백업에 보관한다. 현재 [보관 안내](../../archive/honeymoon/)는 개인 payload를 포함하지 않으며 공개 배포에서 제외한다.

저장소 루트의 `npm run dev`로 열고 [작업 지침](AGENTS.md)과 [검증 안내](../../docs/development.md)를 따른다. PDF 확인은 `file://` 대신 생성된 HTTP 사이트에서 수행한다.
