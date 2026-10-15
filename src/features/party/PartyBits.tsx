import React, {memo, useEffect} from 'react';
import {AccessibilityInfo, Pressable, Text, View} from 'react-native';
import Animated, {cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming} from 'react-native-reanimated';
import IconAlertTriangle from '@tabler/icons-react-native/IconAlertTriangle';
import IconHeadphones from '@tabler/icons-react-native/IconHeadphones';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import IconSearchOff from '@tabler/icons-react-native/IconSearchOff';
import IconUserFilled from '@tabler/icons-react-native/IconUserFilled';
import {PartyColors, participantStack, type PartyStateTone} from './partyPresentation';

const TONE_CLASSES: Record<PartyStateTone, {box: string; text: string; dot: string}> = {
  live: {box: 'bg-glow-green/15', text: 'text-glow-emerald dark:text-glow-green', dot: 'bg-glow-green'},
  scheduled: {box: 'bg-primary-dark', text: 'text-primary', dot: 'bg-primary'},
  ended: {box: 'bg-border/40', text: 'text-muted', dot: 'bg-muted'},
};

/** Small pill that says whether a party is live, upcoming or over. Colour is never the only signal: the label is always text. */
export const PartyStateChip = memo(({label, tone}: {label: string; tone: PartyStateTone}) => {
  const classes = TONE_CLASSES[tone];
  return (
    <View className={'flex-row items-center gap-1 self-start rounded-full px-2 py-1 ' + classes.box}>
      <View className={'h-1.5 w-1.5 rounded-full ' + classes.dot} />
      <Text className={'text-[11px] font-bold ' + classes.text} numberOfLines={1}>{label}</Text>
    </View>
  );
});

/** Overlapping avatars with a "+N" overflow chip. `first` is the host avatar; the rest are anonymous silhouettes. */
export const ParticipantStack = memo(({count, first, size = 24, label}: {count: number; first: React.ReactNode; size?: number; label?: string}) => {
  const {shown, overflow} = participantStack(count);
  const rest = Math.max(shown - 1, 0);
  return (
    <View className="flex-row items-center" accessible accessibilityLabel={label}>
      <View className="z-20 rounded-full border-2 border-card">{first}</View>
      {Array.from({length: rest}, (_, index) => (
        <View key={index} style={{height: size + 4, width: size + 4}} className="-ml-2 items-center justify-center rounded-full border-2 border-card bg-border dark:bg-[#35303F]">
          <IconUserFilled size={size - 8} color={PartyColors.muted} />
        </View>
      ))}
      {overflow > 0 && <Text className="ml-1.5 text-[12px] font-semibold text-muted">+{overflow}</Text>}
    </View>
  );
});

const SkeletonBlock = ({className}: {className: string}) => <View className={'rounded-md bg-border/60 dark:bg-[#2A2634] ' + className} />;

/** Placeholder with the same footprint as PartyRoomCard; pulses unless the user prefers reduced motion. */
export const PartyRoomCardSkeleton = memo(() => {
  const pulse = useSharedValue(1);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled?.().then(reduced => {
      if (!cancelled && !reduced) pulse.value = withRepeat(withSequence(withTiming(0.5, {duration: 700}), withTiming(1, {duration: 700})), -1);
    }).catch(() => {});
    return () => { cancelled = true; cancelAnimation(pulse); };
  }, [pulse]);
  const style = useAnimatedStyle(() => ({opacity: pulse.value}));
  return (
    <Animated.View style={style} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden className="mb-2.5 flex-row rounded-[20px] border border-border/60 bg-card p-2 dark:border-[#282433]">
      <View className="h-[112px] w-[104px] rounded-[14px] bg-border/60 dark:bg-[#2A2634]" />
      <View className="ml-3 flex-1 py-1">
        <SkeletonBlock className="h-4 w-3/4" />
        <SkeletonBlock className="mt-2 h-3 w-full" />
        <View className="mt-3 flex-row gap-1.5"><SkeletonBlock className="h-5 w-14 rounded-full" /><SkeletonBlock className="h-5 w-12 rounded-full" /></View>
        <View className="mt-auto flex-row items-center justify-between pt-3"><SkeletonBlock className="h-6 w-16 rounded-full" /><SkeletonBlock className="h-9 w-16 rounded-[14px]" /></View>
      </View>
    </Animated.View>
  );
});

export const PartyListSkeleton = memo(({rows = 4}: {rows?: number}) => (
  <View accessibilityLabel="Loading parties" accessibilityLiveRegion="polite">
    {Array.from({length: rows}, (_, index) => <PartyRoomCardSkeleton key={index} />)}
  </View>
));

export const PartySectionHeader = memo(({title, count}: {title: string; count: number}) => (
  <View accessibilityRole="header" className="mb-2 mt-1 flex-row items-center gap-2 px-1">
    <Text className="text-[13px] font-bold uppercase tracking-[0.6px] text-muted">{title}</Text>
    <View className="rounded-full bg-card px-2 py-0.5"><Text className="text-[11px] font-semibold text-muted">{count}</Text></View>
  </View>
));

type StateAction = {label: string; accessibilityLabel?: string; onPress: () => void; icon?: 'plus' | 'refresh'; primary?: boolean};
const ActionButton = ({action}: {action: StateAction}) => (
  <Pressable accessibilityRole="button" accessibilityLabel={action.accessibilityLabel || action.label} onPress={action.onPress}
    className={'min-h-12 flex-row items-center justify-center gap-2 rounded-full px-5 active:opacity-80 ' + (action.primary ? 'bg-gold' : 'border border-border bg-card')}>
    {action.icon === 'plus' && <IconPlus size={18} color={action.primary ? PartyColors.ink : PartyColors.text} />}
    {action.icon === 'refresh' && <IconRefresh size={18} color={action.primary ? PartyColors.ink : PartyColors.text} />}
    <Text className={'text-[14px] font-bold ' + (action.primary ? 'text-text-dark' : 'text-foreground')}>{action.label}</Text>
  </Pressable>
);

/** Empty and error states share one layout: icon disc, title, helper copy, one clear primary action. */
export const PartyStateView = memo(({kind, title, message, actions}: {kind: 'empty' | 'search' | 'error'; title: string; message: string; actions: StateAction[]}) => {
  const Icon = kind === 'error' ? IconAlertTriangle : kind === 'search' ? IconSearchOff : IconHeadphones;
  const error = kind === 'error';
  return (
    <View className="items-center px-6 pt-10">
      <View className={'h-20 w-20 items-center justify-center rounded-full ' + (error ? 'bg-coral/15' : 'bg-primary-dark')}>
        <Icon size={38} color={error ? PartyColors.coral : PartyColors.accent} strokeWidth={1.6} />
      </View>
      <Text accessibilityRole="header" className="mt-5 text-center text-[18px] font-bold text-foreground">{title}</Text>
      <Text accessibilityRole={error ? 'alert' : undefined} className="mt-2 text-center text-[14px] leading-5 text-muted">{message}</Text>
      <View className="mt-6 w-full max-w-[280px] gap-2.5">{actions.map(action => <ActionButton key={action.label} action={action} />)}</View>
    </View>
  );
});
