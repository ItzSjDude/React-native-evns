import React, {useContext, useEffect} from 'react';
import {Pressable, Text, View} from 'react-native';
import {NavigationContext} from '@react-navigation/native';
import IconBell from '@tabler/icons-react-native/IconBell';
import {Colors} from '../../Constants/Colors';
import {useNotifications} from './notificationsContext';

export type NotificationsBellProps = {
  /** Defaults to opening the notifications sheet. */
  onPress?: () => void;
  size?: number;
  color?: string;
  className?: string;
};

export const formatBadgeCount = (count: number) => (count > 99 ? '99+' : String(count));

/**
 * Bell icon with the unread badge from GET /notifications/unread-count. Refreshes
 * on mount, whenever its screen gains focus, and (via the provider) on each push
 * and app foreground. Renders without a badge outside NotificationsProvider.
 */
export default function NotificationsBell({onPress, size = 22, color = Colors.text, className = ''}: NotificationsBellProps) {
  const {unreadCount, refreshUnreadCount, openNotifications, enabled} = useNotifications();
  // Optional: the bell also works outside a navigator (no focus refresh there).
  const navigation = useContext(NavigationContext);

  useEffect(() => {
    if (!enabled) return;
    refreshUnreadCount();
    return navigation?.addListener('focus', () => { refreshUnreadCount(); });
  }, [enabled, navigation, refreshUnreadCount]);

  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress ?? openNotifications}
      hitSlop={6}
      className={`h-10 w-10 items-center justify-center rounded-full active:opacity-70 ${className}`}>
      <IconBell size={size} color={color} />
      {unreadCount > 0 && (
        <View testID="notifications-badge" pointerEvents="none" className="absolute -right-1 -top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-background bg-gold px-1">
          <Text className="text-[10px] font-bold leading-3 text-gold-ink">{formatBadgeCount(unreadCount)}</Text>
        </View>
      )}
    </Pressable>
  );
}
