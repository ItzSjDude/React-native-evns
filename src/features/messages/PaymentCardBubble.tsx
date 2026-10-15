import React, {memo} from 'react';
import {Pressable, Text, View} from 'react-native';
import RemoteImage from '../../components/RemoteImage';
import {clockTimeOf} from './conversationPresentation';
import {canClaimPayment, formatAmount, maskAccount, paymentCardMetadataOf, safeImageUrl, safePaymentLink, type PaymentLink} from './paymentCard';
import type {DirectMessage} from './directService';
import type {ApiPaymentCard} from './types';

type Props = {
  message: DirectMessage;
  /** Looked up by `metadata.paymentCardId`; null until the thread detail has loaded. */
  card: ApiPaymentCard | null;
  mine: boolean;
  /** Attendee side of an EVENT thread. Anything else gets the generic bubble (D5): no payee, no details, no actions. */
  attendee: boolean;
  /** Workspace side of an EVENT thread: sees amount and state only. Payee details stay hidden. */
  organiser?: boolean;
  claiming: boolean;
  onCopy: (value: string) => void;
  onOpenLink: (link: PaymentLink) => void;
  onClaim: (card: ApiPaymentCard) => void;
};

const STATUS_LABEL: Partial<Record<ApiPaymentCard['status'], string>> = {
  SHARED: 'Waiting for your payment',
  PAID_CLAIMED: 'Payment claimed. Waiting for the organiser to confirm',
  CONFIRMED: 'Payment confirmed',
  CANCELLED: 'Request withdrawn',
};

const ORGANISER_STATUS_LABEL: Partial<Record<ApiPaymentCard['status'], string>> = {
  SHARED: 'Waiting for the buyer to pay',
  PAID_CLAIMED: 'Buyer says they have paid. Check your account, then confirm',
  CONFIRMED: 'Payment confirmed',
  CANCELLED: 'Request withdrawn',
};

const METHOD_LABEL: Record<ApiPaymentCard['method'], string> = {UPI: 'UPI', BANK: 'Bank transfer', CASH: 'Cash', LINK: 'Payment link'};

const Row = ({label, value}: {label: string; value: string}) => (
  <View className="mt-2 flex-row items-center justify-between gap-3">
    <Text className="text-[12px] font-semibold text-muted">{label}</Text>
    <Text selectable className="flex-1 text-right text-[14px] font-bold text-foreground" numberOfLines={1}>{value}</Text>
  </View>
);

const ActionButton = ({label, onPress, disabled = false, primary = false}: {label: string; onPress: () => void; disabled?: boolean; primary?: boolean}) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={disabled ? undefined : onPress}
    className={`h-11 items-center justify-center rounded-full ${primary ? 'bg-gold' : 'border border-border'} ${disabled ? 'opacity-40' : 'active:opacity-70'}`}>
    <Text className={`text-[14px] font-bold ${primary ? 'text-text-dark' : 'text-foreground'}`}>{label}</Text>
  </Pressable>
);

/** Payment request in the thread. Amount and method come from the message; payee and details come from the card. */
const PaymentCardBubble = memo(({message, card, mine, attendee, organiser = false, claiming, onCopy, onOpenLink, onClaim}: Props) => {
  const meta = paymentCardMetadataOf(message);
  const amountMinor = card?.amount_minor ?? meta.amountMinor;
  const currency = card?.currency ?? meta.currency ?? 'INR';
  const method = card?.method ?? meta.method;
  const detail = attendee ? card : null;
  const link = detail?.method === 'LINK' ? safePaymentLink(detail.payment_link) : null;
  const qrUrl = detail?.method === 'UPI' ? safeImageUrl(detail.qr_image_url) : null;
  const copyValue = detail?.method === 'UPI' ? detail.upi_id : detail?.method === 'BANK' ? detail.account_number : null;
  const copyLabel = detail?.method === 'UPI' ? 'Copy UPI ID' : 'Copy account number';
  const claimable = canClaimPayment(detail);
  /** Copy, open-link and I've paid only make sense while money is still expected. */
  const open = detail?.status === 'SHARED' || detail?.status === 'PAID_CLAIMED';
  const expired = !!detail?.expires_at && Date.parse(detail.expires_at) < Date.now();
  const status = detail ? STATUS_LABEL[detail.status] : organiser && card ? ORGANISER_STATUS_LABEL[card.status] : undefined;

  return (
    <View testID="payment-card-bubble" className={`mb-4 max-w-[82%] ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
      <View className={`w-full rounded-[18px] border border-border bg-card p-4 ${mine ? 'rounded-br-[5px]' : 'rounded-bl-[5px]'}`}>
        <Text className="text-[11px] font-bold uppercase tracking-[0.6px] text-muted">Payment request</Text>
        <Text className="mt-1 text-[24px] font-extrabold text-foreground">
          {typeof amountMinor === 'number' ? formatAmount(amountMinor, currency) : 'Amount unavailable'}
        </Text>

        {detail && <>
          {!!detail.payee_name && <Row label="Payee" value={detail.payee_name} />}
          {!!method && <Row label="Method" value={METHOD_LABEL[method]} />}
          {detail.method === 'UPI' && !!detail.upi_id && <Row label="UPI ID" value={detail.upi_id} />}
          {detail.method === 'BANK' && !!detail.account_number && <Row label="Account" value={maskAccount(detail.account_number)} />}
          {detail.method === 'BANK' && !!detail.ifsc && <Row label="IFSC" value={detail.ifsc} />}
          {!!link && <Row label="Pays via" value={link.host} />}
          {!!detail.note && <Text selectable className="mt-3 text-[13px] leading-[18px] text-foreground">{detail.note}</Text>}
          {!!qrUrl && <RemoteImage uri={qrUrl} resizeMode="contain" className="mt-3 h-44 w-44 self-center rounded-[12px] bg-background" />}
        </>}

        {attendee && !card && <Text className="mt-2 text-[13px] text-muted">Loading payment details</Text>}
        {!attendee && !organiser && <Text className="mt-2 text-[13px] text-muted">Payment details are not shown in direct chats.</Text>}
        {!!status && <Text className="mt-3 text-[13px] font-semibold text-muted">{status}</Text>}
        {claimable && expired && <Text className="mt-1 text-[12px] text-muted">Past its expiry date. Confirm with the organiser before paying.</Text>}

        {detail && open && (
          <View className="mt-4 gap-2">
            {!!copyValue && <ActionButton label={copyLabel} onPress={() => onCopy(copyValue)} />}
            {!!link && <ActionButton label="Open payment link" onPress={() => onOpenLink(link)} />}
            <ActionButton primary label={claimable ? "I've paid" : 'Payment claimed'} disabled={!claimable || claiming} onPress={() => onClaim(detail)} />
          </View>
        )}
      </View>
      <Text className="mt-1 px-1 text-[11px] text-muted">{clockTimeOf(message.created_at)}</Text>
    </View>
  );
});

export default PaymentCardBubble;
