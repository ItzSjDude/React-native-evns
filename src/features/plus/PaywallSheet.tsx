import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Linking, Pressable, Text, View} from 'react-native';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconNote from '@tabler/icons-react-native/IconNote';
import IconRadar from '@tabler/icons-react-native/IconRadar';
import IconRosetteDiscountCheck from '@tabler/icons-react-native/IconRosetteDiscountCheck';
import IconFilter from '@tabler/icons-react-native/IconFilter';
import BottomSheet, {SheetButton} from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import {loadPlanOptions, purchasePlan, restorePurchases, toBillingError, UNAVAILABLE_MESSAGE} from './billing';
import {introLabel, paywallHeadline, periodLabel, periodsPerYear, planTitle, yearlySavingsPercent} from './pricing';
import {DEFAULT_PLANS, DEFAULT_PRODUCT_ID, manageSubscriptionUrl} from './plusService';
import {getPlusState} from './plusStore';
import type {LimitReachedDetails, LimitReason, PlanOption} from './types';

export type PaywallSheetProps = {visible: boolean; onClose: () => void; reason?: LimitReason; details?: LimitReachedDetails};

type IconComponent = React.ComponentType<{size?: number; color?: string}>;

/** Only perks the app actually delivers are unmarked; everything else says "coming soon". */
const BENEFITS: {icon: IconComponent; label: string; soon?: boolean}[] = [
  {icon: IconMessageCircle, label: '40 new chats a day'},
  {icon: IconRadar, label: 'More visibility in Nearby and Search'},
  {icon: IconRosetteDiscountCheck, label: 'Plus badge on your profile and posts'},
  {icon: IconNote, label: '10 vibe notes a day, up for 24 h', soon: true},
  {icon: IconFilter, label: 'City & interest filters', soon: true},
];

const pickDefault = (options: PlanOption[]) =>
  (options.find(option => periodsPerYear(option.regular.billingPeriod) === 1) ?? options[0])?.basePlanId ?? null;

type Load = {state: 'loading'} | {state: 'ready'; options: PlanOption[]} | {state: 'error'; message: string; unavailable: boolean};

