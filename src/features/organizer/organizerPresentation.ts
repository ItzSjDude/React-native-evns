import type {ApiCreditLedgerEntry, ApiCreditPurchase, OrganizerPayoutAccount} from './types';

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

/** Status line for the payout badge. `null` when the status is unknown, so nothing alarming is shown. */
export const payoutStatusCopy = (account: OrganizerPayoutAccount | null): {tone: 'neutral' | 'success' | 'danger'; title: string} | null => {
  if (!account) return null;
  switch (account.status) {
    case 'PENDING': return {tone: 'neutral', title: 'Payout details under review'};
    case 'VERIFIED': return {tone: 'success', title: 'Payout verified'};
    case 'REJECTED': return {tone: 'danger', title: account.rejectionReason ? `Payout rejected: ${account.rejectionReason}. Update your details and resubmit.` : 'Payout rejected. Update your details and resubmit.'};
    default: return {tone: 'neutral', title: 'Add your bank details to receive payouts'};
  }
};

/**
 * Why paid tickets are locked, or `null` when they are open or the status is unknown.
 * Free events are never locked by payout status.
 */
export const paidTicketLockMessage = (account: OrganizerPayoutAccount | null): string | null => {
  if (!account || account.status === 'VERIFIED') return null;
  if (account.status === 'PENDING') return 'Paid events need a verified payout account. Your payout details are under review, so you can save this event as free for now.';
  if (account.status === 'REJECTED') return 'Paid events need a verified payout account. Update your payout details and resubmit to unlock them.';
  return 'Paid events need a verified payout account. Add your bank details in the Payouts step to unlock them.';
};
