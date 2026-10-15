# On-platform paid-ticket checkout (Phase 2) - design

Status: design only, nothing implemented. Author: Architect agent, 2026-10-15. **Updated for the owner's chosen Option B (see "Decision: Option B" below); legal/tax points are UNVERIFIED.**
Audience: Backend-Dev, Frontend-Dev, QA, Security, and the owner (business/legal decisions in section 11 and Appendix A).
Supersedes nothing: the manual flow in `docs/design/PAID_TICKET_FLOW.md` (F-06) stays live and is retired only at the end of section 9.

Evidence tags used throughout:
- **[CODE]** read in `gathr-api` `origin/main` (fetched 2026-10-15) or in the open PRs #81/#82/#83.
- **[DOCS]** read on Razorpay/RBI/Google pages through a summarising fetch tool, not tested against a real account. Re-read the live page before coding a field.
- **[UNVERIFIED]** from memory, a secondary source, or not found. Anything legal or tax is **[UNVERIFIED-LEGAL]**: this is not legal or tax advice; Appendix A turns it into questions for a CA/lawyer.

---

## Decision: Option B (owner-chosen, 2026-10-15) - READ THIS FIRST

**What changed.** Earlier this doc recommended Option A (Razorpay Route: split at order, Razorpay holds and pays the organiser). The owner has chosen **Option B**: the buyer pays inside the app through Hiva's normal Razorpay merchant account (Standard Checkout, money settles to **Hiva's** bank account), the ticket is issued automatically from the verified webhook, Hiva keeps a configurable platform fee (300-700 bps), and **the owner pays organisers manually by bank transfer after the event**. We do **not** design around Route; Route-specific parts below are kept only as a dormant fallback (Option A) and are marked SUPERSEDED.

**What this means in one sentence.** Hiva holds third-party money between settlement and payout, so the new core is a **money ledger + admin manual-payout flow + hard safeguards**, all behind flags default OFF, piloted with a few workspaces. The regulatory question (Section 12, Appendix A Q1) is **open and UNVERIFIED**; nothing may be enabled with live money until the CA / Razorpay confirm the model in writing.

