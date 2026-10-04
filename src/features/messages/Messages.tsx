import React, {useMemo, useRef, useState} from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconArrowLeft from '@tabler/icons-react-native/IconArrowLeft';
import IconSearch from '@tabler/icons-react-native/IconSearch';
import IconSend2 from '@tabler/icons-react-native/IconSend2';

import {Colors} from '../../Constants/Colors';
import {demoConversations} from './demoConversations';
import type {ChatMessage, Conversation} from './types';

const Avatar = ({conversation, compact = false}: {conversation: Conversation; compact?: boolean}) => (
  <View className={`${compact ? 'h-10 w-10' : 'h-12 w-12'} items-center justify-center rounded-full ${conversation.avatarClassName}`}>
    <Text className="text-sm font-bold text-foreground">{conversation.initials}</Text>
  </View>
);

const ConversationRow = ({conversation, onPress}: {conversation: Conversation; onPress: () => void}) => {
  const latest = conversation.messages[conversation.messages.length - 1];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${conversation.name}`}
      onPress={onPress}
      className="min-h-[76px] flex-row items-center gap-3 border-b border-border py-3 active:opacity-70">
      <Avatar conversation={conversation} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-[16px] font-semibold text-foreground" numberOfLines={1}>{conversation.name}</Text>
          <Text className="text-xs text-muted">{latest?.time}</Text>
        </View>
        <View className="mt-1 flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-sm text-muted" numberOfLines={1}>
            {latest?.sender === 'me' ? 'You: ' : ''}{latest?.text}
          </Text>
          {conversation.unreadCount > 0 && (
            <View className="h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1">
              <Text className="text-[11px] font-bold text-[#10152F]">{conversation.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const MessageBubble = ({message}: {message: ChatMessage}) => {
  const mine = message.sender === 'me';
  return (
    <View className={`mb-4 max-w-[82%] ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
      <View className={`rounded-[18px] px-4 py-3 ${mine ? 'rounded-br-[5px] bg-primary' : 'rounded-bl-[5px] bg-card'}`}>
        <Text className={`text-[15px] leading-[21px] ${mine ? 'text-[#10152F]' : 'text-foreground'}`}>{message.text}</Text>
      </View>
      <Text className="mt-1 px-1 text-[11px] text-muted">{message.time}</Text>
    </View>
  );
};

const Messages = () => {
  const [conversations, setConversations] = useState<Conversation[]>(demoConversations);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const messageList = useRef<FlatList<ChatMessage>>(null);
  const filtered = useMemo(
    () => conversations.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase())),
    [conversations, search],
  );
  const selected = conversations.find(item => item.id === selectedId);

  const openConversation = (id: string) => {
    setConversations(current => current.map(item => item.id === id ? {...item, unreadCount: 0} : item));
    setSelectedId(id);
  };

  const closeConversation = () => {
    Keyboard.dismiss();
    setDraft('');
    setSelectedId(null);
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || !selectedId) return;
    const message: ChatMessage = {
      id: String(Date.now()),
      sender: 'me',
      text,
      time: new Date().toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'}),
    };
    setConversations(current => {
      const conversation = current.find(item => item.id === selectedId);
      if (!conversation) return current;
      return [
        {...conversation, messages: [...conversation.messages, message], unreadCount: 0},
        ...current.filter(item => item.id !== selectedId),
      ];
    });
    setDraft('');
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
        renderItem={({item}) => <ConversationRow conversation={item} onPress={() => openConversation(item.id)} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-[115px]"
        ListEmptyComponent={
          <View className="items-center pt-20">
            <Text className="text-base font-semibold text-foreground">No conversations found</Text>
            <Text className="mt-2 text-sm text-muted">Try another name.</Text>
          </View>
        }
      />

      <Modal visible={!!selected} animationType="slide" onRequestClose={closeConversation}>
        <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
            {selected && (
              <>
                <View className="h-[70px] flex-row items-center gap-3 border-b border-border px-4">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back to messages"
                    className="h-11 w-11 items-center justify-center rounded-full active:bg-card"
                    onPress={closeConversation}>
                    <IconArrowLeft size={24} color={Colors.text} strokeWidth={2} />
                  </Pressable>
                  <Avatar conversation={selected} compact />
                  <View className="min-w-0 flex-1">
                    <Text className="text-[16px] font-semibold text-foreground" numberOfLines={1}>{selected.name}</Text>
                    <Text className="mt-0.5 text-xs text-muted">Demo conversation</Text>
                  </View>
                </View>

                <FlatList
                  ref={messageList}
                  data={selected.messages}
                  keyExtractor={item => item.id}
                  renderItem={({item}) => <MessageBubble message={item} />}
                  contentContainerClassName="px-5 pb-4 pt-5"
                  keyboardDismissMode="interactive"
                  onContentSizeChange={() => messageList.current?.scrollToEnd({animated: false})}
                  showsVerticalScrollIndicator={false}
                />

                <View className="flex-row items-end gap-3 border-t border-border bg-background px-4 py-3">
                  <TextInput
                    accessibilityLabel={`Message ${selected.name}`}
                    className="max-h-[120px] min-h-[44px] flex-1 rounded-[22px] bg-card px-4 py-2 text-[15px] text-foreground"
                    placeholder="Write a message"
                    placeholderTextColor={Colors.muted}
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    textAlignVertical="center"
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Send message"
                    accessibilityState={{disabled: !draft.trim()}}
                    disabled={!draft.trim()}
                    onPress={sendMessage}
                    className={`h-11 w-11 items-center justify-center rounded-full bg-primary ${draft.trim() ? 'active:opacity-70' : 'opacity-40'}`}>
                    <IconSend2 size={21} color={Colors.textDark} strokeWidth={2} />
                  </Pressable>
                </View>
              </>
            )}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

export default Messages;
