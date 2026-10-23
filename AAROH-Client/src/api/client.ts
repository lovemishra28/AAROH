import { API_BASE_URL } from '@/lib/env';

import type { ErrorEnvelope } from './types';

/**
 * Typed fetch client for the Aaroh API.
 *
 * Responsibilities:
 *   - prefix every path with API_BASE_URL (10.0.2.2:3000 on the emulator)
 *   - attach the bearer token for authenticated calls
 *   - transparently refresh once on a 401, then retry — or signal auth loss
 *   - turn every non-2xx ErrorEnvelope into a typed ApiError
 *   - fail fast when the server is unreachable (AbortController timeout)
 *
 * The auth pieces are injected by M3 via `registerAuthProvider` to avoid a circular
 * dependency between the client and the auth store. Until then, unauthenticated calls
 * (health, OTP request/verify) work unchanged.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(args: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
    requestId?: string;
  }) {
    super(args.message);
    this.name = 'ApiError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }

  /** True when the caller's session is no longer valid. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/** Thrown when the request never reached the server (DNS, refused, timeout). */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

type AuthProvider = {
  getAccessToken: () => string | null;
  /** Attempt a token refresh. Resolves true if a fresh access token is now available. */
  refresh: () => Promise<boolean>;
  /** Called when refresh fails — M3 clears the session and returns to the auth stack. */
  onAuthLost: () => void;
};

let authProvider: AuthProvider | null = null;

export function registerAuthProvider(provider: AuthProvider): void {
  authProvider = provider;
}

/**
 * Optional connectivity reporter (M8). The connectivity store registers itself here so the
 * client can report reachability without importing the store (no dependency cycle). Every
 * completed HTTP round-trip — even a 4xx/5xx — proves the server is reachable; only a
 * NetworkError (DNS/refused/timeout) means offline.
 */
type ConnectivityReporter = {
  onReachable: () => void;
  onUnreachable: () => void;
};

let connectivityReporter: ConnectivityReporter | null = null;

export function registerConnectivityReporter(reporter: ConnectivityReporter): void {
  connectivityReporter = reporter;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Attach the bearer token and enable refresh-on-401. Defaults to true. */
  auth?: boolean;
  timeoutMs?: number;
  /** Idempotency-Key header, required by the readings endpoint (M5). */
  idempotencyKey?: string;
};

async function performFetch(
  path: string,
  options: RequestOptions,
  attachToken: boolean,
): Promise<Response> {
  const { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, idempotencyKey } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (attachToken) {
    const token = authProvider?.getAccessToken() ?? null;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timed out' : 'failed';
    throw new NetworkError(`Request to ${path} ${reason}. Is the server running?`);
  } finally {
    clearTimeout(timer);
  }
}

async function parseError(res: Response): Promise<never> {
  let envelope: ErrorEnvelope | null = null;
  try {
    envelope = (await res.json()) as ErrorEnvelope;
  } catch {
    // Body was not JSON — fall through to a generic error below.
  }
  throw new ApiError({
    code: envelope?.error?.code ?? `HTTP_${res.status}`,
    message: envelope?.error?.message ?? `Request failed with status ${res.status}`,
    status: res.status,
    details: envelope?.error?.details,
    requestId: envelope?.requestId,
  });
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const useAuth = options.auth ?? true;

  let res: Response;
  try {
    res = await performFetch(path, options, useAuth);
  } catch (err) {
    if (err instanceof NetworkError) connectivityReporter?.onUnreachable();
    throw err;
  }
  // A response of any status proves the server is reachable.
  connectivityReporter?.onReachable();

  // One transparent refresh-and-retry on 401 for authenticated calls.
  if (res.status === 401 && useAuth && authProvider) {
    const refreshed = await authProvider.refresh();
    if (refreshed) {
      try {
        res = await performFetch(path, options, true);
      } catch (err) {
        if (err instanceof NetworkError) connectivityReporter?.onUnreachable();
        throw err;
      }
      connectivityReporter?.onReachable();
    } else {
      authProvider.onAuthLost();
    }
  }

  if (!res.ok) return parseError(res);

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
