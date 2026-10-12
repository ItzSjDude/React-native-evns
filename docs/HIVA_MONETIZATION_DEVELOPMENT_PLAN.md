# Hiva monetization development plan

**Status:** Engineering specification

**Prepared:** 12 October 2026

**Source:** Product decisions from `docs/HIVA_SUBSCRIPTION_STRATEGY.md`

**Repositories:** `React-native-evns` mobile app and sibling `gathr-api` backend

**Progress key:** ~~strikethrough~~ = implemented in the mobile app on branch `prat-fixes` (as of 12 October 2026) against the existing backend. Items without a strikethrough are not built in the app. Backend gaps are listed in `docs/BACKEND_GAPS_CONTRACT.md`.

## Purpose

This document isolates the development work required to make Hiva's monetization strategy functional. It is for product engineering, backend, mobile, QA and operations. Pricing rationale, competitor research and market commentary remain in the source strategy document.

The plan is intentionally sequenced. Do not build every monetization surface at once.

1. Make existing ticket credits sellable and measurable.
2. Complete the Hiva Plus backend and ship a truthful V1 bundle.
3. Build Organizer Pro and Event Networking Mode.
4. Add Host Studio.
5. Add one compliant creator transaction product: gifts or paid rooms.
6. Build creator memberships, business pages and community hubs only after demand gates are met.

## Engineering principles

- The backend is the source of truth for entitlements, limits, billing state and usage.
- The client must never unlock paid access based only on a local purchase callback.
- Every payment mutation must be idempotent and auditable.
- Store purchase tokens, provider secrets and raw sensitive payloads must never appear in logs or analytics.
- Safety restrictions always override commercial entitlements.
- Free users can always reply to existing conversations, block/report users, hide discovery, delete their account and use baseline privacy controls.
- A subscription cannot bypass blocks, message permissions, bans, moderation limits or private-profile rules.
- Only show paid benefits on a purchase screen when the corresponding backend behavior is live.
- Meter every feature with meaningful variable cost before marketing it as unlimited.
- Ship new revenue products behind server-side feature flags with cohort rollout and emergency disable controls.

## Architecture and feature boundaries

Follow the repository architecture rules:

- Feature UI, hooks, state, services and contracts belong in `src/features/<feature>/`.
- Shared billing, API, analytics, secure storage and media infrastructure belong in `src/core/`.
- Each feature exposes its public surface through `src/features/<feature>/index.ts`.
- Define TypeScript/API contracts before implementing screens.
- Keep API data as server state; use local/global UI state only for selections, modal state and inputs.

Recommended mobile feature modules:

```text
src/features/plus/                 existing; extend
src/features/organizer/            workspace, event operations and ticket credits
src/features/eventNetworking/      attendee opt-in and shared-event discovery
src/features/hostStudio/           templates, series and host analytics
src/features/creatorMonetization/  gift/paid-room/member purchase surfaces
src/features/business/             venue pages, offers and promotions
src/features/privacy/              shared privacy settings and schedules
```

Recommended backend domains:

```text
subscriptions
entitlements
organizer-billing
event-networking
host-studio
store-products
paid-rooms
creator-memberships
business-profiles
promotions
```

Do not put Google Play verification logic inside a feature controller. Use a billing provider/service boundary and a central entitlement resolver.

## Current codebase inventory

### React Native already has

- `src/features/plus/`:
  - Android Play Billing connection;
  - product `hiva_plus`;
  - weekly, monthly and yearly base-plan handling;
  - purchase and restore flows;
  - paywall and Plus settings UI;
  - expected `GET /me/subscription` contract;
  - expected `POST /me/subscription/google-play` contract;
  - handling for `429 LIMIT_REACHED` on new conversation starts;
  - Plus badges on profiles/posts.
- `src/features/events/`:
  - public event list and details;
  - viewer ticket/interest state display;
  - organizer/workspace identity in event payloads.
- `src/features/party/`:
  - audio/video rooms, scheduled rooms and share links;
  - hosts/co-hosts, seats, requests, invitations and moderation;
  - polls, Truth or Dare and Lucky Wheel;
  - read-only gift list and monetization capability discovery.
- `src/features/nearby/`:
  - location visibility;
  - radius-based discovery;
  - coarse distance presentation;
  - shared-event context.
- Direct messages, notifications, search, profiles, posts and saved posts.

### Backend already has

- Workspaces and workspace membership.
- Events, ticket tiers, waitlists, tickets, QR validation and scan auditing.
- Ticket-credit purchases, ledger and workspace balance.
- Razorpay provider/webhook infrastructure.
- Creator profiles and follows.
- Party gifts, creator wallet and append-only gift ledger.
- Party discovery, scheduling, moderation, polls and games.
- Feature flags for creator gifts and paid rooms.

