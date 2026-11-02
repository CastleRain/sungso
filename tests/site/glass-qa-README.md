# Glass suite QA harness

This harness serves built public `dist` files, with synthetic SDK responses and in-memory data. It does not serve source folders or import private reference files. The actual app entry, membership gate, storage/calculation and event handlers still run. It is a UI integration fixture, not a replacement for Firebase Emulator or provider contract tests.

## Start

From the implementation worktree, after `npm ci` and `npm run build`:

```powershell
node tests/site/glass-qa-server.mjs
node tests/site/glass-qa-server.mjs --baseline
```

Run the two commands in separate terminals (or hidden background processes). Current: `http://127.0.0.1:8785/sungso/`. Baseline: `http://127.0.0.1:8786/sungso/`. `GLASS_QA_PORT` overrides either port. The baseline option requires the ignored `.local/glass-qa/baseline/dist/` snapshot made before implementation. It never overwrites that snapshot.

The 14 entry paths are `/sungso/`, then `wecost/`, `homehunt/`, `homehunt-v2/`, `honeymoon/`, `travel/`, `dates/`, `invitation/`, `journey/`, `table/`, `footprints/`, `wedding/`, `sohee/`, `sohee/sales/` beneath `/sungso/`.

Each origin defaults to synthetic 성우. `?qaActor=sohee`, `?qaActor=nonmember` and `?qaActor=signed-out` select other states. The small QA badge expands account controls, next-write failure, remote-home conflict, member revocation and restoration. `/__qa/state` reports the current origin's synthetic counters. Browser state and in-memory DB are isolated between the baseline and current ports. Restarting resets server data; life records remain in that port's localStorage until its QA browser data is cleared.

## Data and safe scope

- Home/Dates: four relative-date events, eleven invented notes and a default home layout. Add/edit/pin/delete and custom home transactions only touch memory.
- WeCost: invented wedding/travel costs, savings, one loan, an adjustment and three fixed costs. All amounts are placeholders.
- HomeHunt: each fake member has an invented visit in their cloud snapshot. The existing app intentionally does not restore cloud records on login: open 연결 → 클라우드 기록으로 이 기기 복원 to load the fixture into this QA origin after finishing any local draft check. Naver API is a UI-only substitute. Health/quota are synthetic; provider search/geocode/commute requests cannot reach a real provider and return an explicit unavailable response. Existing front-end calculations remain real.
- Travel: seven synthetic trip days, hotel choices and budget; the reference `bodyHtml` uses existing public test fixture markup and all eight view IDs. This preserves handler wiring but does not reproduce actual private reservation text/photos or exact content density.
- Honeymoon: four fictional resorts, independent picks and a fresh synthetic FX record, preventing automatic FX refresh. Google iframe, Naver SDK, Leaflet tiles and MapLibre style are local substitutes. Map overlays/controls can be checked, geographic accuracy cannot.
- Journey: original in-memory Journey API/store, synthetic timeline, tracks and a local test JPEG. Dates range from 2023 to 2026; October 18, 2026 has detailed records. No real transport or photo storage is contacted.
- Table/Footprints/Wedding: validated synthetic records seeded only for `qa-sungwoo` and `qa-sohee` if their QA-origin local storage is empty. Guests are explicitly named 예시 하객 A/B.
- Sales: existing public cafe fixture, packed in the real manifest/chunk/SHA-256 format. Imported originals and financial records are placeholders. Local refresh status is read-only, and provider/import endpoints remain blocked. Menu-rule transactions can be exercised in memory.
- Invitation selection: blank synthetic shared favorites/selection with revision semantics. Public invitation VER2–5 pages are outside this glass review scope.

`connect-src 'self'` blocks remote DB/API/fetch traffic. External scripts are restricted to static UI CDNs, and Firebase imports are rewritten to local fixtures. External map/photo images and cross-origin frames are blocked or replaced. The server binds to loopback, rejects non-loopback Host values and cross-origin mutations, and has no remote proxy, private input flag, production SDK or persistence writer. A local fixture is not security-rule emulation: keep emulator/security tests separate.

## Verification

```powershell
node --test tests/site/glass-qa.test.mjs
```

The two HTTP tests cover entry availability, SDK substitutions, authorization rejection, sales digest, transaction conflict/failure, Journey fixtures, read-only sales status and blocked providers. The baseline test skips when the local ignored snapshot is absent. They do **not** claim browser screenshots, layout parity, visual quality, native CDN behavior or production integration were checked. On Windows sandbox `EACCES`, allow localhost connections and run the same test command.

Browser QA should cover basic → light glass → basic without losing drafts, reload persistence, app/tab navigation, representative edits and cancellation, keyboard focus/Escape, 1440/390/320 widths, visible empty/error states, and console/resource inspection. Keep captures and notes in ignored `.local/glass-qa/` and label them synthetic.
