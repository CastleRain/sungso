# Honeymoon 작업 지침

[루트 지침](../../AGENTS.md)을 함께 따른다. 이 앱은 `/sungso/honeymoon/`의 리조트 비교·메모·picks·견적 PDF를 담당한다. 현재 여행 편집은 Travel에서 수행한다.

## 화면과 데이터

- `js/resorts-data.js`: 12개 리조트·3개 여행사·가격·이미지·PDF 연결. 가격의 기준일·인원·식사·객실 조건을 유지하며 과거 견적을 현재 확정 가격으로 표시하지 않는다.
- `js/app.js`: 탭·Detail Sheet·메모·D-day, `tab-*`: 카드/가격/지도/토너먼트/PDF/플랜. 탭 최초 1회 지연 초기화와 localStorage 탭 복원을 보존한다.
- Firebase 10.12.0, Leaflet 1.9.4, pdf.js 3.11.174 CDN을 유지한다. 스타일은 `css/`의 실제 로드 파일로 나뉜다. 과거 `styles.css`는 사용하지 않는다.
- `data/리조트별/` 6개와 `data/패키지/` 4개 PDF의 파일명·공개 경로·한글 URL 인코딩을 보존한다. PDF는 HTTP 미리보기에서 확인한다.
- `window._openDetailSheet`·`_closeDetailSheet`, `open-pdf` 이벤트와 Esc/배경 클릭 닫기를 유지한다. 모바일은 바텀 시트, 데스크톱은 오른쪽 패널이다.
- 지도 리사이즈·대표 이미지·토너먼트 진행/가중치 localStorage 키와 우선순위를 바꾸지 않는다. 로컬 대표 이미지가 데이터 기본 이미지보다 우선한다.

## Firebase 계약

| 위치 | 역할·필드 |
|---|---|
| `resort_notes/{resortId}/comments/{commentId}` | author(성우/소희), text, resortId, resortName, createdAt |
| `resort_note_meta/{resortId}` | commentCount, lastComment, lastAuthor, lastAt |
| `couplePicks/main` | sohee/sungwoo 각 3슬롯, finalCandidates, confirmedResort, updatedAt |
| `itineraries/main` | 이전 8일 일정 days와 updatedAt; 현재 UI는 읽기 전용 |
| `itineraries/honeymoon_2027` | `shared/travel/trip-store.mjs`로 현재 여행 요약 구독 |
| `honeymoon_fx/usd_krw` | 환율 rate, fetchedAt |
| `naver_blog_cache/{resortId}`, `naver_blog_meta/{resortId}` | 블로그 조회 결과 캐시·카드 개수 |
| `blog_review_prefs/{resortId}` | pinned/hidden 후기 선택·작성자·시각; 조회 갱신으로 덮어쓰지 않음 |

댓글 추가는 `addComment(resortId, resortName, author, text)` 계약과 메타 카운트 갱신을 유지한다. 메모 수는 카드·Pick·상세·알림센터에서 실시간 일치해야 한다. 이전 일정의 문자열 item과 객체 item 표시 호환을 유지한다.

블로그 후기 캐시 새로 가져오기와 후기 고정·숨김은 서로 다른 문서 계약이다. 캐시를 갱신해도 `blog_review_prefs`를 보존하고 같은 링크 해시의 점 표기 update를 유지한다. 외부 API 인증·프록시 방식을 폴더 정리의 부수 작업으로 교체하지 않는다.

환율은 1시간 이상 경과 시 자동 갱신하며 DB를 쓸 수 있다. 읽기 목적 브라우저 검증에서도 이 쓰기를 차단한다. 여행 결정 패널은 로드하지 않으며 현재 여행으로 연결하는 링크와 요약만 유지한다.

검증: 6개 탭·필터·가격 인원/통화·Detail Sheet·토너먼트·메모/picks·PDF 10개·이전/현재 여행 연결을 1440px·390px에서 확인한다. 실제 DB를 수정하지 않는다.

## 진행 상황

### 2026-09-13 — 리조트 앱·보관 자료 분리, 로컬 검사 완료

앱과 독립 보고서·원천 XML을 분리하고 기존 공개 주소를 유지했다. 견적 PDF 10개의 경로·파일 내용·로컬 요청을 확인했고 전체 검사 1,403개가 통과했다. 자동 환율 등 쓰기는 QA에서 차단해 운영 DB를 수정하지 않았다. 카드·비교·토너먼트·현재/이전 여행과 PDF 10개 각각의 canvas 표시·페이지 수, 휴대폰 배치와 가로 넘침 없음을 확인했다. Pages 배포 후 공개 파일 189개 전체의 HTTP 200·해시 일치에 리조트 자산·PDF 10개도 포함됨을 확인했다. 자동 환율 쓰기를 피하기 위해 공개 브라우저 직접 로드는 생략하고 로컬 읽기 전용 UI로 확인했다. 운영 메모 저장은 실행하지 않았다. [전체 검증 근거](../../docs/restructure-verification.md)를 참고한다.

**다음:** 리조트·여행 기능을 변경할 때 기존 공개 자산 경로와 자동 갱신 동작을 함께 확인한다.
