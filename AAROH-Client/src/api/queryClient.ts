import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './client';

/**
 * Shared TanStack Query client.
 *
 * Retry policy is deliberately conservative for a rural-connectivity app: never retry a
 * 4xx (a 401/422/400 will not fix itself), retry transient network/5xx a couple of times
 * with backoff. Data is treated as fresh for 30s to avoid hammering the server on
 * navigation.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // ApiError with a 4xx is deterministic — never retry it.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        // Network errors and 5xx: retry up to twice with backoff.
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      retry: false,
    },
  },
});
