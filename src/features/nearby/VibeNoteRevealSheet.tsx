import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import Animated, {FadeInDown} from 'react-native-reanimated';
import IconSparkles from '@tabler/icons-react-native/IconSparkles';
import BottomSheet from '../../components/BottomSheet';
import {Colors} from '../../Constants/Colors';
import type {ApiError} from '../../core/api/apiClient';
import {getDeviceLocation} from './deviceLocation';
import {updateMyLocationFromFix} from './nearbyService';
import {openVibeNote} from './vibeNoteService';
import type {VibeNote} from './vibeNoteTypes';

function failureMessage(error: unknown) {
  const apiError = error as Partial<ApiError>;
  if (apiError.code === 'VIBE_NOTE_OUT_OF_RANGE' || apiError.status === 403) return 'This vibe is no longer close enough to reveal.';
  if (apiError.code === 'VIBE_NOTE_ENDED' || apiError.status === 410) return 'This vibe has ended.';
  if (apiError.code === 'VIBE_NOTE_NOT_FOUND' || apiError.status === 400 || apiError.status === 404) return 'This vibe is no longer available.';
  return 'We couldn’t reveal this vibe. Check your connection and try again.';
}

function canRetry(error: unknown) {
  const apiError = error as Partial<ApiError>;
  return !['VIBE_NOTE_OUT_OF_RANGE', 'VIBE_NOTE_ENDED', 'VIBE_NOTE_NOT_FOUND'].includes(apiError.code ?? '') && ![400, 403, 404, 410].includes(apiError.status ?? 0);
}

export default function VibeNoteRevealSheet({noteId, onClose}: {noteId: string | null; onClose: () => void}) {
  const [note, setNote] = useState<VibeNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!noteId) return;
    let active = true;
    setNote(null);
    setError(null);
    setRetryable(false);
    setLoading(true);
    (async () => {
      const fix = await getDeviceLocation(false);
      if (!fix) throw new Error('Turn on location access to check whether this vibe is still nearby.');
      await updateMyLocationFromFix(fix);
      return openVibeNote(noteId);
    })().then(result => {
      if (active) {
        if (result?.isUnlocked && result.body) setNote(result);
        else setError('This vibe is no longer close enough to reveal.');
      }
    }).catch(cause => {if (active) {setError(failureMessage(cause)); setRetryable(canRetry(cause));}})
      .finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [attempt, noteId]);

  return <BottomSheet visible={!!noteId} onClose={onClose} title="A vibe just landed nearby ✨" subtitle="A little note from someone nearby.">
    {loading ? <View accessibilityRole="progressbar" accessibilityLabel="Revealing vibe" className="items-center py-10"><ActivityIndicator color={Colors.primary} /></View>
      : note ? <Animated.View entering={FadeInDown.duration(360)} className="mb-3 rounded-2xl bg-card px-5 py-6">
        <View className="mb-4 h-11 w-11 items-center justify-center rounded-full bg-primary-dark"><IconSparkles size={22} color={Colors.primary} /></View>
        <Text accessibilityRole="header" className="text-[20px] font-bold text-foreground">{note.creator.name}</Text>
        <Text className="mt-3 text-[17px] leading-7 text-foreground">{note.body}</Text>
      </Animated.View>
      : <View className="items-center px-2 py-7">
        <Text accessibilityRole="alert" className="text-center text-[14px] leading-5 text-muted">{error}</Text>
        {!!error && retryable &&
          <Pressable accessibilityRole="button" accessibilityLabel="Retry revealing vibe" onPress={() => setAttempt(value => value + 1)} className="mt-4 min-h-11 justify-center rounded-full bg-primary-dark px-5">
            <Text className="text-[14px] font-semibold text-primary">Try again</Text>
          </Pressable>}
      </View>}
  </BottomSheet>;
}
