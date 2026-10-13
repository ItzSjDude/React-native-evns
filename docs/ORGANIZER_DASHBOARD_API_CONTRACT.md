# Organiser dashboard API contract

Backend requirements for the Profile **Dashboard** entry and organiser dashboard screens. Show this entry only to signed-in users with at least one `ACTIVE` workspace, `OWNER` or `ADMIN` membership, and `verification_status: APPROVED`. A workspace still under review or rejected is not yet an organiser for this dashboard; its onboarding/review status remains available from Events. Never infer organiser status from a profile flag or client-supplied role.

All routes require authentication. Derive workspace access from the caller's current membership and approved verification state on every request. Reject `SUSPENDED`/`DELETED` workspaces, non-approved workspaces, and `SCANNER`/`MEMBER` roles for dashboard data. Do not trust a workspace or event ID supplied by the client without checking that the event belongs to that workspace.

## Workspace status

`GET /workspaces` must include `verification_status` on each membership row (`NOT_SUBMITTED`, `PENDING`, `APPROVED`, `REJECTED`). The app uses this to show the dashboard only after approval. Do not include document URLs or reviewer notes. If approval is revoked, a role is removed, or the workspace becomes inactive, subsequent dashboard requests return `403` or `404` using the API's existing error envelope; the app closes the dashboard and refreshes the workspace list.

## Overview

`GET /workspaces/:workspaceId/organizer-dashboard`

Return one fresh, workspace-scoped summary:

```json
{
  "verificationStatus": "APPROVED",
  "ticketsSold": 420,
  "grossRevenueMinor": 20600000,
  "currency": "INR",
  "checkedIn": 243,
  "nextPayoutMinor": 2106000,
  "nextPayoutAt": "2026-10-16T00:00:00.000Z",
  "events": [{
    "id": "event-uuid", "title": "Monsoon Sessions, Bandra",
    "startsAt": "2026-10-24T13:30:00.000Z", "venue": "Bandra Studio, Bandra West",
    "status": "PUBLISHED", "coverUrl": null, "ticketsSold": 420, "capacity": 500
  }],
  "actionItems": []
}
```

`grossRevenueMinor` and payout values are integer minor currency units; never use floating-point rupees. Count only settled, non-refunded paid tickets in revenue. `ticketsSold` must be defined consistently (issued active tickets, excluding cancelled/refunded); `checkedIn` counts successful check-ins. Empty workspaces return zero metrics, `events: []`, and `nextPayoutMinor`/`nextPayoutAt: null`. Clamp the event preview to a documented small limit and order by upcoming start time, then recently updated drafts. Include only events belonging to this workspace.

`actionItems` supports `REFUND_REQUEST`, `CHECKIN_STAFF`, and `VERIFICATION`, with optional `eventId`, `eventTitle`, and `count`; return an empty array when there is no action. Do not include attendee PII in this summary. Do not report payout numbers when payout data is unavailable; return `null`.

## Events and event detail

`GET /workspaces/:workspaceId/events?status=UPCOMING|PAST|DRAFT&limit=20&offset=0` returns `{ "items": [...], "hasMore": true, "offset": 0 }`. `UPCOMING` includes future events in `PUBLISHED`, `PAUSED`, or `SOLD_OUT` state; `PAST` includes ended/cancelled events; `DRAFT` includes drafts. Rows contain the dashboard event fields above and must not be mixed with public events from other workspaces. Invalid status/page values return stable validation errors.

`GET /workspaces/:workspaceId/events/:eventId/organizer-summary` returns event metadata and authoritative counts: `ticketsSold`, `capacity`, `checkedIn`, `grossRevenueMinor`, `currency`, and ticket types with `label`, `priceMinor`, `currency`, `sold`, and `capacity`. Price/currency come from the server. Event details may be editable only through the existing authorised event update route; this dashboard read route must not mutate or publish the event.

Use stable event statuses `DRAFT`, `PUBLISHED`, `PAUSED`, `CANCELLED`, `ENDED`, and `SOLD_OUT`. An event with zero sales is still represented by its actual lifecycle status and zero counts. Publishing, pausing sales, editing, and cancelling must use explicit authenticated mutations with Owner/Admin authorization, server-side verification/payment rules, and idempotency where a retry could duplicate an action. Do not treat a dashboard's cached status as authorization.

## Attendees

`GET /workspaces/:workspaceId/events/:eventId/attendees?limit=20&offset=0&search=<text>&status=ALL|CHECKED_IN|NOT_CHECKED_IN` returns:

```json
{"items":[{"id":"ticket-uuid","displayName":"Ravi Kulkarni","ticketLabel":"VIP x2","orderReference":"HV-48213","ticketStatus":"PAID","checkedInAt":null,"amountMinor":180000,"currency":"INR"}],"hasMore":false,"offset":0}
```

Only expose the minimum fields needed by the event owner to identify a ticket holder and resolve entry issues. Do not return email, phone, payment instrument, full payment IDs, or unrelated attendee profile data. Search must be scoped to this event and the allowed name/order reference only. Use bounded pages (maximum 100), stable ordering, and avoid logging search terms or attendee rows. Networking opt-in attendees are a separate dataset and must never be used as ticket attendees.

Return `404` for an event outside the workspace. Return ticket statuses including `PAID`, `FREE`, `REFUNDED`, `CANCELLED`; only eligible active paid/free tickets can be checked in. For refunded/cancelled tickets, the attendee row remains visible with that status but is not valid for entry.

## Check-in

`POST /workspaces/:workspaceId/events/:eventId/check-ins`

```json
{"ticketCode":"<opaque ticket code>","idempotencyKey":"<client-generated UUID>"}
```

On success return `{ "status":"CHECKED_IN", "attendeeName":"Ravi Kulkarni", "ticketLabel":"VIP x2", "checkedInAt":"<ISO-8601>" }`. Validate the ticket cryptographically or against its server record, event ownership, event state, and ticket eligibility. Atomically set check-in once. A replay of the same idempotency key returns the original result; a second attempt with a new key returns a stable `ALREADY_CHECKED_IN` conflict and the safe prior check-in result. Unknown, wrong-event, refunded, cancelled, and invalid tickets return stable error codes without revealing whether a code belongs to a different event. Log staff identity and timestamp for audit, but never log raw QR/ticket codes.

The mobile scanner must request camera permission only after the organiser opens Check-in, provide manual code entry as an accessible fallback, prevent concurrent duplicate scans, and never mark a ticket checked in optimistically. A successful response is the source of truth; network failures are safe to retry with the same idempotency key.

## Payouts

`GET /workspaces/:workspaceId/payouts` returns `{ "next": null | { "amountMinor": 2106000, "currency":"INR", "releaseAt":"<ISO-8601>", "maskedAccount":"Sample Bank ••4821" }, "history": [...] }`.

History rows contain only `id`, `eventTitle`, `amountMinor`, `currency`, `status` (`PENDING`, `PROCESSING`, `PAID`, `FAILED`), `releaseAt`, and nullable `paidAt`. Use integer minor units and the payment provider's settlement state. Empty history returns `[]`; no upcoming transfer returns `next: null`. Do not return full bank account, IFSC, payout provider credentials, or internal failure details. Do not invent or estimate a payout when settlement data is missing.

Payout changes remain on the separately authorised payout-account management route. Dashboard GETs never change bank details or payout schedule. Mask any account suffix consistently across all workspace members allowed to see payouts.

## Shared behavior and edge cases

- Paginated endpoints clamp `limit` to 100 and reject negative offsets; totals and money use server values.
- Use the standard API error envelope and stable codes: `WORKSPACE_ACCESS_REVOKED`, `EVENT_NOT_FOUND`, `TICKET_NOT_VALID`, `ALREADY_CHECKED_IN`, and `VERIFICATION_REQUIRED`.
- A stale client workspace list must not preserve dashboard access after role revocation. The app refreshes workspace membership on dashboard open and on foreground return; API authorization remains authoritative.
- For `PENDING`/`REJECTED` verification, do not grant dashboard access. Keep the review state visible in the Events onboarding entry; enforce paid-event restrictions on every publish/sales mutation. Free-event rules remain governed by the product's current policy.
- When verification changes, the next workspace/dashboard read reflects it. The app refreshes on pull-to-refresh and foreground return; avoid relying on long-lived push delivery for correctness.
- Keep aggregate caches workspace-scoped and invalidate them after ticket issue/cancel/refund, check-in, event status change, settlement, or verification decision. A stale aggregate is acceptable only if the response documents its update time and the UI labels it accordingly.
- Apply the existing account deletion, workspace deletion, privacy, retention, and audit policies. Never put attendee or payout data in analytics/crash logs.

## App screens

The Profile **Dashboard** button opens an organiser workspace dashboard. It contains Overview, Events, event detail, Attendees, Check-in, and Payouts destinations. Only active, approved Owner/Admin workspaces appear in the dashboard. Selecting a different workspace reloads every screen's data. Users with pending or rejected verification continue through the Events onboarding/review entry and do not see this dashboard. For multiple managed workspaces, require an explicit workspace selection before performing event/check-in actions and keep every action scoped to the selected workspace/event.
