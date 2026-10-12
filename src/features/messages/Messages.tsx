import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIsFocused} from '@react-navigation/native';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconSearch from '@tabler/icons-react-native/IconSearch';

import {showDialog} from '../../components/Dialog';
import {Colors} from '../../Constants/Colors';
import {isPlusRequired, openPaywall, refreshSubscription, usePlus} from '../plus';
import DirectConversation from './DirectConversation';
import {isConversation} from './conversationPresentation';
import {cancelFollowUp, getFollowUps, scheduleFollowUp, type FollowUps, type ReminderOption} from './followUpReminders';
import {FolderManagerSheet, InboxActionsSheet} from './InboxSheets';
import {ConversationRow, InboxChips, PartyRow, RequestRow, VIEWS} from './InboxRows';
import {getFolders, getInbox, INBOX_MAX_PAGE_SIZE, INBOX_PAGE_SIZE, MAX_PINS, updateConversationState, updatePartyState} from './inboxService';
import {markConversationRead} from './messagesService';
import {applyRealtimeToConversations, isMessageEvent} from './realtimeEvents';
import type {ApiMessage, Conversation, InboxFolder, InboxItem, InboxQuery, MessagesRealtimeEvent, PartyChat} from './types';
import {useMessagesRealtime} from './useMessagesRealtime';

const messageOf = (error: unknown) => (error as {message?: string})?.message ?? 'Could not load conversations.';
/** `last_message_at` is stamped just after the message row, so allow a small gap before calling a cached preview stale. */
const PREVIEW_STALE_AFTER_MS = 5000;
const ALL: InboxQuery = {view: 'all'};

type LoadMode = 'initial' | 'refresh' | 'silent' | 'more';

const itemKey = (item: InboxItem) => `${item.type ?? 'CONVERSATION'}:${item.id}`;
const itemTitle = (item: InboxItem) => item.type === 'PARTY_REQUEST' ? item.partyTitle : item.title;
const itemSearchText = (item: InboxItem, preview?: string | null) =>
  `${itemTitle(item)} ${item.type === 'PARTY_REQUEST' ? item.requesterName : ''} ${preview ?? ''}`.toLowerCase();

const EMPTY: Record<string, [string, string]> = {
  all: ['No conversations yet', 'Say hi to someone from Nearby.'],
  unread: ['You are all caught up', 'Chats with new messages show up here.'],
  requests: ['No seat requests', 'When someone asks for a seat in a party room you host, it shows up here.'],
  events: ['No event chats', 'Chats with event organisers show up here.'],
  parties: ['No party chats', 'Party rooms you join or are invited to show up here.'],
  archived: ['Nothing archived', 'Archived chats are tucked away here. New messages still reach you.'],
  folder: ['This folder is empty', 'Use "Move to folder" on a chat to add it here.'],
};

export type MessagesProps = {
  /**
   * Opens a party room (join/resume preview). Injected by the navigation layer because the party feature
   * depends on messages. Returns false when nothing could handle it.
   */
  onOpenParty?: (partyId: string) => boolean;
};

