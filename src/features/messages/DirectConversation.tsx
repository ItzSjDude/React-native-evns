import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {SLIDE_MODAL_ANIMATION} from '../../Constants/NavigationTransitions';
import {
  ActivityIndicator, FlatList, Image, Keyboard, KeyboardAvoidingView,
  Modal, Platform, Pressable, Text, TextInput, View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconArrowLeft from '@tabler/icons-react-native/IconArrowLeft';
import IconSend2 from '@tabler/icons-react-native/IconSend2';
import IconPhone from '@tabler/icons-react-native/IconPhone';
import IconVideo from '@tabler/icons-react-native/IconVideo';
import IconDots from '@tabler/icons-react-native/IconDots';
import {Colors} from '../../Constants/Colors';
import BottomSheet, {SheetRow, SheetSection} from '../../components/BottomSheet';
import {showDialog} from '../../components/Dialog';
import {reportUser} from '../users/usersService';
import {UserProfileModal, useViewerId} from '../users';
import {isOwnMessage, messageText} from './conversationPresentation';
import {getDirectMessages, sendDirectMessage, type DirectMessage} from './directService';
import {loadCachedMessages, saveCachedMessages} from './messageCache';
import {markConversationRead} from './messagesService';
import {applyRealtimeToMessages, createTypingThrottle, isMessageEvent, mergeMessages, TYPING_VISIBLE_MS} from './realtimeEvents';
import type {ConversationKind, MessagesRealtimeEvent} from './types';
import {useMessagesRealtime} from './useMessagesRealtime';
import {usePresence} from './presence';

type Props = {
  conversationId: string;
  contactId: string;
  contactName: string;
  contactAvatarUrl: string | null;
  onClose: () => void;
  /** EVENT threads decide ownership by sender role instead of contact id. */
  kind?: ConversationKind;
  backLabel?: string;
  /** REST polling interval, used only while the realtime socket is unavailable. */
  pollIntervalMs?: number;
  /** Reports the newest message so a list can preview it. */
  onLatestMessage?: (message: DirectMessage) => void;
};

/** Live messages are not fetched over REST, so mark the thread read shortly after they land. */
const MARK_READ_DELAY_MS = 1500;

const timeOf = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
};

