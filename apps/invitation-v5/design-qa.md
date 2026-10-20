# VER5 design QA

final result: passed

Reference: https://toourguest.com/preview/seychelles (2026-10-20)
Implementation: /sungso/invitation-v5/, version 5.0.0
Evidence: C:/Users/c/Desktop/sungso/docs/invitation-v5-review/

## Compared surfaces

Source desktop/mobile, contacts and bride tab, expanded accounts, carousel/fullscreen image, message form, RSVP/attendance choice, timeline, location, story and share sections were observed. `comparison-mobile.png` places the source and final implementation together. Source captures and DOM/asset inventories precede implementation. Final mobile captures include `v5-mobile-top.png`, `v5-mobile-full.png`, `v5-date.png`, `v5-about.png`, `v5-location.png`, `v5-rsvp.png`, `v5-story.png`.

## Findings and fixes

- Typography: initial Italiana was too heavy. Replaced it with OFL Antic Didone; tuned headline to 64px within a 72px line and body to locally hosted SUIT. Original commercial AbramoSerif/SometimesTimes are deliberately not bundled. Font outlines are a known remaining difference, not an identical-font claim.
- Cover: original mobile inset24px, heading top64px, image top200px, 327×490.5px at390px viewport (15px desktop scrollbar) reproduced. Desktop paper400px/top48px/24px top corners. User's real photo preserves its own composition and colors; source people are not reused.
- Spacing/layout: alternating gray/white sections, profile cards, centered calendar, four countdown cards, alternating timeline, horizontal carousel/peeks, source-like dialogs retained. No duplicate album grid. Missing actual optional sections are not filled with source couple's sample facts.
- Colors: warm gray #ede7e3, off-white #fafafa/#f3efed, taupe controls retained. Small action text changed to dark ink to improve contrast. Final photo had an abrupt gradient boundary; replaced with image alpha gradient to the taupe background.
- Icons/assets: source-observed functional SVG icons and white petal images used with provenance; official map app icons retained. Map iframe expanded to300px so Kakao attribution/controller remains visible. Separate app links are the user's requested exception.
- Responsive: 320×568,390×844,430×932 and1440×1000 tested; document scroll widths305/375/415/1425, no horizontal overflow. Small mobile retains natural cover height when content exceeds viewport. Music target44px remains top-right and is inset into the desktop cover on first visit.
- Interaction: carousel next/fullscreen next/close/focus return, story open/close with one continuous audio element, clipboard link/address actual content, TMAP explanatory popup, calendar link, local message POST and RSVP POST success verified. Guestbook test data is confined to local preview, never production.
- Motion/accessibility: reveal/number rolling/petals, explicit effects toggle and CSS prefers-reduced-motion handling. Semantic buttons/labels, dialog escape/close and focus return. Browser autoplay blocking falls back to first gesture, explicit pause is respected.
- Public album management preserves existing two-member authentication and shared v3 album/guestbook data. RSVP success is server-backed; management entry defers to existing member boot, private data is cleared on account change.

## Automated evidence

- Root check: 1,950 tests passed; 828 local references and240 JavaScript files.
- Service builds passed.
- Actual demo-homehunt Firestore Emulator:59 tests passed, including anonymous/outsider/both-member denial of direct RSVP document reads/writes/listing. Render/API tests verify public availability-only GET, protected management, idempotent submission/edit proof, input limits, expiry/cleanup and unchanged legacy401.
- Browser console errors: none in observed main-page flows.

## Deliberate differences and practical limits

Commercial display fonts substituted as above. Personal names/story/date/venue/photos changed to actual couple data. Account/contact/meal/reception/spots UI is conditional on real supplied values, so currently absent. Vendor sample toolbar, advertisements and flower purchases omitted. Native system sharing replaces a Kakao SDK button because no application key was supplied. Original password field for messages replaced with existing own-device deletion proof. Device-specific map launching/calendar importing/native share and production authenticated RSVP list remain real-device/account checks; production submissions are not fabricated for QA.

## Public release verification

