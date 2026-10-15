import type {ApiCreditLedgerEntry, ApiCreditPurchase} from './types';

export const messageOf = (error: unknown) => (error as {message?: string} | null)?.message || 'Please try again.';

export const money = (minor: number, currency: string) => {
  try {return new Intl.NumberFormat(undefined, {style: 'currency', currency}).format(minor / 100);}
  catch {return `${currency} ${(minor / 100).toFixed(2)}`;}
};

export const formatWhen = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, {day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'});
};

export const formatDelta = (delta: number) => (delta > 0 ? `+${delta}` : String(delta));

export const LEDGER_REASON_LABELS: Record<ApiCreditLedgerEntry['reason'], string> = {
  PURCHASE: 'Purchase', ISSUE: 'Issued', REVOKE_REFUND: 'Refunded', ADJUSTMENT: 'Adjustment',
};

export const PURCHASE_STATUS_LABELS: Record<ApiCreditPurchase['status'], string> = {
  PENDING: 'Pending', PAID: 'Paid', FAILED: 'Failed', REFUNDED: 'Refunded',
};

/** Clear, fixed wording for each door verdict; the server message is used only where it adds detail. */
export const checkInMessage = (check: {ok: boolean; result: string; message: string; attendeeName: string | null}) => {
  switch (check.result) {
    case 'SUCCESS': return check.attendeeName ? `${check.attendeeName} checked in` : 'Checked in';
    case 'ALREADY_USED': return check.message || 'This ticket was already checked in.';
    case 'WRONG_EVENT': return check.message || 'This ticket is for a different event.';
    case 'CANCELLED': return 'This ticket was cancelled or refunded.';
    case 'EXPIRED': return 'This ticket has expired.';
    case 'INVALID': return 'Ticket not recognised. Check the code and try again.';
    default: return 'Could not verify this ticket. Please try again.';
  }
};
