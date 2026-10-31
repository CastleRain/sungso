# Invitation Studio

- Additive composition preview only at `/lab/studio/`. Preserve all 205 previously deployed files byte-for-byte.
- Arrival/transport, recipient accounts, guestbook, and reactive quick dock retain their approved functions and persistent nodes; their visual presentations are independently selectable (user request 2026-10-29). Existing links default to the original F presentations.
- Selectable cover, invitation, date, story, and album scenes may change; preserve original handwriting, audio, real photos, fonts, wedding facts, and known story.
- Build-selected demo data only. No URL, parent message, storage, or imported configuration may enable production writes. Guestbook local to this studio; never store real accounts or authentication data.
- Native vertical scrolling, mobile layouts, keyboard focus, reduced motion, effects-off, hidden tabs, and dialog suspension are required.
- Keep composition schema versioned and allowlisted. Save choices locally and in shareable URLs, without collecting guest information.
- Record observations and limitations in docs/invitation-studio and project progress.

## 2026-10-31 — 공동 저장·공개 요청의 범위

- 사용자가 wedding과 스튜디오의 공동 저장 및 공개 연결을 승인했다. 기존 연구용 buildApp/demo 경로는 계속 demo이며 URL/import/parent 메시지로 운영 모드를 켤 수 없다.
- `scripts/build-invitation-connected.mjs`만 별도의 운영 하객 entry와 보호된 관리 번들을 만든다. draft와 published는 서버에서 분리하며 공개하기/복원 버튼의 확인 단계에서만 공개본을 변경한다.
- 기존 로컬 보관함/IndexedDB는 자동 이관·삭제하지 않는다. 사용자 명시적 공동 저장만 업로드한다. 운영 QA 쓰기는 금지하고 합성 서버 및 Emulator를 쓴다.
