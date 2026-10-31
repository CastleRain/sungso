# Invitation Studio

- Additive composition preview only at `/lab/studio/`. Preserve all 205 previously deployed files byte-for-byte.
- Arrival/transport, recipient accounts, guestbook, and reactive quick dock retain their approved functions and persistent nodes; their visual presentations are independently selectable (user request 2026-10-29). Existing links default to the original F presentations.
- Selectable cover, invitation, date, story, and album scenes may change; preserve original handwriting, audio, real photos, fonts, wedding facts, and known story.
- Build-selected demo data only. No URL, parent message, storage, or imported configuration may enable production writes. Guestbook local to this studio; never store real accounts or authentication data.
- Native vertical scrolling, mobile layouts, keyboard focus, reduced motion, effects-off, hidden tabs, and dialog suspension are required.
- Keep composition schema versioned and allowlisted. Save choices locally and in shareable URLs, without collecting guest information.
- Record observations and limitations in docs/invitation-studio and project progress.

## 2026-11-01 — V2 선택형 장면 공통 런타임

- 승인된 V2 3단계의 `receipt`/`film`/`polaroid`/`breath`를 공통 런타임 허용 목록에 추가했다. 기본값·기존 표현은 유지하며 새 표현은 선택했을 때만 사용한다. V1/V2/공개 런타임은 같은 형식 1로 저장한 새 선택을 읽는다.
- `scene-accents.mjs`는 사진첩 내부에 짧은 나비 선을 한 번 추가하고 영수증을 스크롤에 맞춰 보여준다. 모션 감소/끄기/대화상자/탭 숨김과 키보드 정보 접근을 지킨다. 사진 노드·음악·입력 상태는 재생성하지 않는다.
- 196개 기존 공개 파일을 바이트 보존하고 새 선택을 위한 published 런타임 8개만 수정, CSS/JS 2개를 추가했다. VER5.6/v6·기존 사진/음악은 동일하다. 상세: `docs/invitation-studio/v2-scenes/README.md`.

**다음:** 새로운 데이터가 필요한 장면은 기존 운영 방명록·사진을 변형하지 말고 별도의 명시적 계약으로 구현한다.

## 2026-10-31 — V2 분석 범위

- 사용자는 첨부 고도화 명세에 대해 우선 분석과 구현 계획만 요청했다. 이번에는 앱 구현·운영 데이터·배포를 변경하지 않는다.
- 현재 화면 2개와 소스를 대조한 계획은 `docs/invitation-studio/v2-analysis/PLAN.md`에 있다. 별도 보호된 `/lab/studio-v2/`의 장면 목록·큰 미리보기·통합 설정을 권장하며 V1을 보존한다.
- 새 가시성·미디어·데이터는 기존 형식을 그대로 사용할 수 있다고 가정하지 않는다. 사용자 기존 선호인 한 사진첩·설명 없음·RSVP 제외와 손글씨/음악·두 회원 관리·명시적 공개를 유지한다.
- 다음 구현은 편집기 기본 동선과 기존 저장 호환부터 시작하고 하객용 신규 연출은 후속 단계로 나눈다.

## 2026-10-31 — 공동 저장·공개 요청의 범위

- 사용자가 wedding과 스튜디오의 공동 저장 및 공개 연결을 승인했다. 기존 연구용 buildApp/demo 경로는 계속 demo이며 URL/import/parent 메시지로 운영 모드를 켤 수 없다.
- `scripts/build-invitation-connected.mjs`만 별도의 운영 하객 entry와 보호된 관리 번들을 만든다. draft와 published는 서버에서 분리하며 공개하기/복원 버튼의 확인 단계에서만 공개본을 변경한다.
- 기존 로컬 보관함/IndexedDB는 자동 이관·삭제하지 않는다. 사용자 명시적 공동 저장만 업로드한다. 운영 QA 쓰기는 금지하고 합성 서버 및 Emulator를 쓴다.
