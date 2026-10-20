# 청첩장 전용 Vercel 배포

- 주소: https://sungso-wedding.vercel.app/
- Vercel 프로젝트: `sungso-wedding`, 기존 개인 Hobby 팀
- 기준 완료본: VER5.6.0, `328de3c285adf3cd7b6ff38b4e3444c907a27645`
- 구현 위치: `scripts/build-invitation-vercel.mjs`, `deploy/invitation/`
- 기존 GitHub Pages: https://castlerain.github.io/sungso/invitation-v5/

## 배포 경계

`npm run build:invitation`은 `deploy/invitation/dist/`에 청첩장과 필요한 사진·전체 MP3·글꼴·지도 아이콘·사진 및 계좌 관리 화면·공통 인증/자료 모듈만 만든다. 루트 `dist/`와 기존 Pages 소스는 수정하지 않는다. 사용하지 않는 이전 폰트, RSVP, 이전 버전, 허브, 다른 앱, 서비스 소스, 테스트, 비밀 설정은 출력하지 않는다.

전용 관리 로그인은 청첩장으로만 돌아간다. Firebase의 기존 Google 토큰·활성 회원·역할 검증은 공통 모듈 그대로 사용한다. 하객 페이지에는 로그인 모듈을 로드하지 않는다.

Vercel 설정에는 SPA fallback, 전체 경로 rewrite, 다른 사이트로의 redirect가 없다. 없는 경로는 `404.html`을 표시하되 HTTP 404를 반환해야 한다. `/homehunt/`, `/wecost/`, `/honeymoon/`, `/sungso/` 및 다른 앱 경로를 배포 후 확인한다.

정적 화면의 canonical·og:url·og:image·공유·ICS는 전용 빌드에서 새 주소로 바꾼다. 원래 GitHub Pages 파일은 유지한다. `noindex`는 검색 노출 요청일 뿐 접근 제한이 아니다.

## 데이터와 인증

기존 Render Free 서버와 Firebase Spark 프로젝트를 유지한다. 데이터를 이전·복제·초기화하지 않는다.

`https://sungso-wedding.vercel.app` Origin은 다음 실제 라우트에만 허용한다.

- `/api/invitation/v3/guestbook` 및 기존 UUID 삭제 경로
- `/api/invitation/v3/album` 및 기존 공개 사진·회원 관리·업로드·공개 반영 경로
- `/api/invitation/v5/accounts` 및 회원 관리 경로

HomeHunt·일반 API·RSVP·임의 경로·다른 Vercel/preview 주소에는 새 Origin을 허용하지 않는다. CORS는 인증 대체가 아니다. 관리 요청은 매번 기존 토큰과 `site_members/{uid}`의 활성 `sungwoo`/`sohee` 역할을 확인한다.

Firebase Console → `sungso-358cb` → Authentication → Settings → Authorized domains에 **`sungso-wedding.vercel.app` 하나만 추가**한다. 기존 Firebase/GitHub/localhost 도메인은 유지한다. 사용자가 2026-10-21 등록했고 콘솔 목록에서 확인했다. 요금제 Spark 무료도 확인했다.

## 재배포 방법

GitHub 저장소 전체를 Vercel에 Import하지 않는다. 최초 연결은 기존 Vercel 계정으로 로그인하고 Hobby 팀을 선택한다. GitHub App 접근 권한을 추가할 필요가 없다.

저장소 루트에서:

```powershell
npm ci
npm run check
npm run build:invitation
npx vercel@64.7.0 login
npx vercel@64.7.0 deploy --cwd deploy/invitation/dist --project sungso-wedding --prod --yes --scope ktsungwoo-5678s-projects --dry --json
npx vercel@64.7.0 deploy --cwd deploy/invitation/dist --project sungso-wedding --prod --yes --scope ktsungwoo-5678s-projects
node scripts/verify-invitation-live.mjs
```

CLI login이 안내하는 공식 Vercel 로그인 화면에서 본인의 계정 연결을 완료한다. 로그인 토큰을 채팅이나 Git에 넣지 않는다. 업로드 대상은 반드시 **`deploy/invitation/dist`**이며 저장소 루트나 전체 사이트의 `dist`가 아니다. `--project`로 기존 프로젝트를 지정한다. `--dry --json` 결과를 `.local/invitation-vercel-manifest.json`과 대조해 실제 업로드 파일이 일치하는지 먼저 확인한다.

최초 작업에서 `vercel link`가 로컬 `.env.local`과 `.vercel` 연결 자료를 만들었다. Vercel의 실제 업로드 검사에서 이 항목과 `.gitignore`가 제외되고 76개 공개 파일만 업로드됨을 확인했다. 새 빌드는 해당 연결 자료를 포함하지 않는다.

추후 새 버전은 완료 검증 뒤 빌더의 기준 앱·버전과 경계 테스트를 함께 갱신한다. 이번 배포는 VER5.6을 재현한다. Vercel Git 자동배포는 연결하지 않으므로 GitHub push만으로 Vercel이 갱신되지 않는다.

