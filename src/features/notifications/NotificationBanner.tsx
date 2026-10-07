import React, {useEffect, useRef} from 'react';
import {Animated, Pressable, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import IconX from '@tabler/icons-react-native/IconX';
import {Colors} from '../../Constants/Colors';
import {iconForNotification} from './notificationIcons';
import type {ForegroundNotice, NotificationTarget} from './types';

const VISIBLE_MS = 4500;

type Props = {
  notice: ForegroundNotice | null;
  onPress: (target: NotificationTarget) => void;
  onDismiss: () => void;
};

/** In-app toast for pushes received while the app is in the foreground. */
export default function NotificationBanner({notice, onPress, onDismiss}: Props) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!notice) return;
    progress.setValue(0);
    Animated.timing(progress, {toValue: 1, duration: 220, useNativeDriver: true}).start();
    const timer = setTimeout(() => onDismissRef.current(), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [notice, progress]);

  if (!notice) return null;
  const Icon = iconForNotification(notice.target.type ?? '');
  const translateY = progress.interpolate({inputRange: [0, 1], outputRange: [-24, 0]});

  return (
    <Animated.View pointerEvents="box-none" style={{opacity: progress, transform: [{translateY}], top: insets.top + 8}} className="absolute left-3 right-3 z-50">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${notice.title}${notice.body ? `. ${notice.body}` : ''}`}
        accessibilityHint="Opens the notification"
        accessibilityLiveRegion="polite"
        onPress={() => onPress(notice.target)}
        className="w-full max-w-[640px] flex-row items-center gap-3 self-center rounded-[20px] border border-purple-line bg-card px-3.5 py-3 active:opacity-80">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-dark">
          <Icon size={18} color={Colors.primary} />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-[14px] font-bold text-foreground">{notice.title}</Text>
          {!!notice.body && <Text numberOfLines={2} className="mt-0.5 text-[13px] leading-[18px] text-muted">{notice.body}</Text>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" hitSlop={8} onPress={onDismiss} className="h-7 w-7 items-center justify-center rounded-full active:opacity-70">
          <IconX size={16} color={Colors.muted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}