### Critical missing pieces

- No Hiva Plus backend routes, tables, Google verification or lifecycle worker.
- No server-side Plus entitlement enforcement.
- No organizer-facing mobile/web product despite backend event infrastructure.
- Event mobile UI is browse/detail focused and does not expose the full transaction/operations journey.
- Gift UI can list gifts but cannot safely buy/send them.
- Existing digital-gift backend creates Razorpay orders; that is not the default billing path for in-app digital gifts on Play.
- Paid-room feature flag exists without products, purchases, entitlements or join enforcement.
- No creator payouts/KYC workflow.
- No Event Networking Mode, Host Studio analytics/templates, business profiles or community hubs.

## Shared platform foundations

Implement these before adding multiple revenue products.

### Feature flags

Minimum server flags:

```text
subscriptions.enabled
subscriptions.rollout_percentage
organizer_pro.enabled
event_networking.enabled
host_studio.enabled
creator.gifts.enabled
creator.paid_rooms.enabled
creator.memberships.enabled
business_profiles.enabled
promotions.enabled
```

Flags must support global off, environment separation and optionally allowlisted users/workspaces. The app should treat disabled features as unavailable and avoid dead purchase entry points.

### Central entitlement resolver

Every paid feature should call one backend service:

```ts
type EntitlementContext = {
  userId: string;
  workspaceId?: string;
  creatorId?: string;
};

type EffectiveEntitlements = {
  consumerPlan: 'free' | 'plus';
  workspacePlan: 'free' | 'organizer_pro';
  creatorPlan: 'free' | 'host_studio';
  capabilities: Record<string, boolean>;
  limits: Record<string, number>;
  expiresAt: string | null;
};
```

Do not scatter `is_plus` conditionals through repositories/controllers. Resolve the effective entitlement once, then pass explicit limits/capabilities into domain services.

### Billing audit requirements

For every store/provider event, persist:

- internal event ID;
- provider and provider event/message ID;
- product/base plan/offer ID;
- account/workspace/creator owner;
- state before and after processing;
- provider effective time and server processed time;
- redacted payload reference;
- idempotency result;
- refund/revocation reason where present.

Provide an admin lookup by Hiva user ID, workspace ID, purchase order ID and redacted token hash.

### Product catalog

Create a server-controlled catalog instead of accepting price/amount from clients:

```ts
type MonetizationProduct = {
  key: string;
  kind: 'SUBSCRIPTION' | 'CONSUMABLE' | 'NON_CONSUMABLE' | 'PHYSICAL_SERVICE';
  provider: 'GOOGLE_PLAY' | 'APP_STORE' | 'RAZORPAY';
  providerProductId: string;
  entitlementKey?: string;
  active: boolean;
  metadata: Record<string, unknown>;
};
```

The backend validates the purchased provider product against this catalog. Never trust `amountMinor`, creator share, duration or entitlement sent by the app.

## Epic 1 — ticket credits and organizer pilot

**Priority:** P0

**Goal:** Collect the first organizer revenue using existing ticket infrastructure.

### Scope

- Expose fixed ticket-credit packs:
  - 100 credits / ₹149;
  - 500 credits / ₹599;
  - 1,000 credits / ₹999.
- Keep price calculation entirely server-side.
- Build an organizer surface for:
  - workspace selection;
  - ticket balance and ledger;
  - pack purchase;
  - purchase status/retry;
  - event creation/edit/publish/cancel;
  - ticket requests and issuance;
  - attendee list;
  - QR scanning/check-in;
  - refund/cancellation audit.
- Support a configurable first-event or first-50-ticket promotional grant.
- Record organizer funnel analytics.

### Delivery recommendation

Build organizer operations as a responsive web portal if no organizer frontend exists. The RN app can expose attendee functions and a lightweight “Organizer tools” deep link/companion view. Avoid forcing complex event administration into the consumer navigation.

### Existing backend integration

Reuse the current workspace credit routes and ledgers. Add a server endpoint that returns available packs so the client never hardcodes quantity/price:

```http
GET /workspaces/:workspaceId/credit-packs
```

```json
{
  "success": true,
  "data": [
    {"key":"tickets_100","quantity":100,"amountMinor":14900,"currency":"INR"},
    {"key":"tickets_500","quantity":500,"amountMinor":59900,"currency":"INR"},
    {"key":"tickets_1000","quantity":1000,"amountMinor":99900,"currency":"INR"}
  ]
}
```

Purchase input must contain `packKey` and an idempotency key, not arbitrary quantity/price.