Vercel 대시보드 → `sungso-wedding` → Settings → Domains에서 기본 주소를 확인한다. Production 주소는 Vercel 로그인이 없는 하객에게도 열려야 한다. 임의 preview 배포는 하객용 주소로 공유하지 않는다.

## 운영 확인

배포 후 루트 200, 사진·폰트 200, MP3 Range 206, ICS 새 URL, OG 이미지 새 origin, 다른 앱 404, 공개 API 응답 및 올바른 CORS, 관리 무로그인 401, 실제 승인 회원 로그인을 확인한다. 방명록 작성·사진/계좌 변경은 메모리/로컬 검증으로 수행하며 운영에 검증용 메시지·사진·계좌를 저장하지 않는다.

현재 승인된 두 회원 권한을 유지한다. 관리 URL은 `/manage.html`(사진), `/accounts.html`(계좌)다. 새 주소에 처음 방문하면 다시 Google 로그인이 필요하다.

## 공개 범위와 무료 사용

Vercel을 분리해도 **기존 GitHub Pages와 GitHub 저장소의 공개 여부는 바뀌지 않는다.** 기존 주소를 아는 사람은 기존 접근 정책에 따라 방문할 수 있다. 다른 앱의 비공개화가 필요하면 별도 작업이다.

Vercel은 Hobby, Firebase는 Spark, Render는 Free를 사용한다. 새 DB·유료 Functions·유료 도메인·카드·Pro trial을 추가하지 않는다. Hobby의 월 사용량 제한을 넘으면 서비스가 제한될 수 있다. 공식 안내: https://vercel.com/docs/plans/hobby

## 검증 기록

- 2026-10-21: 원격 master와 완료 기록을 대조해 VER5.6.0 확인. 전용 76개 파일 빌드, 공유 링크/ICS/인증 의존성 검증.
- 전체 1,972개 검사 및 서비스 번들 통과. 새 Origin의 정확한 경로 허용, 유사 도메인/다른 앱/RSVP 거부, 승인된 두 역할/비활성/비회원 API 검증 통과.
- 로컬 실제 루트·사진·음악 재생 확인. 전용 HTTP 검사에서 다른 앱 404·MP3 Range 206 확인.
- Vercel 프로젝트 생성 및 요청 도메인 소유/배정 `verified: true` 확인. 실제 운영 배포 결과는 아래에 추가한다.

### 운영 반영 결과

- Vercel 배포 `dpl_77dSQzQkVUfCMGcqMcBVRWEhbrmw`가 READY이고 `https://sungso-wedding.vercel.app/`에 연결됐다. 익명 HTTP 요청으로 루트 200을 확인했다. 프로젝트에는 Git 저장소가 연결되어 있지 않다.
- 업로드 계획과 76개 허용 목록이 정확하게 일치한다. 제공 파일 74개의 실제 바이트(음악은 앞 1,024바이트 Range)가 로컬 산출물과 일치한다. `.env.local`·`.vercel` 등 연결 정보는 업로드에서 제외된다.
- 다른 앱·예전 청첩장·내부 소스·환경 파일 등 19개 경로 모두 실제 404. 공개 API 200, 회원 관리 API 무로그인 401, 정확한 Origin/OPTIONS 204, 다른 앱과 비허용 Origin 403을 확인했다. 세부 결과: `invitation-vercel-review/live-check.json`.
- 공개 브라우저에서 VER5.6, 리디바탕/Hahmlet 로딩, 모바일 가로 넘침 없음, 사진첩 확대/이동, 음악 약 22분26초 재생과 진행, 카카오 약도, 방명록 작성창을 확인했다. 운영 검증용 글·사진·계좌는 에이전트가 작성하지 않았다. 사용자가 직접 작성한 메시지가 공개 화면에 표시되는 것도 확인했다.
- 공유/OG/ICS는 새 origin이고 배포된 공유 함수 결과도 새 주소다. 인앱 자동화의 clipboard 읽기/붙여넣기는 이전 값이 반환되어 독립적인 실제 기기 클립보드 검증 완료로 기록하지 않는다. 실제 카카오톡 카드와 기기 공유 시트는 별도 확인 항목이다.
- Firebase 승인 도메인에 새 정확한 호스트와 기존 도메인이 함께 있음을 확인했다. 새 origin에서 성우 회원 로그인이 복원되어 사진 관리 목록 7장과 계좌 관리의 ‘저장된 내용을 불러왔어요’ 상태가 표시됨을 확인했다. 관리 값은 변경하지 않았다. 두 승인 역할의 허용 및 비활성/비회원 거부는 경계 테스트로 검증했으며, 소희 계정으로 실제 재로그인은 하지 않았다.
- GitHub Linux 검사에서 ICS 줄바꿈 차이를 발견해 전용 빌더에서 CRLF를 강제하도록 수정했다. 후속 커밋 `15a5656`의 [GitHub Actions 39465719671](https://github.com/CastleRain/sungso/actions/runs/39465719671) 검사·Pages 배포 성공을 확인했다. 기존 Pages 및 Vercel 제공 파일을 손상시키지 않았다.
