/**
 * Inlines HIVA_* environment variables at bundle time (e.g. `HIVA_API_URL=https://staging.example npx react-native start`,
 * or exported before a Gradle release build). Unset variables stay undefined so code can fall back to defaults.
 */
const inlineHivaEnv = ({types: t}) => ({
  visitor: {
    MemberExpression(path) {
      const {node} = path;
      const isProcessEnv =
        t.isMemberExpression(node.object) &&
        t.isIdentifier(node.object.object, {name: 'process'}) &&
        t.isIdentifier(node.object.property, {name: 'env'});
      if (!isProcessEnv || !t.isIdentifier(node.property) || !node.property.name.startsWith('HIVA_')) {
        return;
      }
      const value = process.env[node.property.name];
      path.replaceWith(value === undefined ? t.identifier('undefined') : t.stringLiteral(value));
    },
  },
});

module.exports = {
  presets: ['module:@react-native/babel-preset', 'nativewind/babel'],
  // react-native-boost is intentionally NOT listed here: v2 is configured through Metro (`withBoostConfig` in
  // metro.config.js), which injects its plugin into Metro's Babel transformer only, so Jest is unaffected.
  // react-native-worklets/plugin must stay LAST.
  plugins: [inlineHivaEnv, 'react-native-worklets/plugin'],
};
