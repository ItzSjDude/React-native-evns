# Paid-event ticket flow (app design)

Status: design only. Audience: Frontend-Dev, Backend-Dev. Author: Architect agent, 2026-10-15.
Sources: gathr-api `API.md` (§3-§6, §11, §13), `src/routes/{chat,paymentCard,ticket}.routes.js`, `src/services/{chat,ticket,event}.service.js`, `src/repositories/{paymentCard,ticket,conversation,message}.repository.js`, `src/app.js` (events gate), tests `direct-payment-card.test.js`, `events-flag.test.js`, `concurrency.test.js`. App: `src/features/{messages,events,organizer,notifications}`, `AGENTS.md`.

Legend: **VERIFIED** = read in backend code. **UNVERIFIED** = inferred from docs only or not found in code.

## 0. Summary and decisions

- Money moves off-platform (UPI/bank/link/cash). Hiva only records claims: card `SHARED` -> `PAID_CLAIMED` -> `CONFIRMED`, and the organiser's "Share ticket" mints the ticket.
- Today the buyer is stuck because the chat renders every non-text message as a generic label and never calls `mark-paid`. The organiser has no UI at all: `GET /conversations` only returns threads where `user_id = me`, so staff threads exist only under `GET /workspaces/:wsId/conversations`.
- **No backend change is needed to unblock the buyer.** Two backend fixes are needed for production safety (G1, G2 in section 4). Eight more are strongly recommended.
- **D1** One chat component for both sides. `DirectConversation` gains a `viewerSide` prop (`'ATTENDEE' | 'WORKSPACE'`), plus callbacks injected by the host. Payment/ticket UI lives inside the `messages` feature because `PAYMENT_CARD` and `TICKET` are `MessageType`s in its contract.
- **D2** `messages` must not import `events` or `organizer`. `events` already imports `organizer`, and `organizer` will import `messages`; a `messages -> events` import closes a cycle. Events-only things (open ticket pass, request ticket again) are injected as props by the host (`TabNavigation` / organiser inbox).
- **D3** All new sheets render **inside** `DirectConversation`'s `<Modal>` (as its existing `BottomSheet` does). A second top-level `Modal` fails to present on iOS while the chat modal is up.
- **D4** Organiser sees "Issue ticket", not "Confirm". Do not expose explicit `confirm` on EVENT threads in v1: issuing already confirms atomically inside the transaction, while an explicit `confirm` is terminal and irreversible even if the later issue fails (sold out / `402`). `confirm` stays DIRECT-only and is deferred.
- **D5** DIRECT-thread `PAYMENT_CARD` messages stay a generic, non-actionable bubble in v1 (no payee details, no UPI link). Strangers can push cards into a DIRECT thread (section 4, G11) and this is a phishing vector.
- **D6** Card state is never inferred from messages. The source of truth is `GET /conversations/:id` -> `paymentCards[]`. Messages only say "something changed, refetch".

## 1. Sequence and state machine

### 1.1 Buyer (attendee)

```
EventDetailSheet
  GET  /events/:id                         viewer.{interest,ticket,conversationId}
  POST /events/:id/purchase                -> {mode:'CHAT_OPENED', conversationId, message}   (paid)
                                              -> {mode:'TICKET_ISSUED', ticket}                (free; unchanged)
     404 = events.enabled off; 409 = already ticketed / started / not published
     NOTE: each call on a paid event posts a new SYSTEM "wants to buy" message and re-notifies staff (G21)
Open thread (Messages tab, kind 'EVENT', viewerSide 'ATTENDEE')
  GET  /conversations/:cid                 -> conversation + viewerSide + paymentCards[]  (also marks read)
  GET  /conversations/:cid/messages?limit=50
  WS   message.created / edited / deleted  (user channel; nothing to subscribe)
Organiser shares card -> PAYMENT_CARD message (+ PAYMENT_CARD_SHARED push)
  Buyer taps card -> PaymentDetailsSheet (payee, amount, method details, note, expiry hint)
  Buyer pays outside the app (UPI deep link / bank app / link / cash)
  Buyer taps "I've paid" -> MarkPaidSheet (optional reference <=120 chars)
  POST /payment-cards/:id/mark-paid {reference?}   -> 200 card PAID_CLAIMED
       server also posts SYSTEM "Marked as paid" {paymentCardId, reference} and pushes PAYMENT_MARKED_PAID to staff
Organiser issues -> TICKET message (+ TICKET_ISSUED push)
  Buyer taps ticket bubble -> host opens ticket pass
  GET  /tickets/:id?includeImage=true      -> {code, status, qrPayload, qrImageDataUrl, event_*}
  (events.enabled off => 404; see 3.1)
```

### 1.2 Organiser (workspace OWNER/ADMIN only; MEMBER/SCANNER/ANALYST get 404)

```
Entry: PURCHASE_REQUESTED push or OrganizerDashboard -> "Sales chats"
  GET  /workspaces/:ws/conversations?eventId=&limit=&offset=   (ADMIN+, gated by events flag)
Open thread (kind 'EVENT', viewerSide 'WORKSPACE')
  GET  /conversations/:cid                 -> viewerSide 'WORKSPACE', is_paid, price_minor, currency, event_status, paymentCards[]
  GET  /conversations/:cid/messages
Share payment details
  POST /conversations/:cid/payment-cards  {amountMinor, currency, method, payeeName?, upiId?|qrImageUrl?, accountNumber+ifsc?, paymentLink?, note?, expiresAt?}
       -> 201 {message, paymentCard}        409 if event CANCELLED
  QR image: POST /media/upload-url {purpose:'chat', contentType:'image/jpeg'} then PUT bytes, send the resulting URL as qrImageUrl
Buyer claims -> SYSTEM message + PAYMENT_MARKED_PAID push
Issue ticket
  POST /conversations/:cid/ticket {paymentCardId?, tierId?}
       -> 201 ticket + qrPayload; atomically: seat reserved, 1 credit spent, card -> CONFIRMED, TICKET message, interest -> TICKETED
       errors: 402 NO_TICKET_CREDITS, 409 sold out / already holds ticket / cancelled / DRAFT, 409 TIER_SOLD_OUT, 403 payout/verification
Reject (no money received / cannot sell)
  POST /payment-cards/:id/cancel          (only while SHARED or PAID_CLAIMED)
  POST /conversations/:cid/messages {type:'TEXT'}          explain why (cancel emits nothing itself, G4)
  PATCH /conversations/:cid/status {status:'CLOSED'}       optional
Refund after issue (off-platform money, no API)
  POST /tickets/:id/cancel {reason?}      frees seat + returns credit to workspace; SYSTEM message posted
  App prompts organiser to refund outside Hiva and shows a message template.
```