| Earlier section | Status under Option B |
| --- | --- |
| 0.1 baseline, 2.3 checkout (order, seat hold, idempotency), 2.4 webhook-driven issuance, 2.5 state machines (order, payment, refund), 2.7 failed/duplicate/late, 2.9 idempotency, 3 fee model + arithmetic, 4 core tables, 5 webhook security, 6 security, 7 app contracts, 8 test plan | **Valid**, with the deltas in Part B below |
| 1 options table | Option B is now chosen; Option A is a dormant fallback |
| 2.1 item 4 and 2.2 (Route linked-account onboarding), `workspace_route_accounts`, `ticket_order_transfers`, `transfers[]` in order creation, `transfer.*` / `product.route.*` webhooks, `reverse_all`, transfer holds/reversals in 2.6 and 2.8, D1 Route eligibility | **SUPERSEDED / not built.** Organiser bank details come only from the existing VERIFIED payout account (PR #81) |
| 2.6 refunds, 2.8 chargebacks | Valid in shape; money mechanics replaced by B4 (ledger instead of transfer reversal) |
| 9 rollout, 10 tasks, 11 decisions | Replaced / extended below (sections 9 deltas in B11, 10 rewritten, 11 extended, 12 new risk section) |

Backend truth re-checked 2026-10-15 on `gathr-api` `origin/main`: merged PRs #80-#84 (088 payout-account verification, 089 payment-card event binding, 087 age gate, 086 onboarding fields, organiser attendees route). `migrations/` ends at **089**; **next free is 090**. No open backend PRs were listed at the time of writing; re-run `git ls-tree origin/main migrations/` and `gh pr list --repo ItzSjDude/gathr-api` immediately before the migration PR.

---

## 0. TL;DR (earlier Route recommendation - SUPERSEDED by the decision above; items 3-7 still apply)

1. **Recommend Option A: Razorpay Standard Checkout + Route** (buyer pays Hiva's Razorpay account, an order-level `transfers[]` sends `price - platform_fee` to the organiser's linked account, settlement held until after the event). Razorpay is the RBI-authorised aggregator; Hiva stays a marketplace. Section 1.
2. **Hard gate before any code: is Hiva eligible for Route?** Razorpay's Route page says that, following the RBI Payment Aggregator Directions (Sep 2025), Route needs domestic turnover above INR 40 lakh (FY25 or FY26, shown by GST-3B or a self-declaration for new/exempt businesses) plus a written "payer-payee transparency" use-case, 5-7 business-day review, and that accounts which did not submit were switched off from 1 Jan 2026 **[DOCS]**. If Hiva cannot qualify, Option A is unavailable and the answer is "stay manual" or switch provider (Option C, same RBI regime). This is decision D1 and it is USER-GATED.
3. **Fee:** configurable basis points, validated to 300-700 bps, default in `app_config` (recommended 500), overridable per Organizer Pro plan and per workspace, snapshotted on every order. Deducted from the organiser's share; the buyer pays the listed price. Hiva bears gateway cost inside its fee (v1). At 3% the fee does not cover Razorpay's published 2% + 0.25% + GST, so the recommended default is 5%.
4. **Credits:** on-platform tickets do **not** consume ticket credits (the fee replaces them). Free tickets and the manual flow still do.
5. **Ticket is issued by the verified webhook (or server-side fetch), never by the client callback.** Seats are held at checkout in a new `events.seats_held` counter so we do not take money for a sold-out event.
6. **Migrations start at 090** (087/088/089 are taken by open PRs #82/#81/#83; `origin/main` ends at 086). Re-check right before the PR.
7. Everything defaults off: global `payments.onplatform.enabled=false`, per-workspace `onplatform_enabled=false`, per-event `payment_mode='MANUAL'`.

---

## 0.1 Verified baseline (what exists today, [CODE] unless noted)

| Area | Fact | Consequence |
| --- | --- | --- |
| Gateway | `src/services/payment.provider.js` is Razorpay-only (`createOrder`, `createRefund` with `X-Refund-Idempotency`, `fetchRefund`, `verifyWebhookSignature` HMAC-SHA256 over raw body with `timingSafeEqual`). Keys come from `appConfig` (`payments.razorpay_key_id/secret/webhook_secret`) with env fallback. `payments.provider=manual` is a non-prod escape hatch. | Extend, do not replace. Live key secret in `app_config` (DB) is a risk: move to env/Secrets Manager (section 6). |
| Webhook | `POST /webhooks/razorpay` mounted before the JSON parser with `express.raw({type:'*/*',limit:'1mb'})`; controller falls through creator-gift -> credit -> subscription handlers. Bad signature returns 400. **No event-id log or dedupe table**; idempotency is per handler (`status` CAS, unique `provider_payment_id`). The controller also contains a fallback `Buffer.from(JSON.stringify(req.body))` when the body is not a Buffer, which would never verify. | Add event log + dedupe; delete the fallback (fail closed). Ticket handler goes first in the chain and must return `null` for non-ticket events. |
| Lambda | `serverless.yml`: API is HTTP API (`httpApi`, `/{proxy+}`) + `serverless-http`, timeout 29 s, 512 MB, Neon Postgres. `eventScheduler` rate(15 min, 120 s), `subscriptionReconcile` rate(6 h), `outgoingWebhookWorker` rate(1 min, 90 s) exist. | Reconciliation and a 1-minute event worker fit existing patterns. |
| Credits | `credit.service.js`: packs from `app_config tickets.credit_packs_json`; purchase row reserved first with client idempotency key, then provider order, then `settlePurchase` locks the row, checks amount/currency, `PENDING -> PAID`, `applyDelta`. | Same shape is reused for ticket orders. |
| Ticket issue | `ticket.service.js issue()`: `ticket.issuing` bus hook (tiers reserve a seat) -> tx: lock event, reject duplicate live ticket (**one live ticket per attendee per event, so quantity is always 1**), `reserveSeat` (`events.tickets_issued < capacity`), `applyDelta(-1)` credit, create ticket (+chat message if `conversationId`), mark payment card CONFIRMED, interest TICKETED, outgoing webhook. Paid events require workspace `verification_status='APPROVED'` **and** `workspace_payout_accounts.status='VERIFIED'`. | Needs a variant: `seatPreHeld`, `skipCredit`, `orderId`, no card, eligibility not re-checked after the buyer has paid. |
| Cancel | `ticketService.cancel` lets the **holder** cancel any time, releases the seat and **returns a credit** (`REVOKE_REFUND`). `eventService.cancel` marks the event CANCELLED, then cancels live tickets via `listForEvent(..., limit:1000)` - **events with more than 1000 live tickets are only partly cancelled**. | Holder cancel on a paid-online ticket would strand money; a credit would be returned that was never spent; 1000 cap is unsafe with refunds. All three must change. |
| Tiers | `ticket_tiers.price_minor`, two-phase `tier_allocations` (RESERVED/CONFIRMED/RELEASED) driven by `ticket.issuing/issued/issue_failed/cancelled`. Tier module may be on another DB (no FKs). | Hold a tier seat at checkout via the same hook; confirm on issue; release on expiry. |
| Discounts | Migration 079: `event_discount_codes`, `event_discount_quotes` (`QUOTED/REDEEMED/EXPIRED`, `list_price_minor`, `discount_minor`, `final_price_minor`, `expires_at`, `ticket_id UNIQUE`). `POST /events/:eventId/discount-quotes {code,idempotencyKey,ticketTierId?}`; staff `redeemQuote` after issuing. Quotes use server prices only. | Checkout takes a `quoteId`; webhook transaction redeems it for the new ticket. |
| Payout | `workspace_payout_accounts` (AES-256-GCM holder/account/IFSC, `account_suffix`, `payout_schedule` `AFTER_EACH_EVENT|EVERY_MONDAY`); PR #81 adds `status` PENDING/VERIFIED/REJECTED, `revision`, admin verify/reject/reveal (audited), migration 088. `organiser_onboarding_audit`. | Reuse as gate 1; `decryptSensitive` is available server-side to feed Route. |
| PR #82 | 18+ age gate (`UNDERAGE`, `AGE_REQUIRED`), migration 087. | Checkout must enforce the same gate. |
| PR #83 | `payment_cards.event_id` binding, ticket realtime payload whitelist, `/purchase` repeat dedupe, migration 089. | Manual flow hardening; on-platform tickets create no card and no chat message in v1, so the whitelist is untouched. |
| App | `react-native-razorpay@^3` already used in `OrganizerCreditsScreen.tsx` (`RazorpayCheckout.open`, success is "submitted, wait for server"); types in `src/types/react-native-razorpay.d.ts`; events feature has `ticketsService.ts`, `MyTicketsSheet.tsx`. | Reuse the same "server confirms" pattern. |
| Migrations | `origin/main` highest is 086 (two files named 085). Open PRs: #82 -> 087, #81 -> 088, #83 -> 089. `scripts/migrate.js` (`npm run migrate`). | Use 090+. |

---

## Part B - Option B design (money held by Hiva, manual payout)

Evidence tags as above. Money/tax/regulatory statements are **[UNVERIFIED-LEGAL]**.

### B1. Flags, eligibility, caps (all default OFF)

| Control | Where | Default | Effect |
| --- | --- | --- | --- |
| Global kill switch `payments.onplatform.kill_switch` | `app_config` | `false` | `true` = no new checkouts, no new payout batches. Settle / refund / reconcile / mark-paid keep running (money in flight must finish). |
| Global enable `payments.onplatform.enabled` | `app_config` | `false` | Master flag; off = feature invisible (routes 404, `payment_mode` ignored). |
| Per-workspace `workspace_payment_settings.onplatform_enabled` | DB | `false` | Set only by platform admin. |
| Pilot allowlist `payments.onplatform.pilot_only` + `pilot_workspace_ids` (json array) | `app_config` | `true` / `[]` | While `pilot_only`, a workspace must also be in the list. Belt and braces with the per-workspace flag. |
| Per-event `events.payment_mode` | DB | `MANUAL` | Organiser picks `ONPLATFORM` (exclusive with the manual card flow, S6). |
| Caps | `app_config`, per-workspace override in settings | see right | `max_ticket_minor` 1,000,000 (INR 10k) in pilot; `max_event_gross_minor` 5,000,000; `max_workspace_daily_gross_minor` 2,000,000; `max_platform_daily_gross_minor` 10,000,000; **`max_open_liability_minor`** (total unpaid owed to organisers, platform-wide) 20,000,000; per-user daily orders 5. A breached cap returns `403 ONPLATFORM_CAP_REACHED` at checkout only. |
| Payout pause `workspace_payment_settings.payouts_paused` / `sales_paused` | DB | `false` | Admin freeze for fraud / disputes. |

Eligibility at checkout creation (server, returns `reasons[]`): flags above; workspace `verification_status='APPROVED'` and `status='ACTIVE'`; `workspace_payout_accounts.status='VERIFIED'` (PR #81) and not `NEEDS_REVERIFY`; event `PUBLISHED`, `INR`, `payment_mode='ONPLATFORM'`, price within min/max; caps; `recovery_due_minor = 0`; buyer passes age gate (#82), is not a workspace member (`SELF_PURCHASE`). Paid orders always finish (issue/refund) even if eligibility later lapses.

Payout-account change after sales: if the organiser edits bank details (revision bump, status back to PENDING), sales for that workspace pause and **payouts are blocked until re-VERIFIED**; batch rows bind the `revision` they were approved against (same 409 pattern as #81 verify).

### B2. Checkout deltas vs 2.3

- Razorpay order is created **without** `transfers[]`: `POST /v1/orders {amount, currency:'INR', receipt:'tko_'+id, notes:{hiva_kind:'ticket_order', hiva_order_id, hiva_event_id, hiva_workspace_id}}`. Money lands in Hiva's account; organiser is never a Razorpay party.
- Everything else in 2.3 stands (server price, one open order, 15-min TTL, `seats_held`, tier hook, discount quote, `USE_FREE_ISSUE`, errors) plus `403 ONPLATFORM_CAP_REACHED`.
- On order creation the **fee is snapshotted** (3.2, bounds 300-700, workspace override only within bounds unless `fee_waiver`), so payable is known at purchase time.

### B3. Webhook, issuance, late/duplicate/failure (delta to 2.4, 2.7, 5)

Unchanged: persist-then-ack, `payment_webhook_events (provider,event_id)` dedupe, CAS transitions, fetch-from-provider on ambiguity, `/sync`, reconciler, DLQ. Hardening of the **existing** credit path rides along (it shares the endpoint): store the event-id for credit/gift/subscription events too, delete the `Buffer.from(JSON.stringify(req.body))` fallback (non-Buffer = 400), keep the 400-on-bad-signature behaviour [CODE].

Replay: signature has no timestamp, so replay safety = event-id uniqueness + idempotent CAS + a 26 h freshness check (except events matching an open order). Ordering: not guaranteed; `payment.captured`, `order.paid`, `/sync`, and reconciler all call one `settleOrder` which locks the order row and writes ticket + ledger journal in **one transaction** (so "ticket exists iff payment journal exists"). Handled events: `payment.captured`, `order.paid`, `payment.failed`, `refund.*`, `payment.dispute.*`, `settlement.processed`. `transfer.*` and `product.route.*` are ignored. Require **auto-capture** (USER-GATED); `payment.authorized` ignored.

Late capture after hold expiry: re-hold the seat; if sold out or event cancelled -> `PAID_UNFULFILLABLE` -> automatic full refund (never oversell, never silently keep money). Duplicate payment on an issued order: refund the second payment. Amount/currency mismatch: `ANOMALY`, no ticket, no auto-refund, page admin.

### B4. Refunds, cancellations, chargebacks under Option B

- **Buyer refund**: Razorpay refunds API on the original payment (`POST /v1/payments/:id/refund {amount}` with `X-Refund-Idempotency: tor-<refundRowId>` [CODE precedent], no `reverse_all`). Refund goes to the original instrument only. Razorpay does not return its gateway fee on refunds [DOCS], so **Hiva bears the gateway fee on refunded orders** (platform fee is reversed in the ledger). Funding: refunds draw on Hiva's Razorpay balance / next settlement; whether a refund fails when the balance is short is **[UNVERIFIED-PROVIDER]**, so the refund worker retries with backoff and alerts, and the owner keeps a buffer.
- **Ledger effect of a refund** (B5): before payout, the sale journal is reversed (organiser payable down, fee revenue down). After payout, organiser payable goes negative -> `recovery_due` (a receivable from the organiser), netted against future payouts and blocking new sales; Hiva has still refunded the buyer. The post-event hold (B6) exists to make this rare.
- **Holder cancel must not bypass refunds**: `ticketService.cancel` on a ticket with `order_id` returns `409 REFUND_FLOW_REQUIRED` (holder or staff); credit return (`REVOKE_REFUND`) only when `order_id IS NULL`; the refund engine cancels the ticket internally. Refund policy evaluation per 2.6 (data, snapshotted on order).
- **Event cancelled**: `eventService.cancel` today cancels at most 1000 live tickets (`listForEvent limit:1000` [CODE]) and has no refund logic. New: event -> CANCELLED immediately (stops checkout), then a durable `refund_jobs` fan-out: one `ticket_order_refunds` row per PAID/TICKETED order (reason `EVENT_CANCELLED`, unique `(order_id, reason_ref)`), processed by `paymentEventWorker` in chunks of 25 with a time budget per invocation, resumable, no ceiling. Tickets are cancelled by the same job (also removes the 1000 cap for the manual path via paged `listForEvent`). Organiser sees `{queued, processed, failed}`. Cancelling a COMPLETED event is refused. All of the event's orders are excluded from payout while any refund is pending.
- **Chargebacks** (`payment.dispute.*`): Hiva is merchant of record and is debited [DOCS]. On `created`: `dispute_state=OPEN`, order excluded from payout, admin + owner alerted, evidence submitted manually in the Razorpay Dashboard (scan logs from `ticket_scans` help). `WON` -> eligible again. `LOST` -> journal `CHARGEBACK` against organiser payable (or `recovery_due` if already paid), ticket cancelled if not checked in. Who bears the dispute fee and the 120-day exposure window are **[UNVERIFIED]** (Section 12).

### B5. The money ledger (core of Option B)

**Per-order snapshot** (`ticket_orders`, immutable after creation, all integer paise, formulas in 3.2):

| Field | Meaning |
| --- | --- |
| `amount_minor` | Gross charged to buyer (after discount) |
| `gateway_fee_est_minor`, `gateway_gst_est_minor` | Estimate at creation from `app_config payments.gateway.fee_bps` (default 200) and GST 1800; **replaced by actuals** from settlement reconciliation (journal true-up, not an UPDATE) |
| `fee_bps`, `fee_source`, `fee_minor` | Platform fee snapshot (from `app_config payments.fee.default_bps` default 500; per-workspace override bounded 300-700 by DB CHECK; min/max minor) |
| `fee_gst_minor`, `gst_mode`, `tax_withheld_minor` | GST handling **[UNVERIFIED-LEGAL]**: `INCLUSIVE` default (platform fee includes GST, split out in the journal), `EXCLUSIVE`, `NONE`; `tax_withheld_minor` (TCS/TDS) is 0 until the CA decides, but the column and journal account exist so enabling it is config, not a migration |
| `organiser_net_minor` | `amount - fee - tax_withheld` = organiser payable. CHECK `organiser_net + fee + tax_withheld = amount` |

**Journal (append-only, double entry).** `ledger_journals (id, kind, order_id?, payout_batch_id?, settlement_id?, idempotency_ref UNIQUE, created_by?, created_at)` and `ledger_entries (id bigserial, journal_id, account, workspace_id?, direction CHECK in ('DEBIT','CREDIT'), amount_minor bigint CHECK > 0)`. A **deferred constraint trigger** enforces `sum(DEBIT) = sum(CREDIT)` per journal. Accounts: `GATEWAY_CLEARING` (asset: captured, not yet settled to Hiva's bank), `HIVA_BANK` (asset: settled cash), `ORGANISER_PAYABLE` (liability, per workspace), `PLATFORM_FEE_REVENUE`, `FEE_GST_PAYABLE`, `TAX_WITHHELD_PAYABLE`, `GATEWAY_FEE_EXPENSE`, `BUYER_REFUND_CLEARING`, `ORGANISER_RECEIVABLE` (recovery due), `ADJUSTMENT`. Triggers `BEFORE UPDATE OR DELETE` on both tables raise an exception; the app DB role is also granted INSERT/SELECT only on them (USER-GATED DB role change; trigger is the guaranteed control).

| Journal kind | Debit | Credit |
| --- | --- | --- |
| `SALE` (in the issuance tx) | `GATEWAY_CLEARING` amount | `ORGANISER_PAYABLE` net; `PLATFORM_FEE_REVENUE` fee-gst; `FEE_GST_PAYABLE` gst; `TAX_WITHHELD_PAYABLE` tax |
| `SETTLEMENT` (recon job) | `HIVA_BANK` settled; `GATEWAY_FEE_EXPENSE` actual fee+tax | `GATEWAY_CLEARING` gross |
| `REFUND` | `ORGANISER_PAYABLE` net (or `ORGANISER_RECEIVABLE` if payable already paid out); `PLATFORM_FEE_REVENUE`; `FEE_GST_PAYABLE`; `TAX_WITHHELD_PAYABLE` | `BUYER_REFUND_CLEARING` amount (then cleared against bank on refund settlement) |
| `CHARGEBACK` | as `REFUND` | `GATEWAY_CLEARING` |
| `PAYOUT` (mark-paid) | `ORGANISER_PAYABLE` batch amount | `HIVA_BANK` batch amount |
| `RECOVERY` | `ORGANISER_PAYABLE` | `ORGANISER_RECEIVABLE` |
| `ADJUSTMENT` (admin, reason, idempotent) | per entry | per entry |

**Balances.** `workspace_balances (workspace_id PK, payable_minor bigint, receivable_minor bigint, updated_at)` is a cache updated in the same tx as each journal under `SELECT ... FOR UPDATE`; a nightly job recomputes from entries and alerts on drift (ledger wins). Definitions: `owed = payable - receivable`; **available for payout** = sum of `organiser_net_minor` for eligible orders (B6) minus `receivable`. Invariants (asserted by tests and the nightly job): (1) every journal balances; (2) per order, `sum(ORGANISER_PAYABLE credits) - debits = 0` iff refunded/paid-out, else `organiser_net`; (3) **a payout can never exceed available** (checked under the balance row lock + `CHECK (payable_minor >= 0)` on the cache for payout journals; payable can only go negative through REFUND/CHARGEBACK, which is recorded as `ORGANISER_RECEIVABLE`, never hidden); (4) `sum(HIVA_BANK)` equals Razorpay settled minus payouts and refunds (reconciled, B6); (5) money is `bigint`/`integer` paise only, no floats; (6) `sum(ORGANISER_PAYABLE)` across workspaces <= `max_open_liability_minor`.

**Reconciliation against Razorpay settlements** (new scheduled Lambda `paymentReconcile`, daily plus on `settlement.processed`): fetch settlements and settlement-recon rows (payment-level fee and tax) **[UNVERIFIED-PROVIDER: endpoint names and pagination; the settlement recon report API must be confirmed in test mode]**, upsert `gateway_settlements` and `gateway_settlement_items (provider_payment_id UNIQUE, fee_minor, tax_minor, net_minor, settled_at)`, post the `SETTLEMENT` journal per settlement, mark `ticket_order_payments.settled_at`. Mismatch classes written to `reconciliation_findings` and alerted: captured-in-Razorpay but unknown locally (largest risk: money without a ticket), local-captured but missing at Razorpay, amount differences, settlement total vs items, refund local vs provider. The owner additionally ticks "received in bank" per settlement in the admin API (`POST /admin/settlements/:id/bank-confirm {utr}`), which closes the loop to the real bank statement.

### B6. Admin manual payout flow

**Queue** (`GET /admin/payouts/queue`): one row per workspace with available > 0, where each counted order satisfies **all** of: `ticket_orders.status='TICKETED'`, no refund row pending/processed, `dispute_state IN ('NONE','WON')`, not in a non-cancelled batch, event not cancelled and `events.ends_at + hold_days <= now()` (`payments.payout.hold_days_after_event`, default 3; per-workspace override; optional rolling reserve `payments.payout.reserve_bps` default 0), **payment already settled to Hiva** (`gateway_settlement_items` present; `payments.payout.require_settled` default true, so Hiva never pays out money it has not received), workspace payout account `VERIFIED` and organiser `APPROVED` and `payouts_paused=false`, and `workspace_payout_accounts.payout_schedule` honoured as a timing hint (`EVERY_MONDAY` = appears in the queue only from Monday). Each row shows masked account (`****1234`), IFSC bank name if known, revision, gross / fee / net, count, events, oldest eligible date, open disputes (blocking), receivable netted.

**Batch lifecycle** `DRAFT -> APPROVED -> EXPORTED -> PAID` (or `CANCELLED`):
1. `POST /admin/payout-batches {workspaceId, eventIds?, asOf, idempotencyKey}`: locks balance row, snapshots eligible orders into `payout_batch_items (order_id UNIQUE while batch not cancelled)`, records `amount_minor`, `payout_account_revision`, `account_suffix`, `statement_no` (sequential). Replays with the same key return the same batch.
2. `POST .../approve {revision}`: second admin recommended (owner decision D15; creator != approver). Refuses (409) if the payout account `revision` changed, status is no longer VERIFIED, a dispute opened on an item, or a refund started (items auto-drop and totals recompute in DRAFT; approved batches must be cancelled and re-cut).
3. `POST /admin/payout-batches/export {batchIds[]}` -> `text/csv` for the owner's bank bulk-upload: `batch_id,beneficiary_name,account_number,ifsc,amount_inr,narration,reference` with narration `HIVA <statement_no>`. Bank details are decrypted server-side in memory with `decryptSensitive` and the **reveal is audited exactly like PR #81 `/reveal`** (rows in `organiser_onboarding_audit` + `onplatform_audit`, actor, batch ids, count; values never logged; `Cache-Control: no-store`; rate limit 6/h; platform-admin only; batch must be APPROVED; sets EXPORTED). CSV-formula injection guard on all text fields. Owner decision D16: alternative is a masked CSV and per-row use of the existing `POST /admin/workspaces/:id/payout-account/reveal`.
4. Owner transfers money at the bank (outside the system).
5. `POST .../mark-paid {bankReference, paidAt, idempotencyKey}`: one transaction: lock batch, require `APPROVED|EXPORTED`, re-verify payout account still VERIFIED at the same revision (else 409 and require admin review: money may already have been sent, so mark-paid with a changed revision is allowed only with `acknowledgeRevisionChange:true` + reason), insert `PAYOUT` journal, set items `PAID`, `UNIQUE (workspace_id, bank_reference)`, write audit (actor, reference, amount), notify organiser (`PAYOUT_SENT`, dedupe key `payout:<id>`). Replay with the same key returns 200 with the same result; a second call with a different reference on a PAID batch is 409.
6. `POST .../cancel {reason}` for DRAFT/APPROVED/EXPORTED-not-paid; releases items.
7. Failed bank transfer: `POST .../mark-failed {reason}` after PAID reverses via an `ADJUSTMENT` journal pair; items return to the queue.

**Statements for organisers**: `GET /workspaces/:ws/payouts` and `GET /workspaces/:ws/payouts/:id/statement` (JSON, plus `?format=csv`): per order gross, platform fee, GST, tax withheld, refunds, net, event, dates, bank reference, masked account. `GET /workspaces/:ws/earnings?eventId=` for pending (not yet eligible) amounts with the expected payable date. GST invoice for the fee is **[UNVERIFIED-LEGAL]**; statement is explicitly "not a tax invoice" until the CA decides.

**Admin-panel scope**: API-only first (F-27 backend tasks), driven by the owner via admin API/CSV; then one admin-panel page set (payout queue, batch detail, export, mark-paid, reconciliation findings, workspace payment settings) in `admin-panel/` as a later task. The organiser-facing earnings/statement screens are in the app.

### B7. Safeguards (Hiva holds third-party money)

1. Everything default OFF; global kill switch; per-workspace flag; pilot allowlist; per-ticket / per-event / per-day / total-liability caps (B1). Stop-the-line alarms on any cap > 80%.
2. Only `VERIFIED` payout accounts and `APPROVED` organisers (checked at checkout **and** at payout).
3. Never store card/UPI data; redact webhook payloads (S1); no PII in Razorpay `notes`.
4. Fraud/abuse: self-purchase block, wash-trade detection (many orders, one device/IP/payout beneficiary), refund velocity limits (S8), new-organiser first-payout manual extra review (`first_payout_review` flag), large-batch threshold needs second approver, organiser payout beneficiary name vs verified-legal-name check at verification time (reuse #81 admin review), minimum event lead time.
5. Audit trail: `onplatform_audit` for every admin money action (fee override, flag change, batch create/approve/export/paid/cancel, adjustment, refund, replay), actor + reason + before/after; ledger is append-only.
6. Funds hygiene (owner decision D17, CA question): keep Razorpay settlements for ticket money in a **separate current account**, not commingled with operating funds, until the CA confirms the structure.
7. Webhook secret rotation (`..._previous`), live keys in env/Secrets Manager not `app_config` (USER-GATED).
8. Dual control on fee waiver and on batches above `payments.payout.dual_approval_over_minor`.
9. Daily digest to owner: liability, settled-not-paid, cap usage, findings, DLQ depth.

### B8. Data model and migrations (delta to section 4)

Numbering: **090 is next free** (main ends at 089). Recommended split, each idempotent (`IF NOT EXISTS`, guarded `DO $$` constraints, additive, no data rewrites), applied to staging then prod by the owner (USER-GATED, shared Neon DB):
- **090_onplatform_orders_core.sql**: section 4 `events` columns, `ticket_orders` (+ gateway estimate columns; **no** `release_at`, **no** `ticket_order_transfers`, **no** Route tables), `ticket_order_payments` (+ `settled_at`), `ticket_order_refunds`, `tickets.order_id`. Drop the old `ticket_order_ledger` sketch (replaced by 092).
- **091_payment_events_and_settings.sql**: `payment_webhook_events`, `workspace_payment_settings` (+ `payouts_paused`, `hold_days_override`, per-workspace caps, fee override with `CHECK (fee_bps_override IS NULL OR fee_waiver OR fee_bps_override BETWEEN 300 AND 700)`), `onplatform_audit`.
- **092_money_ledger_and_payouts.sql**: `ledger_journals`, `ledger_entries`, append-only + balance triggers, `workspace_balances`, `payout_batches`, `payout_batch_items`, `gateway_settlements`, `gateway_settlement_items`, `reconciliation_findings`, `refund_jobs` (event-cancel fan-out), sequence for `statement_no`.
- **093_onplatform_app_config_seed.sql**: `INSERT ... ON CONFLICT DO NOTHING` for every key named in B1/B5/B6 and 3.1 with the safe defaults above (`enabled=false`, `kill_switch=false`, `pilot_only=true`). No secrets.
Code that does not know the new columns keeps working (rollback-safe). Constraints beyond the ones named: `payout_batches.amount_minor > 0`; `payout_batches.status` CHECK; `UNIQUE (idempotency_key)`; `UNIQUE (workspace_id, bank_reference)`; FKs `ON DELETE RESTRICT` on all money tables (account deletion anonymises, never cascades).

**Lambdas**: reuse `api` for the webhook; new `paymentEventWorker` (rate 1 min: webhook retry queue, refund worker, order sweeper, event-cancel fan-out) modelled on `outgoingWebhookWorker`; new `paymentReconcile` (rate 1 day + manual invoke: settlements, ledger drift check, daily digest); existing `eventScheduler` unchanged. All schedules `enabled` only for stages where `payments.onplatform.enabled` is true (the handlers also no-op when it is false, except in-flight money work). Deploy is USER-GATED.

### B9. Endpoints and types (additions; checkout/order/refund endpoints are in 2.3 and 2.6)

```ts
// Buyer (order create returns the Razorpay order without transfers)
type FeeDisclosure = { platformFeeMinor: number; paidBy: 'ORGANISER' };       // optional, owner decision D18
type CheckoutResponse = { order: TicketOrder; feeDisclosure?: FeeDisclosure; checkout: {provider:'razorpay'; keyId:string; orderId:string; amountMinor:number; currency:'INR'; name:string; description:string} };

// Organiser (GET /workspaces/:wsId/onplatform-payments) - Route fields removed
type OnPlatformStatus = { eligible: boolean; reasons: string[];
  fee: {bps:number; minMinor:number; maxMinor:number|null; gstMode:'INCLUSIVE'|'EXCLUSIVE'|'NONE'; source:'WORKSPACE'|'PLAN'|'DEFAULT'};
  payout: {holdDaysAfterEvent:number; schedule:'AFTER_EACH_EVENT'|'EVERY_MONDAY'; accountStatus:'PENDING'|'VERIFIED'|'REJECTED'; accountSuffix:string|null};
  balance: {pendingMinor:number; availableMinor:number; paidOutMinor:number; receivableMinor:number} };
type PayoutStatement = { id:string; statementNo:string; status:'DRAFT'|'APPROVED'|'EXPORTED'|'PAID'|'CANCELLED'; amountMinor:number; bankReference:string|null; paidAt:string|null; accountSuffix:string;
  lines: {orderId:string; eventId:string; eventTitle:string; grossMinor:number; feeMinor:number; feeGstMinor:number; taxWithheldMinor:number; refundedMinor:number; netMinor:number}[] };
// Admin
type PayoutQueueRow = { workspaceId:string; workspaceName:string; accountSuffix:string; accountRevision:number; availableMinor:number; orderCount:number; oldestEligibleAt:string; blockers:('DISPUTE_OPEN'|'REFUND_PENDING'|'ACCOUNT_NOT_VERIFIED'|'PAUSED'|'RECEIVABLE_DUE')[] };
type CreateBatchBody = { workspaceId:string; eventIds?:string[]; asOf?:string; idempotencyKey:string };
type MarkPaidBody = { bankReference:string; paidAt:string; idempotencyKey:string; acknowledgeRevisionChange?:boolean; reason?:string };
```

| Method + path | Who | Notes |
| --- | --- | --- |
| `GET /workspaces/:ws/onplatform-payments`, `/earnings`, `/payouts`, `/payouts/:id/statement` | owner/admin of workspace | read-only |
| `POST /admin/payout-batches`, `GET /admin/payout-batches[/:id]`, `.../approve`, `.../cancel`, `.../mark-paid`, `.../mark-failed`, `POST /admin/payout-batches/export` | platform admin | B6 |
| `GET /admin/payouts/queue` | platform admin | B6 |
| `GET /admin/reconciliation/findings`, `POST /admin/reconciliation/run`, `GET /admin/settlements`, `POST /admin/settlements/:id/bank-confirm` | platform admin | B5 |
| `GET|PUT /admin/workspaces/:id/payment-settings` | platform admin | flag, allowlist, caps, fee override (300-700 or waiver), pauses; every write audited |
| `GET /admin/orders`, `POST /admin/orders/:id/refund`, `POST /admin/payment-events/:id/replay`, `POST /admin/ledger/adjustments` | platform admin | reasons + idempotency key required |

All new routes are mounted only when `payments.onplatform.enabled` (404 otherwise, so an old or flag-off server is indistinguishable to the app from "not deployed").

### B10. App UX deltas (section 7 stays)

Types first (F-27.11): `src/features/ticketOrders/types.ts` per 7.2 with the Route fields removed and `FeeDisclosure`, `PayoutStatement`, balance types above. The app **tolerates 404/absent fields**: `payment_mode` missing = MANUAL, any 404 from `/orders*` or `/onplatform-payments` hides the feature. Checkout via `react-native-razorpay` (already used for credits), result only moves the UI to "Confirming payment"; the ticket appears when the webhook has issued it (poll `GET /orders/:id` 1-5 s up to 120 s, refetch on AppState active, push `TICKET_ISSUED`); app-killed recovery via `GET /orders?open=true` banner and stored `pendingOrderId`; failed/cancelled states per 7.3; never show "failed" unless the server says so. Buyer sees the listed price, the refund policy before paying, "payment processed by Razorpay, sold by <organiser>", and (if D18 is yes) "includes Hiva service fee INR X paid by the organiser". **Coexistence**: the workspace/event picks `payment_mode`; ONPLATFORM events hide the manual card flow (S6); manual stays for ineligible workspaces and while the flag is off; retirement per 7.5 only after the pilot and written regulatory confirmation. Organiser screens: earnings (pending / available / paid), payout statements (masked account, bank reference), per-event "Sell on Hiva" toggle with eligibility reasons.

### B11. Test plan and rollout deltas

Add to section 8: **ledger property tests** (random sequences of sale / refund / chargeback / payout / adjustment: every journal balances, `payable >= 0` after payouts, derived balances equal the cache, append-only trigger rejects UPDATE/DELETE, payout > available rejected, concurrent batch creation never double-includes an order, `mark-paid` replay idempotent, mark-paid with changed revision refused); fee engine bounds 299/300/700/701; reconciliation job against recorded settlement fixtures (matching, missing, extra, amount drift); bulk event cancel with 2,500 orders (chunked, resumable after a mid-run crash, tickets cancelled, no credits touched); CSV export audit row written, formula-injection fixtures; flag matrix (global off, kill switch, not allowlisted, cap reached) for checkout vs in-flight settle/refund still working. Needs real accounts: Razorpay live-mode settlement timing and settlement-recon API shape, fee and tax per payment, refund funding from balance, dispute flow, a real bank bulk-upload file format (bank-specific), UPI intent on real devices.

Rollout (replaces 9 phases): P0 dark launch, flags off. P1 Razorpay **test mode** UAT on staging. P2 **written CA / Razorpay confirmation** (hard gate, nothing live before it). P3 live pilot: 1-3 workspaces on the allowlist, INR 10k ticket cap, `max_open_liability_minor` tiny, owner pays by hand after each event, daily reconciliation review. P4 widen allowlist gradually. P5 default for eligible workspaces; manual retirement last.

USER-GATED additions (replace the Route items in 9): live Razorpay keys + webhook secret into GitHub/AWS secrets (never `app_config`); webhook URL and event subscription in Dashboard; auto-capture on; **CA / Razorpay written confirmation of Option B before live**; migration approvals 090-093 (staging then prod); `serverless deploy` of the two new Lambdas; separate bank account decision; DB role grants for append-only tables; Play declarations (Data safety, Payments, financial features); T&C, organiser agreement, refund policy, grievance officer; the bank bulk-upload format.

---

## 1. Options compared (historical; Option B chosen, A is a dormant fallback)

| | **A. Razorpay Route (split at order, linked accounts)** | **B. Razorpay Payments only, manual payout later** | **C. Other gateway (e.g. Cashfree Easy Split)** |
| --- | --- | --- | --- |
| Money path | Buyer -> Razorpay (authorised PA) -> `transfers[]` -> organiser linked account; remainder stays with Hiva. | Buyer -> Hiva's merchant account -> Hiva pays organisers by bank transfer. | Buyer -> gateway -> vendor split -> organiser vendor account. |
| Regulatory posture [UNVERIFIED-LEGAL] | Razorpay does the pooling/escrow. Hiva is a "marketplace" merchant (RBI PA Directions 2025 para 4(e)/4(f) **[DOCS]**). | Hiva would collect for third parties and re-pay them. The Directions define a PA as an entity that pools customer payments made to merchants and settles to them (4(i)), require PAs to credit merchants' own accounts (13(g)) and bar a PA from marketplace business (10(b)) **[DOCS]**. A marketplace that pools and re-pays organisers is plausibly doing aggregation without authorisation (net worth INR 15 crore for non-banks **[DOCS]**). **High risk; do not choose without written legal advice.** | Same RBI regime as A; vendor-split products exist for this exact purpose **[DOCS]**. |
| Organiser KYC | Razorpay linked account + stakeholder + product config, bank penny-test **[DOCS]**. Overlaps our manual verification. | Ours only. | Vendor KYC API **[DOCS]**. |
| Settlement control | Per-transfer `on_hold` / `on_hold_until`, `PATCH /v1/transfers/:id` **[DOCS]**. | Total, but all liability and bank ops are ours. | On-demand/eligibility-date controls **[DOCS]**. |
| Refunds | `POST /v1/payments/:id/refund` with `reverse_all` (full refunds; partial only with one transfer) **[DOCS]**. | Refund from our balance, claw back from organiser manually. | Vendor-balance refund APIs **[DOCS]**. |
| Chargebacks | Hit Hiva (merchant); recover via reversal. | Same, with no reversal tooling. | Same. |
| Cost | Gateway fee (public list 2% + 18% GST **[DOCS]**) plus Route 0.25% of each transfer + GST, borne by Hiva **[DOCS]**. | Gateway fee + our bank/ops cost. | Different pricing, **[UNVERIFIED]**. |
| Gate | Route eligibility (INR 40 lakh turnover etc.) **[DOCS]**. | None technically; legal risk. | Own eligibility, **[UNVERIFIED]**. |
| Build cost | Medium; most new surface is onboarding + reversal handling. | Lowest checkout cost, highest ops/finance cost. | Same as A plus a second integration. |

**Recommendation: A**, behind a thin `PaymentProvider` interface (`createOrderWithTransfers`, `refund`, `reverseTransfer`, `holdTransfer`, `fetchPayment/Order/Transfer`, `createLinkedAccount`, ...) implemented first for Razorpay, so C can be swapped in if Route eligibility fails. Reject B as the default. Reasons: (1) it keeps unlicensed fund-pooling out of Hiva; (2) per-transfer hold gives the only practical defence against organiser-cancels-after-payout and chargebacks; (3) the repo already has Razorpay keys, signature verification, refund idempotency and a credit/subscription webhook pattern.

---

## 2. End-to-end design

### 2.1 Eligibility and flags

A workspace can sell on-platform only if **all** hold (computed server-side, returned as `reasons[]` so the app can explain):

1. Global `app_config payments.onplatform.enabled = true`.
2. `workspace_payment_settings.onplatform_enabled = true` (admin or allow-list; default false).
3. `workspaces.verification_status = 'APPROVED'` and `workspace_payout_accounts.status = 'VERIFIED'` (PR #81 gate, unchanged).
4. (SUPERSEDED, Route only; skip under Option B) `workspace_route_accounts.status = 'ACTIVATED'` and `activated_at + 24 h <= now()` (Route: new linked accounts have a 24-hour cooling period before transfers **[DOCS]**) and `payout_revision` equals the current payout-account `revision`. If the organiser changes bank details after activation, Razorpay needs a support request to change bank details **[DOCS]**, so the route account moves to `NEEDS_BANK_CHANGE` and on-platform sales for that workspace pause until an admin resolves it. Existing orders are unaffected.
5. Event `payment_mode = 'ONPLATFORM'`, event `PUBLISHED`, `currency = 'INR'` (Route transfers are INR-only **[DOCS]**), price within `payments.onplatform.min/max_ticket_minor`.

The check runs at **checkout creation only**. Once a buyer has paid, issuance and refunds proceed even if eligibility later lapses or the kill switch is flipped (money in flight must always be finishable).

### 2.2 Organiser linked-account onboarding - SUPERSEDED (Route not built; Option B uses only the verified payout account)

Existing: `submitVerification` -> admin approves -> `PUT /workspaces/:ws/payout-account` -> admin verifies (#81). New steps start after the payout account is `VERIFIED`.

| # | Actor | Call | Notes |
| --- | --- | --- | --- |
| 1 | Owner | `GET /workspaces/:wsId/onplatform-payments` | `{eligible, reasons[], route:{status, requirements[]}, fee:{bps,minMinor,maxMinor,gstMode,source}, settlement:{mode,holdDays,schedule}}` |
| 2 | Owner | `POST /workspaces/:wsId/route-account` header `Idempotency-Key`, body `{legalBusinessName, businessType, category, subcategory, businessPan, gstin?, registeredAddress{street1,street2?,city,state,postalCode,country:'IN'}, contactName, email, phone, stakeholder{name, email, phone, pan, residentialAddress{street,city,state,postalCode,country:'IN'}}, tncAccepted:true}` -> `202 {status:'CREATING'}` | OWNER only. Server reads the VERIFIED payout account, decrypts holder/account/IFSC with `decryptSensitive` in memory, never logs or returns them. PANs are stored encrypted with the same AES-GCM helper (suffix only for display). |
| 3 | Server (worker, resumable) | Razorpay `POST /v2/accounts` (type `route`) -> `POST /v2/accounts/:id/stakeholders` (Route allows **one** stakeholder) -> `POST /v2/accounts/:id/products {product_name:'route', tnc_accepted:true}` -> `PATCH /v2/accounts/:id/products/:productId {settlements:{account_number, ifsc_code, beneficiary_name}, tnc_accepted:true}` **[DOCS]** | Each step records its provider id before the next; a crash resumes from the last stored id. Never blindly re-create an account after a failed verification (duplicate-check failure **[DOCS]**); a repeat with an existing `provider_account_id` only fetches. Linked-account emails must be unique per Razorpay business **[DOCS]**. |
| 4 | Razorpay -> server | webhooks `product.route.under_review`, `product.route.needs_clarification` (with `requirements[]`: `field_reference`, `resolution_url`, `reason_code`), `product.route.activated` **[DOCS]** | Drive `workspace_route_accounts.status`. `needs_clarification` is surfaced to the organiser as a checklist; fixing a field calls the `resolution_url` through a server endpoint (`PATCH /workspaces/:wsId/route-account`), never from the client. |
| 5 | Owner | polls step 1 | App shows PENDING / ACTION NEEDED / ACTIVE. |

Route account state machine: `NOT_STARTED -> CREATING -> ACCOUNT_CREATED -> STAKEHOLDER_ADDED -> PRODUCT_REQUESTED -> {UNDER_REVIEW | NEEDS_CLARIFICATION} -> ACTIVATED`, with `ACTIVATED -> SUSPENDED` (admin or provider), `ACTIVATED -> NEEDS_BANK_CHANGE`, and terminal `REJECTED`/`FAILED` (admin retry resets to `NOT_STARTED`). Provider `activation_status` values: `requested, needs_clarification, under_review, activated, suspended` **[DOCS]**.

Open point: Razorpay does its own KYC; our manual payout verification is then partly redundant but is kept as an inexpensive first filter and so the organiser enters bank details once. Do not skip it.

### 2.3 Buyer checkout

Server price is the only price. One live ticket per user per event, so one order = one ticket.

| # | Step | Detail |
| --- | --- | --- |
| 1 | (optional) quote | Existing `POST /events/:eventId/discount-quotes {code, idempotencyKey, ticketTierId?}` -> `{id, listPriceMinor, discountMinor, finalPriceMinor, expiresAt}`. |
| 2 | Create order | `POST /events/:eventId/checkout`, header `Idempotency-Key` (8-120 chars, same rule as `createDraft`), body `{tierId?: uuid, discountQuoteId?: uuid}` |
| 3 | Server tx 1 | Authn; age gate (#82); events flag; eligibility (2.1); no live ticket; no other open order for this user+event (partial unique index; an existing open order is **returned**, making resume idempotent); price = tier price or `events.price_minor`; if quote: validate belongs to user/event/tier, unexpired with at least `order_ttl` left, `final = quote.final_price_minor`; `final == 0` -> reject with `409 USE_FREE_ISSUE` (zero-price goes through the existing issue path and consumes a credit as today); compute fee (section 3) and snapshot; `holdSeat(event)` (`UPDATE events SET seats_held = seats_held + 1 WHERE tickets_issued + seats_held < capacity`); tier seat via `bus.invoke('ticket.issuing', ...)` -> `allocationId`; insert `ticket_orders` row `CREATED` with `expires_at = now() + order_ttl` (default 15 min). Any failure rolls the hold back. |
| 4 | Provider call (outside tx) | `POST /v1/orders {amount: final, currency:'INR', receipt: 'tko_'+order.id (no dashes, 36 chars), notes:{hiva_kind:'ticket_order', hiva_order_id, hiva_event_id, hiva_workspace_id}, transfers:[{account: route.provider_account_id, amount: organiserNet, currency:'INR', notes:{hiva_order_id}, linked_account_notes:['hiva_order_id'], on_hold:true, on_hold_until: releaseAt(unix)}]}` **[DOCS]**. `partial_payment` must be false; every transfer amount must not exceed the order amount; minimum 100 paise; `notes` max 15 pairs x 256 chars. No PII in notes. |
| 5 | Server tx 2 | Attach `provider_order_id`; status `PENDING_PAYMENT`. On provider failure: release seat + tier allocation, set `FAILED_TO_START`, so a retry with the same key may create a fresh attempt (same pattern as `credit.service` deleting the reservation). If the process dies between 4 and 5, the sweeper finds `CREATED` rows older than 2 min, looks the order up by `receipt` and either attaches it or releases the hold. |
| 6 | Response | `201 {order:{id,status,expiresAt,listPriceMinor,discountMinor,amountMinor,currency,tierId,eventId}, checkout:{provider:'razorpay', keyId, orderId, amountMinor, currency, name:'Hiva', description}}`. Repeat with the same key and same payload returns the same body (`200`); a different payload with the same key is `409`. |
| 7 | App | opens `RazorpayCheckout.open(...)`. The result (success, cancel or error) only moves the UI to "Confirming payment" (section 7). |

Errors: `403 ONPLATFORM_UNAVAILABLE` (with `reasons`), `409 SOLD_OUT`, `409 TIER_SOLD_OUT`, `409 ALREADY_TICKETED`, `409 QUOTE_INVALID`, `409 USE_FREE_ISSUE`, `409 PAYMENT_MODE_MANUAL`, `422` validation, `429 RATE_LIMITED`, `404` while `events.enabled` is off (consistent with other ticketing routes).

Other buyer endpoints:
- `GET /orders/:orderId` (owner only): `{id,status,eventId,amountMinor,currency,expiresAt,ticket?:{id,code},failure?:{code,message},refund?:{status,amountMinor,expectedBy?}}`.
- `GET /orders?open=true|false&limit&offset`: for recovery and history.
- `POST /orders/:orderId/cancel`: only `CREATED/PENDING_PAYMENT` with **no** captured payment; releases holds. If a payment attempt is in flight at the provider the server fetches the order first; if `attempted`/`paid`, returns `409 PAYMENT_IN_PROGRESS`.
- `POST /orders/:orderId/sync {razorpayPaymentId, razorpaySignature}` (rate-limited 6/min): speed-up hint. Server verifies `HMAC_SHA256(orderId|paymentId, key_secret)` **[UNVERIFIED-PROVIDER: formula per Razorpay's standard checkout docs; confirm]**, then **fetches the payment and order from Razorpay** and runs the same `settleOrder` path as the webhook. It never trusts client-sent state.

### 2.4 Webhook-driven issuance

Events subscribed (Dashboard -> Webhooks): `payment.captured`, `payment.failed`, `order.paid`, `refund.created|processed|failed`, `transfer.processed`, `transfer.failed`, `settlement.processed`, `payment.dispute.created|under_review|action_required|won|lost|closed`, `product.route.under_review|needs_clarification|activated` **[DOCS]**. `payment.authorized` is ignored: require **auto-capture** in the Razorpay account (USER-GATED setting).

`settleOrder(providerOrderId, providerPaymentId, amount, currency)` (called from `payment.captured`, `order.paid`, `/sync`, reconciler; all converge here):

1. `SELECT ... FROM ticket_orders WHERE provider_order_id=$1 FOR UPDATE`. Unknown -> log, mark event `IGNORED`.
2. Upsert `ticket_order_payments` keyed by unique `provider_payment_id` (status `CAPTURED`). Amount or currency differs from the order snapshot -> order `ANOMALY`, no issuance, alert, **no auto-refund** (needs human; the amount cannot normally differ because the order fixes it).
3. Order already `TICKETED/REFUNDING/REFUNDED` and this is a **different** payment id -> `DUPLICATE_PAYMENT`: enqueue refund `reason=DUPLICATE` with `reverse_all=false` (the first payment holds the transfer).
4. Order `PENDING_PAYMENT` (also accept `EXPIRED` for late payments) -> decide:
   - Event `CANCELLED` or ticket already held by this user (rare) -> `PAID_UNFULFILLABLE`, enqueue refund (`EVENT_CANCELLED` / `DUPLICATE`).
   - Hold still valid (`seat_state='HELD'`): convert it (`seats_held-1, tickets_issued+1`) inside the issuance tx.
   - Hold released (expired): try `holdSeat` again; if sold out -> `PAID_UNFULFILLABLE`, refund `SOLD_OUT_LATE`, notify buyer. This is the **sold-out vs captured race**; it ends in a refund, never in oversell.
   - Otherwise `PAID`, then in the **same transaction**: create the ticket via `ticketService.issueInTransaction` with `{orderId, seatPreHeld:true, skipCredit:true, paymentCardId:null, conversationId:null, issuedBy: buyer}`; redeem the discount quote (`REDEEMED`, `ticket_id`); confirm the tier allocation (via `ticket.issued` bus event after commit); interest `TICKETED`; outgoing organiser webhook `ticket.issued` (existing); order `TICKETED`. Unique partial index `tickets(order_id)` guarantees one ticket per order even under double delivery.
5. After commit: notification `TICKET_ISSUED` with `dedupeKey order:<id>:ticketed`; realtime nudge.

If issuance throws after payment capture (DB error, tier module down), the event row stays `FAILED`, the HTTP response is still 2xx (event is durably stored), and the 1-minute worker retries. After N attempts or 30 min unfulfilled the order becomes `PAID_UNFULFILLABLE` and an automatic refund is queued with an admin alert.

Transfer / settlement tracking (does not gate the ticket):
- `transfer.processed` -> `ticket_order_transfers.status='PROCESSED'`; `transfer.failed` -> `FAILED`, alert (order-transfer failures are retried by Razorpay on consecutive days up to 3 times **[DOCS]**); the ticket stays valid; funds remain with Hiva; admin can create a direct transfer later.
- `settlement.processed` -> reconcile `settlement_status` via fetch (payload carries the parent settlement, not per-order details **[DOCS]**).

### 2.5 State machines

Order (`ticket_orders.status`):

```
CREATED -> PENDING_PAYMENT -> PAID -> TICKETED
   |            |               |        |
   |            |               |        +-> REFUND_PENDING -> REFUNDING -> REFUNDED
   |            |               +-> PAID_UNFULFILLABLE -> REFUNDING -> REFUNDED
   |            +-> EXPIRED  (sweeper, hold released; a late capture can still move EXPIRED -> PAID)
   |            +-> CANCELLED (buyer, no payment)
   +-> FAILED_TO_START (provider order creation failed)
ANOMALY (human only)         DUPLICATE payments are rows on ticket_order_payments, not order states
```
`dispute_state` is an orthogonal column: `NONE | OPEN | UNDER_REVIEW | WON | LOST`.
Guards: every transition is a compare-and-set (`UPDATE ... WHERE id=$1 AND status = ANY($allowed) RETURNING`). Webhooks that would move backward or sideways are recorded and ignored (out-of-order safe).

Payment attempt (`ticket_order_payments.status`): `CAPTURED | FAILED | REFUNDED | PARTIALLY_REFUNDED`. Multiple failed attempts per order are normal; at most one `CAPTURED` that "owns" the transfer.

Transfer (`ticket_order_transfers`): provider `transfer_status` `created|pending|processed|failed|reversed|partially_reversed` plus `settlement_status` `pending|on_hold|settled` **[DOCS]**, mirrored verbatim + `on_hold_until`, `amount_minor`, `amount_reversed_minor`.

Refund (`ticket_order_refunds.status`): `REQUESTED -> SUBMITTING -> PENDING_PROVIDER -> PROCESSED | FAILED`, the same lifecycle as the gift-refund code (`creator.service`: `SUBMITTING`, `PENDING_PROVIDER`, 409-means-in-progress, definitive 4xx = fail) [CODE]. `refund.created/processed/failed` webhooks close it; the reconciler calls `fetchRefund` for refunds stuck > 15 min.

Ticket (`tickets.status` unchanged: `ISSUED, CHECKED_IN, CANCELLED, EXPIRED`). We add **no** new ticket status in v1. A disputed ticket stays valid until the dispute is `LOST` (owner decision D9).

### 2.6 Refunds, cancellations, event cancelled

Refund policy is data, not code: `events.refund_policy` JSON `{mode:'NONE'|'UNTIL_HOURS_BEFORE'|'ANYTIME_BEFORE_START', hours?}` defaulting to `payments.refund.default_policy_json`; shown on the event page **before** payment; a copy is snapshotted on the order. Event cancellation is always a full refund regardless of policy. After check-in no self-serve refund.

| Trigger | Endpoint / job | Behaviour |
| --- | --- | --- |
| Buyer asks | `POST /orders/:orderId/refund-requests {reason?}` header `Idempotency-Key` | Within policy -> auto-approved, creates refund `BUYER_REQUEST`, cancels the ticket in the same tx (seat + tier released, **no credit returned**). Outside policy -> `409 OUTSIDE_REFUND_POLICY`. |
| Organiser | `POST /workspaces/:wsId/orders/:orderId/refund {reason}` OWNER/ADMIN | Full refund `ORGANISER`, any time before check-in. Rate-limited, audited. |
| Admin | `POST /admin/orders/:id/refund {reason, amountMinor?}` | Full or partial (partial needs a manual transfer reversal first, see below). |
| Event cancelled | `eventService.cancel` extended | Event -> CANCELLED (stops new checkouts); open `CREATED/PENDING_PAYMENT` orders cancelled and holds released; every `PAID/TICKETED` order gets a queued refund `EVENT_CANCELLED`; processed by the worker in batches of 25 (no 1000 cap); tickets cancelled by the same job; response contains `{refundsQueued:n}`; organiser sees a progress panel. Late captures after cancel refund automatically (2.4 step 4). |
| Auto | webhook/sweeper | `SOLD_OUT_LATE`, `DUPLICATE`, `PAID_UNFULFILLABLE`. |

Refund call: `POST /v1/payments/:paymentId/refund {amount, reverse_all: true}` with header `X-Refund-Idempotency: tor-<refundRowId>` (min 10 chars, alphanumerics/hyphen/underscore **[DOCS via mirror]**; the header is already used in this repo for gift refunds [CODE]). Rules from the docs **[DOCS]**: `reverse_all` works for full refunds and for partial refunds only when the payment has one transfer; once a refund has started you cannot create a transfer on that payment; the refund is paid from Hiva's primary balance and fails if that balance is lower than the amount; payment fees/taxes are **not** returned by Razorpay for refunded payments, so refunds cost Hiva the gateway fee (a reason to enforce a minimum price and a per-user refund velocity limit).

If the transfer is still `ON_HOLD`, `reverse_all` pulls it back from Razorpay's side. If it has already settled and the linked account lacks balance, the reversal fails (**[DOCS]** "linked account balance too low"). The refund to the buyer must still be paid (consumer fairness) and Hiva records `organiser_recovery_due` (new ledger row) against the workspace, blocks further on-platform sales and payouts until cleared, mirrors the wallet-debt precedent in creator gifts [CODE `monetization-backend.md`]. The default `AFTER_EVENT` settlement hold exists to make this case rare. Refund timing to the buyer: Razorpay says normal refunds take 5-7 business days **[DOCS]**; the app must say so.

Refunds always go to the original payment method (RBI Directions para 10(f) **[DOCS]**); the API gives no other target, and support must never "refund to another UPI".

`ticketService.cancel` guards: (a) holder cancel on a ticket with `order_id` -> `409 REFUND_FLOW_REQUIRED` (the app shows the refund-request screen); (b) staff cancel of such a ticket also requires the refund path (refund engine calls cancel internally); (c) credit return (`REVOKE_REFUND`) only when `order_id IS NULL`.

### 2.7 Failed, duplicate and late payments

| Case | Handling |
| --- | --- |
| Payment fails (`payment.failed`) | `ticket_order_payments` row `FAILED`; order stays `PENDING_PAYMENT` (the buyer may retry on the same Razorpay order until `expires_at`); app shows the reason code only. |
| Buyer closes checkout / app killed after paying | Webhook issues the ticket; app recovers via `GET /orders?open=true` (section 7). |
| Webhook delayed or lost | `/sync` (client hint) and the 15-min reconciler fetch the order/payment from Razorpay and call `settleOrder`. Razorpay itself says to poll for business-critical flows **[DOCS]**. |
| Duplicate delivery | `payment_webhook_events (provider, event_id)` unique (header `x-razorpay-event-id`) plus CAS state machine. |
| Out-of-order (`transfer.processed` before `payment.captured`, `order.paid` before either) | Event rows are stored; handlers fetch current provider truth when the local row is not yet in the expected state; unknown order -> retried by the worker for 24 h before `DEAD`. |
| Captured after `expires_at` | See 2.4 step 4. Never silently drop. |
| Two captured payments on one order or two orders for one user+event | Second payment auto-refunded (`DUPLICATE`). |
| Amount/currency mismatch | `ANOMALY`, no issuance, page admin. |
| Payment captured, order's workspace later suspended | Still issue. |

### 2.8 Chargebacks (disputes)

Hiva is the merchant of record, so the debit lands on Hiva **[DOCS]**: a lost dispute "would be deducted from your account" and Razorpay does not state in the page we read who bears the fee or whether Route linked accounts are affected. Flow on `payment.dispute.created`: order `dispute_state=OPEN`; if the transfer is unsettled, `PATCH /v1/transfers/:id {on_hold:true}` with no end date; notify admins and workspace owner (not the buyer); a staff member submits evidence in the Razorpay Dashboard (USER-GATED operations step). Our evidence pack: ticket issue time, `ticket_scans` rows (check-in proves service delivered) [CODE: every scan attempt is stored], event details. `WON` -> release the hold (`on_hold:false`). `LOST` -> cancel the ticket if not checked in, `POST /v1/transfers/:id/reversals` for the transferred amount (full or `amount`), else `organiser_recovery_due`. Event names above are from the dispute webhook page; payload paths and deadlines **[UNVERIFIED-PROVIDER]**.

### 2.9 Idempotency keys (one table)

| Operation | Key | Enforced by |
| --- | --- | --- |
| Create checkout | client `Idempotency-Key` + `user_id` | `UNIQUE (user_id, idempotency_key)` on `ticket_orders`; same key + different body -> 409 |
| One open order per buyer per event | none (invariant) | partial unique index `(user_id,event_id) WHERE status IN ('CREATED','PENDING_PAYMENT')` |
| Razorpay order | `receipt = 'tko_' + order.id(hex)` (36 chars; Razorpay reportedly treats receipt as unique, **[UNVERIFIED-PROVIDER]**) | lookup by receipt on retry |
| Webhook delivery | `x-razorpay-event-id` (fallback: SHA-256 of raw body) | `UNIQUE (provider, event_id)` |
| Settle payment | `provider_payment_id` | `UNIQUE` on `ticket_order_payments`; order CAS |
| One ticket per order | `order_id` | partial `UNIQUE (order_id)` on `tickets` |
| Quote redemption | quote `id` | existing `ticket_id UNIQUE`, status CAS |
| Refund | `X-Refund-Idempotency: tor-<refundId>` | provider header + `UNIQUE (order_id, reason_ref)` on refunds |
| Transfer reversal | none at provider **[UNVERIFIED-PROVIDER]** | refunds table row + fetch transfer `amount_reversed` before retry |
| Route account | workspace id | `workspace_route_accounts` PK + resume-from-stored-id |
| Notifications | `order:<id>:ticketed`, `order:<id>:refunded` | existing `dedupeKey` |

---

## 3. Fee model

### 3.1 Resolution (never hard-coded)

Precedence, highest first: (1) `workspace_payment_settings.fee_bps_override` (+ `fee_min_minor_override`, `fee_max_minor_override`, `fee_override_reason`, `fee_override_by`, optional `fee_override_expires_at`); (2) plan default `app_config payments.fee.by_plan_json` keyed by the workspace's active Organizer Pro `productId` (from `workspace_subscriptions`, same catalogue as `organizer_pro.plans_json`); (3) `app_config payments.fee.default_bps`.

| Key (`app_config`) | Default | Meaning |
| --- | --- | --- |
| `payments.fee.default_bps` | `500` | default fee in basis points |
| `payments.fee.by_plan_json` | `{}` | `{ "<productId>": bps }` |
| `payments.fee.bps_floor` / `bps_ceiling` | `300` / `700` | write-time validation bounds for any bps value (config, plan, override). Values outside are rejected, so the owner's "3-7%" rule is enforced in one place. |
| `payments.fee.min_minor` | `200` | per-ticket minimum fee (INR 2) so tiny tickets are never loss-making and always cover the INR 1.25 credit equivalent |
| `payments.fee.max_minor` | unset | optional per-ticket cap |
| `payments.fee.gst_mode` | `INCLUSIVE` | `INCLUSIVE` (fee already includes GST), `EXCLUSIVE` (GST added on top of fee and also deducted from organiser), `NONE` (until the CA decides) |
| `payments.fee.gst_rate_bps` | `1800` | rate used for the GST split |
| `payments.onplatform.min_ticket_minor` / `max_ticket_minor` | `2000` / `10000000` | INR 20 / INR 1,00,000; also guarantees organiser net >= 100 paise (Route minimum) |

A waived fee (0 bps) is outside the bounds, so it is only possible through an admin-set override with `fee_waiver=true`, a reason and audit row; it is never a config default.

### 3.2 Arithmetic (integers only, paise)

```
amount      = final price actually charged (after discount), integer paise
fee         = clamp( floorDiv(amount * bps + 5000, 10000), min_minor, max_minor ?? +inf )   // half-up
fee         = min(fee, amount - 100)                                                           // organiser net never below 100 paise
gst_in_fee  = INCLUSIVE ? floorDiv(fee * gstBps * 2 + (10000 + gstBps), 2 * (10000 + gstBps)) : 0   // half-up
tax_withheld= tcs_minor + tds_minor   (0 until CA decides; see Appendix A)
net         = amount - fee - tax_withheld                                    // organiser transfer
invariant   : net + fee + tax_withheld == amount        (asserted in code and in a DB CHECK)
```
All values fit in JS safe integers (max amount 1e7 paise x 700). The result is snapshotted on the order (`fee_bps, fee_min_minor, fee_max_minor, fee_source, fee_minor, fee_gst_minor, gst_mode, tax_withheld_minor, organiser_net_minor`) and **never recomputed**; refunds always return the full `amount_minor` to the buyer and reverse the full transfer. Fee is not charged on refunded orders (the fee row is reversed in the ledger); Hiva eats the unrecovered gateway fee.

### 3.3 Who pays what

- **Buyer:** pays the listed price (after discount). No separate buyer fee in v1 (price transparency, simpler GST, and the "3-7% of ticket price, the rest to the organiser" decision). A buyer-pays-on-top mode is a possible later option (D8), not built.
- **Organiser:** receives `amount - fee - tax_withheld`, shown line by line. The fee includes GST by default.
- **Hiva:** bears Razorpay gateway fee and Route transfer fee out of its fee (v1).
- **Illustration** for a INR 500 ticket using public list prices (2% + 18% GST on the payment, 0.25% + 18% GST on the transfer **[DOCS]**; negotiated and UPI pricing **[UNVERIFIED]**; GST input credit ignored; not tax advice):

| Fee | Fee (INR) | GST inside fee | Gateway + GST | Route + GST | Hiva keeps | Organiser gets |
| --- | --- | --- | --- | --- | --- | --- |
| 3% | 15.00 | 2.29 | 11.80 | 1.43 | **-0.52** | 485.00 |
| 5% | 25.00 | 3.81 | 11.80 | 1.40 | **7.99** | 475.00 |
| 7% | 35.00 | 5.34 | 11.80 | 1.37 | **16.49** | 465.00 |

  Takeaway: at 3% Hiva loses money on card payments; recommend 5% default, 3% only via a reviewed override (e.g. UPI-heavy organisers, if Razorpay UPI pricing is lower). Refunded payments lose the gateway fee entirely.

### 3.4 Interaction with ticket credits (recommendation: no credit consumed)

- On-platform paid tickets consume **no** credit: the percentage fee is the monetisation; charging both is double billing and creates the support case "I paid 5% and also ran out of credits". `issue(..., skipCredit:true)` and a cancel that returns no credit.
- Free tickets, 100%-discount tickets and the manual card flow keep consuming credits exactly as now. This preserves the credit revenue line where Hiva has no fee.
- Risk and mitigation: organisers could stop buying credits for paid events. That is the intent; the `min_minor` fee (INR 2) is above the INR 1.25 credit unit price, so on-platform is never cheaper for Hiva than a credit.
- Credit packs and Organizer Pro purchases are unchanged and use the same Razorpay account, separate `notes.hiva_kind`.

### 3.5 Tiers and discounts

- Price source: tier `price_minor` if `tierId`, else `events.price_minor`. Tier module validates ACTIVE and on-sale window in the existing `onIssuing` hook; a seat is **reserved at checkout**, confirmed after issue, released on expiry/cancel (`tier_allocations` has no TTL, so the order sweeper calls `release({allocationId})`).
- Discount: percent or fixed already resolved into `final_price_minor` by the quote. Fee is computed on `final`. Quote is held for the order's lifetime by requiring `quote.expires_at >= order.expires_at`; the order carries the price snapshot, so a quote that expires while the buyer is paying does not change the amount. The redemption limit counts `QUOTED` unexpired and `REDEEMED`; a late capture after quote expiry can exceed `max_redemptions` by the number of such orders (accepted, documented, shown in organiser analytics).
- Zero final price: not an on-platform order (`USE_FREE_ISSUE`).
- Event/tier price edits only affect new orders.

---

## 4. Data model and migrations

Next free numbers: **090, 091, 092** (check: `git ls-tree origin/main migrations/` ends at 086; open PRs #82/#81/#83 hold 087/088/089 [CODE]). All statements additive and idempotent (`IF NOT EXISTS`, guarded constraints), no data rewrites, no table locks beyond `ALTER ... ADD COLUMN` with default (metadata-only). Backend-Dev re-runs `gh pr list --repo ItzSjDude/gathr-api --json headRefName,files` immediately before opening the migration PR and renumbers if needed.

**090_onplatform_payments_core.sql**
```
ALTER TABLE events  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'MANUAL' CHECK (payment_mode IN ('MANUAL','ONPLATFORM'));
ALTER TABLE events  ADD COLUMN IF NOT EXISTS seats_held integer NOT NULL DEFAULT 0 CHECK (seats_held >= 0);
ALTER TABLE events  ADD COLUMN IF NOT EXISTS refund_policy jsonb;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS order_id uuid;                       -- FK added after ticket_orders exists
CREATE TABLE IF NOT EXISTS ticket_orders (
  id uuid PK DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  tier_id uuid, tier_allocation_id uuid, discount_quote_id uuid, ticket_id uuid,
  status text NOT NULL CHECK (status IN ('CREATED','PENDING_PAYMENT','PAID','TICKETED','EXPIRED','CANCELLED','FAILED_TO_START','PAID_UNFULFILLABLE','REFUND_PENDING','REFUNDING','REFUNDED','ANOMALY')),
  dispute_state text NOT NULL DEFAULT 'NONE' CHECK (dispute_state IN ('NONE','OPEN','UNDER_REVIEW','WON','LOST')),
  seat_state text NOT NULL DEFAULT 'HELD' CHECK (seat_state IN ('HELD','CONSUMED','RELEASED')),
  currency text NOT NULL CHECK (currency = 'INR'),
  list_price_minor int NOT NULL CHECK (list_price_minor > 0), discount_minor int NOT NULL DEFAULT 0, amount_minor int NOT NULL CHECK (amount_minor > 0),
  fee_bps int NOT NULL, fee_min_minor int NOT NULL, fee_max_minor int, fee_source text NOT NULL, fee_minor int NOT NULL, fee_gst_minor int NOT NULL DEFAULT 0,
  gst_mode text NOT NULL, tax_withheld_minor int NOT NULL DEFAULT 0, organiser_net_minor int NOT NULL CHECK (organiser_net_minor >= 100),
  CHECK (organiser_net_minor + fee_minor + tax_withheld_minor = amount_minor),
  refund_policy jsonb NOT NULL, release_at timestamptz NOT NULL,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 120),
  provider text NOT NULL, provider_order_id text, expires_at timestamptz NOT NULL,
  paid_at timestamptz, failure_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key));
CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_orders_provider_order ON ticket_orders(provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_orders_open ON ticket_orders(user_id, event_id) WHERE status IN ('CREATED','PENDING_PAYMENT');
CREATE INDEX IF NOT EXISTS idx_ticket_orders_sweep ON ticket_orders(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_event ON ticket_orders(event_id, status);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_workspace ON ticket_orders(workspace_id, created_at DESC);
-- FK tickets.order_id -> ticket_orders(id) ON DELETE RESTRICT, added inside a guarded DO $$ block (Postgres has no ADD CONSTRAINT IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_order ON tickets(order_id) WHERE order_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS ticket_order_payments (id uuid PK, order_id uuid NOT NULL REFERENCES ticket_orders(id), provider_payment_id text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('CAPTURED','FAILED','REFUNDED','PARTIALLY_REFUNDED')), method text, amount_minor int NOT NULL, currency text NOT NULL,
  failure_code text, is_owner boolean NOT NULL DEFAULT false, captured_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_payment_owner ON ticket_order_payments(order_id) WHERE is_owner;
CREATE TABLE IF NOT EXISTS ticket_order_transfers (id uuid PK, order_id uuid NOT NULL REFERENCES ticket_orders(id), provider_transfer_id text UNIQUE,
  recipient_account_id text NOT NULL, amount_minor int NOT NULL, amount_reversed_minor int NOT NULL DEFAULT 0, status text NOT NULL, settlement_status text NOT NULL DEFAULT 'pending',
  on_hold_until timestamptz, recipient_settlement_id text, last_error jsonb, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ticket_order_refunds (id uuid PK, order_id uuid NOT NULL REFERENCES ticket_orders(id), payment_id uuid REFERENCES ticket_order_payments(id),
  reason text NOT NULL CHECK (reason IN ('BUYER_REQUEST','ORGANISER','EVENT_CANCELLED','SOLD_OUT_LATE','DUPLICATE','PAID_UNFULFILLABLE','ADMIN','DISPUTE_LOST')),
  reason_ref text NOT NULL, amount_minor int NOT NULL CHECK (amount_minor > 0), reverse_all boolean NOT NULL DEFAULT true,
  status text NOT NULL CHECK (status IN ('REQUESTED','SUBMITTING','PENDING_PROVIDER','PROCESSED','FAILED')),
  provider_refund_id text UNIQUE, requested_by uuid REFERENCES users(id), attempts int NOT NULL DEFAULT 0, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (order_id, reason_ref));
CREATE TABLE IF NOT EXISTS ticket_order_ledger (id bigserial PK, order_id uuid NOT NULL REFERENCES ticket_orders(id), kind text NOT NULL
  CHECK (kind IN ('GROSS','PLATFORM_FEE','FEE_GST','TAX_WITHHELD','ORGANISER_NET','REFUND','REVERSAL','CHARGEBACK','RECOVERY_DUE','RECOVERY_PAID')),
  amount_minor bigint NOT NULL, ref text, created_at timestamptz NOT NULL DEFAULT now());   -- append-only; no UPDATE/DELETE grants in code
```
(Abbreviated here for readability; Backend-Dev writes full DDL with `DO $$ ... IF NOT EXISTS` guards for constraints. `ON DELETE RESTRICT` everywhere money is involved: account deletion must anonymise, not cascade-delete orders - see section 6.)

**091_payment_events_and_route_accounts.sql**
```
CREATE TABLE IF NOT EXISTS payment_webhook_events (id uuid PK, provider text NOT NULL, event_id text NOT NULL, event_type text NOT NULL,
  status text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','PROCESSING','PROCESSED','IGNORED','FAILED','DEAD')),
  payload jsonb NOT NULL,            -- redacted (see section 5), never raw card/contact/email/vpa
  attempts int NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), last_error text,
  provider_created_at timestamptz, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, UNIQUE (provider, event_id));
CREATE INDEX IF NOT EXISTS idx_pwe_work ON payment_webhook_events(status, next_attempt_at) WHERE status IN ('RECEIVED','FAILED');
CREATE TABLE IF NOT EXISTS workspace_route_accounts (workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_account_id text UNIQUE, provider_stakeholder_id text, provider_product_id text,
  status text NOT NULL CHECK (status IN ('NOT_STARTED','CREATING','ACCOUNT_CREATED','STAKEHOLDER_ADDED','PRODUCT_REQUESTED','UNDER_REVIEW','NEEDS_CLARIFICATION','ACTIVATED','SUSPENDED','NEEDS_BANK_CHANGE','REJECTED','FAILED')),
  requirements jsonb NOT NULL DEFAULT '[]', kyc_encrypted text,      -- AES-GCM blob (PANs, addresses), same helper as payout details
  payout_revision int, tnc_accepted_at timestamptz, activated_at timestamptz, last_error text, created_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS workspace_payment_settings (workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  onplatform_enabled boolean NOT NULL DEFAULT false, fee_bps_override int, fee_min_minor_override int, fee_max_minor_override int, fee_waiver boolean NOT NULL DEFAULT false,
  fee_override_reason text, fee_override_by uuid REFERENCES users(id), fee_override_expires_at timestamptz,
  recovery_due_minor bigint NOT NULL DEFAULT 0, sales_paused boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS onplatform_audit (id bigserial PK, actor_user_id uuid, workspace_id uuid, order_id uuid, action text NOT NULL, detail jsonb, created_at timestamptz NOT NULL DEFAULT now());
```
**092_onplatform_app_config_seed.sql**: `INSERT INTO app_config(key,value) ... ON CONFLICT DO NOTHING` for the keys in 3.1 plus `payments.onplatform.enabled='false'`, `order_ttl_minutes='15'`, `settlement_mode='AFTER_EVENT'`, `settlement_hold_days='1'`, `refund.default_policy_json`, `razorpay_webhook_secret_previous` (empty). No secrets are seeded.

Also: `events.seats_held` requires a one-line change to `eventRepository.reserveSeat` (condition `tickets_issued + seats_held < capacity`) so the manual and free flows cannot oversell against held seats, plus `holdSeat`, `consumeHeldSeat`, `releaseHeldSeat`. Retention: webhook payloads purged after 90 days by the scheduler; orders/ledger retained per Appendix A question (financial records).

---

## 5. Webhook security and reliability

1. **Raw body:** keep `express.raw({type:'*/*', limit:'1mb'})` before any parser. Delete the `JSON.stringify` fallback: a non-Buffer body is a 400. Verify `HMAC_SHA256(rawBody, secret)` hex with `timingSafeEqual` (already implemented). Razorpay: do not parse or cast the body before verifying **[DOCS]**. On HTTP API + `serverless-http`, confirm with fixtures that both `isBase64Encoded:true/false` events reach Express as byte-identical Buffers, that no middleware (compression, request logging, rate limiter, `cors`) runs before `/webhooks`, and that a body with unicode and trailing whitespace verifies. This works today for credits [CODE] but there is no automated test for the Lambda event shape.
2. **Secret handling:** `payments.razorpay_webhook_secret` plus `..._previous` accepted during rotation (Razorpay: retries of older events are signed with the old secret **[DOCS]**). Move the live `key_secret` and `webhook_secret` to Lambda env / Secrets Manager (USER-GATED); the current `app_config` DB path is readable by anyone with admin-panel config access.
3. **Persist, then ack:** verify signature -> `INSERT payment_webhook_events ... ON CONFLICT (provider,event_id) DO NOTHING` (payload redacted) -> attempt inline processing with a ~3 s budget -> return `200`. Razorpay wants a 2xx within 5 s and treats later responses as failures; it retries with exponential backoff for 24 h and then **disables the webhook** until someone re-enables it in the Dashboard **[DOCS]**. Coupling the ack to downstream health would risk that, so a stored event is always acked. A signature failure returns 400 and is not stored beyond a counter + log (no payload).
4. **Dedupe/replay:** `x-razorpay-event-id` unique; fallback SHA-256 of raw body. The signature has no timestamp, so replay safety comes from idempotent state transitions. Additionally reject (log, do not process) events whose `created_at` is older than 26 h unless they match an open order (retries last 24 h).
5. **Ordering:** not guaranteed **[DOCS]**. Every handler is order-insensitive: CAS transitions only, and when the local row is not yet in an allowed prior state the handler calls the provider fetch API for truth instead of failing. Unknown order -> FAILED with backoff (the order insert may be milliseconds behind).
6. **Retries / DLQ:** `outgoingWebhookWorker`-style Lambda `paymentEventWorker` at rate(1 minute) claims `RECEIVED|FAILED` rows with `FOR UPDATE SKIP LOCKED`, exponential backoff capped at 15 min, `DEAD` after 12 attempts or 48 h; log line `payment_event_dead` drives a CloudWatch alarm (F-12, USER-GATED). Admin `POST /admin/payment-events/:id/replay`.
7. **Reconciliation** (inside the existing `eventScheduler`, every 15 min, bounded to 100 rows / 60 s): (a) `PENDING_PAYMENT` orders with age > 3 min: fetch Razorpay order; if `paid` -> `settleOrder`; (b) expire orders past `expires_at + 5 min` and release holds; (c) `CREATED` > 2 min: resolve by receipt; (d) refunds in `SUBMITTING/PENDING_PROVIDER` > 15 min: `fetchRefund`; (e) transfers not `PROCESSED` > 2 h: fetch transfer; (f) heartbeat: if there are pending orders and zero webhooks in 60 min, alert; (g) daily: compare Razorpay payments list for the last 48 h with `ticket_order_payments` (**[UNVERIFIED-PROVIDER]** list endpoints/pagination) and write mismatches to `onplatform_audit` + alert. A once-daily event-end job releases/adjusts `on_hold_until` for events whose time changed.
8. **Idempotent side effects:** notifications by `dedupeKey`; organiser outgoing webhook `ticket.issued` is enqueued inside the issuance tx (existing helper) so it exists iff the ticket exists.
9. **Webhooks must keep working when the kill switch is off** (to finish in-flight money).
10. Optional defence in depth: IP allow-list of Razorpay webhook IPs **[DOCS: page `/docs/security/whitelists#webhook-ips`]**. HTTP APIs may not support WAF **[UNVERIFIED]**; the HMAC is the control.

---

## 6. Security and privacy review points

| # | Risk | Control |
| --- | --- | --- |
| S1 | Card/UPI data | Never touches our servers: Razorpay Checkout collects it. We store `method` and provider ids only. Redact `email, contact, vpa, card, acquirer_data, bank, wallet` from stored webhook payloads; do not pass user email/phone into `prefill`/`notes`; never log request bodies of `/webhooks` or `/sync`. |
| S2 | PII/DPDP [UNVERIFIED-LEGAL] | Orders hold user id, event, amounts only. Account deletion must anonymise but keep orders/ledger (financial retention); `ON DELETE RESTRICT` on `ticket_orders.user_id` means the deletion flow must be updated (`tests/account-deletion.test.js`). Retention period: CA question. |
| S3 | Forged/replayed webhooks | HMAC, event-id dedupe, CAS transitions, provider re-fetch on ambiguity (section 5). |
| S4 | Client forging success | Client callback never issues tickets. `/sync` re-fetches from Razorpay. |
| S5 | Price tampering | Server price only; quote ownership checks; amount/currency re-check at capture. |
| S6 | Fee bypass (take buyers off-platform) | `payment_mode` is exclusive per event: card sharing and issue-with-card return `409 PAYMENT_MODE_ONPLATFORM` for ONPLATFORM events (otherwise the manual flow undercuts the fee); organiser chat messages on ONPLATFORM events get a soft warning when they contain UPI ids / bank patterns (heuristic, reported not blocked); terms prohibit it; anomaly report: workspace with many `requested` interests but few orders. Organisers cannot flip `payment_mode` after the first non-cancelled order. |
| S7 | Fee evasion by price games | Minimum ticket price and minimum fee; tickets issued to workspace members as buyers are blocked (`409 SELF_PURCHASE`) to stop wash trades that test or launder; heavy-discount codes visible in analytics. |
| S8 | Refund abuse | Policy window enforced server-side; per-user limits (5 refund requests/day, 10/month before manual review); no refund after check-in; refunds only to original instrument; one refund row per `(order, reason_ref)`; admin refunds require reason + audit. |
| S9 | Organiser self-refund after payout | Settlement hold until after the event (default); refunds require `OWNER/ADMIN` and are audited; `organiser_recovery_due` blocks payouts. |
| S10 | Sold-out vs captured race | Seat hold at checkout (`seats_held`), re-hold on late capture, refund on failure; DB-backed concurrency test (section 8). |
| S11 | Hold griefing | One open order per user+event, TTL 15 min, 10 checkouts/min per user and a daily cap, age gate and account-age checks; holds count only for capped events. |
| S12 | Money in flight on event cancel | Section 2.6: batched refund jobs, late-capture auto-refund, recovery_due ledger; proposed: event cancel refused once the event is `COMPLETED` (today `eventService.cancel` only checks `CANCELLED`). |
| S13 | Money in flight on kill switch | New checkouts stop; settle/refund/reconcile paths stay on. |
| S14 | Admin abuse | Fee override requires reason, audit, optional expiry, bounded 300-700 unless `fee_waiver`; all admin money actions in `onplatform_audit`; admin routes behind existing platform-admin authz; two-person rule for waivers is an owner decision. |
| S15 | Secrets | Live Razorpay keys and webhook secret in env/Secrets Manager; Route-account KYC (PAN, address) AES-GCM at rest with the existing key helper; reveal endpoints (if ever) audited like payout reveal. Key restrictions: use separate test/live keys per stage; never reuse the live key in staging. |
| S16 | Ledger integrity | `ticket_order_ledger` append-only, written in the same tx as state changes; nightly invariant job: `sum(GROSS) - sum(REFUND) = sum(ORGANISER_NET)+sum(PLATFORM_FEE)+...`. |
| S17 | Enumeration/IDOR | `GET /orders/:id` is owner-only (`404` otherwise); organiser order lists scoped by workspace role (analyst sees no buyer identity); ticket `secret` still never returned. |
| S18 | Rate limits | checkout 10/min/user, sync 6/min/order, refund-request 5/day/user, organiser refunds 60/h/workspace; reuse the Postgres bucket limiter if present on main (**[UNVERIFIED]** it is only referenced in F-10 notes). |
| S19 | Under-18s | Enforce #82 age gate on checkout (`UNDERAGE/AGE_REQUIRED`). |
| S20 | Ticket resale/chargeback fraud | Existing `transfer` module: disputed order's ticket cannot be transferred (`dispute_state != NONE`). |

---

## 7. App UX and contracts (Frontend-Dev)

### 7.1 Where the code goes (AGENTS.md)

New feature folder `src/features/ticketOrders/` (types, `ordersService.ts`, `useOrder.ts`, `CheckoutSheet.tsx`, `OrderStatusSheet.tsx`, `index.ts`). `events` imports it through the barrel; `ticketOrders` must not import `events` (pass `{eventId,title,priceMinor,currency,tiers}` as props) to avoid the existing `events -> organizer` cycle risk. Organiser side: `src/features/organizer/OnPlatformPaymentsScreen.tsx` (route-account status, fee, sales, settlements). `messages` is untouched (the card flow stays as is). Server state via the existing `apiRequest` pattern; keep only `pendingOrderId` in AsyncStorage (an id, not sensitive).

### 7.2 Contracts first (`src/features/ticketOrders/types.ts`)

```ts
export type OrderStatus = 'CREATED'|'PENDING_PAYMENT'|'PAID'|'TICKETED'|'EXPIRED'|'CANCELLED'
  |'FAILED_TO_START'|'PAID_UNFULFILLABLE'|'REFUND_PENDING'|'REFUNDING'|'REFUNDED'|'ANOMALY';
export type TicketOrder = {
  id: string; eventId: string; status: OrderStatus; currency: 'INR';
  listPriceMinor: number; discountMinor: number; amountMinor: number;
  expiresAt: string; tierId: string | null;
  ticket: {id: string; code: string} | null;
  failure: {code: string; message: string} | null;
  refund: {status: 'REQUESTED'|'SUBMITTING'|'PENDING_PROVIDER'|'PROCESSED'|'FAILED'; amountMinor: number} | null;
};
export type CheckoutRequest = {tierId?: string; discountQuoteId?: string};         // header Idempotency-Key
export type CheckoutResponse = {
  order: TicketOrder;
  checkout: {provider: 'razorpay'; keyId: string; orderId: string; amountMinor: number; currency: 'INR'; name: string; description: string};
};
export type OnPlatformStatus = {
  eligible: boolean; reasons: string[];
  route: {status: 'NOT_STARTED'|'CREATING'|'UNDER_REVIEW'|'NEEDS_CLARIFICATION'|'ACTIVATED'|'SUSPENDED'|'NEEDS_BANK_CHANGE'|'REJECTED'|'FAILED';
          requirements: {fieldReference: string; reasonCode: string; description?: string}[]};
  fee: {bps: number; minMinor: number; maxMinor: number | null; gstMode: 'INCLUSIVE'|'EXCLUSIVE'|'NONE'; source: 'WORKSPACE'|'PLAN'|'DEFAULT'};
  settlement: {mode: 'AFTER_EVENT'|'ROLLING'; holdDays: number; schedule: 'AFTER_EACH_EVENT'|'EVERY_MONDAY'};
};
export type SaleBreakdown = {orderId: string; amountMinor: number; feeMinor: number; feeGstMinor: number; taxWithheldMinor: number; organiserNetMinor: number; status: OrderStatus; releaseAt: string};
```
`ApiEvent` gains optional `payment_mode?: 'MANUAL'|'ONPLATFORM'`, `refund_policy?`; absent means MANUAL (older servers). All amounts are integer paise; format with one shared helper.

### 7.3 Buyer flow and states

1. Event detail CTA: `payment_mode==='ONPLATFORM'` -> "Buy ticket - INR X" (tier picker, discount code field using the existing quote call, refund-policy line shown **before** paying, "You will receive your ticket here as soon as your bank confirms"). Otherwise the existing "Purchase" chat flow, unchanged.
2. Tap -> `POST /events/:id/checkout` (generate the idempotency key once per sheet open and keep it until the order ends) -> validate `checkout.provider==='razorpay'`, `amountMinor === order.amountMinor`, as the credits screen already does -> save `pendingOrderId` -> `RazorpayCheckout.open({key, order_id, amount:String(amountMinor), currency, name:'Hiva', description, theme, retry:{enabled:true,max_count:2}})` (extra option names **[UNVERIFIED-PROVIDER]**; extend `react-native-razorpay.d.ts` only with fields confirmed in the SDK).
3. Whatever `open()` resolves or rejects (including user cancel), go to **Order status sheet** and poll `GET /orders/:id` (1 s, 2 s, 3 s, then 5 s, up to 120 s; stop on terminal status; also refresh on realtime `notification` `TICKET_ISSUED` and on AppState `active`). Optionally call `POST /orders/:id/sync` once if `open()` resolved with ids and the order is still `PENDING_PAYMENT` after 8 s.
4. UI by status:
   - `PENDING_PAYMENT` after `open()` resolved: "Confirming your payment... do not pay again" (disables Buy). After `open()` rejected with cancel: "Payment cancelled" + "Try again" (reuses the same order until `expiresAt`) + "Cancel order".
   - `TICKETED`: success, open ticket pass (existing `MyTicketsSheet`), clear `pendingOrderId`.
   - `EXPIRED/CANCELLED/FAILED_TO_START`: "Your seat was released" + restart.
   - `PAID_UNFULFILLABLE/REFUNDING`: "We couldn't complete your ticket, your money is being returned (5-7 business days)".
   - `REFUNDED`: confirmation.
   - Slow confirmation > 120 s: "Still confirming. You'll get a notification; you can close this screen" - never "payment failed" unless the server says so.
5. **Killed app / UPI app switch:** on app start, foreground and when opening My Tickets, call `GET /orders?open=true`; if any open order or `pendingOrderId` exists, show a banner that opens the status sheet. The push `TICKET_ISSUED` deep-links to the ticket.
6. Refunds: ticket screen shows "Request refund" when policy allows (calls refund-request), else "Not refundable". The existing `cancelMyTicket` button must hide for tickets with `orderId` (backend returns `409 REFUND_FLOW_REQUIRED`; handle gracefully).
7. Copy: INR amounts, the refund timing, who the seller is (organiser) and who processes the payment (Razorpay) must be visible (Appendix A, consumer-rules question).

### 7.4 Organiser flow

`OnPlatformPaymentsScreen`: eligibility checklist (verification, payout VERIFIED, route status with the requirement list), fee card ("Hiva fee 5% incl. GST, min INR 2"), a per-event toggle "Sell on Hiva (online payment)" in event setup that is disabled with the reason when not eligible, sales list with the `SaleBreakdown`, settlement date ("paid out after the event on <date>"), refund action, event-cancel confirmation explaining "N buyers will be refunded automatically". Show the manual flow option side by side; explain they are exclusive per event.

### 7.5 Coexistence and retirement of the manual flow

- Per event `payment_mode` (default `MANUAL`) + workspace flag + global flag. No code path removed in Phase 2. Backend rejects card-sharing/issue-with-card for ONPLATFORM events (S6).
- Retirement (after pilot success): stop offering MANUAL for new paid events when the workspace is eligible -> keep MANUAL only for ineligible workspaces -> after 2 consecutive months with < 5% of paid tickets via MANUAL and the owner's sign-off, remove the app UI, then (separate task) deprecate `payment-cards` endpoints. Credits remain for free events.

---

## 8. Test plan

**Unit (no DB):** fee engine properties (random amounts/bps/min/max: `net+fee+tax=amount`, never negative, net >= 100, half-up rounding, bounds validation 299/300/700/701 rejected/accepted), GST split, release-date calculation per payout schedule, state-machine transition table (all illegal transitions rejected), webhook redaction, signature verification (current/previous secret, wrong length, missing header), refund-policy evaluator (boundary at the hour), idempotency-key conflicts.
**DB-backed (Postgres/PostGIS via `_local-db-guard`):** checkout idempotency (same key replay, different body 409, concurrent same key); one open order per user+event; sold-out race (capacity C, N > C concurrent checkouts: exactly C holds; holds never exceed capacity; manual `reserveSeat` respects `seats_held`); tier sold out; hold expiry release; webhook permutations (all orderings of `payment.captured`, `order.paid`, `transfer.processed`, duplicates, 2x concurrent delivery) end with exactly one ticket, one quote redemption, one outgoing webhook; late capture after expiry (seat available -> ticket; sold out -> refund row); event-cancel with 1,500 orders (refunds queued, ticket cancel batched, credits untouched); `ticketService.cancel` guards; no credit consumed/returned for on-platform; dispute lost reversal path; recovery_due blocks checkout; account-deletion with orders; migration idempotency (run 090-092 twice) and rollback safety (old code ignores new columns).
**Provider contract tests:** a local fake Razorpay (extend the `manual` escape hatch to a non-prod `fake` provider with a fixture server) that returns the documented shapes for orders-with-transfers, refund, reversals, transfer fetch, linked account endpoints, and signs webhook bodies with a test secret. Fixture files for each event type (real captured samples from test mode replace hand-written ones in F-27.17).
**Lambda/transport:** HTTP API v2 event fixtures (`isBase64Encoded` true/false, unicode, large body, header casing) through `serverless-http` -> HMAC verify.
**Razorpay test mode (staging account, USER-GATED keys):** Standard Checkout with test cards and UPI `success@razorpay` / `failure@razorpay` **[DOCS]** (note: cancelling a UPI payment in test mode still completes as success, so cancellation must be tested live **[DOCS]**); Route test mode supports transfers via the Orders API only, Dashboard supports transfer-via-payment/direct **[DOCS]**; webhooks to the staging Lambda URL (test mode OTP `754081` for webhook setup **[DOCS]**; no localhost/ngrok URLs).
**App:** Jest + RNTL for `CheckoutSheet` and `OrderStatusSheet` with `jest.mock('react-native-razorpay')` (pattern in `OrganizerCreditsScreen.test.tsx`): success, cancel, reject, app resumes with open order, polling stops at terminal, no double-submit, amount mismatch guard. Contract check (F-04.1) must list the new routes.
**Only verifiable with real accounts/devices (explicit list for QA):** Route eligibility and linked-account KYC/activation timing and `needs_clarification` loops; penny-test behaviour; actual settlement timing and hold release; real refund timelines; the 24 h linked-account cooling period; dispute webhooks and evidence flow; live webhook latency/5 s budget from a cold Lambda to Neon; UPI intent app-switch and process death on real Android devices (several UPI apps); Play Console review; GST invoice/GSTR-8 flows; real bank statement descriptor.

---

## 9. Rollout, kill switches, USER-GATED items

**Kill switches (all `app_config`, take effect within the 60 s config cache):**
`payments.onplatform.enabled` (global: no new checkouts, no new Route onboarding), `workspace_payment_settings.onplatform_enabled` / `sales_paused` (per workspace), `payments.onplatform.refunds_auto` (turn off automatic refunds, queue for admin), `payments.onplatform.webhook_processing_paused` (store only, do not process; last resort), event `payment_mode` unchanged for existing orders. Settle/refund/reconcile stay enabled when new checkouts are off.

**Phases:**
- P0 dark launch: migrations + code deployed, all flags off, fake provider in CI.
- P1 staging UAT with Razorpay test mode and 2 devices (F-27.17).
- P2 production pilot: 1-3 hand-picked workspaces, low ticket caps (`max_ticket_minor`), settlement AFTER_EVENT, daily manual reconciliation by the owner.
- P3 widen allow-list; weekly review of metrics (conversion, refunds, disputes, unfulfilled-after-capture = 0, reconciliation mismatches = 0).
- P4 default for eligible workspaces; P5 retire manual (7.5).
Stop-the-line triggers: any unfulfilled-after-capture order older than 30 min, any reconciliation mismatch, dispute rate above the gateway threshold, `recovery_due` > 0.

**USER-GATED (agents prepare, the owner executes or approves):**
1. Razorpay: live account activation; **Route activation incl. the RBI compliance submission (turnover proof or self-declaration, payer-payee use-case text), 5-7 business days**; confirm pricing for payments, Route transfer fee and UPI.
2. Razorpay Dashboard: enable auto-capture; subscribe the webhook events in 2.4 to the staging and prod URLs; set webhook secrets; alert email; (optional) refund credits/"Allow refunds" for linked accounts.
3. AWS: Secrets/env for live keys and webhook secrets (`RAZORPAY_*`, `..._PREVIOUS`), new Lambda `paymentEventWorker` + schedule, CloudWatch alarms, `serverless deploy` per stage.
4. Neon: apply migrations 090-092 to staging then prod (shared DB).
5. Play Console: Data safety (financial info/purchase history collected), Payments policy statement that event tickets are a physical service sold outside Play Billing, financial-features declaration, review of the changed store listing. Google Play lists "tickets for live events" among services where Play Billing must not be used **[DOCS]**; paid **online-only** events may differ **[UNVERIFIED]**.
6. CA/legal sign-off on Appendix A (GST on fee, invoices, TCS/TDS, refund terms, chargeback allocation, organiser agreement, privacy policy, grievance officer).
7. Hosting of Terms, Privacy, Refund policy and organiser terms (F-08.1) and appointing a grievance officer.
8. Business decisions D1-D12 (section 11).

---

## 10. Task breakdown - draft `F-27` for `docs/TASKS.md` (Option B; do NOT merge into TASKS.md from this PR)

```
### F-27 On-platform paid-ticket checkout (Razorpay Standard, manual organiser payout) | both | P1 | XL | deps: F-05 (#81 merged), #82/#83 merged, F-04, F-08
- F-27.0  [Owner] DECISIONS D2-D18 + CA / Razorpay written confirmation of the model (USER-GATED). Gates ENABLING live money, not building. S
- F-27.1  [BE] Webhook hardening (also fixes credits): event log + event-id dedupe, delete JSON.stringify fallback, redaction, secret rotation, Lambda-transport fixtures.   M   deps: -   (ship first: standalone value)
- F-27.2  [BE] Migrations 090-093 + constants + seats_held in reserveSeat/holdSeat. (DB migration USER-GATED)                       M   deps: -
- F-27.3  [BE] Fee engine + config validation (300-700) + overrides + audit; ledger service (journals, triggers, balances) + property tests.   L   deps: F-27.2
- F-27.4  [BE] Flags/caps/allowlist/kill switch + eligibility function + workspace payment-settings admin API.                       M   deps: F-27.2
- F-27.5  [BE] Provider interface + Razorpay client (order, refund, fetch order/payment/refund/settlements) + non-prod fake provider. M   deps: -
- F-27.6  [BE] Checkout (holds, tiers, quotes, create/get/list/cancel/sync, sweeper) + settleOrder/issuance variant (skipCredit, seatPreHeld, orderId) + SALE journal.   L   deps: F-27.1-5
- F-27.7  [BE] Refund engine (policy, buyer/organiser/admin, duplicate/late), ticketService.cancel guards, event-cancel chunked fan-out (no 1000 cap), chargeback handlers + REFUND/CHARGEBACK/RECOVERY journals.   L   deps: F-27.6
- F-27.8  [BE] Payout: queue, batches, approve, CSV export (audited reveal), mark-paid idempotent, statements, organiser earnings endpoints.   L   deps: F-27.3, F-27.7
- F-27.9  [BE] paymentReconcile Lambda (settlements, fee true-up, findings, drift check, digest) + paymentEventWorker + alarms.        L   deps: F-27.6, F-27.8
- F-27.10 [BE] Docs: API.md + docs/onplatform-payments.md; tests/routes.json entries.                                              S   deps: F-27.6-9
- F-27.11 [FE] Contracts first: types.ts + service stubs tolerant of 404 + contract-check entries.                                   S   deps: this doc
- F-27.12 [FE] Checkout + order status + recovery (killed app) + refund request + hide cancel for orderId tickets.                    L   deps: F-27.11, F-27.6
- F-27.13 [FE] Organiser earnings, payout statements, per-event payment_mode toggle, cancel-event refund progress.                   M   deps: F-27.11, F-27.8
- F-27.14 [FE] Manual-flow coexistence gating, copy (fee/refund/processor), analytics.                                               S   deps: F-27.2
- F-27.15 [ADMIN] admin-panel pages: payout queue, batch detail/export/mark-paid, reconciliation findings, workspace settings. (After API-only use proves the flow.)   M   deps: F-27.8, F-27.9
- F-27.16 [QA] Suites per section 8 + B11.                                                                                           L   deps: F-27.6-9, F-27.12
- F-27.17 [Sec] Review S1-S20 + B7, secrets move, append-only DB role, CSV export, deletion flow.                                     M   deps: F-27.6-9
- F-27.18 [QA+Owner] Staging UAT in Razorpay test mode, two devices (USER-GATED keys/URLs).                                          M   deps: F-27.12, F-27.13
- F-27.19 [Owner] Live pilot per B11 (USER-GATED: written CA/Razorpay confirmation, live keys, migrations, deploy, Play).            M   deps: F-27.18, F-27.0
```
Order: backend first (27.1 -> 27.2 -> 27.3/27.4/27.5 in parallel -> 27.6 -> 27.7 -> 27.8 -> 27.9); the app starts at 27.11 against the fake provider and treats 404 as "feature absent", so app releases never depend on backend deploy order. Admin panel last. Rough: BE 4-5 weeks, FE 2 weeks in parallel; the regulatory confirmation (27.0) is the long pole and is independent of build.

---

## 11. Open questions for the owner (recommended default in bold)

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Is Hiva (or its operating entity) eligible for Route (turnover INR 40 lakh, use-case approval)? If not: wait, switch to another split provider, or stay manual? | Check this **first** with Razorpay (`routepriority@razorpay.com` per their FAQ **[DOCS]**); do not build the Route-specific half until answered. The provider interface keeps the rest reusable. |
| D2 | Default fee within 3-7% | **5%**, min INR 2; 3% only as reviewed override (loses money on cards at list pricing, section 3.3) |
| D3 | Is the fee GST-inclusive or GST on top? | **Inclusive** (organiser sees one number), pending CA |
| D4 | Who bears gateway + Route fees? | **Hiva, inside the fee** (v1); pass-through later if margins demand |
| D5 | Refund policy default | **Full refund up to 48 h before start; none after; always full if the organiser cancels** (organiser can choose stricter-to-more-lenient per event within limits; "no refund" terms may not be enforceable for cancelled events **[UNVERIFIED-LEGAL]**) |
| D6 | Settlement timing | **Held until event end + 1 day**, then Razorpay's standard 2 working days to the organiser **[DOCS: linked-account settlements take 2 working days]**. Rolling payouts are riskier (reversal needs organiser balance); revisit with data. |
| D7 | Min/max ticket price | **INR 20 / INR 1,00,000** |
| D8 | Buyer-pays-fee-on-top option? | **No** in v1 |
| D9 | Disputed ticket: stays valid until lost, or suspended at once? | **Valid until lost**; suspension needs a new ticket status |
| D10 | Who is merchant of record on the buyer's statement, and what does the receipt say? | Hiva (descriptor "HIVA TICKETS"); receipt names the organiser as seller |
| D11 | Event reschedule: automatic refund window? | Offer organiser-triggered "refund all" and notify buyers; no automatic refund in v1 |
| D12 | Multi-quantity (group) tickets | **Not in v1** (one live ticket per attendee per event today) |
| D13 | Hold period after event before payout | **3 days** (`payments.payout.hold_days_after_event`), optional rolling reserve later |
| D14 | Pilot limits | **<=3 workspaces, ticket cap INR 10,000, total open liability cap INR 2,00,000** |
| D15 | Second approver for payout batches | **Yes above a threshold**; creator != approver once there is a second admin |
| D16 | CSV for bank upload: unmasked (audited export) or masked + per-row reveal | **Audited unmasked export** (fewer manual copies of bank numbers) |
| D17 | Separate bank account for ticket-money settlements | **Yes** (CA to confirm) |
| D18 | Show buyers "includes Hiva service fee INR X (paid by organiser)" | **Decide with CA**; supported by `feeDisclosure`, off by default |

D1 (Route eligibility) is SUPERSEDED by Option B; D4 also covers refund-time gateway-fee loss; D6 is replaced by D13.

---

## 12. RISKS of Option B (all UNVERIFIED; questions for the CA, not conclusions)

None of the following has been confirmed by a lawyer, the CA, Razorpay or RBI. The owner has accepted that the question is open. Do not enable live money until each is answered in writing.

1. **RBI Payment Aggregator rules.** Hiva would receive ticket money in its own merchant account and later pay organisers. Does that amount to "pooling and settling for merchants" (payment aggregation, which needs RBI authorisation), or is it an ordinary merchant collecting for goods/services it sells? Does the answer depend on whether Hiva is the seller, agent of the organiser, or marketplace? Does paying organisers after the event (delayed settlement) change it? (Appendix A Q1, Q4.)
2. **Razorpay terms.** Does Razorpay's merchant agreement allow a standard (non-Route) account to collect on behalf of third-party sellers and pay them out? Could Razorpay hold or close the account (and with it every Hiva payment, including credit packs and subscriptions) if it classifies this as marketplace activity? Written confirmation from Razorpay is needed.
3. **GST / TCS / TDS.** Who is the supplier of the ticket (organiser or Hiva)? GST on the platform fee (rate, SAC, invoices); whether Hiva is an e-commerce operator liable for Section 52 TCS and GSTR-8; whether Section 194-O TDS applies on organiser payouts and at what base; whether `tax_withheld_minor` must be non-zero. Wrong answers create a tax liability on money Hiva does not own. The data model carries the hooks (B5) but defaults are 0 and `INCLUSIVE`.
4. **Refund and chargeback liability.** Hiva is merchant of record: it refunds buyers and absorbs disputes. If the organiser has been paid or disappears, Hiva carries the loss (`ORGANISER_RECEIVABLE`) plus unrecovered gateway fees on refunds and any dispute fee. Is the organiser agreement enforceable for clawback? Consumer-law fall-back liability when an organiser does not deliver. Mitigations (hold period, caps, pilot) reduce but do not remove this.
5. **Money in flight / custody.** Between settlement and payout Hiva holds organisers' funds: insolvency/commingling questions, whether a separate account or trust structure is expected, interest, and what happens on account freezes. Operationally: refunds after settlement need Hiva funds, and manual bank payouts are an error-prone human process (wrong account, duplicate payment); the batch revision binding, audit, idempotency and CSV controls mitigate only the system side.
6. Also open: data-protection and retention of financial records vs the deletion flow; Google Play policy treatment of the in-app payment (live-event tickets are outside Play Billing per policy text we read, online-only events unclear); consumer-protection rules for grievance officer and cancellation charges; whether the 3-7% fee level and "fee included in price" presentation need disclosure.

Fallbacks if the answer is "no": pause at the pilot (manual flow is untouched and remains live), or switch to Option A/C (the provider interface and everything except B5-B6 are reusable; Route eligibility D1 returns).

---

## Appendix A. Questions for a CA / lawyer (all **[UNVERIFIED-LEGAL]**; I have not concluded any of these)

**RBI / payment-aggregator**
1. Does Option B (Hiva collects ticket money in its own merchant account, later pays organisers) amount to payment aggregation requiring RBI authorisation, given the Directions define a PA as an entity that pools customer payments made to merchants and settles to them (para 4(i)) and require credit to merchants' own accounts (13(g))? Does the answer change if Hiva uses a Razorpay "payout" product?
2. With Route, is Hiva a "marketplace" under para 4(e), and are we compliant with 13(f) (marketplace may not take payments for sellers not on its platform) and "payer-payee transparency" (the organiser must deal directly with the buyer)? Is a paid-event ticket a permitted Route use case?
3. Do we meet the turnover criterion (INR 40 lakh domestic) and which documents/self-declaration are acceptable for a new business?
4. Is delaying organiser settlement until after the event permissible under the Razorpay/RBI contract terms and fair to organisers (T+1 expectation)?

**GST**
5. Hiva's platform fee: SAC code, rate (18%?), place of supply, invoice format to organisers (B2B), whether Hiva must register and when, ITC on Razorpay fees.
6. Organiser ticket supplies: GST rate by event type (the Council FAQs mention exemptions up to INR 500 for some categories and 18% above; concert/other-event treatment unclear to me) and whether the organiser or Hiva issues the tax invoice/ticket. Is Hiva's marketplace within Section 9(5) for any event services or is it a Section 52 e-commerce operator?
7. Section 52 TCS: rate (0.5% after CBIC Notification 15/2024 per secondary sources), base (net taxable value of supplies by the organiser), GSTR-8 monthly filing, does it apply when the gateway collects, and is it deducted from the organiser's transfer (`tax_withheld_minor`)?

**Income tax**
8. Section 194-O TDS (0.1% since 1 Oct 2024 per secondary sources, INR 5 lakh individual/HUF threshold with PAN) on organiser payouts: base amount (gross, including GST?), timing (credit vs payment), when the gateway makes the payment, PAN-less rate, Form 26Q/TDS certificates to organisers.
9. Is the platform fee subject to TDS deduction by the organiser (commission), and does deducting the fee from the transfer change who must withhold?
10. Income recognition: gross vs net (fee only) in Hiva's books; handling of funds held for organisers.

**Consumer and platform law**
11. Consumer Protection (E-Commerce) Rules 2020: grievance officer details and timelines (48 h acknowledge / one month resolve per secondary summaries), refund display, bar on cancellation charges, marketplace fall-back liability for an organiser who does not deliver or refund.
12. Is a "no refund" ticket policy enforceable, and what must happen when an event is cancelled, rescheduled, or materially changed?
13. Chargebacks: contractually allocate the loss and fees to organisers? Is withholding or reversing organiser funds for disputes enforceable?
14. DPDP Act 2023 / privacy policy changes for payment data and retention periods for financial records vs the deletion flow.
15. 18+ verification interplay (#82) for payments.
16. Organiser agreement / marketplace terms: scope, prohibited off-platform payment diversion, fee schedule changes, data roles.

**Platform policy**
17. Google Play: confirm live-event tickets stay outside Play Billing and what changes for online/virtual paid events; Data safety and Payments declarations; do any alternative-billing or user-choice programme rules apply in India? Apple (F-16) if iOS ships.

## Appendix B. Sources

Razorpay (all read via a summarising fetch tool, **[DOCS]**; re-read before coding):
- Route overview and eligibility: https://razorpay.com/docs/payments/route/
- Route FAQs (RBI compliance, fees, KYC, statuses): https://razorpay.com/docs/build/llm-docs/payments/route/faqs.md
- Route pricing (0.25% per transfer, exclusive of GST): https://razorpay.com/docs/build/llm-docs/payments/route/pricing.md
- Linked accounts: https://razorpay.com/docs/payments/route/linked-account
- Route integration guide: https://razorpay.com/docs/build/llm-docs/payments/route/integration-guide.md
- Create linked account API: https://razorpay.com/docs/api/payments/route/create-linked-account
- Create stakeholder API: https://razorpay.com/docs/api/payments/route/create-stakeholder/
- Request / update product configuration API: https://razorpay.com/docs/api/payments/route/request-product-config/ , https://razorpay.com/docs/api/payments/route/update-product-config/
- Transfers (orders/payments/direct, statuses): https://razorpay.com/docs/payments/route/transfer-funds-to-linked-accounts/
- Create transfers from orders API: https://razorpay.com/docs/api/payments/route/create-transfers-orders
- Modify settlement hold API: https://razorpay.com/docs/api/payments/route/modify-settlement-hold/
- Reverse a transfer API: https://razorpay.com/docs/api/payments/route/reverse-a-transfer/
- Refund with reversal API: https://razorpay.com/docs/api/payments/route/refund-payments-and-reverse-transfer/
- Reversals and refunds (dashboard): https://razorpay.com/docs/payments/route/reversal , https://razorpay.com/docs/payments/route/refund
- Route webhooks: https://razorpay.com/docs/build/llm-docs/payments/route/subscribe-to-webhooks.md , https://razorpay.com/docs/build/llm-docs/webhooks/route.md
- Webhook best practices (5 s, 24 h retries, event id, ordering): https://razorpay.com/docs/webhooks/best-practices/
- Webhook validation and test mode: https://razorpay.com/docs/webhooks/validate-test/
- Refund webhooks: https://razorpay.com/docs/build/llm-docs/payments/refunds/subscribe-to-webhooks.md
- Refund FAQs (5-7 business days, fees not returned): https://razorpay.com/docs/build/llm-docs/payments/refunds/faqs.md
- Disputes and dispute webhooks: https://razorpay.com/docs/build/llm-docs/payments/disputes.md , https://razorpay.com/docs/build/llm-docs/payments/disputes/subscribe-to-webhooks.md
- Test UPI details: https://razorpay.com/docs/build/llm-docs/payments/payments/test-upi-details.md
- React Native Standard SDK overview: https://razorpay.com/docs/payments/payment-gateway/react-native-integration/standard/ (the Android/iOS integration sub-pages returned 404 to the fetch tool; option names beyond those already used in the repo are unverified)
- Docs index: https://razorpay.com/docs/llms.txt
- Idempotency headers (search result summary, **[UNVERIFIED-PROVIDER]**): https://hdfcbank-collectnow-docs.razorpay.com/api/refunds/normal-refunds-idempotent/ , https://razorpay.com/docs/us/api/payments/route/direct-transfers-idempotent-request/

Regulatory and platform:
- RBI Master Direction, Regulation of Payment Aggregators, 15 Sep 2025: https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12896 (paragraph numbers quoted from the fetch summary; verify against the PDF)
- Summary: https://www.medianama.com/2025/09/223-explained-rbi-master-direction-payment-aggregators/
- Google Play Payments policy: https://support.google.com/googleplay/android-developer/answer/9858738?hl=en ; FAQ https://support.google.com/googleplay/android-developer/answer/10281818?hl=en
- GST TCS (Section 52, 0.5% from 10 Jul 2024, secondary): https://taxguru.in/goods-and-service-tax/igst-e-commerce-operator-tcs-collection-rate-reduced-0-50-percent.html , https://cleartax.in/s/tds-and-tcs-under-gst
- GST on event admission, 56th Council FAQs (secondary/primary mix): https://gstcouncil.gov.in/sites/default/files/2025-09/faq_0.pdf , https://carajput.com/blog/gst-on-event-entry-tickets/
- Section 194-O TDS (secondary): https://cleartax.in/s/section-194o
- Consumer Protection (E-Commerce) Rules 2020 (text and summaries): https://www.icsi.edu/media/webmodules/Consumer_Protection_E-Commerce_Rules_2020.pdf , https://www.indialaw.in/blog/civil/consumer-protection-e-commerce-rules/
- Cashfree Easy Split (Option C reference): https://www.cashfree.com/docs/payments/split/vendor/add , https://www.cashfree.com/docs/payments/split/recipes/split-a-payment
- Marketplace commission GST and TDS/TCS handling (secondary): https://taxguru.in/goods-and-service-tax/gst-compliance-app-based-service-platforms-e-commerce-operators.html

Repo evidence: gathr-api `origin/main` files `src/services/{payment.provider,credit,ticket,event,organiserOnboarding,workspaceSubscription,creator}.service.js`, `src/controllers/webhook.controller.js`, `src/handlers/{scheduler,subscriptionReconcile}.js`, `src/repositories/event.repository.js`, `src/modules/tiers/*`, `migrations/{059,079}*.sql`, `serverless.yml`, `API.md`, `docs/monetization-backend.md`; PRs #81, #82, #83. App: `docs/design/PAID_TICKET_FLOW.md`, `docs/TASKS.md` (F-04, F-05, F-06, F-08, F-10, F-12, F-26), `src/features/{events,organizer}`, `AGENTS.md`.
