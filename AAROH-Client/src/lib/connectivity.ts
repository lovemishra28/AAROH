import { api, registerConnectivityReporter } from '@/api/client';
import { useConnectivityStore } from '@/store/connectivityStore';

/**
 * Connectivity wiring (M8).
 *
 * `initConnectivity` teaches the API client to push reachability changes into the store.
 * `startConnectivityMonitor` adds a light `/v1/health` poll so recovery is noticed even
 * when the user is idle (request outcomes alone can't detect coming *back* online). The
 * health endpoint is unauthenticated and cheap, and the poll backs off to a slow cadence
 * while online — its real job is catching the offline→online edge that drains the outbox.
 */

let started = false;

export function initConnectivity(): void {
  registerConnectivityReporter({
    onReachable: () => useConnectivityStore.getState().setOnline(true),
    onUnreachable: () => useConnectivityStore.getState().setOnline(false),
  });
}

async function ping(): Promise<void> {
  try {
    await api.get('/v1/health', { auth: false, timeoutMs: 8000 });
    // Success already flips the store online via the reporter.
  } catch {
    // A NetworkError already flipped the store offline via the reporter; nothing to do.
  }
}

/** Starts the poller. Returns a stop function. Safe to call once at app start. */
export function startConnectivityMonitor(): () => void {
  if (started) return () => undefined;
  started = true;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const schedule = () => {
    if (stopped) return;
    // Poll often while offline (to catch recovery fast), rarely while online.
    const delay = useConnectivityStore.getState().isOnline ? 30_000 : 6_000;
    timer = setTimeout(async () => {
      await ping();
      schedule();
    }, delay);
  };

  void ping();
  schedule();

  return () => {
    stopped = true;
    started = false;
    if (timer) clearTimeout(timer);
  };
}
