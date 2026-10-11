import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Pressable, ScrollView, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {cssInterop} from 'nativewind';
import IconChevronLeft from '@tabler/icons-react-native/IconChevronLeft';
import IconBellOff from '@tabler/icons-react-native/IconBellOff';
import IconChecks from '@tabler/icons-react-native/IconChecks';
import SlideInScreen from '../../components/SlideInScreen';
import ThemedStatusBar from '../../components/ThemedStatusBar';
import {Colors} from '../../Constants/Colors';
import {iconForNotification} from './notificationIcons';
import {getNotificationsPage, markNotificationsRead} from './notificationsService';
import {formatNotificationTime} from './notificationTargets';
import {useNotifications} from './notificationsContext';
import {useFollowToggle, useIsFollowing, useViewerId} from '../users';
import type {AppNotification, NotificationDisplayData, NotificationType} from './types';

export type NotificationsSheetProps = {
  visible: boolean;
  onClose: () => void;
};

cssInterop(SafeAreaView, {className: 'style'});

type Status = 'loading' | 'ready' | 'error';

// Inline call-to-action per type; tapping it does the same as tapping the row (opens the target).
const ACTION_LABELS: Partial<Record<NotificationType, string>> = {
  PARTY_INVITE: 'Join', PARTY_SCHEDULED_START: 'Join', NEW_MESSAGE: 'Reply', USER_ARRIVED: 'Say hi',
  PURCHASE_REQUESTED: 'View', EVENT_PUBLISHED: 'View', EVENT_REMINDER: 'View', WAITLIST_OFFER: 'View', TICKET_ISSUED: 'View',
};
const isUrl = (value?: string) => !!value && /^https?:\/\//i.test(value);

const errorMessage = (error: unknown) =>
  (error as {message?: string})?.message || 'Could not load notifications.';

