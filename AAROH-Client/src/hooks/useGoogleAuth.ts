import { useCallback, useState } from 'react';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import { googleSignIn } from '@/api/auth';
import { ApiError, NetworkError } from '@/api/client';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID, IS_DEV } from '@/lib/env';
import { useAuthStore } from '@/store/authStore';

export type GoogleAuthErrorReason =
  | 'not_configured'
  | 'server_not_configured'
  | 'developer_error'
  | 'in_progress'
  | 'play_services'
  | 'network'
  | 'server'
  | 'unknown';

/**
 * Google's native `DEVELOPER_ERROR` (Android status 10). It means Google refused to
 * issue a token because the *app* is not recognised: no Android OAuth client for
 * `com.agropulse.app`, the wrong SHA-1 fingerprint (debug vs release), or a webClientId
 * from a different Cloud project.
 *
 * It is worth its own branch because it is the single most common Google Sign-In
 * failure and it is indistinguishable from a server outage unless named — which is
 * exactly the dead end a generic "please try again" leaves you in.
 *
 * `statusCodes` does not export it, so the numeric code is matched directly.
 */
const DEVELOPER_ERROR = '10';

let didConfigure = false;

function ensureConfigured(): void {
  if (didConfigure || !GOOGLE_WEB_CLIENT_ID) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID ?? undefined,
    offlineAccess: false,
  });
  didConfigure = true;
}

/**
 * Wraps the native Google Sign-In SDK (see README "Authentication providers" for the
 * Google Cloud + server setup this depends on). `isAvailable` is false until a web client
 * ID is supplied via EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID — the button still renders normally
 * but reports `not_configured` rather than silently failing when tapped.
 */
export function useGoogleAuth() {
  const setSession = useAuthStore((s) => s.setSession);
  const [loading, setLoading] = useState(false);
  const [errorReason, setErrorReason] = useState<GoogleAuthErrorReason | null>(null);

  const isAvailable = Boolean(GOOGLE_WEB_CLIENT_ID);

  const signIn = useCallback(async () => {
    if (!isAvailable) {
      setErrorReason('not_configured');
      return;
    }
    setErrorReason(null);
    setLoading(true);
    try {
      ensureConfigured();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return; // user backed out of the account picker

      const idToken = response.data.idToken;
      if (!idToken) {
        setErrorReason('unknown');
        return;
      }
      const result = await googleSignIn(idToken);
      await setSession(result, result.farmer);
    } catch (err) {
      // Always log the raw failure in development. Google's native errors carry the
      // detail that identifies a misconfiguration (status code, project mismatch), and
      // it is unrecoverable once flattened into a user-facing string.
      if (IS_DEV) console.warn('[google-signin] failed', err);

      if (isErrorWithCode(err)) {
        if (err.code === statusCodes.SIGN_IN_CANCELLED) {
          // silent — the user cancelled, not an error worth surfacing
        } else if (err.code === statusCodes.IN_PROGRESS) {
          setErrorReason('in_progress');
        } else if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setErrorReason('play_services');
        } else if (String(err.code) === DEVELOPER_ERROR) {
          setErrorReason('developer_error');
        } else {
          // Pass the raw error code so we can see it in the UI (e.g. 12500)
          setErrorReason(`unknown_${String(err.code)}` as any);
        }
      } else if (err instanceof NetworkError) {
        setErrorReason('network');
      } else if (err instanceof ApiError) {
        // The server distinguishes "I have no client ID" (503) from "this token is not
        // valid" (401). Only the first is a setup problem the farmer cannot act on.
        setErrorReason(err.code === 'GOOGLE_NOT_CONFIGURED' ? 'server_not_configured' : 'server');
      } else {
        setErrorReason('unknown');
      }
    } finally {
      setLoading(false);
    }
  }, [isAvailable, setSession]);

  return {
    signIn,
    loading,
    errorReason,
    isAvailable,
  };
}
