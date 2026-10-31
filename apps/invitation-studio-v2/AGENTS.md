# Studio V2

- Separate protected editor at `/lab/studio-v2/`; preserve Studio V1, public invitations, APIs and authorization.
- Reuse the existing version 1 composition/content and scene runtime. Editor version 2 does not imply a new stored schema.
- Keep one persistent iframe and audio player. Global changes retain the reading position. Scene demos never write live data.
- V2 working content uses a separate IndexedDB database. V1 content import is explicit; the existing 40-item visual library remains compatible.
- Shared save/publication uses the existing authenticated connected build only. Local QA uses synthetic data.
- No RSVP, photo captions, guest photo upload, invented venue information or inferred private details.

## Progress

### 2026-11-01 — 스튜디오 안의 계좌 등록·순서 편집

- 마음 전하실 곳 설정 상단에 신랑/신부 측·받는 분 선택, 은행/예금주/번호/공개/선택 송금 링크와 위아래 순서 변경을 연결했다. 확인창 뒤 명시적으로 기존 계좌 서버에 저장한다. 계좌는 조합 저장·공개와 독립적으로 바로 반영됨을 표시한다.
- 금융 초안은 메모리에만 유지하고 조합·URL·파일·DB에 넣지 않는다. 같은 iframe의 읽기 전용 계좌 미리보기, 장면 왕복 입력 유지, 계정 변경 정리, revision 충돌·기존 관리자 호환을 유지한다.
- 전체2,575검사, 합성 등록→순서→저장→재조회, 320~1440px 넘침0/44px 버튼, 실제 회원 조회와 익명401 확인. 운영 QA 쓰기 없음. Vercel `dpl_35kto2ji8tkZ5fufNqga6PnPhNPg` READY, Render `ed58175` Live. 상세: `docs/invitation-studio/v2-accounts/README.md`.

**다음:** 실제 계좌를 두 사람이 검토한 뒤 계좌와 순서 반영 버튼으로 공개한다.

### 2026-11-01 — 전체 후속 기능의 선택형 구현

- 새 콘텐츠 계약 `content.experience`를 재사용하고 `experience-editor.mjs`에서 장면별 실제 내용/미디어/개인화 설정을 입력한다. 빈 값은 하객 화면에서 숨긴다. 자동 공개·자동 운영 데이터 시딩은 금지한다.
- 영상/라이브 포토·LP/카세트/음성·실링/스크래치·브릿지·양쪽 시점·소개/퀴즈/부산/플레이리스트/사진 비교·하객 안내·감사장·인쇄와 회원 답글을 연결했다. 명세의 RSVP/하객 사진 업로드/설명은 이전 사용자 제외 요구를 유지한다.
- 직접 문구 편집, 장면 눈 아이콘/사이 삽입, 컴팩트 보기, 모바일 단계 패널을 보완했다. 사진/미디어 포함 파일·40개 보관함·이전 URL·명시적 공동 저장/공개와 기존 음악을 보존한다.
- 실제 내용·외부 키/패스 조건 및 검사/배포 증거: `docs/invitation-studio/v2-expansion/STATUS.md`. 마이크 권한·iOS/Android 실기기·실제 카카오 키·Wallet 설치 검증을 수행했다고 표현하지 않는다.
- 최종 2,570검사 통과, Vercel `dpl_HuFqJuetP9yzDBN6KWYiTtDy2DqC` READY. 기존 공개본/음악 보존과 익명 보호, 서버 새 GET200·관리401·임의 Vercel403, 실제 로그인 V2 로드를 확인했다.

**다음:** 실제 내용 등록 후 두 사람의 휴대폰에서 확인하고 공동 초안 중 원하는 조합만 공개한다.

### 2026-11-01 — 선택형 표현 3단계 배포

- 영수증형 당일 안내·필름 사진첩·인화지 메시지·사진첩 앞 짧은 나비 연결, 추천 3조합을 추가했다. 예전 추천은 접힌 영역에 남기며 문구/사진은 추천으로 덮어쓰지 않는다. 세부 옵션 선택과 재시연은 실제 변경한 key로 동작한다.
- 기존 형식 1/공동 저장/명시적 공개·음악/입력 상태를 보존한다. 서버 새 허용값 4개도 반영됐다. 전체 2,545검사·Emulator16개 통과, 5개 화면 폭·합성 저장/공개·배포 익명 경계를 확인했다.
- Vercel `dpl_9Qm27ML6gqqDYZnPFTMqDhAvGxup` READY, 기존 Render 배포 `dep-dbj1etetlv9c73bvrk3g` Live. 공개본/운영 데이터 QA 변경 없음. 상세와 사용법: `docs/invitation-studio/v2-scenes/README.md`.

