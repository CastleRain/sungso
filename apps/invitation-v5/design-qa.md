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
