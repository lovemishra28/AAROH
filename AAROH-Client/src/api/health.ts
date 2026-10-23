import { useQuery } from '@tanstack/react-query';

import { api } from './client';

/**
 * GET /v1/health — liveness + dependency check. Unauthenticated, so it is the cleanest
 * proof that the app can actually reach the server from the emulator before any auth
 * exists. The response body shape is unspecified in the contract (just `type: object`),
 * so we only care that it returns 2xx.
 */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<Record<string, unknown>>('/v1/health', { auth: false }),
    retry: 1,
    staleTime: 0,
  });
}
