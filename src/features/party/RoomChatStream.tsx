import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, FlatList, Pressable, Text, View } from 'react-native';
import type { PartyChatMessage } from './partyService';
import RemoteImage from '../../components/RemoteImage';

const Message = memo(({ message, mine, reduced, onPress }: { message: PartyChatMessage; mine: boolean; reduced: boolean; onPress?: (message: PartyChatMessage) => void }) => {
  const entrance = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) { entrance.setValue(1); return; }
    const animation = Animated.timing(entrance, { toValue: 1, duration: 220, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [entrance, reduced]);
  return (
    <Animated.View style={{ opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${mine ? 'You' : message.name}: ${message.body}. Message options`}
        accessibilityHint="Opens report or delete options"
        onPress={() => onPress?.(message)}
        hitSlop={{ top: 3, bottom: 3 }}
        className="mb-2 min-h-9 flex-row items-center gap-2 self-start rounded-2xl bg-card/70 py-1.5 pl-1.5 pr-3 dark:bg-card/60"
        style={{ maxWidth: '82%' }}
      >
        <View className={`h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ${mine ? 'border border-border bg-card' : 'bg-primary-dark'}`}>
          {message.avatarUrl ? (
            <RemoteImage uri={message.avatarUrl} fadeDuration={0} className="h-full w-full rounded-full" />
          ) : (
            <Text className={`text-[10px] font-bold ${mine ? 'text-muted' : 'text-primary'}`}>
              {(message.name || '?').trim().slice(0, 2).toUpperCase()}
            </Text>
          )}
        </View>
        <Text className="min-w-0 shrink text-sm leading-5 text-foreground">
          <Text className={`font-semibold ${mine ? 'text-muted' : 'text-primary'}`}>{mine ? 'You' : message.name}{'  '}</Text>
          {message.body}
        </Text>
      </Pressable>
    </Animated.View>
  );
});

export default function RoomChatStream({ messages, identity, onMessagePress }: {
  messages: PartyChatMessage[];
  identity: string;
  onMessagePress?: (message: PartyChatMessage) => void;
}) {
  const scroll = useRef<FlatList<PartyChatMessage>>(null);
  const atBottom = useRef(true);
  const [unread, setUnread] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => listener.remove();
  }, []);

  const prevLastId = useRef<string | null>(null);

  useEffect(() => {
    if (!messages.length) return;
    const last = messages[messages.length - 1];
    if (last.id === prevLastId.current) return;
    prevLastId.current = last.id;

    const isMine = last.userId === identity;
    if (isMine || atBottom.current) {
      atBottom.current = true;
      setUnread(false);
      requestAnimationFrame(() => {
        scroll.current?.scrollToEnd({ animated: !reduced });
      });
    } else {
      setUnread(true);
    }
  }, [messages, identity, reduced]);

  const renderMessage = useCallback(({ item }: { item: PartyChatMessage }) =>
    <Message message={item} mine={item.userId === identity} reduced={reduced} onPress={onMessagePress} />, [identity, reduced, onMessagePress]);

  const jump = () => {
    atBottom.current = true;
    setUnread(false);
    scroll.current?.scrollToEnd({ animated: !reduced });
  };

  return (
    <View className="min-h-[96px] flex-1 px-4">
      <View className="flex-1 overflow-hidden">
        <FlatList
          ref={scroll}
          data={messages}
          keyExtractor={message => message.id}
          renderItem={renderMessage}
          ListEmptyComponent={<Text className="pb-4 text-sm leading-5 text-muted">No messages yet. Say hello to the room 👋</Text>}
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={9}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={100}
          contentContainerClassName="flex-grow justify-end pb-2 pt-2"
          onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
            const distance = contentSize.height - contentOffset.y - layoutMeasurement.height;
            const isNearBottom = distance < 80;
            atBottom.current = isNearBottom;
            if (isNearBottom) setUnread(false);
          }}
          onContentSizeChange={() => {
            if (atBottom.current) scroll.current?.scrollToEnd({ animated: !reduced });
          }}
        />
        {unread && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scroll to new messages"
            onPress={jump}
            className="absolute bottom-2 min-h-11 self-center justify-center rounded-full bg-gold px-5"
          >
            <Text className="text-sm font-semibold text-text-dark">New messages ↓</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
