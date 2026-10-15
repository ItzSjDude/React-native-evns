# Hiva product backlog (TASKS.md)

Owner: Task-Builder. Written 2026-10-15 from a read-only audit of the app (`React-native-evns`, working tree incl. 83 uncommitted files)
and the backend `origin/main` 6a42e87 + onboarding branch (migration 086) in the scratchpad checkout. Every task cites code it was verified
against; anything not provable from code is marked **UNVERIFIED**. "BE" = gathr-api, "FE" = this app. Absolute paths are relative to each repo root.

## 1. How this backlog works

**Status:** `TODO` -> `IN PROGRESS` -> `REVIEW` (QA/Sec reviewing) -> `DONE` (signed off). Also `BLOCKED (reason)`. Change status in place; never delete a task.
**USER-GATED** = needs the user's explicit approval or an account only the user holds (AWS deploy, DB migration on shared Neon, Play Console, Apple
Developer, AdMob, paid third-party plans, DNS/domains). Agents prepare the change and the exact command, then stop and ask.

**Per-feature loop (one feature at a time, in the order of section 3):**
1. Architect: reads the feature, writes/updates the contract in `docs/*_CONTRACT.md` (contracts first, per AGENTS.md), decides open questions, splits BE/FE.
2. Backend-Dev and Frontend-Dev implement in parallel against the contract. Feature code stays in `src/features/<name>/` with barrel `index.ts`; no deep imports.
3. QA-Engineer: runs `npm run typecheck`, `npm run lint`, `npm test`, the task's test plan, and a device/emulator pass where the task says so.
4. Security-Auditor: reviews the task's "Sec" notes plus authz, PII in logs, rate limits.
5. Sign-off: Architect marks tasks `DONE`, lists follow-ups; Task-Builder is re-invoked to append anything discovered.

**Appending tasks:** after each sign-off the Task-Builder re-reads "Discovered during implementation" (section 5), turns each entry into a task under the
right feature (or a new `F-xx` at the end), re-verifies against code, and re-prioritises. Agents add findings as one-liners in section 5 using the template there; they do
not edit other features' tasks. Priority: **P0** blocks shipping, **P1** needed for a credible launch, **P2** important follow-up, **P3** nice to have. Size: S (<1 day), M (1-3 days), L (>3 days).

## 2. Verified findings that changed the plan (older docs were wrong or stale)

| Claim in older docs | Reality (verified) |
| --- | --- |
| `BACKEND_GAPS_CONTRACT.md`: networking suggestions, host-studio series/speaker waitlist/analytics/presets, gift catalog + Play gifts, discount codes, CSV, webhooks, analyst role, broadcasts "missing" | All exist in BE (`src/routes/event.routes.js`, `hostStudio.routes.js`, `partyGift.routes.js`, `workspace.routes.js`). Still missing in BE: client analytics ingestion, extra privacy settings, `event-templates`, `GET /events/:id/networking` summary. |
| `FEATURES.md`: "Organiser dashboard (attendees, check-in, payouts)" works | FE calls 5 routes that exist on **no** BE branch: `GET /workspaces/:id/organizer-dashboard`, `.../events/:eid/organizer-summary`, `.../events/:eid/attendees`, `POST .../events/:eid/check-ins`, `GET /workspaces/:id/payouts` (`organizerService.ts:117-139`; BE `git log --all -S` finds nothing). |
| `FEATURES.md`: Nearby "geofence alerts" done | FE calls `GET/PUT /me/vibe-note-alerts` and `GET /vibe-notes/geofence-candidates` (`vibeNoteService.ts:23-30`); neither exists in BE. BE chose a different design: server-side matching on `POST /me/location` + `PATCH /me/settings {notifyVibeNotes}` (`docs/NEARBY_VIBES_GEOFENCING.md`). |
| `FEATURES.md`: Creator onboarding "Done" | FE calls `GET/PUT /creators/me/onboarding` (`creatorService.ts:15,23`), sending bank account + IFSC; BE has no such route (only `POST/PATCH /creators/me`, wallet, payout-requests) and no contract doc defines it. |
| BE `BACKEND_FEATURES.md`: posts have "save" | No save endpoint in `post.routes.js`; FE saves locally only (`home/savedPosts.ts`). |
| BE `BACKEND_FEATURES.md`: "Typing indicators are not implemented" | `API.md` s13 specifies a socket `typing` action handled by the **separate realtime service** (`wss://gathr-realtime...`), not in this repo. FE sends/receives it. Deployed behaviour **UNVERIFIED**. |
| `FEATURES.md`: ticket transfer in app; Settings has language | No FE transfer UI/calls (only a notification type). No language row in `SettingsScreen.tsx` although `/me/settings` supports `language` (en/hi/hinglish); app has zero i18n. |
| `FEATURES.md`: "Event tickets use Razorpay" | Paid event tickets are manual (organiser shares UPI/bank/link card in chat, `API.md` s5). Razorpay is only organiser ticket-credit purchase (`OrganizerCreditsScreen.tsx:165`). |
| `AUDIT_IMPROVEMENTS.md`: Nearby shows invented profiles; onboarding extras flag off | Stale. `Nearby.tsx` is API-backed; `SEND_PROFILE_EXTRAS` no longer exists, onboarding now sends the 4 fields and **throws** if the API does not echo them (`Onboarding.tsx:172-176`). Still true: paywall static prices (`PaywallSheet.tsx:42`) and age-range/similar-interest copy (`:31`; BE has neither filter). |
| `ONBOARDING_PROFILE_FIELDS_CONTRACT.md`: migration `064` | Real file is `086_onboarding_profile_fields.sql`. |
| Ads "Done" | AdMob app IDs in `app.json` are Google's sample IDs; prod native unit IDs unset -> production ads are off (`ads/adConfig.ts`). |
| (new) Paid events | BE only publishes/issues paid tickets when `workspace_payout_accounts.status='VERIFIED'` (`event.service.js:141`, `ticket.service.js:65`) and **no code ever sets VERIFIED** (grep of `src/`, `migrations/`). Paid ticketing is impossible in prod today. |

## 3. Recommended execution order