### Acceptance criteria

- An organizer can buy a fixed pack and receives credits only after a verified webhook.
- Duplicate webhook delivery never grants credits twice.
- A forged or mismatched amount/order grants nothing.
- Issuing, canceling and refunding tickets leaves the credit ledger consistent.
- Two concurrent issuances cannot take the workspace balance below zero.
- Staff roles are enforced server-side for every organizer action.
- Admin/support can trace purchase → ledger → ticket without accessing provider secrets.
- Revenue, issued tickets and check-ins appear in the operations dashboard.

## Epic 2 — Hiva Plus backend and truthful V1

**Priority:** P0

**Goal:** Make the existing Android purchase client safe to enable.

### Store catalog

```text
Product: hiva_plus
Base plans: monthly, yearly
Later experiment: weekly-prepaid
Monthly offer: first month intro, eligibility controlled by Google Play
```

The app currently understands `weekly`; use the actual configured base-plan ID consistently. Do not expose prepaid until renewal copy is plan-aware.

### Required endpoints

```http
GET /me/subscription
POST /me/subscription/google-play
POST /webhooks/google-play/rtdn
```

Expected state:

```ts
type SubscriptionStatus =
  | 'ACTIVE'
  | 'GRACE_PERIOD'
  | 'ON_HOLD'
  | 'PAUSED'
  | 'CANCELED'
  | 'EXPIRED'
  | 'REVOKED';

type SubscriptionResponse = {
  enabled: boolean;
  plan: 'free' | 'plus';
  status: SubscriptionStatus | null;
  productId: string | null;
  basePlanId: string | null;
  expiresAt: string | null;
  autoRenewing: boolean;
  limits: {
    dmStartsPerDay: number;
    vibeNotesPerDay: number;
    vibeNoteMaxMinutes: number;
  };
  usage: {
    dmStartsToday: number;
    vibeNotesToday: number;
    resetAt: string;
  };
  plans: Array<{productId: string; basePlanId: string}>;
};
```

### Backend workflow

1. Receive product ID and purchase token from an authenticated user.
2. Fetch canonical state using Google Play Developer API.
3. Validate package, product, base plan, state and environment.
4. Reject a token already owned by another Hiva account.
5. Persist the subscription and immutable audit event transactionally.
6. Acknowledge an eligible verified purchase server-side.
7. Return effective subscription state.
8. For RTDN, dedupe by message ID, fetch canonical state again and apply a monotonic state transition.
9. Run periodic reconciliation for active/grace/hold subscriptions in case notifications are delayed.

### Minimum tables

```text
subscriptions
  id, user_id, store, product_id, base_plan_id
  purchase_token_encrypted, purchase_token_hash UNIQUE
  status, started_at, expires_at, auto_renewing
  region_code, last_verified_at, created_at, updated_at

subscription_events
  id, subscription_id, provider_message_id UNIQUE NULLABLE
  event_type, effective_at, redacted_payload, processed_at

entitlement_usage_daily
  user_id, usage_date
  dm_starts, vibe_notes
  PRIMARY KEY (user_id, usage_date)
```

### Entitlement behavior

| Capability | Free | Plus V1 |
| --- | ---: | ---: |
| New conversation starts | 10/day | 40/day |
| Existing conversation replies | Unlimited | Unlimited |
| Vibe notes | 2/day, max 4 hours | 10/day, max 24 hours |
| Advanced discovery filters | No | Yes |
| Profile theme | Default | Two Plus themes initially |
| Plus badge | No | User-controlled, default off |
| Quiet schedule/digest | Manual notification controls | Scheduled quiet hours and digest |

### Atomic DM limit

Consume a DM-start allowance only when a genuinely new direct conversation is created. Existing threads, failed requests and blocked/forbidden attempts consume nothing.

Return:

```json
{
  "success": false,
  "error": {
    "code": "LIMIT_REACHED",
    "message": "Daily new-chat limit reached",
    "details": {
      "limit": "dmStarts",
      "used": 10,
      "max": 10,
      "plusMax": 40,
      "resetAt": "2026-10-13T00:00:00.000Z",
      "plusAvailable": true
    }
  }
}
```

Use a transaction/atomic upsert so concurrent requests cannot exceed the allowance.

### Public Plus projection

- Public DTOs may return `showPlusBadge: boolean`.
- Never expose product ID, billing status, expiration or raw `isPlus` when the user has disabled the badge.
- Subscriber status is not identity verification.
- Add one user setting for badge visibility and default it to false.

### V1 mobile work