/** Full-page notifications list that slides in from the right. Rendered by NotificationsProvider; open it with `openNotifications()`. */
export default function NotificationsSheet({visible, onClose}: NotificationsSheetProps) {
  const {listVersion, unreadCount, setUnreadCount, refreshUnreadCount, navigateTo} = useNotifications();
  const viewerId = useViewerId();
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
    <View className="mb-1 flex-row items-center justify-between px-4">
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
    content = <View className="flex-1 items-center justify-center"><ActivityIndicator color={Colors.gold} accessibilityLabel="Loading notifications" /></View>;
  } else if (status === 'error') {
    content = (
      <View className="flex-1 items-center justify-center px-6 pb-16">
        <Text className="text-center text-[15px] font-semibold text-foreground">Couldn't load notifications</Text>
        {!!error && <Text className="mt-1 text-center text-[13px] text-muted">{error}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel="Retry loading notifications" onPress={() => loadFirstPage()} className="mt-4 rounded-full bg-gold px-5 py-2.5 active:opacity-70">
          <Text className="text-[14px] font-bold text-text-dark">Try again</Text>
        </Pressable>
      </View>
    );
  } else if (items.length === 0) {
    content = (
      <View className="flex-1 items-center justify-center px-6 pb-16">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-dark"><IconBellOff size={24} color={Colors.primary} /></View>
        <Text className="mt-3 text-[15px] font-semibold text-foreground">No notifications yet</Text>
        <Text className="mt-1 text-center text-[13px] text-muted">Messages, party invites and nearby activity will show up here.</Text>
      </View>
    );
  } else {
    content = (
      <View>
        {header}
        {!!actionError && <Text accessibilityLiveRegion="polite" className="mb-2 px-4 text-[13px] text-coral">{actionError}</Text>}
        <View>
          {items.map(item => <NotificationRow key={item.id} item={item} viewerId={viewerId} onPress={() => openItem(item)} />)}
        </View>
        {hasMore && (
          <Pressable accessibilityRole="button" accessibilityLabel={moreError ? 'Retry loading more notifications' : 'Load more notifications'} disabled={loadingMore} onPress={loadMore} className="my-3 items-center py-2 active:opacity-70">
            {loadingMore ? <ActivityIndicator color={Colors.gold} /> : <Text className={`text-[14px] font-semibold ${moreError ? 'text-coral' : 'text-primary'}`}>{moreError ? "Couldn't load more. Tap to retry" : 'Load more'}</Text>}
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <SlideInScreen visible={visible} onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
        <ThemedStatusBar />
        <View className="flex-row items-center gap-1 px-2 pb-2 pt-1">
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} hitSlop={4}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-white/5">
            <IconChevronLeft size={24} color={Colors.text} />
          </Pressable>
          <Text accessibilityRole="header" className="flex-1 text-[20px] font-bold text-foreground">Notifications</Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="flex-grow pb-8 pt-1">
          {content}
        </ScrollView>
      </SafeAreaView>
    </SlideInScreen>
  );
}

function NotificationRow({item, viewerId, onPress}: {item: AppNotification; viewerId: string | null | undefined; onPress: () => void}) {
  const unread = !item.readAt;
  const Icon = iconForNotification(item.type);
  const display = item.data as NotificationDisplayData;
  const avatar = isUrl(display.actorAvatarUrl) ? display.actorAvatarUrl : undefined;
  const thumbnail = isUrl(display.imageUrl) ? display.imageUrl : undefined;
  const action = item.target.kind !== 'notifications' ? ACTION_LABELS[item.type] : undefined;
  const followBack = item.type === 'USER_FOLLOWED' && !!display.actorId;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${item.title}${item.body ? `. ${item.body}` : ''}`}
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 py-3 active:bg-white/5">
      {avatar ? (
        <View className="h-11 w-11">
          <Image source={{uri: avatar}} accessibilityLabel={display.actorName ? `${display.actorName}'s photo` : undefined} className="h-11 w-11 rounded-full bg-card" />
          {/* Type badge on the photo, so the kind of notification still reads at a glance. */}
          <View className="absolute -bottom-0.5 -right-0.5 h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-primary-dark">
            <Icon size={11} color={Colors.primary} />
          </View>
        </View>
      ) : (
        <View className={`h-11 w-11 items-center justify-center rounded-full ${unread ? 'bg-primary-dark' : 'bg-card'}`}>
          <Icon size={19} color={unread ? Colors.primary : Colors.muted} />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Text numberOfLines={2} className={`text-[14px] leading-[19px] ${unread ? 'font-bold text-foreground' : 'font-semibold text-text-body'}`}>{item.title}</Text>
        {!!item.body && <Text numberOfLines={2} className="mt-0.5 text-[13px] leading-[18px] text-muted">{item.body}</Text>}
        <View className="mt-1 flex-row items-center gap-1.5">
          {unread && <View testID="notification-unread-dot" accessibilityElementsHidden className="h-1.5 w-1.5 rounded-full bg-gold" />}
          <Text className="text-[12px] text-muted">{formatNotificationTime(item.createdAt)}</Text>
        </View>
      </View>
      {thumbnail ? <Image source={{uri: thumbnail}} accessibilityIgnoresInvertColors className="h-11 w-11 rounded-md bg-card" />
        : followBack ? <FollowBackButton userId={display.actorId!} viewerId={viewerId} />
          : action ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${action}: ${item.title}`} onPress={onPress} hitSlop={6}
              className="h-8 items-center justify-center rounded-lg bg-card px-3.5 active:opacity-70">
              <Text className="text-[13px] font-semibold text-foreground">{action}</Text>
            </Pressable>
          ) : null}
      {/* Divider inset evenly from both edges. */}
      <View className="absolute bottom-0 left-4 right-4 h-px bg-border/60" />
    </Pressable>
  );
}

/** "Follow back" for a USER_FOLLOWED notification; flips to "Following" through the shared follow store. */
function FollowBackButton({userId, viewerId}: {userId: string; viewerId: string | null | undefined}) {
  const known = useIsFollowing(userId, viewerId, !!viewerId && viewerId !== userId);
  const {following, pending, toggle} = useFollowToggle(userId, {following: known});
  if (!viewerId || viewerId === userId || known === null) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={following ? 'Following' : 'Follow back'} accessibilityState={{busy: pending, disabled: pending}}
      disabled={pending} onPress={toggle} hitSlop={6}
      className={`h-8 items-center justify-center rounded-lg px-3.5 active:opacity-70 ${following ? 'bg-card' : 'bg-gold'} ${pending ? 'opacity-60' : ''}`}>
      <Text className={`text-[13px] font-semibold ${following ? 'text-foreground' : 'text-gold-ink'}`}>{following ? 'Following' : 'Follow back'}</Text>
    </Pressable>
  );
}
