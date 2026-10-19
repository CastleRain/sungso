# VER3 — selected Porto reference / implementation QA

**final result: passed**

## Target and scope

The user explicitly rejected the olive/cream concepts and the subsequent bold Korean sans posters, selected white with blue accents, and identified `https://toourguest.com/preview/porto` as the desired photo-and-script reference. This is a visual adaptation using the user's photos and content, not a pixel-for-pixel clone of the vendor's template.

- Source visual truth: `C:/Users/c/Desktop/sungso/docs/invitation-v3-review/reference-porto-mobile.png` and `reference-porto-letter.png`.
- Implementation: `http://127.0.0.1:8024/sungso/invitation-v3/`.
- Final screenshots: same evidence folder, `mobile-final-390.png`, `letter-390.png`, `full-mobile-390.png`, `calendar-390.png`, `map-390.png`, `story-390.png`, `mobile-320.png`, `mobile-430.png`, `desktop-1440.png`.
- Full-view comparisons, opened together: `hero-comparison.jpg`, `body-comparison.jpg`.
- Focused lettering comparison, opened together: `type-comparison.jpg`.

## Dimensions and state

The in-app browser was requested at 390×844. Its native desktop scrollbar leaves a 375px content width; screenshot output captures the 375×812 visible content surface. Source and final hero/body comparison images are both exactly 375×812, no density rescaling. Device scale is the default and both are captured with the same browser pipeline. No phone frame was introduced because the requested deliverable is an existing-project static GitHub Pages website.

Hero state: settled lettering, music paused, all text visible. Body state: invitation paragraph in view. The comparison uses matching content roles rather than identical words, because the user requested shorter copy and their own photographs. The source photograph, ornamental frame, animated petals and poem are intentionally replaced/omitted.

| Requested viewport | Content client / scroll width | Hero height / sheet |
| --- | --- | --- |
| 320×700 | 305 / 305 | hero 602px |
| 390×844 | 375 / 375 | hero 725.83px |
| 430×932 | 415 / 415 | hero 801.52px |
| 1440×1000 | 1425 / 1425 | sheet 480px |

The smaller 305px content case is narrower than the requested 320px mobile minimum and still has no horizontal overflow or title clipping. The full mobile screenshot is 375×6798 with all six gallery images loaded. Desktop capture is 1425×990. Native screenshot/viewport height differences are recorded instead of being treated as layout defects.

## Comparison history and fixes

1. Initial implementation inspection found [P2] long script clipping at the phone edge and lettering/name/date crossing the couple's heads and pale shirts. The initial desktop evidence is `hero-first.png`; the initial phone state was inspected in the browser. Result remained blocked.
2. Reduced the title from the initial 11.9vw/57px maximum to 10.15vw/47px, tightened the lettering group, removed the redundant overline and moved it to the upper forest area. Names/date now sit in the dark foliage. The photo itself is unchanged. Re-captured `hero-revised-390.png`, `mobile-final-390.png`, 320/430/desktop views; compared final source and implementation together. No clipping or head overlap remains.
3. [P2] review of the optional account state found the hidden section could take active-navigation priority. Filtered hidden sections out of navigation. The currently empty account panel and its link remain hidden. Existing member authentication and private-data contracts are not touched.
4. Source body capture was initially mid-reveal; recaptured after its animation settled and regenerated `body-comparison.jpg`. Both source and implementation now show readable body text in the same comparison input.

## Required fidelity surfaces

- **Fonts / typography:** inspected the real source DOM: Dulcinea at 36px/400 with 40px leading on the hero, SUIT at 15.2px/400 and 28.8px leading in the body. Implementation uses licensed Pinyon Script (not claimed to be Dulcinea), and actual self-hosted SUIT Regular/Medium. Browser computed family and `document.fonts.check` confirm loading. The script is a similar flowing calligraphic style; Korean text remains 15px/400, not the rejected heavy poster type. Source and adaptation are intentionally different in exact letterforms and script vertical position; the chosen position protects the user's photograph and legibility. No system-font fallback was active during captures.
- **Spacing / rhythm:** generous white invitation margins, small names/date, photo-led cover and continuous sections. Practical date/map controls use light rules and modest tints. Full-page and 320/430/desktop views have no horizontal overflow. English section lettering remains secondary to the photos, without dense feature grids.
- **Color / tokens:** white surfaces, blue `#2857cf` headings/actions, dark readable body text. No olive UI, yellowed paper, grain or botanical illustration. Green is the real user's forest photo, not a UI theme. White hero lettering has a restrained shadow against the photo. Focus states and selected date/story states are visible.
- **Image quality:** six actual user-selected photographs. Existing WebP variants retained, forest source reduced to 640/960/1440 with EXIF counts 0. No generated faces, recoloring, vendor photos, fake map artwork or substitute assets. Existing Bootstrap icon originals and MIT license retained. Main photo crops keep the couple visible.
- **Copy / content:** short invitation written for this couple; no poem or invented relationship history. Correct 2027-03-06 Saturday 15:30 KST, Mokhwa 15F Bellis hall and address. Unconfirmed parent names/accounts/Q&A/promises are hidden. Parking/meal terms are not invented. Footer thanks and practical labels are consistent with the restrained tone.

## Functional browser verification

- Cover → invitation anchor, photo-story next/previous and keyboard ArrowRight selection with picture/caption/pressed state synchronized.
- Gallery opens correct photo 02/06, advances to 03/06, Escape closes and restores focus to the triggering photo button.
- Calendar tab shows Monday March 1 and Saturday March 6; keyboard moves back to countdown. Countdown pause state works and calendar-day arithmetic is covered by tests.
- ICS download completed to the host Downloads folder. SHA-256 of the downloaded file equals the generated source; CRLF, UTC 06:30 (KST 15:30), venue and unknown end-time omission verified in tests.
- Music starts only on button click, pressed/status states update; volume keyboard controls and pause/settings closing work. Final playback is off and volume restored to 25%.
- Official Kakao iframe loads, venue marker is correct, zoom and reset controls work, loading overlay hides. Address-copy action reports success. Map app links carry the venue name or confirmed Kakao place ID.
- FAQ disclosure expands with the correct floor and time. No empty account or Q&A content is shown.
- Motion toggle works; CSS respects reduced-motion preference. Default effect is restored to on after QA. No production data access or writes.
- Browser console error/warning collection returned 0. Node syntax and 14 app tests passed.

## Remaining test limits / follow-up polish

- Physical phone gesture handling, real speaker quality, OS share sheet and importing ICS into a calendar app were not independently tested.
- Clipboard action feedback reports success, but the browser clipboard adapter returned a previously stored local URL rather than an independently verifiable OS readback. Treat actual OS clipboard contents as unverified; source handler receives the correct configured address. No claim of OS clipboard verification is made.
- No actual account number has been provided; ready-account filtering is unit-tested and copy handlers are wired, but no real bank/account copy was exercised.
- Exact Dulcinea letterforms differ from Pinyon Script. A licensed original could replace the font later if the user wants an exact typeface match; no purchase is required for the current working preview.
- This local app is not registered for production or published. Root-wide release checks are not claimed for this isolated preview. All existing public/member apps remain unchanged.

No actionable visual P0/P1/P2 findings remain. Next review is the user's assessment of lettering size and placement on their own photos.
