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
