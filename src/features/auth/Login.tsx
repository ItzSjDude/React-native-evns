import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {LinearGradient, Rect, Stop} from 'react-native-svg';
import {Images} from '../../Constants/Images';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useAppDispatch} from '../../core/store/hooks';
import {setSession, signInWithGoogle} from '../../features/auth';
import type {AuthStackParamList} from '../../Navigation/StackNavigation';
import {Colors} from '../../Constants/Colors';
import Typography from '../../Constants/Typography';

type LoginProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;

type GoogleSignInError = {
  code?: string;
  message?: string;
};

const waitForUi = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const wait = (milliseconds: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

async function startGoogleSignIn() {
  // React Native can receive the tap before its current Activity has been
  // attached to the React context (especially immediately after launch).
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForUi();

    try {
      await GoogleSignin.hasPlayServices();
      return await GoogleSignin.signIn();
    } catch (error) {
      const code = (error as GoogleSignInError).code;
      if (code !== 'NULL_PRESENTER' || attempt === 2) {
        throw error;
      }

      await wait(150);
    }
  }

  throw new Error('Google sign-in could not start.');
}

GoogleSignin.configure({
  webClientId: '45623280223-d1ldfjkerts5tbpap45iqgnfon06c0sg.apps.googleusercontent.com',
  
});

const AnimatedRect = Animated.createAnimatedComponent(Rect);

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
    const userInfo = await startGoogleSignIn();

    console.log('[Google Sign-In] response:', userInfo);

    if (userInfo.type !== 'success') {
      console.log('[Google] Sign-in was not successful');
      return;
    }

    // Get Firebase ID token
    const idToken = userInfo.data.idToken;

    if (!idToken) {
      throw new Error('Google ID token not received');
    }
    const session = await signInWithGoogle(idToken);

    
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
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.brandSection}>
          <Image source={Images.logo} style={styles.logo} resizeMode="contain" />
          <Typography size={44} color={Colors.textNavy} fontWeight="500" style={styles.brandName}>HivaChat</Typography>
          {/* <Typography size={24} color={Colors.mutedLight} textAlign="center" style={styles.tagline}>Find your next event</Typography> */}
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onLayout={({nativeEvent}) => setButtonSize(nativeEvent.layout)}
            style={({pressed}) => [styles.googleButton, pressed && styles.pressed]}
            onPress={handleGoogleLogin}
            disabled={isLoading}>
            <Svg pointerEvents="none" style={styles.animatedBorder}>
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
            <Typography size={18} color={Colors.textDark} fontWeight="600" style={styles.googleButtonText}>{isLoading ? 'Signing in…' : 'Continue with'}</Typography>
            <Image
              source={Images.googleLogo}
              style={styles.googleMark}
              resizeMode="contain"
            />
          </Pressable>
          {!!errorMessage && <Typography size={14} color={Colors.coral} textAlign="center" style={styles.error}>{errorMessage}</Typography>}

        </View>
      </View>
    </SafeAreaView>
  );
};

export default Login;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  container: {
    flex: 1,
    paddingHorizontal:20,
  },
  brandSection: {
    flex: 1,
    alignItems: 'center',
    // justifyContent: 'center',
    paddingTop: '50%',
    // backgroundColor:'red'
  },
  logo: {
    width: 95,
    height: 95,
    marginBottom: 6,
  },
  brandName: {
    letterSpacing: -1,
    marginTop:15
  },
  tagline: {
    marginTop: 30,
  },
  actions: {
    width: '100%',
    paddingBottom: 34,
  },
  googleButton: {
    height: 52,
    width: '100%',
    borderRadius: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    shadowColor: Colors.shadow,
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.18,
    shadowRadius: 9,
    elevation: 5,
  },
  animatedBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  googleButtonText: {
  },
  googleMark: {
    width: 22,
    height: 22,
    marginLeft: 14,
  },
  pressed: {
    opacity: 0.7,
  },
  error: {marginTop: 14},
});