const Messages = ({onOpenParty}: MessagesProps) => {
  const isFocused = useIsFocused();
  const plus = usePlus();
  const plusOffered = plus.status !== 'unavailable';
  const [query, setQuery] = useState<InboxQuery>(ALL);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [folders, setFolders] = useState<InboxFolder[]>([]);
  const [reminders, setReminders] = useState<FollowUps>({});
  const [previews, setPreviews] = useState<Record<string, ApiMessage>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Conversation | null>(null);
  const [target, setTarget] = useState<InboxItem | null>(null);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const queryRef = useRef(query);
  const request = useRef(0);
  const loaded = useRef(false);
  const state = useRef({count: 0, nextOffset: 0, hasMore: false, loadingMore: false});
  state.current.count = items.length;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const openIdRef = useRef<string | null>(null);
  openIdRef.current = open?.id ?? null;

  /** A stale subscription answers 403 PLUS_REQUIRED: re-check the plan and offer the paywall. Reading and replying never do this. */
  const onPlusRequired = useCallback((cause: unknown) => {
    if (!isPlusRequired(cause)) return false;
    refreshSubscription().catch(() => {});
    openPaywall('inbox');
    return true;
  }, []);

  const load = useCallback(async (mode: LoadMode) => {
    const current = queryRef.current;
    if (mode === 'more') {
      const {hasMore: more, loadingMore: busy, nextOffset} = state.current;
      if (!more || busy) return;
      state.current.loadingMore = true;
      setLoadingMore(true);
      const id = request.current;
      try {
        const page = await getInbox(current, nextOffset);
        if (id !== request.current) return;
        setItems(existing => {
          const seen = new Set(existing.map(itemKey));
          return [...existing, ...page.items.filter(item => !seen.has(itemKey(item)))];
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
    const limit = Math.min(INBOX_MAX_PAGE_SIZE, Math.max(INBOX_PAGE_SIZE, state.current.count));
    try {
      const page = await getInbox(current, 0, limit);
      if (id !== request.current) return;
      loaded.current = true;
      setItems(page.items);
      state.current.nextOffset = page.nextOffset;
      state.current.hasMore = page.hasMore;
      setHasMore(page.hasMore);
    } catch (cause) {
      if (id !== request.current) return;
      // A lapsed member still on a folder view: offer the paywall and fall back to All.
      if (current.view === 'folder' && onPlusRequired(cause)) { selectViewRef.current(ALL); return; }
      setError(messageOf(cause));
    } finally {
      if (id === request.current) { setLoading(false); setRefreshing(false); }
    }
  }, [onPlusRequired]);

  const selectView = (next: InboxQuery) => {
    const current = queryRef.current;
    if (next.view === current.view && next.folderId === current.folderId) return;
    queryRef.current = next;
    setQuery(next);
    request.current += 1;
    state.current = {count: 0, nextOffset: 0, hasMore: false, loadingMore: false};
    setItems([]);
    setHasMore(false);
    setLoadingMore(false);
    load('initial');
  };
  const selectViewRef = useRef(selectView);
  selectViewRef.current = selectView;

  useEffect(() => {
    if (isFocused) load(loaded.current ? 'silent' : 'initial');
  }, [isFocused, load]);

  useEffect(() => {
    if (isFocused) getFollowUps().then(setReminders).catch(() => {});
  }, [isFocused]);

  // Folders are Plus only; a free account never asks for them.
  useEffect(() => {
    if (!plus.isPlus) { setFolders([]); return; }
    if (isFocused) getFolders().then(setFolders).catch(onPlusRequired);
  }, [isFocused, plus.isPlus, onPlusRequired]);

  const onRealtimeEvent = (event: MessagesRealtimeEvent) => {
    if (!isMessageEvent(event)) return;
    const {view} = queryRef.current;
    // These views hold only party rows, which chat events never touch.
    if (view === 'requests' || view === 'parties') return;
    if (event.type === 'message.created' && !itemsRef.current.some(item => isConversation(item) && item.id === event.conversationId)) {
      load('silent');
      return;
    }
    setItems(current => applyRealtimeToConversations(current, event, openIdRef.current).conversations);
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

  const forgetReminder = (id: string) => {
    if (!reminders[id]) return;
    setReminders(current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
    cancelFollowUp(id).catch(() => {});
  };

  const openConversation = (conversation: Conversation) => {
    setOpen(conversation);
    setItems(current => current.map(item => isConversation(item) && item.id === conversation.id ? {...item, unreadCount: 0} : item));
    // Fetching messages also marks the thread read server-side; this explicit call clears it even if that fetch fails.
    markConversationRead(conversation.id).catch(() => {});
    forgetReminder(conversation.id);
  };

  const closeConversation = () => {
    setOpen(null);
    load('silent');
  };

  /** Party chats and seat requests open the room itself, like a party notification does. */
  const openRoom = (partyId: string) => {
    if (!onOpenParty?.(partyId)) showDialog('Room not available', 'Could not open this party room. Please try again.');
  };

  const openParty = (party: PartyChat) => {
    openRoom(party.id);
    forgetReminder(party.id);
    if (party.unreadCount > 0) {
      setItems(current => current.map(item => item.type === 'PARTY' && item.id === party.id ? {...item, unreadCount: 0} : item));
      updatePartyState(party.id, {read: true}).catch(() => {});
    }
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

  /** Applies an optimistic change, then the request; on failure restores the list like profile settings do. */
  const mutate = async (apply: (list: InboxItem[]) => InboxItem[], send: () => Promise<unknown>, failure: string, {reconcile = false, pinning = false} = {}) => {
    const previous = itemsRef.current;
    setItems(apply);
    try {
      await send();
      if (reconcile) load('silent');
    } catch (cause) {
      setItems(previous);
      if (onPlusRequired(cause)) return;
      const conflict = (cause as {status?: number})?.status === 409;
      showDialog(failure, pinning && conflict ? `You can pin up to ${MAX_PINS} chats. Unpin one to pin another.` : (cause as {message?: string})?.message ?? 'Please try again.');
    }
  };
  const patchConversation = (id: string, patch: Partial<Conversation>) => (list: InboxItem[]) =>
    list.map(item => isConversation(item) && item.id === id ? {...item, ...patch} : item);
  const without = (id: string) => (list: InboxItem[]) => list.filter(item => item.id !== id);

  const pin = (conversation: Conversation) => {
    setTarget(null);
    const pinned = !conversation.pinned;
    if (pinned && !plus.isPlus) { openPaywall('inbox'); return; }
    mutate(list => {
      const updated = patchConversation(conversation.id, {pinned})(list);
      const moved = updated.find(item => item.id === conversation.id);
      return pinned && moved ? [moved, ...updated.filter(item => item !== moved)] : updated;
    }, () => updateConversationState(conversation.id, {pinned}), pinned ? 'Could not pin' : 'Could not unpin', {reconcile: true, pinning: pinned});
  };

  const moveToFolder = (conversation: Conversation, folderId: string | null) => {
    setTarget(null);
    const folder = folders.find(item => item.id === folderId);
    const leaves = queryRef.current.view === 'folder' && queryRef.current.folderId !== folderId;
    mutate(leaves ? without(conversation.id) : patchConversation(conversation.id, {folderId, folderName: folder?.name ?? null}),
      () => updateConversationState(conversation.id, {folderId}), 'Could not move chat');
  };

  const archive = (item: Conversation | PartyChat) => {
    setTarget(null);
    const archived = !item.archived;
    mutate(without(item.id), () => item.type === 'PARTY' ? updatePartyState(item.id, {archived}) : updateConversationState(item.id, {archived}),
      archived ? 'Could not archive' : 'Could not unarchive');
  };

  const markPartyRead = (party: PartyChat) => {
    setTarget(null);
    const read = party.unreadCount > 0;
    mutate(list => list.map(item => item.type === 'PARTY' && item.id === party.id ? {...item, unreadCount: read ? 0 : 1} : item),
      () => updatePartyState(party.id, {read}), 'Could not update chat', {reconcile: !read});
  };

  const remind = async (item: Conversation | PartyChat, option: ReminderOption) => {
    setTarget(null);
    try {
      const followUp = await scheduleFollowUp(item.id, item.title, option);
      if (!followUp) { showDialog('Notifications are off', 'Allow notifications for Hiva in your phone settings to get follow-up reminders.'); return; }
      setReminders(current => ({...current, [item.id]: followUp}));
    } catch {
      showDialog('Reminder not set', 'We could not schedule that reminder. Please try again.');
    }
  };

  const openFolders = () => { if (plus.isPlus) setFoldersOpen(true); else openPaywall('inbox'); };

  const text = search.trim().toLowerCase();
  const filtered = useMemo(() => !text ? items : items.filter(item =>
    itemSearchText(item, isConversation(item) ? (previews[item.id] ?? item.lastMessage)?.body : item.type === 'PARTY' ? item.preview : null).includes(text),
  ), [items, previews, text]);

  const [emptyTitle, emptyHint] = EMPTY[query.view];
  const emptyState = () => {
    if (loading) return <View className="items-center pt-20"><ActivityIndicator color={Colors.gold} /></View>;
    if (error && !items.length) {
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
    if (text && items.length) {
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
        <Text className="mt-4 text-center text-base font-semibold text-foreground">{emptyTitle}</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-muted">{emptyHint}</Text>
      </View>
    );
  };

  const targetConversation = target && isConversation(target) ? target : null;
  const targetChat = targetConversation ?? (target?.type === 'PARTY' ? target : null);
  const sectionLabel = query.view === 'all' ? 'Recent' : query.view === 'folder'
    ? folders.find(folder => folder.id === query.folderId)?.name ?? 'Folder'
    : VIEWS.find(({view}) => view === query.view)?.label ?? 'Recent';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-3">
        {/* Same size and position as the Home header. */}
        <View className="h-11 justify-center"><Text accessibilityRole="header" className="font-display-semibold text-[27px] tracking-[-0.8px] text-foreground">Messages</Text></View>
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
        <InboxChips query={query} folders={folders} showFolders={plusOffered} foldersLocked={!plus.isPlus} onSelect={selectView} onFolders={openFolders} />
        <Text className="mt-5 text-xs font-semibold uppercase tracking-[1.5px] text-muted">{sectionLabel}</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={itemKey}
        renderItem={({item}) => {
          if (item.type === 'PARTY') return <PartyRow party={item} reminder={!!reminders[item.id]} onPress={() => openParty(item)} onMenu={() => setTarget(item)} />;
          if (item.type === 'PARTY_REQUEST') return <RequestRow request={item} onPress={() => openRoom(item.partyId)} />;
          return <ConversationRow conversation={item} latest={latestFor(item)} reminder={!!reminders[item.id]} onPress={() => openConversation(item)} onMenu={() => setTarget(item)} />;
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="flex-grow px-5 pb-[115px]"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={Colors.gold} colors={[Colors.gold]} progressBackgroundColor={Colors.card} />}
        onEndReached={() => { if (hasMore && !loading && !text) load('more'); }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={error && items.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Retry loading conversations" onPress={() => load('refresh')} className="mt-3 rounded-xl bg-card p-3">
            <Text className="text-sm text-coral">{error} Tap to retry.</Text>
          </Pressable>
        ) : undefined}
        ListFooterComponent={loadingMore ? <ActivityIndicator className="my-4" color={Colors.gold} /> : undefined}
        ListEmptyComponent={emptyState()}
      />

      <InboxActionsSheet
        item={target}
        plusOffered={plusOffered}
        isPlus={plus.isPlus}
        folders={folders}
        reminderAt={target ? reminders[target.id]?.at ?? null : null}
        onClose={() => setTarget(null)}
        onPin={() => targetConversation && pin(targetConversation)}
        onFolder={folderId => targetConversation && moveToFolder(targetConversation, folderId)}
        onLocked={() => { setTarget(null); openPaywall('inbox'); }}
        onArchive={() => targetChat && archive(targetChat)}
        onRead={() => target?.type === 'PARTY' && markPartyRead(target)}
        onRemind={option => targetChat && remind(targetChat, option)}
        onCancelReminder={() => { if (target) forgetReminder(target.id); setTarget(null); }}
        onManageFolders={() => { setTarget(null); setFoldersOpen(true); }}
      />
      <FolderManagerSheet
        visible={foldersOpen}
        folders={folders}
        onClose={() => setFoldersOpen(false)}
        onPlusRequired={cause => { const required = onPlusRequired(cause); if (required) setFoldersOpen(false); return required; }}
        onChange={next => {
          setFolders(next);
          if (query.folderId && !next.some(folder => folder.id === query.folderId)) selectView(ALL);
          else load('silent');
        }}
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
