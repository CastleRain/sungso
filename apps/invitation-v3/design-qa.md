# Invitation VER3.5 — full-photo ink opening

Local implementation passed; production verification follows in the calling workspace.

- Mobile hero height equals viewport: 568/844/932px at widths320/390/430. Desktop1440×884 keeps the centered480px invitation and812px hero. All inspected widths have no document overflow; title/names/date stay within the hero and faces remain clear.
- 19 original Pinyon font outline glyphs, traced centerline SVG masks, ~5.1s sequential ink. Actual first-glyph partial stroke-dashoffset0.586923 while next glyphs remain1 and final seals0; completed offsets0/seals1. Replay returns scrollY0. Motion off shows the complete letters and system reduced-motion styles disable animation. No bitmap lettering or generated couple image.
- Title two lines; names23px (small phone21), date18px (small phone16–17), Korean time14px (short phone12), photo overlay and text shadow. First viewport contains only the photograph and its overlay controls/text.
- One music note control is fixed top10px on mobile, aligned inside the invitation top46px on desktop. Transparent/no player panel, no range input. White on photo, blue after scroll and on story. At scrollY1102: top10, onCoverfalse, rgb40/87/207. Actual MP3 plays while scrolling and on story; audio element count1. Native lightbox retains its own toggle.
- 18 app tests and full1917 tests passed; source references/syntax passed. No server, Firestore rules, production guestbook or album write changes were needed.
- Evidence in calling workspace docs/invitation-v3-review/full-photo-ink: ink-start-390.jpg, cover-320.jpg, cover-desktop.jpg, music-scrolled-390.jpg. Physical phone OS/browser chrome behavior remains a device check.

---

# Invitation VER3.4 — portal and private album

Local result: passed. Production verification follows after deployment.

- Shared blue/script direction and real photographs retained. Music dock is relative in document flow; settings expand below it instead of overlaying other sections. Audio stays outside the two views; only controls move.
- Story portal is a 240px two-leaf custom arched door. Actual intermediate matrix3d rotation observed. Escape cancels; effect-off opens directly. Native back/forward restores the main/story view while the same audio continues.
- Date tabs: 남은 시간 / 예식 달력. Album: 사진첩. No fixed six-photo claim or visible captions. Caption text fields removed from manager; only internal accessible alt text remains.
- Manager: existing member auth and deferred private script, token checked through response decoding, logout abort/cleanup. Public guest page imports no Firebase SDK or private manager entry. Firestore client tests reject reads/writes/queries to metadata and image documents even for approved clients.
- Local browser workflow: add two existing optimized real photos; publish8; reload both views; reorder/remove first -> publish7; uploaded full image opens at1067px; visible count06/07; archive restores original; remove uploaded duplicates and restore initial six in original order. Test data stays in excluded local JSON. No production upload/publish/guestbook write used for verification.
- Public metadata exposes only selected photos. Pending/private assets404, invalid/disabled/nonmember tokens rejected, stale revision conflicts preserve partner edits, retries idempotent, server strips APP metadata and enforces JPEG limits. Public JPEG save returns attachment. Seven server tests pass.
- Root checks1917, local references701, JS syntax213; Firestore Emulator58 tests pass; all Render/Firebase bundles build. One local run initially hit a pre-existing random forbidden test port; rerun passed without changing tests.
- Actual guest view320/390/430/1440px: no horizontal overflow, three self-hosted fonts loaded, relative music dock and240px door fit. Manager320/390/430/1440px: no horizontal overflow and all photo buttons >=44px. No description inputs; private library assets are loaded with two concurrent requests. Uploaded public thumbnails are visible-only/two at a time.
- Real mobile OS downloads/map/calendar/share and physical speaker playback remain device checks. Initial Render cold start can take time; errors preserve drafts and offer retry. Local preview harness is excluded from Pages; actual manage.html always authenticates.

Evidence: docs/invitation-v3-review/portal-album/ in the calling workspace, including portal-390.jpg and manage-no-captions-390.jpg. Older verification history follows.

---

# VER3.3 — audio-only music, one album and a separate story

**final result: passed (local); production verification follows after publishing**