Which workspace? The conversation row has `workspace_id`; the host resolves role with `listMyWorkspaces()`. Show organiser actions only if `viewerSide === 'WORKSPACE'` (server-confirmed by `GET /conversations/:cid`), never from local role guesses.

### 1.3 Payment card state machine (server-enforced, VERIFIED in `paymentCard.repository.js`)

| From | To | Who (EVENT thread) | Endpoint | Guard |
| --- | --- | --- | --- | --- |
| (none) | SHARED | workspace ADMIN+ | `POST /conversations/:cid/payment-cards` | event not CANCELLED |
| SHARED | PAID_CLAIMED | attendee | `POST /payment-cards/:id/mark-paid` | `status = SHARED`, else 409 |
| SHARED, PAID_CLAIMED | CONFIRMED | workspace | `POST /payment-cards/:id/confirm` or implicitly by issue | else 409 |
| SHARED, PAID_CLAIMED | CANCELLED | workspace | `POST /payment-cards/:id/cancel` | else 409 |
| any | EXPIRED | nobody | never set; `expiresAt` is cosmetic | do not branch |

CONFIRMED and CANCELLED are terminal. Rank for client-side merge (never regress): `SHARED 0 < PAID_CLAIMED 1 < CONFIRMED = CANCELLED 2`.

### 1.4 Ticket

`ISSUED -> CHECKED_IN` (scanner), `ISSUED|CHECKED_IN -> CANCELLED` (holder or active non-ANALYST member, G12). `EXPIRED` exists in the schema; no code path sets it (grep found none; UNVERIFIED for external cron). QR is a static HMAC (`v1.<ticketId>.<eventId>.<sig>`); it dies only on cancel, transfer (secret rotated), or event cancel. It never expires by time.

### 1.5 Derived thread state (client, per headline event)

Pure function `deriveThreadState(conversation, cards, viewerSide)` in `threadState.ts`. The headline event is `conversation.event_id`; cards carry no event id (G1), so the "current" card is the newest non-terminal card created after the newest purchase-request SYSTEM message whose `metadata.eventId === event_id` (fallback: newest non-terminal card).

| State | Condition | Buyer sees | Organiser sees |
| --- | --- | --- | --- |
| `REQUESTED` | no non-terminal card | "Waiting for organiser" | primary: **Share payment details** |
| `CARD_SHARED` | newest card SHARED | card + **I've paid** | card; "Waiting for payment"; **Issue ticket** (allowed, D4), **Withdraw** |
| `PAID_CLAIMED` | newest card PAID_CLAIMED | "Waiting for organiser to confirm" | highlighted; **Issue ticket**, **Not received** (cancel) |
| `CONFIRMED_NO_TICKET` | card CONFIRMED and no live ticket | "Payment confirmed, ticket coming" | **Issue ticket** (retry after 402/409) |
| `TICKETED` | TICKET message / `viewer.ticket` live | **View ticket** | ticket card; **Cancel ticket** in overflow |
| `WITHDRAWN` | newest card CANCELLED, no live ticket | "Request withdrawn" + **Request ticket again** | **Share payment details** |
| `CLOSED` | `conversation.status = CLOSED` | composer disabled; **Request ticket again** | composer disabled; **Reopen** |
| `EVENT_CANCELLED` | `event_status = CANCELLED` | banner, no actions | banner; refund reminder |

`TICKETED` -> back to `REQUESTED` for a second event: the thread is shared across events (`conversation_events`), so recompute from the headline event each time.

## 2. Contracts first (add before any component)

### 2.1 New file `src/features/messages/threadTypes.ts` (re-export from `types.ts`, then the barrel)

```ts
// Raw rows are snake_case (API.md section 1). Requests are camelCase.
export type PaymentMethod = 'UPI' | 'BANK' | 'CASH' | 'LINK';
export type PaymentCardStatus = 'SHARED' | 'PAID_CLAIMED' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

/** paymentCardRepository row. Sensitive: never log, never cache (section 5). */
export type ApiPaymentCard = {
  id: string; conversation_id: string; message_id: string;
  amount_minor: number; currency: string; method: PaymentMethod;
  payee_name: string | null; upi_id: string | null;
  account_number: string | null; ifsc: string | null;
  payment_link: string | null; qr_image_url: string | null;
  note: string | null; status: PaymentCardStatus; expires_at: string | null;
  created_by: string; marked_paid_at: string | null;
  confirmed_by: string | null; confirmed_at: string | null; created_at: string;
};

/** ticketRepository DETAIL row as pushed on the socket. Contains `secret` and `attendee_email` today (G2); the mapper must drop both. */
export type ApiTicketRow = {
  id: string; code: string; status: 'ISSUED' | 'CHECKED_IN' | 'CANCELLED' | 'EXPIRED';
  event_id: string; event_title: string; event_starts_at: string; event_ends_at: string | null;
  event_venue: string | null; event_status: string; workspace_name: string; issued_at: string;
  conversation_id: string | null; payment_card_id: string | null;
};

/** metadata by message type. Discriminate on `type`, then narrow metadata with a guard (never cast blindly). */
export type PaymentCardMetadata = { paymentCardId?: string; amountMinor: number; currency: string; method: PaymentMethod };
export type TicketMetadata = { ticketId: string; code: string; eventId: string };
export type PurchaseRequestMetadata = { eventId: string; priceMinor: number; currency: string };   // SYSTEM, sender ATTENDEE
export type PaymentSystemMetadata = { paymentCardId: string; reference?: string | null };          // SYSTEM mark-paid (has `reference` key) / confirm (no key)
export type TicketSystemMetadata = { ticketId: string };                                           // SYSTEM "Ticket X cancelled"

/** Socket-only enrichment on `message.created` (API.md section 13). REST list does NOT hydrate these (G5). */
export type ThreadMessageExtras = { paymentCard?: ApiPaymentCard; ticket?: ApiTicketRow };

/** GET /conversations/:id (chatService.get). Flat: conversation row + joins + viewerSide + paymentCards. */
export type ApiConversationDetail = {
  id: string; kind: ConversationKind; status: ConversationStatus;
  workspace_id: string | null; event_id: string | null; user_id: string | null;
  event_title: string | null; event_starts_at: string | null; is_paid: boolean | null;
  price_minor: number | null; currency: string | null; event_status: string | null;
  workspace_name: string | null; attendee_name: string | null; attendee_avatar_url: string | null;
  attendee_email?: string | null;               // present today (G14); mapper drops it
  viewerSide: 'ATTENDEE' | 'WORKSPACE';
  paymentCards: ApiPaymentCard[];               // newest first
};

/** Request bodies (camelCase). Method-specific requirements mirror chat.schema.js sharePaymentCard. */
export type SharePaymentCardInput = {
  amountMinor: number;                          // integer >= 1
  currency?: string;                            // 3 letters, server default INR
  method: PaymentMethod;
  payeeName?: string;                           // <= 120
  upiId?: string; qrImageUrl?: string;          // UPI needs one of
  accountNumber?: string; ifsc?: string;        // BANK needs both (<= 40 / <= 20)
  paymentLink?: string;                         // LINK needs a valid URL
  note?: string;                                // <= 500
  expiresAt?: string;                           // ISO; display hint only
};
export type SharePaymentCardResult = { message: ApiMessage; paymentCard: ApiPaymentCard };
export type MarkPaidInput = { reference?: string };                 // <= 120, trimmed
export type ShareTicketInput = { paymentCardId?: string; tierId?: string };
export type IssuedTicket = ApiTicketRow & { qrPayload: string };    // 201 body of POST /conversations/:cid/ticket
export type WorkspaceConversationRow = ApiConversation & {
  attendee_name: string | null; attendee_avatar_url: string | null; // inbox rows lack last_message and card state (G13)
};
```

