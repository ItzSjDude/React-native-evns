import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AccessibilityInfo, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, Text, View, useWindowDimensions} from 'react-native';
import Animated, {Easing, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconX from '@tabler/icons-react-native/IconX';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import {Colors} from '../Constants/Colors';

const DURATION = 240;
const EASE = Easing.bezier(0.2, 0.9, 0.3, 1);

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string | null;
  /** Rendered above the title, e.g. an avatar for a person sheet. */
  header?: React.ReactNode;
  /** Pinned below the scrollable content, e.g. a primary action. */
  footer?: React.ReactNode;
  /** Set false while a request is in flight so the sheet can't be swiped away mid-action. */
  dismissible?: boolean;
  maxHeight?: number;
  children?: React.ReactNode;
};

export default function BottomSheet({visible, onClose, title, subtitle, header, footer, dismissible = true, maxHeight = 0.82, children}: BottomSheetProps) {
  const {height} = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [reduced, setReduced] = useState(false);
  const offset = useSharedValue(height);
  const backdrop = useSharedValue(0);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible); dismissibleRef.current = dismissible;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => listener.remove();
  }, []);

  useEffect(() => {
    const duration = reduced ? 0 : DURATION;
    if (visible) {
      setMounted(true);
      offset.value = withTiming(0, {duration, easing: EASE});
      backdrop.value = withTiming(1, {duration});
      return;
    }
    offset.value = withTiming(height, {duration, easing: EASE});
    backdrop.value = withTiming(0, {duration});
    const timer = setTimeout(() => setMounted(false), duration);
    return () => clearTimeout(timer);
  }, [backdrop, height, offset, reduced, visible]);

  // Drag down on the handle/header to dismiss; anything short of the threshold springs back.
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => dismissibleRef.current,
    onMoveShouldSetPanResponder: (_, {dy, dx}) => dismissibleRef.current && dy > 6 && Math.abs(dy) > Math.abs(dx),
    onPanResponderMove: (_, {dy}) => {offset.value = Math.max(0, dy);},
    onPanResponderRelease: (_, {dy, vy}) => {
      if (dy > 80 || vy > 0.6) onCloseRef.current();
      else offset.value = withTiming(0, {duration: 180, easing: EASE});
    },
    onPanResponderTerminate: () => {offset.value = withTiming(0, {duration: 180, easing: EASE});},
  }), [offset]);

  const sheetStyle = useAnimatedStyle(() => ({transform: [{translateY: offset.value}]}));
  const backdropStyle = useAnimatedStyle(() => ({opacity: backdrop.value}));
  const close = () => {if (dismissible) onClose();};

  if (!mounted) return null;
  return <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={close}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
      <Animated.View pointerEvents="none" style={backdropStyle} className="absolute inset-0 bg-black/70" />
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss sheet" onPress={close} className="flex-1" />
      <Animated.View style={[{maxHeight: height * maxHeight}, sheetStyle]} className="w-full max-w-[640px] self-center rounded-t-[28px] border border-b-0 border-border-muted bg-sheet">
        <SafeAreaView edges={['bottom']} className="shrink">
          <View {...pan.panHandlers} className="px-5 pb-3">
            <View accessibilityRole="adjustable" accessibilityLabel="Sheet handle" accessibilityHint="Swipe down to close" accessibilityActions={[{name: 'decrement', label: 'Close'}]} onAccessibilityAction={close}
              className="h-6 items-center justify-center"><View className="h-1 w-8 rounded-full bg-border-muted" /></View>
            {header}
            {!!title && <View className="flex-row items-start gap-3">
              <View className="min-w-0 flex-1">
                <Text accessibilityRole="header" numberOfLines={2} className="text-[19px] font-bold tracking-[-0.3px] text-foreground">{title}</Text>
                {!!subtitle && <Text className="mt-1 text-[13px] leading-5 text-muted">{subtitle}</Text>}
              </View>
              {dismissible && <Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={onClose} hitSlop={6} className="h-9 w-9 items-center justify-center rounded-full bg-card active:opacity-70"><IconX size={18} color={Colors.muted} /></Pressable>}
            </View>}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false} contentContainerClassName="px-5 pb-3">
            {children}
          </ScrollView>
          {!!footer && <View className="px-5 pb-2 pt-1">{footer}</View>}
        </SafeAreaView>
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>;
}

/** Groups related rows into one rounded card, like iOS settings sections. */
export const SheetSection = ({label, children}: {label?: string; children: React.ReactNode}) =>
  <View className="mb-3">
    {!!label && <Text className="mb-1.5 ml-1 text-[11px] font-semibold uppercase tracking-[0.8px] text-muted">{label}</Text>}
    <View className="overflow-hidden rounded-2xl bg-card">{children}</View>
  </View>;

