import React, {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, Easing, Image, StatusBar, Text, View} from 'react-native';

type Props = {ready: boolean; onFinish: () => void};

export default function SplashScreen({ready, onFinish}: Props) {
  const reveal = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  useEffect(() => {
    let mounted = true;
    let animation: Animated.CompositeAnimation | undefined;
    const timer = setTimeout(() => setMinimumElapsed(true), 1600);
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!mounted) return;
      if (reduced) {reveal.setValue(1); return;}
      Animated.timing(reveal, {toValue: 1, duration: 750, easing: Easing.out(Easing.cubic), useNativeDriver: true}).start();
      animation = Animated.loop(Animated.sequence([
        Animated.timing(pulse, {toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true}),
      ]));
      animation.start();
    }).catch(() => reveal.setValue(1));
    return () => {mounted = false; clearTimeout(timer); animation?.stop(); reveal.stopAnimation();};
  }, [pulse, reveal]);
  useEffect(() => {
    if (!ready || !minimumElapsed) return;
    const animation = Animated.timing(opacity, {toValue: 0, duration: 240, useNativeDriver: true});
    animation.start(({finished}) => {if (finished) onFinish();});
    return () => animation.stop();
  }, [minimumElapsed, onFinish, opacity, ready]);
  return (
    <Animated.View accessibilityLabel="Hiva Chat is starting" accessibilityViewIsModal className="absolute inset-0 items-center justify-center bg-background" style={{opacity}}>
      <StatusBar barStyle="light-content" />
      <View className="h-64 w-64 items-center justify-center">
        <Animated.View className="absolute h-52 w-52 rounded-full border border-primary/20 bg-primary-dark/30" style={{opacity: pulse.interpolate({inputRange: [0, 1], outputRange: [0.25, 0.7]}), transform: [{scale: pulse.interpolate({inputRange: [0, 1], outputRange: [0.88, 1.1]})}]}} />
        <Animated.View style={{opacity: reveal, transform: [{scale: reveal.interpolate({inputRange: [0, 1], outputRange: [0.75, 1]})}, {translateY: reveal.interpolate({inputRange: [0, 1], outputRange: [16, 0]})}]}}>
          <Image source={require('../../assets/images/logo.png')} className="h-28 w-28 rounded-[28px]" resizeMode="contain" />
        </Animated.View>
      </View>
      <Animated.View className="-mt-7 items-center" style={{opacity: reveal, transform: [{translateY: reveal.interpolate({inputRange: [0, 1], outputRange: [14, 0]})}]}}>
        <Text className="text-[32px] font-bold tracking-[-1px] text-foreground">Hiva Chat</Text>
        <Text className="mt-2 text-[14px] text-muted">Your people. Your vibe.</Text>
      </Animated.View>
    </Animated.View>
  );
}
