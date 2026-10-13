# Creator onboarding and party gift earnings API contract

Backend requirements for the Profile **Become a creator** entry and audio-party gift payouts. The app collects a creator bio/category and payout account details. A user may receive a paid gift before applying; the gift must remain in their account ledger and cannot be withdrawn until creator and payout checks are approved.

## Identity and access

- All routes are authenticated. Derive the user ID from the session; ignore any client-supplied creator/owner ID.
- Creator onboarding is a user account capability, separate from event-organiser workspaces and organiser verification.
- Profile entry is visible to every signed-in user. Do not require an existing creator record to read the onboarding state.
- Use the existing standard API envelope and stable machine-readable error codes. The app must be able to distinguish validation errors, retryable provider/network errors, and access/session errors.

## Creator onboarding state

`GET /creators/me/onboarding` returns `200` for every signed-in user, including users who have not applied:

```json
{
  "status": "NOT_STARTED",
  "payoutStatus": "NOT_SUBMITTED",
  "payoutEligible": false,
  "maskedAccount": null,
  "rejectionReason": null
}
```

`status` is `NOT_STARTED | PENDING | APPROVED | REJECTED`; `payoutStatus` is `NOT_SUBMITTED | PENDING | VERIFIED | REJECTED`. `payoutEligible` is server-computed and true only when both the creator application and payout verification are approved and withdrawals are permitted. Never infer it from the app's local state. `maskedAccount` may contain only a bank name and masked suffix; `rejectionReason` must be user-safe and must not expose reviewer notes or provider internals.

The response may also include the submitted public creator fields (`about`, `categories`) when the user is the account owner. Never return full bank credentials, provider tokens, or private review documents.

## Submit creator profile and payout setup

`PUT /creators/me/onboarding` creates or replaces the user's pending onboarding submission. The request is authenticated, user-scoped and idempotent for retries of the same submission. Accept an `Idempotency-Key` header (UUID) or equivalent server-side idempotency.

```json
{
  "about": "I host live music conversations and make indie-pop.",
  "categories": ["MUSIC", "PODCASTS"],
  "accountHolder": "Asha Mehta",
  "accountNumber": "50100234564821",
  "ifsc": "HDFC0001234"
}
```

`categories` is a non-empty, deduplicated subset of `MUSIC | PODCASTS | ART | COMEDY | GAMING | EDUCATION | OTHER`; `about` is trimmed, plain text, 10–500 characters. Validate bank details with the payout provider and applicable payout/KYC policy. If additional identity or tax information is required, collect it through a documented secure flow and return only the fields the user needs to complete.

Successful submission returns status only and a masked account indicator:

```json
{
  "status": "PENDING",
  "payoutStatus": "PENDING",
  "payoutEligible": false,
  "maskedAccount": "Bank ••4821",
  "rejectionReason": null
}
```

Do not echo the submitted account number or IFSC. Do not put either value into logs, analytics, crash reports, or app persistent storage. Encrypt sensitive payout credentials at rest, restrict access to payout services and authorised reviewers, audit changes, and define retention/deletion with the account and applicable payout policy. The app sends them over the authenticated API only from transient form state and clears them after success/close.

For `REJECTED`, the owner may submit corrected details again. A replacement must supersede the previous pending submission without creating multiple active payout accounts. Keep a provider failure retryable and do not claim success until the provider has accepted the account.

## Gift receipt, ledger and withdrawal eligibility

