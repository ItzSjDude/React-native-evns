import React, {useEffect, useState} from 'react';
import {Linking, Modal, Pressable, ScrollView, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconChevronLeft from '@tabler/icons-react-native/IconChevronLeft';
import IconExternalLink from '@tabler/icons-react-native/IconExternalLink';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import {Colors} from '../../Constants/Colors';
import {restorePurchases, toBillingError} from './billing';
import {planTitle} from './pricing';
import {DEFAULT_PLANS, manageSubscriptionUrl} from './plusService';
import {openPaywall} from './plusStore';
import PlusBadge from './PlusBadge';
import {usePlus} from './usePlus';

const formatDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'});
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active', in_grace_period: 'Payment issue — grace period', on_hold: 'On hold — update payment in Google Play',
  paused: 'Paused', canceled: 'Cancelled', cancelled: 'Cancelled', expired: 'Expired', pending: 'Payment pending',
};

const Line = ({label, value, first}: {label: string; value: string; first?: boolean}) =>
  <View className={`min-h-[52px] flex-row items-center justify-between gap-3 px-4 py-3 ${first ? '' : 'border-t border-[#211D2C]'}`}>
    <Text className="text-[14px] text-muted">{label}</Text>
    <Text className="shrink text-right text-[14px] font-semibold text-foreground">{value}</Text>
  </View>;

/** Status, plan, renewal date and links to manage or restore a Play subscription. */
export default function PlusSettingsScreen({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const {subscription, isPlus, refresh} = usePlus();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{error: boolean; text: string} | null>(null);

  useEffect(() => {
    if (!visible) return;
    setNotice(null);
    refresh().catch(() => {});
  }, [refresh, visible]);

  const plans = subscription?.plans ?? DEFAULT_PLANS;
  const productId = subscription?.productId ?? plans[0]?.productId;
  const status = subscription?.status ? STATUS_LABELS[subscription.status] ?? subscription.status : isPlus ? 'Active' : 'Free';
  const date = formatDate(subscription?.expiresAt ?? null);
  const dateLabel = subscription?.autoRenewing ? 'Renews on' : 'Expires on';

  const restore = async () => {
    if (busy) return;
    setBusy(true); setNotice(null);
    try {
      const next = await restorePurchases([...new Set(plans.map(plan => plan.productId))]);
      setNotice({error: false, text: next.plan === 'plus' ? 'Hiva Plus restored.' : 'Your Google Play subscription isn’t active.'});
    } catch (error) {
      setNotice({error: true, text: toBillingError(error).message});
    } finally {setBusy(false);}
  };

  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 border-b border-[#1A1724] px-4 pb-3 pt-2">
        <Pressable accessibilityRole="button" accessibilityLabel="Back to settings" onPress={onClose}
          className="h-11 w-11 items-center justify-center rounded-[14px] border border-border bg-[#15121E] active:opacity-70">
          <IconChevronLeft size={20} color={Colors.text} />
        </Pressable>
        <Text accessibilityRole="header" className="flex-1 font-display text-[22px] text-foreground">Hiva Plus</Text>
      </View>

      <ScrollView contentContainerClassName="gap-[18px] px-4 pb-6 pt-3.5">
        <View className="flex-row items-center gap-3 rounded-[22px] border border-purple-line bg-purple-tint p-4">
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center"><Text className="text-[17px] font-extrabold text-foreground">{isPlus ? 'You’re on Plus' : 'You’re on Free'}</Text>{isPlus && <PlusBadge size="md" />}</View>
            <Text className="mt-1 text-xs text-purple-soft">{isPlus ? 'Thanks for supporting Hiva.' : 'Get more chats and visibility with Plus.'}</Text>
          </View>
        </View>

        <View className="overflow-hidden rounded-[20px] border border-border bg-[#15121E]">
          <Line first label="Status" value={status} />
          {isPlus && <Line label="Plan" value={planTitle(subscription?.basePlanId)} />}
          {isPlus && !!date && <Line label={dateLabel} value={date} />}
        </View>

        {!isPlus && <Pressable accessibilityRole="button" accessibilityLabel="See Plus plans" onPress={() => openPaywall()}
          className="h-[52px] items-center justify-center rounded-full bg-gold active:opacity-80">
          <Text className="text-[15px] font-extrabold text-gold-ink">See Plus plans</Text>
        </Pressable>}

        <View className="overflow-hidden rounded-[20px] border border-border bg-[#15121E]">
          <Pressable accessibilityRole="link" accessibilityLabel="Manage in Google Play" onPress={() => {Linking.openURL(manageSubscriptionUrl(productId)).catch(() => {});}}
            className="min-h-14 flex-row items-center gap-3 px-4 active:bg-white/5">
            <IconExternalLink size={18} color={Colors.purpleSoft} /><Text className="flex-1 text-[14px] font-semibold text-foreground">Manage in Google Play</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Restore purchases" accessibilityState={{busy}} disabled={busy} onPress={restore}
            className="min-h-14 flex-row items-center gap-3 border-t border-[#211D2C] px-4 active:bg-white/5">
            <IconRefresh size={18} color={Colors.purpleSoft} /><Text className="flex-1 text-[14px] font-semibold text-foreground">{busy ? 'Restoring…' : 'Restore purchases'}</Text>
          </Pressable>
        </View>

        {!!notice && <Text accessibilityRole={notice.error ? 'alert' : undefined} className={`text-center text-[13px] font-semibold ${notice.error ? 'text-coral' : 'text-purple-soft'}`}>{notice.text}</Text>}
        <Text className="text-center text-[11px] leading-4 text-muted">Renews automatically. Cancel anytime in Google Play.</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
