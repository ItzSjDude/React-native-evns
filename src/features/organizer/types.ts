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