- The user corrected the previous music removal and supplied an MP3, then explicitly requested the full playlist. The 1,346.089796-second file is preserved in length and encoded to 96kbps, 16,153,791 bytes, without embedded art/source metadata. A native looped audio element starts on the music button. There is no YouTube player, video request, extracted stream, or substitute song.
- Real browser audio currentTime advanced while opening the story, returning, navigating forward, opening the album and switching photographs. Pause/resume inside the modal, keyboard volume 35→36%, native loop flag and full duration were observed. Controller tests exercise failure/retry, cancellation during loading and stale completion/new-request races.
- The main page has exactly one six-photo album (3×2 thumbnail grid) and one enlargement dialog. Repeated photo story and ending image are removed. Parking/meal guidance is folded into location; map/calendar/guestbook/account contracts remain intact. At requested 390×844, old main height was 7,891px and new height 5,297px (~33% shorter); scrollbar makes actual content 375px wide.
- The #our-story view contains only the supplied facts: introduction at a coffee shop and the groom's decision while watching Sohee run her cafe. No meeting date, personal history or missing family/account detail was invented. Main/story titles and focus switch, Back/Forward, Escape, direct reload, return focus and reading effects work. Same-document views preserve the audio element and form DOM.
- 320/390/430/1440px main and story: no horizontal overflow. Fonts loaded, album 02/06 and keyboard End→06/06 worked; download control fits within 844px modal height. Existing countdown uses the unchanged core and rolling module. No production database writes.
- Final root check: 1,910 passed; 688 references; 208 JS syntax checks. App tests: 18 passed. Original sandbox check was blocked by local port EACCES; rerun with allowed local networking passed.

Evidence: calling workspace `docs/invitation-v3-review/story-audio/`. Physical iOS/Android audio policy, OS map/calendar/share and real account details remain device/user checks. Preview playback is intentionally opt-in; it does not falsely indicate autoplay.

---

# VER3.2 — typography, unboxed actions and countdown motion

**final result: passed (local implementation)**

User request: refine all typography; remove basic calendar/heart icons and box-shaped actions; animate the decreasing time; remove YouTube.

- Pinyon remains on the selected photo/script cover and section titles. Gowun Batang is now used for Korean text, names, labels and forms. Cormorant Garamond supplies the fine numerals and English small type. Official OFL files accompany compressed self-hosted WOFF2s (536,316 and 209,380 bytes). No generated/edited couple images.
- Date actions, guestbook write and footer sharing now use script lettering with readable Korean labels and a light underline. Filled button boxes, pill filters, form cards and calendar-date circle are removed. The public guestbook keeps explicit consent and validation; its write contract is unchanged. Official map icons stay recognizable.
- Real remaining time still comes from the same timezone-aware core. Only changed digits roll; temporary layers were observed with intermediate opacity/translation and cleaned on finish, pause and motion off. A paused value stayed unchanged across a long interval, then resumed to the actual current time. Countdown's accessible label contains the real value while duplicate visual layers are hidden from assistive reading.
- The progress line advances with seconds and resets immediately on a minute boundary. Offscreen/hidden/reduced-motion updates settle immediately. Midnight/event-time arithmetic remains covered by the existing core tests.
- YouTube section, toolbar, script loader, configuration and module are removed. New media regression guard ensures shipped HTML/JS do not request a YouTube player. A Kakao map iframe is still supported intentionally.
- 320/390/430/1440px: no horizontal overflow; new fonts loaded; script actions fit; counter pause/resume/motion off, date tabs, selection of 6, celebration feedback and link copy work. Calendar download and account data remain unchanged. Browser console: 0 errors. Full root check: 1,907 passed, 693 local references, 206 JS syntax checks.

Evidence in the calling workspace docs/invitation-v3-review/type-polish/: before-date.png, after-date-390.png, after-date-desktop.png, after-greeting-430.png, after-footer-390.png. Production checks are recorded in the calling workspace after deployment.

Remaining limits: physical phone OS map/calendar/share actions and actual account numbers remain for user review. No production test message was created. No P0/P1/P2 finding remains in the inspected views.

---

## Previous VER3.1 verification history

# Invitation VER3.1 — implementation and visual QA

**final result: passed (local implementation); production verification recorded below**

## Selected direction

