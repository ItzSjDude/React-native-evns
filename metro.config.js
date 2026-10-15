const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const {withNativeWind} = require('nativewind/metro');
const {withBoostConfig} = require('react-native-boost/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  transformer: {
    // Defers each `require()` until first use (faster startup). NativeWind's withCssInterop wraps this
    // getTransformOptions and delegates to it, so it is not clobbered.
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: {
          // Files listed here keep their requires eager. index.js registers globals and the headless geofence task;
          // App.tsx registers the FCM/notifee background handlers and starts crash reporting at bundle load,
          // before any component mounts (and creates the store / redux-persist rehydration).
          blockList: {
            [path.resolve(__dirname, 'index.js')]: true,
            [path.resolve(__dirname, 'App.tsx')]: true,
          },
        },
      },
    }),
  },
};

/**
 * react-native-boost: build-time optimizer, applied before withNativeWind (NativeWind only wraps transformerPath /
 * getTransformOptions / resolver; Boost wraps babelTransformerPath).
 *
 * The component swaps (Text/View/Image/ActivityIndicator -> raw native hosts) are OFF on purpose: NativeWind 4 styles
 * `className` through cssInterop-wrapped components, and Boost's NativeText/NativeView/NativeImage/NativeActivityIndicator
 * are not registered with cssInterop, so className styling would silently vanish (~80 files use className).
 * To enable later: call cssInterop(NativeText|NativeView|..., {className: 'style'}) at app entry
 * (boost.kuatsu.de/docs/compatibility/nativewind) and avoid className="select-auto"/"align-center".
 * What stays on are pure-JS rewrites: Animated value init / wrapper removal, StyleSheet folding, Platform folding.
 * Exclude code with `// @boost-ignore` on a line, or `ignores: ['src/**\/foo/**']` globs here.
 * crossFileAncestorResolution is off: it only matters for the Text/View swaps and uses private Metro internals.
 */
const boostOptions = {
  logLevel: 'warn',
  crossFileAncestorResolution: false,
  optimizations: {
    'native-text': 'off',
    'native-view': 'off',
    'native-image': 'off',
    'native-activity-indicator': 'off',
  },
};

module.exports = withNativeWind(withBoostConfig(mergeConfig(getDefaultConfig(__dirname), config), boostOptions), {
  input: './global.css',
});