| # | Feature | Pri | Size | Repo | Depends on | Gate |
|---|---|---|---|---|---|---|
| 1 | F-01 Onboarding fields sync (086 + deploy + app guard) | P0 | S | both | - | USER-GATED (DB, deploy) |
| 2 | F-02 Docs hygiene (stale contracts/FEATURES) | P1 | S | both | - | - |
| 3 | F-03 Paywall and store-claim honesty | P0 | S | FE | - | - |
| 4 | F-04 Contract reconciliation (app calls with no route) | P0 | L | both | F-01 | Architect decision first |
| 5 | F-05 Paid-organiser eligibility (payout VERIFIED path) | P0 | M | BE | - | USER-GATED if provider is paid |
| 6 | F-06 Paid-event purchase in chat (attendee + organiser) | P0 | L | both | F-04, F-05 | - |
| 7 | F-07 Android release and signing hardening | P0 | M | FE | - | USER-GATED (keystore, Play) |
| 8 | F-08 Legal, privacy and store declarations | P0 | M | FE | - | USER-GATED (hosting, Play Console) |
| 9 | F-09 Test and CI infrastructure (lint, release build, e2e, contract check) | P1 | M | FE | F-04 (contract script) | - |
| 10 | F-10 Abuse protection and rate limits | P1 | M | BE | - | USER-GATED (deploy) |
| 11 | F-11 Local data wipe and PII at rest | P1 | S | FE | - | - |
| 12 | F-12 Observability, force-update, ops | P1 | M | both | F-10 | USER-GATED (AWS alarms) |
| 13 | F-13 Organiser event lifecycle and team | P1 | M | FE | F-04, F-05 | - |
| 14 | F-14 Offline scanner and check-in | P1 | L | FE | F-13 | - |
| 15 | F-15 Nearby alerts device verification | P1 | M | FE | F-04 | real device |
| 16 | F-16 iOS launch readiness | P1 (P0 if iOS ships) | L | both | F-08 | USER-GATED (Apple) |
| 17 | F-17 Tiers, discounts, attendee forms, ticket transfer | P2 | L | both | F-06 | - |
| 18 | F-18 Organiser insights and comms | P2 | L | FE | F-13 | - |
| 19 | F-19 Chat parity and robustness | P2 | L | both | F-06 | realtime service access |
| 20 | F-20 Settings and privacy expansion | P2 | M | both | - | USER-GATED (deploy) |
| 21 | F-21 Client funnel analytics and consent | P2 | M | both | F-08, F-12 | - |
| 22 | F-22 Performance baseline on device | P2 | M | FE | F-09 | real device |
| 23 | F-23 Accessibility, i18n, offline UX | P2 | L | FE | - | - |
| 24 | F-24 Creator and gifts follow-through | P2 | L | both | F-04 | - |
| 25 | F-25 Backend-ready features without app UI (series, waitlist, suggestions, arrival) | P3 | L | FE | - | - |
| 26 | F-26 Social/posts gaps | P3 | M | both | - | - |

---

## 4. Features and tasks

### F-01 Onboarding fields sync | both | P0 | S | deps: none
Why: FE onboarding sends `gender/country/profession/intent` and refuses to finish if `PATCH /auth/me` does not echo them. Deployed BE ignores unknown keys (non-strict
`updateProfile`, origin/main `auth.schema.js:32`) and returns 200 without them, so **every new user is stuck on the last step** until 086 is live.

- **F-01.1** [BE] `DONE (gathr-api #80)` Merge branch `feat/onboarding-profile-fields` to main via PR after the DB suites pass on PostGIS.
  - AC: CI (`.github/workflows/ci.yml`, postgis image) green; `tests/onboarding-profile.unit.test.js` plus a DB test: each enum value saved, invalid gender/intent -> 400, `null` clears, account deletion nulls all four (`user.repository.js` anonymize).
  - Edge: country 1-80 chars with unicode; profession whitespace-only -> 400; `intent` unknown value; PATCH with only new fields.
  - Sec: fields must never appear in `publicProfile` (whitelist at `profile.service.js:60-80`), `/nearby`, `/users/search`, party participants. Add regression test asserting absence. Treat as personal data in the privacy policy (F-08).
  - Test: unit + DB suite; curl matrix against local dev server.
- **F-01.2** [BE] `DONE (086 applied by the repo CI deploy, per owner; gathr-api #80)` **USER-GATED (needs user approval: DB migration on shared Neon).** Apply `086_onboarding_profile_fields.sql` to staging, verify, then prod.
  - AC: `npm run migrate:plan` lists exactly 086 (and shows whether both `085_*` files, `085_nearby_vibe_geofences` and `085_organiser_onboarding`, are applied: **UNVERIFIED**); `migrate:status` clean after; columns nullable, no table rewrite; rollback = forward fix (runner is forward-only).
  - Edge: two files share prefix 085 (runner keys by filename, fine, but confirm). Run in a low-traffic window.
- **F-01.3** [BE] `DONE (gathr-api #80, deployed)` **USER-GATED (needs user approval: AWS deploy).** Deploy API (`npm run deploy` stage) and smoke-test.
  - AC: `PATCH /auth/me` with 4 fields -> `GET /auth/me` returns them under `data.user`; admin panel still loads; deploy before any app build that contains the check.
- **F-01.4** [FE] `DONE (PR #21)` Release guard for the "API not updated" case (`Onboarding.tsx:172-176`).
  - AC: mismatch shows a specific message ("server update pending, try again later") not a generic one; `recordError` with context only (no field values); release checklist in `docs/` states "086 live before app release"; update `ONBOARDING_PROFILE_FIELDS_CONTRACT.md` (064 -> 086) and `FEATURES.md`.
  - Test: extend `__tests__/Onboarding*.test.tsx` with a stripped-response case.
  - Idea: use saved `intent` to route first-run (`host_room` -> Party create, `organise_events` -> organiser entry, `find_events` -> Events tab).
- **F-01.5** [FE] `TODO` Remove dead gender UI path or gate it: `Nearby.tsx` PersonRow reads `person.gender` but no BE endpoint returns it (and it should not without consent).
  - AC: no gender iconography unless Architect approves a consented field; types cleaned.

### F-02 Docs hygiene | both | P1 | S | deps: none
- **F-02.1** [FE+BE] `TODO` Correct the stale docs listed in section 2 so future agents are not misled.
  - AC: FEATURES.md (FE) statuses match section 2 (organiser dashboard, creator onboarding, geofence, transfer, language, Razorpay wording, ads); BACKEND_GAPS_CONTRACT.md re-dated with the "Missing" list reduced to items in section 2; BACKEND_PENDING_CONTRACT.md items 1 and 3 marked shipped, item 2 (unique index) open (see F-26.2); BE `BACKEND_FEATURES.md` fixes "save" and "typing" lines.
  - Test: reviewer spot-checks 5 random claims against code.

### F-03 Paywall and store-claim honesty | FE | P0 | S | deps: none
- **F-03.1** [FE] `DONE (PR #20)` Never show invented prices (`PaywallSheet.tsx:42,94`). When Play offers fail/load, show skeleton or "Prices unavailable" with Retry; disable purchase CTA.
  - AC: no `$` literals in production render path; CTA label "Retry" only when load failed; Restore/Terms/renewal copy stay visible; currency comes from Play (`formattedPrice`).
  - Edge: Play not installed/sandbox account; offers load slowly (timeout 10s); offline; iOS (billing returns false at `billing.ts:186`, so paywall must hide/explain, see F-16).
  - Test: update `PaywallSheet.test.tsx` (currently asserts retry-only CTA); add loading/failed/ready/offline cases.
