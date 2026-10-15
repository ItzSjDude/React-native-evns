import React, {memo} from 'react';
import {Text, View} from 'react-native';
import {payoutStatusCopy} from './organizerPresentation';
import type {OrganizerPayoutAccount} from './types';

const TONE_CLASS = {
  neutral: 'text-muted',
  success: 'text-primary',
  danger: 'text-coral',
} as const;

/** Payout review status for the organiser. Renders nothing while the status is unknown. */
const PayoutStatusBadge = ({account}: {account: OrganizerPayoutAccount | null}) => {
  const copy = payoutStatusCopy(account);
  if (!copy || !account) return null;
  return <View accessibilityRole="summary" className="rounded-[18px] border border-border bg-card p-4">
    <Text className="text-[12px] font-semibold text-muted">Payout account</Text>
    <Text accessibilityRole="text" className={`mt-1 text-[14px] font-bold leading-5 ${TONE_CLASS[copy.tone]}`}>{copy.title}</Text>
    {account.accountSuffix && <Text className="mt-1 text-[12px] text-muted">Account ending {account.accountSuffix}</Text>}
  </View>;
};

export default memo(PayoutStatusBadge);
