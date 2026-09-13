# 운영 적용 근거 — 2026-09-13

2026-09-13 07:31 UTC 기준. 인증·보안의 로컬 검사는 [SECURITY-VALIDATION.md](./SECURITY-VALIDATION.md), 전체 완료 여부와 최종 릴리스는 [RESULTS.md](./RESULTS.md) 및 [CHECKLIST.md](./CHECKLIST.md)를 따른다. 이 기록에는 이메일·UID·토큰·개인 문서 내용·자격증명을 넣지 않는다.

## Firestore 규칙 배포와 익명 접근

- Firebase CLI가 규칙 컴파일·업로드·릴리스 성공을 반환했다. 검증 대상은 프로젝트 `sungso-358cb`의 Firestore 규칙이며 Functions 배포는 실행하지 않았다.
- 운영 ruleset: `projects/sungso-358cb/rulesets/1b83b352-d162-4fff-ad68-97edac63929d`.
- release 갱신: `2026-09-13T07:24:35.441695Z`. 운영본 재조회 검증: `2026-09-13T07:27:01.263Z`.
- 저장소와 운영 규칙의 SHA-256이 일치했다: `b54aa098f17328743c1ceed58bb17581f37feba0840dea4ed1a59513ef00e583`.
- 다음 11개 개인 컬렉션의 익명 읽기가 모두 HTTP 403이었다: `events`, `wecost_items`, `itineraries`, `home_notes`, `site_home`, `private_data`, `site_members`, `homehunt_user_snapshots`, `couplePicks`, `resort_notes`, `honeymoon_fx`.

이 결과는 운영 익명 접근 차단의 근거다. 두 실제 회원의 로그인·권한·로그아웃·직접 링크 접근 결과를 대신하지 않는다. 배포 로그와 응답 원본은 Git에서 제외한 로컬 보호 폴더에 보관했다.

## 운영 데이터 이전·보존

- 이전 전 백업 검증: 15개 컬렉션의 문서 67개, 백업 검증 `true`. 별도 미분류 컬렉션 7개의 이름도 식별·기록했으며, 해당 컬렉션의 문서는 이 백업에 포함되지 않았다.
- manifest 6건의 사전 검증 결과: 새 문서 4건 생성 예정, 기존 문서 2건 보존 예정. 적용 후 새 문서 4건의 재조회 검증을 통과했다.
- 추가한 것은 두 회원 등록과 인증 후 조회할 개인 참고 자료 두 문서다. 기존 설정·저축 두 문서는 보존했다.
- 전체 기존 문서 재대조: `2026-09-13T06:56:51.470Z`, **기존 67건 그대로, 변경 0건**. 운영 DB에 QA 자료를 쓰거나 기존 개인 문서를 초기화하지 않았다.
- 백업 SHA-256: `05cb588b5289b9c3fd4462541f21d6f2745743916254724afb90d056eea88560`.
- manifest SHA-256: `5fca27b8d600bad526cb165e155447dfd40b43df66556717804a57b6658081a6`.
- dry-run SHA-256: `4dfa83e3a33a44fe8b94fe84010b907faa0479b6b7fbe8c7f3a65b48698abced`.

이 수치는 로컬 보호 폴더의 `production-backup/backup-evidence.json`, `dry-run-evidence.json`, `apply-evidence.json`, `preservation-evidence.json`을 대조한 결과다. 백업 원본과 식별자는 Git에 추가하지 않는다. 개인 PDF는 사용자가 GitHub 보존을 요청하여 제한 공유 이전을 보류했다. 현재 PDF의 공개 상태와 과거 Git 이력 노출을 해결 완료로 기록하지 않는다.

## 무료 서버와 배포 경계

