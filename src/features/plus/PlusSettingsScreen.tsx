import React, {useEffect, useState} from 'react';
import {Linking, Modal, Pressable, ScrollView, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconChevronLeft from '@tabler/icons-react-native/IconChevronLeft';
import IconExternalLink from '@tabler/icons-react-native/IconExternalLink';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import {Colors} from '../../Constants/Colors';
import {restorePurchases, toBillingError} from './billing';
import {planTitle, subscriptionNote} from './pricing';
import {DEFAULT_PLANS, manageSubscriptionUrl} from './plusService';
import {openPaywall} from './plusStore';
import PlusBadge from './PlusBadge';
import {PROFILE_THEMES} from './profileTheme';
import type {PlusPreferences, SubscriptionStatus} from './types';
import {usePlus} from './usePlus';

const formatDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'});
};

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  ACTIVE: 'Active', GRACE_PERIOD: 'Payment issue — grace period', ON_HOLD: 'On hold — update payment in Google Play',
  PAUSED: 'Paused', CANCELED: 'Cancelled', EXPIRED: 'Expired', REVOKED: 'Revoked',
};

const Line = ({label, value, first}: {label: string; value: string; first?: boolean}) =>
  <View className={`min-h-[52px] flex-row items-center justify-between gap-3 px-4 py-3 ${first ? '' : 'border-t border-border/60 dark:border-[#211D2C]'}`}>
    <Text className="text-[14px] text-muted">{label}</Text>
    <Text className="shrink text-right text-[14px] font-semibold text-foreground">{value}</Text>
  </View>;

