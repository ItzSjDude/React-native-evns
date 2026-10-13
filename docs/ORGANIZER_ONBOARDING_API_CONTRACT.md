# Organiser onboarding API contract

App-side contract for the four-step **Become an organiser** flow and the **Host an event** flow for existing organisers. The app uses workspace listing to identify active Owner/Admin workspaces whose verification is **APPROVED**; only those workspaces can open the later-event form. Deploy the routes below before enabling these flows in production.

## Flow

1. Create a workspace profile.
2. Submit one organisation document for review. Free events remain publishable while review is pending; paid ticketing stays locked until approval.
3. Add a payout account and choose a payout schedule.
4. Create the first event as a draft. The organiser can edit and publish it later.

All routes below require a signed-in user. The backend derives workspace ownership from the authenticated caller and must not accept a client-supplied owner ID.

`GET /workspaces` must include `verification_status` on each workspace row: `NOT_SUBMITTED`, `PENDING`, `APPROVED`, or `REJECTED`. This status is safe to return to workspace members; verification document URLs and reviewer-only notes are not.

## Workspace profile

`POST /workspaces`

```json
{
  "name": "Kala Collective",
  "type": "INDEPENDENT_ORGANISER",
  "city": "Mumbai",
  "eventKinds": ["LIVE_SHOWS", "WORKSHOPS"],
  "logoUrl": "https://cdn.example/workspaces/logo.webp"
}
```

Return the created workspace row directly in the standard API envelope's `data` field, using the existing workspace response fields and the caller's `OWNER` membership. The app also accepts a legacy `{ "workspace": <row> }` data wrapper. Validate name, city, type, categories, URL and duplicate policy server-side. A retried request must not silently create duplicate workspaces; support an idempotency key or return a stable conflict the app can resolve by reloading `GET /workspaces`.

`PATCH /workspaces/:workspaceId` accepts the same profile fields for edits when the user returns to step 1. It is restricted to `OWNER` / `ADMIN` and must not change membership or verification state.

## Verification upload and review

Extend `POST /media/upload-url` with purpose `organizer_verification`. Accept JPEG and PNG document photos up to 10 MB. The object must be private; it must not be served through public workspace/event media URLs. The upload URL response shape stays the existing `{uploadUrl, key, fileUrl, requiredHeaders, expiresIn}`. The app submits `fileUrl` only to the verification route below. Do not put the file URL in public workspace data.

`POST /workspaces/:workspaceId/verification`

```json
{ "documentType": "GST_CERTIFICATE", "fileUrl": "https://private.example/uploaded-document" }
```

`documentType` is one of `GST_CERTIFICATE`, `BUSINESS_PAN`, or `PERSONAL_PAN_AADHAAR`. Return `{ "status": "PENDING" | "APPROVED" | "REJECTED" }`. Require `OWNER` or `ADMIN`, validate that the uploaded object belongs to this authenticated workspace submission, retain it only under the documented verification retention policy, and audit reviewer decisions. Repeated submission should replace the pending document or return the current review state; it must not create multiple active reviews accidentally.

After upload, set the workspace's `verification_status` to `PENDING`. An authorised reviewer approves or rejects it through the backend's review workflow; for a REST admin console, use `PATCH /admin/workspaces/:workspaceId/verification` with `{ "status": "APPROVED" | "REJECTED", "reviewNote": "optional internal note" }`. Restrict this action to verification reviewers and audit reviewer ID, timestamp, previous status and decision. Do not expose the internal review note in normal workspace responses. On approval, update `verification_status` atomically so the next `GET /workspaces` returns `APPROVED`.

## Payout account

`PUT /workspaces/:workspaceId/payout-account`

```json
{
  "accountHolder": "Kala Collective LLP",
  "accountNumber": "50100234564821",
  "ifsc": "SMP0000123",
  "payoutSchedule": "AFTER_EACH_EVENT"
}
```

`payoutSchedule` is `AFTER_EACH_EVENT` or `EVERY_MONDAY`. Validate bank details with the payout provider and return only `{ "status": "PENDING" | "VERIFIED" }` plus a masked account suffix if needed. Never echo or log the full account number. Encrypt sensitive payout data at rest, restrict access to payout services and authorised workspace owners, and support correction/removal through a separately authorised payout-management flow.

## First event

`POST /workspaces/:workspaceId/events`

```json
{
  "title": "Monsoon Sessions, Bandra",
  "description": "An evening of live music and local food.",
  "coverUrl": "https://cdn.example/events/monsoon-cover.webp",
  "startsAt": "2026-10-24T19:00:00.000Z",
  "venue": "Bandra Studio, Bandra West",
  "isPaid": false,
  "capacity": 500,
  "status": "DRAFT"
}
```

Create an event draft with the existing event model and return `{ "event": { "id": "…", "status": "DRAFT" } }`. `description` and `coverUrl` are optional; the app uploads cover photos with the existing `event` media purpose and sends the resulting public HTTPS URL. The server owns price, currency, ticket inventory and publication state. Free/paid publishing and ticket-sale rules are enforced server-side; a client must not bypass pending verification by sending `status: PUBLISHED`. Validate date/time, venue, capacity, cover URL and workspace role. Draft creation should be idempotent when retried after a timeout. The same route supports first-event onboarding and later events created through **Host an event**.

## Errors and access

Use the API's standard error envelope. Return stable field validation errors for malformed data, `401` for unauthenticated callers, `403` for insufficient workspace role or unapproved paid ticketing, and `404` for inaccessible workspace IDs. Verification file URLs and bank data must never appear in normal workspace list/detail responses.

## App behavior

- Profile shows **Organiser dashboard** for users with an active `OWNER` or `ADMIN` workspace. The dashboard data, events, attendees, check-in, and payout routes are specified in [`ORGANIZER_DASHBOARD_API_CONTRACT.md`](./ORGANIZER_DASHBOARD_API_CONTRACT.md). The dashboard can show verification progress while pending; paid publishing remains server-gated.
- The app persists a user-scoped local progress draft; bank account number and IFSC are excluded from local storage.
- It uploads the logo using the existing `workspace` media purpose, and verification photos using `organizer_verification`.
- It resumes the four-step wizard from **Events → Become an organiser**. After a caller has an active Owner/Admin workspace with `verification_status: APPROVED`, the entry point changes to **Host an event** and opens event creation directly. A `PENDING` workspace shows **Verification pending**; the app refreshes status on foreground, pull-to-refresh, and every 60 seconds while Events is open.
- Event creation supports a name, optional cover photo, description, date/time, venue, ticket type and capacity; it creates a draft for the selected workspace. If the user manages multiple workspaces, they choose which one will host the event.
- Organisation details, a verification document, and a payout account are required before the wizard can advance to first-event setup. “Save and finish later” exits the wizard without submitting incomplete steps; bank credentials are not persisted locally.
- Event and workspace IDs returned by the API are canonical. After successful creation, refresh `GET /workspaces` / event data rather than manufacturing local server rows.
- A server error leaves the current step and inputs visible so the user can retry. “Save and finish later” closes the wizard while preserving its safe local draft.

## Acceptance criteria

- Workspace creation grants the caller the intended owner role exactly once on retry.
- Verification upload is private, review status is explicit, and only an `APPROVED` workspace shows the **Host an event** entry point. Unapproved workspaces cannot sell paid tickets.
- Full payout credentials are never returned by APIs or written to logs/client storage.
- First-event creation returns a real draft owned by the selected workspace; client input cannot publish or set ticket prices.
- Role checks, idempotency, validation, deletion/retention, and upload ownership are covered by backend tests.
