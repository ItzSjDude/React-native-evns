# Route reconciliation: app calls routes the backend does not have (TASKS.md F-04.2, F-04.4, F-04.5)

Status: PROPOSED, needs owner approval (section 9). Author: Architect. Date: 2026-10-15.
Audience: Backend-Dev and Frontend-Dev (build from sections 3-5), owner (sections 1, 9).
Backend truth = `gathr-api` `origin/main` fetched 2026-10-15, plus open PRs #81 (088 payout verification), #82 (087 age gate), #83 (089 paid-flow security). Anything I could not verify is marked **UNVERIFIED**.

## 1. Decisions at a glance

| Area | Decision | Option | Cost |
| --- | --- | --- | --- |
| F-04.2 Organiser dashboard | **Reuse existing BE routes** for overview, events, stats, check-in, scan log. **Build one new small BE read route** (`GET .../attendees`, PII-minimal) because the existing `/tickets` route cannot be used safely. **Hide Payouts and all revenue/payout numbers** (no data exists). | Reuse + 1 new route + hide | BE: M (1 route, no migration). FE: M |
| F-04.4 Nearby alerts | **Option A, hardened**: remove native geofencing and background location; app posts foreground fixes to existing `POST /me/location`; the toggle is `notifyVibeNotes` via existing `PATCH /me/settings`. Closed-app alerts are dropped for launch. A privacy-safe BE route (B-lite) is specified in 4.5 but deferred. | Reuse (app change) | BE: none. FE: M (mostly deletions) |
| F-04.5 Creator onboarding | **Reuse existing routes, no bank capture**: `POST/PATCH /creators/me`, `GET /creators/:myId`, `GET /creators/me/wallet`, `POST /creators/me/payout-requests`. Drop bank fields, `categories`, `payoutEligible` from the app. Encrypted creator payout account is specified (5.6) as Phase 2 and only built if the owner answers Q3 "no". | Reuse (app change) | BE: none. FE: S-M |

Verification of the TASKS.md recommendations: the dashboard recommendation **partly does not hold** (the existing `/tickets` route leaks attendee email, and there is no revenue or payout data anywhere). The Nearby recommendation **holds but with a product cost** the TASKS text does not state (alerts only fire while the app is in the foreground, and only for users whose Nearby visibility is ON). The creator recommendation **holds**, with one unresolved question (how creators are actually paid, Q3).

## 2. Findings that shaped the decisions (verified against origin/main)