- **F-03.2** [FE+BE] `DONE (PR #20)` Copy must match entitlements: line 31 advertises "age range, similar interests"; BE has neither (`grep minAge|similarInterests` in BE src: none).
  - AC: copy lists only city, language, interest, active now; or BE adds the filters (Architect decides; default = trim copy). Source plan features from `/me/subscription` entitlements where possible instead of constants.
  - Sec: if age filter is ever built, never expose DOB/exact age (see `EXPLORE_AND_PAYWALL_CONTRACT.md`).

### F-04 Contract reconciliation: app calls with no backend route | both | P0 | L | deps: F-01
Why: three FE areas call non-existent routes, so they 404 in production. Architect must pick, per area, "build BE" vs "change FE to existing BE" vs "hide until ready".
- **F-04.1** [Architect+QA] `DONE (PR #25)` Add an automated drift check: script that extracts `apiRequest(...)` paths from `src/**/*Service.ts` and diffs them against BE `tests/routes.json` (exists, used by `tests/coverage.js`).
  - AC: `npm run check:contract` (FE) fails on any FE path with no BE route; allowlist file with justification for each exception; wired into CI (F-09). Initial run reproduces the 7 gaps in section 2.
  - Edge: template-literal paths, module prefixes (`/waitlist`, `/tiers`, `/scanner`, `/transfer`), query strings.
- **F-04.2** [Architect] `DONE (PR #28 + gathr-api #84 attendees route)` Decide organiser dashboard path. Recommended: build BE per `ORGANIZER_DASHBOARD_API_CONTRACT.md` but reuse existing data: `GET /workspaces/:id/events/:eid/stats`, `/tickets`, `/scans`, `POST /workspaces/:id/tickets/verify` (existing, idempotent?) instead of a new `check-ins` route.
  - AC: written decision + updated contract; FE service maps to final routes.