**다음:** 새 추천을 공동 초안으로 비교하고 실제 자산/내용에 근거한 4단계 확장만 별도로 진행한다.

2026-11-01: V2 implementation started from `docs/invitation-studio/v2-analysis/PLAN.md`, prioritizing editor layout, unified controls and save compatibility.

### 2026-11-01 — Studio V2 별도 편집기 구현과 보호 배포

- 승인한 V2 계획의 0~2단계를 `apps/invitation-studio-v2/`에 구현했다. 장면 목록·큰 실제 미리보기·통합 디자인/문구/세부 설정, 이전/다음, 순서 변경, 선택 장면 추가, 모바일 하단 패널을 제공한다. 전체 색감·폰트·크기 변경은 읽던 위치를 보존한다.
- 문구 직접 편집, 사진 추가·제외, 전체 조합 기준 비교, 되돌리기/다시 실행, 기존 형식 1 URL·40개 디자인 보관함·파일 가져오기, 기존 공동 저장·명시적 공개 흐름을 연결했다. V2 문구/사진 작업 DB는 V1과 분리했고 V1 가져오기는 명시적 동작이다.
- `npm run build`, 전체 2,537개 검사, `npm run check` 통과. 합성 서버에서 직접 문구 편집/되돌리기, 사진 7→8장, 별점·메모, 공동 초안 저장, 순서·이전/다음, 음악 재생 위치·정지 보존, 320/390/430/1100/1440px 가로 넘침 없음 확인. 운영 데이터 QA 쓰기는 없다.
- Vercel `dpl_39JDRvJGryxiX9R8HnoiqBwgmBjc` READY, 보호 경로 `/lab/studio-v2/`에 배포했다. 루트 VER5.6·VER6·음악·사진 해시 동일, 익명 V1/V2 로그인 이동·스크립트401·관리401, 다른 앱3개404를 확인했다. 기존 공개 파일204개는 보존했다. 배포 중 잘못 생성한 임시 프로젝트는 사용자 승인 후 삭제했다.
- 상세 범위와 브라우저 증거는 `docs/invitation-studio/v2-implementation/README.md` 및 같은 폴더에 있다. 신규 하객 연출15종을 모두 구현한 단계가 아니며 필름 사진첩·폴라로이드 등3단계는 후속이다.

**다음:** 두 분이 V2에서 실제 조합을 공동 초안으로 사용하며 편집 흐름을 확인한 뒤, 영수증형 패스·필름형 사진첩·폴라로이드 표현을 선택 기능으로 확장한다.


### 2026-11-01 — Studio V2 장면 빼기·지도 버튼·서체 6종

- 설정 상단에 장면 빼기를 추가하고 목록의 ‘뺀 장면’에서 원래 순서로 복원한다. 문구·사진과 기존 저장 형식/권한은 보존하며 이전/다음에서 빠진 장면을 건너뛴다. 모바일 접힌 패널에서도 버튼을 표시한다.
- 지도3종은 아이콘 아래 이름 한 줄로 정렬하고 고운바탕·SUIT·나눔 손글씨를 더해6종을 제공한다. 원본 무료 폰트/라이선스를 포함하고 새 선택의 서버 저장 계약도 반영했다.
- 전체2,573개 검사·서버 빌드 통과, 실제320~1440px와 합성 빼기/복원/되돌리기 확인. 기존 루트·v6·음악·익명 관리 차단·다른 앱404 유지. Vercel `dpl_EjJmCj4sZcxaByfh8c12xpCoMjaT` READY, Render `cafe410` Live. 운영 QA 쓰기 없음. 상세: `docs/invitation-studio/v2-refinement/README.md`.

**다음:** 공동 초안에서 서체와 장면을 고른 뒤 원하는 조합만 명시적으로 공개한다.
