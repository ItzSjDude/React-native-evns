/* eslint-env jest */
jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = new Map();
  return {
    getItem: jest.fn(key => Promise.resolve(storage.get(key) ?? null)),
    setItem: jest.fn((key, value) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn(key => {
      storage.delete(key);
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      storage.clear();
      return Promise.resolve();
    }),
  };
});

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
    signOut: jest.fn().mockResolvedValue(undefined),
  },
  isSuccessResponse: response => response?.type === 'success',
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
}));

jest.mock('@react-native-firebase/app', () => ({
  getApp: jest.fn(),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({currentUser: null})),
  GoogleAuthProvider: {
    credential: jest.fn(token => ({providerId: 'google.com', token})),
  },
  signInWithCredential: jest.fn().mockResolvedValue({
    user: {getIdToken: jest.fn().mockResolvedValue('firebase-id-token')},
  }),
  getIdToken: jest.fn().mockResolvedValue('firebase-id-token'),
  signOut: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn().mockResolvedValue(true),
  getGenericPassword: jest.fn().mockResolvedValue(false),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
}));

jest.mock('@livekit/react-native', () => {
  return {
    AudioSession: {
      configureAudio: jest.fn().mockResolvedValue(undefined),
      startAudioSession: jest.fn().mockResolvedValue(undefined),
      stopAudioSession: jest.fn().mockResolvedValue(undefined),
      selectAudioOutput: jest.fn().mockResolvedValue(undefined),
    },
    AndroidAudioTypePresets: {communication: {}},
    LiveKitRoom: ({children}) => children,
    useConnectionState: () => 'connected',
    useLocalParticipant: () => ({
      localParticipant: {identity: '', setMicrophoneEnabled: jest.fn().mockResolvedValue(undefined)},
      isMicrophoneEnabled: false,
    }),
    useParticipants: () => [],
  };
});

jest.mock('react-native-reanimated', () => {
  const {Animated} = require('react-native');
  return {
    __esModule: true,
    default: Animated,
    Easing: {bezier: () => value => value, linear: value => value},
    cancelAnimation: jest.fn(),
    interpolate: value => value,
    runOnJS: callback => callback,
    useAnimatedStyle: callback => callback(),
    useSharedValue: value => ({value}),
    withDelay: (_delay, animation) => animation,
    withRepeat: animation => animation,
    withSequence: (...animations) => animations[animations.length - 1],
    withTiming: value => value,
  };
});
