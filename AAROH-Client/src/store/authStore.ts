import { create } from 'zustand';

import { getMe, logout, refreshTokens } from '@/api/auth';
import { ApiError, registerAuthProvider } from '@/api/client';
import type { Farmer, TokenBundle } from '@/api/types';
import { queryClient } from '@/api/queryClient';
import { signOutGoogle } from '@/lib/googleSession';
import { clearTokens, loadTokens, saveTokens } from '@/lib/secureStore';
import { useScanStore } from './scanStore';
/**
 * Auth session store (M3).
 *
 * `status` gates navigation: 'loading' shows a splash while we hydrate persisted tokens,
 * 'unauthenticated' shows the AuthStack, 'authenticated' shows the app.
 *
 * The store also *is* the client's auth provider (registered at the bottom of this file),
 * so client.ts stays free of any store import and there is no dependency cycle. The
 * client calls back into here to read the access token, refresh on a 401, and drop the
 * session when refresh fails.
 */

type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

type AuthState = {
  status: AuthStatus;
  tokens: TokenBundle | null;
  farmer: Farmer | null;
  /** Load persisted tokens at boot and confirm they still work via /v1/me. */
  hydrate: () => Promise<void>;
  /** Persist a fresh session after a successful OTP verify. */
  setSession: (tokens: TokenBundle, farmer: Farmer) => Promise<void>;
  /** Patch just the farmer record in place (e.g. after a best-effort profile update). */
  setFarmer: (farmer: Farmer) => void;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'loading',
  tokens: null,
  farmer: null,

  hydrate: async () => {
    const tokens = await loadTokens();
    if (!tokens) {
      set({ status: 'unauthenticated', tokens: null, farmer: null });
      return;
    }
    // Adopt the tokens first so the client can attach/refresh them during /me.
    set({ tokens });
    try {
      const { farmer } = await getMe();
      set({ status: 'authenticated', farmer });
    } catch (err) {
      // A 401 here means refresh already failed inside the client and signOut ran.
      if (!(err instanceof ApiError && err.isUnauthorized)) {
        // Network/5xx at boot: keep the tokens but surface an unauthenticated shell so
        // the user can retry from the phone screen rather than being stuck on splash.
        await clearTokens();
      }
      set({ status: 'unauthenticated', tokens: null, farmer: null });
    }
  },

  setSession: async (tokens, farmer) => {
    await saveTokens(tokens);
    set({ status: 'authenticated', tokens, farmer });
  },

  setFarmer: (farmer) => set({ farmer }),

  signOut: async () => {
    // Revoke server-side first, then tear down locally. Both steps are wrapped
    // because neither may block the sign-out: if the phone is offline the refresh
    // token cannot be revoked now, but leaving the farmer stuck in a session they
    // asked to leave would be worse. (The token still expires on its own.)
    const current = useAuthStore.getState().tokens;
    if (current?.refresh_token) {
      try {
        await logout(current.refresh_token);
      } catch {
        // Offline or server down — see note above.
      }
    }
    await signOutGoogle();
    await clearTokens();
    useScanStore.getState().clear();
    
    // Clear React Query cache so the next user doesn't see old data for a split second
    queryClient.clear();
    
    set({ status: 'unauthenticated', tokens: null, farmer: null });
  },
}));

// Wire the store into the API client as its auth provider. Runs once on import.
registerAuthProvider({
  getAccessToken: () => useAuthStore.getState().tokens?.access_token ?? null,
  refresh: async () => {
    const current = useAuthStore.getState().tokens;
    if (!current?.refresh_token) return false;
    try {
      const next = await refreshTokens(current.refresh_token);
      await saveTokens(next);
      useAuthStore.setState({ tokens: next });
      return true;
    } catch {
      return false;
    }
  },
  onAuthLost: () => {
    void useAuthStore.getState().signOut();
  },
});
