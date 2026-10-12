import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import IconAdjustmentsHorizontal from '@tabler/icons-react-native/IconAdjustmentsHorizontal';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconNote from '@tabler/icons-react-native/IconNote';
import IconPin from '@tabler/icons-react-native/IconPin';
import IconRosetteDiscountCheck from '@tabler/icons-react-native/IconRosetteDiscountCheck';
import IconX from '@tabler/icons-react-native/IconX';
import BottomSheet from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import {loadPlanOptions, purchasePlan, restorePurchases, toBillingError} from './billing';
import {freeAllowance, introLabel, paywallRenewalNote, periodLabel, periodsPerYear, planTitle, plusAllowance} from './pricing';
import {DEFAULT_PLANS, DEFAULT_PRODUCT_ID, manageSubscriptionUrl} from './plusService';
import {getPlusState} from './plusStore';
import type {LimitReachedDetails, PaywallReason, PlanOption} from './types';

export type PaywallSheetProps = {visible: boolean; onClose: () => void; reason?: PaywallReason; details?: LimitReachedDetails};

type IconComponent = React.ComponentType<{size?: number; color?: string}>;

const hoursLabel = (minutes: number) => `${+(minutes / 60).toFixed(1)}h`;

/** Only list perks the app actually delivers; each later feature adds its own row when it ships. */
const benefits = (reason?: PaywallReason, details?: LimitReachedDetails): {icon: IconComponent; title: string; note: string}[] => {
  const of = <R extends 'dmStarts' | 'vibeNotes' | 'vibeNoteLifetime'>(limit: R) => (reason === limit ? details : undefined);
  return [
    {icon: IconMessageCircle, title: `${plusAllowance('dmStarts', of('dmStarts'))} new chats a day`, note: `Up from ${freeAllowance('dmStarts', of('dmStarts'))} on free`},
    {icon: IconNote, title: `${plusAllowance('vibeNotes', of('vibeNotes'))} vibe notes valid for ${hoursLabel(plusAllowance('vibeNoteLifetime', of('vibeNoteLifetime')))}`,
      note: `Up from ${freeAllowance('vibeNotes', of('vibeNotes'))} valid for ${hoursLabel(freeAllowance('vibeNoteLifetime', of('vibeNoteLifetime')))}`},
    {icon: IconAdjustmentsHorizontal, title: 'Advanced Filters', note: 'Filter by City, languages, age range, active now, similar interests, and more'},
    {icon: IconPin, title: 'Pin & folder organization', note: 'Pin up to 5 chats and sort into folders'},
    {icon: IconRosetteDiscountCheck, title: 'Optional plus badge', note: 'Stand out on your profile'},
  ];
};

/** Monthly is what we steer people to; fall back to the first plan the store returned. */
const pickDefault = (options: PlanOption[]) =>
  (options.find(option => periodsPerYear(option.regular.billingPeriod) === 12) ?? options[0])?.basePlanId ?? null;

// ponytail: temporary. Shown when Play can't load real plans (simulators, no billing) so the layout is visible; not purchasable.
const STATIC_PLANS = [{id: 'weekly', price: '$4.99/wk'}, {id: 'monthly', price: '$12.99/mo'}, {id: 'yearly', price: '$79.99/yr'}];
const PLAN_TAGS: Record<string, string> = {monthly: 'Best Value', yearly: 'Popular'};
const PERIOD_SHORT: Record<string, string> = {P1W: 'wk', P1M: 'mo', P1Y: 'yr'};
const shortPeriod = (period: string) => PERIOD_SHORT[period] ?? periodLabel(period);

