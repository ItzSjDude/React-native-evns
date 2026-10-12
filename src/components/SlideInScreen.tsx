import React, {useEffect, useState} from 'react';
import {AccessibilityInfo, Modal, useWindowDimensions} from 'react-native';
import Animated, {Easing, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';

const DURATION = 260;
const EASE = Easing.bezier(0.2, 0.9, 0.3, 1);

type SlideInScreenProps = {
  visible: boolean;
  /** Hardware back / swipe-back request. */
  onRequestClose: () => void;
  onShow?: () => void;
  children: React.ReactNode;
};

/** Full-screen page that pushes in from the right (and back out) like a navigation screen, instead of a Modal's bottom slide. */
export default function SlideInScreen({visible, onRequestClose, onShow, children}: SlideInScreenProps) {
  const {width} = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [reduced, setReduced] = useState(false);
  const offset = useSharedValue(width);
  const slideStyle = useAnimatedStyle(() => ({transform: [{translateX: offset.value}]}));

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => listener.remove();
  }, []);

  useEffect(() => {
    const duration = reduced ? 0 : DURATION;
    if (visible) {
      setMounted(true);
      offset.value = withTiming(0, {duration, easing: EASE});
      return;
    }
    offset.value = withTiming(width, {duration, easing: EASE});
    const timer = setTimeout(() => setMounted(false), duration);
    return () => clearTimeout(timer);
  }, [offset, reduced, visible, width]);

  if (!mounted) return null;
  return <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onRequestClose} onShow={onShow}>
    <Animated.View style={slideStyle} className="flex-1">{children}</Animated.View>
  </Modal>;
}
