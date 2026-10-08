import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, FlatList, Image, Pressable, RefreshControl, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIsFocused} from '@react-navigation/native';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconSearch from '@tabler/icons-react-native/IconSearch';

import {Colors} from '../../Constants/Colors';
import DirectConversation from './DirectConversation';
import {initialsOf, isOwnMessage, messageText, relativeTime} from './conversationPresentation';
import {CONVERSATIONS_PAGE_SIZE, getConversations, markConversationRead} from './messagesService';
import {applyRealtimeToConversations, isMessageEvent} from './realtimeEvents';
import type {ApiMessage, Conversation, MessagesRealtimeEvent} from './types';
import {useMessagesRealtime} from './useMessagesRealtime';

const messageOf = (error: unknown) => (error as {message?: string})?.message ?? 'Could not load conversations.';
const MAX_PAGE_SIZE = 100;
/** `last_message_at` is stamped just after the message row, so allow a small gap before calling a cached preview stale. */
const PREVIEW_STALE_AFTER_MS = 5000;

type LoadMode = 'initial' | 'refresh' | 'silent' | 'more';

const Avatar = ({conversation}: {conversation: Conversation}) => conversation.avatarUrl
  ? <Image source={{uri: conversation.avatarUrl}} className="h-12 w-12 rounded-full" />
  : (
    <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-dark">
      <Text className="text-sm font-bold text-foreground">{initialsOf(conversation.title)}</Text>
    </View>
  );

const previewOf = (conversation: Conversation, latest: ApiMessage | null) => {
  if (latest) {
    const prefix = isOwnMessage(latest, conversation.kind, conversation.contactId) ? 'You: ' : '';
    return prefix + messageText(latest);
  }
  if (conversation.unreadCount > 0) return `${conversation.unreadCount} new ${conversation.unreadCount === 1 ? 'message' : 'messages'}`;
  return conversation.lastMessageAt ? 'Tap to open the conversation' : 'No messages yet';
};

