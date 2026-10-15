import React, {createElement, isValidElement, memo, type ComponentType, type ReactNode} from 'react';
import {Pressable, Text, View, type AccessibilityState} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {cssInterop} from 'nativewind';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import IconSparkles from '@tabler/icons-react-native/IconSparkles';

cssInterop(LinearGradient, {className: 'style'});

// Violet to pink: the look of the "Become a creator" banner, reused by the other promo cards.
const DEFAULT_COLORS = ['#6D5DF6', '#A855F7', '#FF5D8F'];

type IconComponent = ComponentType<{size: number; color: string}>;

type Props = {
  /** An icon element, or an icon component that is drawn white at 18px. */
  icon: ReactNode | IconComponent;
  title: string;
  subtitle: string;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  accessibilityState?: AccessibilityState;
  colors?: string[];
  testID?: string;
};

const isIconComponent = (icon: ReactNode | IconComponent): icon is IconComponent =>
  typeof icon === 'function' || (typeof icon === 'object' && icon !== null && '$$typeof' in icon && !isValidElement(icon));

function GradientBanner({icon, title, subtitle, onPress, accessibilityLabel, disabled, accessibilityState, colors = DEFAULT_COLORS, testID}: Props) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={accessibilityState} disabled={disabled} onPress={onPress} testID={testID}
    className="min-h-[48px] overflow-hidden rounded-[16px] active:opacity-90">
    <LinearGradient colors={colors} start={{x: 0, y: 0}} end={{x: 1, y: 1}} className="flex-row items-center gap-3 px-3.5 py-2.5">
      <View pointerEvents="none" className="absolute -right-5 -top-7 h-20 w-20 rounded-full bg-white/15" />
      <View pointerEvents="none" className="absolute right-12 top-2"><IconSparkles size={12} color="#FFFFFFB3" /></View>
      <View className="h-9 w-9 items-center justify-center rounded-xl border border-white/40 bg-white/25">
        {isIconComponent(icon) ? createElement(icon, {size: 18, color: '#FFFFFF'}) : icon}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[14px] font-extrabold text-white">{title}</Text>
        <Text numberOfLines={1} className="text-[11.5px] text-white/85">{subtitle}</Text>
      </View>
      <IconChevronRight size={18} color="#FFFFFF" />
    </LinearGradient>
  </Pressable>;
}

export default memo(GradientBanner);
