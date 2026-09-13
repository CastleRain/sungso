# Dates 작업 지침

[루트 지침](../../AGENTS.md)을 따른다. `apps/dates/`를 `/sungso/dates/`로 출력한다.

- 기존 Hub의 `events` 컬렉션과 `date`(YYYY-MM-DD), `title`, `emoji`, 선택적 `pinned`, `createdAt` 계약을 보존한다. 빈 DB에서도 자동 시딩하지 않는다.
- 공통 인증 boot가 회원 확인 후 Flatpickr·한국어 locale·`js/entry.mjs`를 순차 로드한다. 기본 Firebase 앱 이름 `[DEFAULT]`와 SDK 10.12.0, 명명 앱 인증 동기화를 유지한다.
- D-day는 핀된 일정을 기존 정렬로 표시한다. 핀이 없으면 저장된 결혼식 이벤트만 사용하며 정적 개인 날짜를 fallback으로 만들지 않는다.
- 날짜 전용 값은 한국 날짜로 비교하고 UTC 날짜 산술을 사용해 기기 시간대·서머타임의 영향을 받지 않게 한다.
- 목록·달력·일정 추가/삭제·행/핀 버튼 고정을 보존한다. DOM ID `ddayRow/eventList/calGrid/calPopup/addForm/formTitle/formDate`를 유지한다. 저장된 제목·이모지는 textContent로 출력한다.
- 로그아웃 시 이벤트 배열·선택 날짜·구독·날짜 팝업을 정리한다. 운영 DB에 QA 이벤트를 쓰지 않는다.

## 진행 상황

### 2026-09-13 — 날짜 화면 분리

기존 일정 문서 경로를 그대로 읽고 목록·달력·D-day·고정·추가·삭제를 새 직접 주소에 연결했다. 자동 시드와 하드코딩 결혼 날짜는 제거했다. 저장된 결혼식 fallback·KST 경계·기존 이벤트 배열 보존을 홈 공통 단위 검사에서 검증했다. 실제 브라우저·배포 결과는 [계획 폴더](../../docs/development-plans/active/couple-home/README.md)에 기록한다.

**다음:** 두 회원의 대역 화면·직접 접근·로그아웃과 운영 이벤트 보존을 최종 확인한다.