const ConversationRow = ({conversation, latest, onPress}: {conversation: Conversation; latest: ApiMessage | null; onPress: () => void}) => {
  const unread = conversation.unreadCount;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${conversation.title}${unread ? `, ${unread} unread` : ''}`}
      onPress={onPress}
      className="min-h-[76px] flex-row items-center gap-3 border-b border-border py-3 active:opacity-70">
      <Avatar conversation={conversation} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-[16px] font-semibold text-foreground" numberOfLines={1}>{conversation.title}</Text>
          <Text className={`text-xs ${unread ? 'text-primary' : 'text-muted'}`}>{relativeTime(conversation.lastActivityAt)}</Text>
        </View>
        <View className="mt-1 flex-row items-center justify-between gap-3">
          <Text className={`flex-1 text-sm ${unread ? 'font-semibold text-foreground' : 'text-muted'}`} numberOfLines={1}>{previewOf(conversation, latest)}</Text>
          {unread > 0 && (
            <View testID={`unread-${conversation.id}`} className="h-5 min-w-[20px] items-center justify-center rounded-full bg-gold px-1">
              <Text className="text-[11px] font-bold text-text-dark">{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const Messages = () => {
  const isFocused = useIsFocused();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [previews, setPreviews] = useState<Record<string, ApiMessage>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Conversation | null>(null);
  const request = useRef(0);
  const loaded = useRef(false);
  const state = useRef({count: 0, nextOffset: 0, hasMore: false, loadingMore: false});
  state.current.count = conversations.length;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const openIdRef = useRef<string | null>(null);
  openIdRef.current = open?.id ?? null;

  const load = useCallback(async (mode: LoadMode) => {
    if (mode === 'more') {
      const {hasMore: more, loadingMore: busy, nextOffset} = state.current;
      if (!more || busy) return;
      state.current.loadingMore = true;
      setLoadingMore(true);
      const id = request.current;
      try {
        const page = await getConversations(nextOffset);
        if (id !== request.current) return;
        setConversations(current => {
          const seen = new Set(current.map(item => item.id));
          return [...current, ...page.conversations.filter(item => !seen.has(item.id))];
        });
        state.current.nextOffset = page.nextOffset;
        state.current.hasMore = page.hasMore;
        setHasMore(page.hasMore);
      } catch (cause) {
        if (id === request.current) setError(messageOf(cause));
      } finally {
        state.current.loadingMore = false;
        setLoadingMore(false);
      }
      return;
    }

    const id = ++request.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    // Keep already-loaded pages visible when refreshing so the list does not collapse.
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(CONVERSATIONS_PAGE_SIZE, state.current.count));
    try {
      const page = await getConversations(0, limit);
      if (id !== request.current) return;
      loaded.current = true;
      setConversations(page.conversations);
      state.current.nextOffset = page.nextOffset;
      state.current.hasMore = page.hasMore;
      setHasMore(page.hasMore);
    } catch (cause) {
      if (id === request.current) setError(messageOf(cause));
    } finally {
      if (id === request.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    if (isFocused) load(loaded.current ? 'silent' : 'initial');
  }, [isFocused, load]);

  const onRealtimeEvent = (event: MessagesRealtimeEvent) => {
    if (!isMessageEvent(event)) return;
    if (event.type === 'message.created' && !conversationsRef.current.some(item => item.id === event.conversationId)) {
      load('silent');
      return;
    }
    setConversations(current => applyRealtimeToConversations(current, event, openIdRef.current).conversations);
    if (event.type !== 'message.created') {
      const {conversationId, message} = event;
      setPreviews(current => current[conversationId]?.id === message.id
        ? {...current, [conversationId]: {...current[conversationId], ...message}}
        : current);
    }
  };

  // Live while the tab is on screen or a thread opened from it is showing; otherwise the focus reload covers it.
  useMessagesRealtime(isFocused || open !== null, {
    onEvent: onRealtimeEvent,
    onResync: () => { if (loaded.current) load('silent'); },
  });

  const openConversation = (conversation: Conversation) => {
    setOpen(conversation);
    setConversations(current => current.map(item => item.id === conversation.id ? {...item, unreadCount: 0} : item));
    // Fetching messages also marks the thread read server-side; this explicit call clears it even if that fetch fails.
    markConversationRead(conversation.id).catch(() => {});
  };

  const closeConversation = () => {
    setOpen(null);
    load('silent');
  };

  const rememberLatest = useCallback((conversationId: string, message: ApiMessage) => {
    setPreviews(current => current[conversationId]?.id === message.id ? current : {...current, [conversationId]: message});
  }, []);

  const latestFor = (conversation: Conversation) => {
    const cached = previews[conversation.id];
    const server = conversation.lastMessage;
    if (!cached || (server && server.created_at >= cached.created_at)) return server;
    // A message seen while the thread was open is stale once the list reports later activity.
    const activity = conversation.lastMessageAt ? new Date(conversation.lastMessageAt).getTime() : 0;
    return activity - new Date(cached.created_at).getTime() > PREVIEW_STALE_AFTER_MS ? server : cached;
  };

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => !query ? conversations : conversations.filter(item =>
    item.title.toLowerCase().includes(query) ||
    (previews[item.id] ?? item.lastMessage)?.body?.toLowerCase().includes(query),
  ), [conversations, previews, query]);

  const emptyState = () => {
    if (loading) return <View className="items-center pt-20"><ActivityIndicator color={Colors.primary} /></View>;
    if (error && !conversations.length) {
      return (
        <View className="items-center px-6 pt-20">
          <Text className="text-center text-base font-semibold text-foreground">Couldn't load conversations</Text>
          <Text className="mt-2 text-center text-sm text-muted">{error}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry loading conversations" onPress={() => load('initial')} className="mt-5 h-11 items-center justify-center rounded-full bg-gold px-6 active:opacity-70">
            <Text className="text-sm font-bold text-text-dark">Try again</Text>
          </Pressable>
        </View>
      );
    }
    if (query && conversations.length) {
      return (
        <View className="items-center pt-20">
          <Text className="text-base font-semibold text-foreground">No conversations found</Text>
          <Text className="mt-2 text-sm text-muted">Try another name.</Text>
        </View>
      );
    }
    return (
      <View className="items-center px-6 pt-20">
        <IconMessageCircle size={44} color={Colors.muted} strokeWidth={1.5} />
        <Text className="mt-4 text-center text-base font-semibold text-foreground">No conversations yet</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-muted">Say hi to someone from Nearby.</Text>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-5">
        <Text className="text-[30px] font-bold text-foreground">Messages</Text>
        <Text className="mt-1 text-sm text-muted">Catch up with your people</Text>
        <View className="mt-6 h-12 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4">
          <IconSearch size={20} color={Colors.muted} strokeWidth={2} />
          <TextInput
            accessibilityLabel="Search conversations"
            className="flex-1 text-[15px] text-foreground"
            placeholder="Search messages"
            placeholderTextColor={Colors.muted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        <Text className="mt-7 text-xs font-semibold uppercase tracking-[1.5px] text-muted">Recent</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({item}) => <ConversationRow conversation={item} latest={latestFor(item)} onPress={() => openConversation(item)} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="flex-grow px-5 pb-[115px]"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={Colors.primary} colors={[Colors.primary]} />}
        onEndReached={() => { if (hasMore && !loading && !query) load('more'); }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={error && conversations.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Retry loading conversations" onPress={() => load('refresh')} className="mt-3 rounded-xl bg-card p-3">
            <Text className="text-sm text-coral">{error} Tap to retry.</Text>
          </Pressable>
        ) : undefined}
        ListFooterComponent={loadingMore ? <ActivityIndicator className="my-4" color={Colors.primary} /> : undefined}
        ListEmptyComponent={emptyState()}
      />

      {open && (
        <DirectConversation
          conversationId={open.id}
          contactId={open.contactId ?? ''}
          contactName={open.title}
          contactAvatarUrl={open.avatarUrl}
          kind={open.kind}
          backLabel="Back to messages"
          pollIntervalMs={5000}
          onLatestMessage={message => rememberLatest(open.id, message)}
          onClose={closeConversation}
        />
      )}
    </SafeAreaView>
  );
};

export default Messages;
