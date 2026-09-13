# Hub 작업 지침

[루트 지침](../../AGENTS.md)을 함께 따른다. 소스 `apps/hub/`는 `/sungso/`에 출력한다. 결혼 D-day·일정 편집은 [Dates](../dates/README.md)로 분리했다.

- `index.html`은 개인 데이터가 없는 빈 화면이며 공통 `shared/firebase/boot.mjs`가 회원 인증 뒤 `js/entry.mjs`를 로드한다. 인증 전 Firestore 구독·시딩·쓰기를 시작하지 않는다.
- `shared/home/home-core.mjs`의 명시적 6개 앱 ID/URL과 기본 3개 그룹을 사용한다. 저장된 알 수 없는 ID를 링크로 쓰지 않는다. 새 앱은 기존 공유 구성을 지우지 않고 기본 그룹 마지막에 보충한다.
- `site_home/shared`는 `groups: [{id,name}]`, `apps: [{id,groupId,hidden}]`의 배열 순서와 `revision`, `updatedBy`, `updatedAt`을 저장한다. 그룹 ID는 `daily/wedding/travel`, 앱 ID는 `dates/homehunt/wecost/invitation/travel/honeymoon`이다. 읽기에서 문서를 생성하지 않는다.
- 홈 편집은 메모리 초안만 바꾸며 취소는 저장하지 않는다. 적용 트랜잭션은 편집 시작 revision을 비교한다. 충돌 시 초안을 보존하고 최신 구성으로 다시 편집하는 명시적 조작을 제공한다. 빈 그룹은 홈에서 숨기며 모든 앱을 숨겨도 편집·복원이 가능하다.
- 다가오는 일정은 기존 `events`에서 한국 시간의 오늘 이후 3개만 표시한다. 예시 일정·개인 날짜를 정적 기본값으로 넣지 않는다.
- `home_notes`는 일반 텍스트 1~500자, `authorUid`, 서버 `createdAt`이다. 출력은 textContent로 처리하고 작성자만 삭제한다. 최근 3개로 시작해 더보기마다 실시간 구독 범위를 6개씩 늘려 새 메모·삭제를 일관되게 반영한다.
- 로그아웃·계정 전환 시 구독과 늦은 응답을 무효화하고 개인 DOM·메모리 초안을 비운다. 기존 연결 앱의 로컬 초안 키는 변경하지 않는다.

검증: `node --test tests/site/couple-home.test.mjs`, 루트 build/test/check 및 1440px·390px 대역 QA. 대역 서버 `tests/site/couple-qa-server.mjs`는 운영 연결을 차단하고 실제 공통 인증 모듈과 홈/날짜 UI를 실행한다. 실행한 검증과 미완료 배포는 계획 폴더에서 구분한다.

## 진행 상황

### 2026-09-13 — 밝은 개인 홈·공유 편집·일정 요약·메모 구현

저장 프로토타입의 흰 바탕·분홍/민트/하늘색, 용도별 3그룹·6앱과 일정3·메모3을 구현했다. 공유 홈 트랜잭션·취소·충돌·전체 숨김 복원, KST 날짜와 작성자 삭제를 포함한 순수 로직/저장소 대역 19개 및 두 진입점 문법 검사를 통과했다. 운영 데이터 테스트 쓰기는 없다. 실제 브라우저·배포·실회원 결과는 [계획 폴더](../../docs/development-plans/active/couple-home/README.md)에 기록한다.

**다음:** 통합 대역 화면·보안 규칙·실제 회원 전환을 검증하고 계획의 미완료 항목을 정리한다.
