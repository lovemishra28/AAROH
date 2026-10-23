import { GoogleSignin } from '@react-native-google-signin/google-signin';

/**
 * Native Google session teardown, kept out of `authStore` so the store stays free
 * of native-module imports (and remains testable in plain Node).
 *
 * Signing out of AgroPulse must also drop the Google SDK's cached account,
 * otherwise the next "Continue with Google" tap silently reuses the previous
 * account instead of showing the picker — which looks like a broken sign-out on a
 * shared family phone, the common case for our farmers.
 *
 * Always best-effort: this throws when the SDK was never configured (no web client
 * ID set), and a failure here must never stop the local session from being cleared.
 */
export async function signOutGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Never configured, or nothing to sign out of. Both are fine.
  }
}