### 2.2 Domain model and pure helpers (UI never touches raw rows)

`src/features/messages/paymentCard.ts` (pure, fully unit-tested):

- `type PaymentCard = { id; amountMinor; currency; method; payeeName; status; expiresAt; note; createdBy; createdAt; detail: PaymentDetail }`
- `type PaymentDetail = {kind:'UPI'; upiId?: string; qrImageUrl?: string} | {kind:'BANK'; accountNumber: string; ifsc: string} | {kind:'LINK'; url: string; host: string} | {kind:'CASH'}`
- `toPaymentCard(row)`, `maskAccount('123456789012') -> '••••9012'`, `formatMinor(amount, currency)` (reuse `formatEventPrice` logic; move the shared money formatter to `src/components/` or `core/format` rather than importing from `events`).
- `buildUpiUri({upiId, payeeName, amountMinor, note})`: only for `INR` and only if `upiId` matches `^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$`; every param through `encodeURIComponent`; `am` is `(minor/100).toFixed(2)`. Returns `null` otherwise (render details without a button).
- `isPastExpiry(card, now)`: display hint only; never blocks an action.
- `cardRank(status)`; `mergeCards(current, incoming)` keeps the higher rank.
- `toCacheableMessage(message)` (section 5).

`src/features/messages/threadState.ts`: `deriveThreadState` (1.5) and `allowedActions(state, viewerSide, kind)`.

### 2.3 Services: new `src/features/messages/threadService.ts`

```ts
getConversationDetail(id): Promise<ConversationDetail>              // GET /conversations/:id, maps via toConversationDetail (drops attendee_email)
sharePaymentCard(cid, input): Promise<SharePaymentCardResult>       // POST /conversations/:cid/payment-cards
markPaymentPaid(cardId, input?): Promise<ApiPaymentCard>            // POST /payment-cards/:id/mark-paid
cancelPaymentCard(cardId): Promise<ApiPaymentCard>                  // POST /payment-cards/:id/cancel
shareTicket(cid, input?): Promise<IssuedTicket>                     // POST /conversations/:cid/ticket
setConversationStatus(cid, 'OPEN'|'CLOSED')                         // PATCH /conversations/:cid/status
```

`confirmPaymentCard` is intentionally not exported in v1 (D4). Services return domain models, and none of them log or record request or response bodies. Error mapping goes through a new `threadErrorMessage(error, op)` in `threadPresentation.ts` (mapping in section 3).

Organiser service in `src/features/organizer/organizerInboxService.ts`: `listWorkspaceConversations(workspaceId, {eventId?, offset})` -> `GET /workspaces/:ws/conversations`, mapped to a `Conversation`-compatible row with `title = attendee_name`, `contactId = null`, `kind = 'EVENT'`.

### 2.4 Files to create / change

