import { create } from 'zustand';

import { api, ApiError } from '@/api/client';
import { queryClient } from '@/api/queryClient';
import { qk } from '@/api/keys';
import type { ReadingInput, ReadingsIngestResult } from '@/api/types';
import { loadJson, saveJson } from '@/lib/secureStore';

/**
 * Offline write outbox (M8) — the heart of "offline-then-sync".
 *
 * Only writes need queuing; reads are served from the TanStack cache. Today the sole write
 * on the money path is a manual reading (POST /v1/readings), so the queue is typed to that.
 * Each item carries the same on-device `idempotency_key` the reading was built with, so a
 * drain that races a earlier partial success can't create a duplicate — the server dedupes.
 *
 * Durability: the queue is mirrored to SecureStore so a reading captured offline survives
 * the app being closed before connectivity returns. Payloads are tiny (a few queued
 * readings), well within SecureStore's comfortable size.
 */

const OUTBOX_KEY = 'agropulse.outbox.v1';

export type OutboxReading = {
  id: string;
  fieldId: string;
  payload: ReadingInput;
  createdAt: string;
};

type OutboxState = {
  items: OutboxReading[];
  draining: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  enqueueReading: (item: OutboxReading) => void;
  drain: () => Promise<void>;
  pendingCount: () => number;
};

function persist(items: OutboxReading[]): void {
  void saveJson(OUTBOX_KEY, items);
}

export const useOutboxStore = create<OutboxState>()((set, get) => ({
  items: [],
  draining: false,
  hydrated: false,

  hydrate: async () => {
    const stored = await loadJson<OutboxReading[]>(OUTBOX_KEY);
    set({ items: Array.isArray(stored) ? stored : [], hydrated: true });
  },

  enqueueReading: (item) => {
    const items = [...get().items, item];
    set({ items });
    persist(items);
  },

  drain: async () => {
    if (get().draining) return;
    const queue = get().items;
    if (queue.length === 0) return;

    set({ draining: true });
    try {
      // Snapshot the queue and process oldest-first. Stop on the first network failure —
      // we're offline again and the rest stay queued for the next reconnect.
      for (const item of queue) {
        try {
          await api.post<ReadingsIngestResult>('/v1/readings', item.payload, {
            idempotencyKey: item.payload.idempotency_key,
          });
          // Delivered — drop it and reconcile the field's caches with the server truth.
          set({ items: get().items.filter((i) => i.id !== item.id) });
          persist(get().items);
          void queryClient.invalidateQueries({ queryKey: qk.field(item.fieldId) });
          void queryClient.invalidateQueries({ queryKey: qk.fieldReadings(item.fieldId) });
        } catch (err) {
          if (err instanceof ApiError) {
            // Deterministic rejection (4xx) — retrying can't help, so drop it rather than
            // wedging the queue. (Phase 3: the form validates before enqueuing, so this is
            // rare; a production build would surface these to the user for correction.)
            if (err.status >= 400 && err.status < 500) {
              set({ items: get().items.filter((i) => i.id !== item.id) });
              persist(get().items);
              continue;
            }
            // 5xx — server trouble; keep the item and stop for now.
          }
          // NetworkError or 5xx: stop draining, leave the rest queued.
          break;
        }
      }
    } finally {
      set({ draining: false });
    }
  },

  pendingCount: () => get().items.length,
}));
