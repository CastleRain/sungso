# Opening effects and editor scroll review — 2026-10-28

Checked the local built Studio with Chrome through supported browser UI controls. No production data or deployed files were changed by this review.

## Opening at 390 × 844

- `ink`: original 19 path masks begin at stroke offset 1 and finish at 0. Independent early boot releases the opening and leaves the names/date fully visible.
- `flow`: first line is complete while the second line still has offset 1. Its two wrapper transforms were observed at 420 → 159 → 0 user units. The original glyph positions and paths are retained.
- `bloom`: overlapping masks were observed at offsets 0 through 0.8569; line blur progresses 100 → 12/21 → 0, without leaving residual blur.
- `light`: the phrase clip progresses from right 103% through 51.45% to no clip; the pale glow goes 9px → 4.7px → none.
- All four end in `intro-complete`, names/date opacity 1, with no horizontal overflow. The completed cover keeps the same forest photo, handwritten wording, names, date, time and venue.
- Turning effects off in the visible UI and then opening `bloom` leaves the cover static, without wrappers or scroll lock. The setting was restored to effects on afterward.
- Chrome captured no error or warning messages during these checks.

Screenshots: `opening-flow.jpg`, `opening-bloom.jpg`, `opening-light.jpg` are actual intermediate frames, and `opening-complete.jpg` is the completed mobile cover.

## Editor scroll at 1100 × 884

Native coordinate clicks were used so the browser automation did not scroll labels into view before clicking:

1. Outer scrollY 0 → select preset 02 → 0 immediately and after settling.
2. Select preset 03 → 0; select the cinema cover radio → 0.
3. Native wheel intentionally moves the editor to scrollY 884.
4. Expand the date section → 884; select orbit → 884 immediately and after settling.
5. The iframe date section arrives at viewport top 19.8125px, confirming that only the invitation preview moved.

Evidence: `opening-editor-scroll.jpg`. The temporary Chrome viewport override was reset and the review tab was closed. IAB viewport and user tabs were untouched.

## Automated coverage

Seven focused opening tests pass: all four effects and original glyph masks, distinct motion, repeated replay cleanup, deep-link controller availability, effects-off/reduced/hidden behavior, skip/Escape/focus cleanup, and parsing or animation failure safety. Audio is not accessed by the opening controller, and replay does not reload the document. Mobile physical touch and OS-level reduced-motion rendering remain separate device checks.