const styles = StyleSheet.create({
  // System serif (Georgia / Noto Serif) for the headline; no bundled font needed.
  title: {fontFamily: Platform.select({ios: 'Georgia', default: 'serif'}), fontWeight: '700'},
  cta: {minHeight: 48, alignItems: 'center', justifyContent: 'center'},
  benefitIcon: {width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primaryBorder},
  planGlow: {shadowColor: Colors.gold, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: {width: 0, height: 4}, elevation: 6},
});

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
  const isStatic = load.state !== 'ready';
  const cards = isStatic
    ? STATIC_PLANS.map(plan => ({id: plan.id, price: plan.price, label: `${planTitle(plan.id)}, ${plan.price}`}))
    : options.map(option => ({
      id: option.basePlanId, price: `${option.regular.formattedPrice}/${shortPeriod(option.regular.billingPeriod)}`,
      label: `${planTitle(option.basePlanId)}, ${option.regular.formattedPrice} per ${periodLabel(option.regular.billingPeriod)}${option.intro ? `, ${introLabel(option.intro)}` : ''}`,
    }));
  const activeId = selected ?? (isStatic ? 'monthly' : null);

  const buy = async () => {
    if (isStatic) {fetchOptions(); return;}
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

  const canBuy = (!!choice || isStatic) && busy === null;

  return <BottomSheet visible={visible} onClose={onClose} dismissible={busy === null} maxHeight={0.94}
    header={<View className="items-center pb-4 pt-1">
      {busy === null && <Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={onClose} hitSlop={6} className="absolute right-0 top-0 h-8 w-8 items-center justify-center rounded-full bg-card active:opacity-70"><IconX size={16} color={Colors.muted} /></Pressable>}
      <Text accessibilityRole="header" style={styles.title} className="px-10 text-center text-[30px] leading-[36px] tracking-[-0.5px] text-foreground">Get Hiva Plus</Text>
      <Text className="mt-1 px-6 text-center text-[14px] leading-[20px] text-muted">Unlock your full potential</Text>
    </View>}
    footer={<View className="gap-3 pt-3">
      <View className="gap-3">
        <Text className="text-[15px] font-semibold text-foreground">Select a Plan</Text>
        {cards.length > 0 && <View accessibilityRole="radiogroup" className="flex-row gap-2.5">
          {cards.map(card => {
            const active = card.id === activeId;
            const tag = PLAN_TAGS[card.id];
            return <Pressable key={card.id} accessibilityRole="radio" accessibilityState={{checked: active}} accessibilityLabel={card.label}
              onPress={() => setSelected(card.id)}
              style={active ? styles.planGlow : undefined}
              className={`h-[80px] min-w-0 flex-1 items-center justify-center rounded-[20px] border-[1.5px] px-1.5 pt-3.5 active:opacity-80 ${active ? 'border-gold bg-gold-bg' : 'border-border bg-card'}`}>
              {!!tag && <Text className="absolute right-1.5 top-1.5 overflow-hidden rounded-full bg-border px-2 py-0.5 text-[9px] font-semibold text-muted">{tag}</Text>}
              <Text className="text-[15px] font-bold text-foreground">{planTitle(card.id)}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit className="mt-0.5 text-[12px] text-muted">{card.price}</Text>
            </Pressable>;
          })}
        </View>}
      </View>

      {!!choice?.intro && <Text className="text-center text-[13px] font-semibold text-purple-soft">{introLabel(choice.intro)}, then {choice.regular.formattedPrice}/{periodLabel(choice.regular.billingPeriod)}</Text>}

      {!!notice && <Text accessibilityRole={notice.tone === 'error' ? 'alert' : undefined}
        className={`text-center text-[13px] font-semibold ${notice.tone === 'error' ? 'text-coral' : notice.tone === 'success' ? 'text-glow-green' : 'text-purple-soft'}`}>{notice.text}</Text>}

      <Pressable accessibilityRole="button" accessibilityLabel="Upgrade to Hiva Plus" accessibilityState={{disabled: !canBuy, busy: busy === 'buy'}} disabled={!canBuy} onPress={buy}
        className={`mt-2 overflow-hidden rounded-full active:opacity-80 ${canBuy || busy === 'buy' ? '' : 'opacity-50'}`}>
        <LinearGradient colors={['#5B4FE8', '#B06CF2']} start={{x: 0, y: 0.5}} end={{x: 1, y: 0.5}} style={styles.cta}>
          {busy === 'buy' ? <ActivityIndicator color={Colors.white} /> : <Text className="text-[15px] font-bold text-white">Upgrade to Hiva Plus</Text>}
        </LinearGradient>
      </Pressable>

      <View className="items-center">
        {!(load.state === 'error' && load.unavailable) && <Pressable accessibilityRole="button" accessibilityLabel="Restore purchases" accessibilityState={{disabled: busy !== null, busy: busy === 'restore'}} disabled={busy !== null} onPress={restore}
          className={`min-h-[32px] items-center justify-center active:opacity-70 ${busy !== null ? 'opacity-50' : ''}`}>
          <Text className="text-[13px] font-semibold text-muted">{busy === 'restore' ? 'Restoring…' : 'Restore purchases'}</Text>
        </Pressable>}
        <Text className="text-center text-[11px] leading-4 text-muted">{paywallRenewalNote(choice?.autoRenews ?? true)}</Text>
        <Pressable accessibilityRole="link" accessibilityLabel="Manage subscriptions in Google Play" hitSlop={6} onPress={() => {Linking.openURL(manageSubscriptionUrl(productId)).catch(() => {});}} className="items-center py-1 active:opacity-70">
          <Text className="text-[11px] font-bold text-purple-soft underline">Manage subscriptions in Google Play</Text>
        </Pressable>
      </View>
    </View>}>
    <View className="gap-4 pb-2 pt-1">
      {benefits(reason, details).map(({icon: Icon, title, note}) => <View key={title} className="flex-row items-center gap-4">
        <LinearGradient colors={[Colors.heroGlow, Colors.primaryDark]} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={styles.benefitIcon}>
          <Icon size={21} color={Colors.purpleSoft} />
        </LinearGradient>
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-semibold text-foreground">{title}</Text>
          <Text className="mt-0.5 text-[12px] leading-[17px] text-muted">{note}</Text>
        </View>
      </View>)}
    </View>

  </BottomSheet>;
}
