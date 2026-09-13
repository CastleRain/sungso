# 인증·보안 검증 — 2026-09-13

이 기록은 구현·로컬 대역·Emulator 검증이다. 운영 규칙과 서버의 배포 성공, 실제 두 계정 접근 확인을 대신하지 않는다.

## 구현

- Firestore `site_members/{uid}`의 `active: true`와 `sungwoo`/`sohee` 역할, 검증된 Google 토큰을 모든 개인 컬렉션에서 확인한다. 자기 회원 문서 단건 조회·구독만 허용하고 목록·클라이언트 회원 수정은 거부한다.
- 기존 events·재무·여행·리조트 컬렉션은 회원 접근으로 전환하고 문서·값을 변경하지 않는다. HomeHunt 개인 백업의 본인 UID·revision 조건과 서버 전용 상태의 차단을 유지한다. 기존 `homehunt_members`는 권한의 대체 경로가 아니다.
- 홈은 3개 그룹·6개 알려진 앱·정확한 다음 revision·작성 UID·서버 시각을 검사한다. 메모는 1~500자·작성 UID·서버 시각을 검사하고 수정은 금지하며 작성자만 삭제한다.
- 청첩장 찜은 인증된 역할의 중첩 필드만 변경할 수 있다. 공동 선택 revision과 UID/서버 시각을 확인한다. 일반 `couplePicks` 쓰기 조건에서 청첩장 문서를 명시적으로 제외하여 겹치는 match의 OR 허용 우회를 막는다.
- 여행·금액 이력은 생성만 허용하고 인증된 `actorUid`, 역할에 대응하는 한글 `actor`, 서버 `changedAt`을 확인한다. 기존 이력과 이전 `itineraries/main`은 읽기 전용이다. 정상 이력과 장부·상세 예산 저장의 원자성은 유지한다.
- `private_data`·`private_files`는 회원 읽기와 Admin 이전만 허용한다. 사용자 보류에 따른 PDF 현재 공개 여부와 실제 이전 상태는 CHECKLIST/RESULTS를 따른다.
- Render/HomeHunt Functions와 default Functions는 Admin SDK 앞에서 UID 회원을 다시 검증한다. HomeHunt API에는 기존 `householdId`를 그대로 이전해야 하며 클라이언트 입력으로 소유자·가구를 바꾸지 않는다.
- Honeymoon 블로그 검색은 인증된 `GET /api/blog-search?query=…&sort=sim|date&resortId=…`로 연결한다. 교체한 `NAVER_SEARCH_CLIENT_ID`·`NAVER_SEARCH_CLIENT_SECRET`은 서버 `HOMEHUNT_PROVIDER_CONFIG`에서만 사용한다. 분당 가구 10회·한국 날짜 기준 서버 하루 200회 제한과 성공한 결과의 캐시·메타 원자 저장을 적용했다. 운영 자격증명의 폐기·교체 완료 여부는 별도 기록한다.
- 이름 있는 Firebase 앱의 계정 동기화를 직렬화해 이전 계정의 늦은 완료가 새 계정을 덮지 않도록 했다. 명시적 로그아웃은 개인 내용을 먼저 지우고 모든 앱 로그아웃 이후 SDK 메모리를 종료한다. 회원 비활성화·인증 관찰 오류도 개인 화면을 비우고 페이지를 다시 시작한다.

## 실행 결과

| 검사 | 결과 | 범위 |
|---|---|---|
| Firestore Emulator `demo-homehunt`, localhost, 파일 순차 실행 | 36/36 통과 | 기존 HomeHunt 규칙 16, 서버 정리 4, 개인 홈 규칙 11, 실제 청첩장 어댑터 5 |
| 서버 인증·Render·블로그·인증 생명주기 Node 검사 | 47/47 통과 | 두 회원·비회원·UID 이메일 도용·역할/가구 오류·전송 경계·요청량·동시 저장·A/B 계정 지연과 일부 동기화 실패·로그아웃 순서·회원 해제 |
| `npm run build:services` | 세 번들 통과 | Render, HomeHunt Firebase, default Firebase |

Emulator에서는 익명·비회원·비활성·비Google·미검증 이메일, 본인/상대 UID, 홈 동시 revision 충돌·전체 숨김·복원·잘못된 앱 ID/URL, 메모 작성자/길이/시각, 청첩장 상대 찜 변경·선택 덮어쓰기·실제 카탈로그 12개 ID 모두의 찜 저장, 이력 수정/삭제/작성자 위조를 확인했다. 잘못된 이력과 장부·예산을 한 batch로 저장하면 전체가 거부되고 기존 값이 유지되며, 정상 batch는 무관한 필드·현재 여행 문서를 유지했다.

검사는 운영 DB·사용자 토큰·공급자 요청·통근 원호출을 사용하지 않았다. 운영 데이터 보존의 직접 대조 결과는 관리자 백업·이전 기록을 따른다. 여기의 데이터 보존 검사는 합성 자료 기반이다.

Windows의 `spawnSync npm.cmd EINVAL`로 기존 서비스 통합 명령이 실패하여 세 서비스의 동일한 `build.mjs`를 Node로 직접 실행하도록 수정했다. 샌드박스의 CLI 설정/바이너리 경로 읽기 제한은 로컬 검사에 한정한 권한 실행으로 해결했다. 로컬 Node는 24.13.1이며 배포 타깃 Node 22/20은 유지했다. Emulator는 Java 21·Firebase CLI로 실행했다. CLI 종료 후 남은 이 작업의 Emulator 프로세스만 확인·정리했고 다른 서버는 중단하지 않았다.

## 배포 전·후 남은 확인

1. 두 승인 UID의 site_members 문서와 HomeHunt의 기존 가구 연결을 확인한다. 실제 회원 정보·자격증명은 이 문서에 기록하지 않는다.
2. 웹·Render·규칙 전환과 실제 회원 접근을 조율한다. default Functions가 운영에 남아 있으면 보호 버전을 배포하거나 관리자가 사용 중단 상태를 확인한다. 무료 요금제 때문에 배포할 수 없다면 해당 잔여 경계를 미완료로 남긴다.
3. 새 서버 블로그 키의 폐기·교체·환경 설정은 운영 콘솔에서 확인한다. 소스에서 브라우저 키를 없앤 사실을 자격증명 폐기 완료로 기록하지 않는다.
4. 현재 운영 데이터/공개 파일의 보존·이전과 사용자 보류 사항을 CHECKLIST·RESULTS에 합산한다. 과거 Git 노출·이력 재작성은 후속 작업이다.

재실행 명령:

```sh
firebase emulators:exec --only firestore --project demo-homehunt "node --test --test-concurrency=1 services/homehunt/cloud/tests/*.test.mjs apps/invitation/tests/firestore.emulator.mjs"
node --test tests/default-function-auth.test.mjs tests/blog-search-security.test.mjs tests/site-auth-lifecycle.test.mjs apps/homehunt/tests/cloud-api-security.test.mjs apps/homehunt/tests/render-server.test.mjs
npm run build:services
```