- ~~Remove every “Coming soon” row from the active purchase sheet.~~
- ~~Do not claim “more visibility” until ranking behavior is implemented and measurable.~~
- ~~Add profile theme/accent selection.~~
- ~~Add advanced discovery filter UI after backend support exists.~~
- ~~Add scheduled quiet hours and digest preferences.~~
- ~~Make renewal copy aware of auto-renewing versus prepaid plans.~~
- ~~Persist purchase state only as a cache; refresh from the backend on sign-in, app foreground and purchase/restore.~~

### Acceptance criteria

- Purchase, pending, cancel, renew, grace, hold, expire, revoke and refund states are covered by tests.
- A purchase cannot attach to two users.
- Entitlement restores after reinstall and on another device.
- Expiry occurs without requiring the app to open.
- Server acknowledgement happens only after verified `PURCHASED` state and within Google's deadline.
- Free and Plus limits are enforced server-side under concurrent load.
- ~~Replies never trigger a paywall.~~
- ~~Badge visibility is opt-in and consistent across profile/post DTOs.~~
- Purchase verification success is observable without logging tokens.

## Epic 3 — Plus recurring-value features

**Priority:** P1 after Plus billing foundation

### Advanced discovery and Social Passport

Backend query contract:

```http
GET /nearby?radiusMeters=...&city=...&interest=...&language=...&activeNow=true
GET /search/users?q=...&city=...&interest=...&language=...&activeNow=true
```

Rules:

- ~~Free users retain safe basic Nearby/Search.~~
- Server ignores/rejects paid filters when entitlement is absent.
- ~~Social Passport selects a virtual exploration city; it never changes the user's stored physical fix.~~
- ~~UI labels Passport results and never presents a fake distance.~~
- All queries apply block, private-profile, age and discoverability rules before ranking.
- ~~Saved presets sync cross-device.~~

Suggested table:

```text
discovery_presets
  id, user_id, name, city, radius_meters
  interests, language, active_now, created_at, updated_at
```

### Connection Inbox

Features:

- ~~system views: All, Unread, Requests, Events and Parties~~;
- ~~up to five Plus pins~~;
- ~~user-created folders~~;
- ~~optional local follow-up reminder~~;
- ~~no paywall on reading or replying~~.

Suggested tables:

```text
conversation_folders
  id, user_id, name, sort_order, created_at, updated_at

conversation_user_state
  user_id, conversation_id, folder_id NULLABLE
  pinned_at NULLABLE, archived_at NULLABLE
  PRIMARY KEY (user_id, conversation_id)
```

Folder/pin state is per user and must not affect the other participant.

### Profile Studio

- ~~Theme IDs come from a server allowlist.~~
- ~~Store only the selected theme ID/accent, never arbitrary CSS/style data.~~
- ~~Distinguish included Plus themes from permanent non-consumable theme packs.~~
- ~~On Plus expiry, retain the selection but render the default theme until entitlement returns.~~
- ~~A permanently purchased theme continues after Plus expires.~~

### Quiet hours and digest

```ts
type QuietSchedule = {
  enabled: boolean;
  timeZone: string;
  startLocal: string;
  endLocal: string;
  daysOfWeek: number[];
  allowDirectMentions: boolean;
};
```

The backend decides push suppression using the user's timezone. Digest generation must dedupe grouped notifications and must not include sensitive message text when lock-screen preview is hidden.

## Epic 4 — Organizer Pro

**Priority:** P1

**Goal:** Turn organizer operations into a recurring workspace entitlement.

### Capabilities

- Reusable event templates.
- Up to five active events for the founding plan.
- Ticket tiers and discount codes.
- Custom attendee form fields with purpose disclosure.
- Scheduled attendee broadcasts/reminders.
- Staff roles and scanner-device audit.
- CSV export and webhook integration.
- Organizer conversion/check-in/repeat-attendee analytics.
- Branded organizer page.
- One Event Networking Mode credit per billing month.

### Workspace entitlement model

Keep organizer billing separate from personal Plus:

```text
workspace_subscriptions
  id, workspace_id, provider, product_id
  status, starts_at, expires_at, external_customer_id
  created_at, updated_at

workspace_entitlements
  workspace_id, capability, limit_value, expires_at
```

An owner buying Organizer Pro does not automatically receive consumer Plus, and a Plus subscriber does not receive workspace capabilities.

### Roles

Minimum roles and permissions:

| Role | Billing | Event editing | Attendees | Scan | Export | Staff management |
| --- | --- | --- | --- | --- | --- | --- |
| Owner | Yes | Yes | Yes | Yes | Yes | Yes |
| Admin | No | Yes | Yes | Yes | Yes | Limited |
| Check-in staff | No | No | Assigned events | Yes | No | No |
| Analyst | No | No | Aggregate only | No | Yes | No |

