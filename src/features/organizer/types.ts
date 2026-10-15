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

export type OrganizerDashboardSummary = {
  ticketsSold: number;
  grossRevenueMinor: number;
  currency: string;
  checkedIn: number;
  nextPayoutMinor: number | null;
  nextPayoutAt: string | null;
  verificationStatus: WorkspaceVerificationStatus;
  events: Array<{id: string; title: string; startsAt: string; venue: string; status: 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'CANCELLED' | 'ENDED' | 'SOLD_OUT'; coverUrl: string | null; ticketsSold: number; capacity: number}>;
  actionItems: Array<{type: 'REFUND_REQUEST' | 'CHECKIN_STAFF' | 'VERIFICATION'; eventId?: string; eventTitle?: string; count?: number}>;
};

export type OrganizerEvent = OrganizerDashboardSummary['events'][number];
export type OrganizerEventSummary = Omit<OrganizerDashboardSummary, 'events' | 'actionItems' | 'verificationStatus' | 'nextPayoutMinor' | 'nextPayoutAt'> & {
  event: OrganizerEvent;
  ticketTypes: Array<{label: string; priceMinor: number; currency: string; sold: number; capacity: number}>;
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

export type OrganizerAttendee = {id: string; displayName: string; ticketLabel: string; orderReference: string; ticketStatus: 'PAID' | 'FREE' | 'REFUNDED' | 'CANCELLED'; checkedInAt: string | null; amountMinor: number; currency: string};
export type OrganizerAttendeePage = {items: OrganizerAttendee[]; hasMore: boolean; offset: number};
export type OrganizerPayouts = {next: {amountMinor: number; currency: string; releaseAt: string; maskedAccount: string} | null; history: Array<{id: string; eventTitle: string; amountMinor: number; currency: string; status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED'; releaseAt: string; paidAt: string | null}>};

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
