# Glass suite implementation

## Recovery baseline
- Source: origin/master at `5c5b192` (2026-11-03); includes the latest public-data updates.
- Work branch: `codex/glass-suite-20261103`.
- Immutable starting checkpoint: `glass-suite-baseline-20261103`.
- Existing working directories and their uncommitted changes remain untouched.
- This checkpoint changes documentation and synthetic design references only.

## Current authorization
The user requested a commit and push BEFORE development, then the entire sprint plan, with a separate verified commit for the home and every service. Push service checkpoints to this work branch. Public Pages deployment is separate; this branch does not trigger the master deployment workflow.

Newest requirements supersede the older font clause in PLAN.md:
- Preserve the original mode's structure and workflow.
- Use the bundled Pretendard Variable for management UI in BOTH modes, including controls, dialogs and calendars.
- Eliminate unstyled browser controls through consistent components; keep keyboard, validation and date semantics.
- Glass starts light and matches the selected two-column navigation with the light per-app references.
- Keep private data, API contracts, calculation, permissions and draft state unchanged.
- Public invitations VER2–5, their embedded content typography and management endpoints remain excluded.
- Practical improvements are allowed within these workflows; no new cloud migrations, data seeding or unrelated product expansion.

## Commit boundaries
Common foundation first, then one commit per service: hub, dates, wecost, homehunt, homehunt-v2, travel, honeymoon, wedding, invitation, table, footprints, journey, sohee-workspace, sohee-sales. Each service commit includes its styles/adapter and relevant validation. Shared components are not repeatedly changed inside app commits.

A single app can be reverted with `git revert <service-commit>`; retain its common foundation. If follow-up fixes touch that app, revert them newest first too. Revert shared foundation only after its dependent service changes. Do not use hard reset or force push to rewrite shared history. Recorded state and database writes are not Git artifacts and are not rolled back by source reverts.

## Verification
Use the existing synthetic member/auth/store fixtures and emulator tests, with no production writes or extra provider calls. Run each scope's meaningful checks, browser primary flows at 1440/390px, and final site/build/regression checks. Keep private captures under ignored .local. References in this folder are synthetic image concepts, not production screenshots.

## Sprint status
- Pre-development remote checkpoint: pending commit/push.
- Sprint 0: source inventory completed in PLAN.md; actual baseline capture and route checks pending.
- Sprint 1–7: not started.

Service commits and their verification are recorded in CHECKPOINTS.md.

