export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'SCANNER' | 'MEMBER';
export type WorkspaceVerificationStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

/** Raw row of `GET /workspaces` / `GET /workspaces/:id` (`workspaces.*` plus the caller's membership). */
export type ApiWorkspace = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  ticket_balance: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  role: WorkspaceRole;
  verification_status?: WorkspaceVerificationStatus;
  member_count?: string | number;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  ticketBalance: number;
  status: ApiWorkspace['status'];
  role: WorkspaceRole;
  verificationStatus?: WorkspaceVerificationStatus;
  memberCount: number | null;
};

/** Event statuses the backend actually stores (`event.schema.js`). */
export type OrganizerEventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
/** App-side list filter; mapped to a backend status in `organizerService`. */
export type OrganizerEventFilter = 'UPCOMING' | 'PAST' | 'DRAFT';

/** Raw row of `GET /workspaces/:id/events` (only the fields the dashboard reads). */
export type ApiOrganizerEvent = {
  id: string;
  title: string;
  starts_at: string;
  venue: string | null;
  cover_url: string | null;
  status: OrganizerEventStatus;
  capacity: number | string | null;
  tickets_issued: number | string | null;
  is_paid?: boolean;
  price_minor?: number | string | null;
  currency?: string | null;
};

/** `GET /workspaces/:id/events/:eid/stats`; counts may arrive as numeric strings. */
export type ApiEventStats = {
  interested: number | string;
  issued: number | string;
  checked_in: number | string;
  cancelled: number | string;
  conversations: number | string;
};

export type OrganizerEvent = {
  id: string;
  title: string;
  startsAt: string;
  venue: string;
  status: OrganizerEventStatus;
  coverUrl: string | null;
  ticketsSold: number;
  capacity: number | null;
};

export type OrganizerEventStats = {ticketsSold: number; checkedIn: number; interested: number; cancelled: number};

/** Counts only: the backend has no revenue or payout data, so none is modelled here. */
export type OrganizerDashboardSummary = {
  ticketsSold: number;
  checkedIn: number;
  events: OrganizerEvent[];
};

export type OrganizerAttendeeStatus = 'ISSUED' | 'CHECKED_IN' | 'CANCELLED' | 'EXPIRED';
export type OrganizerAttendeeFilter = 'ALL' | 'CHECKED_IN' | 'NOT_CHECKED_IN';

/** Raw row of `GET /workspaces/:wid/events/:eid/attendees`. Never carries email, phone or ticket code. */
export type ApiOrganizerAttendee = {
  ticketId: string;
  displayName: string;
  ticketLabel?: string | null;
  status: OrganizerAttendeeStatus;
  issuedAt?: string | null;
  checkedInAt: string | null;
};

/** `GET /workspaces/:id/payout-account` (OWNER/ADMIN). Masked: only the last four digits come back. Not deployed everywhere yet (API 404). */
export type PayoutAccountStatus = 'NOT_SUBMITTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
export type OrganizerPayoutAccount = {
  status: PayoutAccountStatus;
  accountSuffix: string | null;
  payoutSchedule: 'AFTER_EACH_EVENT' | 'EVERY_MONDAY' | null;
  rejectionReason: string | null;
  updatedAt: string | null;
};

export type OrganizerAttendee = {id: string; displayName: string; ticketLabel: string | null; status: OrganizerAttendeeStatus; checkedInAt: string | null};
export type OrganizerAttendeePage = {items: OrganizerAttendee[]; hasMore: boolean; offset: number};

export type CheckInResultCode = 'SUCCESS' | 'ALREADY_USED' | 'INVALID' | 'WRONG_EVENT' | 'CANCELLED' | 'EXPIRED';

/** Subset of the `POST /workspaces/:id/tickets/verify` body the app keeps. Door verdicts arrive as HTTP 200. */
export type ApiVerifyResponse = {
  ok: boolean;
  result: CheckInResultCode;
  message?: string;
  ticket?: {attendee_name?: string | null; checked_in_at?: string | null} | null;
};

export type OrganizerCheckIn = {ok: boolean; result: CheckInResultCode | 'UNKNOWN'; message: string; attendeeName: string | null; checkedInAt: string | null};

