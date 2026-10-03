module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((@react-native|@react-navigation|@reduxjs|@react-native-async-storage)/|react-native/|react-redux/|redux-persist/|redux/|immer/|react-native-linear-gradient/|react-native-reanimated/|react-native-safe-area-context/|react-native-svg/|react-native-worklets/))',
  ],
};