User-selected Porto reference: https://toourguest.com/preview/porto .
White and clear blue, a real couple photograph, flowing English script, small names/date and restrained Korean SUIT. Pinyon Script is the licensed substitute, not the reference's Dulcinea. Existing six photographs and actual wedding facts are preserved.

## Comparison

The new cover keeps the same forest composition, lettering scale and blue palette as the published VER3 baseline. The flat music pill is now a small blue play circle, script track name, playback bars and a rounded volume panel. The title reveals word by word and can replay. Album filters and a thumbnail strip extend the existing photographs. Public guestbook and music sections use the same small Korean type, script headings and spacing.

Evidence in the working project's docs/invitation-v3-review/: upgrade-before.png, upgrade-mobile-390-cover.png, upgrade-mobile-320-cover.png, upgrade-mobile-430-cover.png, upgrade-mobile-album.png, upgrade-mobile-map.png, upgrade-mobile-guestbook.png. Screenshots show real browser output, including the labelled local-only guestbook.

## Verified behavior

- 320/390/430px requested mobile viewports: no horizontal document overflow, no clipped cover words, self-hosted Pinyon and SUIT loaded. Browser scrollbars reduce client width by 15px. Album modal, forms and map links fit this smaller content width.
- Native dialog album: category filters, six-photo thumbnail selection, 06/06 sea image, matching download URL, Escape close and focus return. Keyboard/swipe handlers remain present.
- Actual official Kakao preview map loaded. Three official map icons loaded at 44px. TMAP opens an explicit helper dialog and configured app-search link; address copy feedback succeeds.
- The user-specified YouTube video yhAJdMuR55c loaded in a visible 428x240 player on desktop. Player state became PLAYING, floating control became NOW PLAYING, pause worked, volume UI and correct playlist repeat parameters were verified. No audio extraction and no synthesizer substitution.
- Separate local JSON guestbook: blank state -> name + multiline literal <test> text -> public consent -> actual server acceptance. A new tab reads the same message; own-device delete dialog removes it; total returns to zero. No production message was posted.
- Form inputs are 16px to avoid iOS zoom. Errors preserve the draft and retry ID. New public API contract tests cover Unicode bounds, XSS-safe text DTO, idempotency, own-delete proof, quotas, concurrent daily limit, pagination, storage failures, origin/body caps and preservation of private API authentication.
- Motion off leaves all title words visible. System reduced-motion CSS is retained. Root check: 1,906 tests; static references and JavaScript syntax passed. All Render/Firebase bundles built successfully.

## Findings fixed

- The first body anchor stopped 32px below the cover due to scroll padding; the quick navigation threshold now accounts for that gap.
- Playback state now updates both music controls.
- Local JSON preview storage is explicitly excluded from Git and site output.
- No new P0/P1/P2 visual issue remains in inspected views.

## Limits

Physical phone app handoff, OS calendar import, actual OS clipboard readback and speaker quality remain unverified. Music is the user's selected full playlist video, not an independently extracted single track. Actual account numbers are still pending and the empty section is hidden. Browser preview test messages were removed. Production guestbook writes are deliberately not exercised by QA.

## Production

Baseline 3a62429: GitHub Pages workflow 39286455326 completed successfully. VER3.1.1 production verification is recorded below.


### Production verification — 2026-10-20

- Final UI source db47b0d: [Pages workflow 39290367818](https://github.com/CastleRain/sungso/actions/runs/39290367818) validate/deploy both successful. Feature release 885fccb workflow39289986029 also successful; Node22 CI includes all site/service/research checks.
- 21 published files (HTML, scripts, fonts, icons and six photographs) returned200 and matched local content; text comparisons normalize line endings only. No runtime/member backend file is copied into Pages.
- Live public GET /api/invitation/v3/guestbook returned200 with an empty list and correct castlerain.github.io CORS header. Existing private /api/health remained401 AUTH_REQUIRED. No production message was created/deleted.
- Real public browser: v3.1.1 modules and fonts loaded, no horizontal overflow or console errors, public guestbook loaded0 messages and the consent form. Local-preview label is hidden. Official YouTube player uses the selected video/loop configuration. Starting music keeps the current cover position.
- Final screenshots: public-mobile-guestbook.png and public-mobile-cover.png under the working project's docs/invitation-v3-review/.

Next: fill only the actual account/parent details the couple provides, and review OS map/calendar/share behavior on their own phones.
