# Route reconciliation: app calls routes the backend does not have (TASKS.md F-04.2, F-04.4, F-04.5)

Status: owner decisions recorded 2026-10-15 (section 9); items still open are marked there. Author: Architect. Date: 2026-10-15.
Audience: Backend-Dev and Frontend-Dev (build from sections 3-5), owner (sections 1, 9).
Backend truth = `gathr-api` `origin/main` fetched 2026-10-15, plus open PRs #81 (088 payout verification), #82 (087 age gate), #83 (089 paid-flow security). Anything I could not verify is marked **UNVERIFIED**.

## 1. Decisions at a glance

| Area | Decision | Option | Cost |
| --- | --- | --- | --- |
| F-04.2 Organiser dashboard | **Reuse existing BE routes** for overview, events, stats, check-in, scan log, plus the PII-minimal `GET .../attendees` route (**merged, gathr-api #84**). Scanner email removal is also merged (#84). **Revenue and payout screens hidden for now**; they return with on-platform ticket payments (section 3, `docs/design/ONPLATFORM_TICKET_PAYMENTS.md`). | Reuse + attendees route (done) + hide | BE: done. FE: M |
| F-04.4 Nearby alerts | **Unchanged** (owner decision, 2026-10-15): native geofencing and background location stay as they are. The missing routes (`/me/vibe-note-alerts`, `/vibe-notes/geofence-candidates`) remain a backend gap recorded in the drift allowlist. Implementing them is deferred; Option B / B-lite stay as documented alternatives (section 4). | Unchanged; backend gap recorded | BE: deferred. FE: none |
| F-04.5 Creator onboarding | **Encrypted creator payout account required.** Gifts convert to diamonds/beans and the platform pays the creator when diamonds are redeemed, so payout details are needed. Phase 1 uses existing `POST/PATCH /creators/me`, `GET /creators/:myId`, `GET /creators/me/wallet`, `POST /creators/me/payout-requests`. Bank capture follows the Phase 2 design in 5.6 (migration 090): design and security review before any code; no app screen collects bank details until the backend stores them encrypted and returns only masked values. | Reuse now; encrypted payout account (5.6) required | BE: M-L (5.6). FE: S-M, after 5.6 |

Verification of the TASKS.md recommendations: the dashboard recommendation **partly did not hold** (the existing `/tickets` route leaked attendee email, fixed in #84; there is still no revenue or payout data). The Nearby recommendation is **not adopted**: the owner keeps native geofencing as it is. The creator recommendation **did not hold**: the platform pays creators on diamond redemption, so bank details are required (5.6).

## 2. Findings that shaped the decisions (verified against origin/main)

1. All three app contracts (`ORGANIZER_DASHBOARD_API_CONTRACT.md`, `NEARBY_VIBES_GEOFENCING_CONTRACT.md`, creator onboarding in `FEATURES.md`) were written by the app side. None of `organizer-dashboard`, `organizer-summary`, `/attendees`, `/check-ins`, `/payouts`, `/me/vibe-note-alerts`, `/vibe-notes/geofence-candidates`, `/creators/me/onboarding` exists in `tests/routes.json` or any router.
2. Existing organiser routes (`src/routes/workspace.routes.js`): `GET /workspaces/:id/events` (reader roles), `GET .../events/:eid/stats` (reader roles), `GET .../events/:eid/tickets` (min role SCANNER), `GET .../events/:eid/scans` (SCANNER), `GET /workspaces/:id/scans` (ADMIN), `POST /workspaces/:id/tickets/verify` (SCANNER). Offline scanner module is mounted at `/scanner` (`manifest`, `sync`, devices, batches) and is out of scope here (F-14).
3. **`GET .../events/:eid/tickets` returns `DETAIL_SELECT` rows** (`ticket.repository.js`): `t.*` minus `secret`, plus `attendee_email`, `user_id`, ticket `code`, event/workspace fields. Any SCANNER-role member (lowest staff role) can read every attendee's email. PR #83 whitelists the realtime ticket frame but does not touch this REST route. This was an existing exposure and is why the app must not reuse it for the attendee list. **Fixed: gathr-api #84 (BE-D3).**
4. `POST .../tickets/verify` always answers HTTP 200 with `{ok, result, message, ticket}`; the `ticket` object is the same unsanitised-minus-secret row (includes `attendee_email`). Fixed in gathr-api #84 (BE-D3). Results: `SUCCESS | ALREADY_USED | INVALID | WRONG_EVENT | CANCELLED | EXPIRED`. Check-in is atomic (`FOR UPDATE` plus status guard), so the app's `idempotencyKey` is unnecessary: a replay returns `ALREADY_USED`. Every attempt is written to `ticket_scans`. No dedicated rate limiter on this route (**UNVERIFIED** whether a global one exists in `app.js`). Ticket codes are `GTHR-XXXX-XXXX` from 8 random bytes over a 32-char alphabet (about 40 bits), so brute force is impractical if rate limited.
5. **No revenue or payout ledger for tickets.** Paid ticketing is off-platform: organiser shares a payment card (UPI/bank/link) in chat, marks it confirmed, then issues the ticket (`payment_cards`, `PAID_TICKET_FLOW.md`). `tickets` has no price column. `workspace_payout_accounts` only gates paid publishing (#81). Therefore `grossRevenueMinor`, `nextPayoutMinor`, `/payouts`, payout history have nothing to read. The only real money figure is the sum of `payment_cards.amount_minor` where `status='CONFIRMED'`, which is organiser-asserted, not provider-settled. Owner decision (2026-10-15): ticket money will later be collected by Hiva and paid to organisers after a platform commission (on-platform checkout, `docs/design/ONPLATFORM_TICKET_PAYMENTS.md`). Until that ships there is no ledger, and the payout design is blocked on the CA/Razorpay licensing question (Route eligibility); it is not designed here.
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
| Hide the whole dashboard | Fallback if the attendees route is missing on an older backend: ship Overview/Events/Check-in (all reuse), hide Attendees tab behind 404 tolerance. |

### 3.2 Final endpoints (all under the standard envelope `{success:true,data,meta?}`)

All require `Authorization: Bearer`. "Reader roles" = `workspaceReaders` (exact role set **UNVERIFIED**, defined at `workspace.routes.js:29`; contract requires OWNER/ADMIN for the dashboard, so the app shows the dashboard only to OWNER/ADMIN of an ACTIVE, `verification_status = APPROVED` workspace and treats a 403/404 as "access revoked").

| # | Endpoint | Status | Roles | Used for |
| --- | --- | --- | --- | --- |
| 1 | `GET /workspaces` | exists | any member | workspace list; must carry `verification_status` (**UNVERIFIED** that the list projection includes it; column exists on `workspaces`, migration 085) |
| 2 | `GET /workspaces/:wid/events?status=&limit=&offset=` | exists | readers | Events tab |
| 3 | `GET /workspaces/:wid/events/:eid/stats` | exists | readers | counts |
| 4 | `GET /workspaces/:wid/events/:eid/attendees?q=&status=&limit=&offset=` | exists (gathr-api #84, BE-D1) | OWNER, ADMIN | Attendees tab |
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
| Route not deployed (backend without #84) | 404 | show "Attendee list not available yet", rest of dashboard works |

### 3.4 Backend tasks (repo: gathr-api)

| ID | Task | Size | PR / migration |
| --- | --- | --- | --- |
| BE-D1 | `GET .../events/:eid/attendees` route + validator + repository query (join `tickets`, `users.name`; no email) + controller + tests (IDOR with other workspace's event id, SCANNER/MEMBER/ANALYST 403, status filter, `q` search, cancelled rows, 100-row clamp, no PII keys in JSON, rate limit) + `API.md` + `tests/routes.json` | M | **DONE: gathr-api #84.** No migration; index on `tickets(event_id)` still **UNVERIFIED** |
| BE-D2 | Rate limit on `POST .../tickets/verify`: `createRateLimit({prefix:'ticket-verify', max:120})` per user | S | Open; not part of #84 (status to confirm) |
| BE-D3 | Remove `attendee_email` and `user_id` from `GET .../events/:eid/tickets` rows and from `verify` response `ticket` (whitelist like #83's `ticketPayload.js`). **Behaviour change**: first check admin panel and F-14 offline manifest for consumers (**UNVERIFIED**); if a consumer needs it, give that role-restricted route a separate projection | S-M | **DONE: gathr-api #84** (no migration) |
| BE-D4 (superseded) | Revenue summary is not built now. Revenue returns with on-platform ticket payments (`ONPLATFORM_TICKET_PAYMENTS.md`); no design here. | - | blocked on on-platform payments and CA/Razorpay licensing |

### 3.5 App tasks (repo: React-native-evns)

| ID | Task | Size |
| --- | --- | --- |
| FE-D1 | Rewrite `organizerService.ts` 117-139: events (status mapping, `apiRequestPage`), per-event stats, overview composed client-side (cap 5 parallel), attendees (new type, 404-tolerant), `checkInOrganizerTicket` -> `verify` (payload vs code, `eventId`, result mapping), remove `getOrganizerDashboard`, `getOrganizerEventSummary`, `getOrganizerPayouts` | M |
| FE-D2 | Update `types.ts` (drop money/payout/`PAUSED|SOLD_OUT|ENDED`/`orderReference`) and `OrganizerDashboardScreen.tsx`: remove Payouts destination and revenue tiles; "Tickets issued / Checked in / Events" only; honest empty states; payouts and revenue stay hidden until on-platform payments ship | M |
| FE-D3 | Tests: service mapping tests (including numeric-string stats, verify results, attendees 404), screen tests for refusal states; no PII in `recordError` | S |
| FE-D4 | Update `ORGANIZER_DASHBOARD_API_CONTRACT.md` to point here (docs hygiene, F-02) | S |

## 4. F-04.4 Nearby vibe alerts

### 4.1 Options

| Option | Privacy | Cost | Verdict |
| --- | --- | --- | --- |
| **Unchanged (owner decision)**: native geofencing and background location stay as they are; alerts work as today | Current behaviour, unchanged | none | **Chosen** |
| B. Build `/me/vibe-note-alerts` + `geofence-candidates` as in the app contract | Exposes exact note centres (= where a creator stood) to every nearby viewer's device; plus Always-location | BE M + Play background-location review + F-15 device testing | Documented alternative, deferred |
| B-lite (4.5) | Coarsened centres, reuse `notifyVibeNotes`, no new pref route | BE S-M | Documented alternative, deferred |
| Hide the alerts toggle entirely | - | trivial | Not chosen |

Consequence: none for this doc. The app's existing alert path stays as it is. The two missing routes are a backend gap; the drift allowlist records them as "Nearby unchanged by owner decision; backend route pending". Implementing them (B or B-lite) is deferred until the owner asks.

### 4.2 Final endpoints (all exist; no BE work)

```ts
// POST /me/location   (auth; rate limit 60/min/user, prefix location-update)
type LocationUpdate = { lat: number /*-90..90*/; lng: number /*-180..180*/; accuracyMeters?: number /*0..100000*/ };
type LocationFix = { visible: boolean; /* + existing fields */ };
// The app's extra fields (source, enteredNoteIds, observedAt) are stripped server-side today; harmless, no app change planned.

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

Client rules: no change. The Option A client rules (foreground-only fix posting, throttling) are withdrawn.

Errors to handle: `429 RATE_LIMITED` (location), `403 UNDERAGE|AGE_REQUIRED`, `400` bad coordinates, `404` on `/open` variants above.

### 4.3 Backend tasks
None required.

### 4.4 App tasks

None. Native geofencing, background location and the alert toggle stay as they are. No app or backend task.

### 4.5 Deferred B-lite spec (not to be built without an owner request)
`GET /vibe-notes/geofence-candidates?limit=1..18`, auth, rate limit 6/min/user, requires `notifyVibeNotes=true` and viewer `visible=true`. Returns only notes the server would match for this viewer (same privacy/block/expiry predicates as `findMatchingForFix`) within 2 km of the viewer's last fix (<= 30 min old). **Centres must be snapped** to a ~200 m grid server-side and `radiusMeters` returned as `min(note.radius + snapError, 700)`, so exact creator position is never disclosed; the existing server worker remains the authority on entry. Response `data: [{ noteId, latitude, longitude, radiusMeters, expiresAt }]`, no body/preview/creator. No coordinate logging. Needs `ACCESS_BACKGROUND_LOCATION`, Play declaration, iOS Always, and F-15 device testing. No migration. Size BE S-M, FE M (native geofencing is kept, so no native re-add). Deferred; build only on owner request.

## 5. F-04.5 Creator onboarding

### 5.1 Options

Owner decision (2026-10-15): gifts convert to diamonds/beans, and when diamonds are redeemed the platform pays the creator. Bank/payout details are therefore required (5.6).

| Option | Verdict |
| --- | --- |
| Build `/creators/me/onboarding` with bank + IFSC capture and admin review now | Superseded by the owner decision above. Build the encrypted design in 5.6 instead, with design and security review first. |
| **Phase 1: existing routes for profile, wallet and payout requests; no bank capture yet** | Ships first. Payouts cannot settle to a bank until 5.6 exists. |
| **Encrypted `creator_payout_accounts` (mirror of `workspace_payout_accounts`, AES-256-GCM, `ORGANISER_PAYOUT_ENCRYPTION_KEY`)** | **Required** (owner decision). Design and security review before any code (5.6). |

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
| `accountHolder`, `accountNumber`, `ifsc`, `maskedAccount`, `payoutStatus` | **removed in Phase 1**; reintroduced only through 5.6, and then masked values only |
| `payoutEligible` (used in `AudioRoomStage.tsx:80` to nudge after a gift) | `creator exists && wallet.payoutAvailable`; nudge text becomes "Create your creator profile" when 404, nothing when profile exists |

### 5.4 Privacy and security
No bank data touches the app or logs in Phase 1; Phase 2 returns masked values only. No new PII. Withdraw amounts are server-validated against the wallet in a transaction with an idempotency key (existing). Wallet 404 must not be treated as "not a creator" if the real cause is the `creator.payouts.enabled` flag: app distinguishes by calling profile read first.

### 5.5 Tasks

| ID | Repo | Task | Size |
| --- | --- | --- | --- |
| BE-C1 | gathr-api | None for Phase 1. Optional (S): confirm `POST /creators/me/payout-requests` zod field names and document in `API.md` | S |
| FE-C1 | app | Rewrite `creatorService.ts` to the 5.2 calls; keep a `CreatorOnboarding`-shaped adapter if screens depend on it; delete bank fields | S |
| FE-C2 | app | `CreatorOnboardingScreen.tsx`: handle, display name, bio only; "Earnings and payouts" panel from wallet (available, on hold reasons) and a request-payout action with idempotency key; no bank inputs in Phase 1; copy states how payouts are settled (platform pays on diamond redemption) | M |
| FE-C3 | app | `AudioRoomStage.tsx` gift nudge per 5.3; tests for 404, flag-off, hold states | S |

### 5.6 Phase 2 (required, owner decision 2026-10-15): encrypted creator payout account
Migration **090** `creator_payout_accounts(creator_id uuid PK references creators(user_id), holder_enc, account_enc, ifsc_enc, suffix char(4), status PENDING|VERIFIED|REJECTED, revision int, rejection_reason, updated_at)`, same encryption helper and key as `workspace_payout_accounts`, status resets to PENDING on change (as #81 does). Routes: `PUT /creators/me/payout-account {accountHolder, accountNumber, ifsc}` (204-style, returns `{status, accountSuffix, rejectionReason}`), `GET /creators/me/payout-account` (same, masked), admin `verify|reject|reveal` mirroring #81 with audit rows. Payout request creation requires `status='VERIFIED'` (409 `PAYOUT_ACCOUNT_NOT_VERIFIED`). Rate limit 10/hour. Size BE L, FE M. The app must not ship a bank form before BE deploys and enables it (route 404 => form hidden). Design and security review (KYC/penny-drop policy, key ops, masked-only responses) come before any code. No app screen collects bank details until the backend stores them encrypted and returns only masked values.

## 6. Migration needs
- Phase 1 of all three areas: **none**.
- Next free number: **090** (origin/main max = 086; open PRs take 087 #82, 088 #81, 089 #83; no other open PRs). 090 is reserved for 5.6, which is now required (design and security review first); BE-D4 is superseded and B-lite expects none. Whoever opens a migration PR must re-run `git ls-tree origin/main migrations/` and `gh pr list` first.
- Note: two 085 files exist on main (F-01.2); unrelated to this work.

## 7. Sequencing (deploys must never break the other side)

1. BE-D1 (attendees) is merged in gathr-api #84. BE-D2 (verify limiter) is not in #84; status to confirm. Old app builds are unaffected (they already 404 on the removed routes).
2. BE-D3 (PII trim) after consumer check; deploy any time before or after the app, but before the app starts relying on the trimmed shape (app already ignores the extra fields, so order is free).
3. App builds ship FE-D* and FE-C* together or independently. They call only existing routes plus `attendees`, which the app treats as 404-tolerant, so the app can ship before or after BE-D1 without crashing.
4. Drift check (`check:contract`, PR #25) blocks new app routes absent from backend `routes.json`. The Nearby routes stay on the allowlist as backend gaps (owner decision).
5. No native or store-declaration change from this doc: native geofencing and background location are unchanged. Play Console changes stay USER-GATED if ever needed.
6. Age gate (#82) and payout verification (#81) merge independently of this work; nothing here depends on 087/088/089. #83 matters only for BE-D4.

## 8. Sync checklist (what the F-04.1 drift script and CI should assert)

1. Every `apiRequest`/`apiRequestPage` path in `src/**/*Service.ts` (normalise `${...}` to `:id`, strip query) is present in BE `tests/routes.json` as `METHOD /path` (fetch `origin/main` copy in CI), or on a justified allowlist entry with an owner and removal date.
2. These must be **absent** from the app (regression guard): `/workspaces/:id/organizer-dashboard`, `/organizer-summary`, `/check-ins`, `/payouts`, `/creators/me/onboarding`, and `/workspaces/:id/events/:id/tickets`. The two Nearby routes are instead allowlisted as backend gaps.
3. `GET /workspaces/:id/events/:id/attendees` is served by gathr-api #84; remove it from the allowlist once `routes.json` lists it.
4. Query-value check (not just paths): `status=` values sent to workspace events are in `{DRAFT,PUBLISHED,CANCELLED,COMPLETED}` (catches finding 6); extend with a small enum table fed from BE validators.
5. Response-shape contract tests (jest, fixtures from BE `API.md` / recorded examples): `OrganizerAttendee` has no `email|phone|code` keys; verify `ticket` is not persisted; wallet type matches 5.2.
6. Native/permission guard: none from this doc. Native geofencing and background location are unchanged.
7. BE side (gathr-api CI): `tests/routes.json` regenerated, attendees route has IDOR + role tests, `/me/location` schema stays non-strict.

## 9. Owner decisions and open questions

Resolved (owner, 2026-10-15):
- **Q1 (revenue)**: Hidden for now. Revenue and payout screens return with on-platform ticket payments (Hiva collects, then pays organisers after a commission; `docs/design/ONPLATFORM_TICKET_PAYMENTS.md`). BE-D4 is superseded.
- **Q2 (Nearby)**: Unchanged. Native geofencing and background location stay; the two missing routes remain a backend gap in the drift allowlist. Option B / B-lite are documented alternatives, deferred.
- **Q3 (creator payouts)**: The platform pays creators when diamonds are redeemed (gifts convert to diamonds/beans). An encrypted creator payout account is required: Phase 2 (5.6, migration 090), with design and security review first.
- **Q4 (PII fix)**: Approved. Merged in gathr-api #84 (BE-D3), together with the attendees route (BE-D1).

Still open:
- **Licensing (Route eligibility)**: CA/Razorpay must confirm whether Hiva can collect ticket money and pay organisers. This blocks the payout design, which is not designed here.
- **Q5 (creator categories)**: Drop `categories` or add a BE field later? Recommendation: drop. Not answered.
- **Q6 (dashboard gate)**: The dashboard is shown only for APPROVED workspaces, enforced in the app, not the API. OK, or should the API also return 403 `VERIFICATION_REQUIRED`? Not answered.

## 10. UNVERIFIED list
- Exact role set of `workspaceReaders` and whether `GET /workspaces` returns `verification_status`.
- Whether `pg` count strings are parsed to numbers (stats response types).
- Whether a global rate limiter covers `tickets/verify`; whether query strings (`q`) are logged by the access logger.
- Existence of index on `tickets(event_id)` and `users.name` search cost for large events.
- Other consumers (admin panel, offline scanner manifest) of the `/tickets` and `verify` `ticket` fields.
- Exact `payoutRequest` zod field names and the payout "paid" state naming; `/me/settings` response shape.
- Whether Android Play-services geofencing dependency and `UIBackgroundModes` are referenced elsewhere in the app (verify when deleting).
- Nothing in this document was executed against a running backend; all behaviour is from reading `origin/main` and the three PR diffs.
