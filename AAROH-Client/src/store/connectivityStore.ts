import { create } from 'zustand';

/**
 * Connectivity signal (M8).
 *
 * We deliberately derive "online" from real API reachability rather than the device's
 * radio state: what matters to a farmer is whether the *Aaroh server* can be reached, not
 * whether Wi-Fi is associated. The API client reports every outcome (any HTTP response →
 * reachable; a NetworkError → unreachable) through `registerConnectivityReporter`, and a
 * light health poll (lib/connectivity) catches recovery when the user is idle. This keeps
 * M8 free of a native NetInfo dependency and testable from request outcomes alone.
 */

type ConnectivityState = {
  isOnline: boolean;
  /** Ticks up each time we flip offline→online, so listeners can trigger an outbox drain. */
  onlineEpoch: number;
  setOnline: (online: boolean) => void;
};

export const useConnectivityStore = create<ConnectivityState>()((set, get) => ({
  isOnline: true,
  onlineEpoch: 0,
  setOnline: (online) => {
    const was = get().isOnline;
    if (was === online) return;
    set((s) => ({ isOnline: online, onlineEpoch: online ? s.onlineEpoch + 1 : s.onlineEpoch }));
  },
}));
