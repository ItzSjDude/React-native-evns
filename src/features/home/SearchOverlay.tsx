import React, {useEffect, useMemo, useRef, useState} from 'react';
import {FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, TextInput, View, useWindowDimensions} from 'react-native';
import type {HostInstance} from 'react-native';
import Animated, {Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Colors} from '../../Constants/Colors';
import AppIcon from '../../Constants/Icons';
import Typography from '../../Constants/Typography';
import type {HomePost} from './types';

const AnimatedView = Animated.View;

export type SearchTriggerLayout = {x: number; y: number; width: number; height: number};

type SearchOverlayProps = {
  posts: HomePost[];
  triggerLayout: SearchTriggerLayout | null;
  onSelectPost: (post: HomePost) => void;
  onClosed: () => void;
};

type OverlayLayout = {x: number; y: number};

const SearchOverlay = ({posts, triggerLayout, onSelectPost, onClosed}: SearchOverlayProps) => {
  const insets = useSafeAreaInsets();
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const overlayRef = useRef<HostInstance>(null);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [query, setQuery] = useState('');
  const [closing, setClosing] = useState(false);
  const [overlayLayout, setOverlayLayout] = useState<OverlayLayout | null>(null);
  const progress = useSharedValue(0);
  const resultsProgress = useSharedValue(0);

  const finalTop = insets.top + 12;
  const finalWidth = windowWidth - 40;
  const sourceLeft = triggerLayout && overlayLayout ? triggerLayout.x - overlayLayout.x : 20;
  const sourceTop = triggerLayout && overlayLayout ? triggerLayout.y - overlayLayout.y : finalTop;
  const sourceWidth = triggerLayout?.width ?? 34;
  const sourceHeight = triggerLayout?.height ?? 34;
  const iconSize = 24;
  const homeIconLeft = sourceLeft + (sourceWidth - iconSize) / 2;
  const homeIconTop = sourceTop + (sourceHeight - iconSize) / 2;
  const inputIconLeft = 20 + finalWidth - 10 - iconSize;
  const inputIconTop = finalTop + (52 - iconSize) / 2;

  useEffect(() => {
    progress.value = withTiming(1, {duration: 260, easing: Easing.out(Easing.cubic)});
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 240);
    requestAnimationFrame(() => overlayRef.current?.measureInWindow((x, y) => setOverlayLayout({x, y})));
    return () => clearTimeout(focusTimer);
  }, [progress]);

  useEffect(() => {
    resultsProgress.value = withTiming(query.trim() ? 1 : 0, {duration: 180, easing: Easing.out(Easing.cubic)});
  }, [query, resultsProgress]);

  const close = () => {
    if (closing) return;
    setClosing(true);
    Keyboard.dismiss();
    inputRef.current?.blur();
    progress.value = withTiming(0, {duration: 210, easing: Easing.in(Easing.cubic)}, finished => {if (finished) runOnJS(onClosed)();});
  };

  const selectPost = (post: HomePost) => {
    if (closing) return;
    setClosing(true);
    Keyboard.dismiss();
    inputRef.current?.blur();
    progress.value = withTiming(0, {duration: 180, easing: Easing.in(Easing.cubic)}, finished => {if (finished) runOnJS(onSelectPost)(post);});
  };

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return posts.filter(post => `${post.author} ${post.content}`.toLowerCase().includes(normalized));
  }, [posts, query]);

  const backdropStyle = useAnimatedStyle(() => ({opacity: interpolate(progress.value, [0, 1], [0, 0.42])}));
  const searchStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.9, 1]),
    left: interpolate(progress.value, [0, 1], [sourceLeft, 20]),
    top: interpolate(progress.value, [0, 1], [sourceTop, finalTop]),
    width: interpolate(progress.value, [0, 1], [sourceWidth, finalWidth]),
    height: interpolate(progress.value, [0, 1], [sourceHeight, 52]),
  }));
  const searchContentStyle = useAnimatedStyle(() => ({opacity: progress.value}));
  const searchIconStyle = useAnimatedStyle(() => ({
    left: interpolate(progress.value, [0, 1], [homeIconLeft, inputIconLeft]),
    top: interpolate(progress.value, [0, 1], [homeIconTop, inputIconTop]),
    opacity: 1,
  }));
  const resultsStyle = useAnimatedStyle(() => ({opacity: resultsProgress.value, transform: [{translateY: interpolate(resultsProgress.value, [0, 1], [8, 0])}]}));

  return (
    <View ref={overlayRef} className="absolute inset-0" pointerEvents="box-none">
      <AnimatedView pointerEvents="none" className="absolute inset-0 bg-background" style={backdropStyle} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <AnimatedView className="absolute z-[2] flex-row items-center overflow-hidden rounded-[18px] border border-primary-border bg-card px-[10px]" style={searchStyle}>
          <AnimatedView className="flex-1 flex-row items-center" style={searchContentStyle}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close search" onPress={close} className="w-[34px] rotate-180 items-center justify-center"><AppIcon name="chevron" size={23} color={Colors.text} /></Pressable>
            <TextInput ref={inputRef} accessibilityLabel="Search posts" value={query} onChangeText={setQuery} placeholder="Search posts" placeholderTextColor={Colors.muted} returnKeyType="search" autoCorrect={false} className="flex-1 px-[8px] pr-[36px] text-[16px] text-foreground" />
          </AnimatedView>
          {query.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} className="w-[28px] items-center"><Typography size={18} color={Colors.muted}>×</Typography></Pressable> : null}
        </AnimatedView>

        <AnimatedView pointerEvents="none" className="absolute z-[3]" style={searchIconStyle}><AppIcon name="search" size={iconSize} /></AnimatedView>

        {query.trim() ? <AnimatedView className="absolute left-[20px] right-[20px] overflow-hidden rounded-[18px] border border-border bg-card px-[14px]" style={[{top: finalTop + 62, height: Math.min(windowHeight * 0.5, Math.max(0, windowHeight - insets.top - 86))}, resultsStyle]}>
          <FlatList data={results} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerClassName="pb-[120px]" renderItem={({item}) => (
            <Pressable accessibilityRole="button" accessibilityLabel={`Open post by ${item.author}`}
            onPress={() => selectPost(item)}
            className="min-h-[68px] flex-row items-center border-b border-border py-[10px]">
              <View className="h-[38px] w-[38px] items-center justify-center rounded-full bg-[#453E60]"><Typography size={15} color={Colors.text} fontWeight="700">{item.author.slice(0, 1).toUpperCase()}</Typography></View>
              <View className="mx-[11px] flex-1"><Typography size={15} color={Colors.text} fontWeight="700" numsOfLine={1}>{item.author}</Typography><Typography size={13} color={Colors.textBody} numsOfLine={2}>{item.content}</Typography></View>
              <AppIcon name="chevron" size={18} color={Colors.muted} />
            </Pressable>
          )} ListEmptyComponent={<Typography size={14} color={Colors.muted} className="pt-[24px] text-center">No posts found.</Typography>} />
        </AnimatedView> : null}
      </KeyboardAvoidingView>
    </View>
  );
};

export default SearchOverlay;