Enforce roles in the backend; hiding buttons is not authorization.

### Analytics definitions

```text
event_page_viewed
event_interest_set
ticket_checkout_started
ticket_issued
ticket_cancelled
ticket_checked_in
event_networking_opted_in
event_networking_connection_created
organizer_broadcast_sent
```

Use unique users where a funnel requires people, not raw repeated events.

## Epic 5 — Event Networking Mode

**Priority:** P1; strongest proposed differentiator

**Goal:** Let eligible attendees make consent-based connections around a real event.

### Eligibility

- Event has networking enabled by an authorized organizer.
- User holds a live ticket; “At the event” features can additionally require `CHECKED_IN`.
- User is 18+ where Nearby/stranger discovery requires it.
- ~~User explicitly opts in for this event.~~
- ~~User can opt out immediately without losing their ticket or event chat.~~

### Attendee profile

```ts
type EventNetworkingProfile = {
  eventId: string;
  optedIn: boolean;
  goals: Array<'FRIENDS' | 'COLLABORATORS' | 'NETWORKING' | 'ACTIVITY_PARTNERS'>;
  interests: string[];
  intro: string | null;
  discoverableBeforeEvent: boolean;
  discoverableDuringEvent: boolean;
  discoverableAfterEvent: boolean;
};
```

Use the user's existing safe profile shell. Do not copy private profile fields into a separate public record.

### API sketch

```http
GET    /events/:eventId/networking
PUT    /events/:eventId/networking/me
DELETE /events/:eventId/networking/me
GET    /events/:eventId/networking/attendees?goal=&interest=&cursor=
GET    /events/:eventId/networking/suggestions
POST   /events/:eventId/networking/connections/:userId
DELETE /events/:eventId/networking/connections/:userId
```

### Ranking

Rank only eligible opted-in attendees. Inputs may include mutual interests, compatible goals, shared follows and interaction recency. Never use exact distance inside the venue, sensitive demographic inference or payment status.

### Privacy and safety

- Blocks apply in both directions to lists, suggestions, chat and analytics.
- Organizers see aggregate networking adoption, not private goals or individual browsing behavior.
- Do not create passive “people you were near” history.
- A post-event connection appears only after mutual action or an explicit interaction—not merely co-location.
- Networking data automatically becomes non-discoverable after a configurable event window.
- ~~Report/block actions remain available from every attendee card and conversation.~~

### Acceptance criteria

- A non-ticket holder cannot enumerate attendees.
- A ticket holder is invisible until explicit opt-in.
- Opt-out removes the user from new results immediately and invalidates caches.
- Blocked users never appear to each other.
- Event cancellation disables networking and messaging entry points safely.
- Organizer analytics cannot reconstruct individual private choices.
- Pagination/rate limits resist attendee scraping.

## Epic 6 — Host Studio

**Priority:** P2

### V1 capabilities

- ~~Party templates for title, topic, kind, category, language, tags, visibility and seats.~~ Chat, requests and slow mode are not saved: the backend template validator rejects them.
- Recurring party series and reminder CTA.
- Saved moderation presets.
- ~~Run-of-show notes visible only to host/co-host.~~
- ~~Audience question queue.~~
- Speaker waitlist.
- Aggregate post-room analytics.

### Suggested models

```text
party_templates
  id, owner_user_id, name, config_json, created_at, updated_at

party_series
  id, owner_user_id, template_id, recurrence_rule
  timezone, next_start_at, active

party_questions
  id, party_id, user_id, body, status, position, created_at

party_analytics_daily
  party_id, day, unique_listeners, peak_concurrent
  average_listen_seconds, follows, seat_requests, gift_count, gift_gmv_minor
```

Keep raw joins/leaves for a short operational retention window, then retain aggregates where possible.

### Later: transcription and clips

- Host explicitly enables recording/transcription before the room starts.
- Every participant sees persistent recording status before joining and while inside.
- Store consent/version evidence.
- Apply a hard monthly minutes quota.
- Create signed, expiring media access URLs.
- Provide deletion and retention behavior.
- Generate clips only from recorded material covered by consent.
- Never market transcription as unlimited.

## Epic 7 — compliant party gifts

**Priority:** P2; choose this or paid rooms first

### Required change

Do not expose the current arbitrary-amount Razorpay gift creation flow for Play-distributed Android digital gifts. Replace it with fixed store products.

Initial catalog example:

```text
hiva_gift_clap       ₹10
hiva_gift_chai       ₹29
hiva_gift_rose       ₹49
hiva_gift_spotlight  ₹99
hiva_gift_crown      ₹249
```

