import * as SecureStore from 'expo-secure-store';

import type { TokenBundle } from '@/api/types';

/**
 * Encrypted-at-rest persistence for the few things that must survive an app restart:
 * the token bundle (sensitive → SecureStore, backed by the Android Keystore) and the
 * language choice (not sensitive, but SecureStore is already here and the payload is
 * tiny, so we avoid pulling in a second storage dependency for one string).
 */

const TOKENS_KEY = 'agropulse.tokens.v1';
const LANG_KEY = 'agropulse.lang.v1';

export async function saveTokens(bundle: TokenBundle): Promise<void> {
  await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(bundle));
}

export async function loadTokens(): Promise<TokenBundle | null> {
  const raw = await SecureStore.getItemAsync(TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenBundle;
  } catch {
    // Corrupt payload — treat as no session.
    await SecureStore.deleteItemAsync(TOKENS_KEY);
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKENS_KEY);
}

export async function saveLang(lang: string): Promise<void> {
  await SecureStore.setItemAsync(LANG_KEY, lang);
}

export async function loadLang(): Promise<string | null> {
  return SecureStore.getItemAsync(LANG_KEY);
}

/**
 * Generic JSON persistence (M8). Used for the small offline outbox and a best-effort
 * snapshot of the fields list so reads survive a cold start while offline. SecureStore is
 * reused rather than pulling in AsyncStorage: the payloads here are tiny (a handful of
 * queued readings), well under the size where SecureStore warns. Never store anything
 * large or hot here.
 */
export async function saveJson(key: string, value: unknown): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  } catch {
    // Storage is best-effort for these caches — a failure must never break the app.
  }
}

export async function loadJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function removeJson(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
}
