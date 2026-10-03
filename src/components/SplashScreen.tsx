import React, {useEffect} from 'react';
import {StatusBar, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

type SplashScreenProps = {
  onFinish: () => void;
};

const AnimatedView = Animated.View;

const SplashLogo = () => (
  <Svg width="72" height="72" viewBox="0 0 64 64">
    <Defs>
      <SvgLinearGradient id="hivaGrad" x1="8" x2="56" y1="8" y2="56" gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor="#34D399" />
        <Stop offset="0.45" stopColor="#A78BFA" />
        <Stop offset="1" stopColor="#EC4899" />
      </SvgLinearGradient>
      <SvgLinearGradient id="waveGrad" x1="0" x2="0" y1="0" y2="32" gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor="#FFFFFF" />
        <Stop offset="1" stopColor="#6EE7B7" />
      </SvgLinearGradient>
    </Defs>
    <Path d="M32 10C20.954 10 12 18.73 12 29.5C12 34.62 14.03 39.29 17.37 42.82C16.92 45.92 15.34 49.33 13.88 51.58C13.52 52.14 14.07 52.82 14.67 52.54C19.24 50.41 23.36 48.06 25.4 46.88C27.5 47.61 29.71 48 32 48C43.046 48 52 39.27 52 28.5C52 17.73 43.046 10 32 10Z" fill="url(#hivaGrad)" fillOpacity="0.18" stroke="url(#hivaGrad)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
    <Rect fill="url(#waveGrad)" height="12" rx="1.5" width="3" x="23" y="24" />
    <Rect fill="#FFFFFF" height="26" rx="1.5" width="3" x="29" y="17" />
    <Rect fill="url(#waveGrad)" height="18" rx="1.5" width="3" x="35" y="21" />
    <Rect fill="#34D399" height="8" rx="1.5" width="3" x="41" y="26" />
    <Circle fill="#10B981" opacity="0.3" cx="45" cy="16" r="5" />
    <Circle fill="#10B981" cx="45" cy="16" r="3" />
  </Svg>
);

const SplashScreen = ({onFinish}: SplashScreenProps) => {
  const {width} = useWindowDimensions();
  const entrance = useSharedValue(0);
  const logoProgress = useSharedValue(0);
  const titleProgress = useSharedValue(0);
  const taglineProgress = useSharedValue(0);
  const equalizerProgress = useSharedValue(0);
  const progress = useSharedValue(0);
  const lightProgress = useSharedValue(0);
  const beamLeft = useSharedValue(0);
  const beamRight = useSharedValue(0);
  const spotlight = useSharedValue(0);
  const orbOne = useSharedValue(0);
  const orbTwo = useSharedValue(0);
  const aura = useSharedValue(0);
  const orbit = useSharedValue(0);
  const sheen = useSharedValue(0);
  const barOne = useSharedValue(0);
  const barTwo = useSharedValue(0);
  const barThree = useSharedValue(0);
  const barFour = useSharedValue(0);
  const barFive = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.bezier(0.16, 1, 0.3, 1);
    entrance.value = withTiming(1, {duration: 1700, easing: ease});
    lightProgress.value = withTiming(1, {duration: 1200, easing: Easing.out(Easing.cubic)});
    logoProgress.value = withDelay(220, withTiming(1, {duration: 900, easing: ease}));
    titleProgress.value = withDelay(650, withTiming(1, {duration: 850, easing: ease}));
    taglineProgress.value = withDelay(950, withTiming(1, {duration: 700, easing: ease}));
    equalizerProgress.value = withDelay(1150, withTiming(1, {duration: 650, easing: ease}));
    progress.value = withTiming(1, {duration: 2600, easing: Easing.bezier(0.65, 0, 0.35, 1)}, finished => {
      if (finished) {
        runOnJS(onFinish)();
      }
    });

    beamLeft.value = withRepeat(withTiming(1, {duration: 7000, easing: Easing.inOut(Easing.cubic)}), -1, false);
    beamRight.value = withDelay(1500, withRepeat(withTiming(1, {duration: 8000, easing: Easing.inOut(Easing.cubic)}), -1, false));
    spotlight.value = withRepeat(withTiming(1, {duration: 9000, easing: Easing.inOut(Easing.cubic)}), -1, true);
    orbOne.value = withRepeat(withTiming(1, {duration: 7500, easing: Easing.inOut(Easing.cubic)}), -1, true);
    orbTwo.value = withDelay(800, withRepeat(withTiming(1, {duration: 6800, easing: Easing.inOut(Easing.cubic)}), -1, true));
    aura.value = withRepeat(withTiming(1, {duration: 6000, easing: Easing.inOut(Easing.cubic)}), -1, true);
    orbit.value = withRepeat(withTiming(1, {duration: 8000, easing: Easing.linear}), -1, false);
    sheen.value = withDelay(1000, withRepeat(withTiming(1, {duration: 5000, easing: Easing.inOut(Easing.cubic)}), -1, false));

    const animateBar = (value: typeof barOne, duration: number, delay = 0) => {
      value.value = withDelay(delay, withRepeat(withSequence(withTiming(1, {duration}), withTiming(0, {duration})), -1, false));
    };
    animateBar(barOne, 550);
    animateBar(barTwo, 425, 150);
    animateBar(barThree, 700, 300);
    animateBar(barFour, 475, 450);
    animateBar(barFive, 625, 200);
  }, [aura, barFive, barFour, barOne, barThree, barTwo, beamLeft, beamRight, entrance, equalizerProgress, lightProgress, logoProgress, onFinish, orbit, orbOne, orbTwo, progress, sheen, spotlight, taglineProgress, titleProgress]);

  const stageStyle = useAnimatedStyle(() => ({
    opacity: interpolate(entrance.value, [0, 0.45, 1], [0, 0.85, 1]),
    transform: [{scale: interpolate(entrance.value, [0, 1], [0.92, 1])}],
  }));
  const lightsStyle = useAnimatedStyle(() => ({opacity: interpolate(lightProgress.value, [0, 1], [0, 1])}));
  const leftBeamStyle = useAnimatedStyle(() => ({
    opacity: interpolate(beamLeft.value, [0, 0.45, 0.75, 1], [0.15, 0.65, 0.35, 0.15]),
    transform: [
      {rotate: `${interpolate(beamLeft.value, [0, 0.45, 0.75, 1], [-35, -18, -6, -35])}deg`},
      {translateY: interpolate(beamLeft.value, [0, 0.45, 0.75, 1], [-25, 0, 15, -25])},
      {scaleX: interpolate(beamLeft.value, [0, 0.45, 0.75, 1], [0.7, 1.15, 0.9, 0.7])},
    ],
  }));
  const rightBeamStyle = useAnimatedStyle(() => ({
    opacity: interpolate(beamRight.value, [0, 0.55, 0.85, 1], [0.2, 0.7, 0.3, 0.2]),
    transform: [
      {rotate: `${interpolate(beamRight.value, [0, 0.55, 0.85, 1], [32, 14, 2, 32])}deg`},
      {translateY: interpolate(beamRight.value, [0, 0.55, 0.85, 1], [-20, 5, 25, -20])},
      {scaleX: interpolate(beamRight.value, [0, 0.55, 0.85, 1], [0.8, 1.2, 0.85, 0.8])},
    ],
  }));
  const spotlightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(spotlight.value, [0, 0.5, 1], [0.4, 0.75, 0.4]),
    transform: [{rotate: `${interpolate(spotlight.value, [0, 0.5, 1], [-25, 25, -25])}deg`}],
  }));
  const firstOrbStyle = useAnimatedStyle(() => ({
    opacity: interpolate(orbOne.value, [0, 0.5, 1], [0.4, 0.85, 0.4]),
    transform: [{translateX: interpolate(orbOne.value, [0, 0.5, 1], [-30, 40, -30])}, {translateY: interpolate(orbOne.value, [0, 0.5, 1], [0, -45, 0])}, {scale: interpolate(orbOne.value, [0, 0.5, 1], [0.9, 1.2, 0.9])}],
  }));
  const secondOrbStyle = useAnimatedStyle(() => ({
    opacity: interpolate(orbTwo.value, [0, 0.5, 1], [0.5, 0.9, 0.5]),
    transform: [{translateX: interpolate(orbTwo.value, [0, 0.5, 1], [35, -45, 35])}, {translateY: interpolate(orbTwo.value, [0, 0.5, 1], [20, -30, 20])}, {scale: interpolate(orbTwo.value, [0, 0.5, 1], [1.1, 0.85, 1.1])}],
  }));
  const auraStyle = useAnimatedStyle(() => ({opacity: interpolate(aura.value, [0, 0.5, 1], [0.45, 0.8, 0.45]), transform: [{scale: interpolate(aura.value, [0, 0.5, 1], [1, 1.15, 1])}]}));
  const orbitStyle = useAnimatedStyle(() => ({transform: [{rotate: `${orbit.value * 360}deg`}]}));
  const sheenStyle = useAnimatedStyle(() => ({opacity: sheen.value < 0.15 ? 0 : sheen.value < 0.55 ? 0.9 : 0, transform: [{translateX: interpolate(sheen.value, [0, 0.25, 0.55, 1], [-160, -40, width + 120, width + 120])}, {rotate: '30deg'}]}));
  const logoStyle = useAnimatedStyle(() => ({opacity: logoProgress.value, transform: [{scale: interpolate(logoProgress.value, [0, 1], [0.7, 1])}]}));
  const titleStyle = useAnimatedStyle(() => ({opacity: titleProgress.value, transform: [{translateY: interpolate(titleProgress.value, [0, 1], [12, 0])}, {scale: interpolate(titleProgress.value, [0, 1], [0.94, 1])}]}));
  const taglineStyle = useAnimatedStyle(() => ({opacity: taglineProgress.value, transform: [{translateY: interpolate(taglineProgress.value, [0, 1], [8, 0])}]}));
  const equalizerStyle = useAnimatedStyle(() => ({opacity: equalizerProgress.value, transform: [{scale: interpolate(equalizerProgress.value, [0, 1], [0.8, 1])}]}));
  const progressStyle = useAnimatedStyle(() => ({width: `${progress.value * 100}%`}));
  const useBarStyle = (bar: typeof barOne) => useAnimatedStyle(() => ({transform: [{scaleY: interpolate(bar.value, [0, 1], [0.25, 1])}]}));
  const barOneStyle = useBarStyle(barOne);
  const barTwoStyle = useBarStyle(barTwo);
  const barThreeStyle = useBarStyle(barThree);
  const barFourStyle = useBarStyle(barFour);
  const barFiveStyle = useBarStyle(barFive);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#0B071A', '#080512', '#040209']} style={styles.viewport}>
        <View style={styles.statusRow}><Animated.Text style={styles.statusText}>9:47</Animated.Text><View style={styles.dynamicIsland} /><View style={styles.statusIcons}><View style={styles.signal}><View style={styles.signalBarOne} /><View style={styles.signalBarTwo} /><View style={styles.signalBarThree} /><View style={styles.signalBarFour} /></View><View style={styles.wifi} /><View style={styles.battery}><View /></View></View></View>

        <AnimatedView pointerEvents="none" style={[styles.lightStage, lightsStyle]}>
          <AnimatedView style={[styles.beamLeft, leftBeamStyle]}><LinearGradient colors={['rgba(167,139,250,0.4)', 'rgba(34,211,238,0.2)', 'transparent']} style={styles.fullBleed} /></AnimatedView>
          <AnimatedView style={[styles.beamRight, rightBeamStyle]}><LinearGradient colors={['rgba(110,231,183,0.35)', 'rgba(139,92,246,0.25)', 'transparent']} style={styles.fullBleed} /></AnimatedView>
          <AnimatedView style={[styles.spotlight, spotlightStyle]}><LinearGradient colors={['rgba(168,85,247,0.35)', 'rgba(52,211,153,0.2)', 'transparent']} style={styles.fullBleed} /></AnimatedView>
          <AnimatedView style={[styles.orbOne, firstOrbStyle]} />
          <AnimatedView style={[styles.orbTwo, secondOrbStyle]} />
          <AnimatedView style={[styles.violetAura, auraStyle]} />
          <AnimatedView style={[styles.cyanAura, auraStyle]} />
          <AnimatedView style={[styles.emeraldAura, auraStyle]} />
          <View style={styles.dotTexture} />
        </AnimatedView>

        <AnimatedView style={[styles.mainContent, stageStyle]}>
          <AnimatedView style={[styles.coreBacklight, auraStyle]} />
          <AnimatedView style={[styles.logoWrap, logoStyle]}>
            <AnimatedView style={[styles.orbitRing, orbitStyle]}><View style={styles.orbitNode} /></AnimatedView>
            <View style={styles.outerRing} />
            <View style={styles.logoDisc}>
              <AnimatedView style={[styles.sheen, sheenStyle]} />
              <View style={styles.logoInner}><SplashLogo /></View>
            </View>
          </AnimatedView>
          <AnimatedView style={titleStyle}><Svg width={Math.min(width - 48, 340)} height="58"><Defs><SvgLinearGradient id="titleGrad" x1="0" x2="1" y1="0" y2="0"><Stop offset="0" stopColor="#FFFFFF" /><Stop offset="0.55" stopColor="#E9D5FF" /><Stop offset="1" stopColor="#A7F3D0" /></SvgLinearGradient></Defs><SvgText x={Math.min(width - 48, 340) / 2} y="44" textAnchor="middle" fill="url(#titleGrad)" fontSize="42" fontWeight="800">Hiva chat</SvgText></Svg></AnimatedView>
          <Animated.Text style={[styles.tagline, taglineStyle]}>VOICE <Text style={styles.greenDot}>•</Text> VIBE <Text style={styles.violetDot}>•</Text> CONNECT</Animated.Text>
          <AnimatedView style={[styles.equalizer, equalizerStyle]}><AnimatedView style={[styles.soundBar, styles.barGreen, barOneStyle]} /><AnimatedView style={[styles.soundBar, styles.barPurple, barTwoStyle]} /><AnimatedView style={[styles.soundBar, styles.barPink, barThreeStyle]} /><AnimatedView style={[styles.soundBar, styles.barCyan, barFourStyle]} /><AnimatedView style={[styles.soundBar, styles.barTeal, barFiveStyle]} /></AnimatedView>
        </AnimatedView>

        <View style={styles.footer}>
          <View style={styles.loadingBlock}><View style={styles.progressTrack}><AnimatedView style={[styles.progressFill, progressStyle]} /></View><Animated.Text style={styles.loadingText}>JOINING ROOM...</Animated.Text></View>
          <View style={styles.secureBadge}><Text style={styles.shield}>✓</Text><Text style={styles.secureText}>Encrypted Audio &amp; Community Lounge</Text></View>
          <View style={styles.footerMeta}><Text style={styles.version}>Build v2.4.0 (PROD)</Text><View style={styles.replay}><Text style={styles.replayIcon}>↻</Text><Text style={styles.replayText}>Replay Effect</Text></View></View>
          <View style={styles.homeIndicator} />
        </View>
      </LinearGradient>
    </View>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#07050F'},
  viewport: {flex: 1, overflow: 'hidden', paddingHorizontal: 24},
  statusRow: {height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 3},
  statusText: {color: 'rgba(221,214,254,0.8)', fontSize: 12, fontWeight: '600'},
  dynamicIsland: {width: 96, height: 16, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)'},
  statusIcons: {flexDirection: 'row', alignItems: 'center', gap: 7},
  signal: {height: 14, flexDirection: 'row', alignItems: 'flex-end', gap: 2},
  signalBarOne: {width: 3, height: 4, backgroundColor: 'rgba(221,214,254,0.9)'},
  signalBarTwo: {width: 3, height: 7, backgroundColor: 'rgba(221,214,254,0.9)'},
  signalBarThree: {width: 3, height: 10, backgroundColor: 'rgba(221,214,254,0.9)'},
  signalBarFour: {width: 3, height: 13, backgroundColor: 'rgba(221,214,254,0.9)'},
  wifi: {width: 14, height: 9, borderTopWidth: 2, borderColor: 'rgba(221,214,254,0.9)', borderRadius: 8},
  battery: {width: 20, height: 11, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(221,214,254,0.9)', padding: 2},
  fullBleed: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0},
  lightStage: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0},
  beamLeft: {position: 'absolute', top: -48, left: -40, width: 240, height: 650, opacity: 0.4},
  beamRight: {position: 'absolute', top: -64, right: -48, width: 260, height: 680, opacity: 0.35},
  spotlight: {position: 'absolute', top: -40, left: '50%', marginLeft: -170, width: 340, height: 600, opacity: 0.4},
  orbOne: {position: 'absolute', top: '28%', left: '18%', width: 176, height: 176, borderRadius: 100, backgroundColor: 'rgba(34,211,238,0.16)'},
  orbTwo: {position: 'absolute', top: '36%', right: '16%', width: 208, height: 208, borderRadius: 110, backgroundColor: 'rgba(139,92,246,0.19)'},
  violetAura: {position: 'absolute', top: '20%', left: '50%', marginLeft: -160, width: 320, height: 320, borderRadius: 170, backgroundColor: 'rgba(124,58,237,0.17)'},
  cyanAura: {position: 'absolute', top: '38%', left: '28%', width: 224, height: 224, borderRadius: 120, backgroundColor: 'rgba(6,182,212,0.14)'},
  emeraldAura: {position: 'absolute', bottom: '28%', right: '20%', width: 256, height: 256, borderRadius: 140, backgroundColor: 'rgba(16,185,129,0.1)'},
  dotTexture: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.07, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(139,92,246,0.12)'},
  mainContent: {flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 2},
  coreBacklight: {position: 'absolute', top: '32%', width: 290, height: 290, borderRadius: 160, backgroundColor: 'rgba(80,216,190,0.13)'},
  logoWrap: {width: 210, height: 170, alignItems: 'center', justifyContent: 'center', marginBottom: 8},
  orbitRing: {position: 'absolute', width: 150, height: 150, borderRadius: 80, borderWidth: 1, borderColor: 'rgba(139,92,246,0.22)', alignItems: 'flex-start', justifyContent: 'flex-start', paddingTop: -5},
  orbitNode: {width: 10, height: 10, borderRadius: 5, backgroundColor: '#34D399', shadowColor: '#34D399', shadowOpacity: 0.9, shadowRadius: 8, elevation: 4},
  outerRing: {position: 'absolute', width: 190, height: 190, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(139,92,246,0.1)'},
  logoDisc: {width: 112, height: 112, borderRadius: 26, borderWidth: 1, borderColor: 'rgba(139,92,246,0.55)', backgroundColor: 'rgba(26,18,56,0.9)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: '#8B5CF6', shadowOpacity: 0.45, shadowRadius: 18, elevation: 9},
  logoInner: {width: 106, height: 106, borderRadius: 22, backgroundColor: 'rgba(11,6,26,0.94)', alignItems: 'center', justifyContent: 'center'},
  sheen: {position: 'absolute', top: -50, left: -30, width: 26, height: 220, backgroundColor: 'rgba(255,255,255,0.35)', zIndex: 2},
  tagline: {color: 'rgba(196,181,253,0.72)', fontSize: 12, letterSpacing: 3, fontWeight: '500', marginTop: -2, marginBottom: 20},
  greenDot: {color: '#34D399'},
  violetDot: {color: '#A78BFA'},
  equalizer: {height: 34, minWidth: 112, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(139,92,246,0.22)', backgroundColor: 'rgba(59,7,100,0.35)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16},
  soundBar: {width: 4, height: 24, borderRadius: 3},
  barGreen: {backgroundColor: '#34D399'},
  barPurple: {backgroundColor: '#A78BFA'},
  barPink: {backgroundColor: '#EC4899'},
  barCyan: {backgroundColor: '#22D3EE'},
  barTeal: {backgroundColor: '#6EE7B7'},
  footer: {zIndex: 3, alignItems: 'center', paddingBottom: 4},
  loadingBlock: {width: 210, alignItems: 'center', gap: 7},
  progressTrack: {height: 5, width: '100%', borderRadius: 4, backgroundColor: 'rgba(59,7,100,0.8)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)', overflow: 'hidden'},
  progressFill: {height: '100%', borderRadius: 4, backgroundColor: '#34D399', shadowColor: '#10B981', shadowOpacity: 0.9, shadowRadius: 8, elevation: 4},
  loadingText: {color: 'rgba(196,181,253,0.6)', fontSize: 11, letterSpacing: 2, fontWeight: '500'},
  secureBadge: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, backgroundColor: 'rgba(6,78,59,0.3)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4},
  shield: {color: '#34D399', fontSize: 12, fontWeight: '700'},
  secureText: {color: 'rgba(52,211,153,0.8)', fontSize: 10, fontWeight: '500'},
  footerMeta: {width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, paddingTop: 9, borderTopWidth: 1, borderTopColor: 'rgba(76,29,149,0.25)'},
  version: {color: 'rgba(167,139,250,0.5)', fontSize: 10},
  replay: {flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6},
  replayIcon: {color: 'rgba(221,214,254,0.65)', fontSize: 16},
  replayText: {color: 'rgba(167,139,250,0.6)', fontSize: 10},
  homeIndicator: {width: 128, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', marginTop: 12},
});