Prices are store-localized; server metadata maps product ID to gift type and animation. The app never submits an authoritative amount.

### Purchase flow

1. Fetch eligible gift catalog for the party/recipient.
2. Start Play Billing consumable purchase.
3. Send purchase token, product ID, party ID, creator ID and client idempotency key to backend.
4. Backend verifies the product and purchase state with Google.
5. Backend checks sender/recipient party membership and creator eligibility.
6. Transactionally create the gift, credit creator net liability and record billing event.
7. Consume/acknowledge according to the store lifecycle only after durable grant.
8. Publish a realtime gift event and return the gift receipt.

### Ledger changes

The ledger must separate customer price from recognized/payout amounts:

```text
party_gifts
  provider_product_id
  customer_price_minor
  store_fee_estimate_minor
  recognized_net_minor
  creator_share_minor
  platform_share_minor
  purchase_token_hash
  provider_order_id

creator_gift_ledger
  CREDIT | REFUND | CHARGEBACK | PAYOUT | RESERVE
```

Do not let a calculated display wallet become the only source of truth. Payout availability must account for refund reserves and unsettled transactions.

### Risk controls

- Creator payout onboarding with identity, bank and tax details.
- Minimum payout threshold and settlement delay.
- Sender daily spend limit.
- Per-device/account velocity rules.
- Self-gifting and related-account detection.
- Refund/chargeback reversal.
- Creator suspension freezes new earning/payout without deleting the audit trail.
- No random gift outcomes or paid moderator/speaker privileges.

### Acceptance criteria

- A client cannot alter price, gift type or creator share.
- A purchase token grants value exactly once.
- Failed/pending purchases grant no gift.
- Refund/revocation reverses creator availability safely.
- Realtime animation failure does not lose the financial record.
- A blocked/banned/ineligible participant cannot send or receive a gift.
- Finance can reconcile store reports to gifts, ledger balance and payouts.

## Epic 8 — paid rooms and workshops

**Priority:** P2/P3; alternative to gifts for the first creator transaction pilot

### Core models

```text
paid_room_products
  id, creator_id, title, description
  provider_product_id, currency, status
  scheduled_party_id, replay_available

paid_room_orders
  id, user_id, product_id, provider
  purchase_token_hash UNIQUE, status, purchased_at, refunded_at

paid_room_entitlements
  user_id, party_id, source_order_id
  valid_from, valid_until, revoked_at
  UNIQUE (user_id, party_id)
```

### Join behavior

- Public/free parties behave unchanged.
- For a paid party, `POST /parties/:id/join` checks a valid entitlement before issuing a LiveKit token.
- Host/co-host/moderation staff bypass purchase but remain audited.
- ~~A share link never bypasses entitlement.~~
- A refunded/revoked order prevents future joins; define behavior for a currently connected participant.
- ~~Clearly expose cancellation, reschedule and refund terms before purchase.~~

### Delivery evidence

Record purchase, successful entitlement grant, join attempts, first successful media join and room cancellation. This supports refunds without recording private room content.

## Epic 9 — creator memberships

**Priority:** P3; do not start before demand gates

### Launch gate

- At least 100 hosts with 50+ followers.
- Measurable repeat attendance.
- At least ten creator interviews requesting ongoing paid access.
- Payout/KYC/refund operations already work for one-time creator transactions.

### V1 scope

- One membership tier per creator initially.
- Monthly store subscription.
- Members-only scheduled rooms and posts.
- Supporter cosmetic controlled by the member.
- Creator member count, active/canceled state and net earnings dashboard.
- Grace/hold/expiry handling through the same central store lifecycle system.

### Isolation requirement

Creator membership is not Hiva Plus. Use different product IDs, entitlements and cancellation state. Buying one must not silently grant the other.

## Epic 10 — local business and venue pages

**Priority:** P3

### Scope

- Verified business/venue profile.
- Address, hours, amenities, links and upcoming events.
- Staff roles.
- Offers with QR/redemption codes.
- Aggregate page views, saves, event clicks and redemptions.
- Clearly labelled sponsored placement.
- Moderation and advertiser eligibility.

### Models

```text
business_profiles
  id, workspace_id, category, address, city
  verification_status, hours_json, amenities, status

business_offers
  id, business_id, title, terms
  starts_at, ends_at, redemption_limit, status

offer_redemptions
  id, offer_id, user_id, redeemed_at, verifier_user_id
  UNIQUE (offer_id, user_id)

promotions
  id, owner_type, owner_id, placement
  starts_at, ends_at, budget_minor, status
```

### Promotion ranking