type IconComponent = React.ComponentType<{size?: number; color?: string}>;

export const SheetRow = ({icon: Icon, label, description, onPress, destructive, disabled, chevron, accessory, accessibilityLabel}: {
  icon?: IconComponent; label: string; description?: string; onPress?: () => void;
  destructive?: boolean; disabled?: boolean; chevron?: boolean; accessory?: React.ReactNode; accessibilityLabel?: string;
}) => {
  const tint = destructive ? Colors.coral : disabled ? Colors.muted : Colors.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{disabled: !!disabled}} disabled={disabled || !onPress} onPress={onPress}
    className={`min-h-[52px] flex-row items-center gap-3 border-b border-sheet px-4 py-2.5 active:bg-background/60 ${disabled ? 'opacity-50' : ''}`}>
    {!!Icon && <View className={`h-8 w-8 items-center justify-center rounded-full ${destructive ? 'bg-coral/15' : 'bg-primary-dark'}`}><Icon size={17} color={destructive ? Colors.coral : disabled ? Colors.muted : Colors.primary} /></View>}
    <View className="min-w-0 flex-1">
      <Text style={{color: tint}} className="text-[15px] font-semibold">{label}</Text>
      {!!description && <Text className="mt-0.5 text-xs leading-4 text-muted">{description}</Text>}
    </View>
    {accessory}
    {chevron && <IconChevronRight size={18} color={Colors.muted} />}
  </Pressable>;
};

export const SheetButton = ({label, onPress, variant = 'primary', busy, disabled}: {
  label: string; onPress: () => void; variant?: 'primary' | 'destructive' | 'ghost' | 'danger'; busy?: boolean; disabled?: boolean;
}) => {
  const off = busy || disabled;
  const surface = variant === 'primary' ? 'bg-gold' : variant === 'destructive' ? 'bg-coral' : variant === 'danger' ? 'bg-coral/10' : 'bg-transparent';
  const text = variant === 'ghost' ? 'text-foreground' : variant === 'danger' ? 'text-coral' : 'text-text-dark';
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled: !!off, busy: !!busy}} disabled={off} onPress={onPress}
    className={`my-1 min-h-[50px] items-center justify-center rounded-full px-5 active:opacity-80 ${surface} ${off ? 'opacity-50' : ''}`}>
    <Text className={`text-[15px] font-bold ${text}`}>{label}</Text>
  </Pressable>;
};

/** Square-ish quick action used in tool grids and profile-card action rows. */
export const SheetTile = ({icon: Icon, label, onPress, badge, active, destructive, disabled, accessibilityLabel}: {
  icon: IconComponent; label: string; onPress: () => void; badge?: number; active?: boolean; destructive?: boolean; disabled?: boolean; accessibilityLabel?: string;
}) => {
  const tint = destructive ? Colors.coral : active ? Colors.textDark : Colors.primary;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{disabled: !!disabled, selected: !!active}} disabled={disabled} onPress={onPress}
    className={`min-w-0 flex-1 items-center gap-1.5 py-1 active:opacity-70 ${disabled ? 'opacity-40' : ''}`}>
    <View className={`h-14 w-14 items-center justify-center rounded-[20px] ${active ? 'bg-gold' : destructive ? 'bg-coral/15' : 'bg-card'}`}>
      <Icon size={24} color={tint} />
      {!!badge && <View className="absolute -right-1 -top-1 min-w-[20px] items-center rounded-full border-2 border-sheet bg-gold px-1"><Text className="text-[10px] font-bold text-text-dark">{badge > 9 ? '9+' : badge}</Text></View>}
    </View>
    <Text numberOfLines={2} className={`text-center text-[12px] font-semibold leading-4 ${destructive ? 'text-coral' : 'text-text-body'}`}>{label}</Text>
  </Pressable>;
};

/** Lays tiles out in rows of up to `columns`, padding the last row so tiles keep equal widths. A short single row is centered instead. */
export const SheetTileGrid = ({columns: maxColumns = 4, children}: {columns?: number; children: React.ReactNode}) => {
  const tiles = React.Children.toArray(children).filter(Boolean);
  const columns = Math.max(1, Math.min(maxColumns, tiles.length));
  const rows: React.ReactNode[][] = [];
  tiles.forEach((tile, i) => {(rows[Math.floor(i / columns)] ||= []).push(tile);});
  return <View className="mb-3 gap-3">
    {rows.map((row, r) => <View key={r} className={`flex-row gap-2 ${tiles.length < 3 ? 'self-center w-2/3' : ''}`}>
      {row}{Array.from({length: columns - row.length}, (_, i) => <View key={`pad${i}`} className="flex-1" />)}
    </View>)}
  </View>;
};
