export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'SCANNER' | 'MEMBER';

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
  memberCount: number | null;
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
