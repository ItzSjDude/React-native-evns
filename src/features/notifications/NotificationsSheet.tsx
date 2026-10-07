import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import IconBellOff from '@tabler/icons-react-native/IconBellOff';
import IconChecks from '@tabler/icons-react-native/IconChecks';
import BottomSheet from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import {iconForNotification} from './notificationIcons';
import {getNotificationsPage, markNotificationsRead} from './notificationsService';
import {formatNotificationTime} from './notificationTargets';
import {useNotifications} from './notificationsContext';
import type {AppNotification} from './types';

export type NotificationsSheetProps = {
  visible: boolean;
  onClose: () => void;
};

type Status = 'loading' | 'ready' | 'error';

const errorMessage = (error: unknown) =>
  (error as {message?: string})?.message || 'Could not load notifications.';

/** Paged notifications list. Rendered by NotificationsProvider; open it with `openNotifications()`. */
export default function NotificationsSheet({visible, onClose}: NotificationsSheetProps) {
  const {listVersion, unreadCount, setUnreadCount, refreshUnreadCount, navigateTo} = useNotifications();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const request = useRef(0);

  const loadFirstPage = useCallback(async (quiet = false) => {
    const id = ++request.current;
    if (!quiet) setStatus('loading');
    setError(null);
    try {
      const page = await getNotificationsPage(0);
      if (id !== request.current) return;
      setItems(page.items);
      setHasMore(page.hasMore);
      setNextOffset(page.nextOffset);
      setMoreError(false);
      setStatus('ready');
    } catch (e) {
      if (id !== request.current) return;
      setError(errorMessage(e));
      if (!quiet) setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setActionError(null);
    loadFirstPage();
    refreshUnreadCount();
  }, [loadFirstPage, refreshUnreadCount, visible]);

  // A push arrived while the sheet is open: reload quietly so the list doesn't flash.
  const seenVersion = useRef(listVersion);
  useEffect(() => {
    if (seenVersion.current === listVersion) return;
    seenVersion.current = listVersion;
    if (visible) loadFirstPage(true);
  }, [listVersion, loadFirstPage, visible]);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    const id = request.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await getNotificationsPage(nextOffset);
      if (id !== request.current) return;
      setItems(current => {
        const seen = new Set(current.map(item => item.id));
        return [...current, ...page.items.filter(item => !seen.has(item.id))];
      });
      setHasMore(page.hasMore);
      setNextOffset(page.nextOffset);
    } catch {
      if (id === request.current) setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const hasUnread = unreadCount > 0 || items.some(item => !item.readAt);

  const markAllRead = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    setActionError(null);
    const previous = items;
    const now = new Date().toISOString();
    setItems(current => current.map(item => (item.readAt ? item : {...item, readAt: now})));
    setUnreadCount(0);
    try {
      await markNotificationsRead();
    } catch (e) {
      setItems(previous);
      setActionError(errorMessage(e) || 'Could not mark notifications as read.');
    } finally {
      setMarkingAll(false);
      refreshUnreadCount();
    }
  };

  const openItem = (item: AppNotification) => {
    if (!item.readAt) {
      const now = new Date().toISOString();
      setItems(current => current.map(row => (row.id === item.id ? {...row, readAt: now} : row)));
      setUnreadCount(count => Math.max(0, count - 1));
      markNotificationsRead([item.id]).catch(() => {}).finally(() => { refreshUnreadCount(); });
    }
    if (item.target.kind !== 'notifications' && navigateTo(item.target)) onClose();
  };

  const header = (
    <View className="mb-2 flex-row items-center justify-between">
      <Text className="text-[13px] text-muted">{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</Text>
      {status === 'ready' && items.length > 0 && hasUnread && (
        <Pressable accessibilityRole="button" accessibilityLabel="Mark all notifications as read" accessibilityState={{busy: markingAll, disabled: markingAll}}
          disabled={markingAll} onPress={markAllRead} hitSlop={6}
          className={`flex-row items-center gap-1.5 rounded-full bg-primary-dark px-3 py-1.5 active:opacity-70 ${markingAll ? 'opacity-50' : ''}`}>
          <IconChecks size={15} color={Colors.primary} />
          <Text className="text-[13px] font-semibold text-primary">Mark all read</Text>
        </Pressable>
      )}
    </View>
  );

  let content: React.ReactNode;
  if (status === 'loading') {
    content = <View className="items-center py-14"><ActivityIndicator color={Colors.primary} accessibilityLabel="Loading notifications" /></View>;
  } else if (status === 'error') {
    content = (
      <View className="items-center py-12">
        <Text className="text-center text-[15px] font-semibold text-foreground">Couldn't load notifications</Text>
        {!!error && <Text className="mt-1 text-center text-[13px] text-muted">{error}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel="Retry loading notifications" onPress={() => loadFirstPage()} className="mt-4 rounded-full bg-primary px-5 py-2.5 active:opacity-70">
          <Text className="text-[14px] font-bold text-text-dark">Try again</Text>
        </Pressable>
      </View>
    );
  } else if (items.length === 0) {
    content = (
      <View className="items-center py-12">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-dark"><IconBellOff size={24} color={Colors.primary} /></View>
        <Text className="mt-3 text-[15px] font-semibold text-foreground">No notifications yet</Text>
        <Text className="mt-1 text-center text-[13px] text-muted">Messages, party invites and nearby activity will show up here.</Text>
      </View>
    );
  } else {
    content = (
      <View>
        {header}
        {!!actionError && <Text accessibilityLiveRegion="polite" className="mb-2 text-[13px] text-coral">{actionError}</Text>}
        <View className="overflow-hidden rounded-2xl bg-card">
          {items.map(item => <NotificationRow key={item.id} item={item} onPress={() => openItem(item)} />)}
        </View>
        {hasMore && (
          <Pressable accessibilityRole="button" accessibilityLabel={moreError ? 'Retry loading more notifications' : 'Load more notifications'} disabled={loadingMore} onPress={loadMore} className="my-3 items-center py-2 active:opacity-70">
            {loadingMore ? <ActivityIndicator color={Colors.primary} /> : <Text className={`text-[14px] font-semibold ${moreError ? 'text-coral' : 'text-primary'}`}>{moreError ? "Couldn't load more. Tap to retry" : 'Load more'}</Text>}
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Notifications" maxHeight={0.88}>
      {content}
    </BottomSheet>
  );
}

function NotificationRow({item, onPress}: {item: AppNotification; onPress: () => void}) {
  const unread = !item.readAt;
  const Icon = iconForNotification(item.type);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${item.title}${item.body ? `. ${item.body}` : ''}`}
      onPress={onPress}
      className={`flex-row items-start gap-3 border-b border-sheet px-4 py-3 active:bg-background/60 ${unread ? 'bg-purple-tint/60' : ''}`}>
      <View className={`h-9 w-9 items-center justify-center rounded-full ${unread ? 'bg-primary-dark' : 'bg-background'}`}>
        <Icon size={17} color={unread ? Colors.primary : Colors.muted} />
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-start gap-2">
          <Text numberOfLines={2} className={`min-w-0 flex-1 text-[14px] ${unread ? 'font-bold text-foreground' : 'font-semibold text-text-body'}`}>{item.title}</Text>
          <Text className="text-[12px] text-muted">{formatNotificationTime(item.createdAt)}</Text>
        </View>
        {!!item.body && <Text numberOfLines={3} className="mt-0.5 text-[13px] leading-[18px] text-muted">{item.body}</Text>}
      </View>
      {unread && <View testID="notification-unread-dot" accessibilityElementsHidden className="mt-1.5 h-2 w-2 rounded-full bg-gold" />}
    </Pressable>
  );
}