- Sponsored results must be labelled.
- Promotion eligibility requires safe content and active business/event state.
- Blocks, age rules, location privacy and moderation exclusions apply before payment/ranking.
- Enforce frequency caps per viewer.
- Separate organic and sponsored metrics.
- Payment never guarantees clicks, attendees or sales.

## Epic 11 — branded community hubs

**Priority:** P3/P4; concierge pilot first

### V1 pilot

- Private organization hub.
- Invite/domain-based membership approval.
- Owner/admin/moderator/member roles.
- Announcements, events, rooms and member directory.
- Hub-specific notification controls.
- Basic aggregate analytics and audit log.

Do not build custom domains, SSO, arbitrary branding or complex tenant configuration until two pilot organizations use the basic hub repeatedly.

## Privacy and safety foundation

### Free controls

These remain available without any entitlement:

- Nearby visibility on/off.
- Private profile.
- Hide online status.
- Block and report.
- Message-request restrictions.
- Party invitation restrictions.
- Read-receipt choice if receipts exist.
- Lock-screen preview privacy.
- Data export/account deletion/location deletion.

### Paid convenience, not paid safety

Plus may add:

- scheduled discovery visibility;
- saved visibility presets;
- separate Nearby/Search/Party recommendation surface choices when a free global-off control exists;
- scheduled quiet modes;
- reusable content audience presets;
- automatic content expiry.

### Privacy contract

```ts
type UserPrivacySettings = {
  privateProfile: boolean;
  hideOnlineStatus: boolean;
  showReadReceipts: boolean;
  messageRequestsFrom: 'everyone' | 'followers' | 'shared_context' | 'nobody';
  partyActivityVisibleTo: 'everyone' | 'followers' | 'nobody';
  nearbyVisibility: 'on' | 'off';
  searchDiscoverability: boolean;
  partyRecommendationDiscoverability: boolean;
  lockScreenPreview: 'full' | 'sender_only' | 'hidden';
};
```

Store paid schedules/presets separately from effective settings. On expiry, retain the dormant preset but apply the safest valid free state. Never broaden visibility during downgrade.

### Location protections

- Prefer coarse and foreground location.
- Never return raw coordinates for other users.
- Never include coordinates in logs, analytics, push payloads or client errors.
- Apply distance buckets/fuzzing, refresh throttles and freshness windows server-side.
- “Invisible” immediately excludes the user from new search/recommendation results and invalidates relevant caches.
- Apply blocks symmetrically at query and realtime-event layers.
- Rate-limit Nearby/Search enumeration by user/device/IP risk signals.

## Add-on billing matrix

| Product | Provider | Product type | Restore behavior |
| --- | --- | --- | --- |
| Hiva Plus | Google Play / App Store | Subscription | Restore active entitlement |
| Profile/party/event boost inside Hiva | Store | Consumable | No repeat grant for same token |
| Permanent theme pack | Store | Non-consumable | Restore permanent ownership |
| Animated creator gift | Store | Consumable | Financial history persists; consumed product itself is not restored |
| Paid one-to-many room | Store | One-time digital entitlement | Restore room entitlement while valid |
| Creator membership | Store | Subscription | Restore membership lifecycle |
| Physical event ticket | Razorpay/external gateway | Physical service | Restore from Hiva ticket/order record |
| Organizer Pro B2B | Web/direct business billing | Workspace subscription | App fetches workspace entitlement |

## Analytics implementation

### Shared purchase funnel

```text
paywall_eligible
paywall_viewed
plan_selected
checkout_started
purchase_pending
purchase_verified
purchase_failed
restore_started
restore_completed
entitlement_granted
entitlement_revoked
subscription_renewed
subscription_grace_started
subscription_expired
subscription_refunded
paid_benefit_used
limit_reached
```

Required properties:

- product key and sanitized provider product ID;
- placement/reason;
- benefits version;
- normalized failure reason;
- plan/base plan/offer ID;
- country/store and app version.

Forbidden properties:

- purchase token;
- message/body text;
- exact location;
- attendee private goals;
- bank/KYC data;
- raw provider payload;
- sensitive demographic inference.

### Cost telemetry

Attribute variable cost where possible:

- LiveKit participant minutes and egress;
- uploaded/transcoded media bytes;
- transcription/AI input-output usage;
- storage and signed-download traffic;
- push/digest volume;
- payment/refund/payout fees.

Support cost and moderation load should be reviewed by product, even when they cannot be attributed perfectly per user.

## Testing strategy

### Contract tests

- Mobile TypeScript models match actual API envelopes.
- Disabled feature routes produce the documented hidden/unavailable behavior.
- Entitlement fields are additive and backward compatible where required.

### Billing tests