/** Status, plan, renewal date and links to manage or restore a Play subscription. */
export default function PlusSettingsScreen({visible, onClose, preferences, onChange}: {
  visible: boolean; onClose: () => void;
  /** Badge and theme from `/me/settings`; null hides the customize group. Owned by the caller so this feature stays independent of profile. */
  preferences?: PlusPreferences | null; onChange?: (patch: Partial<PlusPreferences>) => void;
}) {
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
  const status = subscription?.status ? STATUS_LABELS[subscription.status] : isPlus ? 'Active' : 'Free';
  const date = formatDate(subscription?.expiresAt ?? null);
  const dateLabel = subscription?.autoRenewing ? 'Renews on' : 'Expires on';
  const note = subscriptionNote(subscription, date);

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
      <View className="flex-row items-center gap-3 border-b border-border/60 dark:border-[#1A1724] px-4 pb-3 pt-2">
        <Pressable accessibilityRole="button" accessibilityLabel="Back to settings" onPress={onClose}
          className="h-11 w-11 items-center justify-center rounded-[14px] border border-border bg-card dark:bg-[#15121E] active:opacity-70">
          <IconChevronLeft size={20} color={Colors.text} />
        </Pressable>
        <Text accessibilityRole="header" className="flex-1 font-display text-[22px] text-foreground">Hiva Plus</Text>
      </View>

      <ScrollView contentContainerClassName="gap-[18px] px-4 pb-6 pt-3.5">
        <View className="flex-row items-center gap-3 rounded-[22px] border border-purple-line bg-purple-tint p-4">
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center"><Text className="text-[17px] font-extrabold text-foreground">{isPlus ? 'You’re on Plus' : 'You’re on Free'}</Text>{isPlus && <PlusBadge size="md" />}</View>
            <Text className="mt-1 text-xs text-purple-soft">{isPlus ? 'Thanks for supporting Hiva.' : 'Get more new chats a day with Plus.'}</Text>
          </View>
        </View>

        <View className="overflow-hidden rounded-[20px] border border-border bg-card dark:bg-[#15121E]">
          <Line first label="Status" value={status} />
          {isPlus && <Line label="Plan" value={planTitle(subscription?.basePlanId)} />}
          {isPlus && !!date && <Line label={dateLabel} value={date} />}
        </View>

        {!!preferences && <View className="overflow-hidden rounded-[20px] border border-border bg-card dark:bg-[#15121E]">
          <Pressable accessibilityRole="switch" accessibilityLabel="Show Plus badge" accessibilityState={{checked: isPlus && preferences.showPlusBadge}}
            onPress={() => (isPlus ? onChange?.({showPlusBadge: !preferences.showPlusBadge}) : openPaywall())}
            className="min-h-14 flex-row items-center gap-3 px-4 py-2 active:bg-white/5">
            <View className="min-w-0 flex-1">
              <Text className="text-[14px] font-semibold text-foreground">Show Plus badge</Text>
              <Text className="text-xs text-muted">{isPlus ? 'Off by default. Shown on your profile and posts.' : 'Plus members can show a badge on their profile.'}</Text>
            </View>
            <View className={`h-7 w-[46px] justify-center rounded-full px-[3px] ${isPlus && preferences.showPlusBadge ? 'bg-gold' : 'bg-border'}`}>
              <View className={`h-[22px] w-[22px] rounded-full ${isPlus && preferences.showPlusBadge ? 'self-end bg-gold-ink' : 'self-start bg-muted'}`} />
            </View>
          </Pressable>
          <View className="border-t border-border/60 dark:border-[#211D2C] px-4 py-3">
            <Text className="text-[14px] font-semibold text-foreground">Profile theme</Text>
            <Text className="mb-2.5 text-xs text-muted">{isPlus ? 'Everyone who visits your profile sees it.' : 'Plus members can theme their profile.'}</Text>
            <View accessibilityRole="radiogroup" className="flex-row gap-2.5">
              {PROFILE_THEMES.map(theme => {
                const active = (isPlus ? preferences.profileTheme : 'default') === theme.id;
                return <Pressable key={theme.id} accessibilityRole="radio" accessibilityState={{checked: active}} accessibilityLabel={`${theme.label} theme`}
                  onPress={() => (isPlus ? onChange?.({profileTheme: theme.id}) : openPaywall())}
                  className={`h-11 flex-1 flex-row items-center justify-center gap-2 rounded-full border-2 active:opacity-80 ${active ? 'border-gold bg-gold-bg' : 'border-border'}`}>
                  <View style={{backgroundColor: theme.swatch}} className="h-3.5 w-3.5 rounded-full" />
                  <Text className="text-[13px] font-bold text-foreground">{theme.label}</Text>
                </Pressable>;
              })}
            </View>
          </View>
        </View>}

        {!isPlus && <Pressable accessibilityRole="button" accessibilityLabel="See Plus plans" onPress={() => openPaywall()}
          className="h-[52px] items-center justify-center rounded-full bg-gold active:opacity-80">
          <Text className="text-[15px] font-extrabold text-gold-ink">See Plus plans</Text>
        </Pressable>}

        <View className="overflow-hidden rounded-[20px] border border-border bg-card dark:bg-[#15121E]">
          <Pressable accessibilityRole="link" accessibilityLabel="Manage in Google Play" onPress={() => {Linking.openURL(manageSubscriptionUrl(productId)).catch(() => {});}}
            className="min-h-14 flex-row items-center gap-3 px-4 active:bg-white/5">
            <IconExternalLink size={18} color={Colors.purpleSoft} /><Text className="flex-1 text-[14px] font-semibold text-foreground">Manage in Google Play</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Restore purchases" accessibilityState={{busy}} disabled={busy} onPress={restore}
            className="min-h-14 flex-row items-center gap-3 border-t border-border/60 dark:border-[#211D2C] px-4 active:bg-white/5">
            <IconRefresh size={18} color={Colors.purpleSoft} /><Text className="flex-1 text-[14px] font-semibold text-foreground">{busy ? 'Restoring…' : 'Restore purchases'}</Text>
          </Pressable>
        </View>

        {!!notice && <Text accessibilityRole={notice.error ? 'alert' : undefined} className={`text-center text-[13px] font-semibold ${notice.error ? 'text-coral' : 'text-purple-soft'}`}>{notice.text}</Text>}
        {!!note && <Text className="text-center text-[11px] leading-4 text-muted">{note}</Text>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