| File | Action |
| --- | --- |
| `messages/threadTypes.ts` | **new** contracts (2.1); `types.ts` re-exports; widen `ApiMessage.metadata` use via guards, keep `Record<string, unknown>` |
| `messages/paymentCard.ts`, `threadState.ts`, `threadPresentation.ts` | **new** pure logic |
| `messages/threadService.ts` | **new** (2.3) |
| `messages/useThreadDetail.ts` | **new** hook: fetches detail, holds `cards` (merged by rank), refetch triggers in 3.4, 15s poll while a non-terminal card is on screen and the app is active (`setActiveInterval`) |
| `messages/MessageBubble.tsx` | **extract** from `DirectConversation.tsx` (the memo bubble) so variants live beside it |
| `messages/SystemMessage.tsx` | **new**: centred grey text for `SYSTEM` (today they render as bubbles, and as "mine" for any sender_role ATTENDEE) |
| `messages/PaymentCardBubble.tsx` | **new**: summary (amount, method, status chip, payee). Account number masked. Tap opens sheet. Variants by viewer: buyer CTA "Pay / I've paid", organiser status + actions. DIRECT kind renders a generic bubble (D5) |
| `messages/PaymentDetailsSheet.tsx` | **new** (buyer): full details (`selectable` text for VPA/account/IFSC; no clipboard dependency), **Pay with UPI app** (`Linking.openURL(buildUpiUri)`, try/catch), QR image via `RemoteImage`, link opens via `Linking` after showing host, note, expiry hint, amount-vs-listed-price warning |
| `messages/MarkPaidSheet.tsx` | **new** (buyer): "Only tap if you've completed the payment", optional reference, single submit |
| `messages/SharePaymentCardSheet.tsx` | **new** (organiser): method-specific form mirroring server validation, amount prefilled from `price_minor` (warn if edited), prefill payee/UPI from the previous card in this thread only |
| `messages/IssueTicketSheet.tsx` | **new** (organiser): shows event headline, remaining capacity (`tickets_issued/capacity` via host-injected event lookup or detail), selected card (amount, status, date), optional tier picker, confirm. Handles 402 (CTA to credits) and 409 variants |
| `messages/TicketBubble.tsx` | **new**: event title, code, status chip, **View ticket** -> `onOpenTicket(ticketId)`. Shows "Cancelled" if a SYSTEM message with `metadata.ticketId` and no `reference` key exists for it |
| `messages/ThreadActionBar.tsx` | **new**: sticky row above the composer showing the single primary action for the derived state (1.5) |
| `messages/conversationPresentation.ts` | **change**: `isOwnMessage(message, kind, contactId, viewerSide?, viewerId?)`. Organiser view: own = `sender_role === 'WORKSPACE'` (teammates labelled by `sender_name`); `SYSTEM` is never "own". `typeLabels`/`messageText`: previews for `PAYMENT_CARD`/`TICKET` never use `body` (it carries the organiser's free-text note) |
| `messages/DirectConversation.tsx` | **change**: new props `viewerSide`, `eventContext?`, `onOpenTicket?`, `renderTicketPass?` (rendered inside the Modal), `onRequestTicketAgain?`; item renderer switches on `type`; composer disabled when `CLOSED`; header shows event title and "Hosted by" for EVENT |
| `messages/realtimeEvents.ts` | **change**: `applyRealtimeToMessages` keeps `paymentCard`/`ticket` extras only in a side map consumed by `useThreadDetail`, not in the persisted message list; export `needsThreadRefresh(message)` (3.4) |
| `messages/messageCache.ts` | **change**: `toCacheableMessage` before `JSON.stringify`; add `clearAllCachedMessages()` called on sign-out (section 5) |
| `messages/Messages.tsx`, `index.ts` | **change**: accept and forward `onOpenTicket`/`renderTicketPass`/`onRequestTicketAgain`/`initialConversationId` fetch-by-id fallback; export new types and `deriveThreadState` |
| `organizer/OrganizerSalesInboxSheet.tsx`, `organizerInboxService.ts` | **new**: list per workspace/event, opens `DirectConversation` with `viewerSide='WORKSPACE'` imported from `../messages` barrel |
| `organizer/OrganizerDashboardScreen.tsx` | **change**: "Sales chats" entry with unread badge |
| `organizer/index.ts` | **change**: export the inbox sheet |
| `events/EventDetailSheet.tsx` | **change**: "Open event chat" passes `viewer.conversationId` (today `onOpenEventChat?.()` drops it); label for paid + `REQUESTED` becomes state-aware (see G7) |
| `events/ticketsService.ts`, `MyTicketsSheet.tsx` | **change**: offline-capable QR (3.9); status panel instead of QR for non-`ISSUED` |
| `home/Home.tsx`, `Navigation/TabNavigation.tsx` | **change**: notification tap for `conversation` target passes `{initialView:'events', initialConversationId}` (today `navigation.navigate('Chat')` drops the id); staff-type notifications route to the organiser inbox; wire injected props |
| `notifications/*` | **change**: ensure `PAYMENT_CARD_SHARED`, `PAYMENT_MARKED_PAID`, `TICKET_ISSUED`, `PURCHASE_REQUESTED` deep-link by `conversationId` |

Barrels: `messages/index.ts` exports `DirectConversation` (extended props), the new types, and nothing else new that other features do not need. `organizer/index.ts` exports the inbox sheet. No deep imports. Run a cycle check (`npx madge --circular --extensions ts,tsx src`) after the change. `messages <-> users` already forms a cycle; do not add to it.

## 3. Edge cases

### 3.1 Behaviour table

| Case | Behaviour |
| --- | --- |
| **Double tap I've paid** | Per-card in-flight lock (`useRef<Set<string>>`) and a disabled button. Server guard `status = SHARED` makes the second call `409`. Treat `409` on mark-paid as "already moved": refetch detail, close sheet, no error toast unless the card is `CANCELLED`. |
| **Request timed out (client `408` after 15 s)** | Outcome unknown. Never auto-retry. Refetch detail and messages, then show current truth. Applies to mark-paid, issue ticket, share card. |
| **Double tap Issue ticket** | Safe server-side (event row lock + `findLiveForAttendee` + unique index): second call `409 already holds a ticket`. Client treats that `409` as "refresh the thread; ticket exists". Credits are spent once. |
| **Double tap Share card** | NOT idempotent (G10): creates two cards, two messages, two pushes. Client lock + disable until the response; after unknown outcome (timeout) refetch detail and look for a new card before offering retry. |
| **Two staff act at once** | Two cards possible. Buyer sees the newest non-terminal card as actionable; older non-terminal ones render dimmed "Older request". Organiser share flow: create the new card first, then offer to withdraw the older one. Issue by teammate -> `409`, refresh. |
| **Sold out mid-chat** | Buyer may already have paid (capacity is only checked at issue, G9). Organiser gets `409 sold out` in IssueTicketSheet: message "Event is sold out. Refund the buyer outside Hiva, then withdraw the request" with **Withdraw request** (cancel works on PAID_CLAIMED). Buyer sees a SYSTEM/TEXT message and `WITHDRAWN`. Join-waitlist CTA is not offered after payment. |
| **Organiser out of credits** | `402 NO_TICKET_CREDITS`: show message, **Buy credits** deep link (`OrganizerCreditsScreen`). Card stays as is; retry after top-up. |
| **Event cancelled mid-chat** | `event_status = CANCELLED` from detail: banner on both sides, actions hidden; server rejects new cards (`409`). Live tickets are cancelled by the server (SYSTEM message per ticket, `TICKET_CANCELLED` + `EVENT_CANCELLED` pushes). Open cards stay (G17): buyer with `PAID_CLAIMED`/`CONFIRMED` sees "Event cancelled. Ask the organiser for a refund." Organiser sees refund reminder. |
| **Event started / ended** | Buyer cannot start a purchase after start (`409`), but an existing thread can still get a card and ticket (no server check, G16). App shows "Event already started" note on the organiser Issue sheet, does not block. Ticket pass shows "Event ended" when `ends_at ?? starts_at` is in the past; QR dimmed. |
| **Payment card changed or revoked** | Cards are immutable. "Change" = new card + cancel old. Buyer sheet open while organiser cancels: `mark-paid` -> `409`; refetch; show "Organiser withdrew this payment request. If you already paid, message them." with a prefilled TEXT draft. Cancelling a `PAID_CLAIMED` card needs a destructive confirm on the organiser side. |
| **Card past `expiresAt`** | Display hint only (server accepts mark-paid). Show "Offer may have expired, confirm with the organiser"; keep actions enabled. Never auto-hide. |
| **Refund** | No API and no money rails. (a) Before issue: withdraw card, tell buyer in chat. (b) After issue: `POST /tickets/:id/cancel`, then app shows "Refund ₹X to the buyer via <method>. Hiva doesn't move this money" and a message template. The existing buyer-side cancel dialog already says cancelling does not refund. Tracking refunds-due is add-on A3. |
| **Organiser offline / slow** | State `REQUESTED` shows how long ago it was requested and, after 24 h, a muted "No reply yet" with **Message organiser** (text composer is always available while OPEN). Auto-reminder is add-on A1. |
| **`events.enabled` off (404)** | Not-gated by the flag: chat, messages, cards share, ticket issue (G6). Gated: purchase, mark-paid, cancel, confirm, `/tickets/*`, `/workspaces/*`. Rule: on `404` from mark-paid, ticket fetch, or workspace inbox, show "Ticketing is paused right now. Your payment and ticket are safe; try again later" (extend `actionMessageOf`), never "not found" or "deleted". Keep chat usable. Buyer who paid cannot open the ticket pass until re-enabled; the ticket bubble still shows the code from `metadata.code`. |
| **Blocked users** | Block is enforced only on DIRECT sends (`sendMessage`, `addReaction`, `createDirect`). EVENT threads are not block-aware (UNVERIFIED whether blocking an organiser has any other effect). Card share on DIRECT has no block check (G11). In the app: DIRECT cards are generic (D5); composer error `403 "You can no longer message this person"` keeps its existing handling. |
| **Thread CLOSED** | `sendMessage` returns `409`. Card share and mark-paid are not checked against CLOSED (G11). App disables the composer and shows "Closed"; buyer gets **Request ticket again**, which calls `POST /events/:id/purchase` (reopens the thread; debounce 60 s to avoid G21 spam). |
| **App killed mid-flow** | Nothing is queued locally. Server state is truth: reopening runs `getConversationDetail` and resolves to the right state. Mid mark-paid: reopening shows `SHARED` (tap again, safe) or `PAID_CLAIMED`. Mid UPI handoff: optional "Did you complete the payment?" prompt on app foreground (add-on A2); persists only the card id and a timestamp. |
| **Expired/stale QR** | Two meanings. (1) Ticket QR: static; invalid if `status != ISSUED`, ticket cancelled, event cancelled, or QR rotated by transfer. Pass fetched live; if offline, show cached QR with "Last updated <time>" banner. (2) Card "QR" is the organiser's UPI QR image, not an expiring token. |
| **Ticket cancelled while pass is cached** | On next online open the status is refreshed; cached QR is deleted and replaced by a status panel. Door scanner rejects it regardless (live status check). |
| **Old card beyond the 50-message window** | `getDirectMessages` fetches `limit=50` with no paging. Bubble without a row in `paymentCards[]` renders "Earlier payment request" with no actions. Add `before=` paging for EVENT threads (long multi-event threads). |

### 3.2 Error mapping (`threadErrorMessage`)

| Status / code | Message |
| --- | --- |
| `404` on mark-paid / tickets / workspaces | Ticketing paused or item gone (see table) |
| `403` on organiser action | "Only the organiser can do this" and refetch (role changed) |
| `409` mark-paid | silent refetch (or withdrawn copy) |
| `409` ticket | server `message` shown verbatim; refresh thread |
| `402 NO_TICKET_CREDITS` | credits CTA |
| `409 TIER_SOLD_OUT` | refresh tiers, pick another |
| `429` | "Slow down", re-enable after 3 s |
| network / `408` | "Couldn't confirm. Checking..." then refetch |

### 3.3 Realtime ordering

Facts: every API frame has `eventId` and `seq`; the hub drops repeats and calls `onResync` on gaps/reconnect. The sender's own sockets also receive `message.created`, so the same row arrives via POST response and socket.

- Merge by `id` (existing `mergeMessages`); sort by `created_at`, then `id`. Equal-ms ties are possible inside one transaction (ticket + confirm); order is cosmetic.
- Card status is merged with `cardRank` so a late `SHARED` fetch never overwrites `PAID_CLAIMED`.
- A `PAYMENT_CARD` frame may arrive without `metadata.paymentCardId` (G3): resolve the card id as `message.paymentCard?.id ?? metadata.paymentCardId`.
- A `TICKET` frame may arrive before the organiser's `POST /ticket` response: dedupe by message id.
- Frame order is not guaranteed relative to REST: never derive state from "last SYSTEM message wins".

### 3.4 Refetch triggers for `useThreadDetail`

Refetch `GET /conversations/:cid` (debounced 300 ms, single flight) on: open; socket reconnect (`onResync`); app foreground; any incoming message where `type === 'PAYMENT_CARD' | 'TICKET'`, or `SYSTEM` with `metadata.paymentCardId` or `metadata.ticketId`; after every own mutation; and every 15 s while a non-terminal card is visible (covers the silent cancel, G4). The refetch also marks the thread read, which is the same side effect the app already relies on.

### 3.5 Offline QR at the door (the one place offline matters)

Door venues have poor connectivity. Store only the `qrPayload` string (about 150 bytes) per ticket in the Keychain (`react-native-keychain` already installed), keyed `hiva.ticket.<userId>.<ticketId>`; refresh on every online open and on `GET /tickets` list load; delete on cancel, sign-out and event end + 7 days. Render the QR locally. This needs a QR renderer: add `react-native-qrcode-svg` (pure JS over the already-linked `react-native-svg`). **Needs lead approval (adds a dependency).** Fallback without the dependency: keep using `qrImageDataUrl` online-only and show the human-readable `code` offline.

## 4. Backend gaps and contract ambiguities

Severity: R = required before production, S = strongly recommended, L = later. "V" = verified in code.

| ID | Sev | Finding | Proposed fix | Evidence |
| --- | --- | --- | --- | --- |
| G1 | **R** | Payment cards are not bound to an event or a ticket. `findLatestShareable` returns the newest `SHARED/PAID_CLAIMED/CONFIRMED` card in the thread, including a `CONFIRMED` card that already produced a ticket for an earlier event. Since threads now span events, an organiser can issue event B against event A's payment (or one card can back several tickets). `PAYMENT_CARD` messages carry no `eventId`. | Add `payment_cards.event_id` (set from `conversation.event_id` at share), include `eventId` in message metadata, and in `issueFromConversation` require `card.event_id = conversation.event_id` and no live ticket referencing the card. | V: `paymentCard.repository.js findLatestShareable`, `ticket.service.js issueFromConversation`, `chat.service.js sharePaymentCard` |
| G2 | **R** | `issueFromConversation` fans out `{...message, ticket: detailed}` where `detailed = ticketRepository.findById(...)` (`t.*` plus `u.email AS attendee_email`). `sanitise()` is applied only to the HTTP return value. The per-ticket `secret` and the attendee's email go to every staff member's socket, the attendee's socket, and through the external realtime service. The code comment says the secret must never reach a client. (Forging a QR still needs the server `TICKET_QR_SECRET`, so impact is limited, but email is PII.) | Fan out `sanitise(detailed)` minus `attendee_email`, and include nothing else. | V: `ticket.service.js` lines around `fanOutMessage(conversation, { ...message, ticket: detailed }` |
| G3 | S | `sharePaymentCard` returns and broadcasts the message row created **before** `attachMetadata`, so `metadata.paymentCardId` is missing in the 201 body and the socket frame (API.md claims it is present). REST list has it. | Return the row from `attachMetadata`. | V: `chat.service.js sharePaymentCard` discards the update result |
| G4 | S | `cancel` creates no message, no realtime event and no notification; `confirm` creates a SYSTEM message but no notification. Neither message has a machine-readable action; mark-paid vs confirm SYSTEM messages differ only by presence of a `reference` key. Buyer's UI cannot learn about a withdrawn card without polling. | SYSTEM message on cancel with `metadata.event` in `PAYMENT_MARKED_PAID | PAYMENT_CONFIRMED | PAYMENT_CANCELLED | TICKET_CANCELLED`, plus `PAYMENT_CARD_CANCELLED` notification and push to the buyer. | V |
| G5 | S | `GET /conversations/:id/messages` does not hydrate `paymentCard`/`ticket` (socket does); card status only exists on `GET /conversations/:id`. API.md is ambiguous. | Hydrate both on list with live status (and the sanitised ticket). | V: `message.repository.js listForConversation` |
| G6 | S | `events.enabled` gate covers `/payment-cards`, `/tickets`, `/workspaces`, etc. but **not** `POST /conversations/:cid/payment-cards` nor `POST /conversations/:cid/ticket`. With the flag off the organiser can still share cards and issue tickets while the buyer cannot mark paid or open the ticket. | Gate both conversation routes by path (regex on `/conversations/:id/(payment-cards|ticket)`), or document intentionally open. | V: `app.js EVENTS_GATED_PREFIXES`; `events-flag.test.js` does not cover them |
| G7 | S | No way for an organiser to decline a purchase request. Interest stays `REQUESTED`, so `EventDetailSheet` shows "Open event chat" forever and never "Purchase" again; closing the thread does not help (reopened only by a new `purchase` call, which the sheet cannot trigger). | `POST /conversations/:cid/decline {reason}`: cancels open cards, sets interest `CANCELLED`, posts SYSTEM, notifies. App workaround: **Request ticket again** inside the thread. | V (server) + V (app: `primaryLabel` logic) |
| G8 | S | `confirm` is terminal and does not check for a ticket. Explicit confirm followed by a failed issue (sold out, `402`) leaves a `CONFIRMED` card with no ticket and nothing to cancel. `cancel` on `PAID_CLAIMED` is allowed with no acknowledgement to the buyer. | Document; keep app on implicit confirm (D4). Optionally forbid cancel of `PAID_CLAIMED` without a reason field. | V |
| G9 | S | `sharePaymentCard` checks only event `CANCELLED`. A card can be shared for a sold-out event (or with zero credits, or after payout/verification is revoked), and the buyer pays before the later `409`/`402`/`403` at issue. | At share: `409` if sold out; return credits/eligibility in `GET /conversations/:id`; optional soft seat hold. | V |
| G10 | S | Share card is not idempotent; no `Idempotency-Key` support on card/ticket endpoints (ticket is safe by state guards). | Accept an idempotency key or dedupe identical open card within 30 s. | V |
| G11 | S | DIRECT threads: `sharePaymentCard` has no `isBlocked` check (`sendMessage` has one), no CLOSED check; any stranger reachable via Nearby can push a card with an arbitrary UPI ID. API.md §5 first says card actions are `403` on DIRECT threads, the later section and code allow them (test `direct-payment-card.test.js`). | Block + closed checks; fix docs; consider requiring an existing message exchange before accepting a card from a stranger. | V |
| G12 | S | `ticket.service.cancel` allows any active member except ANALYST (so MEMBER and SCANNER) to cancel any ticket, and the holder may cancel a `CHECKED_IN` ticket (frees a seat after attending, returns a credit). | Require ADMIN+ for staff cancel; refuse `CHECKED_IN` for holders. | V |
| G13 | L | Workspace inbox rows have no `last_message` and no card state, so the organiser cannot triage "paid, needs ticket". `unread_count` is per-viewer and counts only `ATTENDEE`-role messages. `PURCHASE_REQUESTED` data lacks `workspaceId`, `PAYMENT_MARKED_PAID` lacks `eventId`/`workspaceId`. | Add `last_message`, `pending_card_status`, and `workspaceId` in notification data. | V |
| G14 | L | `GET /conversations/:id` returns `attendee_email` to the attendee and to all staff. Confirm intent; app mapper drops it. | Remove unless staff need it. | V |
| G15 | L | `expiresAt` and card `EXPIRED` are never enforced; ticket `EXPIRED` has no code path (grep). | Either enforce or remove from docs. | V (cards), UNVERIFIED (ticket sweeps outside this repo) |
| G16 | L | Issue and card share do not check event start/end. | Product decision (door sales may want it). | V |
| G17 | L | `event.cancel` cancels tickets but leaves cards open and offers no "refunds due" list. | Cancel open cards, post SYSTEM, expose refunds-due. | V |
| G18 | L | `POST /conversations/:cid/read` exists and is used by the app but is undocumented in API.md. | Document. | V |
| G19 | L | Tier price is returned by the tiers hook (`tierPriceMinor`) but never compared with the card amount; the buyer cannot pick a tier at purchase. | Product decision. | V |
| G20 | L | `GET /conversations/:id/messages` response is newest-first with `before`/`limit<=100`; the app fetches 50 once. | App-side fix only (3.1). | V |
| G21 | S | `requestTicket` on a paid event posts a new SYSTEM "wants to buy" message and pushes `PURCHASE_REQUESTED` to all staff on **every** call, contradicting "safe to retry". | Dedupe when interest is already `REQUESTED` and the last request message is recent. | V: `event.service.js requestTicket` |
| G22 | L | Whether the realtime service forwards `paymentCard` to staff sockets exactly as the API publishes is not checked (separate service). | Verify with a staging capture. | UNVERIFIED |

**Required backend changes:** G1 and G2. Everything else has an app-side fallback described above.

## 5. Security and privacy

**What is sensitive.** `upi_id`, `account_number`, `ifsc`, `payment_link`, `qr_image_url` and the free-text `note` (organisers put payment instructions in it; it is also stored in `message.body`). Ticket `qrPayload` is a bearer credential at the door. The attendee's email must not surface in the app (G14).

**Who sees what.**

| Viewer | Sees |
| --- | --- |
| Buyer in own EVENT thread | Full card details after tapping into the sheet. Bubble shows payee, amount, method, status only; bank account masked (`••••9012`); UPI ID visible in the sheet, not in the bubble |
| Workspace OWNER/ADMIN | Same cards (their own data); masked in bubbles |
| MEMBER/SCANNER/ANALYST | Nothing; threads answer `404` |
| DIRECT counterpart | Generic "Payment request" bubble, no details, no pay button (D5) |

**Never log or persist.**

1. Do not pass card fields or request/response bodies of `/payment-cards` or `/conversations/*/payment-cards` to `recordError`, `log`, `console`, or Crashlytics. Log only `requestId`, status, code. `recordError(error, context)` context strings must be static ("mark-paid failed").
2. **Message cache** (`messageCache.ts` writes `messages.slice(-50)` as plaintext AsyncStorage JSON; `mergeMessages` merges socket-only fields, so `paymentCard` and `ticket` would be persisted today as soon as the UI keeps them): add `toCacheableMessage()` that
   - deletes `paymentCard` and `ticket` extras,
   - for `PAYMENT_CARD`: sets `body = null` and keeps only `metadata.{paymentCardId, amountMinor, currency, method}`,
   - for `TICKET`: keeps only `{ticketId, code, eventId}`,
   - for `SYSTEM` with `paymentCardId`: strips `reference`.
   Cards and tickets live in component state / hook state only. Do not copy them to Redux (also an AGENTS.md rule).
3. Add `clearAllCachedMessages()` (prefix `hiva.messages.cache.`) and call it on sign-out and account deletion. Today nothing clears it (grep: no remover), so a previous user's cached bubbles survive logout.
4. Previews and notifications (`conversationPresentation.messageText`, `followUpReminders.ts`, local notifee) must use the generic labels for `PAYMENT_CARD`/`TICKET`, never `body`.
5. Ticket QR: store only in Keychain (3.5), never AsyncStorage; do not write `qrImageDataUrl` to disk.

**Screenshot and clipboard.**

- Do not set `FLAG_SECURE` on the payment sheet: buyers legitimately screenshot a UPI QR to scan from their gallery, and the organiser's note literally asks for payment screenshots. It would also need a new native module.
- No programmatic clipboard in v1 (not installed, and account numbers on the clipboard are readable by other apps on older OS versions). Use `selectable` `Text` for long-press copy and the UPI deep link for the common path.
- Ticket pass: screenshots are acceptable (the QR is revocable server-side).

**Phishing and trust.**

- Buyer-side checks in `PaymentDetailsSheet`: show payee name and VPA together with the organiser's workspace name; warn when `amount_minor != event.price_minor` ("Organiser asked ₹X, listed price ₹Y"); show link host before opening `LINK` cards; only `https:`/`upi:` schemes are opened; reject `javascript:`/`intent:` etc.
- Paid events are verification-gated at publish (`event.service.js publish`) and again at issue, but not at card share (G9).
- `buildUpiUri` validates VPA and encodes every parameter to prevent parameter injection (`&am=1`) via a crafted `payeeName` or note.
- Android: `Linking.openURL('upi://...')` inside try/catch (no `canOpenURL` whitelisting required); if the manifest later needs `<queries>` for `upi`, add it with that change.

**Auth.** Organiser actions are hidden unless `GET /conversations/:id` returned `viewerSide === 'WORKSPACE'`; the server remains the authority (`403`/`404`). Treat `404` as "no access or paused", not "deleted".

## 6. Test plan

### 6.1 Unit (Jest, `__tests__` beside code)

- `paymentCard.test.ts`: `toPaymentCard` per method; `maskAccount`; `buildUpiUri` (valid VPA, invalid VPA returns null, injection attempts in payee/note, non-INR returns null, paise to rupees rounding); `isPastExpiry`; `cardRank`/`mergeCards` never regress.
- `threadState.test.ts`: every row of 1.5 for both sides; multi-event thread picks the headline event; older non-terminal card dimmed; `CLOSED`; `EVENT_CANCELLED`.
- `messageCache.test.ts`: `toCacheableMessage` strips `paymentCard`, `ticket`, card `body`, `reference`; `clearAllCachedMessages` removes only the prefix.
- `conversationPresentation.test.ts`: `isOwnMessage` for organiser (teammates), SYSTEM never own; previews for card/ticket ignore body.
- `realtimeEvents.test.ts`: frames with `paymentCard`/`ticket`, missing `metadata.paymentCardId` (G3 shape), duplicate frame, out-of-order card update.
- `threadService.test.ts`: exact paths, methods, bodies (`mark-paid` empty body vs `reference`), no `confirm` export, `getConversationDetail` drops `attendee_email`.
- `threadPresentation.test.ts`: error mapping table in 3.2 including 404 -> paused copy.

### 6.2 Component (react-test-renderer, mocks as in `DirectConversation.test.tsx`)

- `PaymentCardBubble`: buyer vs organiser vs DIRECT (generic) per status; masked account; amount-mismatch chip.
- `MarkPaidSheet`: double press -> one `markPaymentPaid` call; `409` -> refetch and close; reference trimmed and capped at 120.
- `SharePaymentCardSheet`: method-specific validation; amount prefill and edit warning; duplicate submit blocked; timeout -> refetch before retry.
- `IssueTicketSheet`: `402` shows credits CTA; `409 sold out` shows withdraw option; tier picker only when tiers exist; double press -> one call.
- `TicketBubble`: opens pass via `onOpenTicket`; "Cancelled" from SYSTEM message with `ticketId`.
- `DirectConversation` EVENT: socket `PAYMENT_CARD` frame appears and triggers one debounced detail refetch; card cancelled silently is picked up by the 15 s poll; composer disabled when `CLOSED`; modal-nested sheets render.
- `EventDetailSheet`: "Open event chat" passes `viewer.conversationId`.
- Notification routing: conversation target passes `initialConversationId`; fetch-by-id fallback when the conversation is not on page 1.

### 6.3 Backend tests to request (Backend-Dev)

G1 (second event cannot reuse a confirmed card), G2 (no `secret`/`attendee_email` in published `message.created`), G3 (metadata has `paymentCardId` in 201 body), G6 (flag off -> 404 on conversation card/ticket routes if gated), G9 (share on sold-out event -> 409), G11 (blocked DIRECT share -> 403), G21 (second `purchase` does not re-notify).

### 6.4 Manual emulator script (two emulators or one emulator plus one device)

Setup: backend local with a verified paid workspace (use the `_organiser-paid-workspace.js` fixture), >= 3 credits, a published paid event (capacity 2, price 50000 paise, starts in the future). Account A = organiser, B = buyer, C = second buyer.

1. B: Events -> event -> **Request ticket**. Expect chat opens on that thread, "wants to buy" system line centred; A gets `PURCHASE_REQUESTED` push.
2. A: tap push -> sales inbox opens the thread. Expect organiser actions bar "Share payment details".
3. A: share UPI card with default amount. B: expect `PAYMENT_CARD_SHARED` push, bubble in thread within 2 s, no reload.
4. B: open sheet; check payee/VPA/amount; tap **Pay with UPI app** (emulator without UPI app: expect graceful message, no crash); kill the app; relaunch; reopen thread. Expect still `SHARED`.
5. B: **I've paid** with reference; double-tap quickly. Expect one SYSTEM "Marked as paid" and `PAID_CLAIMED`. A: push `PAYMENT_MARKED_PAID`, card highlighted.
6. A: **Issue ticket**. B: ticket bubble within 2 s, `TICKET_ISSUED` push; open pass, QR visible; enable airplane mode, reopen: cached QR + "Last updated" banner.
7. Negative: set capacity to 1 (or fill the event with a free-path ticket). C requests; A shares a card to C; the last seat is taken by B; A tries to issue C. Expect `409 sold out` copy and **Withdraw request**; C sees the withdrawn state and **Request ticket again**.
8. Negative: A with zero credits issues: expect `402` and credits CTA.
9. Flag: platform admin sets `events.enabled=false`. B: mark-paid and open pass -> "Ticketing is paused" (not "not found"); chat still sends. Re-enable and retry.
10. Withdraw while B's sheet is open: B taps **I've paid** -> withdrawn copy, no stuck spinner.
11. Cancel the event as A: B sees banner, ticket shows cancelled; A sees refund reminder.
12. Check device storage (adb run-as / simulator AsyncStorage dump): cached messages contain no UPI ID, account number or `secret`; sign out and verify cache keys are gone.

## 7. Add-ons

| ID | Add-on | Value | Recommendation |
| --- | --- | --- | --- |
| A1 | **Auto-reminder to organiser**: backend re-pushes `PURCHASE_REQUESTED`/`PAYMENT_MARKED_PAID` to staff after 2 h and 24 h without action, dedupe-keyed per conversation; app shows "Waiting for you" badge on the sales inbox row. | The top conversion killer is organiser latency; offline organisers are common. App cost is small, backend cost is a scheduled job. | **Include** the backend job in this release if capacity allows; otherwise first follow-up. App badge is cheap, include. |
| A2 | **"Did you complete the payment?" prompt** when the buyer returns to the app within 10 minutes of opening a UPI deep link (persist card id and timestamp only). | Cuts forgotten "I've paid" taps, which are the buyer's only way to trigger organiser attention. | **Include** (small, no backend). |
| A3 | **Refunds-due list** for the organiser: cancelled tickets whose card was `CONFIRMED`, per event, with "mark refunded" note. | Closes the refund loop but needs backend data (G17) and product rules. | **Defer.** Ship the refund reminder dialog now. |

Also considered and rejected for v1: saved organiser payout profile (stores bank data on device or needs a new backend table), in-app clipboard copy (dependency and privacy), DIRECT-thread payments (D5), ticket in notifications (already delivered as `TICKET_ISSUED` push; the deep-link fix in section 2.4 covers it).

## 8. Task breakdown

Sizes: S <= 0.5 day, M ~ 1 day, L ~ 2-3 days. Dependencies in brackets.

**Frontend**

| # | Task | Size |
| --- | --- | --- |
| F0 | Contracts: `threadTypes.ts`, re-exports, fixtures | S |
| F1 | Pure logic: `paymentCard.ts`, `threadState.ts`, `threadPresentation.ts`, `toCacheableMessage` + `clearAllCachedMessages` + sign-out hook, unit tests [F0] | M |
| F2 | `threadService.ts` + `useThreadDetail.ts` + tests [F0] | M |
| F3 | Refactor: extract `MessageBubble`, add `SystemMessage`, `isOwnMessage(viewerSide)`, composer-disabled on CLOSED [F0] | S |
| F4 | Buyer UI: `PaymentCardBubble`, `PaymentDetailsSheet`, `MarkPaidSheet`, `ThreadActionBar`, `TicketBubble` [F1-F3] | L |
| F5 | Ticket pass wiring: `renderTicketPass` injection through `Messages`, `TabNavigation`; `MyTicketsSheet` status panel; offline QR (needs dependency approval) [F4] | M |
| F6 | Organiser: `organizerInboxService`, `OrganizerSalesInboxSheet`, dashboard entry [F3] | M |
| F7 | Organiser actions: `SharePaymentCardSheet`, `IssueTicketSheet`, withdraw/cancel/refund dialogs, tiers lookup [F4, F6] | L |
| F8 | Navigation and notifications: pass `conversationId`, fetch-by-id fallback, organiser routing, `EventDetailSheet` fixes, "Request ticket again" [F4] | M |
| F9 | Component and integration tests, madge cycle check, `npm run typecheck && lint && test` [all] | M |
| F10 | Manual emulator run (6.4) | S |

**Backend** (parallel with F0-F3)

| # | Task | Size |
| --- | --- | --- |
| B1 | G2 sanitise fan-out ticket (secret, email) + test | S |
| B2 | G1 card/event/ticket binding (+ migration, backfill from `conversation_events`/tickets) + tests | M |
| B3 | G3 return attached-metadata message | S |
| B4 | G4 cancel/confirm SYSTEM messages with `metadata.event`, notification on cancel | S |
| B5 | G5 hydrate list messages | M |
| B6 | G6 gate conversation card/ticket routes (or document) | S |
| B7 | G9 + G21 + G11 guards (sold-out at share, purchase dedupe, block/closed on DIRECT share) | M |
| B8 | G7 decline endpoint | M |
| B9 | G13 inbox `last_message`/`pending_card_status`, notification `workspaceId` | S |
| B10 | A1 reminder job (optional) | M |

Critical path: F0 -> F1/F2/F3 -> F4 -> F5 and F7/F8 -> F9. B1 and B2 must land before release but do not block frontend work.
