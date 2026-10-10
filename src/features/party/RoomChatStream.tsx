import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Pressable, ScrollView, Text, View } from 'react-native';
import IconMoodSpark from '@tabler/icons-react-native/IconMoodSpark';
import IconX from '@tabler/icons-react-native/IconX';
import { PartyColors } from './partyPresentation';
import type { PartyChatMessage } from './partyService';

const QUICK_EMOJIS = ['👏', '❤️', '😂', '🔥'] as const;

const Message = ({ message, mine, reduced, onPress }: { message: PartyChatMessage; mine: boolean; reduced: boolean; onPress?: () => void }) => {
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
        onPress={onPress}
        className="mb-1.5 min-h-8 flex-row items-center gap-2"
        style={{ maxWidth: '70%' }}
      >
        <View className={`h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ${mine ? 'border border-border bg-card' : 'bg-primary-dark'}`}>
          {message.avatarUrl ? (
            <Image source={{ uri: message.avatarUrl }} className="h-full w-full rounded-full" />
          ) : (
            <Text className={`text-[10px] font-bold ${mine ? 'text-muted' : 'text-primary'}`}>
              {(message.name || '?').trim().slice(0, 2).toUpperCase()}
            </Text>
          )}
        </View>
        <Text className="min-w-0 flex-1 text-sm leading-5 text-foreground">
          <Text className={`font-semibold ${mine ? 'text-muted' : 'text-primary'}`}>{mine ? 'You' : message.name}{'  '}</Text>
          {message.body}
        </Text>
      </Pressable>
    </Animated.View>
  );
};

export default function RoomChatStream({ messages, identity, onMessagePress, onEmojiPress }: {
  messages: PartyChatMessage[];
  identity: string;
  onMessagePress?: (message: PartyChatMessage) => void;
  onEmojiPress?: (emoji: string) => void;
}) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const atBottom = useRef(true);
  const [unread, setUnread] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // One Animated.Value per emoji, stored in a ref so they're stable across renders.
  const emojiAnims = useRef(QUICK_EMOJIS.map(() => new Animated.Value(0))).current;

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

  const jump = () => {
    atBottom.current = true;
    setUnread(false);
    scroll.current?.scrollToEnd({ animated: !reduced });
  };

  const toggleEmoji = useCallback(() => {
    const opening = !emojiOpen;
    setEmojiOpen(opening);
    if (opening) {
      // Stagger from bottom emoji upward (reverse order so bottom animates first)
      Animated.stagger(
        55,
        [...emojiAnims].reverse().map(anim =>
          Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }),
        ),
      ).start();
    } else {
      Animated.parallel(
        emojiAnims.map(anim =>
          Animated.timing(anim, { toValue: 0, duration: 110, useNativeDriver: true }),
        ),
      ).start();
    }
  }, [emojiOpen, emojiAnims]);

  const handleEmoji = useCallback((emoji: string) => {
    onEmojiPress?.(emoji);
    setEmojiOpen(false);
    Animated.parallel(
      emojiAnims.map(anim =>
        Animated.timing(anim, { toValue: 0, duration: 100, useNativeDriver: true }),
      ),
    ).start();
  }, [emojiAnims, onEmojiPress]);

  return (
    <View className="min-h-[100px] flex-1 px-5">
      <View className="flex-1 overflow-hidden">
        <ScrollView
          ref={scroll}
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
        >
          {!messages.length && <Text className="pb-4 text-sm leading-5 text-muted">You're in. Say hello to the room 👋</Text>}
          {messages.map(message => (
            <Message
              key={message.id}
              message={message}
              mine={message.userId === identity}
              reduced={reduced}
              onPress={() => onMessagePress?.(message)}
            />
          ))}
        </ScrollView>
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

      {/* Floating emoji picker — positioned absolute in the outer container */}
      <View pointerEvents="box-none" className="absolute bottom-2 right-3 items-center gap-2">
        {QUICK_EMOJIS.map((emoji, i) => (
          <Animated.View
            key={emoji}
            pointerEvents={emojiOpen ? 'auto' : 'none'}
            style={{
              opacity: emojiAnims[i],
              transform: [{
                translateY: emojiAnims[i].interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
              }],
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Send ${emoji}`}
              onPress={() => handleEmoji(emoji)}
              className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card active:opacity-70"
            >
              <Text style={{ fontSize: 20 }}>{emoji}</Text>
            </Pressable>
          </Animated.View>
        ))}

        {/* Toggle button: closed → IconMoodSpark (primary-dark), open → IconX (card/grey like input) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={emojiOpen ? 'Close emoji picker' : 'Open quick emoji reactions'}
          onPress={toggleEmoji}
          className={`h-10 w-10 items-center justify-center rounded-full border active:opacity-70 ${
            emojiOpen
              ? 'bg-card border-border'
              : 'bg-primary-dark border-primary/40'
          }`}
        >
          {emojiOpen
            ? <IconX size={18} color={PartyColors.text} />
            : <IconMoodSpark size={20} color={PartyColors.accent} />}
        </Pressable>
      </View>
    </View>
  );
}
