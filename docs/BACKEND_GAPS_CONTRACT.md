# Backend gaps for the monetization plan

Checked on 12 Oct 2026 against `gathr-api` `main` (`effb787`, migrations up to `063`) and `docs/HIVA_MONETIZATION_DEVELOPMENT_PLAN.md`. This lists only what the backend does **not** have yet. The mobile app is built against what exists; each item below is blocked on the backend.

## Already available (verified in code)

| Plan item | Backend |
| --- | --- |
| Hiva Plus subscription, RTDN, reconcile, atomic DM limit | `/me/subscription`, `/me/subscription/google-play`, `/webhooks/google-play/rtdn` |
| Plus settings (badge, theme, quiet hours, digest) | `GET/PATCH /me/settings` |
| Advanced discovery filters | `GET /nearby`, `GET /users/search` (`city`, `interest`, `language`, `activeNow`) |
| Presets, Social Passport | `/me/discovery-presets`, `GET /nearby/passport` |
| Connection Inbox | `/conversations/inbox*` |
| Theme catalog and permanent theme packs | `/me/profile-themes`, `/me/profile-themes/google-play` |
| Ticket-credit packs, ledger, events, tickets, scans | `/workspaces/:id/credit-packs`, `/credits*`, `/events*`, `/tickets/verify` |
| Organizer Pro plan and purchase | `/workspaces/:id/plan`, `/subscriptions` |
| Event Networking (core) | `/events/:id/networking/me`, `/attendees`, `/connections*` |
| Host Studio (core) | `/host-studio/templates`, `/parties/:id/run-of-show`, `/questions*` |
| Paid rooms | `/parties/:id/paid-room*` |
| Creator wallet, manual payout requests, gift refund approvals | `/creators/me/wallet`, `/payout-requests` |

Note: the plan names `/search/users`; the backend serves `/users/search` and the app already uses it. No change needed.

## Missing: Epic 1 and 4 (organizer)

| Missing | Proposed contract |
| --- | --- |
| First-event / first-50-ticket promotional credit grant | Configurable grant applied once per workspace, written to the credit ledger with `reason: PROMO_GRANT`. Surface it in `GET /workspaces/:id/credits`. |
| Reusable event templates | `GET/POST/DELETE /workspaces/:id/event-templates` with a `config_json` allowlist. |
| Discount codes | `POST/GET/DELETE /workspaces/:id/events/:eventId/discount-codes`; applied server-side at `POST /events/:eventId/purchase`; redemption count and expiry. |
| Custom attendee form fields | Per-event field definitions with a required `purpose` disclosure, answers stored per ticket and visible only to the organizer. |
| Scheduled attendee broadcasts / reminders | `POST /workspaces/:id/events/:eventId/broadcasts` with `sendAt`; sent through notifications with a per-event rate cap. |
| CSV export | `GET /workspaces/:id/events/:eventId/attendees.csv`, role-gated, audit-logged. |
| Outbound webhook integration | Signed webhook endpoints per workspace for `ticket_issued`, `ticket_cancelled`, `ticket_checked_in`. |
| Organizer analytics | Conversion, check-in rate and repeat-attendee aggregates per event and workspace (unique users, not raw events). |
| Branded organizer page | Public page by workspace slug with logo, description and upcoming events. |
| Analyst role | Roles today are `OWNER`, `ADMIN`, `SCANNER`, `MEMBER`. Add `ANALYST` (aggregate data and export only). |
| One Event Networking credit per month | Entitlement counter in `workspace_entitlements`, consumed when networking is enabled for an event. |

## Missing: Epic 5 (Event Networking)

- `GET /events/:eventId/networking` summary (enabled, viewer eligibility, opt-in state). The app currently has to infer eligibility from errors on `/networking/me`.
- `GET /events/:eventId/networking/suggestions`: ranked opted-in attendees using mutual interests, compatible goals and shared follows. Never exact distance, demographics or payment status.

## Missing: Epic 6 (Host Studio)

- Recurring party series: `party_series` with `recurrence_rule`, `timezone`, `next_start_at` and a reminder CTA.
- Speaker waitlist.
- Aggregate post-room analytics (`party_analytics_daily`: unique listeners, peak concurrent, average listen seconds, follows, seat requests, gifts).
- Saved moderation presets, unless `config_json` on templates already carries them (confirm).
- Recording and transcription with consent evidence and a monthly minutes quota (later).

## Missing: Epic 7 (creator gifts)

The backend only has `POST /parties/:id/gifts`, which creates Razorpay orders with arbitrary amounts. For Play-distributed Android this must be replaced:

- Server-controlled gift catalog: `GET /parties/:id/gift-catalog` returning `{productId, giftType, animation}`.
- `POST /parties/:id/gifts/google-play` with `{productId, purchaseToken, creatorId, idempotencyKey}`: verify consumable, check membership and eligibility, write gift and ledger transactionally, consume only after the durable grant.
- Ledger split: `customer_price_minor`, `store_fee_estimate_minor`, `recognized_net_minor`, `creator_share_minor`, `platform_share_minor`, `purchase_token_hash`, `provider_order_id`; ledger types `CREDIT | REFUND | CHARGEBACK | PAYOUT | RESERVE`.
- Risk controls: sender daily spend limit, velocity rules, self-gift detection, creator payout KYC (today payouts are a manual request queue only).

## Missing: privacy foundation

`GET/PATCH /me/settings` has `privateProfile`, `hideOnlineStatus` and `seatInvitesFrom` only. The plan's `UserPrivacySettings` also needs:

- `showReadReceipts: boolean`
- `messageRequestsFrom: 'everyone' | 'followers' | 'shared_context' | 'nobody'`
- `partyActivityVisibleTo: 'everyone' | 'followers' | 'nobody'`
- `searchDiscoverability: boolean`
- `partyRecommendationDiscoverability: boolean`
- `lockScreenPreview: 'full' | 'sender_only' | 'hidden'` (the digest and push payloads must honor it)
- Plus-only scheduled discovery visibility and saved visibility presets. On expiry keep the dormant preset and apply the safest free state; never broaden visibility on downgrade.

## Missing: platform

- **Analytics ingestion**: no client endpoint for the purchase funnel (`paywall_viewed`, `plan_selected`, `checkout_started`, `limit_reached`, ...). Needs an allowlisted-property endpoint that rejects tokens, message text and coordinates. Only `GET /admin/funnel` exists today.
- **Product catalog**: pricing and products live in `app_config` JSON (`tickets.credit_packs_json`, `profile_themes.catalog_json`, `organizer_pro.plans_json`), not a `monetization_products` table. Works for now; the plan wants one server catalog.
- **Feature flags** still missing: `creator.memberships.enabled`, `business_profiles.enabled`, `promotions.enabled`.

## Missing: Epics 9 to 11 (later, demand-gated)

Creator memberships, business and venue pages (`business_profiles`, `business_offers`, `offer_redemptions`, `promotions`) and community hubs have no tables or routes. The plan says not to start them before the demand gates are met.
