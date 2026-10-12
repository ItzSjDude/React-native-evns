import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {LinearGradient, Rect, Stop} from 'react-native-svg';
import {cssInterop} from 'nativewind';
import {Images} from '../../Constants/Images';
import {statusCodes} from '@react-native-google-signin/google-signin';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useAppDispatch} from '../../core/store/hooks';
import {setSession, signInWithGoogle} from '../../features/auth';
import type {AuthStackParamList} from '../../Navigation/StackNavigation';
import {Colors} from '../../Constants/Colors';
import Typography from '../../Constants/Typography';
import LegalLinks from './LegalLinks';

type LoginProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;

type GoogleSignInError = {
  code?: string;
  message?: string;
};

const AnimatedRect = Animated.createAnimatedComponent(Rect);

cssInterop(Svg, {className: 'style'});
cssInterop(SafeAreaView, {className: 'style'});

const Login = (_props: LoginProps) => {
  const dispatch = useAppDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const borderProgress = useRef(new Animated.Value(0)).current;
  const [buttonSize, setButtonSize] = useState({width: 0, height: 0});

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(borderProgress, {
        toValue: 1,
        duration: 4600,
        easing: Easing.linear,
        useNativeDriver: false,
        isInteraction: false,
      }),
    );

    animation.start();
    return () => animation.stop();
  }, [borderProgress]);

  const radius = Math.min(26, Math.max((buttonSize.height - 4) / 2, 1));
  const pathWidth = Math.max(buttonSize.width - 4, 1);
  const pathHeight = Math.max(buttonSize.height - 4, 1);
  const perimeter =
    2 * (pathWidth + pathHeight - 2 * radius) + 2 * Math.PI * radius;
  const borderOffset = borderProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -perimeter],
  });

 const handleGoogleLogin = async (): Promise<void> => {
  if (isLoading) return;

  setIsLoading(true);
  setErrorMessage('');

  try {
    const session = await signInWithGoogle();
    if (!session) return;

    
    // Redux state drives MainNavigation from AuthStack to the authenticated tabs.
    dispatch(setSession(session));

    // New user → onboarding
    if (session.isNewUser) {
      console.log('[Auth] New user → onboarding');

      // Example:
      // navigation.navigate('Onboarding');
    } else {
      console.log('[Auth] Existing user → home');

      // Example:
      // navigation.navigate('Home');
    }
  } catch (error) {
    console.error('[Auth] sign-in failed:', error);

    const errorCode = (error as GoogleSignInError).code;

    if (errorCode === statusCodes.SIGN_IN_CANCELLED) {
      return;
    }

    if (errorCode === statusCodes.IN_PROGRESS) {
      console.log('Signing in');

      setErrorMessage(
        'Google sign-in is already in progress.',
      );

      return;
    }

    if (errorCode === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      console.log('Play services are not available');

      setErrorMessage(
        'Google Play Services are not available on this device.',
      );

      return;
    }

    if (errorCode === 'NULL_PRESENTER') {
      setErrorMessage('Google sign-in is not ready yet. Please try again.');
      return;
    }

    const message =
      error instanceof Error
        ? error.message
        : error &&
            typeof error === 'object' &&
            'message' in error
          ? String(error.message)
          : 'Unable to sign in. Please try again.';

    setErrorMessage(message);
  } finally {
    setIsLoading(false);
  }
};

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="flex-1 px-5">
        <View className="flex-1 items-center pt-[50%]">
          <Image source={Images.logo} className="mb-[6px] h-[95px] w-[95px]" resizeMode="contain" />
          <Typography size={44} color={Colors.textNavy} fontWeight="500" className="mt-[15px] tracking-[-1px]">HivaChat</Typography>
        </View>

        <View className="w-full pb-[34px]">
          <Pressable
            accessibilityRole="button"
            onLayout={({nativeEvent}) => setButtonSize(nativeEvent.layout)}
            className="h-[52px] w-full flex-row items-center justify-center rounded-[34px] bg-white shadow-lg shadow-shadow active:opacity-70"
            onPress={handleGoogleLogin}
            disabled={isLoading}>
            <Svg pointerEvents="none" className="absolute inset-0">
              <LinearGradient
                id="googleBorderHighlight"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%">
                <Stop offset="0%" stopColor={Colors.googleBorder} />
                <Stop offset="42%" stopColor={Colors.googleBorderMid} />
                <Stop offset="62%" stopColor={Colors.googleBorderBlue} />
                <Stop offset="100%" stopColor={Colors.googleBorderBlue} />
              </LinearGradient>
              <Rect
                x="3"
                y="3"
                width={pathWidth}
                height={pathHeight}
                rx={radius}
                fill="none"
                stroke={Colors.googleBorder}
                strokeWidth="2"
              />
              <AnimatedRect
                x="3"
                y="3"
                width={pathWidth}
                height={pathHeight}
                rx={radius}
                fill="none"
                stroke="url(#googleBorderHighlight)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={[perimeter * 0.24, perimeter * 0.76]}
                strokeDashoffset={borderOffset}
              />
            </Svg>
            <Typography size={18} color={Colors.textDark} fontWeight="600">{isLoading ? 'Signing in…' : 'Continue with'}</Typography>
            <Image
              source={Images.googleLogo}
              className="ml-[14px] h-[22px] w-[22px]"
              resizeMode="contain"
            />
          </Pressable>
          {!!errorMessage && <Typography size={14} color={Colors.coral} textAlign="center" className="mt-[14px]">{errorMessage}</Typography>}
          <LegalLinks className="mt-[18px]" />

        </View>
      </View>
    </SafeAreaView>
  );
};

export default Login;
