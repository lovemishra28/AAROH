/**
 * Babel config for NativeWind v4.
 *
 * The `jsxImportSource: 'nativewind'` option is what lets `className` work on
 * React Native components; `nativewind/babel` compiles the Tailwind classes.
 * If react-native-reanimated is added later, its plugin MUST be listed last.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
