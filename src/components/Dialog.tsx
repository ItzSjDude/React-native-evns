import React, {useEffect, useState} from 'react';
import {AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View, type AlertButton} from 'react-native';
import Animated, {Easing, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import LottieView from 'lottie-react-native';

// "Cat Sleeping" by LottieFiles creator 9e3461d8, Lottie Simple License (free for commercial use).
const CAT = require('../../assets/animations/sleepy-cat.json');
const DURATION = 220;
const EASE = Easing.bezier(0.2, 0.9, 0.3, 1);

type DialogRequest = {title: string; message?: string; buttons: AlertButton[]};

// Module-level queue so features can call showDialog() like Alert.alert, without a provider or hook.
let queue: DialogRequest[] = [];
let notify: ((next: DialogRequest | undefined) => void) | null = null;

/** Drop-in replacement for Alert.alert, rendered by <DialogHost /> with the app's look. */
export function showDialog(title: string, message?: string, buttons: AlertButton[] = [{text: 'OK'}]) {
  queue = [...queue, {title, message, buttons}];
  if (queue.length === 1) notify?.(queue[0]);
}

const dismiss = () => {
  queue = queue.slice(1);
  notify?.(queue[0]);
};

const buttonClass = (button: AlertButton, hasDestructive: boolean) =>
  button.style === 'cancel' ? ['bg-card', 'text-foreground']
    : button.style === 'destructive' ? ['bg-coral', 'text-text-dark']
      : hasDestructive ? ['bg-primary-dark', 'text-purple-soft'] : ['bg-gold', 'text-text-dark'];

/** Mount once at the app root. Shows queued dialogs one at a time. */
export function DialogHost() {
  const [request, setRequest] = useState<DialogRequest | undefined>(queue[0]);
  const [reduced, setReduced] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    notify = setRequest;
    setRequest(queue[0]);
    return () => {notify = null;};
  }, []);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => listener.remove();
  }, []);

  useEffect(() => {
    progress.value = 0;
    if (request) progress.value = withTiming(1, {duration: reduced ? 0 : DURATION, easing: EASE});
  }, [progress, reduced, request]);

  const cardStyle = useAnimatedStyle(() => ({opacity: progress.value, transform: [{scale: 0.9 + progress.value * 0.1}]}));
  const backdropStyle = useAnimatedStyle(() => ({opacity: progress.value}));

  if (!request) return null;
  const cancel = request.buttons.find(button => button.style === 'cancel');
  // Like the OS alert: a lone OK, or an explicit cancel, can be dismissed by back/backdrop.
  const dismissible = !!cancel || request.buttons.length === 1;
  const press = (button?: AlertButton) => {dismiss(); button?.onPress?.();};
  const close = () => {if (dismissible) press(cancel ?? request.buttons[0]);};
  const hasDestructive = request.buttons.some(button => button.style === 'destructive');
  // Cancel goes last when stacked, first (left) when side by side.
  const ordered = [...request.buttons.filter(button => button !== cancel), ...(cancel ? [cancel] : [])];
  const row = ordered.length === 2;
  if (row) ordered.reverse();

  return <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={close}>
    <View className="flex-1 items-center justify-center px-6">
      <Animated.View pointerEvents="none" style={backdropStyle} className="absolute inset-0 bg-black/70" />
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss dialog" onPress={close} className="absolute inset-0" />
      <Animated.View accessibilityViewIsModal style={cardStyle} className="w-full max-w-[360px] items-center rounded-[28px] border border-border-muted bg-sheet px-5 pb-5">
        <LottieView source={CAT} autoPlay={!reduced} loop style={styles.cat} />
        <Text accessibilityRole="header" className="text-center text-[19px] font-bold tracking-[-0.3px] text-foreground">{request.title}</Text>
        {!!request.message && <Text className="mt-2 text-center text-[14px] leading-5 text-muted">{request.message}</Text>}
        <View className={`mt-5 w-full gap-2 ${row ? 'flex-row' : ''}`}>
          {ordered.map((button, i) => {
            const [surface, text] = buttonClass(button, hasDestructive);
            return <Pressable key={`${button.text}${i}`} accessibilityRole="button" accessibilityLabel={button.text} onPress={() => press(button)}
              className={`min-h-[48px] items-center justify-center rounded-full px-4 active:opacity-80 ${surface} ${row ? 'flex-1' : ''}`}>
              <Text numberOfLines={1} className={`text-[15px] font-bold ${text}`}>{button.text}</Text>
            </Pressable>;
          })}
        </View>
      </Animated.View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({cat: {width: 180, height: 113}});