- **F-04.3** [BE] `TODO` Implement agreed organiser read endpoints: overview, `organizer-summary`, attendees (min fields: name, ticket label, order ref, status, checkedInAt; no email/phone), payouts (masked account only).
  - AC: OWNER/ADMIN + `verification_status=APPROVED` + ACTIVE workspace enforced on every request (403/404 otherwise, event must belong to workspace); `limit` clamp 100; money integer minor units; ANALYST sees aggregates only; search term never logged; DB tests for IDOR (other workspace's event id), SCANNER/MEMBER 403, refunded/cancelled rows.
  - Sec: attendee list is PII; audit-log reads; rate limit (reuse `createRateLimit` prefix `organizer-dashboard`).
  - Test: new `tests/organizer-dashboard.test.js` following `organizer-tools.test.js`.
- **F-04.4** [Architect+BE+FE] `DECIDED: Nearby unchanged by owner; routes remain a gap in the drift allowlist` Decide Nearby vibe alerts. Option A (recommended, smaller): drop FE native geofence registration; FE sends fixes via existing `POST /me/location {lat,lng,accuracyMeters}` and exposes `notifyVibeNotes` from `/me/settings`. Option B: BE adds `/me/vibe-note-alerts` + `geofence-candidates` per `NEARBY_VIBES_GEOFENCING_CONTRACT.md` (exposes note centres to the device: privacy review).
  - AC: chosen option documented; FE calls only existing routes (or new BE ships first); Android/iOS native modules either used or removed (and `ACCESS_BACKGROUND_LOCATION` / iOS "Always" strings removed if Option A, which also shrinks F-08 Play review).
  - Sec: coordinates never in logs/analytics; sign-out clears registrations (`VibeNoteGeofenceModule`).
- **F-04.5** [Architect+BE+FE] `DECIDED: encrypted creator payout account required (diamonds redeemed -> platform pays); design first` Decide creator onboarding. FE sends bank account + IFSC to `/creators/me/onboarding` (no BE). Options: map to existing `POST/PATCH /creators/me` + `payout-requests` and drop bank capture; or BE adds encrypted payout storage like `workspace_payout_accounts` (AES-256-GCM, `ORGANISER_PAYOUT_ENCRYPTION_KEY`).
  - AC: no screen collects bank details unless BE stores them encrypted and returns only last 4; contract doc written first.
- **F-04.6** [FE] `TODO` Interim guard until each decision ships: capability probe hides the entry (organiser dashboard from Profile, creator onboarding banner, vibe-alert toggle) on 404 instead of showing error screens.
  - AC: with the BE as deployed today, none of the three screens is reachable; unit tests for the probe (pattern exists in `organizer/availability.ts`).

### F-05 Paid-organiser eligibility (payout VERIFIED path) | BE | P0 | M | deps: none
Why: see section 2 last row. Without it nobody can publish a paid event or issue a paid ticket (`403 Paid ticketing requires approved organiser verification and a verified payout account`).
- **F-05.1** [Architect] `TODO` Choose verification mechanism: (a) admin manually sets VERIFIED after reviewing (cheapest, matches current manual payout queue); (b) provider penny-drop/bank validation (**USER-GATED: paid third-party plan**, e.g. Razorpay X / Cashfree); document the choice.
- **F-05.2** [BE] `DONE (gathr-api #81; API only, admin panel button NOT built)` Implement the chosen path. For (a): `POST /admin/workspaces/:id/payout-account/verify|reject` + audit row (`organiser_onboarding_audit` needs new action values -> new migration; **USER-GATED DB migration**) + admin-panel button.
  - AC: only platform admin; idempotent; changing the payout account resets status to PENDING; publish/ticket-issue succeed after VERIFIED; `workspace_payout_accounts.status` change audited with actor; notify workspace owner (push) on verified/rejected.
  - Edge: verification APPROVED but payout PENDING (current state), re-submission while PENDING, workspace SUSPENDED, existing paid events published before 085 (fail-closed per `docs/organiser-onboarding.md`).
  - Sec: admin sees masked account only; decrypt only in a dedicated, logged path; never log decrypted values.
  - Test: extend `tests/organiser-onboarding.unit.test.js`, add DB test through publish -> purchase -> issue.
  - Idea: admin queue sorted by waiting time with SLA badge.
- **F-05.3** [FE] `TODO` Show payout status (Pending / Verified / Rejected + reason) in organiser onboarding and dashboard; paid toggle explains why publishing is locked.
  - AC: copy matches states; no dead end for PENDING; test in `organizer/__tests__`.

### F-06 Paid-event purchase in chat (attendee + organiser) | both | P0 | L | deps: F-04, F-05
Why: `POST /events/:id/purchase` returns `CHAT_OPENED`; FE opens the chat but it renders only text (`conversationPresentation.ts:16` labels PAYMENT_CARD for previews; no card/ticket bubble, no `mark-paid`). Organiser side has no sales inbox, payment-card share, confirm/cancel, or share-ticket (`GET /workspaces/:id/conversations` has no FE caller).
- **F-06.1** [FE] `DONE (PR #23)` Attendee: render `PAYMENT_CARD` bubble (amount, method, payee, UPI id/QR/link/bank per method, expiry as a hint only) with actions "Copy", "Open UPI/link", **"I've paid"** -> `POST /payment-cards/:id/mark-paid {reference?}`; render `TICKET` bubble -> opens ticket with QR.
  - AC: states SHARED / PAID_CLAIMED / CONFIRMED / CANCELLED shown; button disabled after claim; 409 re-fetches card; `EXPIRED` never branched on (API.md s5); card data comes from `message.paymentCard` over REST and socket.
  - Edge: duplicate taps; offline; event cancelled (409); thread spans several events (header uses `event_id` as latest); DIRECT-thread cards (role rules differ: creator confirms, other side marks paid).
  - Sec: `paymentLink` is `z.string().url()` on BE (any scheme): FE opens only `https:`/`upi:` after confirm dialog showing host; mask account numbers in bubbles; never log card metadata; screenshots allowed but no auto-upload.
  - Test: bubble snapshot per state; `mark-paid` service test; Jest for URL-scheme guard.
- **F-06.2** [BE] `DONE (gathr-api #83)` Harden payment cards: validate `paymentLink`/`qrImageUrl` as https only, host length cap, strip control chars; cap cards per thread per hour; enforce `expiresAt` on `mark-paid` (currently display-only, `API.md` s5) or document as intentional.
  - AC: `javascript:`/`http:`/`intent:` rejected 400; DB tests; DIRECT-thread cards rate-limited (scam vector: peer-to-peer card shown to strangers who message you).
- **F-06.3** [FE] `TODO` Organiser sales inbox: list `GET /workspaces/:id/conversations`, open thread, "Share payment details" form (method-specific fields per API.md table), Confirm / Cancel card, **Share ticket** (`POST /conversations/:cid/ticket`, optional `tierId`), handle `402 NO_TICKET_CREDITS` (link to credits), `409` sold out/already holds ticket/DRAFT.
  - AC: ADMIN+ only; button live once a card is SHARED (not only CONFIRMED); check the thread headline event before issuing (no `eventId` param); notifications `PURCHASE_REQUESTED`/`PAYMENT_MARKED_PAID` deep-link to the thread.
  - Edge: two staff acting at once; closed thread reopens on new purchase; credits exhausted mid-flow.
  - Test: service + screen tests; manual E2E script across two accounts (attendee + organiser) on staging.
- **F-06.4** [QA] `TODO` End-to-end acceptance on staging with two devices: browse -> purchase -> card -> mark-paid -> confirm -> ticket -> QR scan (requires F-05 VERIFIED workspace).
  - Idea: payment reference auto-detect (paste UTR) and one-tap "copy UPI id".

### F-07 Android release and signing hardening | FE | P0 | M | deps: none
- **F-07.1** [FE] `DONE (PR #19; keystore fail-fast is opt-in via hivaRequireReleaseKey)` Fail the release build when `android/keystore.properties` is absent instead of silently signing with the debug key (`android/app/build.gradle:123-133`).
  - AC: `assembleRelease`/`bundleRelease` without keystore exits non-zero with instructions; debug builds unaffected; `scripts/create-release-keystore.sh` documented. **USER-GATED:** generating/storing the upload key and Play App Signing enrollment.
- **F-07.2** [FE] `DONE (PR #19; R8 default off, not device-tested)` Turn on R8/resource shrinking (`enableProguardInReleaseBuilds = false`, `build.gradle:62`) with keep rules for LiveKit/WebRTC, Firebase, Razorpay, react-native-iap, Reanimated, our native modules (`audio`, `geofence`).
  - AC: release AAB builds; smoke test on device: login, push, join audio room, gift purchase sandbox, geofence receiver, Crashlytics mapping upload; size delta recorded in the task.
  - Edge: reflection in LiveKit/WebRTC; Hermes + R8; Crashlytics needs mapping file.
- **F-07.3** [FE] `TODO` Release hygiene: `versionCode` bump rule, `HIVA_API_URL` must be set explicitly for staging builds, `usesCleartextTraffic` false in release (verify manifest placeholder), `allowBackup=false` already set.
  - AC: checklist script prints effective API URL, applicationId (`com.hivachat.app`), version, signing cert fingerprint.
- **F-07.4** [FE] `TODO` Deep links: `HIVA_LINK_HOST` needs `/.well-known/assetlinks.json` (and iOS AASA) hosted on the domain (**USER-GATED: DNS/hosting**). AC: `adb shell pm get-app-links` shows verified; `/r/<token>` opens a party.

### F-08 Legal, privacy and store declarations | FE (docs) | P0 | M | deps: none
- **F-08.1** [FE] `TODO` **USER-GATED (hosting + counsel).** Host Terms and Privacy Policy (only `docs/legal/privacy-policy-template.md` exists) and set `HIVA_PRIVACY_URL`/`HIVA_TERMS_URL` in release builds.
  - AC: `LegalLinks` and Settings rows render in release; policy covers location (incl. background if kept), DOB/age gate, onboarding demographics, bank details, chat content, Crashlytics, AdMob, retention, deletion; build fails if either URL is missing in release (CI check).
- **F-08.2** [FE] `TODO` **USER-GATED (Play Console).** Play declarations: Data safety form, background-location declaration + demo video (only if F-04.4 keeps it), foreground-service types (`mediaPlayback`, `microphone`), financial features, age rating, account deletion URL, ads declaration.
  - AC: a checked-in `docs/store/play-data-safety.md` mapping every collected datum to its code path; unused permissions removed (`BLUETOOTH*` legacy, `CAMERA` only if used by QR/video, `RECEIVE_BOOT_COMPLETED` only with geofence).
- **F-08.3** [FE] `TODO` **USER-GATED (AdMob).** Create real AdMob app + native unit IDs, replace sample IDs in `app.json`, keep consent (UMP) flow, add age-based ad restrictions if minors can be 13-17 (age gate is 18+? **UNVERIFIED**: check `age/` rules).
  - AC: prod build serves real ads in a closed-test track only; consent form and "Ad privacy choices" verified; sample IDs absent from release manifest.
- **F-08.4** [BE+FE] `TODO` Data-subject requests: account deletion exists; add data export (`GET /me/export` job or email) or document manual process; verify deletion removes DM content/media/push tokens (`tests/account-deletion.test.js`).
  - Sec: export requires recent re-auth; link expires.

### F-09 Test and CI infrastructure | FE | P1 | M | deps: F-04.1
- **F-09.1** [FE] `TODO` CI gaps (`.github/workflows/ci.yml` runs only typecheck + jest): add `npm run lint`, contract check (F-04.1), Android `assembleDebug` job, and `assembleRelease` with a throwaway keystore secret.
  - AC: PR fails on lint/type/test/contract; build artifacts cached; runs in <15 min. Jest config must run in a clean checkout (AUDIT noted missing local Jest).
- **F-09.2** [FE] `DONE (PR #19)` Zero-test features: `ads` (consent flow, unit-id fallback exists in `adConfig.test.ts` only) and `creator` (`CreatorOnboardingScreen`, `creatorService`).
  - AC: >=1 test per public hook/service; error/empty/loading states covered; no network in tests.
- **F-09.3** [QA] `TODO` Device e2e smoke suite (recommend Maestro: YAML flows, no native deps) for: Google login stub -> onboarding -> home; join/leave party; send DM; open event -> purchase (free); logout. Run nightly on an emulator in CI.
  - AC: 5 flows green on emulator; flake budget documented; test accounts seeded on staging (`scripts/seed.js` in BE).
  - Edge: Google sign-in cannot be automated, so add a debug-only token-injection login behind `__DEV__`/build flavor.
- **F-09.4** [QA] `TODO` Resolve ownership of `AUDIT_IMPROVEMENTS.md` P1 "tests describe a different product" (NearbyPassport test vs UI): confirm current suite is green and Passport UI exists; delete or update dead tests.

### F-10 Abuse protection and rate limits | BE | P1 | M | deps: none
Verified: rate limiting exists only on discovery, networking, organiser event tools, user search, location/passport, party share (`createRateLimit` call sites). None on `/auth/*`, message send, posts/comments, reports, follows, vibe-notes, media upload-url, reactions. No API Gateway throttling/WAF in `serverless.yml`; `CORS_ORIGINS` defaults to `*`.
- **F-10.1** [BE] `TODO` Per-IP and per-account limits for `POST /auth/login|register|firebase|refresh` (credential stuffing; email/password endpoints are reachable though app is Google-only: consider disabling them via flag).
  - AC: 429 + `Retry-After`; DB-backed buckets reused; tests for window reset; unauthenticated key = IP from `x-forwarded-for` (trust only API Gateway). Edge: shared mobile NATs; Lambda concurrency.
- **F-10.2** [BE] `TODO` Limits on write paths: messages (burst + daily for new threads exists as `LIMIT_REACHED`), posts, comments, reactions, follow/unfollow, reports, vibe notes, `/media/upload-url` (size and count per hour).
  - AC: per-route budget table in `docs/`; 429 body has `code: RATE_LIMITED`; abuse test creates N+1 requests.
- **F-10.3** [BE] `TODO` **USER-GATED (AWS).** API Gateway stage throttling + optional WAF managed rules; restrict `CORS_ORIGINS` for admin panel origin only.
- **F-10.4** [FE] `TODO` Handle 429 uniformly in `apiClient.ts` (honour `Retry-After`, no tight retry loops; today only Nearby/Networking map 429).
  - AC: single user-facing "Slow down" path; backoff unit test.
- **F-10.5** [BE+Sec] `TODO` WebSocket auth token is in the query string (`API.md` s13, `subscribeRealtime.ts`): CloudWatch/proxy logs can capture access tokens. Add short-lived single-use WS ticket (`POST /realtime/ticket`), requires the realtime service repo (**UNVERIFIED** access).
  - Idea: same ticket carries presence grant.

### F-11 Local data wipe and PII at rest | FE | P1 | S | deps: none
Verified: sign-out only clears the Plus cache (`PlusProvider.tsx:34`). Last 50 messages per chat (`messageCache.ts`, plaintext AsyncStorage), saved posts (key not user-scoped), recent searches, follow-up reminders, pending gift/party link persist after logout and after account deletion.
- **F-11.1** [FE] `DONE (PR #21)` One `wipeLocalUserData()` called on logout, account deletion, session-invalid, and account switch.
  - AC: removes all `hiva.*` AsyncStorage keys, cached messages, geofence registrations, notification badge, FCM token deletion (exists), realtime socket reset, Plus cache; unit test seeds each store and asserts empty; saved posts and searches become user-scoped.
  - Edge: logout while offline; wipe must not race with a pending write (`queueMutation` in `session.ts`).
  - Sec: consider encrypting the message cache with a Keychain key or dropping it (value vs risk).
- **F-11.2** [FE] `DONE (PR #21)` Redact PII from Crashlytics breadcrumbs: audit `recordError(..., context)` callers and server `message` strings that may include emails/phones.
  - AC: grep shows no user text in contexts; documented rule in AGENTS.md style guide.

### F-12 Observability, force-update and ops | both | P1 | M | deps: F-10
- **F-12.1** [BE] `TODO` **USER-GATED (AWS).** CloudWatch alarms: API 5xx rate, Lambda errors/throttles, SQS DLQ depth (`notifications-dlq`, `vibe-geofence-dlq`), scheduler failures, Neon connection saturation; SNS to the team.
  - AC: IaC in `serverless.yml` resources; test by forcing a DLQ message. Backend has no alarms today (grep).
- **F-12.2** [BE+FE] `TODO` Minimum-supported-version gate: FE sends `X-App-Version`/platform header; BE `app_config` key `app.min_version.android|ios`; 426 `UPGRADE_REQUIRED`; FE shows blocking update screen with Play link. None exists today (grep).
  - AC: unit tests both sides; admin panel can edit the key; never blocks `/health`.
- **F-12.3** [BE] `TODO` Request-id correlation: FE already surfaces `requestId`; ensure every error log line carries it and PII (email, tokens, coordinates, payment details) is redacted (`utils/logger`? **UNVERIFIED**). AC: log-redaction test.
- **F-12.4** [BE] `TODO` Realtime service dependency (`gathr-realtime`, separate repo/host, `onrender.com` in docs): document owner, uptime expectations, cold-start behaviour (free tiers sleep, **UNVERIFIED**), and confirm `typing` + `presence.subscribe` are deployed.
  - AC: runbook in `docs/`; FE degrades to polling (exists) and the status is visible in admin health.

### F-13 Organiser event lifecycle and team | FE | P1 | M | deps: F-04.3, F-05
Verified FE gap: events can only be created as a first-event DRAFT (`createOrganizerEvent`); no publish/edit/cancel, no members/invites UI, `WORKSPACE_INVITE` notification cannot be accepted (`POST /workspaces/invites/accept` has no caller).
- **F-13.1** [FE] `TODO` Draft -> edit -> publish -> cancel actions on dashboard event detail (`PATCH`, `POST .../publish`, `POST .../cancel`).
  - AC: publish blocked with clear reason when F-05 not satisfied; cancel needs typed confirmation and warns about refunds/ticket holders; optimistic UI none; 409/403 mapped; idempotent retry (`Idempotency-Key` for first event per `docs/organiser-onboarding.md`).
  - Edge: event started; sold tickets; capacity lower than issued; timezone display (store ISO, show device TZ + venue TZ **UNVERIFIED** field).
- **F-13.2** [FE] `TODO` Team: list members/invites, invite by email with role (SCANNER/MEMBER/ADMIN; ANALYST owner-only), revoke, change role, leave, transfer ownership; accept invite deep link.
  - AC: role-based visibility; owner cannot be removed; accept flow from push; tests per role.
  - Sec: invite tokens never logged; confirm before ownership transfer.
- **F-13.3** [FE] `TODO` Event editing locks fields after publish where BE restricts them (read BE `event.service.js` update rules first).

### F-14 Offline scanner and check-in | FE | P1 | L | deps: F-13
BE ready: `/scanner/workspaces/:id/devices`, `.../events/:eid/manifest`, `/sync`, `/batches` (`API.md` s10). FE has only a manual code text box (`OrganizerDashboardScreen.tsx:197`).
- **F-14.1** [FE] `TODO` Camera QR scanner (choose `react-native-vision-camera` v4 or `react-native-camera-kit`; Architect decides, note New Architecture support) for SCANNER/ADMIN/OWNER; permission requested only on open; manual entry fallback.
  - AC: result states (valid, already used, wrong event, refunded/cancelled, invalid) with haptic/sound; duplicate-scan debounce; never marks optimistically online (server is truth).
- **F-14.2** [FE] `TODO` Offline mode: register device, download manifest, verify signatures locally, queue check-ins in encrypted storage, `sync` when online, show pending count and conflicts.
  - AC: works in airplane mode on a real device; sync idempotent; clock-skew safe; manifest purged after event + on logout; tests with mocked storage.
  - Sec: manifest contains attendee data: encrypt at rest, wipe on logout/role revocation, no logging of codes.
  - Idea: door-staff "gate stats" counter that updates from manifest + queue.

### F-15 Nearby alerts device verification | FE | P1 | M | deps: F-04.4
- **F-15.1** [QA] `TODO` Real-device matrix (Android 13/14/15, iOS 17/18) for permission flows (when-in-use -> always), reboot persistence, force-stop, battery saver, region limits (iOS 20, Android 100), push tap -> reveal; record results in `docs/`.
  - AC: each Edge in `NEARBY_VIBES_GEOFENCING_CONTRACT.md` "Platform constraints" has a pass/fail row; copy says "alerts when available".
- **F-15.2** [FE] `TODO` Nearby visibility empty states: `FEATURES.md` notes the emulator run had visibility off; verify people list with visibility on, off, permission denied, location services off, stale fix.
- **F-15.3** [FE+Sec] `TODO` Location privacy: precise location only sent when needed; accuracy bucket; no coordinates in logs/Crashlytics; "Stop sharing" visible in Settings and on Nearby (exists as `setNearbyVisibility`; verify DELETE of stored location on opt-out in BE `location.service.js` **UNVERIFIED**).

### F-16 iOS launch readiness | both | P1 (P0 if iOS ships) | L | deps: F-08
FEATURES.md says Android is primary; iOS items below are unverified on device.
- **F-16.1** [FE+BE] `TODO` **USER-GATED (Apple Developer, Firebase console).** Sign in with Apple (App Review 4.8 because Google is the only login). FE: `@invertase/react-native-apple-authentication` or Firebase `OAuthProvider('apple.com')`; BE accepts any Firebase provider via ID token (`firebase.verifier.js:106` records `signInProvider`) but `FIREBASE_REQUIRE_VERIFIED_EMAIL` and Apple private-relay/hidden emails need handling (**UNVERIFIED**).
  - AC: Apple login creates/links account; account deletion revokes Apple token (Apple requirement); hidden email accepted; iOS only.
- **F-16.2** [Architect] `TODO` iOS billing decision. Today `connectBilling` returns false on non-Android and BE only verifies Google Play (`/me/subscription/google-play`). Options: hide Plus/gifts/themes/paid rooms on iOS until StoreKit + BE App Store Server API verification exist, or build them.
  - AC: iOS build shows no purchase UI that cannot work; written decision; if built, BE has `/me/subscription/app-store` with notifications V2 webhook (**USER-GATED**: App Store Connect products/agreements).
- **F-16.3** [FE] `TODO` Remove `voip` from `UIBackgroundModes` (`Info.plist:60`) unless PushKit/CallKit is implemented (App Review rejects unused modes); keep `audio` for party playback, justify in review notes.
- **F-16.4** [FE] `TODO` **USER-GATED (Apple).** Push: add `aps-environment` entitlement (absent in `HivaChat.entitlements`), APNs key in Firebase, Notification Service Extension for rich images (`BACKEND_PENDING_CONTRACT.md` says app-side work).
- **F-16.5** [FE] `TODO` Privacy: `PrivacyInfo.xcprivacy` reviewed against SDKs; ATT prompt + `NSUserTrackingUsageDescription` + SKAdNetwork IDs if AdMob personalised ads are used (none present); purpose strings reviewed; Always-location only if F-04.4 keeps geofence.
- **F-16.6** [QA] `TODO` Full iOS pass: build from clean `pod install`, TestFlight, deep links (AASA), mic/camera in rooms, background audio, notifications.

### F-17 Tiers, discounts, attendee forms, ticket transfer | both | P2 | L | deps: F-06
BE ready (`modules/tiers`, `modules/transfer`, `event.routes.js` discount-quotes/attendee-form); no FE.
- **F-17.1** [FE] `TODO` Attendee: show tiers on event detail (`GET /tiers/events/:eid`), choose tier at purchase, sold-out tier (`409 TIER_SOLD_OUT`), discount code entry (`POST /events/:eid/discount-quotes`), attendee form (with purpose disclosure) before purchase, delete my responses.
  - AC: price shown is server quote; quote expiry handled; form responses sent only after consent; tests per state. Sec: quote ids not guessable; show purpose text verbatim.
- **F-17.2** [FE] `TODO` Organiser: manage tiers, discount codes (create/disable, usage), attendee form builder, view responses (ADMIN+ only).
  - Edge: editing tiers after sales; discount stacking; code brute-force (BE rate limit F-10).
- **F-17.3** [FE] `TODO` Ticket transfer: initiate (`POST /transfer/tickets/:id`), accept, cancel, list mine; handle `TICKET_TRANSFERRED` notification.
  - AC: recipient lookup by handle; transferred ticket QR invalidated for sender; states pending/accepted/cancelled/expired.
  - Idea: "Gift ticket" share link.

### F-18 Organiser insights and comms | FE | P2 | L | deps: F-13
BE ready: `/events/:eid/analytics`, broadcasts, `attendees.csv`, webhooks, `organizer-page`, networking credit.
- **F-18.1** [FE] `TODO` Event analytics screen (conversion, check-in rate, repeat attendees; ANALYST role gets aggregates only).
- **F-18.2** [FE] `TODO` Scheduled broadcasts to attendees (create/list/cancel) with length limits and "purpose" copy; respect `organizer_broadcasts.enabled`.
  - Sec: no bulk spam: BE per-event caps (**UNVERIFIED**); preview shows recipient count.
- **F-18.3** [FE] `TODO` CSV export via share sheet (BE `organizer_attendee_exports.enabled`; contains PII: warn, audit-logged, delete temp file after share).
- **F-18.4** [FE] `TODO` Public organiser page editor (`PUT /workspaces/:id/organizer-page`) and share link `/organizers/:slug`.
- **F-18.5** [Architect] `TODO` Webhooks: recommend web admin only (developer feature); FE no-op. Record decision; if mobile is wanted, show secret once and deliveries log.

### F-19 Chat parity and robustness | both | P2 | L | deps: F-06
FE chat is text-only plus typing/read: no image/voice messages, edit/delete, reactions, delivery ticks (`status.deliveredAt/readAt`), per-message report, `PATCH /conversations/:id/status` close/open (BE `chat.routes.js` has them).
- **F-19.1** [FE] `TODO` Message actions: edit (own, time window per BE), delete, reactions, long-press menu, report message.
  - AC: socket events `message.edited/deleted/reaction.*` applied via `applyRealtimeToMessages`; optimistic send de-dup after reconnect; `seq` gap triggers resync (exists).
- **F-19.2** [FE] `TODO` Images and voice notes via `/media/upload-url` (`purpose: chat`, voice <=120 s, 10 MB cap) with upload progress, retry, cancel.
  - Sec: strip EXIF on upload; scan/ban abuse path via reports; block list respected.
- **F-19.3** [QA] `TODO` Verify typing against the deployed realtime service (UNVERIFIED) and presence grants; if not deployed, hide the typing UI hooks or document.
- **F-19.4** [FE] `TODO` Delivery/read ticks from `status`; request-blocked states; message requests accept/decline polish.
  - Idea: "Send as payment request" shortcut for DMs (DIRECT cards) only if F-06.2 abuse controls land.

### F-20 Settings and privacy expansion | both | P2 | M | deps: none
- **F-20.1** [FE] `TODO` Add missing rows for settings BE already supports: `language`, `joinMuted`, `notifyVibeNotes` (`settings.schema.js`).
  - AC: each persists via `PATCH /me/settings`; failure rolls back switch; tests.
- **F-20.2** [BE] `TODO` **USER-GATED (migration + deploy).** Extend `/me/settings`: `searchDiscoverability`, `partyRecommendationDiscoverability`, `lockScreenPreview` (`full|sender_only|hidden`; push + digest payloads must honour it), optional read receipts.
  - AC: schema is `.strict()` partial (new keys needed); defaults preserve current behaviour; search/nearby/party-discovery queries filter on flags; blocked/private interplay tested; downgrade never broadens visibility.
  - Sec: default privacy-preserving for new accounts; audit that push payloads never include message text when hidden.
- **F-20.3** [FE] `TODO` UI for new settings + privacy explainer screen ("who can see what").

### F-21 Client funnel analytics and consent | both | P2 | M | deps: F-08, F-12
- **F-21.1** [BE] `TODO` Allowlisted ingestion `POST /analytics/events` (names: `paywall_viewed`, `plan_selected`, `checkout_started`, `limit_reached`, ...; props allowlist; reject tokens, message text, coordinates; batch <=20; rate limited).
  - AC: unknown property -> dropped or 400 (Architect); stored without IP; feeds `GET /admin/funnel`; retention policy.
- **F-21.2** [FE] `TODO` Thin `core/analytics` client: queue + batch, offline-safe, consent-gated (Crashlytics currently auto-enables in release with no consent UI: `crashReporting.ts`).
  - AC: opt-out in Settings stops both analytics and non-essential Crashlytics collection; no PII; tests for dropped props.

### F-22 Performance baseline on device | FE | P2 | M | deps: F-09
Rule from backlog: no further optimisation libraries without measurements (see section 6).
- **F-22.1** [QA] `TODO` Measure on a mid-range Android (release build, Hermes): cold start TTI, Home feed scroll (JS/UI fps via Perf Monitor), Nearby/Messages scroll, memory after 5 min in a party room, bundle size. Record in `docs/PERF_BASELINE.md`.
  - AC: numbers for 3 devices/OS; budgets proposed (e.g. cold start <2.5 s).
- **F-22.2** [FE] `TODO` Fix proven issues only: `PostCard` remount per cell (`Home.tsx:52-58` keys by id, defeating FlashList recycling; use `useRecyclingState` for card-local state); migrate `FollowListSheet` FlatList (`:88`) to FlashList; check FlashList `estimatedItemSize`/`getItemType` correctness.
  - AC: before/after fps numbers attached; no visual regression in tests.
- **F-22.3** [FE] `TODO` Verify `react-native-fast-image` v10 works on New Architecture (**UNVERIFIED**; library is lightly maintained). Fallback plan documented.

### F-23 Accessibility, i18n and offline UX | FE | P2 | L | deps: none
Verified: ~700 a11y props exist; no i18n library (BE supports en/hi/hinglish); no NetInfo/offline banner.
- **F-23.1** [FE] `TODO` Touch targets >=48dp on primary controls (AUDIT noted 32dp category chips), TalkBack/VoiceOver pass on login, onboarding, home, chat, paywall, party room; dynamic type up to 200%.
  - AC: checklist with evidence per screen; automated lint rule or test for `minHeight`.
- **F-23.2** [FE] `TODO` i18n foundation: externalise strings of the top 6 flows, wire to `/me/settings.language` (en/hi/hinglish), date/currency formatting via `Intl`, RTL-safe layouts (`supportsRtl=true`).
  - AC: switching language updates UI live; pseudo-locale test finds untranslated strings.
- **F-23.3** [FE] `TODO` Offline UX: NetInfo-based banner, queued retry for sends, preserve compose drafts (post, DM), cached feed first paint, distinct "offline" vs "server error" copy.
  - Edge: captive portals; flapping connectivity; background to foreground resync.

### F-24 Creator and gifts follow-through | both | P2 | L | deps: F-04.5
- **F-24.1** [FE+BE] `TODO` Implement the creator onboarding decision (F-04.5); status screen (pending/approved/rejected + reason).
- **F-24.2** [FE] `TODO` Verify gift purchase recovery end to end: `pendingGiftPurchase.ts` persistence, reservation expiry (7 days per BE docs), voided/refunded purchases, double-tap protection; sandbox test with licence testers (**USER-GATED: Play Console**).
- **F-24.3** [FE] `TODO` Creator memberships/supporter badge UI (BE flag `creator.memberships.enabled`); decide scope with product. KYC/payout automation stays manual per BE gap 6.

### F-25 Backend-ready features without app UI | FE | P3 | L | deps: none
- **F-25.1** [FE] `TODO` Host Studio: recurring series + reminders, speaker waitlist, moderation presets, post-room analytics (`hostStudio.routes.js`).
- **F-25.2** [FE] `TODO` Event networking: ranked suggestions (`/networking/suggestions`) in the attendee sheet; never show distance or demographics.
  - Idea: "3 people you share interests with are going" on event cards (aggregate only, opt-in).
- **F-25.3** [FE] `TODO` Arrival watches (`/arrival-watches`) and party `discover/interests`.
- **F-25.4** [Architect] `TODO` Business pages, community hubs, creator memberships: remain deferred until demand gates (section 6); record that BE exists.

### F-26 Social/posts gaps | both | P3 | M | deps: none
- **F-26.1** [BE+FE] `TODO` Server-side saved posts (`POST/DELETE /posts/:id/save`, `GET /me/saved-posts`) replacing local-only storage; one-time import of local ids.
- **F-26.2** [BE] `TODO` Race-safe like grouping: partial unique index `uq_notifications_unread_post_like` from `BACKEND_PENDING_CONTRACT.md` item 2 (not in migrations).
  - AC: two parallel first likes -> one row, `actorCount: 2`.
- **F-26.3** [FE] `TODO` Post edit/delete own comments; comment pagination "load earlier" polish; share post link.

---

## 5. Discovered during implementation

Agents append one entry per finding; the Task-Builder folds them into features above and clears the entry.

Template: `- [YYYY-MM-DD] <role> <feature/task id> : <finding> | evidence: <file:line or command> | proposed priority`

- [2026-10-15] Backend-Dev F-01 : The app's age gate (DOB in onboarding, `ageStatus`, `AGE_REQUIRED`/`UNDERAGE`) has NO backend: no `dateOfBirth`, `ageStatus` or age errors exist in `origin/main` or any gathr-api branch; the app's `PATCH /auth/me {dateOfBirth}` is silently stripped by Zod, so the gate never triggers and minors are not blocked. Profile data (incl. gender) is collected without age enforcement | evidence: `ageService.ts:24`; `grep -rn "dateOfBirth|ageStatus" gathr-api/src migrations` finds nothing; auth.routes.js PATCH /auth/me gated only by `authenticate` | P0 (legal/store: DPDP minors, Play policy). Needs an Architect decision: build BE age support or remove the app gate. | status: DONE (gathr-api #82; flags age_gate.enforce_underage=true, age_gate.enforce_unknown=false)
- [2026-10-15] QA-Engineer F-03 : `AdsProvider` caches a rejected `MobileAds().initialize()` promise (`initializePromise ??=`), so after one transient failure ads never initialise again this process and reopening privacy options re-throws the old error | evidence: src/features/ads/AdsProvider.tsx:14,22; `test.failing` in AdsProvider.test.tsx | P2
- [2026-10-15] QA-Engineer F-03 : `NativeAdCard` keeps rendering a destroyed NativeAd after consent is withdrawn (effect cleanup destroys it but `ad` state is never cleared) | evidence: src/features/ads/NativeAdCard.tsx:12-25; `test.failing` in NativeAdCard.test.tsx | P2
- [2026-10-15] Security-Auditor F-01 : `PATCH /auth/me` had no rate limit; added a 20/min per-user Postgres-backed limit (reuses `api_rate_limit_buckets`); `/auth/firebase` and change-password still unlimited | evidence: src/routes/auth.routes.js | P1 (see F-10)
- [2026-10-15] Owner decision : ticket money will be collected by Hiva via Razorpay (Option B, docs/design/ONPLATFORM_TICKET_PAYMENTS.md) and organisers paid manually after commission 3-7%; blocked until CA/Razorpay written confirmation

## 6. Won't do / deferred (with reason)

| Item | Decision | Reason |
| --- | --- | --- |
| Skia / custom GPU drawing | Rejected | No measured rendering bottleneck; adds binary size and a second renderer. Revisit only if F-22.1 shows a chart/animation hotspot. |
| Nitro modules beyond existing `react-native-nitro-modules` dependency | Rejected | No native-module perf problem measured; maintenance cost. |
| Unistyles / Uniwind migration | Rejected | ~80 files use NativeWind `className`; migration cost with no measured benefit. |
| Native bottom tabs (`react-native-bottom-tabs`) | Rejected | JS tabs show no measured jank; custom tab bar already styled. |
| TanStack Query rewrite | Rejected for now | Large refactor of every `useState` + service pair; revisit per feature if caching/dedupe pain is measured (F-23.3 may add targeted caching). |
| MMKV migration | Rejected for now | AsyncStorage use is small (caches, flags); no measured I/O stall. F-11 reduces what is stored anyway. |
| react-native-boost component swaps (Text/View/Image) | Disabled | Break NativeWind `className` (documented in `metro.config.js:37-45`); pure-JS rewrites stay on. |
| Mobile UI for outgoing webhooks | Deferred (F-18.5) | Developer-facing; admin web is the right surface. |
| Business pages, community hubs, promotions, creator memberships (app UI) | Deferred | Plan says demand-gated (`HIVA_MONETIZATION_DEVELOPMENT_PLAN.md`); BE exists behind flags. |
| Creator KYC automation / automated payouts | Deferred | BE gap 6: manual payout queue; needs provider contract (paid, USER-GATED). |
| Rewriting chat lists to FlashList | Rejected | FlatList is intentional for scroll-to-end behaviour (`FEATURES.md`). |
| Client-side event templates (`/event-templates`) | Deferred | Not in BE; low demand evidence. |
| Using `gathr-api` checkout at `/Users/sjpvt/Desktop/hiva-rn/gathr-api` | Not a source | 95 commits behind origin/main with unrelated WIP. |

## 7. Not verifiable from code (UNVERIFIED register)

Neon DB state (086 and both 085 files applied?), which BE stage the app targets in each build, deployed realtime service features (typing, presence grants), whether jest/typecheck/lint currently pass on the 83-file dirty working tree (builds were not run per brief), real-device behaviour of FlashList/fast-image/geofencing, Play Console and App Store Connect state, Firebase console providers (Apple), AdMob account, Razorpay account mode (live vs test) and Play policy treatment of organiser ticket-credit purchases via Razorpay (physical-event service credits; confirm with Play policy before launch).
