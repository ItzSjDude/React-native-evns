import type {ApiMessage, ApiPaymentCard, PaymentCardMetadata, PaymentMethod, ThreadMessageExtras} from './types';

const RANK: Record<string, number> = {SHARED: 0, PAID_CLAIMED: 1, CONFIRMED: 2, CANCELLED: 2};

/** Higher is further along. Unknown statuses rank lowest, so they never overwrite a known card. */
export const cardRank = (status: string) => RANK[status] ?? -1;

/** Merges incoming cards by id. A card never moves back to an earlier status, whatever order frames arrive in. */
export const mergeCards = (current: ApiPaymentCard[], incoming: ApiPaymentCard[]): ApiPaymentCard[] => {
  const byId = new Map(current.map(card => [card.id, card]));
  for (const card of incoming) {
    const existing = byId.get(card.id);
    if (!existing) { byId.set(card.id, card); continue; }
    const status = cardRank(card.status) >= cardRank(existing.status) ? card.status : existing.status;
    byId.set(card.id, {...existing, ...card, status});
  }
  return [...byId.values()];
};

const str = (value: unknown) => typeof value === 'string' && value.length > 0 ? value : undefined;

export const paymentCardIdOf = (message: Pick<ApiMessage, 'metadata'>) => str(message.metadata?.paymentCardId);
export const ticketIdOf = (message: Pick<ApiMessage, 'metadata'>) => str(message.metadata?.ticketId);

/** Narrows loose message metadata; anything missing or mistyped comes back undefined rather than being cast. */
const METHODS: PaymentMethod[] = ['UPI', 'BANK', 'CASH', 'LINK'];

export const paymentCardMetadataOf = (message: Pick<ApiMessage, 'metadata'>): Partial<PaymentCardMetadata> => {
  const meta = message.metadata ?? {};
  const amount = meta.amountMinor;
  const method = METHODS.find(value => value === meta.method);
  return {
    paymentCardId: str(meta.paymentCardId),
    amountMinor: typeof amount === 'number' && Number.isFinite(amount) ? amount : undefined,
    currency: str(meta.currency),
    method,
    eventId: str(meta.eventId),
  };
};

/**
 * Socket frames can carry `paymentCard` and `ticket` next to the message row. Those objects go to the card map or
 * are reduced to ids in metadata, so the message list never holds card or ticket payloads.
 */
export const splitRealtimeExtras = (message: ApiMessage & ThreadMessageExtras): {message: ApiMessage; card: ApiPaymentCard | null} => {
  const {paymentCard, ticket, ...row} = message;
  const additions: Record<string, string> = {};
  if (paymentCard?.id && !str(row.metadata?.paymentCardId)) additions.paymentCardId = paymentCard.id;
  if (ticket?.id && !str(row.metadata?.ticketId)) additions.ticketId = ticket.id;
  if (ticket?.event_id && !str(row.metadata?.eventId)) additions.eventId = ticket.event_id;
  const metadata = Object.keys(additions).length ? {...(row.metadata ?? {}), ...additions} : row.metadata;
  return {message: {...row, metadata}, card: paymentCard?.id ? paymentCard : null};
};

/** Masks an account number to its last four digits: 123456789012 -> ••••9012. */
export const maskAccount = (value: string) => value.length > 4 ? `••••${value.slice(-4)}` : '••••';

export type PaymentLink = {url: string; host: string; scheme: 'https' | 'upi'};

const LINK = /^(https|upi):\/\/([^/?#\s]+)\S*$/i;
// Control characters and backslashes are refused: browsers read a backslash as a slash, so the two could disagree on the host.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f\\]/;

/**
 * The only payment links the app opens: https: and upi: (API.md section 5). Everything else, including
 * javascript:, http:, intent: and anything with control characters or a backslash, returns null.
 */
export const safePaymentLink = (raw: string | null | undefined): PaymentLink | null => {
  const url = raw?.trim() ?? '';
  if (!url || UNSAFE.test(url)) return null;
  const match = LINK.exec(url);
  if (!match) return null;
  const authority = match[2];
  // The host is what follows the last '@' in the authority, which is where a browser sends the request.
  const host = authority.slice(authority.lastIndexOf('@') + 1).replace(/:\d*$/, '');
  return {url, host, scheme: match[1].toLowerCase() as PaymentLink['scheme']};
};

/** Image URLs (UPI QR codes) are shown only over https. */
export const safeImageUrl = (raw: string | null | undefined) => {
  const link = safePaymentLink(raw);
  return link?.scheme === 'https' ? link.url : null;
};

export const formatAmount = (amountMinor: number, currency: string) => {
  const amount = amountMinor / 100;
  try {
    return new Intl.NumberFormat(undefined, {style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0}).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
};

/** Whether the attendee may claim this card as paid. Only SHARED cards are claimable; the server enforces the same rule. */
export const canClaimPayment = (card: Pick<ApiPaymentCard, 'status'> | null | undefined) => card?.status === 'SHARED';