- A paid gift can target any eligible active audio-party participant, including the host, even when the recipient has no creator onboarding record. Creator registration must not be a prerequisite to show, purchase, validate, or deliver the gift.
- When a gift purchase is verified, transactionally create one durable gift record and ledger credit for its intended recipient. Preserve the credit if they have not registered yet; set it to `WITHDRAWAL_LOCKED` until `payoutEligible` is true. Do not discard earnings or redirect them to the host/platform because setup is incomplete.
- Use a server-controlled product catalog and verified store purchase. Continue using the app's Play reservation/confirmation flow (`/parties/:id/gifts/play-reservations` and `/parties/:id/gifts/play-purchase`) or provide a compatible migration. Verify product, package/account policy, purchase token, party membership and recipient eligibility on the server. Enforce token uniqueness, reservation expiry, refunds/chargebacks and replay-safe idempotency.
- Keep gross customer price, store fee/estimated fee, recognised net, creator share and platform share in integer minor units with currency. Do not use floats. Creator balance and payout calculations use server ledger entries only.
- Opening a creator application must not alter old gift records. Once payout becomes verified, locked eligible credits may become available according to the settlement/hold schedule; return the authoritative available balance from a creator earnings endpoint before implementing cash-out UI.
- A payout provider rejection, account change, creator suspension, refund, chargeback or risk hold immediately blocks affected withdrawals while preserving a clear ledger/audit trail. Do not expose risk rules or other users' details.

## Confirmed gift event for the audio-party recipient

After the server has verified a paid gift and committed its gift row/ledger credit, emit the existing authenticated party realtime channel event:

```json
{
  "type": "party:gift-received",
  "eventId": "event-uuid",
  "partyId": "party-uuid",
  "giftId": "gift-uuid",
  "creatorId": "recipient-user-uuid",
  "status": "PAID"
}
```

Send this only to current party members; do not include purchase tokens, account data, gift receipt codes, or balances. `eventId` must be stable for replay dedupe. The app prompts only when the event's `creatorId` is the signed-in host/recipient and that recipient is not payout eligible. The prompt explains that the gift is safely received and directs them to **Me → Become a creator** to finish setup. A prompt is guidance only; server-side withdrawal authorization remains authoritative.

The existing LiveKit `party:gift` quick reaction is not a paid gift and must not create earnings, ledger credit, or a payout onboarding prompt.

## Gift list and catalog compatibility

- `GET /parties/:id/gifts` continues to return confirmed room gifts only. Keep `creatorId` as the recipient user ID, not a creator profile ID, so gifts sent before onboarding remain addressable.
- The catalog endpoint must permit a valid host/participant recipient without creator onboarding. The client price comes from Google Play; the server catalog owns product ID, type and animation, and the server validates mapping before crediting the recipient.
- The gift list must not expose private payout status or amount earned to other room members. Existing room display values are purchase/gift display data, not a creator balance.
- On a repeated purchase token, return the original gift outcome or a stable conflict; never create a second ledger credit. A pending Play confirmation must not emit `party:gift-received` until the durable gift is confirmed.

## App behavior and edge cases

- Show the Profile CTA for every signed-in user. Open onboarding state from the server each time; network errors leave the form retryable and must not be shown as `NOT_STARTED`.
- Validate non-empty creator description/category and basic account/IFSC format on device, then repeat all validation server-side. Keep full credentials in component memory only; clear them after success, close, logout, or account switch. Never save them in the local draft.
- Show a review state after submission. Do not allow duplicate submissions while one is in flight; retry with the same idempotency key after an ambiguous network timeout.
- Handle `PENDING`, `APPROVED`, `REJECTED`, provider outage, invalid bank details, already-submitted application, revoked session, and account deletion without losing confirmed gift credits.
- De-duplicate realtime gift prompts by `eventId`/`giftId`. If creator status lookup fails, do not falsely claim that withdrawals are locked or enabled; a later confirmed event/status refresh can prompt again.
- If a user receives gifts while offline or before onboarding, the ledger is still authoritative. On next profile open, show server onboarding state; do not rely on the transient dialog for earnings recovery.

## Acceptance criteria

- A non-creator host can receive a verified paid gift and see it in the party; the recipient gets exactly one durable ledger credit.
- No withdrawal is allowed until creator application and payout setup are approved and all holds are cleared.
- A verified payout unlocks eligible settled credits without duplicating or losing ledger entries.
- Replayed Google Play tokens, requests, and realtime events do not duplicate gift records, credits, or prompts.
- Full bank details and purchase tokens never appear in logs, normal profile/workspace responses, gift room events, or client persistent storage.
- A failed status lookup, provider outage, expired reservation, refund, chargeback, account switch/deletion, or rejected payout cannot cause a false successful cash-out state.