- Firebase CLI 운영 조회의 deployed Functions 목록은 0건이다. 따라서 보호되지 않은 기존 default Functions가 배포되어 있다는 근거는 없으며, 이번 릴리스에 Functions 신규 배포·삭제가 필요하지 않다.
- Cloud Billing API가 `2026-09-13T07:13:29.672Z` HTTP 200과 `billingEnabled: false`를 반환했다. Blaze 전환·새 결제 연결은 수행하지 않았다. [Firebase 공식 안내](https://firebase.google.com/docs/functions/get-started#deploy-functions-to-a-production-environment)는 운영 Functions 배포에 Blaze가 필요하다고 명시하므로, 기존 Render 무료 서버를 사용한다.
- Render 서비스: `srv-dag27je7bikc73e2cjtg`, `sungso-homehunt-api`, Free, Singapore, Node 22, `master` 자동 배포. 현재 대시보드의 Live 배포는 `dep-daj26bdg1s2s7395duj0`, 소스 `981e50d4ac868813ba86d263c5abd7fa3df01be8`로 확인했다. **이번 변경의 새 서버 배포 성공을 뜻하지 않는다.**
- 공개 API `https://sungso-homehunt-api.onrender.com`의 `2026-09-13T07:27:01.263Z` 검증에서 `/healthz`는 200, 익명 `/api/health`와 `/api/blog-search?query=qa`는 401이었다. 인증 없이 공급자 조회가 실행되지 않았고 이 검증에 통근·NAVER 공급자 호출을 사용하지 않았다.
- NAVER 검색의 브라우저 자격증명 제거와 운영 폐기·교체·서버 환경 설정은 서로 다른 완료 조건이다. 실제 교체 근거가 확보되기 전에는 폐기·교체 완료로 처리하지 않는다.

## 웹·서버 최종 배포 대기

- 읽기 전용 GitHub 조회의 최신 `master`는 `620c1fce6c7a5db983d4a02c5bceb0b6e3eb04ba`였다. 이 기록을 작성하면서 git fetch·merge·commit·push를 실행하지 않았다.
- 조회 당시 최신 Pages 성공은 이전 소스 `4014d001349e840a84dd6e82cba845dc641d7b09`의 [Actions 34742479321](https://github.com/CastleRain/sungso/actions/runs/34742479321), 시작 `2026-09-13T06:19:52Z`였다. 이번 변경의 Pages 배포는 아직 미확인이다.
- 다음 작업: 검증된 최종 변경을 최신 master와 통합·커밋·push하고 새 Pages Actions와 Render Live의 커밋 일치를 확인한다. 이어 공개 페이지에서 실제 두 회원·비회원·로그아웃·직접 링크 및 1440px/390px 화면을 확인하고 RESULTS에 최종 커밋·배포 ID·한계를 기록한다.
- 개인 PDF 보류, 자격증명 폐기·교체, 실제 계정 접근 등 미완료 항목이 있으면 계획 폴더는 `active/couple-home/`에 유지한다.

## 최종 릴리스 추가 확인 — 07:40 UTC

앞 절의 배포 대기 상태를 다음 운영 확인으로 갱신한다.

- 커밋 `19351183bb2c4e37406c41edb91b2edc5261b044`가 `origin/master`에 push되었다. [Pages Actions 34745590531](https://github.com/CastleRain/sungso/actions/runs/34745590531)의 `validate`와 `deploy`가 모두 성공했다. 전체 검사·서비스 세 번들 검증은 `07:35:39Z`, Pages 배포 작업은 `07:35:53Z`에 완료했다.
- Render 대시보드에서 같은 커밋의 **Live `dep-daj549ek1f9s73fhfia0`**, Trigger `Auto-Deploy`, Duration `1m 02s`를 확인했다. 기존 서비스 `srv-dag27je7bikc73e2cjtg`와 Free 요금제를 유지한다.
- `07:37:50.108Z`~`07:38:02.679Z` 공개 URL을 읽어 등록부의 **산출물 218/218개**를 로컬 `dist`와 대조했다. 7개 앱 진입 HTML과 공통 인증·회원 작업 범위·개인 자료 로더를 포함한다. 텍스트는 UTF-8의 CRLF만 LF로 정규화하여 SHA-256을 비교했고 바이너리는 원본 바이트를 비교했다.
- 사용자 보존 요청한 PDF **10/10개, 4,922,926 bytes**가 정확히 일치했다. 이 결과는 파일 보존 검증이며 PDF 비공개화의 근거가 아니다.
- 배포에서 제외한 이전 개인 호환 경로 7개는 모두 HTTP 404였다: 리조트 XML·보고서 2개, WeCost 참고 사본 4개·백업 1개. 과거 Git 이력과 외부 사본의 제거는 확인하지 않았다.
- 빌드 표식 `.nojekyll`은 별도 219번째 요청에서 HTTP 404였다. 등록부의 앱 산출물 218개에는 포함되지 않으며 결과를 누락하거나 219개 일치로 계산하지 않았다.
- 같은 검증의 익명 API 재확인: `/healthz` 200, `/api/health` 401, `/api/blog-search?query=qa` 401. 운영 DB 쓰기·NAVER/통근 공급자 호출은 실행하지 않았다.
- `07:40:16.084Z` 운영 문서의 최종 GET 대조에서 **기존 67건 보존·변경 0건·누락 0건**을 다시 확인했다. 원백업 해시를 먼저 재검증하고 GET 이외 메서드를 거부하는 읽기 전용 요청으로 비교했다. 마이그레이션을 다시 실행하지 않았다.
- 공개 브라우저에서 성우 회원의 홈·날짜 기존 일정 3개, WeCost 23개 행, Travel 8개 화면·예산 6개 행의 실제 읽기가 확인됐다. 소희 계정의 실제 브라우저 접근은 아직 미확인이다. 대역/Emulator의 두 회원 성공과 구분한다.

비민감 원본 근거는 Git 제외 로컬의 `pages-release-evidence.json`, `public-assets-release-evidence.json`, `production-preservation-final-evidence.json`에 보관했다. 관리자 세션 폐기 이후 이 검증 작업은 추가 관리자 조회를 실행하지 않는다. PDF 제한 공유·NAVER 자격증명 교체·남은 실제 회원 검증 때문에 계획은 계속 `active`에 둔다.
