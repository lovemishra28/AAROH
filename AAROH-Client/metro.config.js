// Metro config wired for NativeWind v4. `input` must point at the stylesheet
// that declares the Tailwind directives (global.css), which src/App.tsx imports.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