Commit e9ed9d6c86d3f7c5df43ea88c6c5f1ed8c7f9ba6 deployed successfully in Pages run39436500078. Public assets match the built files; VER3/4 stay unchanged. Public390px browser verified fonts, no overflow, album2→3/6 navigation, guestbook/RSVP dialogs, music after a gesture, official Kakao map and zero observed console errors. Render availability returns200 with available:true; anonymous management returns401. No production test submissions or private document contents inspected. Authenticated response management and native OS integrations remain the practical checks stated above.

## VER5.1 — requested blue and editorial motion

User explicitly requested blue mixed into the warm palette and handwritten/scrolling text. Preserve the arch, photography and content order; supersede exact-reference palette and hero typography with warm-white to sky-blue, blue ink and vector Pinyon With love. Antic Didone remains on section headings. No new unrelated layout or backend changes.

Verified 320/390/430/1440px with no horizontal overflow; actual ink middle frame first stroke0.94, remaining strokes1; date scroll Y1866→2161 produces X−2.57→10.02px and scale0.992→1.031. Effects-off leaves zero hidden lettering/lines, no date transform and complete ink; console errors0. Core check1,950 passed,829 local references,241 JS files. No production writes. Phone OS reduced-motion switching remains a device check; CSS media query and JS change listener both implemented.

Result: passed. Evidence: docs/invitation-v5-review/blue-cover.png and blue-date.png.

VER5.1 release f6cd28a deployed successfully via Pages39439810691. Public browser confirms body5.1.0, final muted#5f7085, live ink stroke0.94/next1, no horizontal overflow or console errors. Supporting text contrast4.54:1; replay5.0:1.

## VER5.2 — dark handwriting opening and a shorter flow

User explicitly requested a dark, briefly scroll-locked opening, fast handwriting, a transient music-ready notice, a butterfly, a full-photo cover with readable names/date, restrained blue, no RSVP, and story immediately after the timeline. The follow-up removes the oversized MARCH 06 2027 scene because Wedding Day already contains the actual date.

Implemented Pinyon vector “We are getting married” in two lines (~2 seconds), then a 1.1-second veil fade and names/date reveal. The existing date-balloon photograph fills the mobile viewport. Warm white and muted blue-grey #4a6378 replace saturated blue panels. The butterfly sits in the scroll anchor; the fixed music control switches to a translucent white outline over the photo. Notice text is triggered only by usable audio data, then disappears. Existing full MP3/autoplay-attempt/gesture fallback/explicit stop behavior is preserved.

The large date scene and its scroll code are removed. Actual Korean date and time in Wedding Day reveal in sequence. Story follows timeline; public RSVP markup/import is gone while existing authenticated management/API/data remain intact. Lower headings, paragraphs, sharing and closing photograph use reveal or scroll movement. There is one dynamic album.

Browser evidence: 320×568,390×844,430×932,1440×1000 show no horizontal overflow; names/date remain inside the photo. Early root overflow:hidden, veil opacity .85 and partial stroke (.87 with following strokes at1) were observed while a scroll attempt kept Y=0. Normal completion, Escape and skip unlock; skip restores focus to replay. The stable scrollbar gutter keeps paper width375 before and after unlocking at390px. Direct #location lands at top without a lock. Effects-off reload shows all text, no butterfly animation and no opening. Actual music-ready text appears and disappears. Story opens/closes, photo advances1→2/6, guestbook composer opens without submission. Console errors0. Final Wedding Day follows the full photo, with both date lines reaching opacity1. Device OS reduced-motion switching and native map/calendar integration remain real-phone checks.

The early boot includes a 4.5-second fail-open deadline if modules fail, plus pagehide/visibility/focus exit handling. These failure guards were inspected; the error path was not forced through the live browser.

Root check: 1,950 passed,829 local references,242 JavaScript files. One first-run pre-existing server test selected an ephemeral port rejected by Node fetch (“bad port”); unchanged retry and the final post-edit full run both passed. No production writes and no VER3/4 source changes.

Result: passed locally. Evidence: docs/invitation-v5-review/v5-2-opening.png, v5-2-cover.png, v5-2-wedding-day.png. Public release verification follows deployment.