const DirectConversation = ({
  conversationId, contactId, contactName, contactAvatarUrl, onClose,
  kind = 'DIRECT', backLabel = 'Back to nearby', pollIntervalMs = 12000, onLatestMessage,
}: Props) => {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const viewerId = useViewerId();
  const presence = usePresence(kind === 'DIRECT' && contactId ? [contactId] : []);
  const listRef = useRef<FlatList<DirectMessage>>(null);
  const latestRef = useRef(onLatestMessage);
  latestRef.current = onLatestMessage;
  const conversationRef = useRef(conversationId);
  conversationRef.current = conversationId;
  const viewerRef = useRef(viewerId);
  viewerRef.current = viewerId;
  const messageOwner = useRef<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const readTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (latest) latestRef.current?.(latest);
  }, [messages]);

  useEffect(() => {
    if (viewerId && messageOwner.current === `${viewerId}:${conversationId}` && messages.length) saveCachedMessages(viewerId, conversationId, messages);
  }, [conversationId, messages, viewerId]);

  useEffect(() => () => { clearTimeout(typingTimer.current); clearTimeout(readTimer.current); }, []);

  const loadMessages = useCallback(async () => {
    setError(null);
    const cached = viewerId ? await loadCachedMessages(viewerId, conversationId) : [];
    if (conversationRef.current !== conversationId || viewerRef.current !== viewerId) return;
    if (cached.length) { messageOwner.current = `${viewerId}:${conversationId}`; setMessages(cached); setLoading(false); }
    else setLoading(true);
    try {
      const page = await getDirectMessages(conversationId);
      if (conversationRef.current !== conversationId || viewerRef.current !== viewerId) return;
      messageOwner.current = viewerId ? `${viewerId}:${conversationId}` : null;
      setMessages(page.data.slice().reverse());
    } catch (cause) {
      setError((cause as {message?: string})?.message ?? 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  }, [conversationId, viewerId]);

  /** Quiet REST catch-up: fallback polling, socket (re)connects and seq gaps. */
  const refresh = useCallback(async () => {
    try {
      const page = await getDirectMessages(conversationId);
      if (conversationRef.current !== conversationId || viewerRef.current !== viewerId) return;
      messageOwner.current = viewerId ? `${viewerId}:${conversationId}` : null;
      setMessages(current => mergeMessages(current, page.data));
    } catch { /* The next poll, reconnect or a manual retry can catch up. */ }
  }, [conversationId, viewerId]);

  const showTyping = () => {
    clearTimeout(typingTimer.current);
    setTyping(true);
    typingTimer.current = setTimeout(() => setTyping(false), TYPING_VISIBLE_MS);
  };

  const hideTyping = () => {
    clearTimeout(typingTimer.current);
    setTyping(false);
  };

  const onRealtimeEvent = (event: MessagesRealtimeEvent) => {
    if (event.type === 'typing') {
      if (event.conversationId === conversationId) showTyping();
      return;
    }
    if (!isMessageEvent(event) || event.conversationId !== conversationId) return;
    setMessages(current => applyRealtimeToMessages(current, event));
    if (event.type !== 'message.created' || isOwnMessage(event.message, kind, contactId)) return;
    hideTyping();
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => { markConversationRead(conversationId).catch(() => {}); }, MARK_READ_DELAY_MS);
  };

  const {connected, sendTyping} = useMessagesRealtime(true, {onEvent: onRealtimeEvent, onResync: refresh});
  const typingThrottle = useMemo(() => createTypingThrottle(sendTyping), [sendTyping]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  useEffect(() => {
    if (connected) return;
    const timer = setInterval(refresh, pollIntervalMs);
    return () => clearInterval(timer);
  }, [connected, pollIntervalMs, refresh]);

  const changeDraft = (text: string) => {
    setDraft(text);
    if (text.trim()) typingThrottle(conversationId);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendDirectMessage(conversationId, body);
      // The socket may already have delivered this row; merge so it is never duplicated.
      setMessages(current => mergeMessages(current, [message]));
      setDraft('');
    } catch (cause) {
      setError((cause as {message?: string})?.message ?? 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  const close = () => { Keyboard.dismiss(); onClose(); };
  const reportSpam = () => showDialog('Report spam?', `Report ${contactName} for spam or scam?`, [
    {text: 'Cancel', style: 'cancel'},
    {text: 'Report', style: 'destructive', onPress: () => reportUser(contactId, 'Spam or scam')
      .then(() => showDialog('Report sent', 'Thanks for helping keep Hiva safe.'))
      .catch(() => showDialog('Could not send report', 'Please try again.'))},
  ]);

  return (
    <Modal visible animationType={SLIDE_MODAL_ANIMATION} onRequestClose={close}>
      <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
          <View className="h-[68px] flex-row items-center gap-3 border-b border-border px-4">
            <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={close} className="h-11 w-11 items-center justify-center rounded-full active:bg-card">
              <IconArrowLeft size={24} color={Colors.text} />
            </Pressable>
            {contactAvatarUrl ? <Image source={{uri: contactAvatarUrl}} className="h-10 w-10 rounded-full" /> : (
              <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-dark">
                <Text className="text-sm font-bold text-foreground">{contactName.slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <View className="min-w-0 flex-1">
              <Text className="text-[17px] font-semibold text-foreground" numberOfLines={1}>{contactName}</Text>
              {kind === 'DIRECT' && presence[contactId] && <Text className="text-xs text-muted">{presence[contactId].online ? 'Active now' : presence[contactId].lastSeenAt ? 'Offline' : ''}</Text>}
            </View>
            {kind === 'DIRECT' && <>
              <Pressable accessibilityRole="button" accessibilityLabel="Audio call" onPress={() => showDialog('Calls unavailable', 'Audio calling is not available yet.')} className="h-10 w-10 items-center justify-center"><IconPhone size={20} color={Colors.iconStrong} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Video call" onPress={() => showDialog('Calls unavailable', 'Video calling is not available yet.')} className="h-10 w-10 items-center justify-center"><IconVideo size={20} color={Colors.iconStrong} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Chat options" onPress={() => setMenuOpen(true)} className="h-10 w-8 items-center justify-center"><IconDots size={21} color={Colors.iconStrong} /></Pressable>
            </>}
          </View>

          {loading ? <View className="flex-1 items-center justify-center"><ActivityIndicator color={Colors.gold} /></View> : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={item => item.id}
              renderItem={({item}) => {
                const mine = isOwnMessage(item, kind, contactId);
                const body = messageText(item);
                return (
                  <View className={`mb-4 max-w-[82%] ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
                    <View className={`rounded-[18px] px-4 py-3 ${mine ? 'rounded-br-[5px] bg-gold' : 'rounded-bl-[5px] bg-card'}`}>
                      <Text className={`text-[15px] leading-[21px] ${mine ? 'text-text-dark' : 'text-foreground'}`}>{body}</Text>
                    </View>
                    <Text className="mt-1 px-1 text-[11px] text-muted">{timeOf(item.created_at)}</Text>
                  </View>
                );
              }}
              ListFooterComponent={typing ? <View testID="typing-indicator" className="mb-4 max-w-[82%] self-start rounded-[18px] rounded-bl-[5px] bg-card px-4 py-3"><Text className="text-sm text-muted">{contactName} is typing…</Text></View> : undefined}
              contentContainerClassName="flex-grow justify-end px-5 pb-3 pt-5"
              onContentSizeChange={() => listRef.current?.scrollToEnd({animated: false})}
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={<View className="flex-1 items-center justify-center px-8"><Text className="text-center text-base font-semibold text-foreground">Say hello to {contactName}</Text><Text className="mt-2 text-center text-sm text-muted">Your conversation starts here.</Text></View>}
            />
          )}

          {error && <Pressable onPress={loadMessages} className="px-5 py-2" accessibilityRole="button" accessibilityLabel="Retry loading messages"><Text className="text-center text-sm text-coral">{error} Tap to retry.</Text></Pressable>}
          <View className="flex-row items-end gap-3 border-t border-border px-4 py-3">
            <TextInput
              accessibilityLabel={`Message ${contactName}`}
              className="max-h-[120px] min-h-[44px] flex-1 rounded-[22px] bg-card px-4 py-2 text-[15px] text-foreground"
              placeholder="Write a message"
              placeholderTextColor={Colors.muted}
              value={draft}
              onChangeText={changeDraft}
              multiline
              textAlignVertical="center"
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={!draft.trim() || sending} onPress={send} className={`h-11 w-11 items-center justify-center rounded-full bg-gold ${draft.trim() && !sending ? 'active:opacity-70' : 'opacity-40'}`}>
              {sending ? <ActivityIndicator color={Colors.textDark} size="small" /> : <IconSend2 size={21} color={Colors.textDark} />}
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="Chat options">
        <SheetSection>
          <SheetRow label="User info" onPress={() => {setMenuOpen(false); setInfoOpen(true);}} />
          <SheetRow label="Report spam or scam" onPress={() => {setMenuOpen(false); reportSpam();}} />
        </SheetSection>
      </BottomSheet>
      {infoOpen && kind === 'DIRECT' && <UserProfileModal
        userId={contactId}
        initial={{name: contactName, avatarUrl: contactAvatarUrl}}
        visible
        onClose={() => setInfoOpen(false)}
      />}
    </Modal>
  );
};

export default DirectConversation;
