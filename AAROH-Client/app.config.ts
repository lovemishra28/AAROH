import type { ExpoConfig } from 'expo/config';

/**
 * AgroPulse — Expo app configuration.
 *
 * Brand note: the user-facing product is **AgroPulse** (एग्रो Pulse). "Aaroh" is the
 * internal project / repository name only and must not appear in the UI.
 *
 * API base URL resolution order:
 *   1. EXPO_PUBLIC_API_BASE_URL from the environment (see .env.example)
 *   2. the Android-emulator default below
 *
 * 10.0.2.2 is the Android emulator's alias for the host machine's loopback, so it
 * reaches the Aaroh server running at localhost:3000 on the development PC. A
 * physical device would instead need the PC's LAN IP (e.g. http://192.168.1.20:3000).
 */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:3000';

/**
 * Google Sign-In (see README "Authentication providers"). Both are optional — when unset,
 * `lib/env.ts` resolves them to `null` and the Google button reports "not configured"
 * instead of crashing.
 *
 * Note on the `@react-native-google-signin/google-signin` config plugin: it is
 * deliberately NOT registered below. With no options it wires up Firebase
 * (`google-services.json`), which this project does not use; with options it requires an
 * iOS `iosUrlScheme`, which is moot until the app targets iOS. Android needs neither —
 * the native module autolinks regardless of the Expo config plugin, and Android identifies
 * the app to Google by package name + SHA-1 fingerprint. Revisit this once iOS or Firebase
 * is actually in scope.
 */
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? null;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? null;

const config = {
  name: 'AgroPulse',
  slug: 'agropulse',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'agropulse',
  userInterfaceStyle: 'light',
  icon: './assets/images/icon.png',
  splash: {
    image: './assets/images/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#FFFFFF',
  },
  assetBundlePatterns: ['**/*'],
  android: {
    package: 'com.agropulse.app',
    permissions: [
      'BLUETOOTH_SCAN',
      'BLUETOOTH_CONNECT',
      'ACCESS_FINE_LOCATION',
    ],
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#FFFFFF',
    },
  },
  ios: {
    bundleIdentifier: 'com.agropulse.app',
    supportsTablet: false,
  },
  web: {
    favicon: './assets/images/favicon.png',
  },
  extra: {
    eas: {
      projectId: 'c2dc8de1-dedd-4421-b19a-45b5879bfe34'
    },
    apiBaseUrl: API_BASE_URL,
    googleWebClientId: GOOGLE_WEB_CLIENT_ID,
    googleIosClientId: GOOGLE_IOS_CLIENT_ID,
  },
  plugins: ['expo-font', 'expo-sharing'],
};

export default config as ExpoConfig;