VER5.2 public verification (2026-10-21): commit55f4148, Pages39444453545 validate/deploy success. Public body5.2.0, initial intro lock/ink/veil, completed cover details opacity1, ready notice disappearance, scroll release, muted ink and timeline/story adjacency verified. Large date scene and guest RSVP absent. Public390px no overflow, fixed sound dock top8px after scrolling, console errors0. Six served HTML/CSS/JS contents match local dist after CRLF/LF normalization. Screenshot: docs/invitation-v5-review/v5-2-public-cover.png. Result: passed.

## VER5.3 — accounts and music

Scope: four account groups, existing two-member Google management, digits-only copy and optional allowlisted KakaoPay link. Reference account flow captured at TO OUR GUEST Seychelles; Gensdesign and Maison de Marie official feature descriptions confirm per-family accounts, copy and optional KakaoPay. No real payment or production account writes were made.

Local API + UI: filled six clearly marked sample numbers, saved, edited 123-001 to 987-654, reloaded to verify persistence, hid groom mother only and observed one remaining parent in the public group, then restored the six demo rows. Actual browser clipboard read 123002 after clicking copy. 320/390/430/1440px main page overflow false; copy targets 44px. Manager mobile390 and desktop1280 verified. Chrome first visit was blocked; visible music prompt started the single MP3 and disappeared; explicit pause survived the next account click. Replay absent; handwritten opening still unlocks. Private management uses delayed member boot and account cleanup. Local account API only; no real identifiers in screenshots.

Automated: server validation, real member gate with test identities, hidden draft filtering, direct-public-write denial, strict routes/CORS/request cap, optimistic concurrency and idempotency; actual demo-homehunt Emulator60 passes (both members, outsider and anonymous direct account get/write/list denied). Service builds passed. Final root check:1,961 tests,846 local references and246 JS syntax checks passed. Remote release results are appended after completion. iOS Safari/Kakao in-app autoplay and actual bank-app paste/transfer remain device checks.

VER5.3 public verification: 710930f, Pages39449675092 succeeded. Nine public files matched dist, local-only account preview returned404, live body5.3.0/music prompt and play/pause behavior passed, Replay absent. Public account API200 with revision0/empty groups; protected manage401; actual login screen hides the private form. No production writes.

## VER5.4 — account convenience and visual hierarchy

Compared four official services on2026-10-21:

