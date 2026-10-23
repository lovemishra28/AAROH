import Constants from 'expo-constants';

type ExtraConfig = {
  apiBaseUrl?: string;
  googleWebClientId?: string | null;
  googleIosClientId?: string | null;
};

function readExtra(): ExtraConfig {
  return (Constants.expoConfig?.extra ?? {}) as ExtraConfig;
}

/**
 * Base URL of the Aaroh API.
 *
 * Resolution order mirrors app.config.ts so that an inline EXPO_PUBLIC_ override wins
 * even over a stale cached manifest:
 *   1. EXPO_PUBLIC_API_BASE_URL (inlined at build time by Expo)
 *   2. app.config.ts `extra.apiBaseUrl`
 *   3. the Android-emulator host alias
 *
 * Reminder: inside an emulator, `localhost` is the emulator itself, not the dev PC.
 * 10.0.2.2 is the Android emulator's alias for the host's loopback interface.
 */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? readExtra().apiBaseUrl ?? 'http://10.0.2.2:3000';

/**
 * Google OAuth web client ID, used by `GoogleSignin.configure()` (see
 * `hooks/useGoogleAuth.ts`). This is the "Web application" client from Google Cloud
 * Console / Firebase — Android does NOT need its own client ID here (it is matched
 * server-side by package name + SHA-1 fingerprint), but the ID token's audience is always
 * the web client ID. `null` means Google Sign-In is not configured yet; the button stays
 * visible but reports `not_configured` instead of silently failing.
 */
export const GOOGLE_WEB_CLIENT_ID: string | null =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? readExtra().googleWebClientId ?? null;

/** Optional iOS client ID — only needed once the app also targets iOS. */
export const GOOGLE_IOS_CLIENT_ID: string | null =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? readExtra().googleIosClientId ?? null;

/** True when the bundle is running in a development build (`__DEV__` from React Native). */
export const IS_DEV: boolean = __DEV__;
