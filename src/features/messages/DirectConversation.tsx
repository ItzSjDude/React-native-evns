import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator, FlatList, Image, Keyboard, KeyboardAvoidingView,
  Modal, Platform, Pressable, Text, TextInput, View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconArrowLeft from '@tabler/icons-react-native/IconArrowLeft';
import IconSend2 from '@tabler/icons-react-native/IconSend2';
import {Colors} from '../../Constants/Colors';
import {isOwnMessage, messageText} from './conversationPresentation';
import {getDirectMessages, sendDirectMessage, type DirectMessage} from './directService';
import {markConversationRead} from './messagesService';
import {applyRealtimeToMessages, createTypingThrottle, isMessageEvent, mergeMessages, TYPING_VISIBLE_MS} from './realtimeEvents';
import type {ConversationKind, MessagesRealtimeEvent} from './types';
import {useMessagesRealtime} from './useMessagesRealtime';

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
  const listRef = useRef<FlatList<DirectMessage>>(null);
  const latestRef = useRef(onLatestMessage);
  latestRef.current = onLatestMessage;
  const conversationRef = useRef(conversationId);
  conversationRef.current = conversationId;
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const readTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (latest) latestRef.current?.(latest);
  }, [messages]);

  useEffect(() => () => { clearTimeout(typingTimer.current); clearTimeout(readTimer.current); }, []);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await getDirectMessages(conversationId);
      if (conversationRef.current !== conversationId) return;
      setMessages(page.data.slice().reverse());
    } catch (cause) {
      setError((cause as {message?: string})?.message ?? 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  /** Quiet REST catch-up: fallback polling, socket (re)connects and seq gaps. */
  const refresh = useCallback(async () => {
    try {
      const page = await getDirectMessages(conversationId);
      if (conversationRef.current !== conversationId) return;
      setMessages(current => mergeMessages(current, page.data));
    } catch { /* The next poll, reconnect or a manual retry can catch up. */ }
  }, [conversationId]);

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

  return (
    <Modal visible animationType="slide" onRequestClose={close}>
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
              {typing && <Text testID="typing-indicator" className="text-xs text-primary">typing…</Text>}
            </View>
          </View>

          {loading ? <View className="flex-1 items-center justify-center"><ActivityIndicator color={Colors.primary} /></View> : (
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
    </Modal>
  );
};

export default DirectConversation;