| Source | Evidence | Decision |
| --- | --- | --- |
| [TO OUR GUEST Seychelles](https://toourguest.com/preview/seychelles) | Actual expanded groom accounts: couple/parents, copy and KakaoPay icons. Captured `accounts/toourguest-accounts.png`. | Keep six recipients and optional personal transfer links. |
| [FillTheSpace sample](https://fillthespace.co.kr/v/sample_invitation?preview=true) | Actual groom/bride switch and copy-complete feedback. Captured `accounts/fillthespace-accounts.png`. | Two family tabs make all recipients visible without opening four separate cards. |
| [Gensdesign](https://m.gensdesign.co.kr/board/free/read.html?board_no=5&no=24775) | Official account guide describes six accounts, grouping choices and optional KakaoPay transfer-code links. | Keep flexible account visibility and parent-level editing. |
| [Maison de Marie](https://maisondemarie.co.kr/) | Official feature list: couple/parents, one-touch copy, KakaoPay, folding. Marketing description, not an independently tested live transaction. | Copy remains the universal primary action; transfer links are optional. |

Our previous UI nested group/recipient/number cards with extra opening steps. Revised to flat, fine-rule rows, understated blue-grey family tabs, readable18px account digits and76×44px outlined copy targets. Recipient and bank stay adjacent to the number; copy success names the recipient and changes only the copied row to a check. Switching sides clears stale copy feedback. Optional KakaoPay has a small yellow pay label and opens only a supplied allowlisted link. No vendor recipient/sample facts, bank-launch URI guesses, automatic bank paste or payment processing are added.

Account tabs support arrows/Home/End and focus indication; tab/panel ARIA updates together. All account rows remain readable before enhancement. Explicit effects-off and reduced-motion remove tab-entry/check motion. Only the groom/bride selection key is kept in sessionStorage; no number/name/bank cache. On bank-app/page return, fresh API data replaces destinations; a reserved-height loading state avoids collapsing the section. Management preview uses identical rendering, supports side switching while editing, disables copy and removes payment hrefs.

Verified: all six sample recipients mapped to the correct side; bride digits123004 and mother123006 copied to the actual clipboard; Home/End/arrow focus and selected-panel changes; feedback clears on switching; copy targets76×44px. Main320/390/430/1440 widths show no horizontal overflow; desktop paper400px. Management preview preserves bride selection during edits, and a temporary example KakaoPay link renders with href removed/aria-disabled true then is cleared without saving. Production data never changed. Full check1,963 tests/849 references/247 JS passes. Browser reload/session-restoration and final visual captures follow below. Actual iOS/bank-app paste and payment remain user-device checks, not claimed here.

Final local verification: selected bride survives a reload, and its123004 copy succeeds afterward. Full final check remains1,963/849/247; no observed browser console errors. Evidence in `docs/invitation-v5-review/accounts/`: `v5-4-320.png`, `v5-4-desktop.png`, final mobile capture. Result: passed. Deployment confirmation follows.

VER5.4 public verification: f99664505f48c07787fa679a0faf0df8829df98f; Pages39453140637 completed success. All9 tested HTML/CSS/JS files match dist after newline normalization. Live body5.4.0, empty unconfigured account section hidden, no overflow/Replay/console errors; private accounts entry still shows authentication with its private root hidden and zero account form fields mounted. Final mobile screenshot: `docs/invitation-v5-review/accounts/v5-4-final-mobile.png` (local sample numbers). Result: passed.

## VER5.5 — family lines, typography and lightweight actions

Scope: account book, family names, all primary guest actions and supporting cards/dialogs. The existing photo/music/album/guestbook APIs remain unchanged.

Fresh comparisons (2026-10-21): [Seychelles](https://toourguest.com/preview/seychelles) has two family accordions with nested recipient cards, copy and optional KakaoPay; [Porto](https://toourguest.com/preview/porto) shows parents/relation/couple and a two-side contact dialog; [FillTheSpace](https://fillthespace.co.kr/v/sample_invitation?preview=true) exposes two side tabs and per-recipient copy. Our design retains explicit recipient targeting and optional payment links, but uses a flat ledger, understated underline actions and full Korean serif typography instead of the nested boxes. Vendor sample typography/assets were not imported.

Fonts: official NAVER MaruBuri archive converted to WOFF2, renamed Invitation Serif under OFL; Regular434784 bytes, SemiBold466408 bytes. Full character coverage retained for future family names and guest messages. Antic Didone and Pinyon remain. Both guest and private guest-preview rendering use the same account CSS/font declarations.

Verified locally: 320/390/430/1440px document widths305/375/415/1425 with no horizontal page overflow. Family wording uses user-authorized 아빠/엄마 placeholders. Account copy66×46px, keyboard Home switches groom, correct recipient feedback; actual paste into a local unsent composer gave123006. Clipboard tool returned a stale value on that secondary tab, so native paste was used as the stronger proof. 20-digit input in the local manager preview reflows without overflow, copy links remain disabled there, and temporary input was restored without saving. Composer and story dialog close/focus behavior verified. The 320px story dialog overflow from its negative-margin float close button was fixed; final client/scroll widths both290px.

Evidence: primary workspace `docs/invitation-v5-review/refine-accounts-390.png`, `refine-family-desktop.png`, `refine-seychelles-accounts.png`, `refine-fill-accounts.png`. Production account values remain empty/hidden; no production test writes or invented payment details. Native OS map/share/calendar behavior is unchanged and remains a real-device check. Public verification follows.

Final local check: 1,963 tests, 856 references, 247 JavaScript syntax checks passed. No observed browser errors. Motion-off leaves zero hidden reveal elements and was restored after verification. Result: passed.

VER5.5 public verification: commit b04eb0d220a16a207d1303d331ec1eb19efb4f42; Pages 39457140552 validate/deploy success. Eight served HTML/CSS/module/font assets match dist, including both full Korean WOFF2 files. Public body5.5.0, family labels, InvitationSerif font declarations, transparent primary actions, empty accounts hidden, no overflow and no observed browser errors verified. Screenshot: primary workspace `docs/invitation-v5-review/refine-public-family.png`; local account proof `refine-accounts-final.png`. Result: passed.