export default function PaywallSheet({visible, onClose, reason, details}: PaywallSheetProps) {
  const [load, setLoad] = useState<Load>({state: 'loading'});
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [notice, setNotice] = useState<{tone: 'error' | 'info' | 'success'; text: string} | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  /** Let the success message show briefly before the sheet goes away. */
  const closeSoon = () => {clearTimeout(closeTimer.current); closeTimer.current = setTimeout(onClose, 900);};

  const plans = getPlusState().subscription?.plans ?? DEFAULT_PLANS;
  const productId = plans[0]?.productId ?? DEFAULT_PRODUCT_ID;
  const productIds = [...new Set(plans.map(plan => plan.productId))];

  const fetchOptions = useCallback(async () => {
    setLoad({state: 'loading'});
    try {
      const options = await loadPlanOptions(getPlusState().subscription?.plans ?? DEFAULT_PLANS);
      if (!options.length) {setLoad({state: 'error', message: 'Plans aren’t available right now. Please try again later.', unavailable: false}); return;}
      setLoad({state: 'ready', options});
      setSelected(current => (current && options.some(option => option.basePlanId === current) ? current : pickDefault(options)));
    } catch (error) {
      const mapped = toBillingError(error);
      setLoad({state: 'error', message: mapped.message, unavailable: mapped.kind === 'unavailable'});
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setNotice(null);
    fetchOptions();
  }, [fetchOptions, visible]);

  const options = load.state === 'ready' ? load.options : [];
  const choice = options.find(option => option.basePlanId === selected) ?? null;
  const savings = yearlySavingsPercent(options);

  const buy = async () => {
    if (!choice || busy) return;
    setBusy('buy'); setNotice(null);
    try {
      const outcome = await purchasePlan(choice);
      if (outcome.status === 'pending') setNotice({tone: 'info', text: 'Your payment is pending. Plus unlocks as soon as Google Play confirms it.'});
      else {setNotice({tone: 'success', text: 'Welcome to Hiva Plus!'}); closeSoon();}
    } catch (error) {
      const mapped = toBillingError(error);
      if (mapped.kind !== 'cancelled') setNotice({tone: 'error', text: mapped.message});
    } finally {setBusy(null);}
  };

  const restore = async () => {
    if (busy) return;
    setBusy('restore'); setNotice(null);
    try {
      const subscription = await restorePurchases(productIds);
      if (subscription.plan === 'plus') {setNotice({tone: 'success', text: 'Hiva Plus restored.'}); closeSoon();}
      else setNotice({tone: 'info', text: 'Your Google Play subscription isn’t active.'});
    } catch (error) {
      setNotice({tone: 'error', text: toBillingError(error).message});
    } finally {setBusy(null);}
  };

  const ctaLabel = !choice ? 'Get Plus' : choice.intro ? `Start for ${choice.intro.formattedPrice}` : `Get Plus for ${choice.regular.formattedPrice}`;

  return <BottomSheet visible={visible} onClose={onClose} dismissible={busy === null} maxHeight={0.92}
    title={paywallHeadline(reason, details)} subtitle="Hiva Plus"
    footer={<>
      {load.state === 'ready' && <SheetButton label={busy === 'buy' ? 'Opening Google Play…' : ctaLabel} busy={busy === 'buy'} disabled={!choice || busy !== null} onPress={buy} />}
      {!(load.state === 'error' && load.unavailable) && <SheetButton label={busy === 'restore' ? 'Restoring…' : 'Restore purchases'} variant="ghost" busy={busy === 'restore'} disabled={busy !== null} onPress={restore} />}
      <Text className="mt-1 text-center text-[11px] leading-4 text-muted">Renews automatically. Cancel anytime in Google Play.</Text>
      <Pressable accessibilityRole="link" accessibilityLabel="Manage subscriptions in Google Play" hitSlop={6} onPress={() => {Linking.openURL(manageSubscriptionUrl(productId)).catch(() => {});}} className="items-center py-1.5 active:opacity-70">
        <Text className="text-[11px] font-bold text-purple-soft underline">Manage subscriptions in Google Play</Text>
      </Pressable>
    </>}>
    <View className="mb-4 gap-2.5 rounded-2xl border border-purple-line bg-purple-tint/40 p-4">
      {BENEFITS.map(({icon: Icon, label, soon}) => <View key={label} className="flex-row items-center gap-3">
        <View className="h-8 w-8 items-center justify-center rounded-full bg-primary-dark"><Icon size={16} color={soon ? Colors.muted : Colors.purpleSoft} /></View>
        <Text className={`min-w-0 flex-1 text-[14px] font-semibold ${soon ? 'text-muted' : 'text-foreground'}`}>{label}</Text>
        {soon && <Text className="rounded-full bg-card px-2 py-0.5 text-[10px] font-bold uppercase text-muted">Coming soon</Text>}
      </View>)}
    </View>

    {load.state === 'loading' && <View className="items-center py-6"><ActivityIndicator accessibilityLabel="Loading plans" color={Colors.gold} /></View>}
    {load.state === 'error' && <View className="items-center gap-2 rounded-2xl bg-card px-4 py-5">
      <Text accessibilityRole="alert" className="text-center text-[14px] font-semibold text-foreground">{load.unavailable ? UNAVAILABLE_MESSAGE : load.message}</Text>
      {!load.unavailable && <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={fetchOptions} className="h-9 justify-center rounded-full border border-border px-4 active:opacity-70"><Text className="text-[13px] font-bold text-foreground">Try again</Text></Pressable>}
    </View>}

    {options.length > 0 && <View accessibilityRole="radiogroup" className="gap-2.5">
      {options.map(option => {
        const active = option.basePlanId === selected;
        const isYearly = periodsPerYear(option.regular.billingPeriod) === 1;
        const label = planTitle(option.basePlanId);
        return <Pressable key={option.basePlanId} accessibilityRole="radio" accessibilityState={{checked: active}}
          accessibilityLabel={`${label}, ${option.regular.formattedPrice} per ${periodLabel(option.regular.billingPeriod)}${option.intro ? `, ${introLabel(option.intro)}` : ''}`}
          onPress={() => setSelected(option.basePlanId)}
          className={`flex-row items-center gap-3 rounded-2xl border-2 px-4 py-3 active:opacity-80 ${active ? 'border-gold bg-gold-bg' : 'border-border bg-card'}`}>
          <View className={`h-5 w-5 items-center justify-center rounded-full border-2 ${active ? 'border-gold bg-gold' : 'border-border-muted'}`}>{active && <IconCheck size={12} color={Colors.goldInk} />}</View>
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-[15px] font-extrabold text-foreground">{label}</Text>
              {isYearly && savings !== null && <Text className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-extrabold text-gold-ink">Save {savings}%</Text>}
            </View>
            {!!option.intro && <Text className="mt-0.5 text-xs font-semibold text-gold">{introLabel(option.intro)}, then {option.regular.formattedPrice}/{periodLabel(option.regular.billingPeriod)}</Text>}
          </View>
          <Text className="text-[15px] font-extrabold text-foreground">{option.regular.formattedPrice}<Text className="text-xs font-semibold text-muted">/{periodLabel(option.regular.billingPeriod)}</Text></Text>
        </Pressable>;
      })}
    </View>}

    {!!notice && <Text accessibilityRole={notice.tone === 'error' ? 'alert' : undefined}
      className={`mt-3 text-center text-[13px] font-semibold ${notice.tone === 'error' ? 'text-coral' : notice.tone === 'success' ? 'text-glow-green' : 'text-purple-soft'}`}>{notice.text}</Text>}
  </BottomSheet>;
}
