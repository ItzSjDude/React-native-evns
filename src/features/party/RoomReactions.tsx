import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import IconMoodSpark from '@tabler/icons-react-native/IconMoodSpark';
import IconX from '@tabler/icons-react-native/IconX';
import { PartyColors } from './partyPresentation';

const QUICK_EMOJIS = ['👏', '❤️', '😂', '🔥'] as const;

/** Reaction picker opener; lives in the composer row so reactions sit with the other room controls. */
export const ReactionToggle = memo(({ open, disabled, onPress }: { open: boolean; disabled?: boolean; onPress: () => void }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={open ? 'Close emoji picker' : 'Open quick emoji reactions'}
    accessibilityState={{ expanded: open, disabled: !!disabled }}
    disabled={disabled}
    onPress={onPress}
    className={`h-12 w-12 items-center justify-center rounded-full border active:opacity-70 ${open ? 'border-border bg-card' : 'border-primary/40 bg-primary-dark'} ${disabled ? 'opacity-50' : ''}`}
  >
    {open ? <IconX size={18} color={PartyColors.text} /> : <IconMoodSpark size={21} color={PartyColors.accent} />}
  </Pressable>
));

/** Horizontal row of quick reactions shown just above the composer. */
export const ReactionRow = memo(({ onPick }: { onPick: (emoji: string) => void }) => (
  <View className="flex-row items-center justify-center gap-3 px-4 pb-2 pt-1">
    {QUICK_EMOJIS.map(emoji => (
      <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={`Send ${emoji}`} onPress={() => onPick(emoji)}
        className="h-12 w-12 items-center justify-center rounded-full border border-border bg-card active:opacity-70">
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
      </Pressable>
    ))}
  </View>
));