- Valid purchase, pending, canceled, renewed, grace, hold, paused, expired, refunded and revoked.
- Duplicate client verification and duplicate provider webhook.
- Out-of-order webhook delivery.
- Purchase token reuse across accounts.
- Wrong package/product/environment.
- Provider timeout and retry.
- App reinstall and cross-device restore.
- Transaction succeeds but realtime/UI delivery fails.

### Authorization tests

- Workspace role matrix.
- Ticket holder versus checked-in attendee.
- Host/co-host/member party permissions.
- Blocked/private/banned users across search, networking, rooms and purchases.
- Subscription expiry cannot bypass safety rules or leak private settings.

### Concurrency tests

- Two new DM starts at the remaining limit.
- Two ticket issues against the final workspace credit.
- Duplicate gift/paid-room token verification.
- Concurrent opt-out and networking list fetch.
- Refund while payout/reserve calculation runs.

### Mobile QA

- Slow/offline purchase state.
- Process death during checkout.
- Pending cash-based Play purchase.
- Accessibility labels, dynamic text and reduced motion.
- Localized price/currency and plan-aware renewal copy.
- Deep link into event/party after entitlement purchase.
- No paywall during safety action, reporting or location-permission denial.

## Delivery milestones

### Milestone 0 — instrumentation and safety

- Feature flags and central entitlement interface.
- Billing/audit event structure.
- Redaction rules and admin support lookup.
- Baseline purchase and organizer funnel analytics.

### Milestone 1 — first revenue

- Fixed ticket-credit packs.
- Organizer purchase/balance/ledger UI.
- Event/ticket/check-in happy path verified end-to-end.
- Five pilot workspaces supported.

### Milestone 2 — Hiva Plus closed beta

- Google subscription backend and RTDN.
- DM limit enforcement.
- Profile theme, optional badge and one workflow benefit live.
- Monthly/yearly Android beta with server cohort rollout.

### Milestone 3 — organizer retention

- Organizer Pro workspace entitlements.
- Templates, broadcasts, exports and analytics.
- Event Networking Mode opt-in pilot.

### Milestone 4 — host retention

- Party templates, series, questions and analytics.
- Measured media cost.
- Recording/transcription only if consent and retention controls are complete.

### Milestone 5 — one creator transaction

- Choose gifts or paid rooms.
- Store billing, entitlement/ledger, refunds and payout operations.
- Ten vetted creators/hosts in a limited pilot.

### Milestone 6 — scale products

- Creator memberships after demand gates.
- Local business pilot in one city.
- Community hubs after concierge validation.

## Release gates

Do not advance a monetization feature from beta unless:

- purchase verification succeeds for at least 98% of valid test/production attempts;
- no unresolved entitlement-severity incident exists;
- refunds and revocations reconcile correctly;
- advertised benefits are live and server enforced;
- variable cost is measured and inside the product's margin envelope;
- safety reports are not materially worse than the corresponding free surface;
- support can identify, explain and remediate a failed purchase;
- rollback disables new sales without deleting existing ownership/history.

## Definition of done for every paid feature

- Product and API contract approved before UI work.
- Server-side entitlement and authorization implemented.
- Billing route matches the product type.
- Idempotency and concurrency behavior tested.
- Refund, expiry, revocation and downgrade behavior defined.
- Analytics and cost telemetry implemented with privacy review.
- Admin/support visibility implemented.
- Accessibility and localization verified.
- Feature flag and rollback path tested.
- No sensitive tokens/data in logs, crashes or analytics.
- Documentation names the owner and operational runbook.

## Explicitly out of scope

Do not build:

- exact/live distance selling;
- named profile-view history;
- paid bypass of message/privacy limits;
- random/loot-box gifts;
- ads inside private conversations;
- unlimited LiveKit, transcription or AI usage;
- lifetime Plus;
- paid “verification” without real identity verification;
- more than one consumer subscription tier before V1 proves retention.

## Immediate engineering backlog

Execute in this order:

1. Write the Google subscription backend contract tests.
2. Add subscription tables, verification, RTDN and reconciliation.
3. Add atomic DM-start usage enforcement.
4. ~~Make Plus badge opt-in and remove unimplemented paywall claims.~~
5. Expose server-configured ticket-credit packs.
6. Build the minimum organizer purchase/balance/event/check-in surface.
7. Add organizer and Plus funnel telemetry.
8. ~~Ship one profile theme and one workflow benefit before Plus beta.~~
9. ~~Implement advanced discovery filters and saved presets.~~
10. Design Event Networking Mode contracts and privacy tests before UI.

Do not begin creator memberships, self-serve ads or community hubs while any P0 billing/entitlement work remains incomplete.
