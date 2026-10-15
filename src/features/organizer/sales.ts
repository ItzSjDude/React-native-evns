import type {ApiPaymentCard} from '../messages';
import type {SalesPaymentMethod, SharePaymentBody, SharePaymentForm} from './types';

export const PAYMENT_METHODS: {value: SalesPaymentMethod; label: string}[] = [
  {value: 'UPI', label: 'UPI'}, {value: 'BANK', label: 'Bank'}, {value: 'LINK', label: 'Link'}, {value: 'CASH', label: 'Cash'},
];

export const emptyShareForm = (): SharePaymentForm => ({method: 'UPI', payeeName: '', upiId: '', accountNumber: '', ifsc: '', paymentLink: '', note: ''});

// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f\\\s]/;
const HTTPS_HOST = /^https:\/\/((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9])(?:[/?#]\S*)?$/i;

/** The same shape the server accepts (API.md section 5): https only, a public domain name, no credentials, IP literal or port. */
export const isSafeHttpsLink = (raw: string) => {
  const url = raw.trim();
  if (!url || url.length > 2048 || UNSAFE.test(url)) return false;
  const match = HTTPS_HOST.exec(url);
  if (!match || match[1].length > 253) return false;
  const authority = url.slice('https://'.length).split(/[/?#]/)[0];
  return !authority.includes('@') && !authority.includes(':');
};

export class ShareFormError extends Error {}

/** Builds the request body for the chosen method only, so stray values from another method are never sent. */
export const buildSharePaymentBody = (form: SharePaymentForm, price: {priceMinor: number; currency: string}): SharePaymentBody => {
  if (!Number.isInteger(price.priceMinor) || price.priceMinor < 1) throw new ShareFormError('This event has no ticket price, so there is nothing to request.');
  const body: SharePaymentBody = {amountMinor: price.priceMinor, currency: price.currency || 'INR', method: form.method};
  const payee = form.payeeName.trim();
  const note = form.note.trim();
  if (payee) body.payeeName = payee;
  if (note) body.note = note;
  if (form.method === 'UPI') {
    const upi = form.upiId.trim();
    if (!/^[\w.-]{2,}@[a-z][a-z0-9]{1,}$/i.test(upi)) throw new ShareFormError('Enter a valid UPI ID, like name@bank.');
    body.upiId = upi;
  } else if (form.method === 'BANK') {
    const account = form.accountNumber.replace(/\s+/g, '');
    const ifsc = form.ifsc.trim().toUpperCase();
    if (!/^\d{6,20}$/.test(account)) throw new ShareFormError('Enter the account number using digits only.');
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new ShareFormError('Enter a valid IFSC code.');
    body.accountNumber = account;
    body.ifsc = ifsc;
  } else if (form.method === 'LINK') {
    if (!isSafeHttpsLink(form.paymentLink)) throw new ShareFormError('The payment link must start with https:// and use a normal website address.');
    body.paymentLink = form.paymentLink.trim();
  }
  return body;
};

const OPEN: ApiPaymentCard['status'][] = ['SHARED', 'PAID_CLAIMED'];
const ISSUABLE: ApiPaymentCard['status'][] = ['SHARED', 'PAID_CLAIMED', 'CONFIRMED'];

const newest = (cards: ApiPaymentCard[]) =>
  cards.slice().sort((a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? ''))[0] ?? null;

/** Newest card still awaiting money (Confirm / Cancel apply to it). */
export const openCardOf = (cards: ApiPaymentCard[]) => newest(cards.filter(card => OPEN.includes(card.status)));
/** Newest card a ticket can settle against: live as soon as it is shared, confirming is not a prerequisite. */
export const issuableCardOf = (cards: ApiPaymentCard[]) => newest(cards.filter(card => ISSUABLE.includes(card.status)));

export const maskedAccount = (value: string | null | undefined) => (value ? `••••${value.slice(-4)}` : '');

export type SalesFailure = {message: string; needsCredits: boolean};

/** Fixed, readable wording per documented failure. Server text is used only where it adds detail. */
export const salesFailure = (error: unknown): SalesFailure => {
  const failure = (error ?? {}) as {status?: number; code?: string; message?: string};
  const server = typeof failure.message === 'string' ? failure.message : '';
  const text = `${failure.code ?? ''} ${server}`;
  const plain = (message: string): SalesFailure => ({message, needsCredits: false});
  if (error instanceof ShareFormError) return plain(error.message);
  switch (failure.status) {
    case 402: return {message: 'You are out of ticket credits. Buy credits to issue this ticket.', needsCredits: true};
    case 404: return plain('Ticketing is not available right now, or this conversation is no longer accessible.');
    case 429: return plain('Too many requests. Wait a moment and try again.');
    case 403: return plain('Only organisation owners and admins can do this.');
    case 409:
      if (/TIER_SOLD_OUT/i.test(text)) return plain('That ticket tier is sold out.');
      if (/sold out/i.test(text)) return plain('This event is sold out.');
      if (/already (holds|has)|already ticketed|already.*ticket/i.test(text)) return plain('This buyer already holds a ticket for this event.');
      if (/draft/i.test(text)) return plain('Publish this event before issuing tickets.');
      if (/cancel/i.test(text) && /event/i.test(text)) return plain('This event has been cancelled.');
      if (/card|payment/i.test(text)) return plain('No matching payment request for this event, or it was already used. Share payment details again.');
      return plain(server || 'This can no longer be done. Refresh the conversation and try again.');
    default: return plain(server || 'Something went wrong. Please try again.');
  }
};