/** Draft captured by the organiser onboarding wizard before the backend accepts each step. */
export type OrganizerOnboardingDraft = {
  workspaceId?: string;
  organizationName: string;
  organizationType: 'INDEPENDENT_ORGANISER' | 'REGISTERED_BUSINESS' | 'NON_PROFIT';
  city: string;
  eventKinds: string[];
  logoUrl?: string;
  verificationType: 'GST_CERTIFICATE' | 'BUSINESS_PAN' | 'PERSONAL_PAN_AADHAAR';
  verificationFileUrl?: string;
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
  payoutSchedule: 'AFTER_EACH_EVENT' | 'EVERY_MONDAY';
  eventName: string;
  eventDescription: string;
  eventCoverUrl?: string;
  eventDate: string;
  eventTime: string;
  venue: string;
  ticketType: 'FREE' | 'PAID';
  capacity: string;
};

/** Row of `ticket_credit_ledger`, returned newest-first by `GET /workspaces/:id/credits`. */
export type ApiCreditLedgerEntry = {
  id: string;
  delta: number;
  balance_after: number;
  reason: 'PURCHASE' | 'ISSUE' | 'REVOKE_REFUND' | 'ADJUSTMENT';
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
};

export type CreditLedgerEntry = {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: ApiCreditLedgerEntry['reason'];
  createdAt: string;
};

/** Row of `ticket_credit_purchases`. */
export type ApiCreditPurchase = {
  id: string;
  quantity: number;
  amount_minor: number;
  currency: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  pack_key: string | null;
  created_at: string;
  paid_at: string | null;
};

export type CreditPurchase = {
  id: string;
  quantity: number;
  amountMinor: number;
  currency: string;
  status: ApiCreditPurchase['status'];
  packKey: string | null;
  createdAt: string;
  paidAt: string | null;
};

/** `GET /workspaces/:id/credits` response (ADMIN/OWNER only). */
export type ApiCreditOverview = {
  balance: number;
  ledger: ApiCreditLedgerEntry[];
  recentPurchases: ApiCreditPurchase[];
};

export type CreditOverview = {
  balance: number;
  ledger: CreditLedgerEntry[];
  recentPurchases: CreditPurchase[];
};

/** Fixed, server-owned ticket-credit product. The app must never submit its own price or quantity. */
export type CreditPack = {key: string; quantity: number; amountMinor: number; currency: string};

export type CreditCheckout = {
  provider: 'razorpay' | 'manual';
  orderId: string;
  amountMinor: number;
  currency: string;
  keyId: string | null;
};

export type CreditPurchaseStart = {purchase: ApiCreditPurchase; checkout: CreditCheckout};

/** Row of `GET /workspaces/:id/conversations` (conversation.repository `listForWorkspace`). `last_message` is not returned today. */
export type ApiSalesThread = {
  id: string;
  status: 'OPEN' | 'CLOSED';
  event_id: string | null;
  event_title: string | null;
  event_starts_at: string | null;
  user_id: string | null;
  attendee_name: string | null;
  attendee_avatar_url: string | null;
  last_message_at: string | null;
  created_at: string;
  unread_count: number | string;
  last_message?: {body: string | null; type: string} | null;
};

export type SalesThread = {
  id: string;
  status: 'OPEN' | 'CLOSED';
  eventId: string | null;
  eventTitle: string;
  buyerName: string;
  buyerAvatarUrl: string | null;
  unreadCount: number;
  lastActivityAt: string;
  lastMessagePreview: string | null;
};

export type SalesThreadPage = {items: SalesThread[]; hasMore: boolean; offset: number};

export type SalesPaymentMethod = 'UPI' | 'BANK' | 'CASH' | 'LINK';

/** What the organiser types into the share form. The amount is never typed: it comes from the event. */
export type SharePaymentForm = {
  method: SalesPaymentMethod;
  payeeName: string;
  upiId: string;
  accountNumber: string;
  ifsc: string;
  paymentLink: string;
  note: string;
};

/** Body of `POST /conversations/:cid/payment-cards`. Sensitive: never log it. */
export type SharePaymentBody = {
  amountMinor: number;
  currency: string;
  method: SalesPaymentMethod;
  payeeName?: string;
  upiId?: string;
  accountNumber?: string;
  ifsc?: string;
  paymentLink?: string;
  note?: string;
};

export type OrganizerEventPrice = {isPaid: boolean; priceMinor: number; currency: string};
