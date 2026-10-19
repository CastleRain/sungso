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

Baseline 3a62429: GitHub Pages workflow 39286455326 completed successfully. VER3.1 production results are added after push.