1. All three app contracts (`ORGANIZER_DASHBOARD_API_CONTRACT.md`, `NEARBY_VIBES_GEOFENCING_CONTRACT.md`, creator onboarding in `FEATURES.md`) were written by the app side. None of `organizer-dashboard`, `organizer-summary`, `/attendees`, `/check-ins`, `/payouts`, `/me/vibe-note-alerts`, `/vibe-notes/geofence-candidates`, `/creators/me/onboarding` exists in `tests/routes.json` or any router.
2. Existing organiser routes (`src/routes/workspace.routes.js`): `GET /workspaces/:id/events` (reader roles), `GET .../events/:eid/stats` (reader roles), `GET .../events/:eid/tickets` (min role SCANNER), `GET .../events/:eid/scans` (SCANNER), `GET /workspaces/:id/scans` (ADMIN), `POST /workspaces/:id/tickets/verify` (SCANNER). Offline scanner module is mounted at `/scanner` (`manifest`, `sync`, devices, batches) and is out of scope here (F-14).
3. **`GET .../events/:eid/tickets` returns `DETAIL_SELECT` rows** (`ticket.repository.js`): `t.*` minus `secret`, plus `attendee_email`, `user_id`, ticket `code`, event/workspace fields. Any SCANNER-role member (lowest staff role) can read every attendee's email. PR #83 whitelists the realtime ticket frame but does not touch this REST route. This is an existing exposure and is why the app must not reuse it for the attendee list.
4. `POST .../tickets/verify` always answers HTTP 200 with `{ok, result, message, ticket}`; the `ticket` object is the same unsanitised-minus-secret row (includes `attendee_email`). Results: `SUCCESS | ALREADY_USED | INVALID | WRONG_EVENT | CANCELLED | EXPIRED`. Check-in is atomic (`FOR UPDATE` plus status guard), so the app's `idempotencyKey` is unnecessary: a replay returns `ALREADY_USED`. Every attempt is written to `ticket_scans`. No dedicated rate limiter on this route (**UNVERIFIED** whether a global one exists in `app.js`). Ticket codes are `GTHR-XXXX-XXXX` from 8 random bytes over a 32-char alphabet (about 40 bits), so brute force is impractical if rate limited.
5. **No revenue or payout ledger for tickets.** Paid ticketing is off-platform: organiser shares a payment card (UPI/bank/link) in chat, marks it confirmed, then issues the ticket (`payment_cards`, `PAID_TICKET_FLOW.md`). `tickets` has no price column. `workspace_payout_accounts` only gates paid publishing (#81). Therefore `grossRevenueMinor`, `nextPayoutMinor`, `/payouts`, payout history have nothing to read. The only real money figure is the sum of `payment_cards.amount_minor` where `status='CONFIRMED'`, which is organiser-asserted, not provider-settled.
6. Event statuses in BE: `DRAFT | PUBLISHED | CANCELLED | COMPLETED` only (`event.schema.js` `listWorkspaceQuery`). The app sends `status=UPCOMING|PAST|DRAFT`, which the validator rejects with 400. So even the "existing" `listOrganizerEvents` is broken today (a gap the F-04.1 script will not catch, because the path exists). `PAUSED`, `SOLD_OUT`, `ENDED` do not exist in BE.
7. List/pagination envelope is `{success, data, meta:{limit, offset, hasMore}}` with **snake_case row fields** for tickets/events (rows are returned as selected). `stats` returns Postgres `count(*)` which `pg` returns as strings unless a type parser is set (**UNVERIFIED**; the app must `Number()` them).
8. Nearby: the server-side half of geofencing is **already on main**: `POST /me/location` accepts optional `accuracyMeters`, enqueues a user-id-only job, `vibeGeofenceWorker` re-reads the single stored fix and notifies via the existing `notify_vibe_notes` setting with dedupe `(user_id, dedupe_key)`. Unknown body keys (`source`, `enteredNoteIds`, `observedAt`) are stripped by non-strict zod, so the native handler's extra fields are silently ignored today. The matching query requires `viewer_location.visible = true`, fix age <= 30 minutes, and `accuracyMeters <= note.radius_meters` (radius is 50-500 m). What is **missing** is only the list of regions to register on-device (`geofence-candidates`); `GET/PUT /me/vibe-note-alerts` is redundant with `notifyVibeNotes` in `/me/settings`.
9. Coupling worth stating: alerts only fire for users who are **visible** on Nearby (`POST /me/visibility`). The older contract text says visibility is separate; the code says otherwise.
10. Creators: `src/routes/creator.routes.js` has `POST /creators/me` (handle, displayName, bio), `PATCH /creators/me`, `GET /creators/me/wallet`, `GET|POST /creators/me/payout-requests`, `GET /creators/:creatorId` (creatorId = user id). There is no `GET /creators/me`, no creator "approval" state, no categories, no bank storage. Payout requests move `REQUESTED -> APPROVED/REJECTED` by admin with an `externalReference`; money is moved outside the API. Payout routes 404 when `creator.payouts.enabled` is off (config flag).
11. Open PR interactions: #82 makes `authenticate` return `403 UNDERAGE` (known minor, on by default) and, later, `403 AGE_REQUIRED` (flag off by default) on every route except `/auth/*`; all routes in this document inherit that, the app must handle both codes generically. #81 adds `GET /workspaces/:id/payout-account` and admin verify routes and resets payout status to PENDING on changed details; none of that is needed by the dashboard. #83 adds rate limits and `events.enabled` gating on `/conversations/:cid/payment-cards` and `/ticket` only. Migrations 087/088/089 are claimed by those three PRs; `origin/main` tops out at 086 (two files share prefix 085).

## 3. F-04.2 Organiser dashboard

### 3.1 Options considered

| Option | Verdict |
| --- | --- |
| Build all 5 contract routes as written (organizer-dashboard, organizer-summary, attendees, check-ins, payouts) | Rejected. Revenue/payout fields have no source of truth; building them means inventing a ledger (L, migration, finance review). Duplicates stats/verify. |
| Reuse existing routes only | Rejected for attendees: `/tickets` exposes `attendee_email` to SCANNER and has no name search. Fine for everything else. |
| **Reuse + one new PII-minimal attendees route; hide money** | **Chosen.** Smallest surface that gives organisers what they can actually act on: how many are coming, who they are, who is in, let them scan. |
| Hide the whole dashboard | Fallback if BE-D1 slips: ship Overview/Events/Check-in (all reuse), hide Attendees tab behind 404 tolerance. |

### 3.2 Final endpoints (all under the standard envelope `{success:true,data,meta?}`)

All require `Authorization: Bearer`. "Reader roles" = `workspaceReaders` (exact role set **UNVERIFIED**, defined at `workspace.routes.js:29`; contract requires OWNER/ADMIN for the dashboard, so the app shows the dashboard only to OWNER/ADMIN of an ACTIVE, `verification_status = APPROVED` workspace and treats a 403/404 as "access revoked").

| # | Endpoint | Status | Roles | Used for |
| --- | --- | --- | --- | --- |
| 1 | `GET /workspaces` | exists | any member | workspace list; must carry `verification_status` (**UNVERIFIED** that the list projection includes it; column exists on `workspaces`, migration 085) |
| 2 | `GET /workspaces/:wid/events?status=&limit=&offset=` | exists | readers | Events tab |
| 3 | `GET /workspaces/:wid/events/:eid/stats` | exists | readers | counts |
| 4 | `GET /workspaces/:wid/events/:eid/attendees?q=&status=&limit=&offset=` | **NEW (BE-D1)** | OWNER, ADMIN | Attendees tab |
| 5 | `POST /workspaces/:wid/tickets/verify` | exists | SCANNER+ | Check-in |
| 6 | `GET /workspaces/:wid/events/:eid/scans` | exists | SCANNER+ | recent check-ins / refusals |
| - | `GET /workspaces/:wid/organizer-dashboard`, `.../organizer-summary`, `POST .../check-ins`, `GET .../payouts` | **removed from app** | - | - |
| - | `GET .../events/:eid/tickets` | exists, **app must not call** | - | - |

#### 2. Events list: app-side status mapping (no BE change)

```
UPCOMING -> status=PUBLISHED   (app filters starts_at >= now, orders ascending)
PAST     -> status=COMPLETED   (second call status=CANCELLED merged client-side if "show cancelled" is on)
DRAFT    -> status=DRAFT
```
Row (existing, snake_case, `e.*` + workspace_*): `id, title, starts_at, ends_at, venue, cover_url, status, capacity, tickets_issued, is_paid, ...`. App maps to `OrganizerEvent`: `ticketsSold = tickets_issued`, `capacity`, `status` as-is. Drop `PAUSED/SOLD_OUT/ENDED` from app types (derive "Sold out" = `capacity != null && tickets_issued >= capacity`, "Ended" = `COMPLETED`). Meta: `{limit, offset, hasMore}` via `apiRequestPage`; stop expecting `{items, hasMore, offset}`.

#### 3. Stats (existing)
```ts
// GET /workspaces/:wid/events/:eid/stats  -> data
type EventStats = { interested: number|string; issued: number|string; checked_in: number|string; cancelled: number|string; conversations: number|string };
```
App: `ticketsSold = Number(issued) + Number(checked_in)`, `checkedIn = Number(checked_in)`. Cancelled excluded. Overview totals = sum over at most the 5 nearest upcoming events fetched in parallel (cap 5 requests; label "next 5 events"). No money.

#### 4. NEW `GET /workspaces/:wid/events/:eid/attendees`

Authz: `authenticate` -> `requireWorkspaceRole(ROLES.ADMIN)` (OWNER and ADMIN; ANALYST/SCANNER/MEMBER get 403) -> `eventService.loadOwned(wid, eid)` (event not in this workspace => 404, no existence leak). Workspace `DELETED` => 404 (existing middleware). Rate limit: `createRateLimit({prefix:'organizer-attendees', max: 60})` per user per 60 s (`429 RATE_LIMITED` + `Retry-After`).

Query (zod, strict): `limit` int 1-100 default 20; `offset` int >= 0; `status` enum `ALL|CHECKED_IN|NOT_CHECKED_IN` default `ALL`; `q` string trimmed 2-50, optional (name contains, case-insensitive; never logged, never put in `req.originalUrl` logs: BE-D1 must scrub `q` from access logs if the logger records query strings, **UNVERIFIED**).

```ts
type AttendeeStatus = 'ISSUED' | 'CHECKED_IN' | 'CANCELLED' | 'EXPIRED';
type OrganizerAttendee = {
  ticketId: string;          // uuid
  displayName: string;       // users.name only
  status: AttendeeStatus;
  issuedAt: string;          // ISO-8601
  checkedInAt: string | null;
};
type AttendeesResponse = { success: true; data: OrganizerAttendee[]; meta: { limit: number; offset: number; hasMore: boolean } };
```
```json
{"success":true,"data":[{"ticketId":"5b0c...","displayName":"Ravi K.","status":"ISSUED","issuedAt":"2026-10-12T09:41:00.000Z","checkedInAt":null}],"meta":{"limit":20,"offset":0,"hasMore":false}}
```
Never returned: email, phone, user id, ticket `code`, QR payload, secret, amount, payment details. Stable order: `issued_at DESC, id`. `NOT_CHECKED_IN` = `status='ISSUED'`. `CANCELLED` rows appear only with `status=ALL`, flagged by `status`, not scannable. Networking opt-in data is a separate dataset and never joined. (Dropped from contract: `orderReference`, `amountMinor`, `currency`, `ticketLabel`, `PAID/FREE/REFUNDED`: no source.)

#### 5. Check-in via existing verify

```ts
// POST /workspaces/:wid/tickets/verify
type VerifyRequest = { payload?: string /*raw QR, 8-400*/; code?: string /*4-40, manual*/; eventId?: string /*always send: pins the door to this event*/; deviceInfo?: string /*<=200, no PII*/ }; // exactly one of payload|code
type VerifyResponse = { success: true; data: { ok: boolean; result: 'SUCCESS'|'ALREADY_USED'|'INVALID'|'WRONG_EVENT'|'CANCELLED'|'EXPIRED'; message: string; ticket: Record<string, unknown> | null } };
```
App mapping: scanned QR string -> `payload`; manually typed text -> `code` (uppercased trimmed). Always pass `eventId`. `ok:true` -> show `ticket.attendee_name` and `ticket.checked_in_at`; `ok:false` -> refusal screen by `result`. Never optimistic. Never log `payload`/`code`/`message` (message can carry names). Network error: show error, allow retry (safe: replay yields `ALREADY_USED` with the original time in `message`; show "Already checked in" not "failed"). The client `idempotencyKey` and the `ticketLabel` field are dropped. The app must ignore `ticket.attendee_email` and not store `ticket` beyond the confirmation screen.

Errors (existing envelope `{success:false,error:{code,message}}`): `400 VALIDATION_ERROR` (neither/both of payload|code), `401`, `403` (below SCANNER, or `UNDERAGE` / `AGE_REQUIRED` after #82), `404 Workspace not found`, `429 RATE_LIMITED` (after BE-D2). Door verdicts are HTTP 200 with `ok:false`, not errors.

#### 6. Scan log (existing)
`GET /workspaces/:wid/events/:eid/scans?limit&offset` rows `{code, scanned_by_name, result, scanned_at, ...}` (`t.code` is a ticket credential: app shows only result, time and staff name, never the code). Optional for v1.

### 3.3 Error and authz summary

| Condition | Response | App behaviour |
| --- | --- | --- |
| Not a member / workspace deleted | 404 | close dashboard, refresh workspace list |
| Member below required role | 403 | close dashboard, refresh workspace list |
| Event in another workspace (IDOR) | 404 | "Event not found" |
| Not APPROVED | not enforced server-side on reads (free events allowed by product policy); app hides dashboard | rely on `verification_status` from `GET /workspaces` refreshed on open/foreground |
| Rate limited | 429 `RATE_LIMITED` + `Retry-After` | back off, show retry |
| Age gate (#82) | 403 `UNDERAGE` / `AGE_REQUIRED` | existing global handler |
| Route not deployed (attendees only) | 404 | show "Attendee list not available yet", rest of dashboard works |

### 3.4 Backend tasks (repo: gathr-api)

| ID | Task | Size | PR / migration |
| --- | --- | --- | --- |
| BE-D1 | `GET .../events/:eid/attendees` route + validator + repository query (join `tickets`, `users.name`; no email) + controller + tests (IDOR with other workspace's event id, SCANNER/MEMBER/ANALYST 403, status filter, `q` search, cancelled rows, 100-row clamp, no PII keys in JSON, rate limit) + `API.md` + `tests/routes.json` | M | new PR `feat/organizer-attendees`; **no migration**; confirm index on `tickets(event_id)` (**UNVERIFIED**) |
| BE-D2 | Rate limit on `POST .../tickets/verify`: `createRateLimit({prefix:'ticket-verify', max:120})` per user | S | same PR |
| BE-D3 | Remove `attendee_email` and `user_id` from `GET .../events/:eid/tickets` rows and from `verify` response `ticket` (whitelist like #83's `ticketPayload.js`). **Behaviour change**: first check admin panel and F-14 offline manifest for consumers (**UNVERIFIED**); if a consumer needs it, give that role-restricted route a separate projection | S-M | separate PR (security fix), no migration |
| BE-D4 (optional, deferred) | `GET .../events/:eid/sales-summary` returning count and sum of `CONFIRMED` payment cards bound to issued tickets, labelled organiser-confirmed. Depends on #83 (migration 089 `payment_cards.event_id`) and F-06. Only if owner answers Q1 "yes" | M | after #83; no migration expected |

### 3.5 App tasks (repo: React-native-evns)

| ID | Task | Size |
| --- | --- | --- |
| FE-D1 | Rewrite `organizerService.ts` 117-139: events (status mapping, `apiRequestPage`), per-event stats, overview composed client-side (cap 5 parallel), attendees (new type, 404-tolerant), `checkInOrganizerTicket` -> `verify` (payload vs code, `eventId`, result mapping), remove `getOrganizerDashboard`, `getOrganizerEventSummary`, `getOrganizerPayouts` | M |
| FE-D2 | Update `types.ts` (drop money/payout/`PAUSED|SOLD_OUT|ENDED`/`orderReference`) and `OrganizerDashboardScreen.tsx`: remove Payouts destination and revenue tiles; "Tickets issued / Checked in / Events" only; honest empty states | M |
| FE-D3 | Tests: service mapping tests (including numeric-string stats, verify results, attendees 404), screen tests for refusal states; no PII in `recordError` | S |
| FE-D4 | Update `ORGANIZER_DASHBOARD_API_CONTRACT.md` to point here (docs hygiene, F-02) | S |

## 4. F-04.4 Nearby vibe alerts

### 4.1 Options

| Option | Privacy | Cost | Verdict |
| --- | --- | --- | --- |
| **A. Foreground fixes + existing server worker** (remove native geofencing) | Best: no background location, no note centres on device, removes `ACCESS_BACKGROUND_LOCATION` and iOS "Always" from the Play/App Store review (F-08) | FE only; mostly deleting | **Chosen for launch** |
| B. Build `/me/vibe-note-alerts` + `geofence-candidates` as in the app contract | Exposes exact note centres (= where a creator stood) to every nearby viewer's device; plus Always-location | BE M + keep native + Play background-location review + F-15 device testing | Rejected as written |
| B-lite (4.5) | Coarsened centres, reuse `notifyVibeNotes`, no new pref route | BE S-M | Deferred; build only on owner approval (Q2) |
| Hide the alerts toggle entirely | - | trivial | Fallback; foreground fixes still power `/vibe-notes/nearby` |

Product consequence of A (owner must accept): the user gets a push only when Hiva posts a fix (Nearby open, or app foregrounded) while they are inside a note's radius, are visible on Nearby, and the note is not theirs. Walking past a note with the app closed does nothing. Copy must say "when you open Hiva near a vibe", not "while you walk".

### 4.2 Final endpoints (all exist; no BE work)

```ts
// POST /me/location   (auth; rate limit 60/min/user, prefix location-update)
type LocationUpdate = { lat: number /*-90..90*/; lng: number /*-180..180*/; accuracyMeters?: number /*0..100000*/ };
type LocationFix = { visible: boolean; /* + existing fields */ };
// App MUST stop sending source, enteredNoteIds, observedAt (stripped server-side today, so harmless, but they are dead and misleading).

// GET /me/settings and PATCH /me/settings     (auth)
type SettingsPatch = { notifyVibeNotes?: boolean };   // default true; response shape UNVERIFIED, read from existing settings types

// POST /me/visibility { visible: boolean }   // alerts require visible === true
// GET /vibe-notes/nearby?radiusMeters=50..25000&limit=1..100   // unchanged
// POST /vibe-notes/:noteId/open  -> 200 note | 403 VIBE_NOTE_OUT_OF_RANGE | 410 VIBE_NOTE_ENDED | 404 VIBE_NOTE_NOT_FOUND
```
```json
{"lat":12.9716,"lng":77.5946,"accuracyMeters":18}
```
Push: type `VIBE_NOTE_NEARBY`, `data.noteId` only, generic copy, dedupe `(user, note)` for the life of the note (unchanged, server).

Client rules: post a fix on Nearby open and on app `active`, throttled to at most one per 2 minutes and only when location permission is While-In-Use granted; send real `accuracyMeters` (a fix worse than the note radius never matches, notes can be 50 m); never log coordinates; no persistence of the fix on device beyond the in-memory throttle. The alert toggle writes `notifyVibeNotes`; if the user is not visible, the toggle shows "Turn on Nearby visibility to get alerts" (no silent failure). Tapping the push opens Nearby, refreshes the fix, then calls `/open` (already implemented).

Errors to handle: `429 RATE_LIMITED` (location), `403 UNDERAGE|AGE_REQUIRED`, `400` bad coordinates, `404` on `/open` variants above.

### 4.3 Backend tasks
None required for Option A. Optional hygiene: BE-N1 (S) a test asserting `POST /me/location` ignores `source/enteredNoteIds` (guards against someone making the schema strict and breaking old app builds still shipping them). Repo gathr-api, any PR.

### 4.4 App tasks (repo: React-native-evns)

| ID | Task | Size |
| --- | --- | --- |
| FE-N1 | Delete `vibeNoteGeofencing.ts`, `getVibeNoteGeofenceCandidates`, `get/setVibeNoteAlertPreference`, types, `installVibeNoteGeofenceEntryHandler`/`clearVibeNoteRegions` exports (`nearby/index.ts`, `MainNavigation.tsx` import), the `registerLocalDataWiper` hook for regions, headless task `HivaVibeNoteGeofenceEntry` registration (grep for it) and the Nearby.tsx alert/permission UI | M |
| FE-N2 | Remove native: Android `geofence/*` (5 files), `MainApplication.kt` package registration, manifest `ACCESS_BACKGROUND_LOCATION` plus receiver/service entries, Google Play geofencing dependency if unused elsewhere; iOS `VibeNoteGeofence.swift`, `VibeNoteGeofenceBridge.m`, pbxproj references, `NSLocationAlwaysAndWhenInUseUsageDescription` and any `UIBackgroundModes: location`. Keep When-In-Use strings. Verify with `adb shell dumpsys package` and merged-manifest check that no background-location permission remains | M |
| FE-N3 | Foreground fix poster (throttled) + alert toggle bound to `notifyVibeNotes` and visibility state; copy per 4.1 | S |
| FE-N4 | Tests: throttle, toggle writes `notifyVibeNotes`, no `source/enteredNoteIds` in body, sign-out leaves nothing registered; update `NEARBY_VIBES_GEOFENCING_CONTRACT.md` to "superseded by this doc" and F-08 store declarations (background location removed) | S |

### 4.5 Deferred B-lite spec (not to be built without Q2)
`GET /vibe-notes/geofence-candidates?limit=1..18`, auth, rate limit 6/min/user, requires `notifyVibeNotes=true` and viewer `visible=true`. Returns only notes the server would match for this viewer (same privacy/block/expiry predicates as `findMatchingForFix`) within 2 km of the viewer's last fix (<= 30 min old). **Centres must be snapped** to a ~200 m grid server-side and `radiusMeters` returned as `min(note.radius + snapError, 700)`, so exact creator position is never disclosed; the existing server worker remains the authority on entry. Response `data: [{ noteId, latitude, longitude, radiusMeters, expiresAt }]`, no body/preview/creator. No coordinate logging. Needs `ACCESS_BACKGROUND_LOCATION`, Play declaration, iOS Always, and F-15 device testing. No migration. Size BE S-M, FE M (re-add native, which is why FE-N2 should delete rather than keep dead code: git history holds it). Position it as the first P2 follow-up if analytics show foreground alerts are used.

## 5. F-04.5 Creator onboarding

### 5.1 Options

| Option | Verdict |
| --- | --- |
| Build `/creators/me/onboarding` with bank + IFSC capture and admin review | Rejected for now. Needs encrypted store, migration, KYC/penny-drop decision, admin tooling, and puts bank details in a second code path. Nothing else in BE requires it today. |
| **Map to existing routes; no bank capture** | **Chosen.** Everything a creator needs to receive gifts and request a payout exists. |
| Build encrypted `creator_payout_accounts` (mirror of `workspace_payout_accounts`, AES-256-GCM, `ORGANISER_PAYOUT_ENCRYPTION_KEY`) | Phase 2, only if Q3 says admins need bank details to pay creators (5.6). |

### 5.2 Final endpoints (all exist)

```ts
// Create profile  POST /creators/me   (201)
type CreatorCreate = { handle: string /* ^[a-z0-9_]{3,32}$ */; displayName: string /*1-80*/; bio?: string /*<=500*/ };
// Update          PATCH /creators/me  (>=1 field)
type CreatorUpdate = Partial<CreatorCreate>;
// Read own        GET /creators/:myUserId   (404 = no creator profile yet)
type Creator = { userId: string; handle: string; displayName: string; bio: string|null; avatarUrl: string|null; followerCount: number; isFollowing: boolean };
// Wallet          GET /creators/me/wallet   (404 = no profile, or creator.payouts.enabled off)
type CreatorWallet = { currency: 'INR'; balanceMinor: number|null; reservedMinor: number; debtMinor: number; payoutHold: boolean; availableMinor: number; payoutAvailable: boolean; unavailableReason?: 'NON_INR_GIFT_HISTORY' | 'VOIDED_PURCHASE_DEBT' };
// Request payout  POST /creators/me/payout-requests
type PayoutRequestBody = { amountMinor: number /*int>0*/; idempotencyKey: string /*8-128*/ };   // (field names from service; exact schema src/validators/creator.schema.js payoutRequest, UNVERIFIED lines)
// History         GET /creators/me/payout-requests?limit&offset   status REQUESTED|APPROVED|REJECTED (+ paid state, UNVERIFIED)
```
```json
{"handle":"asha_beats","displayName":"Asha","bio":"Lo-fi sets every Friday"}
```
Errors: `409` handle/profile exists, `400` validation, `404` as above, `409` payout: insufficient balance / on hold / non-INR history / idempotency mismatch, `403 UNDERAGE|AGE_REQUIRED`. Authz: any authenticated adult; all `/creators/me/*` act only on `req.user.id`.

### 5.3 Mapping from the app's current model

| App field | New source |
| --- | --- |
| `status` NOT_STARTED / APPROVED | `GET /creators/:me` 404 / 200. `PENDING` and `REJECTED` states do not exist; remove them |
| `about` | `bio` |
| `categories` | no BE field: remove from UI (not stored anywhere) |
| `accountHolder`, `accountNumber`, `ifsc`, `maskedAccount`, `payoutStatus` | **removed**; the app never collects or displays bank details |
| `payoutEligible` (used in `AudioRoomStage.tsx:80` to nudge after a gift) | `creator exists && wallet.payoutAvailable`; nudge text becomes "Create your creator profile" when 404, nothing when profile exists |

### 5.4 Privacy and security
No bank data touches the app or logs. No new PII. Withdraw amounts are server-validated against the wallet in a transaction with an idempotency key (existing). Wallet 404 must not be treated as "not a creator" if the real cause is the `creator.payouts.enabled` flag: app distinguishes by calling profile read first.

### 5.5 Tasks

| ID | Repo | Task | Size |
| --- | --- | --- | --- |
| BE-C1 | gathr-api | None for Phase 1. Optional (S): confirm `POST /creators/me/payout-requests` zod field names and document in `API.md` | S |
| FE-C1 | app | Rewrite `creatorService.ts` to the 5.2 calls; keep a `CreatorOnboarding`-shaped adapter if screens depend on it; delete bank fields | S |
| FE-C2 | app | `CreatorOnboardingScreen.tsx`: handle, display name, bio only; "Earnings and payouts" panel from wallet (available, on hold reasons) and a request-payout action with idempotency key; no bank inputs; copy states how payouts are settled once Q3 is answered | M |
| FE-C3 | app | `AudioRoomStage.tsx` gift nudge per 5.3; tests for 404, flag-off, hold states | S |

### 5.6 Phase 2 (only on Q3 = "admins need bank details"): encrypted creator payout account
Migration **090** `creator_payout_accounts(creator_id uuid PK references creators(user_id), holder_enc, account_enc, ifsc_enc, suffix char(4), status PENDING|VERIFIED|REJECTED, revision int, rejection_reason, updated_at)`, same encryption helper and key as `workspace_payout_accounts`, status resets to PENDING on change (as #81 does). Routes: `PUT /creators/me/payout-account {accountHolder, accountNumber, ifsc}` (204-style, returns `{status, accountSuffix, rejectionReason}`), `GET /creators/me/payout-account` (same, masked), admin `verify|reject|reveal` mirroring #81 with audit rows. Payout request creation requires `status='VERIFIED'` (409 `PAYOUT_ACCOUNT_NOT_VERIFIED`). Rate limit 10/hour. Size BE L, FE M. The app must not ship a bank form before BE deploys and enables it (route 404 => form hidden).

## 6. Migration needs
- Phase 1 of all three areas: **none**.
- Next free number: **090** (origin/main max = 086; open PRs take 087 #82, 088 #81, 089 #83; no other open PRs). 090 is only reserved for 5.6 if triggered; BE-D4 and B-lite expect none. Whoever opens a migration PR must re-run `git ls-tree origin/main migrations/` and `gh pr list` first.
- Note: two 085 files exist on main (F-01.2); unrelated to this work.

## 7. Sequencing (deploys must never break the other side)

1. BE-D1 + BE-D2 (additive route + limiter) merge and deploy. Old app builds are unaffected (they already 404 on the removed routes).
2. BE-D3 (PII trim) after consumer check; deploy any time before or after the app, but before the app starts relying on the trimmed shape (app already ignores the extra fields, so order is free).
3. App builds ship FE-D*, FE-N*, FE-C* together or independently. They call only existing routes plus `attendees`, which the app treats as 404-tolerant, so the app can ship before or after BE-D1 without crashing.
4. Drift script (F-04.1) turns on after all three FE tasks land: it must fail CI on any new FE path absent from BE `routes.json`. Land it in warn-only mode first, flip to blocking when FE-D1/N1/C1 merge.
5. Native removal (FE-N2) ships in one release together with the F-08 store declaration update (background location removed). Play Console data-safety/permission declaration changes are USER-GATED.
6. Age gate (#82) and payout verification (#81) merge independently of this work; nothing here depends on 087/088/089. #83 matters only for BE-D4.

## 8. Sync checklist (what the F-04.1 drift script and CI should assert)

1. Every `apiRequest`/`apiRequestPage` path in `src/**/*Service.ts` (normalise `${...}` to `:id`, strip query) is present in BE `tests/routes.json` as `METHOD /path` (fetch `origin/main` copy in CI), or on a justified allowlist entry with an owner and removal date.
2. These must be **absent** from the app (regression guard): `/workspaces/:id/organizer-dashboard`, `/organizer-summary`, `/check-ins`, `/payouts`, `/me/vibe-note-alerts`, `/vibe-notes/geofence-candidates`, `/creators/me/onboarding`, and `/workspaces/:id/events/:id/tickets`.
3. `GET /workspaces/:id/events/:id/attendees` is allowlisted until BE-D1 appears in `routes.json`; script fails if still allowlisted after it does.
4. Query-value check (not just paths): `status=` values sent to workspace events are in `{DRAFT,PUBLISHED,CANCELLED,COMPLETED}` (catches finding 6); extend with a small enum table fed from BE validators.
5. Response-shape contract tests (jest, fixtures from BE `API.md` / recorded examples): `OrganizerAttendee` has no `email|phone|code` keys; verify `ticket` is not persisted; wallet type matches 5.2.
6. Native/permission guard: merged Android manifest has no `ACCESS_BACKGROUND_LOCATION`; `Info.plist` has no `NSLocationAlways*`; no `NativeModules.VibeNoteGeofence`.
7. BE side (gathr-api CI): `tests/routes.json` regenerated, attendees route has IDOR + role tests, `/me/location` schema stays non-strict.

## 9. Open questions for the owner

- **Q1 (revenue)**: Paid tickets are paid off-platform and the platform has no money ledger. OK to show no revenue or payouts in the organiser dashboard? Or do you want BE-D4 (sum of organiser-confirmed payment cards, clearly labelled "confirmed by you, not settled")? Recommendation: hide now, decide with F-06.
- **Q2 (Nearby)**: Accept alerts that only fire while the app is open (Option A) and drop closed-app alerts for launch? If you want closed-app alerts, approve B-lite (coarsened note centres, background-location Play review, real-device testing) as a post-launch feature. Also accept that users hidden from Nearby get no alerts.
- **Q3 (creator payouts)**: How are creators paid today when an admin approves a payout request (the API only records `externalReference`)? If admins contact creators for bank details off-band, Phase 1 stands. If they need details in-product, approve Phase 2 (5.6, migration 090, KYC/penny-drop policy, encryption key ops).
- **Q4 (PII fix)**: Approve BE-D3 (remove attendee email from the existing `/tickets` and `verify` responses)? It is a security fix to a deployed route; the only risk is an unknown consumer (admin panel, **UNVERIFIED**).
- **Q5 (creator categories)**: Drop `categories` or add a BE field later? Recommendation: drop.
- **Q6 (dashboard gate)**: Dashboard only for APPROVED workspaces is enforced in the app, not the API (reads of your own workspace data stay allowed). OK, or should the API also return 403 `VERIFICATION_REQUIRED`?

## 10. UNVERIFIED list
- Exact role set of `workspaceReaders` and whether `GET /workspaces` returns `verification_status`.
- Whether `pg` count strings are parsed to numbers (stats response types).
- Whether a global rate limiter covers `tickets/verify`; whether query strings (`q`) are logged by the access logger.
- Existence of index on `tickets(event_id)` and `users.name` search cost for large events.
- Other consumers (admin panel, offline scanner manifest) of the `/tickets` and `verify` `ticket` fields.
- Exact `payoutRequest` zod field names and the payout "paid" state naming; `/me/settings` response shape.
- Whether Android Play-services geofencing dependency and `UIBackgroundModes` are referenced elsewhere in the app (verify when deleting).
- Nothing in this document was executed against a running backend; all behaviour is from reading `origin/main` and the three PR diffs.
